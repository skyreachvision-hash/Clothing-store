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

const publicSettingsCacheKey = 'clothing-store-public-settings';

const applyPublicStoreSettings = (store = {}, socialLinks = []) => {
  const storeNameElements = document.querySelectorAll('[data-store-name]');
  const taglineElements = document.querySelectorAll('[data-store-tagline]');
  const descriptionElements = document.querySelectorAll('[data-store-description]');
  const secondaryDescriptionElements = document.querySelectorAll('[data-store-description-secondary]');
  const metaDescription = document.querySelector('[data-store-meta-description]');
  const socialLinkContainers = document.querySelectorAll('[data-social-links]');

  if (store.store_name) {
    storeNameElements.forEach((element) => {
      element.textContent = store.store_name;
    });
    document.title = `${store.store_name} | Make your mark`;
  }

  if (store.tagline) {
    taglineElements.forEach((element) => {
      element.textContent = store.tagline;
    });
  }

  if (store.description) {
    descriptionElements.forEach((element) => {
      element.textContent = store.description;
    });
    secondaryDescriptionElements.forEach((element) => {
      element.textContent = store.description;
    });
    if (metaDescription) metaDescription.setAttribute('content', store.description);
  }

  if (socialLinkContainers.length) {
    const links = Array.isArray(socialLinks) ? socialLinks.filter((link) => link?.url) : [];
    socialLinkContainers.forEach((container) => {
      container.innerHTML = links.map((link) => {
        const label = String(link.label || link.platform || 'Social link');
        const url = String(link.url || '');
        return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeAttribute(label)}</a>`;
      }).join('');
    });
  }
};

const readCachedPublicStoreSettings = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(publicSettingsCacheKey) || 'null');
    if (cached?.store) applyPublicStoreSettings(cached.store, cached.social_links || []);
  } catch {
    // Ignore unavailable or invalid local cache.
  }
};

const loadPublicStoreSettings = async () => {
  const hasPublicSettingsElements = document.querySelector('[data-store-name], [data-store-tagline], [data-store-description], [data-store-description-secondary], [data-social-links]');
  if (!hasPublicSettingsElements) return;

  readCachedPublicStoreSettings();

  try {
    const response = await fetch('/api/store-settings', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Settings request failed');
    const payload = await response.json();
    const store = payload?.data?.store || {};
    const socialLinks = payload?.data?.social_links || [];

    applyPublicStoreSettings(store, socialLinks);

    try {
      localStorage.setItem(publicSettingsCacheKey, JSON.stringify({ store, social_links: socialLinks }));
    } catch {
      // Continue normally if browser storage is unavailable.
    }
  } catch {
    // Keep cached or existing storefront copy if the public settings API is unavailable.
  }
};

loadPublicStoreSettings();

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

const escapeAttribute = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

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

const populateSettings = (store = {}) => {
  if (!settingsForm) return;
  ['store_name', 'logo_url', 'tagline', 'description', 'contact_email', 'contact_phone', 'whatsapp_url', 'address'].forEach((name) => {
    const field = settingsForm.elements.namedItem(name);
    if (field) field.value = store[name] || '';
  });
};

const collectSettings = () => {
  const data = {};
  ['store_name', 'logo_url', 'tagline', 'description', 'contact_email', 'contact_phone', 'whatsapp_url', 'address'].forEach((name) => {
    data[name] = String(settingsForm.elements.namedItem(name)?.value || '').trim();
  });
  data.social_links = supportedPlatforms.map(({ platform }) => ({
    platform,
    label: String(settingsForm.elements.namedItem(`social_label_${platform}`)?.value || '').trim(),
    url: String(settingsForm.elements.namedItem(`social_url_${platform}`)?.value || '').trim(),
    sort_order: Number(settingsForm.elements.namedItem(`social_order_${platform}`)?.value || 0),
    is_enabled: Boolean(settingsForm.elements.namedItem(`social_enabled_${platform}`)?.checked)
  }));
  return data;
};

if (settingsForm) {
  const saveButton = settingsForm.querySelector('button[type="submit"]');
  renderSocialLinks();
  fetch('/api/store-settings', { headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) throw new Error('Settings request failed');
      return response.json();
    })
    .then((payload) => {
      populateSettings(payload.data?.store || {});
      renderSocialLinks(payload.data?.social_links || []);
      if (saveButton) saveButton.disabled = false;
      setSettingsStatus('Current settings loaded. Changes are ready to save.');
    })
    .catch(() => setSettingsStatus('Unable to load settings. Check the API connection and try again.'));

  settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!window.getAdminIdToken) {
      setSettingsStatus('Your admin session is not ready. Please sign in again.');
      return;
    }

    const confirmed = window.confirm('Are you sure you want to update the store settings?');
    if (!confirmed) return;

    if (saveButton) saveButton.disabled = true;
    setSettingsStatus('Saving changes…');

    try {
      const idToken = await window.getAdminIdToken();
      const response = await fetch('/api/store-settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(collectSettings())
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Save failed');
      setSettingsStatus('Settings saved successfully.');
    } catch (error) {
      setSettingsStatus(error?.message === 'Authentication required.' ? 'Your admin session has expired. Please sign in again.' : 'Unable to save settings. Please try again.');
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  });
}
