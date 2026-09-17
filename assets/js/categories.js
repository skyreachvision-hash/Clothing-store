const grid = document.querySelector('[data-category-grid]');
const status = document.querySelector('[data-category-status]');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function categoryHref(category) {
  return `#shop?category=${encodeURIComponent(category.id)}`;
}

async function loadStoreCategories() {
  if (!grid) return;
  try {
    const response = await fetch('/api/categories', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load categories.');

    const categories = Array.isArray(payload.data) ? payload.data : [];
    const mainCategories = categories
      .filter((category) => Number(category.is_enabled) === 1 && Number(category.is_main_category) === 1 && Number(category.show_on_homepage) === 1)
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));

    grid.innerHTML = mainCategories.map((category, index) => {
      const number = String(index + 1).padStart(2, '0');
      return `<a class="category-card${index === 0 ? ' category-card-large' : ''}" href="${categoryHref(category)}" data-category-id="${escapeHtml(category.id)}">
        <span class="category-number">${number}</span>
        <span class="category-name">${escapeHtml(category.name)}</span>
        <span class="category-arrow" aria-hidden="true">↗</span>
      </a>`;
    }).join('');

    if (!mainCategories.length) {
      grid.innerHTML = '<p class="muted">No collections are currently featured.</p>';
    }
  } catch (error) {
    grid.innerHTML = '<p class="muted">Collections are temporarily unavailable.</p>';
    if (status) status.textContent = error.message;
  }
}

loadStoreCategories();
