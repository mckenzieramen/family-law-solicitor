import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

const root = document.getElementById('staff-workspace');
const priorities = ['Urgent', 'High', 'Normal', 'Low'];
let stop;
let session = 0;

export function clearWorkflow() {
  session++;
  stop?.();
  stop = undefined;
  if (root) { root.onclick = null; root.replaceChildren(); }
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

export function mountWorkflow(db, uid) {
  if (!root) return;
  clearWorkflow();
  const current = session;
  const items = collection(db, 'staffWorkspaces', uid, 'items');
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Australia/Sydney', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let records = [];
  let editing = null;
  let loaded = false;
  let saving = false;
  root.innerHTML = `
 <section class="workflow-panel" id="work-queue">
  <h2>Work priorities</h2><p id="work-status" role="status">Loading work items…</p>
  <form id="work-form" class="work-form">
   <h3 id="work-form-title">Add work item</h3>
   <div class="work-fields">
   <label>Type<select name="kind"><option>Task</option><option>Appointment</option><option>Email draft</option></select></label>
   <label>Title or email subject<input name="title" maxlength="160" required></label>
   <label>Matter reference<input name="matter" maxlength="80"></label>
   <label>Due or appointment date (Sydney)<input name="date" type="date"></label>
   <label>Priority<select name="priority"><option>Urgent</option><option>High</option><option selected>Normal</option><option>Low</option></select></label>
   <label id="work-recipient" hidden>Recipient<input type="email" name="recipient" maxlength="254"></label>
   </div><label>Notes or email body<textarea name="notes" rows="5" maxlength="8000"></textarea></label>
   <button class="work-button" id="work-save" disabled>Save work item</button>
   <button type="button" id="work-cancel" hidden>Cancel edit</button>
  </form>
  <div id="work-priority-list"></div>
 </section>
 <section class="workflow-panel" id="work-calendar"><h2>Calendar</h2><label>Month <input id="work-month" type="month"></label><div id="work-agenda"></div></section>
 <section class="workflow-panel" id="work-matters"><h2>Matter work</h2><label>Search by matter reference<input id="work-matter-query" type="search"></label><div id="work-matter-list"></div></section>
 <section class="workflow-panel" id="work-email"><h2>Email drafts</h2><p>Read or edit drafts saved here. Mailbox connection is pending.</p><div id="work-drafts"></div></section>`;
  const find = selector => root.querySelector(selector);
  const status = find('#work-status');
  const form = find('#work-form');
  const field = name => form.elements.namedItem(name);
  const save = find('#work-save');
  const month = find('#work-month');
  month.value = today().slice(0,7);
  const syncType = () => {
    const mail = field('kind').value === 'Email draft';
    find('#work-recipient').hidden = !mail;
    field('recipient').disabled = !mail;
    field('date').required = field('kind').value === 'Appointment';
  };
  const reset = () => {
    editing = null;
    form.reset();
    find('#work-form-title').textContent = 'Add work item';
    find('#work-cancel').hidden = true;
    syncType();
  };
  syncType();
  const order = (a,b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority) || (a.date || '9999').localeCompare(b.date || '9999');
  function row(item) {
    const badge = item.done ? 'Completed' : item.date && item.date < today() ? 'Overdue' : item.priority;
    return `<details class="work-row"><summary><strong>${escape(item.title)}</strong> <span class="status">${escape(badge)}</span><small>${escape([item.kind, item.matter, item.date].filter(Boolean).join(' · '))}</small></summary>
    ${item.recipient ? '<p>To: '+escape(item.recipient)+'</p>' : ''}
    ${item.notes ? '<p class="work-notes">'+escape(item.notes)+'</p>' : ''}
    <div class="work-actions"><button type="button" data-edit="${escape(item.id)}">Edit</button>${item.kind === 'Email draft' ? '' : `<button type="button" data-toggle="${escape(item.id)}">${item.done?'Reopen':'Mark complete'}</button>`}<button type="button" data-remove="${escape(item.id)}">Delete</button></div></details>`;
  }
  const renderRows = (selector, entries, empty) => {
    const container = find(selector);
    const open = new Set([...container.querySelectorAll('details[open] [data-edit]')].map(button => button.dataset.edit));
    container.innerHTML = entries.map(row).join('') || '<p>'+empty+'</p>';
    for (const button of container.querySelectorAll('[data-edit]')) if (open.has(button.dataset.edit)) button.closest('details').open = true;
  };
  function render() {
    const query = find('#work-matter-query').value.trim().toLowerCase();
    renderRows('#work-priority-list', records.filter(x=>!x.done && x.kind!=='Email draft').sort(order), 'No open work items.');
    renderRows('#work-agenda', records.filter(x=>x.date && x.date.startsWith(month.value) && x.kind!=='Email draft').sort((a,b)=>a.date.localeCompare(b.date)||order(a,b)), 'No appointments or deadlines in this month.');
    renderRows('#work-matter-list', records.filter(x=>x.matter && x.matter.toLowerCase().includes(query)).sort(order), 'No matching work items with a matter reference.');
    renderRows('#work-drafts', records.filter(x=>x.kind==='Email draft').sort(order), 'No drafts saved.');
  }
  stop = onSnapshot(items, snapshot => {
    if (current !== session) return;
    records = snapshot.docs.map(record => ({...record.data(), id:record.id}));
    if (!loaded) status.textContent = '';
    loaded = true;
    save.disabled = saving;
    render();
  }, () => {
    if (current !== session) return;
    loaded = false;
    save.disabled = true;
    status.textContent = 'Work items could not load. Publish the updated Firestore rules and reload this page.';
  });
  field('kind').addEventListener('change', syncType);
  month.addEventListener('change', render);
  find('#work-matter-query').addEventListener('input', render);
  find('#work-cancel').addEventListener('click', reset);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!loaded || saving || !field('title').value.trim()) return;
    const item = Object.fromEntries(['kind','title','matter','date','priority','recipient','notes'].map(name=>[name,field(name).value.trim()]));
    if (item.kind !== 'Email draft') item.recipient = '';
    const previous = records.find(x=>x.id===editing);
    if (editing && !previous) {
      status.textContent = 'This item is no longer available.';
      reset();
      return;
    }
    saving = true;
    save.disabled = true;
    try {
      const data = {...item, done: previous?.done ?? false, updatedAt:serverTimestamp()};
      if (previous) await updateDoc(doc(items, previous.id), data);
      else await addDoc(items, data);
      if (current !== session) return;
      reset();
      status.textContent = 'Saved.';
    } catch {
      if (current === session) status.textContent = 'Could not save the work item.';
    } finally {
      saving = false;
      if (current === session) save.disabled = !loaded;
    }
  });
  root.onclick = async event => {
    const button = event.target.closest('[data-edit],[data-toggle],[data-remove]');
    if (!button || !loaded || current !== session) return;
    const item = records.find(x=>x.id===(button.dataset.edit || button.dataset.toggle || button.dataset.remove));
    if (!item) return;
    if (button.dataset.edit) {
      editing = item.id;
      for (const name of ['kind','title','matter','date','priority','recipient','notes']) field(name).value = item[name] ?? '';
      find('#work-form-title').textContent = 'Edit work item';
      find('#work-cancel').hidden = false;
      syncType();
      field('title').focus();
      return;
    }
    if (button.dataset.remove && !window.confirm('Delete this work item?')) return;
    button.disabled = true;
    try {
      const ref = doc(items, item.id);
      if (button.dataset.remove) {
        await deleteDoc(ref);
        if (current === session && editing === item.id) reset();
      } else await updateDoc(ref, {done:!item.done, updatedAt:serverTimestamp()});
    } catch {
      if (current === session) status.textContent = 'Could not update the work item.';
    } finally { button.disabled = false; }
  };
}
