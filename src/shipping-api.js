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

function enabled(value, fallback = 1) {
  if (value === undefined || value === null) return fallback;
  return value ? 1 : 0;
}

async function requireAdmin(request, originalWorker, env) {
  const response = await originalWorker.fetch(new Request(new URL("/api/admin-auth-check", request.url), {
    method: "GET",
    headers: request.headers
  }), env);
  if (!response.ok) throw new Error("Authentication required.");
  return response.json();
}

async function getShipping(env, includeDisabled = false) {
  const methodWhere = includeDisabled ? "" : "WHERE is_enabled = 1";
  const optionWhere = includeDisabled ? "" : "AND o.is_enabled = 1";
  const methods = await env.DB.prepare(
    `SELECT id, name, provider_type, mode, is_enabled, sort_order, created_at, updated_at
     FROM shipping_methods ${methodWhere}
     ORDER BY sort_order ASC, id ASC`
  ).all();

  const options = await env.DB.prepare(
    `SELECT o.id, o.shipping_method_id, o.name, o.price, o.requires_landmark, o.is_enabled, o.sort_order,
            o.created_at, o.updated_at
     FROM shipping_options o
     JOIN shipping_methods m ON m.id = o.shipping_method_id
     WHERE 1=1 ${includeDisabled ? "" : "AND m.is_enabled = 1"} ${optionWhere}
     ORDER BY o.shipping_method_id ASC, o.sort_order ASC, o.id ASC`
  ).all();

  const optionRows = options.results ?? [];
  return (methods.results ?? []).map((method) => ({
    ...method,
    options: optionRows.filter((option) => Number(option.shipping_method_id) === Number(method.id))
  }));
}

export async function handleShippingApi(request, env, originalWorker) {
  try {
    const url = new URL(request.url);
    const includeDisabled = url.searchParams.get("include_disabled") === "1";

    if (request.method === "GET") {
      if (includeDisabled) await requireAdmin(request, originalWorker, env);
      return jsonResponse({ success: true, data: await getShipping(env, includeDisabled) });
    }

    const auth = await requireAdmin(request, originalWorker, env);
    if (!["POST", "PUT", "DELETE"].includes(request.method)) {
      return jsonResponse({ success: false, error: "Method not allowed." }, 405);
    }

    if (request.method === "POST") {
      const body = await request.json();
      if (body?.resource === "method") {
        const name = String(body?.name ?? "").trim();
        const providerType = String(body?.provider_type ?? "").trim();
        const mode = String(body?.mode ?? "").trim();
        if (!name || !["local", "paxi", "courier_guy"].includes(providerType) || !["manual", "api"].includes(mode)) {
          return jsonResponse({ success: false, error: "A valid shipping method is required." }, 400);
        }
        const result = await env.DB.prepare(
          `INSERT INTO shipping_methods (name, provider_type, mode, is_enabled, sort_order)
           VALUES (?, ?, ?, ?, ?) RETURNING id`
        ).bind(name, providerType, mode, enabled(body?.is_enabled, 1), nonNegative(body?.sort_order)).first();
        return jsonResponse({ success: true, data: { id: result.id, uid: auth?.data?.uid || "" } }, 201);
      }

      const methodId = id(body?.shipping_method_id);
      const name = String(body?.name ?? "").trim();
      if (!methodId || !name) return jsonResponse({ success: false, error: "Shipping method and option name are required." }, 400);
      const method = await env.DB.prepare("SELECT id, provider_type FROM shipping_methods WHERE id = ?").bind(methodId).first();
      if (!method) return jsonResponse({ success: false, error: "Shipping method not found." }, 404);
      const result = await env.DB.prepare(
        `INSERT INTO shipping_options (shipping_method_id, name, price, requires_landmark, is_enabled, sort_order)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
      ).bind(methodId, name, nonNegative(body?.price), method.provider_type === "local" ? enabled(body?.requires_landmark, 0) : 0, enabled(body?.is_enabled, 1), nonNegative(body?.sort_order)).first();
      return jsonResponse({ success: true, data: { id: result.id, uid: auth?.data?.uid || "" } }, 201);
    }

    const resource = url.searchParams.get("resource") || "method";
    const resourceId = id(url.searchParams.get("id"));
    if (!resourceId) return jsonResponse({ success: false, error: "A valid id is required." }, 400);

    if (request.method === "DELETE") {
      if (resource === "option") await env.DB.prepare("DELETE FROM shipping_options WHERE id = ?").bind(resourceId).run();
      else await env.DB.prepare("DELETE FROM shipping_methods WHERE id = ?").bind(resourceId).run();
      return jsonResponse({ success: true, data: { id: resourceId, uid: auth?.data?.uid || "" } });
    }

    const body = await request.json();
    if (resource === "option") {
      const existing = await env.DB.prepare("SELECT o.*, m.provider_type FROM shipping_options o JOIN shipping_methods m ON m.id = o.shipping_method_id WHERE o.id = ?").bind(resourceId).first();
      if (!existing) return jsonResponse({ success: false, error: "Shipping option not found." }, 404);
      const targetMethodId = id(body?.shipping_method_id) || existing.shipping_method_id;
      const targetMethod = await env.DB.prepare("SELECT id, provider_type FROM shipping_methods WHERE id = ?").bind(targetMethodId).first();
      if (!targetMethod) return jsonResponse({ success: false, error: "Shipping method not found." }, 404);
      await env.DB.prepare(
        `UPDATE shipping_options
         SET shipping_method_id = ?, name = ?, price = ?, requires_landmark = ?, is_enabled = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(
        targetMethodId,
        String(body?.name ?? existing.name).trim(),
        nonNegative(body?.price, existing.price),
        targetMethod.provider_type === "local" ? enabled(body?.requires_landmark, existing.requires_landmark) : 0,
        enabled(body?.is_enabled, existing.is_enabled),
        nonNegative(body?.sort_order, existing.sort_order),
        resourceId
      ).run();
    } else {
      const existing = await env.DB.prepare("SELECT * FROM shipping_methods WHERE id = ?").bind(resourceId).first();
      if (!existing) return jsonResponse({ success: false, error: "Shipping method not found." }, 404);
      await env.DB.prepare(
        `UPDATE shipping_methods
         SET name = ?, is_enabled = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(String(body?.name ?? existing.name).trim(), enabled(body?.is_enabled, existing.is_enabled), nonNegative(body?.sort_order, existing.sort_order), resourceId).run();
    }

    return jsonResponse({ success: true, data: { id: resourceId, uid: auth?.data?.uid || "" } });
  } catch (error) {
    if (error?.message === "Authentication required.") return jsonResponse({ success: false, error: error.message }, 401);
    return jsonResponse({ success: false, error: "Unable to save shipping settings." }, 500);
  }
}
