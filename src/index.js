import { getEmailSettings } from "./email-service.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};
const FIREBASE_PROJECT_ID = "clothing-store-e7200";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_KEYS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const firebaseKeyCache = new Map();
let firebaseKeysExpiresAt = 0;
function jsonResponse(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS }); }
function base64UrlToBytes(value) { const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "==="; const binary = atob(padded.slice(0, Math.floor(padded.length / 4) * 4)); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index); return bytes; }
function decodeBase64UrlJson(value) { return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))); }
async function getFirebaseKeys() {
  if (Date.now() < firebaseKeysExpiresAt && firebaseKeyCache.size) return firebaseKeyCache;
  const response = await fetch(FIREBASE_KEYS_URL, { headers: { Accept: "application/json" }, cf: { cacheTtl: 300 } });
  if (!response.ok) throw new Error("Unable to load Firebase public keys.");
  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const keys = await response.json();
  firebaseKeyCache.clear();
  for (const [kid, certificate] of Object.entries(keys)) firebaseKeyCache.set(kid, certificate);
  firebaseKeysExpiresAt = Date.now() + Math.max(60, maxAge) * 1000;
  return firebaseKeyCache;
}
function readDerElement(bytes, offset) {
  if (offset >= bytes.length) throw new Error("Invalid certificate.");
  const tag = bytes[offset]; let length = bytes[offset + 1]; let headerLength = 2;
  if (length === undefined) throw new Error("Invalid certificate length.");
  if (length & 0x80) { const lengthBytes = length & 0x7f; if (!lengthBytes || lengthBytes > 4 || offset + 2 + lengthBytes > bytes.length) throw new Error("Invalid certificate length."); length = 0; for (let index = 0; index < lengthBytes; index += 1) length = length * 256 + bytes[offset + 2 + index]; headerLength += lengthBytes; }
  const start = offset + headerLength; const end = start + length; if (end > bytes.length) throw new Error("Invalid certificate bounds."); return { tag, start, end, next: end };
}
function extractSubjectPublicKeyInfoFromCertificate(certificateBytes) {
  const certificate = readDerElement(certificateBytes, 0); if (certificate.tag !== 0x30) throw new Error("Invalid certificate.");
  const tbs = readDerElement(certificateBytes, certificate.start); if (tbs.tag !== 0x30) throw new Error("Invalid certificate TBS.");
  let offset = tbs.start; let element = readDerElement(certificateBytes, offset); if (element.tag === 0xa0) offset = element.next;
  for (let index = 0; index < 5; index += 1) { element = readDerElement(certificateBytes, offset); offset = element.next; }
  const subjectPublicKeyInfo = readDerElement(certificateBytes, offset); if (subjectPublicKeyInfo.tag !== 0x30) throw new Error("Invalid certificate public key.");
  return certificateBytes.slice(offset, subjectPublicKeyInfo.end);
}
export async function verifyFirebaseIdToken(request) {
  const authorization = request.headers.get("Authorization") || ""; if (!authorization.startsWith("Bearer ")) throw new Error("Missing bearer token.");
  const token = authorization.slice(7).trim(); const parts = token.split("."); if (parts.length !== 3) throw new Error("Invalid token format.");
  const [encodedHeader, encodedPayload, encodedSignature] = parts; const header = decodeBase64UrlJson(encodedHeader); const payload = decodeBase64UrlJson(encodedPayload);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Invalid token header.");
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("Invalid token subject.");
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error("Invalid token audience.");
  if (payload.iss !== FIREBASE_ISSUER) throw new Error("Invalid token issuer.");
  if (!Number.isFinite(payload.exp) || payload.exp <= now) throw new Error("Token expired.");
  if (!Number.isFinite(payload.iat) || payload.iat > now) throw new Error("Invalid token issue time.");
  if (!Number.isFinite(payload.auth_time) || payload.auth_time > now) throw new Error("Invalid authentication time.");
  const keys = await getFirebaseKeys(); let certificate = keys.get(header.kid);
  if (!certificate) { firebaseKeysExpiresAt = 0; await getFirebaseKeys(); certificate = firebaseKeyCache.get(header.kid); }
  if (!certificate) throw new Error("Unknown Firebase signing key.");
  const pem = certificate.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, "");
  const der = Uint8Array.from(atob(pem), (character) => character.charCodeAt(0)); const spki = extractSubjectPublicKeyInfoFromCertificate(der);
  const key = await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlToBytes(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
  if (!valid) throw new Error("Invalid Firebase token signature."); return payload;
}
async function requireAdminRole(token, env) {
  const admin = await env.DB.prepare("SELECT firebase_uid, role, is_enabled FROM admin_users WHERE firebase_uid = ? AND is_enabled = 1").bind(token.sub).first();
  if (!admin) throw new Error("Administrator authorization required.");
  return admin;
}
async function handleAdminAuthCheck(request, env) {
  try {
    const token = await verifyFirebaseIdToken(request);
    const admin = await requireAdminRole(token, env);
    return jsonResponse({ success: true, data: { authenticated: true, authorized: true, uid: token.sub, email: token.email || "", role: admin.role } });
  } catch (error) {
    if (error?.message === "Administrator authorization required.") return jsonResponse({ success: false, error: error.message }, 403);
    return jsonResponse({ success: false, error: "Authentication required." }, 401);
  }
}

