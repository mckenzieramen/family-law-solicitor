/* Presentation-only enhancement. Existing workflow owns records and actions. */
(() => {
  let query = '', limit = 5, expanded = false, timer;
  const findBoard = () => document.getElementById('case-follow-ups');
  function apply() {
    const board = findBoard(), toolbar = document.getElementById('followup-tools');
    if (!board || !toolbar) return;
    const groups = [...board.querySelectorAll('.follow-up-group')];
    let total = 0, visible = 0;
    groups.forEach(group => {
      const rows = [...group.querySelectorAll('.follow-up-row')];
      const matches = rows.filter(row => row.textContent.toLowerCase().includes(query));
      total += rows.length;
      visible += matches.length;
      rows.forEach(row => {
        row.hidden = !matches.includes(row) || (!expanded && matches.indexOf(row) >= limit);
      });
      let more = group.querySelector('.followup-more');
      if (!more) {
        more = document.createElement('button');
        more.type = 'button'; more.className = 'followup-more';
        more.addEventListener('click', () => { expanded = !expanded; apply(); });
        group.appendChild(more);
      }
      more.hidden = matches.length <= limit;
      more.textContent = expanded ? 'Show fewer' : 'Show all ' + matches.length + ' follow-ups';
      const empty = group.querySelector(':scope > p');
      if (empty) empty.hidden = rows.length > 0 && matches.length === 0;
      group.dataset.emptySearch = String(Boolean(query && matches.length === 0));
      if (query && matches.length) group.open = true;
    });
    const count = toolbar.querySelector('#followup-results');
    if (count) count.textContent = query ? visible + ' matching of ' + total + ' follow-ups' : total + ' open follow-ups';
  }
  function init() {
    const board = findBoard();
    if (!board || board.dataset.enhanced === 'yes') return;
    board.dataset.enhanced = 'yes';
    const tools = document.createElement('div');
    tools.id = 'followup-tools';
    tools.className = 'followup-tools';
    tools.innerHTML = '<label>Find a follow-up<input id="followup-search" type="search" placeholder="Search title, client or matter" autocomplete="off"></label><label>Items per group<select id="followup-limit"><option value="5">5</option><option value="10">10</option><option value="20">20</option></select></label><span id="followup-results" role="status" aria-live="polite"></span>';
    board.before(tools);
    tools.querySelector('#followup-search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); expanded = false; apply(); });
    tools.querySelector('#followup-limit').addEventListener('change', e => { limit = Number(e.target.value); expanded = false; apply(); });
    const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(apply, 0); });
    observer.observe(board, {childList:true});
    apply();
  }
  const watcher = new MutationObserver(init);
  watcher.observe(document.documentElement, {childList:true,subtree:true});
  init();
})();
