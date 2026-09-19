const DEFAULTS = {
  enabled: false,
  provider: "resend",
  sender_name: "",
  sender_email: "",
  reply_to: "",
  notify_order_confirmation: true,
  notify_order_status: true,
  notify_new_chat: true
};

function clean(value) {
  return String(value ?? "").trim();
}

export function getEmailSettings(storeSettingsRow) {
  let parsed = {};
  try {
    const settings = JSON.parse(storeSettingsRow?.settings_json || "{}");
    parsed = settings?.email && typeof settings.email === "object" ? settings.email : {};
  } catch {
    parsed = {};
  }
  return {
    ...DEFAULTS,
    ...parsed,
    enabled: Boolean(parsed.enabled),
    provider: clean(parsed.provider || DEFAULTS.provider).toLowerCase(),
    sender_name: clean(parsed.sender_name),
    sender_email: clean(parsed.sender_email),
    reply_to: clean(parsed.reply_to),
    notify_order_confirmation: parsed.notify_order_confirmation !== false,
    notify_order_status: parsed.notify_order_status !== false,
    notify_new_chat: parsed.notify_new_chat !== false
  };
}

export async function sendTransactionalEmail(env, { to, subject, html, text }) {
  const row = await env.DB.prepare("SELECT settings_json FROM store_settings WHERE id = 1").first();
  const settings = getEmailSettings(row);
  if (!settings.enabled) return { sent: false, skipped: true, reason: "Email notifications are disabled." };
  if (settings.provider !== "resend") throw new Error("Unsupported email provider.");
  if (!env.RESEND_API_KEY) throw new Error("Resend API key is not configured.");
  if (!settings.sender_email) throw new Error("Transactional sender email is not configured.");
  const recipient = clean(to);
  if (!recipient) throw new Error("Recipient email is required.");

  const payload = {
    from: settings.sender_name ? settings.sender_name + " <" + settings.sender_email + ">" : settings.sender_email,
    to: [recipient],
    subject: clean(subject),
    html: String(html || ""),
    text: String(text || "")
  };
  if (settings.reply_to) payload.reply_to = settings.reply_to;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.id) throw new Error(result?.message || "Transactional email delivery failed.");
  return { sent: true, id: String(result.id), provider: "resend" };
}
