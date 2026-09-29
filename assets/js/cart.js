const cartStorageKey = 'clothing-store-cart';

const readCart = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(cartStorageKey) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeCart = (cart) => {
  try { localStorage.setItem(cartStorageKey, JSON.stringify(cart)); } catch {}
};

const getCartQuantity = (cart) => cart.reduce((total, item) => total + Number(item.quantity || 0), 0);

const updateCartCount = () => {
  const quantity = getCartQuantity(readCart());
  document.querySelectorAll('.cart-count').forEach((element) => { element.textContent = String(quantity); });
  document.querySelectorAll('.cart-link, .sticky-cart-link').forEach((link) => {
    link.setAttribute('aria-label', `Shopping cart, currently containing ${quantity} ${quantity === 1 ? 'item' : 'items'}`);
  });
};

const getProductFromCard = (button) => {
  const card = button.closest('.product-card');
  if (!card) return null;
  const productId = Number(button.dataset.productId);
  const name = card.querySelector('.product-info h3 a, .product-info h2 a')?.textContent?.trim();
  const priceText = card.querySelector('.price')?.textContent?.trim() || '';
  const image = card.querySelector('[data-product-image]')?.style.backgroundImage?.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
    || card.querySelector('.product-image img')?.getAttribute('src')
    || card.querySelector('.product-image')?.style.backgroundImage?.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
    || null;
  if (!Number.isInteger(productId) || productId <= 0 || !name) return null;
  const match = priceText.match(/^([A-Za-z]{3})\s+([0-9]+(?:\.[0-9]+)?)$/);
  return {
    product_id: productId,
    name,
    price: match ? Number(match[2]) : 0,
    currency: match ? match[1].toUpperCase() : 'ZAR',
    image_url: image,
    quantity: 1
  };
};

const animateProductToCart = (source) => {
  const target = document.querySelector('.sticky-cart-link, .cart-link');
  if (!source || !target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (!sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) return;

  const flyer = source.cloneNode(true);
  flyer.classList.add('cart-fly-animation');
  flyer.setAttribute('aria-hidden', 'true');
  flyer.removeAttribute('id');
  flyer.querySelectorAll?.('[id]').forEach((element) => element.removeAttribute('id'));
  flyer.style.left = sourceRect.left + 'px';
  flyer.style.top = sourceRect.top + 'px';
  flyer.style.width = sourceRect.width + 'px';
  flyer.style.height = sourceRect.height + 'px';
  flyer.style.setProperty('--cart-fly-x', (targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2)) + 'px');
  flyer.style.setProperty('--cart-fly-y', (targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2)) + 'px');
  document.body.appendChild(flyer);
  flyer.getBoundingClientRect();
  window.requestAnimationFrame(() => flyer.classList.add('is-flying'));
  window.setTimeout(() => flyer.remove(), 700);
};

window.animateProductToCart = animateProductToCart;

const initStickyCart = () => {
  if (document.querySelector('[data-sticky-cart]')) return;
  const root = document.createElement('div');
  root.dataset.stickyCart = '';
  root.innerHTML = '<a class="sticky-cart-link" href="cart.html" aria-label="Shopping cart, currently empty"><span class="sticky-cart-icon" aria-hidden="true">Cart</span><span>Cart</span><span class="sticky-cart-count">0</span></a>';
  document.body.appendChild(root);
};

const addToCart = (product) => {
  const cart = readCart();
  const existing = cart.find((item) => Number(item.product_id) === Number(product.product_id));
  if (existing) existing.quantity = Number(existing.quantity || 0) + 1;
  else cart.push(product);
  writeCart(cart);
  initStickyCart();
updateCartCount();
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-to-cart]');
  if (!button) return;
  const product = getProductFromCard(button);
  if (!product) return;
  addToCart(product);
  animateProductToCart(button.closest('.product-card')?.querySelector('.product-image img, .product-image') || button);
  const originalText = button.firstChild;
  if (originalText) originalText.textContent = 'Added to cart ';
  button.setAttribute('aria-label', `${product.name} added to cart`);
  window.setTimeout(() => {
    if (!button.isConnected) return;
    if (originalText) originalText.textContent = 'Add to cart ';
    button.setAttribute('aria-label', `Add ${product.name} to cart`);
  }, 1200);
});

updateCartCount();
