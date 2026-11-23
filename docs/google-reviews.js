(() => {
  const target = document.getElementById('google-reviews-results');
  const status = document.getElementById('google-reviews-status');
  if (!target || !status) return;
  const make = (tag, text) => {
    const item = document.createElement(tag);
    item.textContent = text;
    return item;
  };
  async function load() {
    status.textContent = 'Loading Google reviews…';
    try {
      const response = await fetch('/api/reviews');
      if (!response.ok) throw new Error('Reviews unavailable');
      const data = await response.json();
      if (typeof data.rating !== 'number' || !Array.isArray(data.reviews)) throw new Error('Reviews unavailable');
      const grid = make('div', '');
      grid.className = 'google-review-grid';
      for (const review of data.reviews) {
        if (!review.authorAttribution?.displayName) continue;
        const card = make('article', '');
        card.append(make('h3', review.authorAttribution.displayName));
        card.append(make('p', review.rating + ' / 5 stars · ' + (review.relativePublishTimeDescription || 'Google review')));
        if (review.text?.text) card.append(make('blockquote', review.text.text));
        grid.append(card);
      }
      const count = Number(data.userRatingCount) || 0;
      target.replaceChildren(make('p', 'Google Maps · ' + data.rating.toFixed(1) + ' / 5 average · ' + count.toLocaleString('en-AU') + ' ratings'), grid);
      status.textContent = grid.childElementCount ? '' : 'No written reviews are currently available here.';
    } catch {
      status.textContent = 'Live reviews are currently unavailable on this page.';
    }
  }
  if (!window.IntersectionObserver) { load(); return; }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    load();
  }, {rootMargin:'240px'});
  observer.observe(status);
})();
