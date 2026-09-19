const form = document.querySelector("[data-payment-settings-form]");
const list = document.querySelector("[data-payment-provider-list]");
const status = document.querySelector("[data-payment-settings-status]");
const saveButton = form?.querySelector("button[type=submit]");

function setStatus(message) {
  if (status) status.textContent = message;
}

function renderProviders(providers) {
  if (!list) return;
  list.innerHTML = providers.map((provider) => `
    <label class="settings-option">
      <input type="checkbox" name="payment_provider" value="${provider.provider_key}" ${provider.is_enabled ? "checked" : ""}>
      <span><strong>${provider.display_name}</strong><small>Allow customers to use this payment provider at checkout.</small></span>
    </label>
  `).join("");
}

async function loadPaymentSettings() {
  setStatus("Loading payment providers…");
  await window.adminAuthReady;
  const token = await window.getAdminIdToken();
  const response = await fetch("/api/payment-settings?admin=1", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load payment providers.");
  renderProviders(payload.data || []);
  setStatus("Payment provider settings loaded.");
  if (saveButton) saveButton.disabled = false;
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saveButton) saveButton.disabled = true;
  setStatus("Saving payment provider settings…");
  try {
    const token = await window.getAdminIdToken();
    const providers = [...document.querySelectorAll('input[name="payment_provider"]')].map((input, index) => ({
      provider_key: input.value,
      is_enabled: input.checked,
      sort_order: index + 1
    }));
    const response = await fetch("/api/payment-settings", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ providers })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to save payment provider settings.");
    renderProviders(payload.data || []);
    setStatus("Payment provider settings saved.");
  } catch (error) {
    setStatus(error?.message || "Unable to save payment provider settings.");
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
});

loadPaymentSettings().catch((error) => {
  setStatus(error?.message || "Unable to load payment providers.");
});
