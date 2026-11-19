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
 <p id="work-status" role="status">Loading work items…</p>
 <section class="workflow-panel" id="work-queue">
  <h2>Tasks &amp; deadlines</h2><p>Track client follow-ups, documents to request, and work for solicitor review.</p>
  <form id="work-form" class="work-form">
   <h3 id="work-form-title">Add work item</h3>
   <div class="work-fields">
   <label>Type<select name="kind"><option>Task</option><option>Appointment</option><option>Email draft</option></select></label>
   <label>Title or email subject<input name="title" maxlength="160" required></label>
   <label>Matter reference<input name="matter" maxlength="80"></label>
   <label>Due or appointment date (Sydney)<input name="date" type="date"></label>
   <label id="schedule-scope" hidden>Calendar<select name="calendar"><option value="admin">Admin Calendar</option><option value="client">Client Calendar</option></select></label>
   <label id="schedule-time" hidden>Appointment time (Sydney)<input name="time" type="time"></label>
   <label>Priority<select name="priority"><option>Urgent</option><option>High</option><option selected>Normal</option><option>Low</option></select></label>
   <label id="work-recipient" hidden>Recipient<input type="email" name="recipient" maxlength="254"></label>
   </div><label>Notes or email body<textarea name="notes" rows="5" maxlength="8000"></textarea></label>
   <button class="work-button" id="work-save" disabled>Save work item</button>
   <button type="button" id="work-cancel" hidden>Cancel edit</button>
  </form>
  <div class="legal-actions"><label>Show tasks<select id="legal-task-filter"><option value="open">Open</option><option value="overdue">Overdue</option><option value="done">Completed</option></select></label></div><div id="work-priority-list"></div>
 </section>
 <section class="workflow-panel" id="work-calendar"><p class="calendar-description">Appointments and deadlines in Sydney time.</p><div class="month-controls"><label>Calendar<select id="work-calendar-scope"><option value="admin">Admin Calendar</option><option value="client">Client Calendar</option></select></label><label>Month <input id="work-month" type="month"></label><button type="button" id="work-show-month">Show whole month</button></div><p id="work-calendar-status" role="status"></p><div id="work-month-grid"></div><h3 id="work-agenda-title">Scheduled items</h3><div id="work-agenda"></div></section>
 <section class="workflow-panel" id="work-matters"><h2>Case activity</h2><p>Use the same matter reference on tasks, appointments and drafts to see related work here.</p><label>Search by matter reference<input id="work-matter-query" type="search"></label><div id="work-matter-list"></div></section>
 <section class="workflow-panel" id="work-email"><h2>Email drafts</h2><p>Prepare client correspondence for solicitor review.</p><div class="legal-actions"><button class="work-button" type="button" data-new-draft="followup">Draft client follow-up</button><button class="work-button" type="button" data-new-draft="documents">Draft document request</button></div><div id="work-drafts"></div></section>`;
  const find = selector => root.querySelector(selector);
  const status = find('#work-status');
  const form = find('#work-form');
  const field = name => form.elements.namedItem(name);
  const save = find('#work-save');
  const month = find('#work-month');
  const scope = find('#work-calendar-scope');
  let selectedDay = '';
  month.value = today().slice(0,7);
  const syncType = () => {
    const mail = field('kind').value === 'Email draft';
    find('#work-recipient').hidden = !mail;
    field('recipient').disabled = !mail;
    const appointment = field('kind').value === 'Appointment';
    field('date').required = appointment;
    find('#schedule-scope').hidden = !appointment;
    find('#schedule-time').hidden = !appointment;
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
    return `<details class="work-row"><summary><strong>${escape(item.title)}</strong> <span class="status">${escape(badge)}</span><small>${escape([item.kind, item.matter, item.date, item.time && item.time + ' Sydney'].filter(Boolean).join(' · '))}</small></summary>
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
  function renderCalendar() {
    const date = today();
    const [year, monthNumber] = month.value.split('-').map(Number);
    const grid = find('#work-month-grid');
    if (!year || !monthNumber) {
      grid.replaceChildren();
      renderRows('#work-agenda', [], 'Choose a month to see scheduled items.');
      return;
    }
    const matching = records.filter(item => item.date?.startsWith(month.value) && item.kind !== 'Email draft' &&
      (item.calendar || (item.kind === 'Appointment' && item.matter ? 'client' : 'admin')) === scope.value);
    const byDay = new Map();
    for (const item of matching) {
      if (!byDay.has(item.date)) byDay.set(item.date, []);
      byDay.get(item.date).push(item);
    }
    const first = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const cells = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => '<span class="month-weekday">'+day+'</span>');
    for (let i = 0; i < first; i++) cells.push('<span aria-hidden="true"></span>');
    for (let day = 1; day <= days; day++) {
      const key = month.value + '-' + String(day).padStart(2, '0');
      const items = byDay.get(key) || [];
      cells.push('<button type="button" class="month-day" data-calendar-day="'+key+'" aria-label="'+key+', '+items.length+' scheduled items" aria-pressed="'+(key===selectedDay)+'"'+(key===date?' aria-current="date"':'')+'><strong>'+day+'</strong>'+items.slice(0,2).map(item=>'<span>'+escape([item.time, item.title].filter(Boolean).join(' '))+'</span>').join('')+(items.length>2?'<small>+'+(items.length-2)+' more</small>':'')+'</button>');
    }
    grid.innerHTML = cells.join('');
    find('#work-agenda-title').textContent = selectedDay ? 'Scheduled items · '+selectedDay : 'Scheduled items this month';
    renderRows('#work-agenda', matching.filter(item=>!selectedDay||item.date===selectedDay).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')||order(a,b)), loaded ? 'No appointments or deadlines in this calendar view.' : 'Scheduled items will appear here when the workspace connects.');
  }
  function render() {
    const query = find('#work-matter-query').value.trim().toLowerCase();
    const date = today();
    const tasks = records.filter(item => item.kind === 'Task');
    const overdue = item => !item.done && item.date && item.date < date;
    const filter = find('#legal-task-filter').value;
    renderRows('#work-priority-list', tasks.filter(item => filter === 'done' ? item.done : filter === 'overdue' ? overdue(item) : !item.done).sort(order), 'No tasks in this view.');
    for (const [id, total] of [
      ['legal-open', tasks.filter(item => !item.done).length],
      ['legal-overdue', tasks.filter(overdue).length],
      ['legal-appointments', records.filter(item => item.kind === 'Appointment' && !item.done && item.date >= date).length]
    ]) {
      const metric = document.getElementById(id);
      if (metric) metric.textContent = total;
    }
    renderCalendar();

    renderRows('#work-matter-list', records.filter(x=>x.matter && x.matter.toLowerCase().includes(query)).sort(order), 'No matching work items with a matter reference.');
    renderRows('#work-drafts', records.filter(x=>x.kind==='Email draft').sort(order), 'No drafts saved.');
  }
  renderCalendar();
  stop = onSnapshot(items, snapshot => {
    if (current !== session) return;
    records = snapshot.docs.map(record => ({...record.data(), id:record.id}));
    if (!loaded) {
      status.textContent = '';
      find('#work-calendar-status').textContent = '';
    }
    loaded = true;
    save.disabled = saving;
    render();
  }, () => {
    if (current !== session) return;
    loaded = false;
    find('#work-calendar-status').textContent = '';
    save.disabled = true;
    status.textContent = 'Work items could not load. Publish the updated Firestore rules and reload this page.';
  });
  field('kind').addEventListener('change', syncType);
  month.addEventListener('change', () => { selectedDay = ''; render(); });
  scope.addEventListener('change', () => { selectedDay = ''; render(); });
  find('#work-show-month').addEventListener('click', () => { selectedDay = ''; renderCalendar(); });
  find('#work-month-grid').addEventListener('click', event => {
    const day = event.target.closest('[data-calendar-day]');
    if (!day) return;
    selectedDay = day.dataset.calendarDay;
    renderCalendar();
    find('[data-calendar-day="'+selectedDay+'"]').focus();
  });
  find('#legal-task-filter').addEventListener('change', render);
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
      const schedule = item.kind === 'Appointment' ? {calendar:field('calendar').value, time:field('time').value} : {};
      const data = {...item, ...schedule, done: previous?.done ?? false, updatedAt:serverTimestamp()};
      if (previous) await updateDoc(doc(items, previous.id), data);
      else await addDoc(items, data);
      if (current !== session) return;
      reset();
      status.textContent = 'Saved.';
      if (item.kind === 'Appointment') {
        month.value = item.date.slice(0,7);
        scope.value = schedule.calendar;
        selectedDay = item.date;
        renderCalendar();
        status.textContent = 'Schedule saved.';
        root.dispatchEvent(new Event('schedule-saved', {bubbles:true}));
      }
    } catch {
      if (current === session) status.textContent = 'Could not save the work item.';
    } finally {
      saving = false;
      if (current === session) save.disabled = !loaded;
    }
  });
  root.onclick = async event => {
    const draft = event.target.closest('[data-new-draft]');
    if (draft) {
      if (current !== session) return;
      if (editing || field('title').value.trim() || field('notes').value.trim()) {
        field('title').focus();
        return;
      }
      field('kind').value = 'Email draft';
      const request = draft.dataset.newDraft === 'documents';
      field('title').value = request ? 'Request for outstanding documents' : 'Follow-up on your matter';
      field('notes').value = request
        ? 'Hi [Client name],\n\nCould you please provide the following documents through the agreed channel?\n\n[Document list and requested date]\n\nKind regards,\n[Your name]'
        : 'Hi [Client name],\n\nI’m following up on [matter or previous enquiry].\n\n[Update or next step]\n\nKind regards,\n[Your name]';
      syncType();
      field('title').focus();
      return;
    }
    const button = event.target.closest('[data-edit],[data-toggle],[data-remove]');
    if (!button || !loaded || current !== session) return;
    const item = records.find(x=>x.id===(button.dataset.edit || button.dataset.toggle || button.dataset.remove));
    if (!item) return;
    if (button.dataset.edit) {
      editing = item.id;
      for (const name of ['kind','title','matter','date','priority','recipient','notes']) field(name).value = item[name] ?? '';
      find('#work-form-title').textContent = 'Edit work item';
      find('#work-cancel').hidden = false;
      field('calendar').value = item.calendar || (item.matter ? 'client' : 'admin');
      field('time').value = item.time || '';
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
