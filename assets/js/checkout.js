const checkoutPageElement = document.querySelector('[data-checkout-page]');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const formatMoney = (value, currency) => `${String(currency || 'ZAR').toUpperCase()} ${Number(value || 0).toFixed(2)}`;

const renderCheckout = () => {
  if (!checkoutPageElement) return;
  const cart = readCart();
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
          <legend>Delivery address</legend>
          <label class="field"><span>Address</span><input name="address" type="text" autocomplete="street-address" required></label>
          <div class="settings-fields-two">
            <label class="field"><span>City / Town</span><input name="city" type="text" autocomplete="address-level2" required></label>
            <label class="field"><span>Province</span><input name="province" type="text" autocomplete="address-level1" required></label>
          </div>
          <div class="settings-fields-two">
            <label class="field"><span>Postal code</span><input name="postal_code" type="text" autocomplete="postal-code" required></label>
            <label class="field"><span>Country</span><input name="country" type="text" autocomplete="country-name" value="South Africa" required></label>
          </div>
          <label class="field"><span>Order notes <small>(optional)</small></span><textarea name="notes" rows="4" placeholder="Anything we should know about your delivery?"></textarea></label>
        </fieldset>

        <p class="checkout-notice" data-checkout-notice hidden></p>
        <button class="button button-primary checkout-submit" type="submit">Continue to payment</button>
        <p class="muted checkout-payment-note">Payment will be connected in the next step. Your order will not be placed from this page.</p>
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
        <p class="muted">Shipping and payment will be confirmed before the order is placed.</p>
      </aside>
    </div>`;
};

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-checkout-form]');
  if (!form) return;
  event.preventDefault();
  const notice = form.querySelector('[data-checkout-notice]');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  sessionStorage.setItem('clothing-store-checkout-details', JSON.stringify(Object.fromEntries(new FormData(form).entries())));
  notice.hidden = false;
  notice.textContent = 'Your checkout details are ready. Payment integration is the next step.';
});

renderCheckout();
