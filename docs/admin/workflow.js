Warning: truncated output (original token count: 32476)
Total output lines: 1694

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
const appointmentTypes = {
  'client-meeting': {label:'Client Meeting', icon:'<circle cx="9" cy="8" r="3"></circle><path d="M3 19v-1a6 6 0 0 1 12 0v1"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M16 15a5 5 0 0 1 5 5"></path>'},
  'court-hearing': {label:'Court Hearing', icon:'<path d="M3 10h18M5 10v9m4-9v9m6-9v9m4-9v9M3 21h18M12 3 2 8v2h20V8L12 3Z"></path>'},
  'filing-deadline': {label:'Filing Deadline', icon:'<path d="M6 2h9l5 5v15H6z"></path><path d="M14 2v6h6M9 13h8m-8 4h8"></path>'},
  'internal-meeting': {label:'Internal Meeting', icon:'<circle cx="9" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M3 19v-1a6 6 0 0 1 12 0v1m1-4a5 5 0 0 1 5 5"></path>'},
  'other': {label:'Other', icon:'<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M16 2v4M8 2v4M3 9h18"></path>'}
};
const appointmentType = item => appointmentTypes[item.eventType] ? item.eventType : 'client-meeting';
const appointmentTypeLabel = item => appointmentTypes[appointmentType(item)].label;
const appointmentIcon = item => '<svg class="calendar-event-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+appointmentTypes[appointmentType(item)].icon+'</svg>';
const consultationIcon = () => '<svg class="calendar-event-icon calendar-consultation-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.6 8.6 0 0 1-3.4-.7L4 20l1.5-3.8A7.2 7.2 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"></path><path d="M9 11h6m-3-3v6"></path></svg>';
const calendarIcon = item => item.kind==='Consultation request' ? consultationIcon() : item.kind==='Appointment' ? appointmentIcon(item) : '';

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
  let allEnquiryContacts = [];
  let selectedContactKey = '';
  let contactSearchQuery = '';
  let contactTypeFilter = 'all';
  let contactMatterFilter = 'all';
  let contactStatusFilter = 'all';
  let activeContactTab = 'details';
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
  <div class="calendar-controls">
   <div class="calendar-date-controls"><button type="button" id="work-calendar-today">Today</button><button type="button" class="calendar-step-btn" data-month-step="-1" aria-label="Previous month"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m14.5 5-7 7 7 7"/></svg></button><button type="button" class="calendar-step-btn" data-month-step="1" aria-label="Next month"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9.5 5 7 7-7 7"/></svg></button><label class="calendar-month-label"><span id="calendar-month-title">November 2026</span><input id="work-month" type="month" aria-label="Choose calendar month"></label></div>
   <div class="calendar-view-switch" role="tablist" aria-label="Calendar view">${['month','week','agenda'].map(view=>'<button type="button" role="tab" data-calendar-view="'+view+'" aria-selected="'+(view==='month')+'">'+view[0].toUpperCase()+view.slice(1)+'</button>').join('')}</div>
   <label class="calendar-filter-label">Calendar<select id="work-calendar-scope">${calendarOptions}</select></label>
   <label class="calendar-filter-label">Staff<select id="work-calendar-staff"><option value="">All staff</option></select></label>
   <button type="button" class="work-button calendar-add-event" data-create-schedule aria-haspopup="dialog" aria-controls="schedule-dialog"><span aria-hidden="true">＋</span> Add Event</button>
  </div>
  <dialog id="schedule-dialog" class="schedule-dialog" aria-labelledby="schedule-form-title">
  ${editorMarkup('schedule-form', 'Add schedule', `
   <label>Event type<div class="schedule-event-type" id="schedule-event-type" data-appointment-type="client-meeting"><span id="schedule-event-type-icon">${appointmentIcon({eventType:'client-meeting'})}</span><select name="eventType" required>${Object.entries(appointmentTypes).map(([value,detail]) =>
    `<option value="${value}">${detail.label}</option>`).join('')}</select></div></label>
   <label>Title<input name="title" maxlength="160" required placeholder="e.g. Initial parenting consultation"></label>${matterField}
   <label>Calendar<select name="calendar">${calendarOptions}</select></label>
   <label>Date (Sydney)<input name="date" type="date" required></label>
   <label>Start time<input name="time" type="time"></label>
   <label>End time<input name="endTime" type="time"></label>
   <label>Assigned to<input name="assignedTo" maxlength="100" placeholder="Staff member"></label>`,
   'Schedule details', 'Save Schedule', true)}
  <button type="button" id="retry-calendar-access" hidden>Retry calendar connection</button>
  </dialog>
  <p class="consultation-calendar-status" id="consultation-calendar-status" role="status"></p>
  <div class="calendar-main-layout">
   <main class="calendar-month-card"><div id="work-month-grid" data-calendar-mode="month"></div>
    <div class="calendar-legend" aria-label="Event types"><span data-appointment-type="client-meeting"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><path d="M3 19v-1a6 6 0 0 1 12 0v1"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M16 15a5 5 0 0 1 5 5"></path></svg>Client Meeting</span><span data-appointment-type="court-hearing"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18M5 10v9m4-9v9m6-9v9m4-9v9M3 21h18M12 3 2 8v2h20V8L12 3Z"></path></svg>Court Hearing</span><span data-appointment-type="filing-deadline"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v15H6z"></path><path d="M14 2v6h6M9 13h8m-8 4h8"></path></svg>Filing Deadline</span><span data-appointment-type="internal-meeting"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M3 19v-1a6 6 0 0 1 12 0v1m1-4a5 5 0 0 1 5 5"></path></svg>Internal Meeting</span><span data-appointment-type="other"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M16 2v4M8 2v4M3 9h18"></path></svg>Other</span><span data-event-type="consultation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.6 8.6 0 0 1-3.4-.7L4 20l1.5-3.8A7.2 7.2 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"></path><path d="M9 11h6m-3-3v6"></path></svg>New consultation enquiry</span><span data-event-type="task">Task / deadline</span><span data-event-type="note">Calendar note</span></div>
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
<section class="workflow-panel matter-management" id="work-matters">
  <header class="matter-page-heading">
   <div><span class="matter-page-accent" aria-hidden="true"></span><div><p>Manage open files, clients, matter types and important dates.</p></div></div>
   <button type="button" class="pm-button pm-primary matter-new-button" data-open-dialog="pm-matter-dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>New Matter</button>
  </header>
  <section class="matter-summary-cards" aria-label="Matter summary">
   <article><span class="matter-summary-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h18v12H3zM8 8V5h8v3M3 12h18"></path></svg></span><div><small>Open matters</small><strong id="matter-stat-open">0</strong></div></article>
   <article><span class="matter-summary-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M12 8v8M8 12h8"></path></svg></span><div><small>New this month</small><strong id="matter-stat-new">0</strong></div></article>
   <article><span class="matter-summary-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 11a3 3 0 1 0 0-6M17 15a5 5 0 0 1 4 5"></path></svg></span><div><small>Active clients</small><strong id="matter-stat-clients">0</strong></div></article>
   <article><span class="matter-summary-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8 12 3 3 5-6"></path></svg></span><div><small>Finalised this month</small><strong id="matter-stat-finalised">0</strong></div></article>
  </section>
  <section class="matter-directory-card" aria-label="Matter directory">
   <div class="matter-directory-toolbar">
    <label class="matter-search"><span>Search matters</span><input id="matter-search" type="search" placeholder="Matter reference, name or client"></label>
    <label><span>Type</span><select id="matter-type-filter"><option value="">All types</option><option>Parenting arrangements</option><option>Property settlement</option><option>Separation</option><option>Divorce</option><option>Financial agreement</option><option>Consent orders</option><option>Other family law</option></select></label>
    <label><span>Status</span><select id="matter-status-filter"><option value="">All statuses</option><option>Active</option><option>In Progress</option><option>On Hold</option><option>Closed</option></select></label>
    <label><span>Responsible</span><select id="matter-solicitor-filter"><option value="">All staff</option></select></label>
    <button type="button" class="matter-clear-filters" id="matter-clear-filters">Clear filters</button>
   </div>
   <div class="matter-table-scroll"><table id="pm-matter-table" class="pm-table matter-table"><thead><tr><th scope="col">Matter ref</th><th scope="col">Matter</th><th scope="col">Client</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Next date</th><th scope="col">Responsible</th></tr></thead><tbody><tr><td class="pm-empty" colspan="7">Loading matters…</td></tr></tbody></table></div>
   <footer class="matter-table-footer"><span id="matter-page-count">Loading matter records…</span><div><button type="button" id="matter-page-prev" aria-label="Previous page" disabled>‹</button><span id="matter-page-current">1</span><button type="button" id="matter-page-next" aria-label="Next page" disabled>›</button></div></footer>
  </section>
  <button type="button" id="new-follow-up" hidden>Add follow-up</button>
  <div class="matter-legacy-tools" hidden aria-hidden="true">  <section class="matter-workflow-box" aria-labelledby="matter-workflow-title">
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
  <p id="work-matter-count" role="status"></p><div class="matter-split"><div id="work-matter-list"></div><section id="work-matter-detail" aria-label="Selected matter"></section></div></div>
 </section>
 <section class="workflow-panel correspondence-workspace" id="work-email">
  <header class="correspondence-page-head">
   <div><span class="correspondence-accent" aria-hidden="true"></span><div><p>Review received emails and prepare clear, matter-linked replies.</p></div></div>
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
  root.insertAdjacentHTML('beforeend', '<dialog id="calendar-day-dialog" class="schedule-dialog calendar-day-dialog" aria-labelledby="calendar-day-title"><header class="calendar-day-dialog-head"><div><p>Calendar details</p><h2 id="calendar-day-title"></h2><span id="calendar-day-subtitle"></span></div><button type="button" data-close-calendar-day aria-label="Close day details">×</button></header><div id="calendar-day-items" class="calendar-day-items"></div><footer><button type="button" class="work-button calendar-day-add" id="calendar-day-add-schedule"><span aria-hidden="true">＋</span> Add schedule on this date</button><button type="button" class="calendar-day-close" data-close-calendar-day>Close</button></footer></dialog>');
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
    if (editor === editors.Appointment) syncScheduleEventType();
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
    if(approvalBadge){appro…12476 tokens truncated…onFeedReady = false;
  let consultationRequestIds = new Set();
  function listenForConsultationRequests() {
    stopConsultations?.();
    if (sampleMode) {
      const addDays=days=>{const value=new Date(today()+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);};
      consultationRequests = [
        {id:'sample-consultation-1', requestId:'sample-consultation-1', kind:'Consultation request',title:'Jordan Lee',date:today(),time:'10:00',calendar:'admin',priority:'High',approvalStatus:'pending',createdAt:new Date(),notes:'Sample request to discuss parenting arrangements.',contact:{firstName:'Jordan',lastName:'Lee',email:'jordan.lee@example.com',phone:'0400 123 456',topic:'parenting',newClient:'Yes'}},
        {id:'sample-consultation-2', requestId:'sample-consultation-2', kind:'Consultation request',title:'Mia Bennett',date:addDays(1),time:'13:00',calendar:'client',priority:'Normal',approvalStatus:'pending',createdAt:new Date(Date.now()-3600000),notes:'Sample enquiry about school-holiday arrangements.',contact:{firstName:'Mia',lastName:'Bennett',email:'mia.bennett@example.com',phone:'0400 234 567',topic:'parenting',newClient:'Yes'}},
        {id:'sample-consultation-3', requestId:'sample-consultation-3', kind:'Consultation request',title:'Alex Taylor',date:addDays(2),time:'11:30',calendar:'admin',priority:'Normal',approvalStatus:'pending',createdAt:new Date(Date.now()-7200000),notes:'Sample enquiry about a property settlement.',contact:{firstName:'Alex',lastName:'Taylor',email:'alex.taylor@example.com',phone:'0400 345 678',topic:'property-settlement',newClient:'Yes'}}
      ];
      allEnquiryContacts = consultationRequests.slice();
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
        allEnquiryContacts = snapshot.docs.map(document => {
          const record = document.data();
          if (record.kind !== 'consultation') return null;
          const contact = record.contact || {};
          const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(String(contact.preferredTime || ''));
          const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Consultation inquiry';
          return {
            id:'consultation-' + document.id, requestId:document.id, kind:'Consultation request',
            title:name, notes:String(record.message || ''), contact, date:match?.[1] || '', time:match?.[2] || '',
            calendar:'admin', priority:'High', done:false, approvalStatus:record.approvalStatus || 'pending', createdAt:record.createdAt
          };
        }).filter(Boolean);
        consultationRequests = allEnquiryContacts.filter(item => item.date);
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
  document.querySelectorAll('[data-settings-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.settingsTab;
      document.querySelectorAll('[data-settings-tab]').forEach(button => button.setAttribute('aria-selected', String(button === tab)));
      document.querySelectorAll('[data-settings-panel]').forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== name; });
    });
    tab.addEventListener('keydown', event => {
      const tabs = [...document.querySelectorAll('[data-settings-tab]')];
      const index = tabs.indexOf(tab);
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) { event.preventDefault(); next.focus(); next.click(); }
    });
  });
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
      if (item.kind === 'Appointment') card.dataset.appointmentType = appointmentType(item);
      const top = document.createElement('div');
      top.className = 'calendar-day-item-top';
      const heading = document.createElement('h3');
      heading.textContent = item.title || (isConsultation ? 'Consultation enquiry' : 'Scheduled item');
      const typeIcon = document.createElement('span');
      typeIcon.className = 'calendar-day-item-icon';
      if (isConsultation) { typeIcon.dataset.eventType = 'consultation'; typeIcon.innerHTML = consultationIcon(); }
      else if (item.kind === 'Appointment') { typeIcon.dataset.appointmentType = appointmentType(item); typeIcon.innerHTML = appointmentIcon(item); }
      const status = document.createElement('span');
      status.className = 'calendar-day-item-status';
      status.textContent = isConsultation
        ? item.approvalStatus === 'approved' ? 'Approved & scheduled' : 'Awaiting attorney review'
        : item.done ? 'Completed' : item.kind === 'Task' ? 'Task' : item.kind === 'Appointment' ? appointmentTypeLabel(item) : 'Scheduled';
      top.append(typeIcon, heading, status);
      const meta = document.createElement('p');
      const time = item.time ? new Intl.DateTimeFormat('en-AU', {
        hour:'numeric', minute:'2-digit', timeZone:'UTC'
      }).format(new Date('2026-01-01T' + item.time + ':00Z')) + (item.endTime ? ' – ' + new Intl.DateTimeFormat('en-AU', {hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date('2026-01-01T' + item.endTime + ':00Z')) : '') + ' Sydney time' : 'Time not set';
      meta.className = 'calendar-day-item-meta';
      meta.textContent = [item.kind === 'Appointment' ? appointmentTypeLabel(item) : item.kind, time, item.matter, item.assignedTo && 'Assigned to ' + item.assignedTo].filter(Boolean).join(' · ');
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
      if (editor === scheduleEditor) Object.assign(data, {calendar:get('calendar'), time:get('time'), endTime:get('endTime'), assignedTo:get('assignedTo'), eventType:get('eventType') || 'client-meeting'});
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
