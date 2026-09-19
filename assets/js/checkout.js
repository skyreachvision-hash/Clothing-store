const checkoutPageElement = document.querySelector('[data-checkout-page]');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const formatMoney = (value, currency) => `${String(currency || 'ZAR').toUpperCase()} ${Number(value || 0).toFixed(2)}`;

let shippingMethods = [];
let cart = [];

async function loadShippingMethods() {
  const response = await fetch('/api/shipping', { headers: { Accept: 'application/json' }, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load shipping options.');
  shippingMethods = Array.isArray(payload.data) ? payload.data : [];
}

function selectedShipping() {
  const form = document.querySelector('[data-checkout-form]');
  if (!form) return { method: null, option: null };
  const methodId = Number(form.elements.shipping_method_id?.value || 0);
  const optionId = Number(form.elements.shipping_option_id?.value || 0);
  const method = shippingMethods.find((item) => Number(item.id) === methodId) || null;
  const option = method?.options?.find((item) => Number(item.id) === optionId) || null;
  return { method, option };
}

function renderShippingOptions() {
  const methodSelect = document.querySelector('[data-shipping-method]');
  const optionSelect = document.querySelector('[data-shipping-option]');
  const optionField = document.querySelector('[data-shipping-option-field]');
  const landmarkField = document.querySelector('[data-landmark-field]');
  const method = shippingMethods.find((item) => Number(item.id) === Number(methodSelect?.value || 0)) || null;

  if (!methodSelect || !optionSelect || !optionField) return;
  optionSelect.innerHTML = '<option value="">Select an option</option>';
  for (const option of method?.options || []) {
    const item = document.createElement('option');
    item.value = option.id;
    item.textContent = `${option.name} — ${formatMoney(option.price, 'ZAR')}`;
    optionSelect.append(item);
  }
  optionField.hidden = !(method?.options?.length);
  if (method?.options?.length === 1) optionSelect.value = String(method.options[0].id);

  const requiresLandmark = method?.provider_type === 'local';
  if (landmarkField) {
    landmarkField.hidden = !requiresLandmark;
    const input = landmarkField.querySelector('input');
    if (input) input.required = requiresLandmark;
  }

  const addressField = document.querySelector('[data-address-field]');
  if (addressField) {
    addressField.querySelector('input').required = true;
    addressField.hidden = false;
  }

  updateTotals();
}

function updateTotals() {
  const { option } = selectedShipping();
  const shipping = Number(option?.price || 0);
  const subtotal = cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const currency = String(cart[0]?.currency || 'ZAR').toUpperCase();
  const shippingTotal = document.querySelector('[data-checkout-shipping]');
  const orderTotal = document.querySelector('[data-checkout-grand-total]');
  if (shippingTotal) shippingTotal.textContent = formatMoney(shipping, currency);
  if (orderTotal) orderTotal.textContent = formatMoney(subtotal + shipping, currency);
}

function renderCheckout() {
  if (!checkoutPageElement) return;
  if (!cart.length) {
    checkoutPageElement.innerHTML = `
      <div class="checkout-empty">
        <h2>Your cart is empty</h2>
        <p class="muted">Add products before continuing to checkout.</p>
        <a class="button button-primary" href="index.html#categories">Shop products</a>
      </div>`;
    return;
  }

  const subtotal = cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const currency = String(cart[0]?.currency || 'ZAR').toUpperCase();
  const methodsMarkup = shippingMethods.length
    ? shippingMethods.map((method, index) => `<option value="${method.id}" ${index === 0 ? 'selected' : ''}>${escapeHtml(method.name)}</option>`).join('')
    : '<option value="">No shipping method configured</option>';

  checkoutPageElement.innerHTML = `
    <div class="checkout-layout">
      <form class="checkout-form" data-checkout-form novalidate>
        <fieldset class="checkout-section">
          <legend>Contact information</legend>
          <label class="field"><span>Full name</span><input name="full_name" type="text" autocomplete="name" required></label>
          <label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="field"><span>Phone number</span><input name="phone" type="tel" autocomplete="tel" required></label>
        </fieldset>

        <fieldset class="checkout-section">
          <legend>Delivery</legend>
          <label class="field"><span>Shipping method</span><select name="shipping_method_id" data-shipping-method required>${methodsMarkup}</select></label>
          <label class="field" data-shipping-option-field><span>Delivery area / option</span><select name="shipping_option_id" data-shipping-option required><option value="">Select an option</option></select></label>
          <label class="field" data-landmark-field hidden><span>Where are you staying / what are you near?</span><input name="landmark" type="text" maxlength="300" placeholder="e.g. Next to the school or near Mpho's shop"></label>
          <div class="settings-fields-two">
            <label class="field" data-address-field><span>Street / address</span><input name="address" type="text" autocomplete="street-address" required></label>
            <label class="field"><span>City / Town</span><input name="city" type="text" autocomplete="address-level2" required></label>
          </div>
          <div class="settings-fields-two">
            <label class="field"><span>Province</span><input name="province" type="text" autocomplete="address-level1" required></label>
            <label class="field"><span>Postal code</span><input name="postal_code" type="text" autocomplete="postal-code" required></label>
          </div>
          <label class="field"><span>Country</span><input name="country" type="text" autocomplete="country-name" value="South Africa" required></label>
          <label class="field"><span>Order notes <small>(optional)</small></span><textarea name="notes" rows="4" placeholder="Anything we should know about your delivery?"></textarea></label>
        </fieldset>

        <p class="checkout-notice" data-checkout-notice hidden></p>
        <button class="button button-primary checkout-submit" type="submit">Continue to payment</button>
        <p class="muted checkout-payment-note">Payment will be connected in the next step. This step currently only prepares the order details.</p>
      </form>

      <aside class="checkout-summary">
        <p class="eyebrow">Your order</p>
        <h2>Order summary</h2>
        <div class="checkout-items">
          ${cart.map((item) => `
            <div class="checkout-item">
              <div class="checkout-item-image">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : ''}</div>
              <div><strong>${escapeHtml(item.name)}</strong><span>${Number(item.quantity || 0)} × ${formatMoney(item.price, item.currency)}</span></div>
              <strong>${formatMoney(Number(item.price || 0) * Number(item.quantity || 0), item.currency)}</strong>
            </div>`).join('')}
        </div>
        <div class="checkout-total"><span>Subtotal</span><strong>${formatMoney(subtotal, currency)}</strong></div>
        <div class="checkout-total"><span>Shipping</span><strong data-checkout-shipping>${formatMoney(0, currency)}</strong></div>
        <div class="checkout-total checkout-grand-total"><strong>Total</strong><strong data-checkout-grand-total>${formatMoney(subtotal, currency)}</strong></div>
      </aside>
    </div>`;

  const methodSelect = document.querySelector('[data-shipping-method]');
  const optionSelect = document.querySelector('[data-shipping-option]');
  methodSelect?.addEventListener('change', renderShippingOptions);
  optionSelect?.addEventListener('change', renderShippingOptions);
  renderShippingOptions();
}

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-checkout-form]');
  if (!form) return;
  event.preventDefault();
  const notice = form.querySelector('[data-checkout-notice]');
  const { method, option } = selectedShipping();

  if (!method || !option) {
    notice.hidden = false;
    notice.textContent = 'Please select a delivery method and delivery option.';
    return;
  }
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const details = Object.fromEntries(new FormData(form).entries());
  details.shipping_method_name = method.name;
  details.shipping_provider_type = method.provider_type;
  details.shipping_mode = method.mode;
  details.shipping_option_name = option.name;
  details.shipping_fee = Number(option.price || 0);
  sessionStorage.setItem('clothing-store-checkout-details', JSON.stringify(details));
  notice.hidden = false;
  notice.textContent = `Delivery selected: ${method.name} — ${option.name}. Payment integration is the next step.`;
});

async function init() {
  const user = await window.customerAuthReady;
  if (!user) {
    const currentPath = window.location.pathname.endsWith('/checkout.html') ? 'checkout' : 'checkout';
    window.location.replace(`account.html?redirect=${currentPath}`);
    return;
  }

  cart = typeof readCart === 'function' ? readCart() : [];
  if (!cart.length) {
    renderCheckout();
    return;
  }
  try {
    await loadShippingMethods();
    renderCheckout();
  } catch (error) {
    checkoutPageElement.innerHTML = `
      <div class="checkout-empty">
        <h2>Shipping is not available yet</h2>
        <p class="muted">${escapeHtml(error.message)}</p>
        <a class="button button-outline" href="cart.html">Back to cart</a>
      </div>`;
  }
}

init();
