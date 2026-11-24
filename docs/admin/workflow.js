import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

const root = document.getElementById('staff-workspace');
const templates = {
  "followup": {
    "type": "Email",
    "title": "Consultation follow-up",
    "description": "Check in after an initial consultation.",
    "notes": "Hi [Client name],\n\nThank you for meeting with us on [date]. I’m following up to share the next steps discussed with [solicitor name].\n\n[Insert agreed next steps and any dates.]\n\nPlease let me know if you have any questions.\n\nKind regards,\n[Your name]"
  },
  "documents": {
    "type": "Email",
    "title": "Request for outstanding documents",
    "description": "List what you need and when it is due.",
    "notes": "Hi [Client name],\n\nCould you please provide the following documents by [date]?\n\n[Document 1]\n[Document 2]\n\nPlease use [agreed secure channel] to send the documents. Let us know if you need more time.\n\nKind regards,\n[Your name]"
  },
  "confirmation": {
    "type": "Email",
    "title": "Appointment confirmation",
    "description": "Confirm an agreed appointment with the client.",
    "notes": "Hi [Client name],\n\nI’m writing to confirm your appointment with [solicitor name] on [date] at [time, Sydney time].\n\nLocation or meeting link: [details]\nPlease bring: [documents, if applicable]\n\nPlease let us know if you need to reschedule.\n\nKind regards,\n[Your name]"
  },
  "filenote": {
    "type": "Document",
    "title": "Client attendance note",
    "description": "Record the discussion, agreed actions and deadlines.",
    "notes": "CLIENT ATTENDANCE NOTE\n\nMatter reference: [reference]\nDate and time: [date and time]\nPrepared by: [name]\nAttendees: [names]\n\nPurpose of discussion\n[Purpose]\n\nKey points and client instructions\n[Notes]\n\nAgreed actions\n[Action — owner — due date]\n\nSolicitor review\n[Reviewer and date]"
  },
  "brief": {
    "type": "Document",
    "title": "Hearing preparation brief",
    "description": "Organise hearing details, documents and outstanding actions.",
    "notes": "HEARING PREPARATION BRIEF\n\nMatter reference: [reference]\nCourt and file number: [details]\nHearing date and time: [details]\nResponsible solicitor: [name]\n\nPurpose and current status\n[Summary for solicitor review]\n\nDocuments to compile\n[Document — date — status]\n\nOutstanding tasks\n[Action — owner — due date]\n\nReview and approval\n[Reviewer and date]"
  },
  "index": {
    "type": "Document",
    "title": "Matter document index",
    "description": "Track documents, versions and the location of each file.",
    "notes": "MATTER DOCUMENT INDEX\n\nMatter reference: [reference]\nPrepared by: [name]\nLast updated: [date]\n\nItem | Document | Date/version | File location | Status\n1 | [Document] | [Date/version] | [Path] | [Status]\n2 | [Document] | [Date/version] | [Path] | [Status]\n\nMissing documents and follow-up\n[Action — owner — due date]"
  }
};
const followUpStates = {
  client:'Waiting on client',
  solicitor:'Waiting on solicitor',
  review:'Ready for review'
};
const priorities = ['Urgent', 'High', 'Normal', 'Low'];
let stop;
let stopConsultations;
let session = 0;
const toast = document.getElementById('staff-toast');
let toastTimer;

function dismissToast() {
  clearTimeout(toastTimer);
  if (toast) toast.hidden = true;
}

toast?.querySelector('button').addEventListener('click', dismissToast);

function notify(title, detail, error = false) {
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.dataset.tone = error ? 'error' : 'success';
  toast.querySelector('.staff-toast-icon').textContent = error ? '!' : '✓';
  toast.hidden = false;
  document.getElementById('staff-toast-title').textContent = title;
  document.getElementById('staff-toast-message').textContent = detail;
  if (!error) toastTimer = setTimeout(dismissToast, 7000);
}

