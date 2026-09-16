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

// Keeps the catalogue ready for progressive API batches without adding fake products.
const sentinel = document.querySelector('[data-catalogue-sentinel]');
if (sentinel && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) sentinel.classList.add('is-ready');
  }, { rootMargin: '240px' });
  observer.observe(sentinel);
}
