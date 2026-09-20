const params = new URLSearchParams(window.location.search);
const productId = params.get('id');
const titleElement = document.querySelector('[data-product-title]');
const categoryElement = document.querySelector('[data-product-category]');
const priceElement = document.querySelector('[data-product-price]');
const descriptionElement = document.querySelector('[data-product-description]');
const mainImageElement = document.querySelector('[data-product-main-image]');
const thumbnailsElement = document.querySelector('[data-product-thumbnails]');
const statusElement = document.querySelector('[data-product-status]');
const addButton = document.querySelector('[data-add-to-cart]');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[character]));

const getImages = (product) => {
  if (!Array.isArray(product?.images)) return [];
  return [...product.images].sort((a,b) => Number(b.is_primary) - Number(a.is_primary) || Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));
};

const formatPrice = (product) => {
  const amount = Number(product?.price);
  const currency = String(product?.currency || 'ZAR').toUpperCase();
  return Number.isFinite(amount) ? currency + ' ' + amount.toFixed(2) : currency + ' 0.00';
};

function renderGallery(product) {
  const images = getImages(product);
  if (!images.length) {
    mainImageElement.hidden = true;
    mainImageElement.parentElement.innerHTML = '<div class="product-gallery-empty">No image available</div>';
    thumbnailsElement.innerHTML = '';
    return;
  }

  function showImage(index) {
    const image = images[index];
    mainImageElement.src = image.image_url;
    mainImageElement.alt = image.alt_text || product.name;
    thumbnailsElement.querySelectorAll('[data-gallery-index]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.galleryIndex) === index);
      button.setAttribute('aria-current', Number(button.dataset.galleryIndex) === index ? 'true' : 'false');
    });
  }

  mainImageElement.hidden = false;
  mainImageElement.src = images[0].image_url;
  mainImageElement.alt = images[0].alt_text || product.name;
  thumbnailsElement.innerHTML = images.map((image, index) => '<button class="product-gallery-thumb' + (index === 0 ? ' is-active' : '') + '" type="button" data-gallery-index="' + index + '" aria-label="View picture ' + (index + 1) + '" aria-current="' + (index === 0 ? 'true' : 'false') + '"><img src="' + escapeHtml(image.image_url) + '" alt=""></button>').join('');
  thumbnailsElement.querySelectorAll('[data-gallery-index]').forEach((button) => {
    button.addEventListener('click', () => showImage(Number(button.dataset.galleryIndex)));
  });
}

async function loadProduct() {
  if (!productId || !/^\d+$/.test(productId)) throw new Error('A valid product was not specified.');
  const response = await fetch('/api/products?id=' + encodeURIComponent(productId), { headers:{Accept:'application/json'}, cache:'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load product.');
  const products = Array.isArray(payload.data?.products) ? payload.data.products : [];
  const product = products.find((item) => String(item.id) === String(productId));
  if (!product) throw new Error('Product not found.');
  titleElement.textContent = product.name;
  categoryElement.textContent = product.category_name || 'Uncategorized';
  priceElement.textContent = formatPrice(product);
  descriptionElement.textContent = product.description || 'No description available.';
  if (addButton) {
    addButton.dataset.productId = product.id;
    addButton.setAttribute('aria-label', 'Add ' + product.name + ' to cart');
  }
  renderGallery(product);
  statusElement.textContent = product.track_stock && Number(product.stock_quantity) <= 0 ? 'Out of stock' : 'Available';
  if (product.track_stock && Number(product.stock_quantity) <= 0 && addButton) addButton.disabled = true;
  document.title = product.name + ' | Clothing Store';
}

loadProduct().catch((error) => {
  titleElement.textContent = 'Product unavailable';
  statusElement.textContent = error.message || 'Unable to load this product.';
  if (addButton) addButton.disabled = true;
});
