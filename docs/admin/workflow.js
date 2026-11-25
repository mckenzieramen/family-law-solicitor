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
  let lastCompletionPercent=0;let selectedTaskId='',taskView='list',taskPage=1;
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
  root.innerHTML = `<style>#work-queue select.tw-status-select{appearance:none;-webkit-appearance:none;cursor:pointer;border:0!important;min-width:0!important;width:auto!important;max-width:100%;text-align:center;padding:4px 9px!important;font-size:inherit;line-height:1.3;background-image:none!important}#work-queue select.tw-status-select:focus-visible{outline:2px solid #a47b36;outline-offset:2px}#work-queue select.tw-status-select option{background:#fcfaf6;color:#102438}#task-dialog{width:min(700px,calc(100% - 32px));max-height:88dvh;overflow:hidden;background:#fcfaf6;border:1px solid #ded3c4;border-radius:14px;padding:22px}#task-form{max-height:calc(88dvh - 44px);overflow:auto;scrollbar-width:thin;display:flex;flex-direction:column;gap:12px}#task-form[hidden]{display:none}#task-form h3{position:sticky;top:0;background:#fcfaf6;z-index:2;font:600 25px Georgia;color:#102438;padding:8px 0;margin:0}#task-form .work-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#task-form .task-wide{grid-column:1/-1}#task-form .create-bullets{max-height:180px;overflow:auto;display:grid;gap:8px}#task-form .create-bullet{display:flex;align-items:center;gap:8px}#task-form .create-bullet i{width:17px;height:17px;border:1px solid #a47b36;border-radius:50%;flex:none}#task-form .create-bullet input{flex:1;min-width:0}#task-form .create-footer{position:sticky;bottom:0;background:#fcfaf6;padding:10px 0;display:flex;gap:8px;z-index:2}#work-queue .tw-table tbody tr[data-task-deadline] td{transition:background-color .45s ease}#work-queue .tw-table tbody tr[data-task-deadline=soon] td{background:#fff6df!important}#work-queue .tw-table tbody tr[data-task-deadline=late] td{background:#fcebea!important}#work-queue .tw-table tbody tr[data-task-deadline=done] td{background:#edf5e9!important}#work-queue .tw-table tbody tr[data-task-deadline=soon] td:first-child{box-shadow:inset 2px 0 #e5d4a5}#work-queue .tw-table tbody tr[data-task-deadline=late] td:first-child{box-shadow:inset 2px 0 #e6bcb7}#work-queue .tw-table tbody tr[data-task-deadline=done] td:first-child{box-shadow:inset 2px 0 #c4d9ba}#work-queue .tw-table tbody tr.tw-selected[data-task-deadline]:not([data-task-deadline=neutral]) td{border-bottom-color:#b9a98d}#work-queue .tw-pill[data-deadline-status=late]{background:#f8d5cf!important;color:#982d25!important}#work-queue .tw-pill[data-deadline-status=soon]{background:#fff0b3!important;color:#795b0a!important}#work-queue .tw-due-time{display:block;font-size:11px;color:#65717d;margin-top:3px}#work-queue .tw-table button.tw-check:focus-visible{outline:2px solid #a47b36!important;outline-offset:3px!important;border-radius:50%!important}#work-queue .tw-table button.tw-check svg{flex-shrink:0!important;aspect-ratio:1!important}#work-queue .tw-grid{gap:14px;height:var(--tw-height,480px);min-height:0;align-items:stretch}#work-queue .tw-detail{flex:0 0 clamp(300px,32%,420px);width:auto;min-width:0;padding:16px;gap:10px;overflow:auto;scrollbar-width:thin}#work-queue .tw-detail header{flex-shrink:0;padding-bottom:10px}#work-queue .tw-detail h2{font-size:21px;line-height:1.25;margin:6px 0}#work-queue .tw-detail dl{gap:12px;margin:8px 0;padding-top:12px}#work-queue .tw-detail dd{font-size:13px;margin:4px 0 0;overflow-wrap:anywhere}#work-queue .tw-detail p{font-size:13px;line-height:1.5;margin:0}#work-queue .tw-detail footer{flex-shrink:0;padding-top:8px}#work-queue .tw-table{min-width:700px;table-layout:auto;font-size:13px!important}#work-queue .tw-table th{padding:10px 8px;font-size:12px!important;white-space:nowrap}#work-queue .tw-table td{padding:12px 8px;line-height:1.4}#work-queue .tw-table .tw-title{border:0!important;box-shadow:none!important;background:transparent!important;padding:0!important;font-size:13px!important;white-space:normal;text-align:left;min-height:0!important}#work-queue .tw-table small{font-size:11px!important;white-space:normal}#work-queue .tw-table td:first-child{width:38px;min-width:38px}#work-queue .tw-table .tw-check{width:22px!important;height:22px!important;min-width:22px!important;min-height:22px!important;max-width:22px!important;max-height:22px!important;aspect-ratio:1;box-sizing:border-box;line-height:1!important}#work-queue #tw-metrics>button[data-tw-filter]{min-height:60px!important}#work-queue #tw-metrics strong{font-size:23px!important}#work-queue #tw-metrics span{font-size:12px!important}#work-queue .tw-table-scroll{scrollbar-width:thin}#work-queue .tw-pagination{flex-shrink:0}@media(max-width:900px){#work-queue .tw-grid{height:auto;flex-direction:column}#work-queue .tw-detail{flex:auto;width:100%;max-height:600px}#work-queue .tw-list{min-height:300px}}#work-queue .tw-list.tw-is-empty .tw-table-scroll{flex:0 0 auto}#work-queue .tw-list.tw-is-empty .tw-board{display:none}#work-queue .tw-empty-center{flex:1;min-height:100px;display:grid;place-items:center;text-align:center;padding:16px;color:#65717d;font-size:13px}#work-queue #tw-metrics{gap:10px!important;margin:0 0 12px!important}#work-queue #tw-metrics>button[data-tw-filter]{min-height:56px!important;padding:8px 10px!important;gap:9px!important;flex-wrap:nowrap!important;transition:border-color .4s ease,box-shadow .25s ease,color .4s ease;box-shadow:0 2px 5px #10243809}#work-queue #tw-metrics i{width:32px!important;height:32px!important;flex-shrink:0;transition:background .45s ease,color .45s ease}#work-queue #tw-metrics i svg{width:18px!important;height:18px!important}#work-queue #tw-metrics strong{font-size:21px!important;line-height:1.05}#work-queue #tw-metrics span{font-size:11px!important}#work-queue #tw-metrics .tw-completion-label{font-size:10px;white-space:nowrap;margin-left:auto}#work-queue #tw-metrics .tw-completion-card:before{transition:width .9s cubic-bezier(.22,1,.36,1),background .55s ease}#work-queue #tw-metrics>button[data-tw-filter]:hover{box-shadow:0 3px 9px #10243816}@media(prefers-reduced-motion:reduce){#work-queue #tw-metrics .tw-completion-card:before,#work-queue #tw-metrics>button[data-tw-filter],#work-queue #tw-metrics i{transition:none!important}}#work-queue #tw-metrics .tw-completion-card{position:relative;isolation:isolate;overflow:hidden;background:#fffdf9!important;flex-wrap:wrap}#work-queue #tw-metrics .tw-completion-card:before{content:'';position:absolute;inset:0 auto 0 0;width:var(--tw-completion,0%);background:#efe0bd;z-index:-1;transition:width .65s ease,background .4s ease}#work-queue #tw-metrics .tw-completion-card[data-complete=true]:before{background:#dcebd5}#work-queue #tw-metrics .tw-completion-card[data-complete=true]{border-color:#82a67b;color:#286038}#work-queue #tw-metrics .tw-completion-card[data-complete=true] i{background:#c6dfbd;color:#286038}.tw-completion-label{margin-left:auto;font-size:11px;font-weight:600;color:inherit}@media(prefers-reduced-motion:reduce){#work-queue #tw-metrics .tw-completion-card:before{transition:none}}#work-queue .tw-check{border-radius:50%!important;width:22px!important;height:22px!important;min-width:22px;padding:0!important;display:inline-grid;place-items:center;border:1.5px solid #b8a482;background:transparent;color:#fff}#work-queue .tw-check[aria-pressed=true]{background:#a47b36;border-color:#a47b36}#work-queue .tw-table tbody tr:hover{background:#f5ecdb}#work-queue .tw-deadline{display:block;font-size:11px;font-weight:600;margin-top:4px;color:#65717d}#work-queue .tw-deadline[data-deadline=late]{color:#a1322b}#work-queue .tw-deadline[data-deadline=soon]{color:#946619}#work-queue .tw-deadline[data-deadline=done]{color:#386542}.tw-checklist{display:grid;gap:10px;margin:8px 0 16px}.tw-checklist label{display:flex;align-items:center;gap:9px;font-size:14px}.tw-checklist input{accent-color:#a47b36;width:17px;height:17px}.tw-checklist input:checked+span{text-decoration:line-through;color:#65717d}.tw-progress{width:100%;height:6px;accent-color:#a47b36}.tw-check-count{float:right;font-weight:400}.tw-detail h4{font-size:14px;margin:10px 0 4px}.tw-table tbody tr{cursor:pointer}#work-queue #tw-metrics{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0 20px}#tw-metrics>button{flex:1;min-width:110px;text-align:left;background:#fffdf9;border:1px solid #ded3c4;border-radius:9px;padding:15px;color:#102438}#tw-metrics>button[aria-pressed=true]{border-color:#a47b36;background:#f7edda}#tw-metrics strong{display:block;font:700 28px Georgia}#tw-metrics span{font-size:12px}.tw-switch{display:flex;align-items:center;gap:5px}.tw-grid{display:flex;gap:12px;min-height:340px}.tw-list{flex:1;min-width:0;overflow:auto;border:1px solid #ded3c4;border-radius:9px;background:#fffdf9}.tw-detail{width:30%;min-width:240px;border:1px solid #ded3c4;border-radius:9px;padding:16px;background:#fffdf9;display:flex;flex-direction:column;color:#102438}.tw-detail header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ded3c4}.tw-detail h2{font:700 22px Georgia}.tw-detail dt{color:#65717d;font-size:12px}.tw-detail dd{margin:4px 0 12px;font-weight:600}.tw-detail p{white-space:pre-wrap;overflow-wrap:anywhere}.tw-detail footer{margin-top:auto;display:flex;gap:6px;flex-wrap:wrap}.tw-selected{background:#f7edda}.tw-status{background:#f1e8d6;color:#88652f;border-radius:5px;padding:4px 8px;font-size:12px}.tw-board{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px}.tw-board>div{background:#f5f1eb;padding:10px;border-radius:8px}.tw-board button{display:block;width:100%;margin:8px 0;text-align:left}.tw-board small{display:block}@media(max-width:900px){.tw-grid{flex-direction:column}.tw-detail{width:auto}}#work-queue #tw-metrics{display:flex;align-items:center;gap:16px;margin:0 0 20px}#work-queue #tw-metrics>button[data-tw-filter]{display:flex;align-items:center;gap:14px;flex:1;padding:16px;min-height:88px;box-shadow:0 3px 8px #1024380b}#tw-metrics i{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#f1e3ca;color:#a47b36}#tw-metrics i svg{width:25px;height:25px}#tw-metrics [data-tw-filter=progress] i{background:#dce8f4;color:#234d7b}#tw-metrics [data-tw-filter=done] i{background:#dcebd5;color:#38733e}#work-queue #new-work-task,.tw-complete{background:#102438!important;color:white!important;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:8px;padding:12px 20px}#work-queue .legal-actions{display:flex;align-items:end;gap:12px;flex-wrap:wrap}#work-queue .legal-actions label:first-child{flex:1}#work-queue .tw-switch{margin-left:auto} .tw-switch button[aria-pressed=true],.tw-pagination button[aria-current=page]{background:#a47b36;color:white}.tw-switch button{display:inline-flex;align-items:center;gap:6px}.tw-grid{height:var(--tw-height,480px);min-height:0}.tw-list{display:flex;flex-direction:column;overflow:hidden}.tw-table-scroll{overflow:auto;flex:1}.tw-table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}.tw-table th{background:#f1ede5;padding:12px 8px;position:sticky;top:0}.tw-table td{padding:15px 8px;border-bottom:1px solid #e5ded3;vertical-align:middle}.tw-table td svg,.tw-detail dt svg,.tw-detail h4 svg{color:#a47b36;vertical-align:middle}.tw-table small{display:block;color:#65717d;margin-top:5px}.tw-table .tw-title{font-weight:650;text-align:left;border:0;background:none;padding:0;color:#102438}.tw-check{width:19px;height:19px;border:1px solid #b8a482;border-radius:4px;padding:0}.tw-pill{display:inline-block;border-radius:20px;padding:4px 11px;font-size:12px;font-weight:600;background:#f2e3c8;color:#745322;white-space:nowrap}.tw-pill[data-tone="High"],.tw-pill[data-tone="Urgent"]{background:#f8d5cf;color:#982d25}.tw-pill[data-tone="Normal"],.tw-pill[data-tone="In Progress"]{background:#dce8f5;color:#234d7b}.tw-pill[data-tone="Completed"]{background:#dcebd5;color:#286038}.tw-pagination{margin-top:auto;display:flex;justify-content:space-between;align-items:center;padding:14px;gap:8px;font-size:12px}.tw-pagination div{display:flex;gap:5px;overflow:auto}.tw-detail{overflow:auto;box-sizing:border-box;gap:8px}.tw-detail dl{display:grid;grid-template-columns:1fr 1fr;gap:12px;border-top:1px solid #ded3c4;padding-top:14px}.tw-detail p{border:1px solid #ded3c4;border-radius:7px;padding:10px}.tw-detail .tw-pill{align-self:flex-start}.tw-detail .tw-complete{width:100%}#work-queue #work-task-count{display:none}@media(max-width:900px){.tw-grid{height:auto}.tw-table{min-width:760px}#work-queue #tw-metrics{flex-wrap:wrap}}</style>
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
   <label class="task-wide">Task title<input name="title" maxlength="160" required placeholder="e.g. Prepare financial disclosure"></label><label>Linked record<select name="linkedType"><option>Matter</option><option>Client enquiry</option><option>Client & Contact</option><option>General task</option></select></label>${matterField}<label>Assigned to<input name="assignedTo" maxlength="100" required placeholder="Staff member"></label><label>Task category<select name="taskCategory"><option>Document preparation</option><option>Client follow-up</option><option>Legal research</option><option>Court preparation</option><option>Administrative</option><option>Other</option></select></label>
   <label>Due or follow-up date (Sydney)<input name="date" type="date"></label><label>Deadline time (Sydney)<input name="time" type="time"></label>
   <label>Follow-up status<select name="followUpStatus"><option value="">Regular task</option>${Object.entries(followUpStates).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
   <label>Priority<select name="priority">${priorities.map(priority => `<option${priority === 'Normal' ? ' selected' : ''}>${priority}</option>`).join('')}</select></label>`,
   'Task description & instructions', 'Create task', true)}
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
    <div class="legal-actions"><label>Search tasks<input id="work-task-search" type="search" placeholder="Title or matter reference"></label><label>Show tasks<select id="legal-task-filter"><option value="all">All tasks</option><option value="open">Open</option><option value="progress">In Progress</option><option value="today">Due today</option><option value="overdue">Overdue</option><option value="unscheduled">Without due date</option><option value="done">Completed</option></select></label><label>Priority<select id="work-task-priority"><option value="">All priorities</option>${priorities.map(priority => `<option>${priority}</option>`).join('')}</select></label></div><p class="work-result-count" id="work-task-count" role="status"></p><div id="work-priority-list"></div>
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
  const createForm=find('#task-form');const createList=document.createElement('div');createList.className='create-bullets';const createSection=document.createElement('section');createSection.innerHTML='<strong>Checklist</strong>';createSection.append(createList);const addBullet=document.createElement('button');addBullet.type='button';addBullet.textContent='+ Add bullet';createSection.append(addBullet);const createFooter=document.createElement('div');createFooter.className='create-footer';const createSubmit=createForm.querySelector('[type=submit]');createSubmit.before(createSection);createSubmit.before(createFooter);createFooter.append(createSubmit,createForm.querySelector('[data-cancel-editor]'));function createBullet(value='',key='',done=false){if(createList.children.length>=20)return;const row=document.createElement('div');row.className='create-bullet';row.dataset.key=key;row.dataset.done=String(done);row.innerHTML='<i aria-hidden="true"></i><input maxlength="200" placeholder="Enter checklist item" aria-label="Checklist item"><button type="button" aria-label="Remove bullet">×</button>';row.querySelector('input').value=value;row.querySelector('button').onclick=()=>row.remove();createList.append(row);return row;}addBullet.onclick=()=>createBullet()?.querySelector('input').focus();
  function reset(editor, hide = true) {
    editor.id = null;
    editor.form.reset();
    if(editor===editors.Task){createList.replaceChildren();createBullet();}
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
    if(editor===editors.Task&&item){createList.replaceChildren();for(const [key,v] of Object.entries(item.checklist||{}))createBullet(v.title,key,v.done);if(!createList.children.length)createBullet();}
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
    const eventMarkup=item=>'<span class="calendar-event" data-event-type="'+eventType(item)+'"'+(item.kind==='Appointment'?' data-appointment-color="'+appointmentColor(item)+'" data-appointment-type="'+appointmentType(item)+'"':'')+'>'+calendarIcon(item)+'<span>'+escape([item.time,item.title].filter(Boolean).join(' '))+'</span></span>';
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
    const kindText=item=>item.kind==='Consultation request'?'Client consultation request':isNote(item)?'Calendar note':item.kind==='Appointment'?appointmentTypeLabel(item):'Task / deadline';
    const rightEvent=(item)=>'<button type="button" class="calendar-upcoming-row" data-calendar-day="'+escape(item.date)+'" data-event-type="'+eventType(item)+'"'+(item.kind==='Appointment'?' data-appointment-type="'+appointmentType(item)+'"':'')+'><span class="calendar-upcoming-time">'+escape(timeText(item.time))+'</span><span class="calendar-upcoming-copy"><strong>'+calendarIcon(item)+escape(item.title||kindText(item))+'</strong><small>'+escape(kindText(item))+(item.matter?' · '+escape(item.matter):'')+'</small></span></button>';
    const dateLabel=find('#calendar-today-label');
    if(dateLabel)dateLabel.textContent=new Intl.DateTimeFormat('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
    find('#calendar-upcoming-list').innerHTML=todayEvents.length?todayEvents.slice(0,4).map(rightEvent).join(''):'<p class="work-empty calendar-empty">No events scheduled for today.</p>';
    find('#calendar-later-list').innerHTML=laterEvents.length?laterEvents.map(item=>'<div class="calendar-later-row" data-event-type="'+eventType(item)+'"'+(item.kind==='Appointment'?' data-appointment-type="'+appointmentType(item)+'"':'')+'><span>'+escape(shortDate(item.date))+'<small>'+escape(timeText(item.time))+'</small></span><div><strong>'+calendarIcon(item)+escape(item.title||kindText(item))+'</strong><small>'+escape(kindText(item))+(item.matter?' · '+escape(item.matter):'')+'</small></div><button type="button" data-calendar-day="'+escape(item.date)+'" aria-label="Open '+escape(item.title||'event')+'">View</button></div>').join(''):'<p class="work-empty calendar-empty">No later events this week.</p>';
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
      const matchesView = filter === 'all' ? true : filter === 'done' ? item.done : !item.done &&
        (filter !== 'today' || item.date === date) &&
        (filter !== 'overdue' || overdue(item)) &&
        (filter !== 'unscheduled' || !item.date);
      return matchesView && (!priority || item.priority === priority) &&
        [item.title, item.matter].join(' ').toLowerCase().includes(taskQuery);
    }).sort(order);
    find('#work-task-count').textContent = loaded ? `${matchingTasks.length} of ${tasks.length} tasks` : '';
    const taskList = find('#work-priority-list');
    const deadline=t=>{if(t.done)return ['Completed','done'];if(!t.date)return ['No due date','neutral'];const now=new Intl.DateTimeFormat('en-GB',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const v=Object.fromEntries(now.map(x=>[x.type,x.value]));const minutes=(Date.parse(t.date+'T'+(t.time||'23:59')+':00Z')-Date.parse(v.year+'-'+v.month+'-'+v.day+'T'+v.hour+':'+v.minute+':00Z'))/60000;return !Number.isFinite(minutes)?['No due date','neutral']:minutes<0?['Overdue','late']:minutes<=180?['Due in '+Math.floor(minutes/60)+'h '+(minutes%60)+'m','late']:minutes<=300?['Due in '+Math.floor(minutes/60)+'h '+(minutes%60)+'m','soon']:['Upcoming','neutral'];};const deadlineTime=t=>t.time?new Intl.DateTimeFormat('en-AU',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date('2026-01-01T'+t.time+':00Z'))+' Sydney':t.date?'Time not set':'';const taskStatus=t=>t.done?'Completed':t.taskStatus==='Open'||t.taskStatus==='In Progress'?t.taskStatus:t.followUpStatus?'In Progress':'Open';
    const ico=(name)=>'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+({layers:'M3 8l9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5',clip:'M8 4H5v17h14V4h-3M8 2h8v5H8zM8 11h8M8 15h8',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 6v6l5 3',check:'m5 12 4 4L19 6',folder:'M3 6h7l2 2h9v12H3z',user:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-2a8 8 0 0 1 16 0v2',calendar:'M3 5h18v16H3zM7 2v6M17 2v6M3 10h18',flag:'M5 22V3h14l-3 5 3 5H5',list:'M4 6h2m3 0h11M4 12h2m3 0h11M4 18h2m3 0h11',board:'M3 4h7v16H3zM14 4h7v16h-7z',plus:'M12 5v14M5 12h14'}[name]||'')+'"/></svg>';
    const fmt=v=>v&&Number.isFinite(Date.parse(v+'T00:00:00Z'))?new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T00:00:00Z')):'—';
    const pill=(v)=>'<span class="tw-pill" data-tone="'+escape(v)+'">'+escape(v)+'</span>';
    const statusPill=t=>'<select class="tw-pill tw-status-select" aria-label="Change task status" data-tw-status="'+escape(t.id)+'" data-tone="'+escape(taskStatus(t))+'" data-deadline-status="'+deadline(t)[1]+'">'+['Open','In Progress','Completed'].map(v=>'<option value="'+v+'" '+(taskStatus(t)===v?'selected':'')+'>'+v+'</option>').join('')+'</select>';const selected=tasks.find(t=>t.id===selectedTaskId);
    const visible=matchingTasks.filter(t=>filter!=='progress'||taskStatus(t)==='In Progress').filter(t=>filter!=='open'||taskStatus(t)==='Open');
    const pages=Math.max(1,Math.ceil(visible.length/5));taskPage=Math.min(taskPage,pages);const slice=visible.slice((taskPage-1)*5,taskPage*5);
    taskList.innerHTML='<div class="tw-grid"><div class="tw-list '+(!visible.length?'tw-is-empty':'')+'">'+(taskView==='board'?'<div class="tw-board">'+['Open','In Progress','Completed'].map(stage=>'<div><h3>'+stage+'</h3>'+visible.filter(t=>taskStatus(t)===stage).map(t=>'<button type="button" data-tw-select="'+escape(t.id)+'">'+escape(t.title)+'<small>'+fmt(t.date)+'</small>'+pill(t.priority)+'</button>').join('')+'</div>').join('')+'</div>':'<div class="tw-table-scroll"><table class="tw-table"><thead><tr><th></th><th>Task Name</th><th>Matter Reference</th><th>Assigned To</th><th>Due Date</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>'+slice.map(t=>'<tr class="'+(t.id===selectedTaskId?'tw-selected':'')+'" data-task-deadline="'+deadline(t)[1]+'"><td><button class="tw-check" style="all:unset!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;width:24px!important;height:24px!important;min-width:24px!important;min-height:24px!important;max-width:24px!important;max-height:24px!important;flex:none!important;cursor:pointer!important;vertical-align:middle!important" aria-pressed="'+Boolean(t.done)+'" type="button" data-toggle="'+escape(t.id)+'" aria-label="Toggle completion">'+'<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style="display:block;width:22px;height:22px;min-width:22px;flex:none"><circle cx="12" cy="12" r="10.5" fill="'+(t.done?'#a47b36':'none')+'" stroke="#a47b36" stroke-width="1.3"/>'+(t.done?'<path d="m7 12 3 3 7-7" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>':'')+'</svg></button></td><td><button class="tw-title" type="button" data-tw-select="'+escape(t.id)+'">'+escape(t.title)+'</button><small>'+escape((t.notes||'').slice(0,85))+'</small></td><td>'+escape(t.matter||'—')+'</td><td>'+ico('user')+' '+escape(t.assignedTo||'Not assigned')+'</td><td>'+ico('calendar')+' '+fmt(t.date)+'<small class="tw-due-time">'+escape(deadlineTime(t))+'</small><small class="tw-deadline" data-deadline="'+deadline(t)[1]+'">'+deadline(t)[0]+'</small></td><td>'+pill(t.priority)+'</td><td>'+statusPill(t)+'</td><td><button type="button" data-edit="'+escape(t.id)+'" aria-label="Edit task">⋮</button></td></tr>').join('')+'</tbody></table></div>')+(!visible.length?'<div class="tw-empty-center">No tasks match this view.</div>':'')+'<div class="tw-pagination"><span>Showing '+(visible.length?(taskPage-1)*5+1:0)+'–'+Math.min(taskPage*5,visible.length)+' of '+visible.length+' tasks</span><div>'+Array.from({length:pages},(_,i)=>'<button data-tw-page="'+(i+1)+'" aria-current="'+(taskPage===i+1?'page':'false')+'">'+(i+1)+'</button>').join('')+'</div></div></div>'+(selected?'<aside class="tw-detail"><header><h3>Task Details</h3><button type="button" data-tw-close aria-label="Close details">×</button></header><h2>'+escape(selected.title)+'</h2>'+statusPill(selected)+'<dl><div><dt>'+ico('folder')+' Linked Matter</dt><dd>'+escape(selected.matter||'—')+'</dd></div><div><dt>'+ico('user')+' Assigned To</dt><dd>'+escape(selected.assignedTo||'Not assigned')+'</dd></div><div><dt>'+ico('calendar')+' Due Date</dt><dd>'+fmt(selected.date)+'<small class="tw-due-time">'+escape(deadlineTime(selected))+'</small><small class="tw-deadline" data-deadline="'+deadline(selected)[1]+'">'+deadline(selected)[0]+'</small></dd></div><div><dt>'+ico('flag')+' Priority</dt><dd>'+pill(selected.priority)+'</dd></div></dl><h4>'+ico('clip')+' Description</h4><p>'+escape(selected.notes||'No description recorded.')+'</p><h4>'+ico('list')+' Checklist <small class="tw-check-count">'+Object.values(selected.checklist||{}).filter(v=>v.done).length+'/'+Object.keys(selected.checklist||{}).length+' completed</small></h4><progress class="tw-progress" max="'+Math.max(1,Object.keys(selected.checklist||{}).length)+'" value="'+Object.values(selected.checklist||{}).filter(v=>v.done).length+'"></progress><div class="tw-checklist">'+Object.entries(selected.checklist||{}).map(([k,v])=>'<label><input type="checkbox" data-tw-check="'+escape(k)+'" '+(v.done?'checked':'')+'><span>'+escape(v.title)+'</span></label>').join('')+'<button type="button" data-tw-add-check>+ Add checklist item</button></div><footer><button type="button" data-edit="'+escape(selected.id)+'">Edit task</button><button type="button" data-remove="'+escape(selected.id)+'">Delete</button><button class="tw-complete" type="button" data-toggle="'+escape(selected.id)+'">'+ico('check')+(selected.done?'Reopen':'Mark as Completed')+'</button></footer></aside>':'')+'</div>';
    let metrics=find('#tw-metrics');if(!metrics){metrics=document.createElement('div');metrics.id='tw-metrics';find('#work-queue .legal-actions').before(metrics);metrics.append(find('#new-work-task'));}const add=find('#new-work-task');metrics.innerHTML=[['all','All Tasks',tasks.length,'layers'],['open','Open',tasks.filter(t=>taskStatus(t)==='Open').length,'clip'],['progress','In Progress',tasks.filter(t=>taskStatus(t)==='In Progress').length,'clock'],['done','Completed',tasks.filter(t=>t.done).length,'check']].map(([v,l,n,ic])=>'<button type="button" data-tw-filter="'+v+'" aria-pressed="'+(filter===v)+'"><i>'+ico(ic)+'</i><span><strong>'+n+'</strong>'+l+'</span></button>').join('');if(add){add.innerHTML=ico('plus')+' Add Task';metrics.append(add);}const total=tasks.length,finished=tasks.filter(t=>t.done).length,pct=total?Math.round(finished/total*100):0;const allCard=metrics.querySelector('[data-tw-filter="all"]');if(allCard){allCard.classList.add('tw-completion-card');allCard.style.setProperty('--tw-completion',(lastCompletionPercent??0)+'%');requestAnimationFrame(()=>requestAnimationFrame(()=>allCard.style.setProperty('--tw-completion',pct+'%')));lastCompletionPercent=pct;allCard.dataset.complete=String(total>0&&finished===total);const label=document.createElement('small');label.className='tw-completion-label';label.textContent=pct+'% completed';allCard.append(label);allCard.setAttribute('aria-label','All tasks, '+finished+' of '+total+' completed');}
    let sw=find('.tw-switch');if(!sw){sw=document.createElement('div');sw.className='tw-switch';find('#work-queue .legal-actions').append(sw);}sw.innerHTML=['list','board'].map(v=>'<button type="button" data-tw-view="'+v+'" aria-pressed="'+(taskView===v)+'">'+ico(v)+' '+(v==='list'?'List View':'Board View')+'</button>').join('');
    metrics.onclick=e=>{const b=e.target.closest('[data-tw-filter]');if(!b)return;find('#legal-task-filter').value=b.dataset.twFilter;taskPage=1;render();};sw.onclick=e=>{const b=e.target.closest('[data-tw-view]');if(b){taskView=b.dataset.twView;render();}};
    requestAnimationFrame(()=>{if(taskList.getClientRects().length){taskList.style.setProperty('--tw-height',Math.max(240,innerHeight-taskList.getBoundingClientRect().top-70)+'px');}});const saveChecklist=async checklist=>{if(!selected||!loaded)return;try{if(sampleMode){selected.checklist=checklist;render();}else await updateDoc(doc(items,selected.id),{checklist,updatedAt:serverTimestamp()});}catch{notify('Checklist not saved','Publish the updated Firestore rules and retry.',true);render();}};taskList.onchange=async e=>{if(e.target.dataset.twStatus){const control=e.target;const task=tasks.find(t=>t.id===control.dataset.twStatus);if(!task||!loaded)return;const value=control.value;if(!['Open','In Progress','Completed'].includes(value))return;const patch={done:value==='Completed',taskStatus:value==='Completed'?(task.taskStatus|| (task.followUpStatus?'In Progress':'Open')):value};control.disabled=true;try{if(!sampleMode)await updateDoc(doc(items,task.id),{...patch,updatedAt:serverTimestamp()});Object.assign(task,patch);render();}catch{notify('Update failed','Could not change task status. Please try again.',true);render();}return;}if(e.target.dataset.twCheck&&selected){const k=e.target.dataset.twCheck;saveChecklist({...selected.checklist,[k]:{...selected.checklist[k],done:e.target.checked}});}};taskList.onclick=e=>{if(e.target.closest('[data-tw-add-check]')&&selected){const task=selected;const remaining=20-Object.keys(task.checklist||{}).length;const d=document.createElement('dialog');d.className='tw-check-dialog';d.innerHTML='<style>.tw-check-dialog{width:min(510px,calc(100% - 32px));box-sizing:border-box;padding:24px;border:1px solid #ded3c4;border-radius:14px;background:#fcfaf6;color:#102438;box-shadow:0 20px 60px #10243833}.tw-check-dialog::backdrop{background:#10243866}.tw-check-dialog h2{font:600 24px Georgia;margin:8px 0}.tw-check-dialog p{font-size:13px;color:#65717d}.tw-check-dialog{max-height:85dvh;overflow:hidden}.tw-check-dialog form{display:flex;flex-direction:column;max-height:calc(85dvh - 48px);min-height:0}.tw-check-dialog form>*{flex-shrink:0}.tw-check-dialog .bullet-list{display:flex;flex-direction:column;gap:10px;max-height:min(260px,35dvh);min-height:0;flex-shrink:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#c9b58f transparent;padding:3px 6px 3px 1px}.tw-check-dialog .bullet-row{flex-shrink:0}.tw-check-dialog footer{flex-shrink:0}.tw-check-dialog .bullet-row{display:flex;align-items:center;gap:10px}.tw-check-dialog .bullet-circle{width:18px;height:18px;box-sizing:border-box;border:1.5px solid #a47b36;border-radius:50%;flex:none}.tw-check-dialog input{flex:1;min-width:0;padding:10px;border:1px solid #ded3c4;border-radius:7px;background:white;color:#102438;font-size:14px}.tw-check-dialog footer{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.tw-check-dialog button{padding:9px 15px;border:1px solid #ded3c4;border-radius:7px;background:#fcfaf6;color:#102438;cursor:pointer}.tw-check-dialog .bullet-remove{padding:5px 9px;color:#a47b36}.tw-check-dialog .bullet-add{margin-top:12px;color:#946c29;border-style:dashed;width:100%;text-align:left}.tw-check-dialog button[type=submit]{background:#102438;color:white}.tw-check-dialog button:disabled{opacity:.5;cursor:default}.tw-check-dialog small{color:#a47b36}</style><form><small>PREVAIL FAMILY LAW · TASK CHECKLIST</small><h2>Add checklist items</h2><p>Add each action as a separate checklist item.</p><div class="bullet-list"></div><button type="button" class="bullet-add">+ Add bullet</button><p role="status"></p><footer><button type="button" class="bullet-cancel">Cancel</button><button type="submit">Save checklist</button></footer></form>';const list=d.querySelector('.bullet-list'),msg=d.querySelector('[role=status]'),submit=d.querySelector('[type=submit]'),add=d.querySelector('.bullet-add');let saving=false;const fields=()=>Array.from(list.querySelectorAll('input'));const lines=()=>fields().map(x=>x.value.trim()).filter(Boolean);const validate=()=>{const n=lines().length;msg.textContent=n+' items · '+Math.max(0,remaining)+' available';add.disabled=saving||fields().length>=remaining;submit.disabled=saving||!n||n>remaining;};const append=(value='')=>{if(saving||fields().length>=remaining)return;const row=document.createElement('div');row.className='bullet-row';row.innerHTML='<span class="bullet-circle" aria-hidden="true"></span><input type="text" maxlength="200" placeholder="Enter checklist item" aria-label="Checklist item"><button type="button" class="bullet-remove" aria-label="Remove item">×</button>';const input=row.querySelector('input');input.value=value;input.oninput=validate;input.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();append();}};row.querySelector('button').onclick=()=>{if(saving)return;row.remove();if(!fields().length)append();validate();};list.append(row);validate();input.focus();};add.onclick=()=>append();d.querySelector('.bullet-cancel').onclick=()=>{if(!saving)d.close();};d.addEventListener('cancel',ev=>{if(saving)ev.preventDefault();});d.addEventListener('close',()=>d.remove(),{once:true});d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(saving||!lines().length||lines().length>remaining)return;const next={...task.checklist};for(const title of lines())next[crypto.randomUUID()]={title,done:false};saving=true;fields().forEach(x=>x.disabled=true);validate();try{if(sampleMode){task.checklist=next;render();}else await updateDoc(doc(items,task.id),{checklist:next,updatedAt:serverTimestamp()});d.close();}catch{saving=false;fields().forEach(x=>x.disabled=false);validate();msg.textContent='Unable to save checklist. Please check workspace permissions and retry.';}};document.body.append(d);d.showModal();append();validate();return;}const b=e.target.closest('[data-tw-select],[data-tw-close],[data-tw-page]');if(!b){const tr=e.target.closest('.tw-table tbody tr');if(tr&&!e.target.closest('button,input,select')){selectedTaskId=tr.querySelector('[data-tw-select]')?.dataset.twSelect||'';render();}return;}if(b.dataset.twPage)taskPage=Number(b.dataset.twPage);else selectedTaskId=b.dataset.twSelect||'';render();};
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

  function contactDateLabel(value) {
    if (!value) return '—';
    const dateValue = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
    const raw = dateValue ? dateValue.toISOString().slice(0, 10) : String(value).slice(0, 10);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T12:00:00Z') : new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-AU', {day:'2-digit',month:'short',year:'numeric',timeZone:'Australia/Sydney'}).format(parsed);
  }

  function renderContacts() {
    const list = document.getElementById('contact-directory-list');
    const detail = document.getElementById('contact-detail-panel');
    if (!list || !detail) return;
    const grouped = new Map();
    allEnquiryContacts.forEach(item => {
      const contact = item.contact || {};
      const email = String(contact.email || '').trim().toLowerCase();
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
      const key = email || (name ? name.toLowerCase() + ':' + item.requestId : String(item.requestId));
      if (!grouped.has(key)) grouped.set(key, {key, contact, item, requests:[]});
      const entry = grouped.get(key);
      entry.requests.push(item);
      if (item.createdAt && (!entry.item.createdAt || item.createdAt.seconds > entry.item.createdAt.seconds)) {
        entry.item = item;
        entry.contact = contact;
      }
    });
    const allEntries = [...grouped.values()];
    const matterValues = [...new Set(allEntries.map(entry => entry.contact.matter || entry.contact.matterReference || entry.item.matter).filter(Boolean))];
    const matterFilter = document.getElementById('contact-filter-matter');
    if (matterFilter) {
      const current = contactMatterFilter;
      matterFilter.innerHTML = '<option value="all">All matters</option>' + matterValues.map(value => '<option value="' + escape(value) + '">' + escape(value) + '</option>').join('');
      matterFilter.value = matterValues.includes(current) ? current : 'all';
      if (!matterValues.includes(current)) contactMatterFilter = 'all';
      matterFilter.onchange = () => { contactMatterFilter = matterFilter.value; renderDashboard(); };
    }
    const searchField = document.getElementById('contact-search');
    const typeField = document.getElementById('contact-filter-type');
    const statusField = document.getElementById('contact-filter-status');
    const clearButton = document.getElementById('contact-clear-filters');
    if (searchField) {
      if (searchField.value !== contactSearchQuery) searchField.value = contactSearchQuery;
      searchField.oninput = () => { contactSearchQuery = searchField.value; renderDashboard(); };
    }
    if (typeField) {
      typeField.value = contactTypeFilter;
      typeField.onchange = () => { contactTypeFilter = typeField.value; renderDashboard(); };
    }
    if (statusField) {
      statusField.value = contactStatusFilter;
      statusField.onchange = () => { contactStatusFilter = statusField.value; renderDashboard(); };
    }
    if (clearButton) clearButton.onclick = () => {
      contactSearchQuery = '';
      contactTypeFilter = 'all';
      contactMatterFilter = 'all';
      contactStatusFilter = 'all';
      renderDashboard();
    };
    const statusFor = item => {
      const status = String(item.approvalStatus || 'pending').toLowerCase();
      return status === 'approved' || status === 'scheduled' ? 'approved' : status === 'declined' ? 'declined' : 'pending';
    };
    const typeFor = contact => String(contact.newClient || '').toLowerCase() === 'yes' ? 'new' : 'enquiry';
    const labelForStatus = status => status === 'approved' ? 'Active' : status === 'declined' ? 'Declined' : 'Awaiting approval';
    const filtered = allEntries.filter(entry => {
      const contact = entry.contact || {};
      const item = entry.item || {};
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || item.title || 'Enquiry contact';
      const matter = contact.matter || contact.matterReference || item.matter || '';
      const status = statusFor(item);
      const type = typeFor(contact);
      const haystack = [name, contact.email, contact.phone, contact.topic, item.notes, matter].join(' ').toLowerCase();
      return (!contactSearchQuery || haystack.includes(contactSearchQuery.trim().toLowerCase()))
        && (contactTypeFilter === 'all' || type === contactTypeFilter)
        && (contactMatterFilter === 'all' || matter === contactMatterFilter)
        && (contactStatusFilter === 'all' || status === contactStatusFilter);
    });
    const resultCount = document.getElementById('contact-result-count');
    if (resultCount) resultCount.textContent = 'Showing ' + filtered.length + ' of ' + allEntries.length + ' contacts';
    const active = filtered.find(entry => entry.key === selectedContactKey) || filtered[0];
    if (active) selectedContactKey = active.key;
    list.innerHTML = filtered.length ? filtered.map(entry => {
      const contact = entry.contact || {};
      const item = entry.item || {};
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || item.title || 'Enquiry contact';
      const initials = name.split(/\s+/).map(part => part[0] || '').slice(0, 2).join('').toUpperCase();
      const type = typeFor(contact);
      const status = statusFor(item);
      const matter = contact.matter || contact.matterReference || item.matter || '—';
      return '<tr class="contact-table-row' + (entry.key === selectedContactKey ? ' is-selected' : '') + '" data-contact-key="' + escape(entry.key) + '" tabindex="0" role="button" aria-selected="' + (entry.key === selectedContactKey) + '">'
        + '<td><span class="contact-table-person"><span class="contact-avatar">' + escape(initials || 'C') + '</span><strong>' + escape(name) + '</strong></span></td>'
        + '<td><span class="contact-type-pill">' + (type === 'new' ? 'New client' : 'Enquiry') + '</span></td>'
        + '<td class="contact-table-email">' + escape(contact.email || '—') + '<small>' + escape(contact.phone || '—') + '</small></td>'
        + '<td>' + escape(matter) + '</td>'
        + '<td>' + escape(contactDateLabel(item.createdAt)) + '</td>'
        + '<td><span class="contact-status-pill is-' + status + '">' + escape(labelForStatus(status)) + '</span></td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="6" class="contact-empty-state">' + (consultationRequestsLoaded ? 'No contacts match these filters.' : 'Loading enquiry contacts…') + '</td></tr>';
    list.querySelectorAll('[data-contact-key]').forEach(button => {
      button.onclick = () => {
        selectedContactKey = button.dataset.contactKey;
        activeContactTab = 'details';
        renderDashboard();
      };
      button.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click(); }
      };
    });
    if (!active) {
      detail.innerHTML = '<div class="contact-detail-empty"><span class="contact-detail-empty-icon" aria-hidden="true">♧</span><h3>No contact selected</h3><p>Try another search or clear the filters.</p></div>';
      return;
    }
    const contact = active.contact || {};
    const item = active.item || {};
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || item.title || 'Enquiry contact';
    const initials = name.split(/\s+/).map(part => part[0] || '').slice(0, 2).join('').toUpperCase();
    const matter = contact.matter || contact.matterReference || item.matter || '';
    const status = statusFor(item);
    let tabContent = '';
    if (activeContactTab === 'matters') {
      tabContent = '<section class="contact-detail-section"><h4>Linked Matters (' + (matter ? '1' : '0') + ')</h4>' + (matter ? '<article class="contact-matter-card"><strong>' + escape(matter) + '</strong><span>Linked to this contact</span></article>' : '<p class="contact-detail-muted">No matter has been linked to this contact yet.</p>') + '</section>';
    } else if (activeContactTab === 'notes') {
      tabContent = '<section class="contact-detail-section"><h4>Enquiry notes</h4><div class="contact-note-card">' + escape(item.notes || 'No message was included with this enquiry.') + '<small>From the original website enquiry</small></div></section>';
    } else if (activeContactTab === 'communications') {
      tabContent = '<section class="contact-detail-section"><h4>Communications</h4><article class="contact-communication-card"><span class="contact-communication-icon" aria-hidden="true">✉</span><div><strong>Website consultation enquiry</strong><small>Received ' + escape(contactDateLabel(item.createdAt)) + '</small></div><span class="contact-type-pill">Received</span></article><a class="contact-record-action" href="#staff-inbox">Open Client Messages</a></section>';
    } else {
      const topic = String(contact.topic || 'General enquiry').replaceAll('-', ' ');
      tabContent = '<section class="contact-detail-section"><h4>Contact Details</h4><dl class="contact-detail-grid"><div><dt>Email</dt><dd>' + escape(contact.email || 'Not provided') + '</dd></div><div><dt>Phone</dt><dd>' + escape(contact.phone || 'Not provided') + '</dd></div><div><dt>Enquiry type</dt><dd>' + escape(topic) + '</dd></div><div><dt>New client</dt><dd>' + escape(contact.newClient || 'Not specified') + '</dd></div><div><dt>Preferred appointment</dt><dd>' + escape(item.date ? contactDateLabel(item.date) + (item.time ? ' · ' + item.time + ' Sydney' : '') : 'Not provided') + '</dd></div><div><dt>Received</dt><dd>' + escape(contactDateLabel(item.createdAt)) + '</dd></div></dl></section>'
        + '<section class="contact-detail-section"><h4>Linked Matter</h4>' + (matter ? '<article class="contact-matter-card"><strong>' + escape(matter) + '</strong><span>Related matter</span></article>' : '<p class="contact-detail-muted">No matter linked yet.</p>') + '</section>'
        + '<section class="contact-detail-section"><h4>Enquiry Message</h4><div class="contact-note-card">' + escape(item.notes || 'No message was included with this enquiry.') + '</div></section>';
    }
    detail.innerHTML = '<header class="contact-detail-head"><span class="contact-avatar contact-avatar-large">' + escape(initials || 'C') + '</span><div><h3>' + escape(name) + '</h3><span class="contact-type-pill">' + (typeFor(contact) === 'new' ? 'New client' : 'Prospective client') + '</span></div><span class="contact-status-pill is-' + status + '">' + escape(labelForStatus(status)) + '</span></header>'
      + '<div class="contact-detail-tabs" role="tablist" aria-label="Contact details"><button type="button" role="tab" aria-selected="' + (activeContactTab === 'details') + '" data-contact-tab="details">Details</button><button type="button" role="tab" aria-selected="' + (activeContactTab === 'matters') + '" data-contact-tab="matters">Matters</button><button type="button" role="tab" aria-selected="' + (activeContactTab === 'notes') + '" data-contact-tab="notes">Notes</button><button type="button" role="tab" aria-selected="' + (activeContactTab === 'communications') + '" data-contact-tab="communications">Communications</button></div>'
      + '<div class="contact-detail-body">' + tabContent + '</div><footer class="contact-detail-footer"><a class="contact-record-action" href="#staff-inbox">Review enquiry</a></footer>';
    detail.querySelectorAll('[data-contact-tab]').forEach(button => {
      button.onclick = () => { activeContactTab = button.dataset.contactTab; renderDashboard(); };
    });
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

    renderContacts();

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
    if(filtered.some(item=>item.id===selectedCorrespondenceId)){}else selectedCorrespondenceId=filtered[0]?.id||'';
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
    const active=filtered.find(item=>item.id===selectedCorrespondenceId) || null;
    const reader=find('#correspondence-reader-content');
    if(!active){
      reader.innerHTML='<div class="correspondence-empty-state"><span class="correspondence-empty-icon" aria-hidden="true">✉</span><h3>Select a message</h3><p>Choose an email from the inbox to read the full correspondence.</p></div>';
      return;
    }
    const incoming=isAttorneyEmail(active);
    const title=active.title.replace(/^\[ATTY EMAIL\] /,'');
    const stamp=active.date?escape(active.date):'Saved draft';
    const body=active.notes||'No message body has been saved.';
    reader.innerHTML='<article class="correspondence-message"><div class="correspondence-message-top"><span class="correspondence-type-badge">'+icon+' '+(incoming?'Email received':'Email draft')+'</span><div class="correspondence-message-actions"><button type="button" data-edit="'+escape(active.id)+'">Edit</button><button type="button" data-remove="'+escape(active.id)+'" aria-label="Delete correspondence">Delete</button>'+(incoming?'<button type="button" data-generate-email-task="'+escape(active.id)+'">Generate task</button>':'')+'</div></div><h3>'+escape(title)+'</h3><dl class="correspondence-meta"><div><dt>From</dt><dd>'+escape(incoming?active.recipient||'Unknown sender':'Prevail Family Law staff')+'</dd></div><div><dt>To</dt><dd>'+escape(incoming?'Prevail Family Law staff':active.recipient||'No recipient added')+'</dd></div><div><dt>Date</dt><dd>'+stamp+'</dd></div><div><dt>Matter</dt><dd>'+escape(active.matter||'No matter linked')+'</dd></div></dl><div class="correspondence-message-body"><pre>'+escape(body)+'</pre></div>'+(incoming?'<div class="correspondence-internal-note"><strong>Private internal note</strong><p>Keep internal notes in the matter record. The received message is shown above.</p></div>':'')+'<div class="correspondence-compose-tabs" role="group" aria-label="Reply actions"><button type="button" class="is-active" data-correspondence-compose="reply">↶ Reply</button><button type="button" data-correspondence-compose="reply-all">⇇ Reply all</button><button type="button" data-correspondence-compose="forward">↪ Forward</button></div></article>';
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
  const scheduleTypeSelect = field(scheduleEditor, 'eventType');
  const scheduleTypeWrap = find('#schedule-event-type');
  const scheduleTypeIcon = find('#schedule-event-type-icon');
  const syncScheduleEventType = () => {
    const value = appointmentTypes[scheduleTypeSelect.value] ? scheduleTypeSelect.value : 'client-meeting';
    scheduleTypeWrap.dataset.appointmentType = value;
    scheduleTypeIcon.innerHTML = appointmentIcon({eventType:value});
  };
  scheduleTypeSelect.addEventListener('change', syncScheduleEventType);
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
      if (kind === 'Task' && !note) {data.time=get('time');data.assignedTo=get('assignedTo');data.linkedType=get('linkedType');data.taskCategory=get('taskCategory');data.checklist=Object.fromEntries(Array.from(createList.children).map(row=>[row.dataset.key||crypto.randomUUID(),{title:row.querySelector('input').value.trim(),done:row.dataset.done==='true'}]).filter(([,v])=>v.title));}
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
      // Completion is reflected directly in the task row and summary cards; no success toast.
    } catch {
      if (current === session) notify('Update failed', 'Could not update this item. Please try again.', true);
    } finally { button.disabled = false; }
  };
}
