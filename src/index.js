const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const FIREBASE_PROJECT_ID = "clothing-store-e7200";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_KEYS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const firebaseKeyCache = new Map();
let firebaseKeysExpiresAt = 0;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS
  });
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===";
  const binary = atob(padded.slice(0, Math.floor(padded.length / 4) * 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeBase64UrlJson(value) {
  const bytes = base64UrlToBytes(value);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function getFirebaseKeys() {
  if (Date.now() < firebaseKeysExpiresAt && firebaseKeyCache.size) return firebaseKeyCache;

  const response = await fetch(FIREBASE_KEYS_URL, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 300 }
  });
  if (!response.ok) throw new Error("Unable to load Firebase public keys.");

  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const keys = await response.json();

  firebaseKeyCache.clear();
  for (const [kid, certificate] of Object.entries(keys)) {
    firebaseKeyCache.set(kid, certificate);
  }
  firebaseKeysExpiresAt = Date.now() + Math.max(60, maxAge) * 1000;
  return firebaseKeyCache;
}

async function verifyFirebaseIdToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Missing bearer token.");

  const token = authorization.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format.");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeBase64UrlJson(encodedHeader);
  const payload = decodeBase64UrlJson(encodedPayload);

  if (header.alg !== "RS256" || !header.kid) throw new Error("Invalid token header.");

  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("Invalid token subject.");
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error("Invalid token audience.");
  if (payload.iss !== FIREBASE_ISSUER) throw new Error("Invalid token issuer.");
  if (!Number.isFinite(payload.exp) || payload.exp <= now) throw new Error("Token expired.");
  if (!Number.isFinite(payload.iat) || payload.iat > now) throw new Error("Invalid token issue time.");
  if (!Number.isFinite(payload.auth_time) || payload.auth_time > now) throw new Error("Invalid authentication time.");

  const keys = await getFirebaseKeys();
  let certificate = keys.get(header.kid);
  if (!certificate) {
    firebaseKeysExpiresAt = 0;
    await getFirebaseKeys();
    certificate = firebaseKeyCache.get(header.kid);
  }
  if (!certificate) throw new Error("Unknown Firebase signing key.");

  const pem = certificate.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, "");
  const der = Uint8Array.from(atob(pem), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "spki",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );

  if (!valid) throw new Error("Invalid Firebase token signature.");
  return payload;
}

async function handleAdminAuthCheck(request) {
  try {
    const token = await verifyFirebaseIdToken(request);
    return jsonResponse({
      success: true,
      data: { authenticated: true, uid: token.sub, email: token.email || "" }
    });
  } catch {
    return jsonResponse({
      success: false,
      error: "Authentication required."
    }, 401);
  }
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

  if (!settings) return { store: null, social_links: socialLinks.results ?? [] };

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
  if (request.method === "GET") {
    try {
      return jsonResponse({ success: true, data: await getStoreSettings(env) });
    } catch {
      return jsonResponse({ success: false, error: "Unable to load store settings." }, 500);
    }
  }

  if (request.method !== "PUT") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    const token = await verifyFirebaseIdToken(request);
    const body = await request.json();
    const allowedFields = [
      "store_name", "logo_url", "tagline", "description",
      "contact_email", "contact_phone", "whatsapp_url", "address"
    ];
    const values = allowedFields.map((field) => String(body?.[field] ?? "").trim());

    await env.DB.prepare(`
      UPDATE store_settings
      SET store_name = ?, logo_url = ?, tagline = ?, description = ?,
          contact_email = ?, contact_phone = ?, whatsapp_url = ?, address = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).bind(...values).run();

    const socialLinks = Array.isArray(body?.social_links) ? body.social_links : [];
    const supportedPlatforms = new Set(["facebook", "instagram", "tiktok", "youtube", "whatsapp"]);
    for (const social of socialLinks) {
      if (!supportedPlatforms.has(String(social?.platform))) continue;
      const platform = String(social.platform);
      const label = String(social?.label ?? "").trim();
      const url = String(social?.url ?? "").trim();
      const sortOrder = Number.isFinite(Number(social?.sort_order)) ? Number(social.sort_order) : 0;
      const enabled = social?.is_enabled ? 1 : 0;

      const existing = await env.DB.prepare(`
        SELECT id
        FROM social_links
        WHERE platform = ?
        ORDER BY id ASC
        LIMIT 1
      `).bind(platform).first();

      if (existing?.id) {
        await env.DB.prepare(`
          UPDATE social_links
          SET label = ?, url = ?, sort_order = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(label, url, sortOrder, enabled, existing.id).run();
      } else {
        await env.DB.prepare(`
          INSERT INTO social_links (platform, label, url, sort_order, is_enabled)
          VALUES (?, ?, ?, ?, ?)
        `).bind(platform, label, url, sortOrder, enabled).run();
      }
    }

    return jsonResponse({ success: true, data: { uid: token.sub } });
  } catch (error) {
    if (error?.message === "Authentication required.") {
      return jsonResponse({ success: false, error: error.message }, 401);
    }
    return jsonResponse({ success: false, error: "Unable to save store settings." }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/admin-auth-check") return handleAdminAuthCheck(request);
    if (url.pathname === "/api/store-settings") return handleStoreSettings(request, env);

    return new Response(JSON.stringify({
      success: true,
      message: "Clothing Store Worker is online.",
      version: "1.0.0-test"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
};
