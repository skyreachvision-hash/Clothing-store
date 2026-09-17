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
  const binary = atob(padded.slice(0, Math.ceil(padded.length / 4) * 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s/g, "");
  return base64UrlToBytes(base64).buffer;
}

async function getFirebasePublicKey(kid) {
  const now = Date.now();
  if (firebaseKeyCache.has(kid) && firebaseKeysExpiresAt > now) {
    return firebaseKeyCache.get(kid);
  }

  const response = await fetch(FIREBASE_KEYS_URL, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error("Unable to load Firebase public keys.");
  }

  const keys = await response.json();
  firebaseKeyCache.clear();

  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  firebaseKeysExpiresAt = now + maxAgeSeconds * 1000;

  for (const [keyId, certificate] of Object.entries(keys)) {
    firebaseKeyCache.set(keyId, certificate);
  }

  return firebaseKeyCache.get(kid);
}

async function verifyFirebaseIdToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Missing bearer token.");
  }

  const token = authorization.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);

  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("Invalid token header.");
  }

  const now = Math.floor(Date.now() / 1000);
  const clockSkew = 60;

  if (
    payload.aud !== FIREBASE_PROJECT_ID ||
    payload.iss !== FIREBASE_ISSUER ||
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    typeof payload.exp !== "number" ||
    payload.exp <= now - clockSkew ||
    typeof payload.iat !== "number" ||
    payload.iat > now + clockSkew ||
    typeof payload.auth_time !== "number" ||
    payload.auth_time > now + clockSkew
  ) {
    throw new Error("Invalid token claims.");
  }

  const certificate = await getFirebasePublicKey(header.kid);
  if (!certificate) {
    throw new Error("Unknown Firebase signing key.");
  }

  const publicKey = await crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(certificate),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const isValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );

  if (!isValid) {
    throw new Error("Invalid token signature.");
  }

  return payload;
}

async function requireFirebaseAdmin(request) {
  try {
    return await verifyFirebaseIdToken(request);
  } catch {
    return null;
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

async function handleAdminAuthCheck(request) {
  if (request.method !== "GET") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  const token = await requireFirebaseAdmin(request);
  if (!token) {
    return jsonResponse({ success: false, error: "Authentication required." }, 401);
  }

  return jsonResponse({
    success: true,
    data: {
      authenticated: true,
      uid: token.sub,
      email: typeof token.email === "string" ? token.email : ""
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/store-settings") {
      return handleStoreSettings(request, env);
    }

    if (url.pathname === "/api/admin-auth-check") {
      return handleAdminAuthCheck(request);
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
