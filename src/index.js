const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS
  });
}

async function getStoreSettings(env) {
  const settings = await env.DB.prepare(`
    SELECT
      id,
      store_name,
      logo_url,
      tagline,
      description,
      contact_email,
      contact_phone,
      whatsapp_url,
      address,
      settings_json,
      updated_at
    FROM store_settings
    WHERE id = 1
  `).first();

  const socialLinks = await env.DB.prepare(`
    SELECT id, platform, label, url, sort_order, is_enabled, created_at, updated_at
    FROM social_links
    WHERE is_enabled = 1
    ORDER BY sort_order ASC, id ASC
  `).all();

  if (!settings) {
    return { store: null, social_links: socialLinks.results ?? [] };
  }

  let additionalSettings = {};
  try {
    additionalSettings = JSON.parse(settings.settings_json || "{}");
  } catch {
    additionalSettings = {};
  }

  const { settings_json: _settingsJson, ...store } = settings;
  return {
    store: { ...store, additional_settings: additionalSettings },
    social_links: socialLinks.results ?? []
  };
}

async function handleStoreSettings(request, env) {
  if (request.method !== "GET") {
    return jsonResponse({
      success: false,
      error: "Method not allowed. Store settings are read-only until authenticated admin access is available."
    }, 405);
  }

  try {
    return jsonResponse({
      success: true,
      data: await getStoreSettings(env)
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: "Unable to load store settings."
    }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/store-settings") {
      return handleStoreSettings(request, env);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Clothing Store Worker is online.",
        version: "1.0.0-test"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
