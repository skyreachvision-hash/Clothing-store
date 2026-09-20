const categorySections = document.querySelector('[data-main-category-sections]');
const categoryStatus = document.querySelector('[data-category-status]');
const subcategoryShowcase = document.querySelector('[data-subcategory-showcase]');
const subcategoryStatus = document.querySelector('[data-subcategory-status]');

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
    ? `<span data-product-image style="display:block;width:100%;height:100%;min-height:340px;background-image:url('${escapeHtml(imageUrl).replace(/'/g, '%27')}');background-size:cover;background-position:center;" aria-hidden="true"></span>`
    : '<span>No image</span>';
  const badge = product.status === 'active' && product.is_new ? '<span class="product-badge">New</span>' : '';

  return `<article class="product-card">
    <a class="product-image" href="/product.html?id=${encodeURIComponent(product.id)}" aria-label="View ${escapeHtml(product.name)}">
      ${imageContent}${badge}
    </a>
    <div class="product-info">
      <div><p class="product-category">${escapeHtml(product.category_name || 'Uncategorized')}</p><h3><a href="/product.html?id=${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a></h3></div>
      <strong class="price">${formatPrice(product)}</strong>
    </div>
    <button class="product-action" type="button" data-add-to-cart data-product-id="${escapeHtml(product.id)}" aria-label="Add ${escapeHtml(product.name)} to cart">Add to cart <span aria-hidden="true">+</span></button>
  </article>`;
};

const sortByStoreOrder = (a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id);

function renderSubcategoryShowcase(categories) {
  if (!subcategoryShowcase) return;

  const subcategories = categories
    .filter((category) =>
      Number(category.is_enabled) === 1 &&
      Number(category.is_main_category) !== 1 &&
      String(category.showcase_image_url || '').trim()
    )
    .sort(sortByStoreOrder);

  if (!subcategories.length) {
    subcategoryShowcase.innerHTML = '';
    if (subcategoryStatus) subcategoryStatus.hidden = true;
    return;
  }

  subcategoryShowcase.innerHTML = subcategories.map((subcategory) => {
    const imageUrl = String(subcategory.showcase_image_url).trim();
    const altText = String(subcategory.showcase_image_alt || subcategory.name).trim();
    const parentId = Number(subcategory.parent_id);
    const href = Number.isInteger(parentId) && parentId > 0
      ? `category.html?id=${encodeURIComponent(parentId)}&subcategory=${encodeURIComponent(subcategory.id)}`
      : '#categories';

    return `<a class="subcategory-showcase-card" href="${href}" aria-label="Shop ${escapeHtml(subcategory.name)}">
      <span class="subcategory-showcase-image"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(altText)}" loading="lazy"></span>
      <span class="subcategory-showcase-name">${escapeHtml(subcategory.name)}</span>
    </a>`;
  }).join('');
}

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
    const products = Array.isArray(productPayload.data?.products)
      ? productPayload.data.products
      : Array.isArray(productPayload.data)
        ? productPayload.data
        : [];

    renderSubcategoryShowcase(categories);

    const mainCategories = categories
      .filter((category) => Number(category.is_enabled) === 1 && Number(category.is_main_category) === 1)
      .sort(sortByStoreOrder);

    const sections = mainCategories.map((mainCategory) => {
      const subcategories = categories
        .filter((category) => Number(category.is_enabled) === 1 && Number(category.parent_id) === Number(mainCategory.id) && Number(category.is_main_category) !== 1)
        .sort(sortByStoreOrder);

      const subcategoryBlocks = subcategories.map((subcategory) => {
        const subcategoryProducts = products
          .filter((product) => Number(product.category_id) === Number(subcategory.id) && String(product.status || 'active').toLowerCase() === 'active')
          .slice(0, 4);

        return `<div class="category-product-section">
          <div class="section-heading">
            <div><p class="eyebrow">Subcategory</p><h3>${escapeHtml(subcategory.name)}</h3></div>
            <span class="muted">${subcategoryProducts.length} ${subcategoryProducts.length === 1 ? 'piece' : 'pieces'}</span>
          </div>
          ${subcategoryProducts.length
            ? `<div class="product-grid">${subcategoryProducts.map(renderProductCard).join('')}</div>`
            : '<p class="muted">No products are available in this subcategory yet.</p>'}
        </div>`;
      }).join('');

      return `<section aria-labelledby="main-category-${escapeHtml(mainCategory.id)}">
        <div class="section-heading">
          <div><p class="eyebrow">Main category</p><h2 id="main-category-${escapeHtml(mainCategory.id)}"><a href="category.html?id=${encodeURIComponent(mainCategory.id)}">${escapeHtml(mainCategory.name)}</a></h2></div>
          <span class="muted">${subcategories.length} ${subcategories.length === 1 ? 'subcategory' : 'subcategories'}</span>
        </div>
        ${subcategoryBlocks || '<p class="muted">No subcategories are available in this section yet.</p>'}
      </section>`;
    });

    categorySections.innerHTML = sections.length
      ? sections.join('')
      : '<p class="muted">No enabled main categories are currently configured.</p>';
  } catch (error) {
    categorySections.innerHTML = '<p class="muted">Store categories are temporarily unavailable.</p>';
    if (categoryStatus) categoryStatus.textContent = error?.message || 'Unable to load categories.';
    if (subcategoryStatus) subcategoryStatus.textContent = error?.message || 'Unable to load categories.';
  }
}

loadMainCategoriesWithProducts();
