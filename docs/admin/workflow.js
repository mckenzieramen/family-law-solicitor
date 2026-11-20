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

const isNote = item => item.kind === 'Task' && item.title === 'Calendar note' &&
  Boolean(item.calendar) && !item.matter;
const calendarFor = item => item.calendar || (item.kind === 'Appointment' && item.matter ? 'client' : 'admin');

const appointmentColors = {Normal:'Plum', High:'Blue', Low:'Green', Urgent:'Amber'};
const appointmentColor = item => appointmentColors[item.priority] || appointmentColors.Normal;

function editorMarkup(id, title, fields, notesLabel, action, hidden = false) {
  return `<form id="${id}" class="work-form"${hidden ? ' hidden' : ''}>
   <h3 id="${id}-title">${title}</h3>
   <div class="work-fields">${fields}</div>
   <label>${notesLabel}<textarea name="notes" rows="5" maxlength="8000"></textarea></label>
   <button class="work-button" type="submit" disabled>${action}</button>
   <button type="button" data-cancel-editor${hidden ? '' : ' hidden'}>Cancel</button>
   <p role="status"></p>
  </form>`;
}

export function mountWorkflow(db, uid) {
  if (!root) return;
  clearWorkflow();
  const current = session;
  const items = collection(db, 'staffWorkspaces', uid, 'items');
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Australia/Sydney', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let records = [];
  let loaded = false;
  const matterField = '<label>Matter reference<input name="matter" maxlength="80"></label>';
  const calendarOptions = '<option value="admin">Admin Calendar</option><option value="client">Client Calendar</option>';
  root.innerHTML = `
 <p id="work-status" role="status">Loading work items…</p>
 <section class="workflow-panel" id="work-queue">
  <h2>Tasks &amp; deadlines</h2><p>Track client follow-ups, documents to request, and work for solicitor review.</p>
  ${editorMarkup('task-form', 'Create task', `
   <label>Task title<input name="title" maxlength="160" required></label>${matterField}
   <label>Due date (Sydney)<input name="date" type="date"></label>
   <label>Priority<select name="priority">${priorities.map(priority => `<option${priority === 'Normal' ? ' selected' : ''}>${priority}</option>`).join('')}</select></label>`,
   'Task notes', 'Save task')}
  <div class="legal-actions"><label>Show tasks<select id="legal-task-filter"><option value="open">Open</option><option value="today">Due today</option><option value="overdue">Overdue</option><option value="done">Completed</option></select></label></div><div id="work-priority-list"></div>
 </section>
 <section class="workflow-panel" id="work-calendar">
  <div class="calendar-toolbar"><div><h2 id="calendar-month-title">Calendar</h2><p class="calendar-description">Appointments and deadlines in Sydney time.</p></div><button type="button" class="work-button" data-create-schedule aria-haspopup="dialog" aria-controls="schedule-dialog">Add schedule</button></div>
  <dialog id="schedule-dialog" class="schedule-dialog" aria-labelledby="schedule-form-title">
  ${editorMarkup('schedule-form', 'Add schedule', `
   <label>Appointment title<input name="title" maxlength="160" required></label>${matterField}
   <label>Calendar<select name="calendar">${calendarOptions}</select></label>
   <label>Date (Sydney)<input name="date" type="date" required></label>
   <label>Time (Sydney)<input name="time" type="time"></label>
   <label>Calendar colour<select name="priority">${Object.entries(appointmentColors).map(([value,label]) =>
     `<option value="${value}">${label}</option>`).join('')}</select></label>`,
   'Appointment notes', 'Save schedule', true)}
  </dialog>
  <div class="month-controls"><label>Calendar<select id="work-calendar-scope">${calendarOptions}</select></label><label>Month <input id="work-month" type="month"></label><button type="button" id="work-show-month">Show whole month</button></div>
  <div id="work-month-grid"></div>
  <div class="calendar-note-actions"><button type="button" class="work-button" id="add-day-note">Add day note</button></div>
  <form id="day-note-form" class="work-form" hidden><h3>Add day note</h3><label>Date (Sydney)<input name="date" type="date" required></label><label>Note<textarea name="note" rows="3" maxlength="8000" required></textarea></label><button class="work-button" type="submit" disabled>Save note</button> <button type="button" id="cancel-day-note">Cancel</button><p role="status"></p></form>
  <div class="calendar-agenda"><h3 id="work-agenda-title">Scheduled items</h3><div id="work-agenda"></div></div>
 </section>
 <section class="workflow-panel" id="work-matters"><h2>Find a matter</h2><label>Search by matter reference<input id="work-matter-query" type="search"></label><div id="work-matter-list"></div></section>
 <section class="workflow-panel" id="work-email"><h2>Saved drafts</h2><p>Prepare and save client correspondence for review.</p><div class="legal-actions"><button class="work-button" type="button" data-new-draft="blank">New draft</button><button class="work-button" type="button" data-new-draft="followup">Draft client follow-up</button><button class="work-button" type="button" data-new-draft="documents">Draft document request</button></div>
  ${editorMarkup('draft-form', 'New email draft', `
   <label>Subject<input name="title" maxlength="160" required></label>
   <label>Recipient<input type="email" name="recipient" maxlength="254"></label>${matterField}`,
   'Email body', 'Save draft', true)}
  <div id="work-drafts"></div>
 </section>`;
  const find = selector => root.querySelector(selector);
  const status = find('#work-status');
  const month = find('#work-month');
  const scope = find('#work-calendar-scope');
  const editors = {
    Task: {form:find('#task-form'), title:'Create task', editTitle:'Edit task', saved:'Task saved.', view:'work-queue'},
    Appointment: {form:find('#schedule-form'), dialog:find('#schedule-dialog'), title:'Add schedule', editTitle:'Edit schedule', saved:'Schedule saved.', view:'work-calendar'},
    'Email draft': {form:find('#draft-form'), title:'New email draft', editTitle:'Edit email draft', saved:'Draft saved.', view:'work-email'},
    Note: {form:find('#day-note-form'), title:'Add day note', editTitle:'Edit day note', saved:'Day note saved.', view:'work-calendar'}
  };
  let selectedDay = '';
  month.value = today().slice(0,7);
  const calendarDate = () => selectedDay || (month.value && !today().startsWith(month.value) ? month.value + '-01' : today());
  const field = (editor, name) => editor.form.elements.namedItem(name);
  const submit = editor => editor.form.querySelector('[type="submit"]');
  const message = (editor, text) => { editor.form.querySelector('[role="status"]').textContent = text; };
  const navigate = view => root.dispatchEvent(new CustomEvent('workflow-view', {bubbles:true, detail:view}));
  function reset(editor, hide = true) {
    editor.id = null;
    editor.form.reset();
    editor.form.querySelector('h3').textContent = editor.title;
    if (hide && editor.dialog?.open) editor.dialog.close();
    editor.form.hidden = hide && editor !== editors.Task;
    const cancel = editor.form.querySelector('[data-cancel-editor]');
    if (cancel && editor === editors.Task) cancel.hidden = true;
    message(editor, '');
  }
  function open(editor, item, defaults = {}) {
    if (editor.saving) return;
    reset(editor, false);
    const values = item ? {...item, calendar:calendarFor(item), note:item.notes} : defaults;
    for (const [name, value] of Object.entries(values)) {
      const input = field(editor, name);
      if (input) input.value = value ?? '';
    }
    if (item) {
      editor.id = item.id;
      editor.calendar = calendarFor(item);
      editor.form.querySelector('h3').textContent = editor.editTitle;
      if (editor === editors.Task) editor.form.querySelector('[data-cancel-editor]').hidden = false;
    } else if (editor === editors.Note) editor.calendar = scope.value;
    if (editor.dialog && !editor.dialog.open) editor.dialog.showModal();
    editor.form.querySelector('input, textarea').focus();
  }
  const order = (a,b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority) || (a.date || '9999').localeCompare(b.date || '9999');
  function row(item) {
    const badge = isNote(item) ? 'Day note' : item.kind === 'Email draft' ? 'Draft' :
      item.done ? 'Completed' : item.date && item.date < today() ?
      (item.kind === 'Appointment' ? 'Past appointment' : 'Overdue') : item.kind === 'Appointment' ? 'Scheduled' : item.priority;
    const color = item.kind === 'Appointment' ? ` data-appointment-color="${appointmentColor(item)}"` : '';
    return `<details class="work-row"${color}><summary><strong>${escape(item.title)}</strong> <span class="status">${escape(badge)}</span><small>${escape([item.kind, item.matter, item.date, item.time && item.time + ' Sydney'].filter(Boolean).join(' · '))}</small></summary>
    ${item.recipient ? '<p>To: '+escape(item.recipient)+'</p>' : ''}
    ${item.notes ? '<p class="work-notes">'+escape(item.notes)+'</p>' : ''}
    <div class="work-actions"><button type="button" data-edit="${escape(item.id)}">Edit</button>${(item.kind === 'Email draft' || isNote(item)) ? '' : `<button type="button" data-toggle="${escape(item.id)}">${item.done?'Reopen':'Mark complete'}</button>`}<button type="button" data-remove="${escape(item.id)}">Delete</button></div></details>`;
  }
  const renderRows = (selector, entries, empty) => {
    const container = find(selector);
    const open = new Set([...container.querySelectorAll('details[open] [data-edit]')].map(button => button.dataset.edit));
    container.innerHTML = entries.map(row).join('') || '<p class="work-empty">'+empty+'</p>';
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
    const monthDate = new Date(Date.UTC(year, monthNumber - 1, 1));
    find('#calendar-month-title').textContent = new Intl.DateTimeFormat('en-AU', {
      month:'long', year:'numeric', timeZone:'UTC'
    }).format(monthDate);
    const matching = records.filter(item => item.date?.startsWith(month.value) && item.kind !== 'Email draft' &&
      calendarFor(item) === scope.value);
    const byDay = new Map();
    for (const item of matching) {
      if (!byDay.has(item.date)) byDay.set(item.date, []);
      byDay.get(item.date).push(item);
    }
    const first = (monthDate.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const cells = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => '<span class="month-weekday">'+day+'</span>');
    const spacer = '<span class="month-spacer" aria-hidden="true"></span>';
    for (let i = 0; i < first; i++) cells.push(spacer);
    for (let day = 1; day <= days; day++) {
      const key = month.value + '-' + String(day).padStart(2, '0');
      const items = byDay.get(key) || [];
      cells.push('<button type="button" class="month-day" data-calendar-day="'+key+'" aria-label="'+key+', '+items.length+' scheduled items" aria-pressed="'+(key===selectedDay)+'"'+(key===date?' aria-current="date"':'')+'><strong>'+day+'</strong>'+items.slice(0,2).map(item=>'<span class="calendar-event" data-event-type="'+(isNote(item) ? 'note' : item.kind === 'Appointment' ? 'appointment' : 'task')+'"'+(item.kind === 'Appointment' ? ' data-appointment-color="'+appointmentColor(item)+'"' : '')+'>'+escape([item.time, item.title].filter(Boolean).join(' '))+'</span>').join('')+(items.length>2?'<small>+'+(items.length-2)+' more</small>':'')+'</button>');
    }
    const trailing = (7 - (first + days) % 7) % 7;
    for (let i = 0; i < trailing; i++) cells.push(spacer);
    grid.innerHTML = cells.join('');
    find('#work-agenda-title').textContent = selectedDay ? new Intl.DateTimeFormat('en-AU', {weekday:'long', day:'numeric', month:'long', timeZone:'UTC'}).format(new Date(selectedDay+'T00:00:00Z')) : 'Scheduled items this month';
    renderRows('#work-agenda', matching.filter(item=>!selectedDay||item.date===selectedDay).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')||order(a,b)), loaded ? 'No appointments or deadlines in this calendar view.' : 'Scheduled items will appear here when the workspace connects.');
  }
  function render() {
    const query = find('#work-matter-query').value.trim().toLowerCase();
    const date = today();
    const tasks = records.filter(item => item.kind === 'Task' && !isNote(item));
    const overdue = item => !item.done && item.date && item.date < date;
    const filter = find('#legal-task-filter').value;
    renderRows('#work-priority-list', tasks.filter(item => filter === 'done' ? item.done : filter === 'overdue' ? overdue(item) : !item.done && (filter !== 'today' || item.date === date)).sort(order), 'No tasks in this view.');
    for (const [id, total] of [
      ['legal-open', tasks.filter(item => !item.done).length],
      ['legal-overdue', tasks.filter(overdue).length],
      ['legal-appointments', records.filter(item => item.kind === 'Appointment' && !item.done && item.date >= date).length]
    ]) {
      const metric = document.getElementById(id);
      if (metric) metric.textContent = total;
    }
    renderCalendar();

    const groups = new Map();
    for (const item of records) {
      const key = item.matter?.trim().toLowerCase();
      if (!key || !key.includes(query)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const matters = find('#work-matter-list');
    const expanded = new Set([...matters.querySelectorAll('[data-matter][open]')].map(group => group.dataset.matter));
    matters.innerHTML = [...groups.keys()].sort().map(key => {
      const entries = groups.get(key);
      const counts = ['Task', 'Appointment', 'Email draft'].map(kind => entries.filter(item => item.kind === kind).length);
      return `<details class="work-row matter-group" data-matter="${escape(key)}"${expanded.has(key) ? ' open' : ''}><summary><strong>${escape(entries[0].matter)}</strong><small>${counts[0]} tasks · ${counts[1]} appointments · ${counts[2]} drafts</small></summary>${entries.sort(order).map(row).join('')}</details>`;
    }).join('') || '<p class="work-empty">No matching work items with a matter reference.</p>';
    renderRows('#work-drafts', records.filter(x=>x.kind==='Email draft').sort(order), 'No drafts saved.');
  }
  renderCalendar();
  stop = onSnapshot(items, snapshot => {
    if (current !== session) return;
    records = snapshot.docs.map(record => ({...record.data(), id:record.id}));
    if (!loaded) status.textContent = '';
    loaded = true;
    for (const editor of Object.values(editors)) submit(editor).disabled = Boolean(editor.saving);
    render();
  }, () => {
    if (current !== session) return;
    loaded = false;
    for (const editor of Object.values(editors)) submit(editor).disabled = true;
    status.textContent = 'Work items could not load. Check your workspace access, then reload.';
  });
  const scheduleEditor = editors.Appointment;
  scheduleEditor.dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!scheduleEditor.saving) reset(scheduleEditor);
  });
  const noteEditor = editors.Note;
  const draftEditor = editors['Email draft'];
  function showNew(editor, defaults) {
    if (!editor.form.hidden) {
      editor.form.querySelector('input, textarea').focus();
      return;
    }
    open(editor, null, defaults);
  }
  find('[data-create-schedule]').addEventListener('click', () => showNew(scheduleEditor, {calendar:scope.value, date:calendarDate()}));
  find('#add-day-note').addEventListener('click', () => showNew(noteEditor, {date:calendarDate()}));
  find('#cancel-day-note').addEventListener('click', () => {
    if (noteEditor.saving) return;
    reset(noteEditor);
    find('#add-day-note').focus();
  });
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
  for (const [kind, editor] of Object.entries(editors)) {
    const cancel = editor.form.querySelector('[data-cancel-editor]');
    cancel?.addEventListener('click', () => {
      if (editor.saving) return;
      reset(editor);
      if (editor === scheduleEditor) find('[data-create-schedule]').focus();
      else if (editor === draftEditor) find('[data-new-draft="blank"]').focus();
      else field(editor, 'title').focus();
    });
    editor.form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!loaded || editor.saving) return;
      const values = new FormData(editor.form);
      const get = name => String(values.get(name) ?? '').trim();
      const note = editor === noteEditor;
      const title = note ? 'Calendar note' : get('title');
      const notes = get(note ? 'note' : 'notes');
      if (!title || (note && !notes)) {
        message(editor, note ? 'Enter a note.' : 'Enter a title.');
        return;
      }
      const previous = records.find(item => item.id === editor.id);
      if (editor.id && !previous) {
        message(editor, 'This item is no longer available.');
        return;
      }
      const data = {
        kind:note ? 'Task' : kind, title, notes, matter:get('matter'), date:get('date'),
        priority:get('priority') || previous?.priority || 'Normal', recipient:get('recipient'),
        done:previous?.done ?? false, updatedAt:serverTimestamp()
      };
      if (editor === scheduleEditor) Object.assign(data, {calendar:get('calendar'), time:get('time')});
      if (note) data.calendar = editor.calendar;
      editor.saving = true;
      submit(editor).disabled = true;
      status.textContent = '';
      message(editor, 'Saving…');
      try {
        if (previous) await updateDoc(doc(items, previous.id), data);
        else await addDoc(items, data);
        if (current !== session) return;
        reset(editor);
        status.textContent = editor.saved;
        if (note || editor === scheduleEditor) {
          month.value = data.date.slice(0,7);
          scope.value = data.calendar;
          selectedDay = data.date;
          renderCalendar();
          if (!root.closest('[data-view]') || root.closest('[data-view]').dataset.view === 'work-calendar') {
            find('[data-calendar-day="'+selectedDay+'"]')?.focus();
          }
        }
      } catch {
        if (current === session) message(editor, 'Could not save. Try again.');
      } finally {
        editor.saving = false;
        if (current === session) submit(editor).disabled = !loaded;
      }
    });
  }
  root.onclick = async event => {
    const draft = event.target.closest('[data-new-draft]');
    if (draft) {
      const template = draft.dataset.newDraft;
      const request = template === 'documents';
      const defaults = template === 'blank' ? {} : {
        title:request ? 'Request for outstanding documents' : 'Follow-up on your matter',
        notes:request
          ? 'Hi [Client name],\n\nCould you please provide the following documents through the agreed channel?\n\n[Document list and requested date]\n\nKind regards,\n[Your name]'
          : 'Hi [Client name],\n\nI’m following up on [matter or previous enquiry].\n\n[Update or next step]\n\nKind regards,\n[Your name]'
      };
      showNew(draftEditor, defaults);
      return;
    }
    const button = event.target.closest('[data-edit],[data-toggle],[data-remove]');
    if (!button || !loaded || current !== session) return;
    const item = records.find(x=>x.id===(button.dataset.edit || button.dataset.toggle || button.dataset.remove));
    if (!item) return;
    if (button.dataset.edit) {
      const editor = isNote(item) ? noteEditor : editors[item.kind];
      if (!editor || editor.saving) return;
      navigate(editor.view);
      if (editor.id === item.id && !editor.form.hidden) {
        editor.form.querySelector('input, textarea').focus();
        return;
      }
      const hasChanges = ['title', 'notes', 'note', 'matter', 'recipient'].some(name =>
        field(editor, name)?.value.trim());
      if (!editor.form.hidden && hasChanges && !window.confirm('Replace the unsaved form with this item?')) return;
      open(editor, item);
      return;
    }
    if (button.dataset.remove && !window.confirm('Delete this work item?')) return;
    button.disabled = true;
    try {
      const ref = doc(items, item.id);
      if (button.dataset.remove) {
        await deleteDoc(ref);
        if (current === session) {
          const editor = Object.values(editors).find(entry => entry.id === item.id);
          if (editor && !editor.saving) reset(editor);
        }
      } else await updateDoc(ref, {done:!item.done, updatedAt:serverTimestamp()});
    } catch {
      if (current === session) status.textContent = 'Could not update the work item.';
    } finally { button.disabled = false; }
  };
}
