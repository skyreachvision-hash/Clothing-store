const categorySections = document.querySelector('[data-main-category-sections]');
const categoryStatus = document.querySelector('[data-category-status]');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}[character]));

const getPrimaryImage = (product) => {
  if (!Array.isArray(product?.images) || !product.images.length) return null;
  return product.images.find((image) => Number(image.is_primary) === 1)?.image_url
    || product.images[0]?.image_url
    || null;
};

const formatPrice = (product) => {
  const amount = Number(product?.price);
  const currency = String(product?.currency || 'ZAR').toUpperCase();
  return Number.isFinite(amount) ? `${escapeHtml(currency)} ${amount.toFixed(2)}` : `${escapeHtml(currency)} 0.00`;
};

const renderProductCard = (product) => {
  const imageUrl = getPrimaryImage(product);
  const imageContent = imageUrl
    ? `<span style="display:block;width:100%;height:100%;min-height:340px;background-image:url('${escapeHtml(imageUrl).replace(/'/g, '%27')}');background-size:cover;background-position:center;" aria-hidden="true"></span>`
    : '<span>No image</span>';
  const badge = product.status === 'active' && product.is_new ? '<span class="product-badge">New</span>' : '';

  return `<article class="product-card">
    <a class="product-image" href="#cart" aria-label="View ${escapeHtml(product.name)}">
      ${imageContent}${badge}
    </a>
    <div class="product-info">
      <div><p class="product-category">${escapeHtml(product.category_name || 'Uncategorized')}</p><h3><a href="#cart">${escapeHtml(product.name)}</a></h3></div>
      <strong class="price">${formatPrice(product)}</strong>
    </div>
    <button class="product-action" type="button">Add to bag <span aria-hidden="true">+</span></button>
  </article>`;
};

const sortByStoreOrder = (a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id);

async function loadMainCategoriesWithProducts() {
  if (!categorySections) return;

  try {
    const [categoryResponse, productResponse] = await Promise.all([
      fetch('/api/categories', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
      fetch('/api/products?limit=100', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    ]);

    const categoryPayload = await categoryResponse.json().catch(() => ({}));
    const productPayload = await productResponse.json().catch(() => ({}));
    if (!categoryResponse.ok || !categoryPayload.success) throw new Error(categoryPayload.error || 'Unable to load categories.');
    if (!productResponse.ok || !productPayload.success) throw new Error(productPayload.error || 'Unable to load products.');

    const categories = Array.isArray(categoryPayload.data) ? categoryPayload.data : [];
    const products = Array.isArray(productPayload.data?.products) ? productPayload.data.products : [];

    const mainCategories = categories
      .filter((category) => Number(category.is_enabled) === 1 && Number(category.is_main_category) === 1 && Number(category.show_on_homepage) === 1)
      .sort(sortByStoreOrder);

    const sections = mainCategories.map((mainCategory) => {
      const childIds = new Set(categories
        .filter((category) => Number(category.is_enabled) === 1 && Number(category.parent_id) === Number(mainCategory.id))
        .map((category) => Number(category.id)));
      const mainProducts = products.filter((product) => childIds.has(Number(product.category_id)));

      return `<section class="category-product-section" aria-labelledby="main-category-${escapeHtml(mainCategory.id)}">
        <div class="section-heading">
          <div><p class="eyebrow">Main category</p><h2 id="main-category-${escapeHtml(mainCategory.id)}">${escapeHtml(mainCategory.name)}</h2></div>
          <span class="muted">${mainProducts.length} ${mainProducts.length === 1 ? 'piece' : 'pieces'}</span>
        </div>
        ${mainProducts.length
          ? `<div class="product-grid">${mainProducts.map(renderProductCard).join('')}</div>`
          : '<p class="muted">No products are available in this category yet.</p>'}
      </section>`;
    });

    categorySections.innerHTML = sections.length
      ? sections.join('')
      : '<p class="muted">No main categories are currently featured.</p>';
  } catch (error) {
    categorySections.innerHTML = '<p class="muted">Store categories are temporarily unavailable.</p>';
    if (categoryStatus) categoryStatus.textContent = error?.message || 'Unable to load categories.';
  }
}

loadMainCategoriesWithProducts();