export function clearWorkflow() {
  dismissToast();
  session++;
  stop?.();
  stop = undefined;
  stopConsultations?.();
  stopConsultations = undefined;
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

export function mountWorkflow(db, uid, sampleMode = false) {
  if (!root) return;
  clearWorkflow();
  const current = session;
  const items = sampleMode ? null : collection(db, 'staffWorkspaces', uid, 'items');
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Australia/Sydney', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let records = [];
  let consultationRequests = [];
  let loaded = false;
  let consultationRequestsLoaded = sampleMode;
  let loadError = null;
  const matterField = '<label>Matter reference<input name="matter" maxlength="80"></label>';
  const calendarOptions = '<option value="admin">Admin Calendar</option><option value="client">Client Calendar</option>';
  root.innerHTML = `
 <section class="workflow-panel" id="work-templates">
  <div class="admin-section-heading"><h2>Email and document templates</h2></div>
  <p>Choose a template to prefill a draft, then replace the bracketed details.</p>
  <div class="template-layout"><div class="staff-template-grid" aria-label="Available templates">
   ${Object.entries(templates).map(([key, template]) => `<article class="staff-template-card">
    <span>${template.type}</span><h3>${template.title}</h3><p>${template.description}</p>
    <button class="work-button" type="button" data-preview-template="${key}" aria-pressed="false" aria-controls="template-preview">Preview</button>
   </article>`).join('')}
  </div>
  <section class="template-preview" id="template-preview" aria-labelledby="template-preview-title">
   <header><p id="template-preview-type"></p><h3 id="template-preview-title" tabindex="-1"></h3></header>
   <dl id="template-email-meta"><div><dt>To</dt><dd>[Client email]</dd></div><div><dt>Subject</dt><dd id="template-preview-subject"></dd></div></dl>
   <div id="template-preview-text" class="template-preview-body"></div>
   <footer><button class="work-button" type="button" id="apply-template">Use template</button></footer>
  </section></div>
  <form class="work-form" id="document-template-editor" hidden>
   <h3>Edit document draft</h3>
   <label>Title<input name="title" maxlength="160" required></label>
   <label>Document text<textarea name="notes" rows="14" required></textarea></label>
   <button class="work-button" type="submit">Download text file</button>
   <button type="button" id="close-document-template">Close draft</button>
  </form>
 </section>
 <dialog id="task-dialog" class="schedule-dialog task-dialog" aria-labelledby="task-form-title">
 ${editorMarkup('task-form', 'Create task', `
   <label>Task title<input name="title" maxlength="160" required></label>${matterField}
   <label>Due or follow-up date (Sydney)<input name="date" type="date"></label>
   <label>Follow-up status<select name="followUpStatus"><option value="">Regular task</option>${Object.entries(followUpStates).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
   <label>Priority<select name="priority">${priorities.map(priority => `<option${priority === 'Normal' ? ' selected' : ''}>${priority}</option>`).join('')}</select></label>`,
   'Task notes', 'Save task', true)}
 </dialog>
 <dialog id="work-delete-dialog" class="schedule-dialog work-delete-dialog" aria-labelledby="work-delete-title" aria-describedby="work-delete-description">
  <form id="work-delete-form">
   <div class="work-delete-content">
    <span class="work-delete-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg></span>
    <h3 id="work-delete-title">Delete this item?</h3>
    <p id="work-delete-name"></p>
    <p id="work-delete-description">This will permanently remove the item from the workspace.</p>
    <p id="work-delete-status" role="status"></p>
   </div>
   <div class="work-delete-actions"><button type="button" id="work-delete-cancel" autofocus>Cancel</button><button type="submit" id="work-delete-confirm">Delete item</button></div>
  </form>
 </dialog>
 <p id="work-status" role="status">Loading work items…</p>
 <section class="workflow-panel" id="work-queue">
  <div class="admin-section-heading"><h2>Tasks &amp; deadlines</h2><button class="work-button" type="button" id="new-work-task">Add task</button></div>
    <div class="legal-actions"><label>Search tasks<input id="work-task-search" type="search" placeholder="Title or matter reference"></label><label>Show tasks<select id="legal-task-filter"><option value="open">Open</option><option value="today">Due today</option><option value="overdue">Overdue</option><option value="unscheduled">Without due date</option><option value="done">Completed</option></select></label><label>Priority<select id="work-task-priority"><option value="">All priorities</option>${priorities.map(priority => `<option>${priority}</option>`).join('')}</select></label></div><p class="work-result-count" id="work-task-count" role="status"></p><div id="work-priority-list"></div>
 </section>
 <section class="workflow-panel" id="work-calendar">
  <div class="calendar-toolbar"><div><h2 id="calendar-month-title">Calendar</h2><p class="calendar-description">Appointments, deadlines and pending consultation requests in Sydney time.</p></div><button type="button" class="work-button" data-create-schedule aria-haspopup="dialog" aria-controls="schedule-dialog">Add schedule</button></div>
  <dialog id="schedule-dialog" class="schedule-dialog" aria-labelledby="schedule-form-title">
  ${editorMarkup('schedule-form', 'Add schedule', `
   <label>Appointment title<input name="title" maxlength="160" required></label>${matterField}
   <label>Calendar<select name="calendar">${calendarOptions}</select></label>
   <label>Date (Sydney)<input name="date" type="date" required></label>
   <label>Time (Sydney)<input name="time" type="time"></label>
   <label>Calendar colour<select name="priority">${Object.entries(appointmentColors).map(([value,label]) =>
     `<option value="${value}">${label}</option>`).join('')}</select></label>`,
   'Appointment notes', 'Save schedule', true)}
  <button type="button" id="retry-calendar-access" hidden>Retry calendar connection</button>
  </dialog>
  <div class="month-controls"><label>Calendar<select id="work-calendar-scope">${calendarOptions}</select></label><div class="calendar-month-nav"><button type="button" data-month-step="-1" aria-label="Previous month">‹</button><label>Month <input id="work-month" type="month"></label><button type="button" data-month-step="1" aria-label="Next month">›</button></div><button type="button" id="work-calendar-today">Today</button><button type="button" id="work-show-month">Show whole month</button></div>
  <p class="consultation-calendar-status" id="consultation-calendar-status" role="status">Checking for pending consultation requests…</p>
  <div class="calendar-split"><div><div id="work-month-grid"></div>
  <div class="calendar-note-actions"><button type="button" class="work-button" id="add-day-note">Add day note</button></div>
  <form id="day-note-form" class="work-form" hidden><h3>Add day note</h3><label>Date (Sydney)<input name="date" type="date" required></label><label>Note<textarea name="note" rows="3" maxlength="8000" required></textarea></label><button class="work-button" type="submit" disabled>Save note</button> <button type="button" id="cancel-day-note">Cancel</button><p role="status"></p></form>
  </div><div class="calendar-agenda"><h3 id="work-agenda-title">Scheduled items</h3><div id="work-agenda"></div></div></div>
 </section>
 <section class="workflow-panel" id="work-matters"><div class="admin-section-heading"><h2>Matter activity</h2><button type="button" class="work-button" id="new-follow-up">Add follow-up</button></div>
  <section id="case-follow-ups" aria-label="Open follow-ups"></section>
  <div class="legal-actions">
   <label>Search matters<input id="work-matter-query" type="search" placeholder="Matter reference or item title"></label>
   <label>Show<select id="work-matter-kind"><option value="">All work items</option><option>Task</option><option>Appointment</option><option>Email draft</option></select></label>
   <label>Sort matters<select id="work-matter-sort"><option value="reference">Reference A–Z</option><option value="activity">Most recent activity</option></select></label>
  </div>
  <p id="work-matter-count" role="status"></p><div class="matter-split"><div id="work-matter-list"></div><section id="work-matter-detail" aria-label="Selected matter"></section></div></section>
 <section class="workflow-panel" id="work-email">
  <header class="draft-toolbar">
   <div><h2>Correspondence</h2><p>Prepare and review client emails.</p></div>
   <button class="work-button" type="button" data-new-draft="blank">New draft</button>
  </header>
  <div class="draft-layout">
   <aside class="draft-library" aria-label="Draft library">
    <h3>Saved drafts</h3>
    <label>Search drafts<input id="work-draft-search" type="search" placeholder="Subject, recipient or matter"></label>
    <p class="work-result-count" id="work-draft-count" role="status"></p>
    <div id="work-drafts"><p class="work-empty">Connecting to your saved drafts…</p></div>
    <h3>Templates</h3>
    <button type="button" data-new-draft="followup">Client follow-up</button>
    <button type="button" data-new-draft="documents">Document request</button>
   </aside>
   <div class="draft-reading">
    <article id="draft-sample" class="draft-example">
     <span class="draft-example-tag">Sample draft</span>
     <h3>Following up on your consultation</h3>
     <dl><div><dt>To</dt><dd>avery@example.com</dd></div><div><dt>Matter</dt><dd>Sample FL-1024</dd></div></dl>
     <div class="draft-example-body">
      <p>Hi Avery,</p>
      <p>Thank you for meeting with us. I’m writing to check whether you have any questions about the next steps we discussed.</p>
      <p>If you’d like to arrange a follow-up appointment, please let us know which days and times work for you.</p>
      <p>Kind regards,<br>Family Law Team</p>
     </div>
     <button type="button" data-new-draft="followup">Use follow-up template</button>
    </article>
  ${editorMarkup('draft-form', 'New email draft', `
   <label>Subject<input name="title" maxlength="160" required></label>
   <label>Recipient<input type="email" name="recipient" maxlength="254"></label>${matterField}`,
   'Email body', 'Save draft', true).replace('<p role="status">', '<button type="button" id="copy-draft-body">Copy text</button><p role="status">')}
   </div>
  </div>
 </section>`;
  root.insertAdjacentHTML('beforeend', '<dialog id="calendar-day-dialog" class="schedule-dialog calendar-day-dialog" aria-labelledby="calendar-day-title"><header class="calendar-day-dialog-head"><div><p>Calendar details</p><h2 id="calendar-day-title"></h2><span id="calendar-day-subtitle"></span></div><button type="button" data-close-calendar-day aria-label="Close day details">×</button></header><div id="calendar-day-items" class="calendar-day-items"></div><footer><button type="button" class="work-button" id="calendar-day-add-schedule">Add schedule on this date</button><button type="button" data-close-calendar-day>Close</button></footer></dialog>');
  const find = selector => root.querySelector(selector);
  const status = find('#work-status');
  const sampleDraft = find('#draft-sample');
  const retryCalendar = find('#retry-calendar-access');
  const month = find('#work-month');
  const scope = find('#work-calendar-scope');
  const agenda = document.getElementById('overview-agenda-items');
  const upcoming = document.getElementById('overview-upcoming-items');
  const editors = {
    Task: {form:find('#task-form'), dialog:find('#task-dialog'), title:'Create task', editTitle:'Edit task', saved:'Task saved.', view:'work-queue'},
    Appointment: {form:find('#schedule-form'), dialog:find('#schedule-dialog'), title:'Add schedule', editTitle:'Edit schedule', saved:'Schedule saved.', view:'work-calendar'},
    'Email draft': {form:find('#draft-form'), title:'New email draft', editTitle:'Edit email draft', saved:'Draft saved.', view:'work-email'},
    Note: {form:find('#day-note-form'), title:'Add day note', editTitle:'Edit day note', saved:'Day note saved.', view:'work-calendar'}
  };
  let selectedDay = '';
  let selectedMatter;
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
    editor.form.hidden = hide;
    if (editor === editors['Email draft']) sampleDraft.hidden = !editor.form.hidden;
    const cancel = editor.form.querySelector('[data-cancel-editor]');
    if (cancel && editor === editors.Task) cancel.hidden = false;
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
    if (editor.dialog && !loaded) message(editor, loadError || 'Connecting to the workspace…');
    editor.form.querySelector('input, textarea').focus();
  }
  const order = (a,b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority) || (a.date || '9999').localeCompare(b.date || '9999');
  function row(item) {
    if (item.kind === 'Consultation request') {
      const contact = item.contact || {};
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Consultation inquiry';
      return `<details class="work-row consultation-request-row" data-consultation-date="${escape(item.date)}">
        <summary><strong>${escape(name)}</strong> <span class="status">Pending confirmation</span>
        <small>Consultation request · ${escape(item.date)} · ${escape(item.time || 'Time not set')} Sydney</small></summary>
        <dl class="consultation-request-details">
          <div><dt>Email</dt><dd>${contact.email ? '<a href="mailto:'+escape(contact.email)+'">'+escape(contact.email)+'</a>' : 'Not provided'}</dd></div>
          <div><dt>Phone</dt><dd>${escape(contact.phone || 'Not provided')}</dd></div>
          <div><dt>Topic</dt><dd>${escape(contact.topic || 'Not provided')}</dd></div>
          <div><dt>New client</dt><dd>${escape(contact.newClient || 'Not provided')}</dd></div>
        </dl>
        <p class="work-notes"><strong>Brief summary</strong><br>${escape(item.notes || 'No summary provided.')}</p>
        <a class="consultation-request-link" href="#staff-inbox">Open Client Messages</a>
      </details>`;
    }
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
    const scheduledItems = records.filter(item => item.date?.startsWith(month.value) && item.kind !== 'Email draft' &&
      calendarFor(item) === scope.value);
    const requestedItems = scope.value === 'admin' ? consultationRequests.filter(item => item.date?.startsWith(month.value)) : [];
    const matching = [...scheduledItems, ...requestedItems];
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
      cells.push('<button type="button" class="month-day" data-calendar-day="'+key+'" aria-label="'+key+', '+items.length+' scheduled items" aria-pressed="'+(key===selectedDay)+'"'+(key===date?' aria-current="date"':'')+'><strong>'+day+'</strong>'+items.slice(0,2).map(item=>'<span class="calendar-event" data-event-type="'+(item.kind === 'Consultation request' ? 'consultation' : isNote(item) ? 'note' : item.kind === 'Appointment' ? 'appointment' : 'task')+'"'+(item.kind === 'Appointment' ? ' data-appointment-color="'+appointmentColor(item)+'"' : '')+'>'+escape([item.time, item.title].filter(Boolean).join(' '))+'</span>').join('')+(items.length>2?'<small>+'+(items.length-2)+' more</small>':'')+'</button>');
    }
    const trailing = (7 - (first + days) % 7) % 7;
    for (let i = 0; i < trailing; i++) cells.push(spacer);
    grid.innerHTML = cells.join('');
    find('#work-agenda-title').textContent = selectedDay ? new Intl.DateTimeFormat('en-AU', {weekday:'long', day:'numeric', month:'long', timeZone:'UTC'}).format(new Date(selectedDay+'T00:00:00Z')) : 'Scheduled items this month';
    const emptyMessage = scope.value === 'admin' && !consultationRequestsLoaded
      ? 'Checking for consultation requests…'
      : scope.value === 'admin' && consultationRequests.length && !requestedItems.length
        ? 'No appointments or consultation requests in this calendar view.'
        : loaded ? 'No appointments, consultation requests or deadlines in this calendar view.' : 'Scheduled items will appear here when the workspace connects.';
    const agendaItems = matching.filter(item => item.kind !== 'Consultation request' && (!selectedDay || item.date === selectedDay))
      .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')||order(a,b));
    const agendaEmpty = selectedDay && requestedItems.some(item => item.date === selectedDay)
      ? 'Consultation request shown in blue on the calendar. Select the date to review it.'
      : emptyMessage;
    renderRows('#work-agenda', agendaItems, agendaEmpty);
    const requestStatus = find('#consultation-calendar-status');
    const displayedRequests = requestedItems.filter(item => !selectedDay || item.date === selectedDay).length;
    if (requestStatus) requestStatus.textContent = consultationRequestsLoaded
      ? (displayedRequests ? displayedRequests + ' pending consultation request' + (displayedRequests === 1 ? '' : 's') + ' shown in this calendar view.' : 'No pending consultation requests in this calendar view.')
      : 'Checking for pending consultation requests…';
  }
  function render() {
    const date = today();
    const tasks = records.filter(item => item.kind === 'Task' && !isNote(item));
    const overdue = item => !item.done && item.date && item.date < date;
    const filter = find('#legal-task-filter').value;
    const taskQuery = find('#work-task-search').value.trim().toLowerCase();
    const priority = find('#work-task-priority').value;
    const matchingTasks = tasks.filter(item => {
      const matchesView = filter === 'done' ? item.done : !item.done &&
        (filter !== 'today' || item.date === date) &&
        (filter !== 'overdue' || overdue(item)) &&
        (filter !== 'unscheduled' || !item.date);
      return matchesView && (!priority || item.priority === priority) &&
        [item.title, item.matter].join(' ').toLowerCase().includes(taskQuery);
    }).sort(order);
    find('#work-task-count').textContent = loaded ? `${matchingTasks.length} of ${tasks.length} tasks` : '';
    const taskList = find('#work-priority-list');
    taskList.innerHTML = matchingTasks.length ? `<div class="staff-table-scroll"><table class="staff-task-table">
      <thead><tr><th scope="col">Task</th><th scope="col">Matter</th><th scope="col">Priority</th><th scope="col">Due date</th><th scope="col">Actions</th></tr></thead>
      <tbody>${matchingTasks.map(item => `<tr><td><strong>${escape(item.title)}</strong><small>${item.done ? 'Completed' : overdue(item) ? 'Overdue' : 'Open'}</small></td><td>${escape(item.matter || '—')}</td><td><span class="task-priority" data-priority="${escape(item.priority)}">${escape(item.priority)}</span></td><td>${escape(item.date || '—')}</td><td><div class="work-actions"><button type="button" data-edit="${escape(item.id)}">Edit</button><button type="button" data-toggle="${escape(item.id)}">${item.done ? 'Reopen' : 'Complete'}</button><button type="button" data-remove="${escape(item.id)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>` :
      `<p class="work-empty">${escape(loaded ? 'No tasks match this view.' : (loadError || 'Loading tasks…'))}</p>`;
    for (const [id, total] of [
      ['legal-today', records.filter(item => item.kind === 'Appointment' && !item.done && item.date === date).length],
      ['legal-overdue', tasks.filter(overdue).length]
    ]) {
      const metric = document.getElementById(id);
      if (metric) metric.textContent = total;
    }
    renderFollowUps(tasks, date);
    const attention = document.getElementById('overview-task-attention');
    if (attention) {
      const due = tasks.filter(item => overdue(item) && !item.followUpStatus).sort(order).slice(0, 3);
      attention.innerHTML = due.map(item => `<a href="#work-queue" data-task-filter="overdue"><strong>${escape(item.title)}</strong><span>Overdue</span></a>`).join('') || '<p>No overdue tasks.</p>';
    }
    if (agenda) {
      const appointments = records.filter(item => item.kind === 'Appointment' && !item.done && item.date === date)
        .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
      agenda.innerHTML = appointments.map(item =>
        `<div class="overview-agenda-row" data-appointment-color="${appointmentColor(item)}"><time>${escape(item.time || 'Any time')}</time><strong>${escape(item.title)}</strong><small>${escape(item.matter || (calendarFor(item) === 'client' ? 'Client Calendar' : 'Admin Calendar'))}</small></div>`
      ).join('') || '<p>No appointments today in Sydney.</p>';
    }
    if (upcoming && loaded) {
      const next = records.filter(item => item.kind === 'Appointment' && !item.done && item.date > date && Number.isFinite(Date.parse(item.date + 'T00:00:00Z')))
        .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99'))
        .slice(0, 5);
      const formatDate = new Intl.DateTimeFormat('en-AU', {weekday:'short', day:'numeric', month:'short', timeZone:'UTC'});
      upcoming.innerHTML = next.map(item => `<div class="overview-agenda-row" data-appointment-color="${appointmentColor(item)}"><time datetime="${escape(item.date)}">${escape(formatDate.format(new Date(item.date + 'T00:00:00Z')))} · ${escape(item.time || 'Any time')}</time><strong>${escape(item.title)}</strong><small>${escape(item.matter || (calendarFor(item) === 'client' ? 'Client Calendar' : 'Admin Calendar'))}</small></div>`).join('') || '<p>No future appointments scheduled.</p>';
    }
    renderCalendar();
    renderMatters();
    renderDrafts();
  }
  function renderFollowUps(tasks, date) {
    const followUps = tasks.filter(item => !item.done && Object.hasOwn(followUpStates, item.followUpStatus))
      .sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999') || order(a,b));
    const overview = document.getElementById('overview-follow-ups');
    const label = item => escape([item.matter, item.date].filter(Boolean).join(' · '));
    if (overview) {
      overview.innerHTML = followUps.filter(item => item.date && item.date <= date).slice(0,5).map(item =>
        `<button class="inbox-row" type="button" data-overview-follow-up="${escape(item.id)}"><strong>${escape(item.title)}</strong><small>${label(item)} · ${followUpStates[item.followUpStatus]}</small></button>`
      ).join('') || '<p>No follow-ups due today.</p>';
    }
    find('#case-follow-ups').innerHTML = Object.entries(followUpStates).map(([state, heading]) => {
      const group = followUps.filter(item => item.followUpStatus === state);
      return `<details class="follow-up-group"${group.length ? ' open' : ''}><summary>${heading} (${group.length})</summary>${group.map(item =>
        `<div class="follow-up-row"><strong>${escape(item.title)}</strong><small>${label(item)}</small><div class="work-actions"><button type="button" data-edit="${escape(item.id)}">Edit</button><button type="button" data-toggle="${escape(item.id)}">Complete</button>${state === 'client' ? `<button type="button" data-remind="${escape(item.id)}">Draft reminder</button>` : ''}</div></div>`
      ).join('') || '<p>No open follow-ups.</p>'}</details>`;
    }).join('');
  }
  function renderDrafts() {
    const drafts = records.filter(item => item.kind === 'Email draft');
    const query = find('#work-draft-search').value.trim().toLowerCase();
    const matching = drafts.filter(item => [item.title, item.recipient, item.matter].join(' ').toLowerCase().includes(query))
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
    find('#work-draft-count').textContent = loaded ? `${matching.length} of ${drafts.length} drafts` : '';
    renderRows('#work-drafts', matching, loaded ? (query ? 'No drafts match your search.' : 'No drafts saved.') : (loadError || 'Loading drafts…'));
  }
  function renderMatters() {
    const query = find('#work-matter-query').value.trim().toLowerCase();
    const kind = find('#work-matter-kind').value;
    const sort = find('#work-matter-sort').value;
    const groups = new Map();
    for (const item of records) {
      const key = item.matter?.trim().toLowerCase();
      if (!key || (kind && item.kind !== kind) || isNote(item)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const matters = find('#work-matter-list');
    const detail = find('#work-matter-detail');
    const lastActivity = entries => Math.max(...entries.map(item => item.updatedAt?.toMillis?.() ?? 0));
    const keys = [...groups.keys()].filter(key =>
      key.includes(query) || groups.get(key).some(item => item.title.toLowerCase().includes(query))
    ).sort((a, b) => (sort === 'activity' ? lastActivity(groups.get(b)) - lastActivity(groups.get(a)) : 0) || a.localeCompare(b, 'en-AU', {numeric:true}));
    find('#work-matter-count').textContent = loaded ? `${keys.length} ${keys.length === 1 ? 'matter' : 'matters'}` : '';
    if (!keys.includes(selectedMatter)) selectedMatter = keys[0];
    matters.innerHTML = keys.map(key => `<button class="inbox-row" type="button" data-matter="${escape(key)}" aria-pressed="${key === selectedMatter}">${escape(groups.get(key)[0].matter)}</button>`).join('');
    const entries = groups.get(selectedMatter) ?? [];
    const next = entries.filter(item => item.kind === 'Appointment' && !item.done && item.date >= today())
      .sort((a,b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99')).slice(0,1);
    const drafts = entries.filter(item => item.kind === 'Email draft')
      .sort((a,b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)).slice(0,5);
    const tasks = entries.filter(item => item.kind === 'Task' && !item.done).sort(order);
    const sections = kind ? [[kind, entries.sort(order)]] :
      [['Next appointment', next], ['Open tasks', tasks], ['Recent drafts', drafts]];
    detail.innerHTML = entries.length ? `<h3>${escape(entries[0].matter)}</h3>` +
      sections.map(([label, items]) => `<h4>${label}</h4>${items.map(row).join('') || '<p class="work-empty">None in this matter.</p>'}`).join('') : 'Select a matter to view its activity.';
    if (!keys.length || !loaded) {
      const notice = document.createElement('p');
      notice.className = 'work-empty';
      notice.textContent = !loaded ? (loadError || 'Loading matter activity…')
        : query || kind ? 'No matters match these filters.'
        : 'Add a matter reference to a task, appointment or email draft to see it here.';
      matters.prepend(notice);
    }
  }
  renderCalendar();
  const scheduleEditor = editors.Appointment;
  const followUpOverview = document.getElementById('overview-follow-ups');
  if (followUpOverview) followUpOverview.onclick = event => {
    const button = event.target.closest('[data-overview-follow-up]');
    if (!button || current !== session || !loaded) return;
    const action = [...find('#case-follow-ups').querySelectorAll('[data-edit]')]
      .find(entry => entry.dataset.edit === button.dataset.overviewFollowUp);
    if (!action) return;
    navigate('work-matters');
    action.click();
  };
  function listenForWorkItems() {
    stop?.();
    loaded = false;
    loadError = null;
    renderMatters();
    if (upcoming) upcoming.textContent = 'Loading appointments…';
    retryCalendar.hidden = true;
    status.textContent = 'Connecting to the workspace…';
    for (const editor of Object.values(editors)) submit(editor).disabled = true;
    if (scheduleEditor.dialog.open) message(scheduleEditor, 'Connecting to the calendar…');
    stop = onSnapshot(items, snapshot => {
      if (current !== session) return;
      records = snapshot.docs.map(record => ({...record.data(), id:record.id}));
      if (!loaded) {
        status.textContent = '';
        for (const editor of [scheduleEditor, editors.Task]) if (!editor.saving) message(editor, '');
      }
      loaded = true;
      for (const editor of Object.values(editors)) submit(editor).disabled = Boolean(editor.saving);
      render();
    }, error => {
      if (current !== session) return;
      loaded = false;
      const accessDenied = ['permission-denied', 'unauthenticated'].includes(error.code);
      loadError = accessDenied
        ? 'Calendar and work records are unavailable. Ask your Firebase administrator to verify your staff role and the published workspace rules.'
        : 'The workspace could not connect. Retry the connection without closing your schedule.';
      for (const editor of Object.values(editors)) submit(editor).disabled = true;
      renderDrafts();
      if (upcoming) upcoming.textContent = 'Upcoming appointments could not load.';
      if (followUpOverview) followUpOverview.textContent = 'Follow-ups could not load.';
      find('#case-follow-ups').textContent = 'Follow-ups could not load.';
      if (agenda) agenda.textContent = 'Agenda unavailable. Check workspace access.';
      const attention = document.getElementById('overview-task-attention');
      if (attention) attention.textContent = 'Could not load task updates.';
      status.textContent = loadError;
      renderMatters();
      message(scheduleEditor, loadError);
      message(editors.Task, loadError);
      retryCalendar.hidden = accessDenied;
    });
  }
  retryCalendar.addEventListener('click', listenForWorkItems);
  let consultationFeedReady = false;
  let consultationRequestIds = new Set();
  function listenForConsultationRequests() {
    stopConsultations?.();
    if (sampleMode) {
      consultationRequests = [{
        id:'sample-consultation-1', requestId:'sample-consultation-1', kind:'Consultation request',
        title:'Jordan Lee', date:today(), time:'10:00', calendar:'admin', priority:'High',
        notes:'Sample request to discuss parenting arrangements.', contact:{
          firstName:'Jordan', lastName:'Lee', email:'jordan.lee@example.com', phone:'0400 123 456',
          topic:'parenting', newClient:'Yes'
        }
      }];
      consultationRequestsLoaded = true;
      renderCalendar();
      return;
    }
    consultationRequestsLoaded = false;
    renderCalendar();
    stopConsultations = onSnapshot(
      query(collection(db, 'clientInbox'), orderBy('createdAt', 'desc'), limit(100)),
      snapshot => {
        if (current !== session) return;
        const newConsultationDocs = snapshot.docs.filter(document => document.data().kind === 'consultation');
        if (consultationFeedReady) {
          const arrived = newConsultationDocs.filter(document => !consultationRequestIds.has(document.id));
          if (arrived.length) notify(
            arrived.length === 1 ? 'New consultation enquiry' : 'New consultation enquiries',
            arrived.length === 1
              ? 'A client sent a new request. Open Client Messages to review it.'
              : arrived.length + ' new client requests arrived. Open Client Messages to review them.'
          );
        }
        consultationRequestIds = new Set(newConsultationDocs.map(document => document.id));
        consultationFeedReady = !snapshot.metadata.fromCache;
        consultationRequests = snapshot.docs.map(document => {
          const record = document.data();
          if (record.kind !== 'consultation') return null;
          const contact = record.contact || {};
          const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(String(contact.preferredTime || ''));
          if (!match) return null;
          const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Consultation inquiry';
          return {
            id:'consultation-' + document.id, requestId:document.id, kind:'Consultation request',
            title:name, notes:String(record.message || ''), contact, date:match[1], time:match[2] || '',
            calendar:'admin', priority:'High', done:false
          };
        }).filter(Boolean);
        consultationRequestsLoaded = true;
        renderCalendar();
      },
      () => {
        if (current !== session) return;
        consultationRequestsLoaded = true;
        const requestStatus = find('#consultation-calendar-status');
        if (requestStatus) requestStatus.textContent = 'Consultation requests could not load. Check Client Messages for the inbox connection status.';
        renderCalendar();
      }
    );
  }
  listenForConsultationRequests();
  if (sampleMode) {
    const date = today();
    const offset = days => {
      const day = new Date(date + 'T00:00:00Z');
      day.setUTCDate(day.getUTCDate() + days);
      return day.toISOString().slice(0, 10);
    };
    const sample = {priority:'Normal', done:false, recipient:'', notes:''};
    const activities = [
      {matter:'DEMO-101', kind:'Task', title:'Follow up on outstanding bank statements', date:offset(-1), priority:'High', followUpStatus:'client', notes:'Still needed: August–October statements. Payslips received. Ask the client to use the secure upload link.'},
      {matter:'DEMO-101', kind:'Task', title:'Review property disclosure index', date, followUpStatus:'review', notes:'Check that the index includes the mortgage statement and current superannuation balance.'},
      {matter:'DEMO-101', kind:'Appointment', title:'Property settlement consultation', date, time:'14:00', calendar:'client', notes:'Review the updated asset and liability schedule with Ava.'},
      {matter:'DEMO-101', kind:'Email draft', title:'Outstanding financial disclosure documents', date:'', recipient:'ava@example.com', notes:'Hi Ava,\n\nThank you for sending your payslips. Could you please upload the August to October bank statements using the secure link we shared? Let me know if you need more time.\n\nKind regards,\nFamily Law Team'},
      {matter:'DEMO-102', kind:'Appointment', title:'Parenting matter handover', date, time:'10:30', calendar:'admin', notes:'Run through the proposed school-holiday dates and open correspondence with the solicitor.'},
      {matter:'DEMO-102', kind:'Task', title:'Confirm proposed holiday dates with solicitor', date:offset(1), followUpStatus:'solicitor'},
      {matter:'DEMO-102', kind:'Task', title:'File attendance note from client call', date:offset(-2), done:true},
      {matter:'DEMO-102', kind:'Email draft', title:'Confirming your next appointment', date:'', recipient:'liam@example.com', notes:'Hi Liam,\n\nI’m writing to confirm your next appointment on [date] at [time, Sydney time]. Please let us know if you need to reschedule.\n\nKind regards,\nFamily Law Team'},
      {matter:'DEMO-103', kind:'Appointment', title:'Financial agreement intake call', date:offset(3), time:'11:00', calendar:'client'},
      {matter:'DEMO-103', kind:'Task', title:'Prepare intake pack for solicitor', date:offset(2), priority:'High', notes:'Include the questionnaire, appointment details and a blank document index.'},
      {matter:'DEMO-103', kind:'Task', title:'Check outstanding onboarding information', date:'', followUpStatus:'client'}
    ];
    records = activities.map((activity, index) => ({
      ...sample, ...activity, id:'demo-' + index, updatedAt:{toMillis:() => Date.now() - index * 600000}
    }));
    loaded = true;
    status.textContent = '';
    for (const editor of Object.values(editors)) submit(editor).disabled = false;
    render();
  } else listenForWorkItems();
  for (const editor of [scheduleEditor, editors.Task]) {
    editor.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (!editor.saving) reset(editor);
    });
  }
  const noteEditor = editors.Note;
  const draftEditor = editors['Email draft'];
  function showNew(editor, defaults) {
    if (!editor.form.hidden) {
      editor.form.querySelector('input, textarea').focus();
      return;
    }
    open(editor, null, defaults);
  }
  function showCalendarDayDialog(dayKey) {
    const dialog = find('#calendar-day-dialog');
    const title = find('#calendar-day-title');
    const subtitle = find('#calendar-day-subtitle');
    const itemsRoot = find('#calendar-day-items');
    const day = new Date(dayKey + 'T12:00:00Z');
    title.textContent = new Intl.DateTimeFormat('en-AU', {
      weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'UTC'
    }).format(day);
    const items = [
      ...records.filter(item => item.date === dayKey && item.kind !== 'Email draft' && calendarFor(item) === scope.value),
      ...(scope.value === 'admin' ? consultationRequests.filter(item => item.date === dayKey) : [])
    ].sort((a,b)=>(a.time||'').localeCompare(b.time||'')||order(a,b));
    subtitle.textContent = items.length
      ? items.length + (items.length === 1 ? ' scheduled item' : ' scheduled items') + ' · ' + (scope.value === 'admin' ? 'Admin calendar' : 'Client calendar')
      : 'No items scheduled · ' + (scope.value === 'admin' ? 'Admin calendar' : 'Client calendar');
    itemsRoot.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'calendar-day-empty';
      empty.textContent = 'There are no appointments or deadlines on this date yet.';
      itemsRoot.append(empty);
    }
    for (const item of items) {
      const isConsultation = item.kind === 'Consultation request';
      const card = document.createElement('article');
      card.className = 'calendar-day-item' + (isConsultation ? ' is-consultation' : '');
      const top = document.createElement('div');
      top.className = 'calendar-day-item-top';
      const heading = document.createElement('h3');
      heading.textContent = item.title || (isConsultation ? 'Consultation enquiry' : 'Scheduled item');
      const status = document.createElement('span');
      status.className = 'calendar-day-item-status';
      status.textContent = isConsultation ? 'Pending confirmation'
        : item.done ? 'Completed' : item.kind === 'Task' ? 'Task' : 'Scheduled';
      top.append(heading, status);
      const meta = document.createElement('p');
      const time = item.time ? new Intl.DateTimeFormat('en-AU', {
        hour:'numeric', minute:'2-digit', timeZone:'UTC'
      }).format(new Date('2026-01-01T' + item.time + ':00Z')) + ' Sydney time' : 'Time not set';
      meta.className = 'calendar-day-item-meta';
      meta.textContent = [item.kind, time, item.matter].filter(Boolean).join(' · ');
      card.append(top, meta);
      if (isConsultation && item.contact) {
        const contact = document.createElement('p');
        contact.className = 'calendar-day-item-contact';
        contact.textContent = [
          item.contact.email,
          item.contact.phone,
          item.contact.topic && 'Topic: ' + item.contact.topic
        ].filter(Boolean).join(' · ');
        if (contact.textContent) card.append(contact);
      }
      if (item.notes) {
        const notes = document.createElement('p');
        notes.className = 'calendar-day-item-notes';
        notes.textContent = item.notes;
        card.append(notes);
      }
      if (isConsultation) {
        const link = document.createElement('a');
        link.href = '#staff-inbox';
        link.className = 'calendar-day-inbox-link';
        link.textContent = 'Review inquiry in Client Messages';
        link.addEventListener('click', () => dialog.close(), {once:true});
        card.append(link);
      }
      itemsRoot.append(card);
    }
    dialog.dataset.date = dayKey;
    if (!dialog.open) dialog.showModal();
  }

  find('[data-create-schedule]').addEventListener('click', () => showNew(scheduleEditor, {calendar:scope.value, date:calendarDate()}));
  find('#new-work-task').addEventListener('click', () => showNew(editors.Task, {}));
  find('#add-day-note').addEventListener('click', () => showNew(noteEditor, {date:calendarDate()}));
  find('#cancel-day-note').addEventListener('click', () => {
    if (noteEditor.saving) return;
    reset(noteEditor);
    find('#add-day-note').focus();
  });
  for (const button of root.querySelectorAll('[data-month-step]')) {
    button.addEventListener('click', () => {
      const [year, currentMonth] = (month.value || today().slice(0, 7)).split('-').map(Number);
      const next = new Date(Date.UTC(year, currentMonth - 1 + Number(button.dataset.monthStep), 1));
      month.value = next.toISOString().slice(0, 7);
      selectedDay = '';
      renderCalendar();
    });
  }
  month.addEventListener('change', () => { selectedDay = ''; render(); });
  scope.addEventListener('change', () => { selectedDay = ''; render(); });
  find('#work-calendar-today').addEventListener('click', () => {
    selectedDay = today();
    month.value = selectedDay.slice(0,7);
    renderCalendar();
  });
  find('#work-show-month').addEventListener('click', () => { selectedDay = ''; renderCalendar(); });
  find('#work-month-grid').addEventListener('click', event => {
    const day = event.target.closest('[data-calendar-day]');
    if (!day) return;
    selectedDay = day.dataset.calendarDay;
    renderCalendar();
    showCalendarDayDialog(selectedDay);
  });
  root.addEventListener('click', event => {
    const summary = event.target.closest('.consultation-request-row > summary');
    if (!summary) return;
    event.preventDefault();
    const day = summary.parentElement.dataset.consultationDate;
    if (!day) return;
    selectedDay = day;
    month.value = day.slice(0, 7);
    renderCalendar();
    showCalendarDayDialog(day);
  });
  for (const button of root.querySelectorAll('[data-close-calendar-day]')) {
    button.addEventListener('click', () => find('#calendar-day-dialog').close());
  }
  find('#calendar-day-add-schedule').addEventListener('click', () => {
    const dialog = find('#calendar-day-dialog');
    const day = dialog.dataset.date || calendarDate();
    dialog.close();
    showNew(scheduleEditor, {calendar:scope.value, date:day});
  });
  find('#legal-task-filter').addEventListener('change', render);
  find('#work-matter-query').addEventListener('input', renderMatters);
  find('#work-matter-kind').addEventListener('change', renderMatters);
  find('#work-matter-sort').addEventListener('change', renderMatters);
  find('#work-task-search').addEventListener('input', render);
  find('#work-task-priority').addEventListener('change', render);
  find('#work-draft-search').addEventListener('input', renderDrafts);
  find('#copy-draft-body').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(field(draftEditor, 'notes').value);
      message(draftEditor, 'Draft copied.');
    } catch {
      message(draftEditor, 'Could not copy. Select the draft text to copy it.');
    }
  });
  for (const [kind, editor] of Object.entries(editors)) {
    const cancel = editor.form.querySelector('[data-cancel-editor]');
    cancel?.addEventListener('click', () => {
      if (editor.saving) return;
      reset(editor);
      if (editor === scheduleEditor) find('[data-create-schedule]').focus();
      else if (editor === draftEditor) find('[data-new-draft="blank"]').focus();
      else if (root.closest('[data-view="work-matters"]')) find('#new-follow-up').focus();
      else find('#new-work-task').focus();
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
      if (kind === 'Task' && !note && (get('followUpStatus') || previous?.followUpStatus)) data.followUpStatus = get('followUpStatus');
      if (editor === scheduleEditor) Object.assign(data, {calendar:get('calendar'), time:get('time')});
      if (note) data.calendar = editor.calendar;
      editor.saving = true;
      submit(editor).disabled = true;
      status.textContent = '';
      message(editor, 'Saving…');
      try {
        if (sampleMode) {
          const saved = {...previous, ...data, id:previous?.id || crypto.randomUUID(), updatedAt:{toMillis:() => Date.now()}};
          records = [saved, ...records.filter(item => item.id !== saved.id)];
          render();
        } else if (previous) await updateDoc(doc(items, previous.id), data);
        else await addDoc(items, data);
        if (current !== session) return;
        reset(editor);
        notify(editor.saved, data.title);
        if (note || editor === scheduleEditor) {
          month.value = data.date.slice(0,7);
          scope.value = data.calendar;
          selectedDay = data.date;
          renderCalendar();
          if (!root.closest('[data-view]') || root.closest('[data-view]').dataset.view === 'work-calendar') {
            find('[data-calendar-day="'+selectedDay+'"]')?.focus();
          }
        }
      } catch (error) {
        if (current === session) message(editor, error.code === 'permission-denied'
          ? 'Firestore denied this save. Your entries are still here. Ask the project administrator to check the published workspace rules.'
          : 'Could not save. Your entries are still here. Please try again.');
      } finally {
        editor.saving = false;
        if (current === session) submit(editor).disabled = !loaded;
      }
    });
  }
  const documentEditor = find('#document-template-editor');
  let documentTrigger;
  documentEditor.addEventListener('input', () => { documentEditor.dataset.changed = 'true'; });
  find('#close-document-template').addEventListener('click', () => {
    if (documentEditor.dataset.changed && !window.confirm('Close this document draft?')) return;
    documentEditor.reset();
    documentEditor.hidden = true;
    delete documentEditor.dataset.changed;
    documentTrigger?.focus();
  });
  documentEditor.addEventListener('submit', event => {
    event.preventDefault();
    const title = documentEditor.elements.title.value.trim();
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([documentEditor.elements.notes.value], {type:'text/plain;charset=utf-8'}));
    link.href = url;
    link.download = (title.replace(/[^\p{L}\p{N} -]+/gu, '').trim() || 'Document draft') + '.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  find('#new-follow-up').addEventListener('click', () => {
    const matter = find('#work-matter-list [aria-pressed="true"]')?.textContent.trim() || '';
    showNew(editors.Task, {matter, followUpStatus:'client', date:today()});
    editors.Task.form.querySelector('h3').textContent = 'Add follow-up';
  });
  const deleteDialog = find('#work-delete-dialog');
  const deleteName = find('#work-delete-name');
  const deleteStatus = find('#work-delete-status');
  const deleteConfirm = find('#work-delete-confirm');
  const deleteCancel = find('#work-delete-cancel');
  let pendingDelete;
  deleteCancel.addEventListener('click', () => deleteDialog.close());
  deleteDialog.addEventListener('cancel', event => {
    if (deleteConfirm.disabled) event.preventDefault();
  });
  find('#work-delete-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!pendingDelete || deleteConfirm.disabled || current !== session) return;
    deleteConfirm.disabled = deleteCancel.disabled = true;
    deleteStatus.textContent = 'Deleting…';
    try {
      if (sampleMode) {
        records = records.filter(item => item.id !== pendingDelete);
        render();
      } else await deleteDoc(doc(items, pendingDelete));
      if (current !== session) return;
      const editor = Object.values(editors).find(entry => entry.id === pendingDelete);
      if (editor && !editor.saving) reset(editor);
      pendingDelete = null;
      deleteDialog.close();
      notify('Item deleted', deleteName.textContent);
    } catch {
      if (current === session) deleteStatus.textContent = 'Could not delete the item. Try again or cancel.';
    } finally {
      deleteConfirm.disabled = deleteCancel.disabled = false;
    }
  });
  function selectTemplate(key) {
    const template = templates[key];
    find('#template-preview-type').textContent = template.type + ' preview';
    find('#template-preview-title').textContent = template.title;
    find('#template-preview-subject').textContent = template.title;
    find('#template-email-meta').hidden = template.type !== 'Email';
    find('#template-preview-text').textContent = template.notes;
    find('#apply-template').dataset.newDraft = key;
    for (const button of root.querySelectorAll('[data-preview-template]')) {
      button.setAttribute('aria-pressed', String(button.dataset.previewTemplate === key));
    }
  }
  selectTemplate('followup');
  root.onclick = async event => {
    const matter = event.target.closest('[data-matter]');
    if (matter) {
      selectedMatter = matter.dataset.matter;
      renderMatters();
      find('#work-matter-list [aria-pressed="true"]')?.focus();
      return;
    }
    const previewButton = event.target.closest('[data-preview-template]');
    if (previewButton) {
      selectTemplate(previewButton.dataset.previewTemplate);
      const heading = find('#template-preview-title');
      heading.focus({preventScroll:true});
      find('#template-preview').scrollIntoView({block:'nearest'});
      return;
    }
    const draft = event.target.closest('[data-new-draft]');
    if (draft) {
      const template = templates[draft.dataset.newDraft];
      if (template?.type === 'Document') {
        if (!documentEditor.hidden && documentEditor.dataset.changed && !window.confirm('Replace this document draft?')) return;
        documentEditor.elements.title.value = template.title;
        documentEditor.elements.notes.value = template.notes;
        delete documentEditor.dataset.changed;
        documentEditor.hidden = false;
        documentTrigger = draft;
        documentEditor.elements.title.focus();
        return;
      }
      if (draftEditor.saving) return;
      if (!draftEditor.form.hidden && template && !window.confirm('Replace the open email draft in the editor?')) return;
      navigate(draftEditor.view);
      if (template) open(draftEditor, null, {title:template.title, notes:template.notes});
      else showNew(draftEditor, {});
      return;
    }
    const reminder = event.target.closest('[data-remind]');
    if (reminder && loaded && current === session) {
      const item = records.find(entry => entry.id === reminder.dataset.remind);
      if (!item || draftEditor.saving) return;
      if (!draftEditor.form.hidden && !window.confirm('Replace the open email draft in the editor?')) return;
      navigate(draftEditor.view);
      open(draftEditor, null, {
        title:'Reminder: ' + item.title.slice(0,150),
        matter:item.matter,
        notes:`Hi [Client name],\n\nI’m following up regarding ${item.title}. Could you please provide an update or send the outstanding documents via [agreed secure channel]?\n\nKind regards,\n[Your name]`
      });
      return;
    }
    const button = event.target.closest('[data-edit],[data-toggle],[data-remove]');
    if (!button || !loaded || current !== session) return;
    const item = records.find(x=>x.id===(button.dataset.edit || button.dataset.toggle || button.dataset.remove));
    if (!item) return;
    if (button.dataset.edit) {
      const editor = isNote(item) ? noteEditor : editors[item.kind];
      if (!editor || editor.saving) return;
      if (editor !== editors.Task) navigate(editor.view);
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
    if (button.dataset.remove) {
      pendingDelete = item.id;
      deleteName.textContent = item.title;
      deleteStatus.textContent = '';
      deleteDialog.showModal();
      return;
    }
    button.disabled = true;
    try {
      if (sampleMode) {
        item.done = !item.done;
        render();
      } else await updateDoc(doc(items, item.id), {done:!item.done, updatedAt:serverTimestamp()});
      if (current === session) notify(item.done ? 'Item reopened' : 'Item completed', item.title);
    } catch {
      if (current === session) notify('Update failed', 'Could not update this item. Please try again.', true);
    } finally { button.disabled = false; }
  };
}
