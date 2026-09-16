const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#primary-navigation');
const searchPanel = document.querySelector('[data-search-panel]');
const searchToggle = document.querySelector('[data-search-toggle]');
const searchClose = document.querySelector('[data-search-close]');

if (menuToggle && navigation) {
  menuToggle.addEventListener('click', () => {
    const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!isOpen));
    navigation.classList.toggle('is-open', !isOpen);
  });
}

const setSearchOpen = (isOpen) => {
  if (!searchPanel) return;
  searchPanel.hidden = !isOpen;
  if (isOpen) document.querySelector('#site-search')?.focus();
};

searchToggle?.addEventListener('click', () => setSearchOpen(true));
searchClose?.addEventListener('click', () => setSearchOpen(false));

document.querySelectorAll('[data-current-year]').forEach((element) => {
  element.textContent = new Date().getFullYear();
});

const sentinel = document.querySelector('[data-catalogue-sentinel]');
if (sentinel && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) sentinel.classList.add('is-ready');
  }, { rootMargin: '240px' });
  observer.observe(sentinel);
}

const settingsForm = document.querySelector('[data-settings-form]');
const socialList = document.querySelector('[data-social-list]');
const settingsStatus = document.querySelector('[data-settings-status]');
const supportedPlatforms = [
  { platform: 'facebook', label: 'Facebook' },
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'tiktok', label: 'TikTok' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'whatsapp', label: 'WhatsApp' }
];

const setSettingsStatus = (message) => {
  if (settingsStatus) settingsStatus.textContent = message;
};

const renderSocialLinks = (links = []) => {
  if (!socialList) return;
  const configured = new Map(links.map((link) => [link.platform, link]));
  socialList.innerHTML = supportedPlatforms.map(({ platform, label }) => {
    const link = configured.get(platform) || {};
    return `<div class="social-row" data-platform="${platform}">
      <label class="social-toggle"><input type="checkbox" name="social_enabled_${platform}" ${Number(link.is_enabled) === 1 ? 'checked' : ''}><span class="toggle-box" aria-hidden="true"></span><span>${label}</span></label>
      <input name="social_label_${platform}" type="text" value="${escapeAttribute(link.label || label)}" placeholder="Display label" aria-label="${label} display label">
      <input name="social_url_${platform}" type="url" value="${escapeAttribute(link.url || '')}" placeholder="https://..." aria-label="${label} URL">
      <input name="social_order_${platform}" class="social-order" type="number" min="0" value="${Number.isFinite(Number(link.sort_order)) ? Number(link.sort_order) : 0}" aria-label="${label} display order">
    </div>`;
  }).join('');
};

const escapeAttribute = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

const populateSettings = (store = {}) => {
  if (!settingsForm) return;
  ['store_name', 'logo_url', 'tagline', 'description', 'contact_email', 'contact_phone', 'whatsapp_url', 'address'].forEach((name) => {
    const field = settingsForm.elements.namedItem(name);
    if (field) field.value = store[name] || '';
  });
};

if (settingsForm) {
  renderSocialLinks();
  fetch('/api/store-settings', { headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) throw new Error('Settings request failed');
      return response.json();
    })
    .then((payload) => {
      populateSettings(payload.data?.store || {});
      renderSocialLinks(payload.data?.social_links || []);
      setSettingsStatus('Current settings loaded. Saving will be enabled after authentication.');
    })
    .catch(() => setSettingsStatus('Unable to load settings. Check the API connection and try again.'));

  settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    setSettingsStatus('Saving is reserved for the authenticated admin flow.');
  });
}
