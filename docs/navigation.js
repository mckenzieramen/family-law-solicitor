const navigation = document.getElementById('public-navigation');
const menuToggle = document.querySelector('.menu-toggle');
const header = navigation.closest('header');
const links = [...navigation.querySelectorAll('a[href^="#"]')];
const compact = matchMedia('(max-width: 680px)');
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

clientApp.addEventListener('submit', event => {
  const form = event.target;
  if (form.id !== 'consultation-form') return;
  event.preventDefault();
  const topic = form.elements.topic.selectedOptions[0].textContent;
  document.getElementById('consultation-result').textContent =
    'Demo complete for ' + topic + '. No enquiry was sent.';
  form.reset();
});

clientApp.addEventListener('click', event => {
  const button = event.target.closest('[data-map-toggle]');
  if (!button) return;
  const container = document.getElementById('office-map-frame');
  const open = container.hidden;
  if (open) {
    const map = document.createElement('iframe');
    map.title = 'Google map showing Etheringtons Solicitors';
    map.referrerPolicy = 'no-referrer';
    map.src = 'https://maps.google.com/maps?q=Etheringtons%20Solicitors%2C%20North%20Sydney&ll=-33.837858,151.209414&z=17&output=embed';
    container.append(map);
  } else container.replaceChildren();
  container.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  button.textContent = open ? 'Hide Google map' : 'Load Google map';
});

clientApp.addEventListener('click', event => {
  if (event.target.closest('[data-dismiss-privacy]')) event.target.closest('.privacy-notice').hidden = true;
});
