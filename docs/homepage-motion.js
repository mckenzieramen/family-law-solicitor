(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!window.IntersectionObserver || !Element.prototype.animate || motion.matches) return;
  const observer = new IntersectionObserver(entries => {
    for (const {target, isIntersecting} of entries) {
      if (!isIntersecting) continue;
      observer.unobserve(target);
      if (motion.matches || target.contains(document.activeElement) || target.matches(':target')) continue;
      target.animate(
        [{opacity: 0.72, transform: 'translateY(12px)'}, {opacity: 1, transform: 'translateY(0)'}],
        {duration: 540, easing: 'cubic-bezier(.22,.61,.36,1)'}
      );
    }
  }, {threshold: 0.12});
  for (const section of document.querySelectorAll('.client-home > .client-section, .client-home .client-band')) {
    if (section.getBoundingClientRect().top >= window.innerHeight) observer.observe(section);
  }
})();
