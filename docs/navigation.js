const navigation = document.getElementById('public-navigation');
const menuToggle = document.querySelector('.menu-toggle');
const header = navigation.closest('header');
const links = [...navigation.querySelectorAll('a[href^="#"]')];
const compact = matchMedia('(max-width: 850px)');
let menuOpen = false;
let scheduled = false;

function updateMenu() {
  menuToggle.hidden = navigation.hidden || !compact.matches;
  menuToggle.setAttribute('aria-expanded', String(menuOpen && !menuToggle.hidden));
  navigation.dataset.collapsed = String(compact.matches && !menuOpen);
}

function highlightSection() {
  scheduled = false;
  if (navigation.hidden) return;
  const threshold = header.offsetHeight + 36;
  const sections = links.map(link => ({link, section: document.getElementById(link.hash.slice(1))}))
    .filter(({section}) => section)
    .sort((a, b) => a.section.getBoundingClientRect().top - b.section.getBoundingClientRect().top);
  const current = sections.filter(({section}) => section.getBoundingClientRect().top <= threshold).at(-1);
  for (const link of links) {
    const active = link === current?.link;
    if (active && !link.hasAttribute('aria-current')) link.setAttribute('aria-current', 'location');
    if (!active && link.hasAttribute('aria-current')) link.removeAttribute('aria-current');
  }
}

function scheduleHighlight() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(highlightSection);
}

menuToggle.addEventListener('click', () => {
  menuOpen = !menuOpen;
  updateMenu();
});

// Route all public section links after the dynamically rendered homepage is ready.
// This also handles links from the hero, footer and service cards.
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const id = decodeURIComponent(link.hash.slice(1));
  if (!id) return;
  const section = document.getElementById(id);
  if (!section || section.closest('[hidden]')) return;
  event.preventDefault();
  if (section.matches('#services details')) section.open = true;
  if (menuOpen) { menuOpen = false; updateMenu(); }
  const destination = section.getBoundingClientRect().top + window.scrollY - header.getBoundingClientRect().height - 18;
  history.pushState(null, '', '#' + encodeURIComponent(id));
  window.scrollTo({top: Math.max(0, destination), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  section.setAttribute('tabindex', '-1');
  section.focus({preventScroll:true});
  scheduleHighlight();
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !menuOpen) return;
  menuOpen = false;
  updateMenu();
  menuToggle.focus();
});

compact.addEventListener('change', () => {
  menuOpen = false;
  updateMenu();
});

new MutationObserver(() => {
  menuOpen = false;
  updateMenu();
  scheduleHighlight();
}).observe(navigation, {attributes:true, attributeFilter:['hidden']});

new ResizeObserver(() => {
  document.documentElement.style.setProperty('--header-height', header.offsetHeight + 'px');
  scheduleHighlight();
}).observe(header);

window.addEventListener('scroll', scheduleHighlight, {passive:true});
window.addEventListener('hashchange', scheduleHighlight);
updateMenu();
scheduleHighlight();

const clientApp = document.getElementById('app');
clientApp.addEventListener('click', event => {
  const serviceLink = event.target.closest('a[data-topic]');
  if (!serviceLink) return;
  const topic = document.getElementById('sample-topic');
  topic.value = serviceLink.dataset.topic;
  document.getElementById('consultation-result').textContent = '';
});

clientApp.addEventListener('click', event => {
  if (event.target.closest('[data-dismiss-privacy]')) event.target.closest('.privacy-notice').hidden = true;
});

function openServiceFromHash() {
  const service = document.getElementById(location.hash.slice(1));
  if (service?.matches('#services details')) service.open = true;
}

clientApp.addEventListener('click', event => {
  const shortcut = event.target.closest('.premium-quick-links a[href^="#"]');
  if (!shortcut || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const service = document.getElementById(shortcut.hash.slice(1));
  if (service?.matches('#services details')) service.open = true;
});
window.addEventListener('hashchange', openServiceFromHash);
openServiceFromHash();

// Support direct links and browser back/forward, including after home() renders.
function restoreSectionPosition() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const section = document.getElementById(id);
  if (!section) return;
  if (section.matches('#services details')) section.open = true;
  window.scrollTo({top: Math.max(0, section.getBoundingClientRect().top + window.scrollY - header.offsetHeight - 18), behavior:'instant'});
  scheduleHighlight();
}
window.addEventListener('popstate', restoreSectionPosition);
window.addEventListener('load', restoreSectionPosition);
