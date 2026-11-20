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
    link.removeAttribute('aria-current');
    if (link === current?.link) link.setAttribute('aria-current', 'location');
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

navigation.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || !menuOpen) return;
  menuOpen = false;
  updateMenu();
  const section = document.getElementById(link.hash.slice(1));
  if (!section) return;
  section.setAttribute('tabindex', '-1');
  section.focus({preventScroll:true});
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
