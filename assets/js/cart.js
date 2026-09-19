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
  document.querySelectorAll('.cart-link').forEach((link) => {
    link.setAttribute('aria-label', `Shopping cart, currently containing ${quantity} ${quantity === 1 ? 'item' : 'items'}`);
  });
};

const getProductFromCard = (button) => {
  const card = button.closest('.product-card');
  if (!card) return null;
  const productId = Number(button.dataset.productId);
  const name = card.querySelector('.product-info h3 a, .product-info h2 a')?.textContent?.trim();
  const priceText = card.querySelector('.price')?.textContent?.trim() || '';
  const image = card.querySelector('[data-product-image], .product-image img')?.getAttribute('src')
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

const addToCart = (product) => {
  const cart = readCart();
  const existing = cart.find((item) => Number(item.product_id) === Number(product.product_id));
  if (existing) existing.quantity = Number(existing.quantity || 0) + 1;
  else cart.push(product);
  writeCart(cart);
  updateCartCount();
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-to-cart]');
  if (!button) return;
  const product = getProductFromCard(button);
  if (!product) return;
  addToCart(product);
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
