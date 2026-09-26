const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function id(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

async function requireAdmin(request, env) {
  const response = await fetch(new Request(new URL("/api/admin-auth-check", request.url), {
    method: "GET",
    headers: request.headers
  }), env);
  if (!response.ok) throw new Error("Authentication required.");
  return response.json();
}

function nullableDimension(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function getShippingTypes(env) {
  return (await env.DB.prepare(
    "SELECT id,name,code,description,requires_weight,requires_dimensions,is_enabled,sort_order FROM shipping_types WHERE is_enabled = 1 ORDER BY sort_order ASC,id ASC"
  ).all()).results ?? [];
}

async function getProductShipping(env, productId) {
  return await env.DB.prepare(
    `SELECT ps.product_id, ps.shipping_type_id, st.name AS shipping_type_name, st.code AS shipping_type_code,
            st.requires_weight, st.requires_dimensions, ps.packing_mode, ps.weight_kg,
            ps.length_cm, ps.width_cm, ps.height_cm
     FROM product_shipping ps
     JOIN shipping_types st ON st.id = ps.shipping_type_id
     WHERE ps.product_id = ?`
  ).bind(productId).first();
}

export async function handleProductShippingApi(request, env) {
  try {
    await requireAdmin(request, env);
    const url = new URL(request.url);
    const productId = id(url.searchParams.get("id"));
    if (!productId) return jsonResponse({ success: false, error: "A valid product id is required." }, 400);

    if (!(await env.DB.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first())) {
      return jsonResponse({ success: false, error: "Product not found." }, 404);
    }

    if (request.method === "GET") {
      return jsonResponse({ success: true, data: { shipping: await getProductShipping(env, productId), shipping_types: await getShippingTypes(env) } });
    }

    if (!["POST", "PUT", "DELETE"].includes(request.method)) {
      return jsonResponse({ success: false, error: "Method not allowed." }, 405);
    }

    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM product_shipping WHERE product_id = ?").bind(productId).run();
      return jsonResponse({ success: true, data: { product_id: productId } });
    }

    const body = await request.json();
    const shippingTypeId = id(body?.shipping_type_id);
    const packingMode = String(body?.packing_mode || "compressible").trim().toLowerCase();
    const weight = Number(body?.weight_kg);

    if (!shippingTypeId) return jsonResponse({ success: false, error: "Shipping type is required." }, 400);
    if (!["compressible", "prepackaged"].includes(packingMode)) return jsonResponse({ success: false, error: "Invalid packing mode." }, 400);
    if (!Number.isFinite(weight) || weight < 0) return jsonResponse({ success: false, error: "A valid shipping weight is required." }, 400);

    const shippingType = await env.DB.prepare(
      "SELECT id,name,requires_weight,requires_dimensions FROM shipping_types WHERE id = ? AND is_enabled = 1"
    ).bind(shippingTypeId).first();
    if (!shippingType) return jsonResponse({ success: false, error: "Shipping type not found or disabled." }, 400);

    const requiresDimensions = Number(shippingType.requires_dimensions) === 1 || packingMode === "prepackaged";
    const length = nullableDimension(body?.length_cm);
    const width = nullableDimension(body?.width_cm);
    const height = nullableDimension(body?.height_cm);

    if (requiresDimensions && (length === null || width === null || height === null || length <= 0 || width <= 0 || height <= 0)) {
      return jsonResponse({ success: false, error: "Length, width and height are required for this product's packing setup." }, 400);
    }

    await env.DB.prepare(
      `INSERT INTO product_shipping
       (product_id, shipping_type_id, packing_mode, weight_kg, length_cm, width_cm, height_cm)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         shipping_type_id = excluded.shipping_type_id,
         packing_mode = excluded.packing_mode,
         weight_kg = excluded.weight_kg,
         length_cm = excluded.length_cm,
         width_cm = excluded.width_cm,
         height_cm = excluded.height_cm,
         updated_at = CURRENT_TIMESTAMP`
    ).bind(productId, shippingTypeId, packingMode, weight, length, width, height).run();

    return jsonResponse({ success: true, data: { product_id: productId, shipping: await getProductShipping(env, productId) } });
  } catch (error) {
    if (error?.message === "Authentication required.") return jsonResponse({ success: false, error: error.message }, 401);
    return jsonResponse({ success: false, error: "Unable to save product shipping information." }, 500);
  }
}