async function getStoreSettings(env) {
  const settings = await env.DB.prepare(`SELECT id, store_name, logo_url, tagline, description, contact_email, contact_phone, whatsapp_url, address, settings_json, updated_at FROM store_settings WHERE id = 1`).first();
  const socialLinks = await env.DB.prepare(`SELECT id, platform, label, url, sort_order, is_enabled, created_at, updated_at FROM social_links WHERE is_enabled = 1 ORDER BY sort_order ASC, id ASC`).all();
  if (!settings) return { store: null, social_links: socialLinks.results ?? [] };
  let additionalSettings = {}; try { additionalSettings = JSON.parse(settings.settings_json || "{}"); } catch { additionalSettings = {}; }
  const { settings_json: _settingsJson, ...store } = settings;
  const emailSettings = getEmailSettings(settings);
  return { store: { ...store, additional_settings: { ...additionalSettings, email: emailSettings } }, social_links: socialLinks.results ?? [] };
}
async function handleStoreSettings(request, env) {
  if (request.method === "GET") { try { return jsonResponse({ success: true, data: await getStoreSettings(env) }); } catch { return jsonResponse({ success: false, error: "Unable to load store settings." }, 500); } }
  if (request.method !== "PUT") return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  try {
    const token = await verifyFirebaseIdToken(request);
    await requireAdminRole(token, env);
    const body = await request.json();
    const allowedFields = ["store_name", "logo_url", "tagline", "description", "contact_email", "contact_phone", "whatsapp_url", "address"];
    const values = allowedFields.map((field) => String(body?.[field] ?? "").trim());
    let existingAdditionalSettings = {}; const currentSettings = await env.DB.prepare(`SELECT settings_json FROM store_settings WHERE id = 1`).first();
    try { existingAdditionalSettings = JSON.parse(currentSettings?.settings_json || "{}"); } catch { existingAdditionalSettings = {}; }
    const incomingEmail = body?.email_notifications || {};
    const emailSettings = {
      enabled: Boolean(incomingEmail.enabled),
      provider: String(incomingEmail.provider || "resend").trim().toLowerCase() || "resend",
      sender_name: String(incomingEmail.sender_name ?? "").trim(),
      sender_email: String(incomingEmail.sender_email ?? "").trim(),
      reply_to: String(incomingEmail.reply_to ?? "").trim(),
      notify_order_confirmation: Boolean(incomingEmail.notify_order_confirmation),
      notify_order_status: Boolean(incomingEmail.notify_order_status),
      notify_new_chat: Boolean(incomingEmail.notify_new_chat)
    };
    if (!["resend", "gmail"].includes(emailSettings.provider)) return jsonResponse({ success: false, error: "Unsupported email provider." }, 400);
    const additionalSettings = { ...existingAdditionalSettings, hero_headline: String(body?.hero_headline ?? "").trim(), email: emailSettings };
    await env.DB.prepare(`UPDATE store_settings SET store_name = ?, logo_url = ?, tagline = ?, description = ?, contact_email = ?, contact_phone = ?, whatsapp_url = ?, address = ?, settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).bind(...values, JSON.stringify(additionalSettings)).run();
    const socialLinks = Array.isArray(body?.social_links) ? body.social_links : []; const supportedPlatforms = new Set(["facebook", "instagram", "tiktok", "youtube", "whatsapp"]);
    for (const social of socialLinks) {
      if (!supportedPlatforms.has(String(social?.platform))) continue; const platform = String(social.platform); const label = String(social?.label ?? "").trim(); const url = String(social?.url ?? "").trim(); const sortOrder = Number.isFinite(Number(social?.sort_order)) ? Number(social.sort_order) : 0; const enabled = social?.is_enabled ? 1 : 0;
      const existing = await env.DB.prepare(`SELECT id FROM social_links WHERE platform = ? ORDER BY id ASC LIMIT 1`).bind(platform).first();
      if (existing?.id) await env.DB.prepare(`UPDATE social_links SET label = ?, url = ?, sort_order = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(label, url, sortOrder, enabled, existing.id).run();
      else await env.DB.prepare(`INSERT INTO social_links (platform, label, url, sort_order, is_enabled) VALUES (?, ?, ?, ?, ?)`).bind(platform, label, url, sortOrder, enabled).run();
    }
    return jsonResponse({ success: true, data: { uid: token.sub } });
  } catch (error) { if (error?.message === "Authentication required.") return jsonResponse({ success: false, error: error.message }, 401);
    if (error?.message === "Administrator authorization required.") return jsonResponse({ success: false, error: error.message }, 403);
    return jsonResponse({ success: false, error: "Unable to save store settings." }, 500); }
}
async function createCloudinarySignature(params, secret) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "").sort(([a], [b]) => a.localeCompare(b));
  const query = entries.map(([key, value]) => `${key}=${value}`).join("&");
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${query}${secret}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function handleImageUpload(request, env) {
  if (request.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  try {
    const token = await verifyFirebaseIdToken(request);
    await requireAdminRole(token, env);
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return jsonResponse({ success: false, error: "Cloudinary upload is not configured." }, 500);
    const contentLength = Number(request.headers.get("Content-Length") || 0); if (contentLength > 10 * 1024 * 1024) return jsonResponse({ success: false, error: "Image is too large. Maximum size is 10 MB." }, 413);
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return jsonResponse({ success: false, error: "An image file is required." }, 400);
    if (!file.type.startsWith("image/")) return jsonResponse({ success: false, error: "Only image files are allowed." }, 400);
    if (file.size > 10 * 1024 * 1024) return jsonResponse({ success: false, error: "Image is too large. Maximum size is 10 MB." }, 413);
    const timestamp = Math.floor(Date.now() / 1000); const folder = "clothing-store/products"; const signature = await createCloudinarySignature({ folder, timestamp }, env.CLOUDINARY_API_SECRET);
    const cloudinaryForm = new FormData(); cloudinaryForm.append("file", file, file.name || "product-image"); cloudinaryForm.append("api_key", env.CLOUDINARY_API_KEY); cloudinaryForm.append("timestamp", String(timestamp)); cloudinaryForm.append("folder", folder); cloudinaryForm.append("signature", signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/upload`, { method: "POST", body: cloudinaryForm });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.secure_url) return jsonResponse({ success: false, error: result.error?.message || "Cloudinary upload failed." }, 502);
    return jsonResponse({ success: true, data: { uid: token.sub, image_url: result.secure_url, cloudinary_public_id: result.public_id || "", original_filename: result.original_filename || file.name || "" } }, 201);
  } catch (error) { if (error?.message === "Authentication required.") return jsonResponse({ success: false, error: error.message }, 401); if (error?.message === "Administrator authorization required.") return jsonResponse({ success: false, error: error.message }, 403); return jsonResponse({ success: false, error: "Unable to upload image." }, 500); }
}
function normalizeSlug(value) { return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120); }
function parseOptionalId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }
function parseNonNegativeInteger(value, fallback = 0) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : fallback; }
function parseNonNegativeNumber(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : fallback; }
function parseEnabled(value, fallback = 1) { if (value === undefined || value === null) return fallback; return value ? 1 : 0; }
function parseProductStatus(value, fallback = "draft") { const status = String(value ?? fallback).trim().toLowerCase(); return ["draft", "active", "archived"].includes(status) ? status : null; }
async function getCategories(env, includeDisabled = false) { const query = includeDisabled ? `SELECT id, name, slug, description, sort_order, is_enabled, created_at, updated_at FROM categories ORDER BY sort_order ASC, id ASC` : `SELECT id, name, slug, description, sort_order, is_enabled, created_at, updated_at FROM categories WHERE is_enabled = 1 ORDER BY sort_order ASC, id ASC`; const result = await env.DB.prepare(query).all(); return result.results ?? []; }
async function handleCategories(request, env) {
  if (request.method === "GET") { try { const includeDisabled = new URL(request.url).searchParams.get("include_disabled") === "1"; if (includeDisabled) { try { await verifyFirebaseIdToken(request); } catch { return jsonResponse({ success: false, error: "Authentication required." }, 401); } } return jsonResponse({ success: true, data: await getCategories(env, includeDisabled) }); } catch { return jsonResponse({ success: false, error: "Unable to load categories." }, 500); } }
  try {
    const token = await verifyFirebaseIdToken(request);
    await requireAdminRole(token, env);
    if (!["POST", "PUT", "DELETE"].includes(request.method)) return jsonResponse({ success: false, error: "Method not allowed." }, 405);
    if (request.method === "POST") { const body = await request.json(); const name = String(body?.name ?? "").trim(); const slug = normalizeSlug(body?.slug || name); if (!name || !slug) return jsonResponse({ success: false, error: "Category name is required." }, 400); const result = await env.DB.prepare(`INSERT INTO categories (name, slug, description, sort_order, is_enabled) VALUES (?, ?, ?, ?, ?) RETURNING id`).bind(name, slug, String(body?.description ?? "").trim(), parseNonNegativeInteger(body?.sort_order), parseEnabled(body?.is_enabled)).first(); return jsonResponse({ success: true, data: { id: result.id, uid: token.sub } }, 201); }
    const url = new URL(request.url); const id = parseOptionalId(url.searchParams.get("id")); if (!id) return jsonResponse({ success: false, error: "A valid category id is required." }, 400);
    if (request.method === "DELETE") { await env.DB.prepare(`DELETE FROM categories WHERE id = ?`).bind(id).run(); return jsonResponse({ success: true, data: { id, uid: token.sub } }); }
    const body = await request.json(); const existing = await env.DB.prepare(`SELECT id, name, slug, description, sort_order, is_enabled FROM categories WHERE id = ?`).bind(id).first(); if (!existing) return jsonResponse({ success: false, error: "Category not found." }, 404);
    const name = String(body?.name ?? existing.name).trim(); const slug = normalizeSlug(body?.slug || name || existing.slug); if (!name || !slug) return jsonResponse({ success: false, error: "Category name is required." }, 400);
    await env.DB.prepare(`UPDATE categories SET name = ?, slug = ?, description = ?, sort_order = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(name, slug, String(body?.description ?? existing.description).trim(), parseNonNegativeInteger(body?.sort_order, existing.sort_order), parseEnabled(body?.is_enabled, existing.is_enabled), id).run();
    return jsonResponse({ success: true, data: { id, uid: token.sub } });
  } catch (error) { if (error?.message === "Authentication required.") return jsonResponse({ success: false, error: error.message }, 401); if (error?.message === "Administrator authorization required.") return jsonResponse({ success: false, error: error.message }, 403); if (String(error?.message || "").includes("UNIQUE constraint failed")) return jsonResponse({ success: false, error: "A category with that slug already exists." }, 409); return jsonResponse({ success: false, error: "Unable to save category." }, 500); }
}
async function getProducts(env, request) {
  const params = new URL(request.url).searchParams; const status = params.get("status"); const categoryId = parseOptionalId(params.get("category_id")); const search = String(params.get("search") || "").trim(); const page = Math.max(1, parseNonNegativeInteger(params.get("page"), 1)); const limit = Math.min(100, Math.max(1, parseNonNegativeInteger(params.get("limit"), 24))); const offset = (page - 1) * limit; const publicOnly = status === null;
  let sql = `SELECT p.id, p.category_id, p.name, p.slug, p.description, p.sku, p.price, p.currency, p.status, p.stock_quantity, p.track_stock, p.sort_order, p.created_at, p.updated_at, c.name AS category_name, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE 1 = 1`; const bindings = [];
  if (publicOnly) sql += ` AND p.status = 'active'`; else if (!["draft", "active", "archived"].includes(status)) return { error: "Invalid product status.", status: 400 }; else { sql += ` AND p.status = ?`; bindings.push(status); }
  if (categoryId) { sql += ` AND p.category_id = ?`; bindings.push(categoryId); }
  if (search) { sql += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)`; const term = `%${search}%`; bindings.push(term, term, term); }
  const countSql = sql.replace(/SELECT[\s\S]*?FROM products p/, "SELECT COUNT(*) AS total FROM products p"); const count = await env.DB.prepare(countSql).bind(...bindings).first(); sql += ` ORDER BY p.sort_order ASC, p.id DESC LIMIT ? OFFSET ?`; bindings.push(limit, offset); const productsResult = await env.DB.prepare(sql).bind(...bindings).all(); const products = productsResult.results ?? [];
  if (products.length) { const ids = products.map((product) => product.id); const placeholders = ids.map(() => "?").join(", "); const [imagesResult, variantsResult] = await Promise.all([env.DB.prepare(`SELECT id, product_id, image_url, cloudinary_public_id, alt_text, sort_order, is_primary, created_at FROM product_images WHERE product_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`).bind(...ids).all(), env.DB.prepare(`SELECT id, product_id, name, sku, option_values, price_override, stock_quantity, is_enabled, sort_order, created_at, updated_at FROM product_variants WHERE product_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`).bind(...ids).all()]); const imagesByProduct = new Map(); const variantsByProduct = new Map(); for (const image of imagesResult.results ?? []) { if (!imagesByProduct.has(image.product_id)) imagesByProduct.set(image.product_id, []); imagesByProduct.get(image.product_id).push(image); } for (const variant of variantsResult.results ?? []) { let optionValues = {}; try { optionValues = JSON.parse(variant.option_values || "{}"); } catch { optionValues = {}; } const normalizedVariant = { ...variant, option_values: optionValues }; if (!variantsByProduct.has(variant.product_id)) variantsByProduct.set(variant.product_id, []); variantsByProduct.get(variant.product_id).push(normalizedVariant); } for (const product of products) { product.images = imagesByProduct.get(product.id) ?? []; product.variants = variantsByProduct.get(product.id) ?? []; } }
  return { data: { products, pagination: { page, limit, total: Number(count?.total || 0), total_pages: Math.ceil(Number(count?.total || 0) / limit) } } };
}
async function handleProducts(request, env) {
  if (request.method === "GET") { try { const result = await getProducts(env, request); if (result.error) return jsonResponse({ success: false, error: result.error }, result.status); return jsonResponse({ success: true, data: result.data }); } catch { return jsonResponse({ success: false, error: "Unable to load products." }, 500); } }
  try {
    const token = await verifyFirebaseIdToken(request);
    await requireAdminRole(token, env);
    if (!["POST", "PUT", "DELETE"].includes(request.method)) return jsonResponse({ success: false, error: "Method not allowed." }, 405); const url = new URL(request.url); const id = parseOptionalId(url.searchParams.get("id"));
    if (request.method === "DELETE") { if (!id) return jsonResponse({ success: false, error: "A valid product id is required." }, 400); const existing = await env.DB.prepare(`SELECT id FROM products WHERE id = ?`).bind(id).first(); if (!existing) return jsonResponse({ success: false, error: "Product not found." }, 404); await env.DB.prepare(`DELETE FROM products WHERE id = ?`).bind(id).run(); return jsonResponse({ success: true, data: { id, uid: token.sub } }); }
    const body = await request.json(); let existing = null;
    if (request.method === "PUT") { if (!id) return jsonResponse({ success: false, error: "A valid product id is required." }, 400); existing = await env.DB.prepare(`SELECT id, category_id, name, slug, description, sku, price, currency, status, stock_quantity, track_stock, sort_order FROM products WHERE id = ?`).bind(id).first(); if (!existing) return jsonResponse({ success: false, error: "Product not found." }, 404); }
    const name = String(body?.name ?? existing?.name ?? "").trim(); const slug = normalizeSlug(body?.slug || name || existing?.slug); if (!name || !slug) return jsonResponse({ success: false, error: "Product name is required." }, 400); const status = parseProductStatus(body?.status, existing?.status || "draft"); if (!status) return jsonResponse({ success: false, error: "Invalid product status." }, 400);
    const categoryId = body?.category_id === null || body?.category_id === "" ? null : parseOptionalId(body?.category_id ?? existing?.category_id); if (categoryId) { const category = await env.DB.prepare(`SELECT id FROM categories WHERE id = ?`).bind(categoryId).first(); if (!category) return jsonResponse({ success: false, error: "Category not found." }, 400); }
    const productValues = [categoryId, name, slug, String(body?.description ?? existing?.description ?? "").trim(), String(body?.sku ?? existing?.sku ?? "").trim(), parseNonNegativeNumber(body?.price, existing?.price ?? 0), String(body?.currency ?? existing?.currency ?? "ZAR").trim().toUpperCase() || "ZAR", status, parseNonNegativeInteger(body?.stock_quantity, existing?.stock_quantity ?? 0), parseEnabled(body?.track_stock, existing?.track_stock ?? 1), parseNonNegativeInteger(body?.sort_order, existing?.sort_order ?? 0)];
    let productId = id;
    if (request.method === "POST") { const result = await env.DB.prepare(`INSERT INTO products (category_id, name, slug, description, sku, price, currency, status, stock_quantity, track_stock, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(...productValues).first(); productId = result.id; }
    else await env.DB.prepare(`UPDATE products SET category_id = ?, name = ?, slug = ?, description = ?, sku = ?, price = ?, currency = ?, status = ?, stock_quantity = ?, track_stock = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...productValues, productId).run();
    if (Array.isArray(body?.images)) { await env.DB.prepare(`DELETE FROM product_images WHERE product_id = ?`).bind(productId).run(); for (const image of body.images) { const imageUrl = String(image?.image_url ?? "").trim(); if (!imageUrl) continue; await env.DB.prepare(`INSERT INTO product_images (product_id, image_url, cloudinary_public_id, alt_text, sort_order, is_primary) VALUES (?, ?, ?, ?, ?, ?)`).bind(productId, imageUrl, String(image?.cloudinary_public_id ?? "").trim(), String(image?.alt_text ?? "").trim(), parseNonNegativeInteger(image?.sort_order), parseEnabled(image?.is_primary)).run(); } }
    if (Array.isArray(body?.variants)) { await env.DB.prepare(`DELETE FROM product_variants WHERE product_id = ?`).bind(productId).run(); for (const variant of body.variants) { let optionValues = variant?.option_values; if (typeof optionValues !== "object" || optionValues === null || Array.isArray(optionValues)) optionValues = {}; const priceOverride = variant?.price_override === null || variant?.price_override === "" ? null : parseNonNegativeNumber(variant?.price_override, 0); await env.DB.prepare(`INSERT INTO product_variants (product_id, name, sku, option_values, price_override, stock_quantity, is_enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(productId, String(variant?.name ?? "").trim(), String(variant?.sku ?? "").trim(), JSON.stringify(optionValues), priceOverride, parseNonNegativeInteger(variant?.stock_quantity), parseEnabled(variant?.is_enabled), parseNonNegativeInteger(variant?.sort_order)).run(); } }
    return jsonResponse({ success: true, data: { id: productId, uid: token.sub } }, request.method === "POST" ? 201 : 200);
  } catch (error) { if (error?.message === "Authentication required.") return jsonResponse({ success: false, error: error.message }, 401); if (String(error?.message || "").includes("UNIQUE constraint failed")) return jsonResponse({ success: false, error: "A product with that slug already exists." }, 409); return jsonResponse({ success: false, error: "Unable to save product." }, 500); }
}
export default { async fetch(request, env) { const url = new URL(request.url); if (url.pathname === "/api/admin-auth-check") return handleAdminAuthCheck(request, env); if (url.pathname === "/api/store-settings") return handleStoreSettings(request, env); if (url.pathname === "/api/upload-image") return handleImageUpload(request, env); if (url.pathname === "/api/categories") return handleCategories(request, env); if (url.pathname === "/api/products") return handleProducts(request, env); return new Response(JSON.stringify({ success: true, message: "Clothing Store Worker is online.", version: "1.0.0-test" }), { status: 200, headers: { "Content-Type": "application/json" } }); } };