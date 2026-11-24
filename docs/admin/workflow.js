import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

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
const matterWorkflowSteps = {
  parenting: [
    'Confirm client objectives and key dates with solicitor',
    'Complete intake and conflict check',
    'Request current parenting arrangements and relevant documents',
    'Prepare a chronology and questions for solicitor review',
    'Record mediation or court milestones',
    'Prepare client update after solicitor review'
  ],
  property: [
    'Confirm scope and key dates with solicitor',
    'Complete intake and conflict check',
    'Request asset and liability disclosure documents securely',
    'Prepare an asset and liability schedule for solicitor review',
    'Track valuation requests and outstanding disclosure',
    'Record negotiation outcomes and the next agreed step'
  ],
  agreement: [
    'Confirm agreement scope and advice requirements with solicitor',
    'Complete intake and conflict check',
    'Request relevant financial information securely',
    'Track draft versions and client comments',
    'Schedule solicitor review of the latest draft',
    'File the executed agreement and confirm records are indexed'
  ],
  general: [
    'Confirm matter scope and key dates with solicitor',
    'Complete intake and conflict check',
    'Request relevant client documents securely',
    'Prepare a matter chronology for solicitor review',
    'Record upcoming milestones and follow-up actions',
    'Prepare a client update after solicitor review'
  ]
};
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

const isAttorneyEmail = item => item.kind === 'Email draft' && item.title.startsWith('[ATTY EMAIL] ');
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

