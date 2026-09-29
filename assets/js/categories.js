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

const groupColorPalette = [
  ['Black', '#111827'], ['White', '#f8fafc'], ['Red', '#dc2626'], ['Blue', '#2563eb'],
  ['Green', '#16a34a'], ['Yellow', '#eab308'], ['Orange', '#f97316'], ['Pink', '#ec4899'],
  ['Purple', '#9333ea'], ['Brown', '#92400e'], ['Grey', '#6b7280'], ['Beige', '#d6c3a5'],
  ['Navy', '#1e3a8a'], ['Maroon', '#7f1d1d'], ['Burgundy', '#800020'], ['Cream', '#fff7d6'],
  ['Khaki', '#c3b091'], ['Olive', '#808000'], ['Teal', '#0f766e'], ['Turquoise', '#14b8a6'],
  ['Gold', '#d4af37'], ['Silver', '#c0c0c0']
];
const getGroupColorHex = (value) =>
  groupColorPalette.find(([name]) => name.toLowerCase() === String(value || '').trim().toLowerCase())?.[1] || '#9ca3af';

const renderProductCard = (product) => {
  const imageUrl = getPrimaryImage(product);
  const imageContent = imageUrl
    ? `<span data-product-image style="display:block;width:100%;height:100%;min-height:340px;background-image:url('${escapeHtml(imageUrl).replace(/'/g, '%27')}');background-size:contain;background-position:center;background-repeat:no-repeat;" aria-hidden="true"></span>`
    : '<span>No image</span>';
  const badge = product.status === 'active' && product.is_new ? '<span class="product-badge">New</span>' : '';
  const related = Array.isArray(product.related_products) ? product.related_products : [];
  const isColorGroup = String(product.product_group_relationship_type || '').toLowerCase() === 'color';
  const colorOptions = isColorGroup
    ? [product, ...related].filter((item, index, array) => array.findIndex((candidate) => String(candidate.id) === String(item.id)) === index)
    : [];
  const colorSwatches = colorOptions.length > 1
    ? `<div class="product-color-options" aria-label="Available colours">
        <span class="product-color-label">Colour</span>
        <div class="product-color-swatches">
          ${colorOptions.map((item) => {
            const value = item.product_group_value || item.product_group_option_value || item.name;
            const active = String(item.id) === String(product.id);
            return `<a class="product-color-swatch${active ? ' is-active' : ''}" href="/product.html?id=${encodeURIComponent(item.id)}" aria-label="${escapeHtml(value)}" title="${escapeHtml(value)}" aria-current="${active ? 'true' : 'false'}" style="--swatch-color:${escapeHtml(getGroupColorHex(value))};"><span aria-hidden="true"></span></a>`;
          }).join('')}
        </div>
      </div>`
    : '';

  return `<article class="product-card">
    <a class="product-image" href="/product.html?id=${encodeURIComponent(product.id)}" aria-label="View ${escapeHtml(product.name)}">
      ${imageContent}${badge}
    </a>
    <div class="product-info">
      <div><p class="product-category">${escapeHtml(product.category_name || 'Uncategorized')}</p><h3><a href="/product.html?id=${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a></h3></div>
      <strong class="price">${formatPrice(product)}</strong>
    </div>
    ${colorSwatches}
    <div class="product-actions">
      <button class="product-action" type="button" data-add-to-cart data-product-id="${escapeHtml(product.id)}" aria-label="Add ${escapeHtml(product.name)} to cart">Add to cart <span aria-hidden="true">+</span></button>
      <button class="product-buy-now" type="button" data-buy-now data-product-id="${escapeHtml(product.id)}" aria-label="Buy ${escapeHtml(product.name)} now">Buy now <span aria-hidden="true">↗</span></button>
    </div>
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
          <a class="section-heading category-link-card" href="category.html?id=${encodeURIComponent(mainCategory.id)}&subcategory=${encodeURIComponent(subcategory.id)}" aria-label="Shop ${escapeHtml(subcategory.name)}">
            <div><p class="eyebrow">Subcategory</p><h3>${escapeHtml(subcategory.name)}</h3></div>
          </a>
          ${subcategoryProducts.length
            ? `<div class="product-grid">${subcategoryProducts.map(renderProductCard).join('')}</div>`
            : '<p class="muted">No products are available in this subcategory yet.</p>'}
        </div>`;
      }).join('');

      return `<section class="category-main-section" aria-labelledby="main-category-${escapeHtml(mainCategory.id)}">
        <a class="section-heading category-link-card" href="category.html?id=${encodeURIComponent(mainCategory.id)}" aria-labelledby="main-category-${escapeHtml(mainCategory.id)}">
          <div><p class="eyebrow">Main category</p><h2 id="main-category-${escapeHtml(mainCategory.id)}">${escapeHtml(mainCategory.name)}</h2></div>
        </a>
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
