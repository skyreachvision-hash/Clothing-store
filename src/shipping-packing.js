/**
 * Carrier-neutral order packing engine.
 *
 * The engine decides how an order becomes final parcel(s) before any
 * courier/provider is asked for a rate.
 *
 * Rules:
 * - Fashion: soft/compressible items are packed by weight. If an item is
 *   prepackaged (for example shoes), its supplied packed dimensions are used.
 * - Electronics: weight + dimensions are required unless already prepackaged.
 * - Appliance: packed weight + dimensions are required and normally represent
 *   the manufacturer/final box.
 * - Other: uses dimensions when supplied, otherwise weight.
 *
 * Courier-specific pricing or packaging is deliberately not part of this
 * module.
 */

const TYPE_CODES = new Set(["fashion", "electronics", "appliance", "other"]);
const PACKAGING_TYPES = new Set(["bag", "box", "envelope", "manufacturer", "custom"]);

function number(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positive(value) {
  const n = number(value);
  return n !== null && n > 0;
}

function dimensions(value) {
  const length = number(value?.length_cm);
  const width = number(value?.width_cm);
  const height = number(value?.height_cm);
  if (![length, width, height].every(positive)) return null;
  return { length, width, height };
}

function sortedDimensions(value) {
  const d = dimensions(value);
  return d ? [d.length, d.width, d.height].sort((a, b) => b - a) : null;
}

function fitsDimensions(item, packaging) {
  const itemDims = sortedDimensions(item);
  const packageDims = sortedDimensions(packaging);
  if (!itemDims || !packageDims) return false;
  return itemDims.every((size, index) => size <= packageDims[index]);
}

function volume(value) {
  const d = dimensions(value);
  return d ? d.length * d.width * d.height : Number.POSITIVE_INFINITY;
}

function normalizedPackaging(packaging) {
  const type = String(packaging?.packaging_type || "").trim().toLowerCase();
  if (!packaging?.id || !packaging?.name || !PACKAGING_TYPES.has(type)) return null;

  return {
    id: Number(packaging.id),
    name: String(packaging.name),
    packaging_type: type,
    length_cm: number(packaging.length_cm),
    width_cm: number(packaging.width_cm),
    height_cm: number(packaging.height_cm),
    packaging_weight_kg: Math.max(0, number(packaging.packaging_weight_kg, 0)),
    max_weight_kg: positive(packaging.max_weight_kg) ? number(packaging.max_weight_kg) : null
  };
}

function normalizedItem(item) {
  const quantity = Math.max(0, Math.floor(number(item?.quantity, 0)));
  const shipping = item?.shipping || item?.product_shipping || item;

  return {
    product_id: Number(item?.product_id),
    product_name: String(item?.product_name || item?.name || "Product"),
    quantity,
    shipping_type_id: shipping?.shipping_type_id ? Number(shipping.shipping_type_id) : null,
    shipping_type_code: String(shipping?.shipping_type_code || shipping?.shipping_code || "").toLowerCase(),
    is_prepackaged: Number(shipping?.is_prepackaged) === 1,
    weight_kg: positive(shipping?.shipping_weight_kg) ? number(shipping.shipping_weight_kg) : null,
    length_cm: number(shipping?.shipping_length_cm),
    width_cm: number(shipping?.shipping_width_cm),
    height_cm: number(shipping?.shipping_height_cm)
  };
}

function typeRequirements(item) {
  switch (item.shipping_type_code) {
    case "fashion":
      return { requiresWeight: true, requiresDimensions: item.is_prepackaged };
    case "electronics":
      return { requiresWeight: true, requiresDimensions: true };
    case "appliance":
      return { requiresWeight: true, requiresDimensions: true };
    default:
      return { requiresWeight: true, requiresDimensions: Boolean(item.is_prepackaged || positive(item.length_cm) || positive(item.width_cm) || positive(item.height_cm)) };
  }
}

function validateItem(item) {
  if (!TYPE_CODES.has(item.shipping_type_code)) {
    throw new Error(`Shipping type is missing for ${item.product_name}.`);
  }

  if (!positive(item.weight_kg)) {
    throw new Error(`Shipping weight is required for ${item.product_name}.`);
  }

  const requirements = typeRequirements(item);
  if (requirements.requiresDimensions && !dimensions(item)) {
    throw new Error(`Packed dimensions are required for ${item.product_name}.`);
  }
}

function candidatePackaging(packaging, item, requiredType) {
  return packaging
    .filter((p) => p.packaging_type === requiredType)
    .filter((p) => !p.max_weight_kg || item.weight_kg + p.packaging_weight_kg <= p.max_weight_kg)
    .filter((p) => !item.requiresDimensions || fitsDimensions(item, p))
    .sort((a, b) => {
      const volumeDifference = volume(a) - volume(b);
      if (volumeDifference !== 0) return volumeDifference;
      return a.id - b.id;
    });
}

function choosePackaging(packaging, item) {
  const dimensional = item.requiresDimensions;

  // Soft fashion items should prefer bags. Rigid/fixed items should prefer
  // boxes, with manufacturer packaging allowed when explicitly configured.
  const preferredTypes = dimensional
    ? ["box", "manufacturer", "custom", "envelope"]
    : ["bag", "envelope", "custom"];

  for (const type of preferredTypes) {
    const candidates = candidatePackaging(packaging, item, type);
    if (candidates.length) return candidates[0];
  }

  // As a safe fallback, allow any configured packaging that can contain the
  // item rather than making the engine courier-specific.
  const fallback = packaging
    .filter((p) => !p.max_weight_kg || item.weight_kg + p.packaging_weight_kg <= p.max_weight_kg)
    .filter((p) => !dimensional || fitsDimensions(item, p))
    .sort((a, b) => volume(a) - volume(b) || a.id - b.id);

  return fallback[0] || null;
}

function finalParcelFromPrepackaged(item) {
  return {
    packaging_id: null,
    packaging_name: "Product's existing packaging",
    packaging_type: "manufacturer",
    items: [{
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: 1
    }],
    weight_kg: item.weight_kg,
    length_cm: item.length_cm,
    width_cm: item.width_cm,
    height_cm: item.height_cm
  };
}

function addToSoftParcel(parcel, item) {
  parcel.items.push({
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: 1
  });
  parcel.product_weight_kg += item.weight_kg;
  parcel.weight_kg += item.weight_kg;
}

function createPackagedParcel(packaging, item) {
  return {
    packaging_id: packaging.id,
    packaging_name: packaging.name,
    packaging_type: packaging.packaging_type,
    items: [{
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: 1
    }],
    product_weight_kg: item.weight_kg,
    weight_kg: item.weight_kg + packaging.packaging_weight_kg,
    length_cm: packaging.length_cm,
    width_cm: packaging.width_cm,
    height_cm: packaging.height_cm
  };
}

/**
 * Pack an order using product shipping records and configured packaging.
 *
 * This intentionally returns final parcel data only. It does not calculate
 * courier prices and does not call a courier API.
 */
export function packOrder({ items = [], packaging = [] } = {}) {
  const configuredPackaging = packaging
    .map(normalizedPackaging)
    .filter(Boolean)
    .filter((p) => p.max_weight_kg === null || p.max_weight_kg > p.packaging_weight_kg);

  const normalizedItems = items.map(normalizedItem).filter((item) => item.quantity > 0);
  const parcels = [];
  const errors = [];

  const softParcels = new Map();

  for (const item of normalizedItems) {
    const requirements = typeRequirements(item);
    item.requiresDimensions = requirements.requiresDimensions;

    try {
      validateItem(item);
    } catch (error) {
      errors.push({ product_id: item.product_id, product_name: item.product_name, error: error.message });
      continue;
    }

    for (let unit = 0; unit < item.quantity; unit += 1) {
      if (item.is_prepackaged) {
        parcels.push(finalParcelFromPrepackaged(item));
        continue;
      }

      // Compressible items can share a bag until its configured weight limit.
      if (item.shipping_type_code === "fashion" && !item.requiresDimensions) {
        const packaging = choosePackaging(configuredPackaging, item);
        if (!packaging) {
          errors.push({ product_id: item.product_id, product_name: item.product_name, error: "No suitable packaging is configured." });
          continue;
        }

        const key = String(packaging.id);
        const existing = softParcels.get(key);
        const nextWeight = (existing?.product_weight_kg || 0) + item.weight_kg + packaging.packaging_weight_kg;

        if (existing && (!packaging.max_weight_kg || nextWeight <= packaging.max_weight_kg)) {
          addToSoftParcel(existing, item);
          existing.weight_kg = nextWeight;
        } else {
          const parcel = createPackagedParcel(packaging, item);
          softParcels.set(key + ":" + parcels.length, parcel);
          parcels.push(parcel);
        }
        continue;
      }

      // Rigid/non-compressible products are independently placed into the
      // smallest suitable configured package. Multi-item consolidation can be
      // added later without changing the final-parcel contract.
      const packaging = choosePackaging(configuredPackaging, item);
      if (!packaging) {
        errors.push({ product_id: item.product_id, product_name: item.product_name, error: "No suitable packaging is configured for this product." });
        continue;
      }
      parcels.push(createPackagedParcel(packaging, item));
    }
  }

  // Remove the internal accumulation field from the public parcel contract.
  for (const parcel of parcels) delete parcel.product_weight_kg;

  return {
    success: errors.length === 0,
    parcels,
    errors
  };
}