export function mountWorkflow(db, uid, sampleMode = false, authUser = null) {
  if (!root) return;
  clearWorkflow();
  const current = session;
  const items = sampleMode ? null : collection(db, 'staffWorkspaces', uid, 'items');
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Australia/Sydney', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let records = [];
  let consultationRequests = [];
  let loaded = false;
  let dashboardMonth = today().slice(0, 7);
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
 <dialog id="email-task-dialog" class="schedule-dialog email-task-dialog" aria-labelledby="email-task-title">
  <form id="email-task-form" class="work-form"><h3 id="email-task-title">Review task from email</h3><p id="email-task-summary" role="status">Review the email first. AI processing is optional; you can enter a task manually.</p><label class="ai-consent"><input id="email-ai-consent" type="checkbox"> I confirm this email may be sent to OpenAI to generate a summary and task suggestion.</label><button type="button" id="email-ai-generate">Generate AI suggestion</button>
   <label>Task title<input name="title" maxlength="160" required></label>
   <div class="work-fields"><label>Matter reference<input name="matter" maxlength="80"></label><label>Deadline (Sydney)<input name="date" type="date"></label><label>Priority<select name="priority"><option>Urgent</option><option>High</option><option selected>Normal</option><option>Low</option></select></label></div>
   <label>Task notes<textarea name="notes" rows="4" maxlength="8000"></textarea></label><p class="email-task-source"></p>
   <button class="work-button" type="submit">Create task</button><button type="button" data-close-email-task>Cancel</button><p role="status"></p>
  </form>
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
 <section class="workflow-panel calendar-workspace" id="work-calendar" data-calendar-mode="month" aria-label="Firm schedule">
  <div class="calendar-page-title"><div><p class="module-eyebrow">Firm schedule</p><p>Manage appointments, deadlines and client consultation requests in Sydney time.</p></div></div>
  <div class="calendar-controls">
   <div class="calendar-date-controls"><button type="button" id="work-calendar-today">Today</button><button type="button" data-month-step="-1" aria-label="Previous month">‹</button><button type="button" data-month-step="1" aria-label="Next month">›</button><label class="calendar-month-label"><span id="calendar-month-title">November 2026</span><input id="work-month" type="month" aria-label="Choose calendar month"></label></div>
   <div class="calendar-view-switch" role="tablist" aria-label="Calendar view">${['month','week','agenda'].map(view=>'<button type="button" role="tab" data-calendar-view="'+view+'" aria-selected="'+(view==='month')+'">'+view[0].toUpperCase()+view.slice(1)+'</button>').join('')}</div>
   <label class="calendar-filter-label">Calendar<select id="work-calendar-scope">${calendarOptions}</select></label>
   <label class="calendar-filter-label">Staff<select id="work-calendar-staff"><option value="">All staff</option></select></label>
   <button type="button" class="work-button calendar-add-event" data-create-schedule aria-haspopup="dialog" aria-controls="schedule-dialog"><span aria-hidden="true">＋</span> Add Event</button>
  </div>
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
  <p class="consultation-calendar-status" id="consultation-calendar-status" role="status"></p>
  <div class="calendar-main-layout">
   <main class="calendar-month-card"><div id="work-month-grid" data-calendar-mode="month"></div>
    <div class="calendar-legend" aria-label="Event colours"><span data-event-type="appointment">Appointment</span><span data-event-type="consultation">Consultation request</span><span data-event-type="task">Task / deadline</span><span data-event-type="note">Calendar note</span></div>
    <div class="calendar-note-actions"><button type="button" class="work-button" id="add-day-note">Add day note</button></div>
    <form id="day-note-form" class="work-form" hidden><h3>Add day note</h3><label>Date (Sydney)<input name="date" type="date" required></label><label>Note<textarea name="note" rows="3" maxlength="8000" required></textarea></label><button class="work-button" type="submit" disabled>Save note</button> <button type="button" id="cancel-day-note">Cancel</button><p role="status"></p></form>
   </main>
   <aside class="calendar-right-rail">
    <section class="calendar-upcoming-card" aria-labelledby="calendar-upcoming-title"><header><h3 id="calendar-upcoming-title">Upcoming Events</h3><time id="calendar-today-label"></time></header><div id="calendar-upcoming-list" aria-live="polite"></div><h4>Later This Week</h4><div id="calendar-later-list" aria-live="polite"></div></section>
    <section class="calendar-approval-panel" aria-labelledby="calendar-approval-title">
     <div class="calendar-approval-header"><div><span>ATTORNEY REVIEW</span><h3 id="calendar-approval-title">Approval queue</h3></div><strong id="calendar-approval-count">0</strong></div>
     <p class="calendar-approval-intro">Review consultation requests before confirming an appointment.</p>
     <div id="calendar-approval-list" aria-live="polite"></div>
    </section>
   </aside>
  </div>
  <div class="calendar-agenda" hidden aria-hidden="true"><h3 id="work-agenda-title">Scheduled items</h3><div id="work-agenda"></div></div>
  <button type="button" id="work-show-month" hidden>Show whole month</button>
 </section>
<section class="workflow-panel" id="work-matters"><div class="admin-section-heading"><h2>Matter activity</h2><button type="button" class="work-button" id="new-follow-up">Add follow-up</button></div>
  <section class="matter-workflow-box" aria-labelledby="matter-workflow-title">
   <div><span class="matter-workflow-eyebrow">STANDARDISED MATTER WORKFLOW</span><h3 id="matter-workflow-title">Start a family law workflow</h3><p>Creates linked tasks in the matter file. Add deadlines after checking them with the solicitor.</p></div>
   <form id="matter-workflow-form">
    <label>Matter reference<input name="matter" maxlength="80" placeholder="e.g. FAM-2026-014" required></label>
    <label>Workflow<select name="workflow"><option value="parenting">Parenting arrangements</option><option value="property">Property settlement</option><option value="agreement">Financial agreement</option><option value="general">General family law</option></select></label>
    <button class="work-button" type="submit">Create linked tasks</button><p id="matter-workflow-status" role="status"></p>
   </form>
  </section>
  <section id="case-follow-ups" aria-label="Open follow-ups"></section>
  <div class="legal-actions">
   <label>Search matters<input id="work-matter-query" type="search" placeholder="Matter reference or item title"></label>
   <label>Show<select id="work-matter-kind"><option value="">All work items</option><option>Task</option><option>Appointment</option><option>Email draft</option></select></label>
   <label>Sort matters<select id="work-matter-sort"><option value="reference">Reference A–Z</option><option value="activity">Most recent activity</option></select></label>
  </div>
  <p id="work-matter-count" role="status"></p><div class="matter-split"><div id="work-matter-list"></div><section id="work-matter-detail" aria-label="Selected matter"></section></div></section>
 <section class="workflow-panel correspondence-workspace" id="work-email">
  <header class="correspondence-page-head">
   <div><span class="correspondence-accent" aria-hidden="true"></span><div><h2>Correspondence</h2><p>Review received emails and prepare clear, matter-linked replies.</p></div></div>
   <button class="work-button correspondence-log-button" type="button" id="attorney-email-toggle" aria-expanded="false"><span aria-hidden="true">＋</span> Log correspondence</button>
  </header>
  <form id="attorney-email-form" class="work-form correspondence-log-form" hidden>
   <div class="work-fields"><label>From<input name="sender" type="email" maxlength="254" placeholder="attorney@example.com" required></label><label>Subject<input name="subject" maxlength="160" required></label><label>Received date<input name="received" type="date"></label><label>Matter reference<input name="matter" maxlength="80"></label></div>
   <label>Full email<textarea name="body" rows="5" maxlength="8000" required placeholder="Paste the email text here"></textarea></label>
   <div class="correspondence-form-actions"><button type="submit" class="work-button">Save email</button><button type="button" id="attorney-email-cancel">Cancel</button><p id="attorney-email-status" role="status"></p></div>
   <small>Email auto-sync needs a connected mailbox. AI task suggestions send the selected email to the firm’s configured OpenAI service.</small>
  </form>
  <div class="correspondence-toolbar">
   <label class="correspondence-search"><span class="sr-only">Search correspondence</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16 16 5 5"></path></svg><input id="correspondence-search" type="search" placeholder="Search correspondence (subject, sender, recipient or matter)"></label>
   <div class="correspondence-filters" role="tablist" aria-label="Filter correspondence">
    <button type="button" role="tab" aria-selected="true" data-corr-filter="all"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 7l8 6 8-6"></path></svg>All</button>
    <button type="button" role="tab" aria-selected="false" data-corr-filter="email"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg>Email</button>
    <button type="button" role="tab" aria-selected="false" data-corr-filter="phone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h3l2 5-2 2a14 14 0 0 0 5 5l2-2 5 2v3c0 1-1 2-2 2C10 19 5 14 4 5c0-1 1-2 2-2z"></path></svg>Phone</button>
    <button type="button" role="tab" aria-selected="false" data-corr-filter="letter"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h7M9 17h7"></path></svg>Letter</button>
    <button type="button" role="tab" aria-selected="false" data-corr-filter="note"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path></svg>Internal note</button>
   </div>
   <label class="correspondence-sort"><span class="sr-only">Sort correspondence</span><select id="correspondence-sort" aria-label="Sort correspondence"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
   <button type="button" class="correspondence-list-open" id="correspondence-list-open" aria-label="Show correspondence list" hidden>☰ Inbox</button>
  </div>
  <div class="correspondence-layout" id="correspondence-layout">
   <aside class="correspondence-list-pane" id="correspondence-list-pane" aria-label="Correspondence list">
    <div class="correspondence-list-heading"><div><strong id="correspondence-count">Correspondence</strong><span id="work-draft-count" class="work-result-count" role="status"></span></div><button type="button" id="correspondence-list-close" aria-label="Hide correspondence list">‹</button></div>
    <div id="correspondence-items"><p class="work-empty">Loading correspondence…</p></div>
    <div id="work-drafts" hidden></div><div id="attorney-email-list" hidden></div>
    <div class="correspondence-list-footer"><button type="button" data-new-draft="blank">＋ New email draft</button><button type="button" data-new-draft="followup">Client follow-up template</button></div>
   </aside>
   <section class="correspondence-reader" id="correspondence-reader" aria-label="Selected correspondence">
    <div class="correspondence-reader-toolbar"><button type="button" id="correspondence-reader-close" aria-label="Close message">×</button><span>Message details</span><button type="button" class="correspondence-reader-list" id="correspondence-reader-list">☰ Inbox</button></div>
    <div id="correspondence-reader-content"><div class="correspondence-empty-state"><span class="correspondence-empty-icon" aria-hidden="true">✉</span><h3>Select a message</h3><p>Choose an email from the inbox to read the full correspondence.</p></div></div>
    <div id="draft-sample" class="draft-example" hidden></div>
    ${editorMarkup('draft-form', 'New email draft', `
     <label>Subject<input name="title" maxlength="160" required></label>
     <label>Recipient<input type="email" name="recipient" maxlength="254"></label>${matterField}`,
     'Email body', 'Save draft', true).replace('<p role="status">', '<button type="button" id="copy-draft-body">Copy text</button><p role="status">')}
   </section>
  </div>
 </section>`;
  root.insertAdjacentHTML('beforeend', '<dialog id="calendar-day-dialog" class="schedule-dialog calendar-day-dialog" aria-labelledby="calendar-day-title"><header class="calendar-day-dialog-head"><div><p>Calendar details</p><h2 id="calendar-day-title"></h2><span id="calendar-day-subtitle"></span></div><button type="button" data-close-calendar-day aria-label="Close day details">×</button></header><div id="calendar-day-items" class="calendar-day-items"></div><footer><button type="button" class="work-button" id="calendar-day-add-schedule">Add schedule on this date</button><button type="button" data-close-calendar-day>Close</button></footer></dialog>');
  const find = selector => root.querySelector(selector);
  const status = find('#work-status');
  const retryCalendar = find('#retry-calendar-access');
  const month = find('#work-month');
  const scope = find('#work-calendar-scope');
  const staffFilter = find('#work-calendar-staff');
  const agenda = document.getElementById('overview-agenda-items');
  const upcoming = document.getElementById('overview-upcoming-items');
  const editors = {
    Task: {form:find('#task-form'), dialog:find('#task-dialog'), title:'Create task', editTitle:'Edit task', saved:'Task saved.', view:'work-queue'},
    Appointment: {form:find('#schedule-form'), dialog:find('#schedule-dialog'), title:'Add schedule', editTitle:'Edit schedule', saved:'Schedule saved.', view:'work-calendar'},
    'Email draft': {form:find('#draft-form'), title:'New email draft', editTitle:'Edit email draft', saved:'Draft saved.', view:'work-email'},
    Note: {form:find('#day-note-form'), title:'Add day note', editTitle:'Edit day note', saved:'Day note saved.', view:'work-calendar'}
  };
  let selectedDay = '';
  let calendarMode = 'month';
  let selectedMatter;
  let correspondenceFilter = 'all';
  let selectedCorrespondenceId = '';
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
    const badge = isAttorneyEmail(item) ? 'Received email' : isNote(item) ? 'Day note' : item.kind === 'Email draft' ? 'Draft' :
      item.done ? 'Completed' : item.date && item.date < today() ?
      (item.kind === 'Appointment' ? 'Past appointment' : 'Overdue') : item.kind === 'Appointment' ? 'Scheduled' : item.priority;
    const color = item.kind === 'Appointment' ? ` data-appointment-color="${appointmentColor(item)}"` : '';
    return `<details class="work-row"${color}><summary><strong>${escape(item.title)}</strong> <span class="status">${escape(badge)}</span><small>${escape([item.kind, item.matter, item.date, item.time && item.time + ' Sydney'].filter(Boolean).join(' · '))}</small></summary>
    ${item.recipient ? '<p>'+(isAttorneyEmail(item)?'From: ':'To: ')+escape(item.recipient)+'</p>' : ''}
    ${item.notes ? '<p class="work-notes">'+escape(item.notes)+'</p>' : ''}
    <div class="work-actions">${isAttorneyEmail(item)?'<button type="button" class="work-button" data-generate-email-task="'+escape(item.id)+'">Generate task</button>':''}<button type="button" data-edit="${escape(item.id)}">Edit</button>${(item.kind === 'Email draft' || isNote(item)) ? '' : `<button type="button" data-toggle="${escape(item.id)}">${item.done?'Reopen':'Mark complete'}</button>`}<button type="button" data-remove="${escape(item.id)}">Delete</button></div></details>`;
  }
  const renderRows = (selector, entries, empty) => {
    const container = find(selector);
    const open = new Set([...container.querySelectorAll('details[open] [data-edit]')].map(button => button.dataset.edit));
    container.innerHTML = entries.map(row).join('') || '<p class="work-empty">'+empty+'</p>';
    for (const button of container.querySelectorAll('[data-edit]')) if (open.has(button.dataset.edit)) button.closest('details').open = true;
  };
  function renderApprovalQueue() {
    const list = find("#calendar-approval-list");
    const count = find("#calendar-approval-count");
    const pageList = document.getElementById("approval-page-list");
    const pending = consultationRequests.filter(item => (item.approvalStatus || "pending") === "pending");
    count.textContent = String(pending.length);
    const navBadge=document.getElementById("nav-calendar-badge");
    if(navBadge){navBadge.textContent=pending.length>99?"99+":String(pending.length);navBadge.hidden=pending.length===0;}
    const pendingMetric=document.getElementById("dashboard-stat-pending-approvals");
    if(pendingMetric)pendingMetric.textContent=String(pending.length);
    const approvalBadge=document.getElementById("nav-approval-badge");
    if(approvalBadge){approvalBadge.textContent=pending.length>99?"99+":String(pending.length);approvalBadge.hidden=pending.length===0;}
    if (!consultationRequestsLoaded) {
      list.innerHTML = "<p class='approval-empty'>Loading consultation requests…</p>";
      if(pageList) pageList.innerHTML = "<p class='dashboard-empty'>Loading approval requests…</p>";
      return;
    }
    if (!pending.length) {
      list.innerHTML = "<p class='approval-empty'>No requests are waiting for attorney review.</p>";
      if(pageList) pageList.innerHTML = "<p class='dashboard-empty'>No requests are waiting for attorney review.</p>";
      return;
    }
    list.innerHTML = pending.map(item => {
      const dateLabel = item.date
        ? new Intl.DateTimeFormat("en-AU", {day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(item.date + "T12:00:00Z"))
        : "Date not selected";
      const timeLabel = item.time
        ? new Intl.DateTimeFormat("en-AU", {hour:"numeric",minute:"2-digit",timeZone:"UTC"}).format(new Date("2026-01-01T" + item.time + ":00Z")) + " Sydney"
        : "Time not selected";
      const topic = item.contact?.topic ? String(item.contact.topic).replaceAll("-", " ") : "General enquiry";
      return "<article class='calendar-approval-card' data-request-id='" + escape(item.requestId) + "'>" +
        "<div class='calendar-approval-card-head'><strong>" + escape(item.title || "Consultation inquiry") + "</strong><span>Needs review</span></div>" +
        "<p>" + escape(topic) + " · " + escape(dateLabel) + " · " + escape(timeLabel) + "</p>" +
        "<small>" + escape(item.contact?.email || "No email provided") + "</small>" +
        "<div class='calendar-approval-actions'><button type='button' class='work-button' data-approval-action='approved' data-request-id='" + escape(item.requestId) + "'>Approve &amp; schedule</button>" +
        "<button type='button' class='calendar-approval-decline' data-approval-action='declined' data-request-id='" + escape(item.requestId) + "'>Decline</button></div>" +
        "<p class='calendar-approval-status' role='status'></p></article>";
    }).join("");
    if(pageList) pageList.innerHTML = list.innerHTML;
  }
  function renderCalendar() {
    renderApprovalQueue();
    const date=today();
    const selectedMonth=month.value||date.slice(0,7);
    const parts=selectedMonth.split('-').map(Number);
    const year=parts[0], monthNumber=parts[1];
    const grid=find('#work-month-grid');
    const page=find('#work-calendar');
    if(!year||!monthNumber){grid.replaceChildren();return;}
    const monthDate=new Date(Date.UTC(year,monthNumber-1,1));
    find('#calendar-month-title').textContent=new Intl.DateTimeFormat('en-AU',{month:'long',year:'numeric',timeZone:'UTC'}).format(monthDate);
    if(page)page.dataset.calendarMode=calendarMode;
    grid.dataset.calendarMode=calendarMode;
    for(const tab of find('#work-calendar').querySelectorAll('[data-calendar-view]'))tab.setAttribute('aria-selected',String(tab.dataset.calendarView===calendarMode));
    const staffFor=item=>item.assignee||item.staff||item.assignedTo||'';
    const staffNames=[...new Set([...records,...consultationRequests].map(staffFor).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    if(staffFilter){const prior=staffFilter.value;staffFilter.innerHTML='<option value="">All staff</option>'+staffNames.map(name=>'<option value="'+escape(name)+'">'+escape(name)+'</option>').join('');staffFilter.value=staffNames.includes(prior)?prior:'';}
    const isVisibleCalendar=item=>item.kind!=='Email draft'&&calendarFor(item)===scope.value&&(!staffFilter?.value||staffFor(item)===staffFilter.value);
    const monthItems=records.filter(item=>item.date&&item.date.startsWith(selectedMonth)&&isVisibleCalendar(item));
    const monthRequests=scope.value==='admin'?consultationRequests.filter(item=>item.approvalStatus!=='declined'&&item.date&&item.date.startsWith(selectedMonth)&&(!staffFilter?.value||staffFor(item)===staffFilter.value)):[];
    const monthEvents=[...monthItems,...monthRequests];
    const byDay=new Map();
    for(const item of monthEvents){if(!byDay.has(item.date))byDay.set(item.date,[]);byDay.get(item.date).push(item);}
    const eventType=item=>item.kind==='Consultation request'?(item.approvalStatus==='approved'?'approved-consultation':'consultation'):isNote(item)?'note':item.kind==='Appointment'?'appointment':'task';
    const eventMarkup=item=>'<span class="calendar-event" data-event-type="'+eventType(item)+'"'+(item.kind==='Appointment'?' data-appointment-color="'+appointmentColor(item)+'"':'')+'>'+escape([item.time,item.title].filter(Boolean).join(' '))+'</span>';
    const makeDayButton=(d,monthTag='')=>{
      const key=d.toISOString().slice(0,10), items=byDay.get(key)||[];
      const current=key===date?' is-today':'';
      const outside=monthTag&&key.slice(0,7)!==selectedMonth?' is-outside':'';
      return '<button type="button" class="month-day'+current+outside+'" data-calendar-day="'+key+'" aria-label="'+key+', '+items.length+' scheduled items" aria-pressed="'+(key===selectedDay)+'"'+(key===date?' aria-current="date"':'')+'><strong>'+d.getUTCDate()+'</strong>'+items.slice(0,3).map(eventMarkup).join('')+(items.length>3?'<small class="calendar-more">+'+(items.length-3)+' more</small>':'')+'</button>';
    };
    if(calendarMode==='month'){
      const first=new Date(Date.UTC(year,monthNumber-1,1));
      const offset=(first.getUTCDay()+6)%7;
      const cursor=new Date(Date.UTC(year,monthNumber-1,1-offset));
      const cells=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=>'<span class="month-weekday">'+day+'</span>');
      for(let i=0;i<42;i++){cells.push(makeDayButton(cursor,'month'));cursor.setUTCDate(cursor.getUTCDate()+1);}
      grid.innerHTML=cells.join('');
    }else if(calendarMode==='week'){
      const anchor=new Date((selectedDay||date)+'T12:00:00Z');
      const offset=(anchor.getUTCDay()+6)%7;
      anchor.setUTCDate(anchor.getUTCDate()-offset);
      const cells=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=>'<span class="month-weekday">'+day+'</span>');
      for(let i=0;i<7;i++){cells.push(makeDayButton(anchor));anchor.setUTCDate(anchor.getUTCDate()+1);}
      grid.innerHTML=cells.join('');
      const weekStart=new Date((selectedDay||date)+'T12:00:00Z');weekStart.setUTCDate(weekStart.getUTCDate()-((weekStart.getUTCDay()+6)%7));
      const weekEnd=new Date(weekStart);weekEnd.setUTCDate(weekEnd.getUTCDate()+6);
      find('#work-agenda-title').textContent=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',timeZone:'UTC'}).format(weekStart)+' – '+new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(weekEnd);
    }else{
      const rows=monthEvents.filter(item=>item.date).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99'));
      grid.innerHTML='<div class="calendar-agenda-view">'+(rows.length?rows.map(item=>'<button type="button" class="calendar-agenda-row" data-calendar-day="'+escape(item.date)+'"><time>'+escape(new Intl.DateTimeFormat('en-AU',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(item.date+'T12:00:00Z')))+(item.time?' · '+escape(item.time):'')+'</time>'+eventMarkup(item)+'</button>').join(''):'<p class="work-empty">No events in this month.</p>')+'</div>';
    }
    const allEvents=[...records.filter(item=>item.date&&item.date>=date&&isVisibleCalendar(item)),...(scope.value==='admin'?consultationRequests.filter(item=>item.date&&item.date>=date&&item.approvalStatus!=='declined'&&(!staffFilter?.value||staffFor(item)===staffFilter.value)):[])].sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99'));
    const todayEvents=allEvents.filter(item=>item.date===date);
    const weekEnd=new Date(date+'T12:00:00Z');weekEnd.setUTCDate(weekEnd.getUTCDate()+7);
    const weekEndKey=weekEnd.toISOString().slice(0,10);
    const laterEvents=allEvents.filter(item=>item.date>date&&item.date<=weekEndKey).slice(0,4);
    const shortDate=d=>new Intl.DateTimeFormat('en-AU',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
    const timeText=t=>t?new Intl.DateTimeFormat('en-AU',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'UTC'}).format(new Date('2026-01-01T'+t+':00Z')):'All day';
    const kindText=item=>item.kind==='Consultation request'?'Client consultation request':isNote(item)?'Calendar note':item.kind==='Appointment'?'Appointment':'Task / deadline';
    const rightEvent=(item)=>'<button type="button" class="calendar-upcoming-row" data-calendar-day="'+escape(item.date)+'" data-event-type="'+eventType(item)+'"><span class="calendar-upcoming-time">'+escape(timeText(item.time))+'</span><span class="calendar-upcoming-copy"><strong>'+escape(item.title||kindText(item))+'</strong><small>'+escape(kindText(item))+(item.matter?' · '+escape(item.matter):'')+'</small></span></button>';
    const dateLabel=find('#calendar-today-label');
    if(dateLabel)dateLabel.textContent=new Intl.DateTimeFormat('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
    find('#calendar-upcoming-list').innerHTML=todayEvents.length?todayEvents.slice(0,4).map(rightEvent).join(''):'<p class="work-empty calendar-empty">No events scheduled for today.</p>';
    find('#calendar-later-list').innerHTML=laterEvents.length?laterEvents.map(item=>'<div class="calendar-later-row" data-event-type="'+eventType(item)+'"><span>'+escape(shortDate(item.date))+'<small>'+escape(timeText(item.time))+'</small></span><div><strong>'+escape(item.title||kindText(item))+'</strong><small>'+escape(kindText(item))+(item.matter?' · '+escape(item.matter):'')+'</small></div><button type="button" data-calendar-day="'+escape(item.date)+'" aria-label="Open '+escape(item.title||'event')+'">View</button></div>').join(''):'<p class="work-empty calendar-empty">No later events this week.</p>';
    find('#work-agenda-title').textContent=selectedDay?new Intl.DateTimeFormat('en-AU',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(selectedDay+'T12:00:00Z')):'Scheduled items this month';
    const agendaItems=monthEvents.filter(item=>item.kind!=='Consultation request'&&(!selectedDay||item.date===selectedDay)).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')||order(a,b));
    renderRows('#work-agenda',agendaItems,monthEvents.length?'No scheduled items for this date.':'No appointments, requests or deadlines in this calendar view.');
    const requestStatus=find('#consultation-calendar-status');
    if(requestStatus){
      const waiting=consultationRequests.filter(item=>(item.approvalStatus||'pending')==='pending').length;
      requestStatus.textContent=consultationRequestsLoaded?(waiting?waiting+' consultation request'+(waiting===1?' needs':'s need')+' attorney review.':''): 'Checking for consultation requests…';
    }
  }
  function render() {
    const date = today();
    const tasks = records.filter(item => item.kind === 'Task' && !isNote(item));
    const overdue = item => !item.done && item.date && item.date < date;
    const openTasks = tasks.filter(item => !item.done);
    const pendingApprovals = consultationRequests.filter(item => (item.approvalStatus || 'pending') === 'pending').length;
    for (const [id,value] of [
      ['dashboard-stat-pending-approvals',pendingApprovals]
    ]) { const node=document.getElementById(id); if(node) node.textContent=String(value); }
    const taskBadge=document.getElementById('nav-task-badge');
    if(taskBadge){const value=tasks.filter(item=>overdue(item)||(!item.done&&item.date===date)).length;taskBadge.textContent=value>99?'99+':String(value);taskBadge.hidden=value===0;}
    const calendarBadge=document.getElementById('nav-approval-badge');
    if(calendarBadge){calendarBadge.textContent=pendingApprovals>99?'99+':String(pendingApprovals);calendarBadge.hidden=pendingApprovals===0;}
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
    renderDashboard();
  }

  function renderDashboard() {
    const overview = document.getElementById('dashboard-overview');
    if (!overview) return;
    const error = document.getElementById('dashboard-error');
    if (error) { error.hidden = !loadError; error.textContent = loadError ? 'Workspace data could not be loaded. ' + loadError : ''; }
    const date = today();
    const start = new Date(date + 'T00:00:00Z');
    const horizon = new Date(start); horizon.setUTCDate(horizon.getUTCDate() + 7);
    const endDate = horizon.toISOString().slice(0,10);
    const pending = consultationRequests.filter(item => (item.approvalStatus || 'pending') === 'pending');
    const openWork = records.filter(item => !item.done && !isNote(item));
    const matters = [...new Set(openWork.map(item => String(item.matter || '').trim()).filter(Boolean))];
    const upcoming = records.filter(item => item.kind === 'Appointment' && !item.done && item.date >= date && item.date <= endDate).length +
      pending.filter(item => item.date >= date && item.date <= endDate).length;
    const receivedToday = consultationRequests.filter(item => {
      const stamp = item.createdAt && item.createdAt.toDate ? item.createdAt.toDate() : (item.createdAt instanceof Date ? item.createdAt : null);
      if (!stamp) return item.date === date;
      return new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(stamp) === date;
    }).length;
    const setText = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=String(value); };
    setText('dashboard-stat-matters', matters.length);
    setText('dashboard-stat-new-enquiries', receivedToday);
    setText('dashboard-stat-upcoming-events', upcoming);
    setText('dashboard-stat-pending-approvals', pending.length);
    const badge = document.getElementById('nav-approval-badge');
    if (badge) { badge.textContent=pending.length>99?'99+':String(pending.length); badge.hidden=pending.length===0; }

    const approvals = document.getElementById('dashboard-approval-list');
    if (approvals) {
      approvals.innerHTML = pending.length ? pending.slice(0,4).map(item => {
        const stamp = item.createdAt && item.createdAt.toDate ? item.createdAt.toDate() : (item.createdAt instanceof Date ? item.createdAt : null);
        const submitted = stamp ? new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:'Australia/Sydney'}).format(stamp) : 'Recently submitted';
        const time = item.time ? new Intl.DateTimeFormat('en-AU',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date('2026-01-01T'+item.time+':00Z')) : 'Time not selected';
        const dateLabel = item.date ? new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(item.date+'T12:00:00Z')) : 'Date not selected';
        return '<article class="dashboard-approval-row"><span class="dashboard-approval-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h7M9 17h7"/></svg></span><div><strong>'+escape(item.title || 'Consultation enquiry')+'</strong><p>Consultation request · Submitted '+escape(submitted)+' · '+escape(dateLabel)+' at '+escape(time)+'</p></div><a href="#work-calendar">Review</a></article>';
      }).join('') : '<p class="dashboard-empty">No requests are waiting for attorney review.</p>';
    }

    const recentBody = document.getElementById('dashboard-matters-body');
    if (recentBody) {
      const grouped = new Map();
      for (const item of records.filter(row => !isNote(row) && String(row.matter || '').trim())) {
        const ref = String(item.matter).trim();
        const group = grouped.get(ref) || {ref, rows:[]};
        group.rows.push(item); grouped.set(ref,group);
      }
      const rows=[...grouped.values()].sort((a,b) => {
        const latest = g => Math.max(...g.rows.map(row => row.updatedAt?.toMillis?.() || row.updatedAt?.getTime?.() || 0));
        return latest(b)-latest(a);
      }).slice(0,5);
      recentBody.innerHTML = rows.length ? rows.map(group => {
        const active = group.rows.some(item => !item.done);
        const next = group.rows.filter(item => !item.done && item.date && item.date >= date).sort((a,b)=>a.date.localeCompare(b.date))[0];
        const types=[...new Set(group.rows.map(item => item.kind === 'Task' ? 'Task' : item.kind === 'Appointment' ? 'Appointment' : 'Draft'))].join(', ');
        return '<tr><td><strong>'+escape(group.ref)+'</strong></td><td>'+escape(types || 'Work')+'</td><td><span class="matter-state '+(active?'':'is-quiet')+'">'+(active?'Active':'Complete')+'</span></td><td>'+escape(next?.date || '—')+'</td><td>'+group.rows.length+'</td></tr>';
      }).join('') : '<tr><td colspan="5" class="dashboard-empty-cell">'+(loaded?'No matter-linked work items yet.':'Loading matter activity…')+'</td></tr>';
    }

    const taskList = document.getElementById('dashboard-due-task-list');
    if (taskList) {
      const dueTasks=records.filter(item => item.kind==='Task' && !item.done && !isNote(item) && item.date && item.date<=endDate).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')).slice(0,6);
      const tomorrow = new Date(start.getTime()+86400000).toISOString().slice(0,10);
      const dayLabel = d => d < date ? 'Overdue' : d === date ? 'Due today' : d === tomorrow ? 'Due tomorrow' : new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
      taskList.innerHTML=dueTasks.length?dueTasks.map(item=>'<li class="dashboard-due-task"><a href="#work-queue" data-task-filter="open">'+escape(item.title)+'</a><small class="'+(item.date<date?'is-overdue':'')+'">'+escape(dayLabel(item.date))+'</small></li>').join(''):'<li class="dashboard-empty">'+(loaded?'No open tasks due in the next 7 days.':'Loading tasks…')+'</li>';
    }

    const directory=document.getElementById('dashboard-client-directory');
    if(directory){
      const clients=new Map();
      consultationRequests.forEach(item=>{
        const contact=item.contact||{};
        const key=String(contact.email||item.requestId).toLowerCase();
        if(!clients.has(key)) clients.set(key,{contact,item});
      });
      const entries=[...clients.values()];
      directory.innerHTML=entries.length?entries.map(({contact,item})=>'<tr><td>'+escape([contact.firstName,contact.lastName].filter(Boolean).join(' ')||item.title||'Enquiry contact')+'</td><td>'+escape(contact.email||'—')+'</td><td>'+escape(contact.phone||'—')+'</td><td>'+escape(String(contact.topic||'General enquiry').replaceAll('-',' '))+'</td><td>'+escape(item.date||'—')+'</td></tr>').join(''):'<tr><td colspan="5" class="dashboard-empty-cell">No website enquiry contacts are loaded.</td></tr>';
    }

    const monthLabel = document.getElementById('dashboard-month-label');
    const monthTitle = document.getElementById('dashboard-calendar-title');
    const grid = document.getElementById('dashboard-mini-calendar');
    const monthInput = /^\d{4}-\d{2}$/.test(dashboardMonth) ? dashboardMonth : date.slice(0,7);
    const parts=monthInput.split('-').map(Number), year=parts[0], month=parts[1];
    const first=new Date(Date.UTC(year,month-1,1)), offset=(first.getUTCDay()+6)%7;
    const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
    const monthName=new Intl.DateTimeFormat('en-AU',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
    if(monthLabel) monthLabel.textContent=monthName;
    if(monthTitle) monthTitle.textContent=monthName;
    if(grid) {
      const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=>'<span class="mini-calendar-weekday" role="columnheader">'+day+'</span>').join('');
      const pad=Array.from({length:offset},()=>'<span class="mini-calendar-spacer" aria-hidden="true"></span>').join('');
      const dayCells=Array.from({length:daysInMonth},(_,i)=>{
        const n=i+1, key=monthInput+'-'+String(n).padStart(2,'0');
        const hasAppointment=records.some(row=>row.kind==='Appointment'&&!row.done&&row.date===key);
        const hasApproval=consultationRequests.some(row=>(row.approvalStatus||'pending')==='pending'&&row.date===key);
        const hasEvent=hasAppointment||hasApproval;
        const dots=hasEvent?'<span class="mini-day-dots" aria-hidden="true">'+(hasAppointment?'<i></i>':'')+(hasApproval?'<i class="is-approval"></i>':'')+'</span>':'';
        const label=new Intl.DateTimeFormat('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(key+'T12:00:00Z'));
        return '<a class="mini-calendar-day" '+(key===date?'aria-current="date"':'')+' href="#work-calendar" data-dashboard-date="'+key+'" role="gridcell" aria-label="'+escape(label)+(hasEvent?', event scheduled':'')+'">'+n+dots+'</a>';
      }).join('');
      const total=offset+daysInMonth, trailing=(7-(total%7))%7;
      grid.innerHTML=weekdays+pad+dayCells+Array.from({length:trailing},()=>'<span class="mini-calendar-spacer" aria-hidden="true"></span>').join('');
    }
    const prev=document.getElementById('dashboard-month-prev'), next=document.getElementById('dashboard-month-next');
    if(prev) prev.onclick=()=>{const d=new Date(monthInput+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);dashboardMonth=d.toISOString().slice(0,7);renderDashboard();};
    if(next) next.onclick=()=>{const d=new Date(monthInput+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);dashboardMonth=d.toISOString().slice(0,7);renderDashboard();};
    const status=document.getElementById('dashboard-live-status');
    if(status) status.innerHTML='<span class="live-indicator"></span>'+(loaded&&consultationRequestsLoaded?'Live updates':'Loading live data');
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
    const allItems = records.filter(item => item.kind === 'Email draft' && !isAttorneyEmail(item));
    const received = records.filter(isAttorneyEmail);
    const emailItems = [...received,...allItems].sort((a,b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
    const emailBadge=document.getElementById('nav-email-badge');
    if(emailBadge){emailBadge.textContent=received.length>99?'99+':String(received.length);emailBadge.hidden=received.length===0;}
    const query = find('#correspondence-search').value.trim().toLowerCase();
    const sort = find('#correspondence-sort').value;
    const filtered = emailItems.filter(item => correspondenceFilter === 'all' || correspondenceFilter === 'email')
      .filter(item => [item.title,item.recipient,item.matter,item.notes].join(' ').toLowerCase().includes(query))
      .sort((a,b) => {
        const delta=(a.updatedAt?.toMillis?.() ?? Date.parse(a.date||'') ?? 0) - (b.updatedAt?.toMillis?.() ?? Date.parse(b.date||'') ?? 0);
        return sort==='oldest'?delta:-delta;
      });
    const count=find('#correspondence-count');
    if(count) count.textContent='Correspondence ('+filtered.length+')';
    find('#work-draft-count').textContent=loaded ? (filtered.length+' of '+emailItems.length+' messages') : '';
    const list=find('#correspondence-items');
    const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg>';
    list.innerHTML=filtered.length ? filtered.map(item=>{
      const incoming=isAttorneyEmail(item);
      const title=item.title.replace(/^\[ATTY EMAIL\] /,'');
      const selected=item.id===selectedCorrespondenceId;
      const sender=(incoming?'From: ':'To: ')+(item.recipient||'No recipient');
      return '<button type="button" class="correspondence-row'+(selected?' is-selected':'')+'" data-correspondence-id="'+escape(item.id)+'" aria-pressed="'+selected+'"><span class="correspondence-row-icon">'+icon+'</span><span class="correspondence-row-copy"><strong>'+escape(title)+'</strong><small>'+escape(sender)+'</small><small class="correspondence-row-matter">▱ '+escape(item.matter||'No matter linked')+'</small></span><time>'+escape(item.date||'Draft')+'</time></button>';
    }).join('') : '<div class="correspondence-empty-list"><strong>'+escape(correspondenceFilter==='all'||correspondenceFilter==='email'?'No correspondence yet':'No '+(correspondenceFilter==='note'?'internal notes':correspondenceFilter+' records')+' logged')+'</strong><p>'+(loaded?'Log a received email or create a draft to start the thread.':'Loading saved correspondence…')+'</p></div>';
    const available = filtered.some(item=>item.id===selectedCorrespondenceId) ? filtered : filtered.slice(0,1);
    if(available.length) selectedCorrespondenceId=available[0].id;
    const active=available[0] || null;
    const reader=find('#correspondence-reader-content');
    if(!active){
      reader.innerHTML='<div class="correspondence-empty-state"><span class="correspondence-empty-icon" aria-hidden="true">✉</span><h3>Select a message</h3><p>Choose an email from the inbox to read the full correspondence.</p></div>';
      return;
    }
    const incoming=isAttorneyEmail(active);
    const title=active.title.replace(/^\[ATTY EMAIL\] /,'');
    const stamp=active.date?escape(active.date):'Saved draft';
    const body=active.notes||'No message body has been saved.';
    reader.innerHTML='<article class="correspondence-message"><div class="correspondence-message-top"><span class="correspondence-type-badge">'+icon+' '+(incoming?'Email received':'Email draft')+'</span><div class="correspondence-message-actions"><button type="button" data-edit="'+escape(active.id)+'">Edit</button><button type="button" data-remove="'+escape(active.id)+'" aria-label="Delete correspondence">Delete</button></div></div><h3>'+escape(title)+'</h3><dl class="correspondence-meta"><div><dt>From</dt><dd>'+escape(incoming?active.recipient||'Unknown sender':'Prevail Family Law staff')+'</dd></div><div><dt>To</dt><dd>'+escape(incoming?'Prevail Family Law staff':active.recipient||'No recipient added')+'</dd></div><div><dt>Date</dt><dd>'+stamp+'</dd></div><div><dt>Matter</dt><dd>'+escape(active.matter||'No matter linked')+'</dd></div></dl><div class="correspondence-message-body"><pre>'+escape(body)+'</pre></div>'+(incoming?'<div class="correspondence-internal-note"><strong>Private internal note</strong><p>Keep internal notes in the matter record. The received message is shown above.</p></div>':'')+'<div class="correspondence-compose-tabs" role="group" aria-label="Reply actions"><button type="button" class="is-active" data-correspondence-compose="reply">↶ Reply</button><button type="button" data-correspondence-compose="reply-all">⇇ Reply all</button><button type="button" data-correspondence-compose="forward">↪ Forward</button></div></article>';
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
        title:'Jordan Lee', date:today(), time:'10:00', calendar:'admin', priority:'High', approvalStatus:'pending', createdAt:new Date(),
        notes:'Sample request to discuss parenting arrangements.', contact:{
          firstName:'Jordan', lastName:'Lee', email:'jordan.lee@example.com', phone:'0400 123 456',
          topic:'parenting', newClient:'Yes'
        }
      }];
      consultationRequestsLoaded = true;
      renderCalendar();
      renderDashboard();
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
            title:name, notes:String(record.message || ''), contact, date:match?.[1] || '', time:match?.[2] || '',
            calendar:'admin', priority:'High', done:false, approvalStatus:record.approvalStatus || 'pending', createdAt:record.createdAt
          };
        }).filter(Boolean);
        consultationRequestsLoaded = true;
        renderCalendar();
        renderDashboard();
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

  document.getElementById("staff-checklist").addEventListener("click", async event => {
    const button = event.target.closest("[data-approval-action]");
    if (!button || button.disabled) return;
    const requestId = button.dataset.requestId;
    const nextStatus = button.dataset.approvalAction;
    const request = consultationRequests.find(item => item.requestId === requestId);
    if (!request) return;
    if (nextStatus === "declined" && !window.confirm("Decline this consultation request?")) return;
    button.disabled = true;
    const card = button.closest(".calendar-approval-card");
    const status = card.querySelector(".calendar-approval-status");
    status.textContent = "Saving decision…";
    try {
      if (sampleMode) {
        consultationRequests = consultationRequests.map(item => item.requestId === requestId
          ? {...item, approvalStatus:nextStatus} : item);
      } else {
        await updateDoc(doc(db, "clientInbox", requestId), {
          approvalStatus:nextStatus,
          approvalUpdatedAt:serverTimestamp(),
          approvalUpdatedBy:uid
        });
      }
      renderCalendar();
      notify(nextStatus === "approved" ? "Consultation approved" : "Consultation declined",
        nextStatus === "approved"
          ? "The request is now marked as approved and appears on the calendar."
          : "The request was removed from the calendar and remains in Client Messages.");
    } catch (error) {
      button.disabled = false;
      const approvalHelp = error?.code === "permission-denied"
        ? "Firebase rejected this approval. Publish the consultation update rule and confirm your staff role."
        : "The request is still awaiting review. Check the connection and try again.";
      status.textContent = approvalHelp;
      notify("Approval was not saved", approvalHelp, true);
    }
  });

  find("#matter-workflow-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const matter = String(values.get("matter") || "").trim();
    const workflow = String(values.get("workflow") || "general");
    const steps = matterWorkflowSteps[workflow] || matterWorkflowSteps.general;
    const status = find("#matter-workflow-status");
    const submit = form.querySelector("button[type='submit']");
    if (!matter) {
      status.textContent = "Enter a matter reference first.";
      return;
    }
    if (!loaded) {
      status.textContent = "Wait for the matter workspace to finish loading.";
      return;
    }
    submit.disabled = true;
    status.textContent = "Adding linked matter tasks…";
    try {
      if (sampleMode) {
        const created = steps.map(title => ({
          id:crypto.randomUUID(), kind:"Task", title,
          notes:"Workflow: " + matterWorkflowNames[workflow] + ". Confirm any legal dates with the supervising solicitor.",
          matter, date:"", priority:"Normal", done:false, recipient:"",
          updatedAt:{toMillis:() => Date.now()}
        }));
        records = [...created, ...records];
        render();
      } else {
        const batch = writeBatch(db);
        for (const title of steps) {
          batch.set(doc(items), {
            kind:"Task", title,
            notes:"Workflow: " + matterWorkflowNames[workflow] + ". Confirm any legal dates with the supervising solicitor.",
            matter, date:"", priority:"Normal", done:false, recipient:"",
            updatedAt:serverTimestamp()
          });
        }
        await batch.commit();
      }
      selectedMatter = matter.toLowerCase();
      status.textContent = steps.length + " tasks were added to " + matter + ". Assign dates after solicitor review.";
      form.elements.matter.value = "";
      notify("Matter workflow started", steps.length + " linked tasks added to " + matter + ".");
    } catch (error) {
      status.textContent = "The workflow could not be saved. Check your staff access and try again.";
      notify("Matter workflow not saved", "No tasks were confirmed as created.", true);
    } finally {
      submit.disabled = false;
    }
  });

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
      ...(scope.value === 'admin' ? consultationRequests.filter(item => item.date === dayKey && item.approvalStatus !== 'declined') : [])
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
      status.textContent = isConsultation
        ? item.approvalStatus === 'approved' ? 'Approved & scheduled' : 'Awaiting attorney review'
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
  staffFilter.addEventListener('change', () => { selectedDay = ''; renderCalendar(); });
  for(const tab of find('#work-calendar').querySelectorAll('[data-calendar-view]'))tab.addEventListener('click',()=>{calendarMode=tab.dataset.calendarView;renderCalendar();});
  for(const list of [find('#calendar-upcoming-list'),find('#calendar-later-list')])list.addEventListener('click',event=>{
    const item=event.target.closest('[data-calendar-day]');if(!item)return;
    selectedDay=item.dataset.calendarDay;calendarMode='week';month.value=selectedDay.slice(0,7);renderCalendar();showCalendarDayDialog(selectedDay);
  });
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
  find('#correspondence-search').addEventListener('input',renderDrafts);
  find('#correspondence-sort').addEventListener('change',renderDrafts);
  for(const tab of root.querySelectorAll('[data-corr-filter]')) tab.addEventListener('click',()=>{
    correspondenceFilter=tab.dataset.corrFilter;
    for(const other of root.querySelectorAll('[data-corr-filter]')) other.setAttribute('aria-selected',String(other===tab));
    renderDrafts();
  });
  find('#correspondence-items').addEventListener('click',event=>{
    const row=event.target.closest('[data-correspondence-id]');if(!row)return;
    selectedCorrespondenceId=row.dataset.correspondenceId;
    find('#correspondence-layout').classList.remove('is-reader-closed');
    find('#correspondence-layout').classList.add('has-selected');
    renderDrafts();
  });
  const correspondenceLayout=find('#correspondence-layout');
  find('#correspondence-list-close').addEventListener('click',()=>{correspondenceLayout.classList.add('is-list-collapsed');find('#correspondence-list-open').hidden=false;});
  find('#correspondence-list-open').addEventListener('click',()=>{correspondenceLayout.classList.remove('is-list-collapsed');find('#correspondence-list-open').hidden=true;});
  find('#correspondence-reader-close').addEventListener('click',()=>{correspondenceLayout.classList.remove('has-selected');correspondenceLayout.classList.add('is-reader-closed');});
  find('#correspondence-reader-list').addEventListener('click',()=>{correspondenceLayout.classList.remove('is-list-collapsed');find('#correspondence-list-open').hidden=true;});
  find('#correspondence-reader-content').addEventListener('click',event=>{
    const compose=event.target.closest('[data-correspondence-compose]');
    if(compose){
      const active=records.find(item=>item.id===selectedCorrespondenceId);if(!active)return;
      const incoming=isAttorneyEmail(active);
      const title=active.title.replace(/^\[ATTY EMAIL\] /,'');
      const mode=compose.dataset.correspondenceCompose;
      const recipient=mode==='forward'?'':(incoming?active.recipient||'':active.recipient||'');
      open(editors['Email draft'],null,{title:(mode==='forward'?'Fwd: ':'Re: ')+title,recipient,matter:active.matter||'',notes:mode==='forward'?'Forwarded message:\\n\\n'+(active.notes||''):'\\n\\nOn '+(active.date||'the previous message')+', '+(active.recipient||'the sender')+' wrote:\\n'+(active.notes||'')});
      return;
    }
  });

  const emailImport=find('#attorney-email-form');
  const emailToggle=find('#attorney-email-toggle');
  emailToggle.addEventListener('click',()=>{emailImport.hidden=!emailImport.hidden;emailToggle.setAttribute('aria-expanded',String(!emailImport.hidden));if(!emailImport.hidden)emailImport.querySelector('input').focus();});
  find('#attorney-email-cancel').addEventListener('click',()=>{emailImport.reset();emailImport.hidden=true;emailToggle.setAttribute('aria-expanded','false');});
  emailImport.addEventListener('submit',async event=>{
    event.preventDefault();if(!loaded)return;
    const values=new FormData(emailImport);const sender=String(values.get('sender')||'').trim();const subject=String(values.get('subject')||'').trim();const body=String(values.get('body')||'').trim();
    const output=find('#attorney-email-status');const save=emailImport.querySelector('[type="submit"]');
    if(!sender||!subject||!body){output.textContent='Enter the sender, subject and full email.';return;}
    save.disabled=true;output.textContent='Saving email…';
    const data={kind:'Email draft',title:'[ATTY EMAIL] '+subject.slice(0,145),notes:body,matter:String(values.get('matter')||'').trim(),date:String(values.get('received')||''),priority:'Normal',done:false,recipient:sender,updatedAt:serverTimestamp()};
    try{if(sampleMode){records.unshift({...data,id:crypto.randomUUID(),updatedAt:{toMillis:()=>Date.now()}});render();}else await addDoc(items,data);emailImport.reset();emailImport.hidden=true;emailToggle.setAttribute('aria-expanded','false');output.textContent='';notify('Attorney email saved','Open the full message, then generate a task for review.');}
    catch{output.textContent='Could not save this email. Check workspace access and try again.';}
    finally{save.disabled=false;}
  });
  const taskDialog=find('#email-task-dialog');const taskForm=find('#email-task-form');let sourceEmail=null;
  find('[data-close-email-task]').addEventListener('click',()=>taskDialog.close());
  find('#email-ai-generate').addEventListener('click',async()=>{
    const summary=find('#email-task-summary');const consent=find('#email-ai-consent');const generate=find('#email-ai-generate');
    if(!consent.checked){summary.textContent='Check the confirmation box before sending email content to OpenAI.';return;}
    if(sampleMode){summary.textContent='Sample mode does not send email content to AI. Enter the task details manually.';return;}
    if(!sourceEmail||!authUser){summary.textContent='A signed-in staff session is required.';return;}
    generate.disabled=true;summary.textContent='Generating a suggestion…';
    try{
      const token=await authUser.getIdToken();
      const response=await fetch('/api/summarize-attorney-email',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({from:sourceEmail.recipient,subject:sourceEmail.title.replace(/^\[ATTY EMAIL\] /,''),received:sourceEmail.date,body:sourceEmail.notes})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'AI task generation is unavailable.');
      summary.textContent=result.summary||'Summary ready for review.';
      taskForm.elements.title.value=result.task?.title||'Review attorney email';
      taskForm.elements.notes.value=result.task?.notes||result.summary||'';
      taskForm.elements.date.value=result.task?.deadline||'';
      taskForm.elements.priority.value=['Urgent','High','Normal','Low'].includes(result.task?.priority)?result.task.priority:'Normal';
    }catch(error){summary.textContent=error.message||'Could not create an AI suggestion. You can still complete the task manually.';}
    finally{generate.disabled=false;}
  });
  taskForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!loaded||!sourceEmail)return;
    const values=new FormData(taskForm);const save=taskForm.querySelector('[type="submit"]');const output=taskForm.querySelector('[role="status"]');
    const title=String(values.get('title')||'').trim();if(!title){output.textContent='Enter a task title.';return;}
    save.disabled=true;output.textContent='Saving task…';
    const data={kind:'Task',title:title.slice(0,160),notes:String(values.get('notes')||'').trim(),matter:String(values.get('matter')||'').trim(),date:String(values.get('date')||''),priority:String(values.get('priority')||'Normal'),done:false,recipient:'',updatedAt:serverTimestamp()};
    try{if(sampleMode){records.unshift({...data,id:crypto.randomUUID(),updatedAt:{toMillis:()=>Date.now()}});render();}else await addDoc(items,data);taskDialog.close();notify('Task created',title);}
    catch{output.textContent='Could not create the task. Check workspace access and try again.';}
    finally{save.disabled=false;}
  });
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
    const generateEmailTask=event.target.closest('[data-generate-email-task]');
    if(generateEmailTask){
      sourceEmail=records.find(item=>item.id===generateEmailTask.dataset.generateEmailTask);
      if(!sourceEmail||!loaded)return;
      const subject=sourceEmail.title.replace(/^\[ATTY EMAIL\] /,'');
      find('#email-task-summary').textContent='Review the full email first. AI processing is optional and requires your confirmation.';
      find('#email-ai-consent').checked=false;
      taskForm.elements.title.value='Review attorney email: '+subject;
      taskForm.elements.matter.value=sourceEmail.matter||'';
      taskForm.elements.date.value='';
      taskForm.elements.priority.value='Normal';
      taskForm.elements.notes.value='Review the attorney email and confirm the next steps.';
      find('.email-task-source').textContent='Source: '+(sourceEmail.recipient||'Attorney')+' · '+subject;
      taskDialog.showModal();
      return;
    }
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
