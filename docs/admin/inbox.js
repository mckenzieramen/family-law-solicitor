import {collection, query, orderBy, limit, onSnapshot, doc, updateDoc} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

const panel = document.getElementById('staff-inbox');
const list = document.getElementById('inbox-list');
const reader = document.getElementById('inbox-reader');
const retry = document.getElementById('inbox-retry');
const status = document.getElementById('inbox-status');
const filter = document.getElementById('inbox-filter');
const search = document.getElementById('inbox-search');
const sort = document.getElementById('inbox-sort');
const count = document.getElementById('inbox-count');
const quickCards = [...(panel?.querySelectorAll('[data-inbox-quick-filter]') ?? [])];
const clientWorkspaceTabs = [...(panel?.querySelectorAll('[data-client-workspace-tab]') ?? [])];
const clientWorkspaceBack = [...(panel?.querySelectorAll('[data-client-workspace-view]') ?? [])];
const clientWorkspacePanels = [...(panel?.querySelectorAll('[data-client-workspace-panel]') ?? [])];
const senderName = record => [record.contact?.firstName, record.contact?.lastName].filter(Boolean).join(' ');
const ticketCode = record => 'INQ-' + String(record.id || '').slice(-6).toUpperCase();
const formatPreferredTime = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(value || ''));
  if (!match) return '';
  const [, year, month, day, hour, minute] = match;
  const date = new Intl.DateTimeFormat('en-AU', {weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
    .format(new Date(Date.UTC(Number(year), Number(month)-1, Number(day), 12)));
  const time = hour ? new Intl.DateTimeFormat('en-AU', {hour:'numeric',minute:'2-digit',timeZone:'UTC'})
    .format(new Date(Date.UTC(2026,0,1,Number(hour),Number(minute)))) : '';
  return [date, time && time + ' Sydney time'].filter(Boolean).join(' · ');
};
const addTicketField = (grid, label, value) => {
  if (value === undefined || value === null || String(value).trim() === '') return;
  const field=document.createElement('div'); field.className='inbox-ticket-field';
  const caption=document.createElement('span'); caption.textContent=label; if(label==='Total Enquiries'||label==='Converted'||label==='Closed'){const sub=document.createElement('small');sub.textContent=label==='Total Enquiries'?(dateRange==='all'?'All time':'Last '+dateRange+' days'):label==='Converted'?'(to Client)':'(Not Proceeding)';caption.append(document.createElement('br'),sub);}
  const content=document.createElement('strong'); content.textContent=String(value);
  field.append(caption,content); grid.append(field);
};
const compareText = (a, b) => a.localeCompare(b, 'en-AU', {sensitivity:'base'});
const sortText = (a, b) => a && b ? compareText(a, b) : Number(!a) - Number(!b);
const nav = document.getElementById('inbox-nav');
const overviewLink = document.getElementById('overview-inbox-link');
const overviewCount = document.getElementById('overview-inbox-count');
const overviewAttention = document.getElementById('overview-inbox-attention');
const inboxBadge = document.getElementById('nav-inbox-badge');
let stop;

function showOverviewInbox(total) {
  if (overviewCount) overviewCount.textContent = total ?? '—';
  if (!overviewAttention) return;
  overviewAttention.replaceChildren();
  if (!total) return;
  const link = document.createElement('a');
  link.href = '#staff-inbox';
  link.dataset.inboxFilter = 'unanswered';
  link.textContent = total + (total === 1 ? ' support chat awaiting reply' : ' support chats awaiting reply');
  overviewAttention.append(link);
}

export function clearInbox() {
  stop?.();
  stop = undefined;
  if (!panel) return;
  filter.onchange = sort.onchange = search.oninput = null;
  for (const card of quickCards) { card.onclick = null; card.setAttribute('aria-pressed', 'false'); }
  for (const id of ['inbox-stat-new-today','inbox-stat-appointments','inbox-stat-needs-reply','inbox-stat-replied']) document.getElementById(id).textContent = '0';
  count.textContent = '';
  search.value = '';
  panel.hidden = nav.hidden = true;
  if (overviewLink) overviewLink.hidden = true;
  showOverviewInbox();
  if(inboxBadge){inboxBadge.textContent='0';inboxBadge.hidden=true;}
  list.replaceChildren();
  reader.replaceChildren();
  retry.onclick = null;
  retry.hidden = true;
  for (const tab of clientWorkspaceTabs) tab.onclick = null;
  for (const button of clientWorkspaceBack) button.onclick = null;
}

export function mountInbox(db, sampleMode = false) {
  if (!panel) return;
  panel.hidden = nav.hidden = false;
  if (overviewLink) overviewLink.hidden = false;
  const setWorkspaceView = view => {
    for (const tab of clientWorkspaceTabs) tab.setAttribute('aria-selected', String(tab.dataset.clientWorkspaceTab === view));
    for (const section of clientWorkspacePanels) section.hidden = section.dataset.clientWorkspacePanel !== view;
  };
  for (const tab of clientWorkspaceTabs) tab.onclick = () => setWorkspaceView(tab.dataset.clientWorkspaceTab);
  for (const button of clientWorkspaceBack) button.onclick = () => setWorkspaceView(button.dataset.clientWorkspaceView);
  setWorkspaceView('enquiries');
  status.textContent = 'Loading messages…';
  let entries = []; let staffDirectory=[];
  let alive = true;
  let ready = false;
  let selectedId;
  let activeReaderTab = 'details';
  const drafts = new Map();
  for (const card of quickCards) card.onclick = () => { filter.value = card.dataset.inboxQuickFilter; render(); };
  let stageFilter='all', page=0; let assignedFilter='', dateRange='30'; filter.value='consultation';
  const stages=['New','Contacted','Consultation Booked','Converted','Closed'];
  const stageOf=r=>stages.includes(r.enquiryStatus)?r.enquiryStatus:r.approvalStatus==='declined'?'Closed':r.approvalStatus==='approved'?'Consultation Booked':'New';
  const pipeline=document.createElement('div');pipeline.className='enquiry-pipeline';
  const metrics=document.createElement('div');metrics.className='enquiry-metrics';
  const pager=document.createElement('div');pager.className='enquiry-pager';
  panel.querySelector('#inbox-heading').textContent='Consultation Enquiries';
  const controls=panel.querySelector('.inbox-controls'), split=list.parentElement;
  panel.querySelector('.client-workspace-tabs').hidden=true;
  panel.querySelector('.inbox-summary-cards').hidden=true;
  count.hidden=true; filter.closest('label').hidden=true; sort.closest('label').hidden=true;
  search.closest('label').firstChild.textContent='';search.placeholder='Search enquiries (name, subject, email, phone)…';
  const makeSelect=(label,options)=>{const el=document.createElement('select');el.setAttribute('aria-label',label);for(const [v,t] of options)el.add(new Option(t,v));controls.append(el);return el;};
  const stageSelect=makeSelect('Status',[['all','Status: All'],...stages.map(t=>[t,t])]);
  const assignSelect=makeSelect('Assigned to',[['','Assigned To: All'],['Unassigned','Unassigned']]);
  const dateSelect=makeSelect('Date range',[['30','Date Range: Last 30 days'],['7','Last 7 days'],['all','All time']]);
  const clear=document.createElement('button');clear.type='button';clear.textContent='Clear';controls.append(clear);
  stageSelect.onchange=()=>{stageFilter=stageSelect.value;page=0;render();};
  assignSelect.onchange=()=>{assignedFilter=assignSelect.value;page=0;render();};
  dateSelect.onchange=()=>{dateRange=dateSelect.value;page=0;render();};
  clear.onclick=()=>{search.value='';stageFilter='all';assignedFilter='';dateRange='30';dateSelect.value='30';page=0;render();};
  split.before(metrics,pipeline);const left=document.createElement('div');left.className='enquiry-left';split.prepend(left);left.append(controls,list,pager);
  
  const css=document.createElement('style');css.textContent=`
  #staff-inbox .inbox-summary-cards{display:none}
  #staff-inbox .inbox-split{display:grid;grid-template-columns:minmax(0,2.15fr) minmax(280px,1fr);gap:14px;align-items:start}
  #staff-inbox .enquiry-metrics,#staff-inbox .enquiry-pipeline{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}
  #staff-inbox .enquiry-metrics{grid-row:1}
  #staff-inbox .enquiry-pipeline{grid-row:2}
  .enquiry-metrics button,.enquiry-pipeline button{flex:1;border:1px solid #d9cbb8;background:#fcfaf7;color:#0d1729;border-radius:8px;padding:12px;cursor:pointer}
  .enquiry-metrics strong{display:block;font:700 30px Georgia,serif}
  .enquiry-pipeline button[aria-pressed=true]{background:#987740;color:white}
  #staff-inbox #inbox-list{display:block;overflow:auto;min-height:440px;border:1px solid #d9cbb8;border-radius:10px}
  #staff-inbox .enquiry-table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}
  .enquiry-table th,.enquiry-table td{padding:12px 9px;border-bottom:1px solid #e5ded3;vertical-align:middle}
  .enquiry-table th{background:#f1ede5;white-space:nowrap}
  .enquiry-table tr[aria-selected=true]{background:#f5e7cb}
  .enquiry-table tbody tr{cursor:pointer}
  .enquiry-table tbody tr:hover{background:#f5eddf}
  #staff-inbox #inbox-reader{grid-column:2;grid-row:3 / span 2;min-height:440px}
  .enquiry-pager{grid-column:1;display:flex;justify-content:space-between;align-items:center;gap:8px}
  .enquiry-pager button{padding:7px 12px;border:1px solid #d9cbb8;border-radius:6px;background:#fcfaf7}
  @media(max-width:900px){#staff-inbox .inbox-split{grid-template-columns:minmax(0,1fr)}#staff-inbox #inbox-reader{grid-column:1;grid-row:auto}}
  `;document.head.append(css);
  const metricIcons=['<rect x="3" y="5" width="26" height="20" rx="2"/><path d="m3 6 13 11L29 6"/>','<path d="M16 2 20 12 30 16 20 20 16 30 12 20 2 16 12 12Z"/>','<path d="M7 3 3 7c0 11 11 22 22 22l4-4-7-6-4 4C12 20 9 17 8 12l4-4Z"/>','<rect x="3" y="6" width="26" height="23" rx="3"/><path d="M9 2v8M23 2v8M3 13h26"/>','<path d="m2 13 7-9 7 4 7-4 7 9-6 8-5 5-5-2-7-6Z M9 9l6 5 5-3 7 7M7 18l5-5M12 23l5-5"/>','<circle cx="16" cy="16" r="13"/><path d="m9 16 5 5 9-10"/>'];
  const polish=document.createElement('style');polish.textContent=`
  #staff-inbox{color:#0d1729;background:transparent}
  #staff-inbox .client-workspace-tabs{margin-bottom:14px}
  #staff-inbox .enquiry-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin:0 0 10px}
  #staff-inbox .enquiry-metrics button{display:grid;grid-template-columns:38px minmax(0,1fr);grid-template-rows:auto auto;column-gap:12px;align-content:center;text-align:left;min-height:100px;padding:14px 16px;background:#fcfaf7;border:1px solid #ded3c4;border-radius:10px;font:16px Georgia,serif}
  #staff-inbox .enquiry-metrics svg{grid-row:1/3;width:34px;height:34px;align-self:start;color:#987740}
  #staff-inbox .enquiry-metrics strong{font:700 34px/1 Georgia,serif;margin-bottom:5px}
  #staff-inbox .enquiry-pipeline{display:flex;flex-wrap:nowrap;gap:0;border:1px solid #ded3c4;border-radius:8px;overflow:hidden;margin-bottom:10px}
  #staff-inbox .enquiry-pipeline button{position:relative;border:0;border-right:1px solid #d9cbb8;border-radius:0;padding:13px 9px;font:600 15px Georgia,serif;background:#f4ede3}
  #staff-inbox .enquiry-pipeline button[aria-pressed=true]{background:#987740;color:#fff}
  #staff-inbox .inbox-controls{display:flex;gap:10px;align-items:end;margin-bottom:12px}
  #staff-inbox .inbox-controls label:first-child{flex:2}
  #staff-inbox .inbox-controls input,#staff-inbox .inbox-controls select{min-height:38px;border:1px solid #d9cbb8;border-radius:6px;background:#fcfaf7}
  #staff-inbox .inbox-split{gap:18px;grid-template-columns:minmax(0,2.15fr) minmax(300px,1fr)}
  #staff-inbox .enquiry-table{font:14px/1.4 Georgia,serif}
  #staff-inbox .enquiry-table th{font-weight:700;padding:15px 10px;background:#f7f2eb}
  #staff-inbox .enquiry-table td{padding:13px 10px}
  #staff-inbox .enquiry-table tr[aria-selected=true]{background:#f4e6d1}
  #staff-inbox .enquiry-table .enquiry-status{display:inline-block;padding:5px 10px;border-radius:20px;background:#efdbad;font-size:12px;text-align:center}
  #staff-inbox .enquiry-status[data-stage="Contacted"]{background:#d5e6f7}
  #staff-inbox .enquiry-status[data-stage="Consultation Booked"]{background:#e2def1}
  #staff-inbox .enquiry-status[data-stage="Converted"]{background:#d5e8cf}
  #staff-inbox .enquiry-status[data-stage="Closed"]{background:#e1dfdc}
  #staff-inbox #inbox-reader{border:1px solid #ded3c4;border-radius:10px;background:#fcfaf7;padding:16px;min-height:540px}
  #staff-inbox .inbox-ticket-heading h3{font:700 23px Georgia,serif}
  #staff-inbox .inbox-ticket-kicker{font:700 21px Georgia,serif;text-transform:none;letter-spacing:0;color:#0d1729}
  #staff-inbox .inbox-ticket-fields,#staff-inbox .inbox-ticket-message{border-top:1px solid #ded3c4;padding-top:12px}
  #staff-inbox .enquiry-pager{padding:12px 4px;font-size:13px}
  @media(max-width:1200px){#staff-inbox .enquiry-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(max-width:900px){#staff-inbox .inbox-split{grid-template-columns:minmax(0,1fr)}#staff-inbox .enquiry-pipeline{overflow-x:auto}#staff-inbox .enquiry-pipeline button{min-width:120px}#staff-inbox .inbox-controls{flex-wrap:wrap}}
  @media(max-width:520px){#staff-inbox .enquiry-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;document.head.append(polish);
  const exact=document.createElement('style');exact.textContent=`
  #staff-inbox [hidden]{display:none!important}
  #staff-inbox #inbox-heading{font:700 40px/1.15 Georgia,serif;margin:0 0 20px}
  #staff-inbox .enquiry-metrics{margin-bottom:25px}
  #staff-inbox .enquiry-pipeline{margin-bottom:20px;min-height:44px;background:#f8f4ef}
  #staff-inbox .enquiry-pipeline button{clip-path:polygon(0 0,calc(100% - 17px) 0,100% 50%,calc(100% - 17px) 100%,0 100%,17px 50%);margin-left:-12px;padding-left:25px}
  #staff-inbox .enquiry-pipeline button:first-child{margin-left:0;clip-path:polygon(0 0,calc(100% - 17px) 0,100% 50%,calc(100% - 17px) 100%,0 100%)}
  #staff-inbox .inbox-split{grid-template-columns:minmax(0,2.18fr) minmax(300px,1fr);align-items:stretch}
  #staff-inbox .enquiry-left{min-width:0;display:flex;flex-direction:column;gap:12px}
  #staff-inbox .inbox-controls{display:flex;align-items:center;gap:8px;margin:0;flex-wrap:wrap}
  #staff-inbox .inbox-controls label:first-child{flex:2;min-width:160px}
  #staff-inbox .inbox-controls select{flex:1;min-width:90px;width:auto;font:14px Georgia,serif}
  #staff-inbox .inbox-controls button{background:none;border:0;text-decoration:underline;cursor:pointer}
  #staff-inbox #inbox-list{flex:1;min-height:440px}
  #staff-inbox #inbox-reader{grid-column:2;grid-row:1;min-width:0;height:auto;min-height:620px}
  #staff-inbox .enquiry-pager{justify-content:flex-end;gap:5px}
  #staff-inbox .enquiry-pager span{margin-right:auto}
  #staff-inbox .enquiry-pager [aria-current=page]{background:#987740;color:white}
  #staff-inbox .eq-top,#staff-inbox .eq-profile{display:flex;align-items:center;gap:18px}
  #staff-inbox .eq-top{justify-content:space-between}
  #staff-inbox .eq-top h3,#staff-inbox .eq-profile h3{font:700 22px Georgia,serif;margin:0}
  #staff-inbox .eq-avatar{width:60px;height:60px;border-radius:50%;background:#e8dac8;color:#80602d;display:grid;place-items:center;font:24px Georgia,serif;flex-shrink:0}
  #staff-inbox .eq-profile{margin:18px 0;align-items:flex-start}
  #staff-inbox .eq-profile a,#staff-inbox .eq-profile div div{display:block;color:#101827;font:15px/1.5 Georgia,serif;overflow-wrap:anywhere}
  #staff-inbox .eq-section,#staff-inbox .eq-form{border-top:1px solid #dfd3c4;padding-top:12px;margin-top:12px;font:15px/1.35 Georgia,serif}
  #staff-inbox .eq-form label{display:flex;flex-direction:column;gap:6px;font-weight:bold}
  #staff-inbox .eq-form textarea,#staff-inbox .eq-form input{width:100%;box-sizing:border-box;border:1px solid #c8c2b9;border-radius:6px;background:#fcfaf7;padding:9px;font:14px Georgia,serif}
  #staff-inbox .eq-form textarea{min-height:72px;resize:vertical}
  #staff-inbox .eq-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}
  #staff-inbox .eq-save{background:#101d30;color:white;border:0;border-radius:7px;padding:12px 18px;cursor:pointer}
  @media(max-width:900px){#staff-inbox .inbox-split{grid-template-columns:1fr}#staff-inbox #inbox-reader{grid-column:1;grid-row:auto}}
  `;document.head.append(exact);
  const layoutFix=document.createElement('style');layoutFix.textContent=`
  #staff-inbox .inbox-split:has(>.enquiry-left){display:grid!important;grid-template-columns:minmax(0,68fr) minmax(0,32fr)!important;gap:18px!important;align-items:stretch!important;width:100%!important}
  #staff-inbox .inbox-split>.enquiry-left{grid-column:1!important;grid-row:1!important;width:100%!important;min-width:0!important;max-width:none!important}
  #staff-inbox .inbox-split>#inbox-reader{grid-column:2!important;grid-row:1!important;width:100%!important;max-width:none!important;min-width:0!important;box-sizing:border-box!important;padding:16px!important}
  #staff-inbox .enquiry-left .inbox-controls{display:grid!important;grid-template-columns:minmax(0,2.3fr) minmax(0,1fr) minmax(0,1.15fr) minmax(0,1.35fr) auto!important;gap:7px!important}
  #staff-inbox .enquiry-left .inbox-controls>[hidden]{display:none!important}
  #staff-inbox .inbox-controls label,#staff-inbox .inbox-controls select,#staff-inbox .inbox-controls input{min-width:0!important;width:100%!important;box-sizing:border-box!important}
  #staff-inbox .inbox-controls button,#staff-inbox .enquiry-pager button{color:#101827!important}
  #staff-inbox .enquiry-pager button[aria-current=page]{color:white!important}
  #staff-inbox .enquiry-table{table-layout:fixed!important;width:100%!important;min-width:0!important;font-size:13px!important}
  #staff-inbox .enquiry-table th,#staff-inbox .enquiry-table td{white-space:normal!important;overflow-wrap:anywhere!important;padding:10px 7px!important}
  #staff-inbox .enquiry-table th:nth-child(1){width:12%}#staff-inbox .enquiry-table th:nth-child(2){width:12%}#staff-inbox .enquiry-table th:nth-child(3){width:19%}#staff-inbox .enquiry-table th:nth-child(4){width:19%}#staff-inbox .enquiry-table th:nth-child(5){width:12%}#staff-inbox .enquiry-table th:nth-child(6){width:12%}#staff-inbox .enquiry-table th:nth-child(7){width:10%}#staff-inbox .enquiry-table th:nth-child(8){width:4%}
  #staff-inbox #inbox-reader .inbox-ticket-fields{display:flex!important;flex-direction:column!important;gap:7px!important;margin:0!important;padding:12px 0!important}
  #staff-inbox #inbox-reader .inbox-ticket-field{display:grid!important;grid-template-columns:36% minmax(0,1fr)!important;gap:8px!important;border:0!important;background:none!important;padding:0!important;font:14px Georgia,serif!important}
  #staff-inbox #inbox-reader .inbox-ticket-field span{text-transform:none!important;font:600 14px Georgia,serif!important;letter-spacing:0!important}
  #staff-inbox #inbox-reader .inbox-ticket-field strong{font:14px Georgia,serif!important;overflow-wrap:anywhere}
  #staff-inbox .eq-profile{margin:16px 0!important;gap:12px!important}
  #staff-inbox .eq-profile>div:last-child{min-width:0!important;overflow-wrap:anywhere}
  #staff-inbox .eq-top .enquiry-status{background:#efdbad!important;padding:5px 12px!important;border-radius:20px!important}
  @media(max-width:1050px){#staff-inbox .enquiry-left .inbox-controls{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
  @media(max-width:850px){#staff-inbox .inbox-split:has(>.enquiry-left){grid-template-columns:minmax(0,1fr)!important}#staff-inbox .inbox-split>#inbox-reader{grid-column:1!important;grid-row:2!important}}
  `;document.head.append(layoutFix);
  layoutFix.textContent += `
  #staff-inbox .eq-profile .eq-profile-line{display:flex!important;align-items:center;gap:7px;min-height:23px;flex-wrap:wrap}
  #staff-inbox .eq-profile-line a{display:inline!important;overflow-wrap:anywhere;min-width:0}
  #staff-inbox .eq-copy{display:inline-flex;align-items:center;justify-content:center;width:25px;height:25px;padding:3px;background:transparent;border:1px solid transparent;border-radius:5px;cursor:pointer;color:#987740}
  #staff-inbox .eq-copy:hover,#staff-inbox .eq-copy:focus-visible{background:#f3e5d2;border-color:#dfd3c4}
  #staff-inbox .eq-copy-feedback{font:12px Georgia,serif;color:#476342}

  #staff-inbox .enquiry-pipeline button{min-height:50px!important;padding:10px 18px!important;gap:8px!important;margin-left:0!important;flex:1 0 0!important;min-width:125px!important}
  #staff-inbox .eq-form select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #c8c2b9;border-radius:6px;background:#fcfaf7;color:#101827;padding:9px;font:14px Georgia,serif}

  #staff-inbox .enquiry-pipeline{display:flex!important;min-height:46px!important;isolation:isolate;overflow-x:auto!important;gap:0!important}
  #staff-inbox .enquiry-pipeline button{flex:1 0 130px!important;display:flex!important;align-items:center;justify-content:center;gap:8px;min-height:46px!important;padding:9px 22px!important;filter:none!important;transition:background-color .18s ease,color .18s ease}
  #staff-inbox .enquiry-pipeline button svg{width:19px!important;height:19px!important;flex:none;stroke:currentColor!important}
  #staff-inbox .enquiry-pipeline button:not([aria-pressed=true]) svg{color:#987740}
  #staff-inbox .enquiry-pipeline button[aria-pressed=true]{background:linear-gradient(110deg,#b59459,#80602d)!important;color:#fff!important}
  #staff-inbox .enquiry-pipeline button:focus-visible{outline:2px solid #101d30;outline-offset:-5px}
  #staff-inbox .enquiry-metrics button svg{display:block!important;width:34px!important;height:34px!important;stroke:#987740!important;fill:none!important}
  #staff-inbox .eq-contact svg,#staff-inbox .eq-profile svg{display:inline-block!important;width:16px!important;height:16px!important;stroke:#987740!important;fill:none!important;flex-shrink:0}
  #staff-inbox .enquiry-pager button:disabled{opacity:.45;cursor:not-allowed}
  #staff-inbox .enquiry-table tbody tr:focus-visible{outline:2px solid #987740;outline-offset:-2px}
  `;


  exact.textContent += `
  #staff-inbox .enquiry-metrics button{grid-template-columns:36px minmax(0,1fr);min-height:98px;padding:12px;column-gap:12px}
  #staff-inbox .enquiry-metrics small{font:13px Georgia,serif}
  #staff-inbox .enquiry-pipeline button{background:linear-gradient(110deg,#f8f4ef,#f1e5d5);filter:drop-shadow(1px 0 #c9b79e)}
  #staff-inbox .enquiry-pipeline button[aria-pressed=true]{background:linear-gradient(110deg,#b59459,#80602d)}
  #staff-inbox .enquiry-left{gap:12px}
  #staff-inbox #inbox-list{border-radius:10px 10px 0 0;background:#fcf9f5}
  #staff-inbox .enquiry-pager{margin-top:-12px;border:1px solid #dfd3c4;border-top:0;border-radius:0 0 10px 10px;padding:14px}
  #staff-inbox .enquiry-table td{height:52px;box-sizing:border-box;padding:8px 10px;overflow-wrap:anywhere}
  #staff-inbox .enquiry-status{display:inline-block;border-radius:20px;padding:5px 12px;background:#efdbad;font:13px Georgia,serif}
  #staff-inbox .eq-profile a{display:flex;gap:8px;align-items:center}
  #staff-inbox .eq-profile svg,#staff-inbox .eq-contact svg{width:17px;height:17px;flex:none;color:#987740}
  #staff-inbox .eq-contact{display:flex;align-items:center;gap:7px}
  #staff-inbox .eq-more{border:0;background:transparent;font-size:20px;cursor:pointer;color:#101827}
  #staff-inbox .enquiry-table tr{transition:background-color 150ms ease}
  #staff-inbox .inbox-reader-card{padding:0;background:transparent;border:0;box-shadow:none}
  #staff-inbox .eq-form-grid>*{min-width:0}
  #staff-inbox .eq-form-grid input{min-width:0}
  `;
  const eqIcon=(kind)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('aria-hidden','true');svg.innerHTML=kind==='location'?'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>':kind==='copy'?'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>':kind==='mail'?'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>':'<path d="M5 3 3 6c0 8 7 15 15 15l3-3-5-4-3 3c-3-1-5-3-6-6l3-3Z"/>';return svg;};
  function eqToast(message,error=false){
    document.querySelector('.eq-save-toast')?.remove();
    const toast=document.createElement('div');toast.className='eq-save-toast';toast.setAttribute('role',error?'alert':'status');toast.style.cssText='position:fixed;top:24px;right:24px;z-index:10000;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 48px);padding:16px 18px;background:#fcfaf7;color:#101827;border:1px solid #dfd3c4;border-left:4px solid '+(error?'#b44444':'#478354')+';border-radius:10px;box-shadow:0 8px 28px #10182722;font:14px Georgia,serif;';
    const mark=document.createElement('span');mark.textContent=error?'!':'✓';mark.style.cssText='font-size:22px;color:'+(error?'#b44444':'#478354');
    const msg=document.createElement('span');msg.textContent=message;
    const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Dismiss notification');close.style.cssText='border:0;background:transparent;color:#101827;font-size:22px;cursor:pointer';close.onclick=()=>toast.remove();toast.append(mark,msg,close);document.body.append(toast);setTimeout(()=>toast.remove(),4500);
  }
  function render() {
    if (!ready) return;
    const term = search.value.trim().toLowerCase();
    const type = filter.value;
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone:'Australia/Sydney', year:'numeric', month:'2-digit', day:'2-digit'
    }).format(new Date());
    const receivedToday = record => {
      const date = record.createdAt?.toDate?.();
      return Boolean(date && new Intl.DateTimeFormat('en-CA', {
        timeZone:'Australia/Sydney', year:'numeric', month:'2-digit', day:'2-digit'
      }).format(date) === todayKey);
    };
    const summaryCounts = {
      newToday: entries.filter(record => record.kind === 'consultation' && receivedToday(record)).length,
      appointment: entries.filter(record => record.kind === 'consultation' && Boolean(record.contact?.preferredTime)).length,
      unanswered: entries.filter(record => record.kind === 'support' && !record.reply).length,
      replied: entries.filter(record => record.kind === 'support' && Boolean(record.reply)).length
    };
    const newEnquiries=entries.filter(record=>record.kind==='consultation'&&(record.approvalStatus||'pending')==='pending').length;
    const inboxNotifications=newEnquiries+summaryCounts.unanswered;
    if(inboxBadge){inboxBadge.textContent=inboxNotifications>99?'99+':String(inboxNotifications);inboxBadge.hidden=inboxNotifications===0;}
    const overviewInboxTotal=document.getElementById('dashboard-stat-pending-enquiries');
    if(overviewInboxTotal)overviewInboxTotal.textContent=String(newEnquiries);
    const countTargets = {
      newToday:'inbox-stat-new-today', appointment:'inbox-stat-appointments',
      unanswered:'inbox-stat-needs-reply', replied:'inbox-stat-replied'
    };
    for (const card of quickCards) {
      const key = card.dataset.inboxQuickFilter;
      const active = type === key;
      card.setAttribute('aria-pressed', String(active));
      card.classList.toggle('is-active', active);
      const target = document.getElementById(countTargets[key]);
      if (target) target.textContent = String(summaryCounts[key] ?? 0);
    }
    const inRange=r=>dateRange==='all'||(r.createdAt?.toDate?.()?.getTime()||0)>=Date.now()-Number(dateRange)*86400000;
    const visible = entries.filter(record => {
      if(record.kind!=='consultation'||!inRange(record)||(assignedFilter&&(record.assignedTo||'Unassigned')!==assignedFilter))return false;
      if(stageFilter!=='all'&&(record.kind!=='consultation'||stageOf(record)!==stageFilter))return false;
      const {kind, contact, message, reply} = record;
      if (type === 'unanswered' && (kind !== 'support' || reply)) return false;
      if (type === 'replied' && (kind !== 'support' || !reply)) return false;
      if (type === 'newToday' && (kind !== 'consultation' || !receivedToday(record))) return false;
      if (type === 'appointment' && (kind !== 'consultation' || !contact?.preferredTime)) return false;
      if (['consultation', 'support'].includes(type) && type !== kind) return false;
      return !term || [contact?.firstName, contact?.lastName, contact?.email, contact?.phone, contact?.topic, message]
        .filter(Boolean).join(' ').toLowerCase().includes(term);
    });
    if (sort.value === 'oldest') visible.reverse();
    if (sort.value === 'name') visible.sort((a, b) => sortText(senderName(a), senderName(b)));
    if (sort.value === 'email') visible.sort((a, b) => sortText(a.contact?.email, b.contact?.email));
    count.textContent = 'Showing ' + visible.length + ' of ' + entries.length + ' loaded messages' +
      (entries.length === 100 ? ' · latest 100' : '');
    const consultations=entries.filter(r=>r.kind==='consultation'&&inRange(r));stageSelect.value=stageFilter;assignSelect.replaceChildren(new Option('Assigned To: All',''),new Option('Unassigned','Unassigned'));for(const name of new Set([...staffDirectory.map(m=>m.name),...entries.map(r=>r.assignedTo)].filter(Boolean)))assignSelect.add(new Option(name,name));assignSelect.value=assignedFilter;
    for(const [container,labels] of [[metrics,['Total Enquiries',...stages]],[pipeline,stages]]){
      container.replaceChildren();
      for(const label of labels){const key=label==='Total Enquiries'?'all':label;const n=key==='all'?consultations.length:consultations.filter(r=>stageOf(r)===key).length;const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(stageFilter===key));if(container===metrics){const strong=document.createElement('strong');strong.textContent=n;const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.innerHTML=metricIcons[labels.indexOf(label)];const caption=document.createElement('span');caption.textContent=label;const sub=document.createElement('small');sub.textContent=label==='Total Enquiries'?(dateRange==='all'?'All time':'Last '+dateRange+' days'):label==='Converted'?'(to Client)':label==='Closed'?'(Not Proceeding)':'';if(sub.textContent)caption.append(document.createElement('br'),sub);b.append(svg,strong,caption);}else {const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.innerHTML=metricIcons[stages.indexOf(label)+1];const caption=document.createElement('span');caption.textContent=label+' ('+n+')';b.append(svg,caption);}b.onclick=()=>{stageFilter=key;filter.value='consultation';page=0;selectedId=undefined;render();};container.append(b);}
    }
    page=Math.min(page,Math.max(0,Math.ceil(visible.length/8)-1));
    const pageRows=visible.slice(page*8,page*8+8);
    pager.replaceChildren();const info=document.createElement('span');info.textContent='Showing '+(visible.length?page*8+1:0)+'–'+Math.min(visible.length,page*8+8)+' of '+visible.length;pager.append(info);
    for(const [label,delta] of [['Previous',-1],['Next',1]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=delta<0?page===0:(page+1)*8>=visible.length;b.onclick=()=>{page+=delta;render();};pager.append(b);}
    for(let n=0;n<Math.ceil(visible.length/8);n++){const b=document.createElement('button');b.textContent=n+1;b.type='button';b.setAttribute('aria-current',n===page?'page':'false');b.onclick=()=>{page=n;render();};pager.insertBefore(b,pager.lastChild);}
    const selected = pageRows.find(record => record.id === selectedId) ?? pageRows[0];
    selectedId = selected?.id;
    list.replaceChildren();
    reader.replaceChildren();
    if (!selected) reader.textContent = 'No message to display.';

    status.textContent = visible.length ? '' : term ? 'No messages match your search.' : 'No messages in this view.';
    const table=document.createElement('table');table.className='enquiry-table';const head=table.createTHead().insertRow();for(const label of ['Received','Name','Subject','Preferred contact','Assigned to','Status','Follow-up','Actions']){const th=document.createElement('th');th.textContent=label;head.append(th);}const tbody=table.createTBody();list.append(table);
    for (const record of pageRows) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'inbox-row';
      row.setAttribute('aria-pressed', String(record.id === selectedId));
      row.addEventListener('click', () => {
        selectedId = record.id;
        activeReaderTab = 'details';
        render();
        reader.querySelector('h3')?.focus();
      });
      const details=document.createElement('article'); details.className='inbox-reader-card';
      const summary=document.createElement('div'); summary.className='inbox-ticket-heading';
      const message=document.createElement('p');
      const received=record.createdAt?.toDate();
      const date=received?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(received):'';
      const contact=record.contact??{};
      const title=document.createElement('strong'), meta=document.createElement('span'), preview=document.createElement('span');
      const consultation=record.kind==='consultation';
      const approvalStatus=record.approvalStatus||'pending';
      const stateText=consultation
        ? approvalStatus==='approved'?'Approved & scheduled':approvalStatus==='declined'?'Declined':'Needs approval'
        : record.reply?'Replied':'Needs reply';
      title.textContent=consultation?senderName(record)||'Consultation inquiry':'Website support request';
      meta.className='inbox-message-meta'; meta.textContent=[ticketCode(record),date&&'Received '+date+' Sydney'].filter(Boolean).join(' · ');
      preview.className='inbox-message-preview'; preview.textContent=String(record.message??'').replace(/\s+/g,' ').trim()||'No message details provided.';
      const rowTop=document.createElement('span'); rowTop.className='inbox-row-topline';
      const rowTitle=document.createElement('strong'); rowTitle.className='inbox-row-title'; rowTitle.textContent=title.textContent;
      const rowState=document.createElement('span'); rowState.className='inbox-row-state'+(consultation?(approvalStatus==='approved'?' is-done':approvalStatus==='declined'?' is-declined':' is-waiting'):''); rowState.textContent=stateText;
      const rowCode=document.createElement('span'); rowCode.className='inbox-row-code'; rowCode.textContent=ticketCode(record);
      const rowMeta=document.createElement('span'); rowMeta.className='inbox-message-meta';
      rowMeta.textContent=[consultation&&contact.email,date&&date+' · Sydney'].filter(Boolean).join(' · ');
      rowTop.append(rowTitle,rowState); row.append(rowTop,rowCode,rowMeta,preview); const tr=tbody.insertRow();tr.tabIndex=0;tr.setAttribute('aria-selected',String(record.id===selectedId));for(const val of [date,title.textContent,contact.topic||record.message?.slice(0,70)||'—',contact.email||contact.phone||'—',record.assignedTo||'Unassigned',consultation?stageOf(record):stateText,record.followUpDate||'—'])tr.insertCell().textContent=val||'—';const statusCell=tr.cells[5];if(statusCell){const pill=document.createElement('span');pill.className='enquiry-status';pill.dataset.stage=statusCell.textContent;pill.textContent=statusCell.textContent;statusCell.replaceChildren(pill);}const cc=tr.cells[3];const cv=cc.textContent;const wrap=document.createElement('span');wrap.className='eq-contact';wrap.append(eqIcon(contact.email?'mail':'phone'),document.createTextNode(cv));cc.replaceChildren(wrap);const more=document.createElement('button');more.type='button';more.className='eq-more';more.textContent='⋯';more.setAttribute('aria-label','View enquiry details');more.onclick=e=>{e.stopPropagation();row.click();};tr.insertCell().append(more);tr.onclick=()=>row.click();tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();row.click();}};
      if(record.id!==selectedId) continue;
      if(consultation){
        const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt)n.textContent=txt;if(cls)n.className=cls;return n;};
        const top=el('div','','eq-top');const badge=el('span',stageOf(record),'enquiry-status');badge.dataset.stage=stageOf(record);top.append(el('h3','Enquiry Details'),badge);details.append(top);
        const profile=el('div','','eq-profile');const avatar=el('div',(senderName(record)||'Unknown').split(' ').map(x=>x[0]).slice(0,2).join(''),'eq-avatar');const identity=el('div');identity.append(el('h3',senderName(record)||'Consultation enquiry'));
        for(const [value,scheme,kind] of [[contact.email,'mailto:','mail'],[contact.phone,'tel:','phone'],[contact.postcode,'','location']])if(value){const line=el('div','','eq-profile-line');const a=el(scheme?'a':'span',value);if(scheme)a.href=scheme+value;line.append(eqIcon(kind),a);if(kind==='mail'){const copy=el('button','','eq-copy');copy.type='button';copy.title='Copy email address';copy.setAttribute('aria-label','Copy email address');copy.append(eqIcon('copy'));const feedback=el('span','','eq-copy-feedback');feedback.setAttribute('role','status');copy.onclick=async()=>{try{await navigator.clipboard.writeText(value);feedback.textContent='Copied!';}catch{feedback.textContent='Unable to copy';}setTimeout(()=>{feedback.textContent='';},2200);};line.append(copy,feedback);}identity.append(line);}
        profile.append(avatar,identity);details.append(profile);
        const fields=el('div','','inbox-ticket-fields');addTicketField(fields,'Subject',contact.topic||'Not specified');addTicketField(fields,'Received',date);addTicketField(fields,'Preferred Contact',contact.preferredContact||(contact.email?'Email':'Phone'));details.append(fields);
        const msg=el('section','','eq-section');msg.append(el('strong','Inquiry Summary'),el('p',record.message||'No message provided.'));details.append(msg);
        const form=el('form','','eq-form');const note=el('textarea');note.placeholder='Add a note (visible to your firm only)…';note.value=record.internalNote||'';const nl=el('label','Internal Note');nl.append(note);form.append(nl);
        const grid=el('div','','eq-form-grid');const assign=el('select');assign.add(new Option('Unassigned',''));for(const member of staffDirectory)assign.add(new Option(member.name+' · '+member.email,member.id));if(record.assignedToUid&&!staffDirectory.some(m=>m.id===record.assignedToUid))assign.add(new Option((record.assignedTo||'Former staff')+' (unavailable)',record.assignedToUid));assign.value=record.assignedToUid||'';const al=el('label','Assign to');al.append(assign);const follow=el('input');follow.type='date';follow.value=record.followUpDate||'';const fl=el('label','Follow-up Date');fl.append(follow);grid.append(al,fl);form.append(grid);
        const save=el('button','Save details','eq-save');save.type='submit';const feedback=el('p');feedback.setAttribute('role','status');form.append(save,feedback);
        form.onsubmit=async e=>{e.preventDefault();save.disabled=true;const patch={internalNote:note.value,assignedTo:staffDirectory.find(m=>m.id===assign.value)?.name||(assign.value?record.assignedTo||'':''),assignedToUid:assign.value,followUpDate:follow.value};const changed=(record.assignedToUid||'')!==patch.assignedToUid;try{if(sampleMode){Object.assign(record,patch);render();}else await updateDoc(doc(db,'clientInbox',record.id),patch);status.textContent='';eqToast(changed?(patch.assignedToUid?'Enquiry successfully assigned to '+patch.assignedTo+'.':'Enquiry successfully unassigned.'):'Enquiry details saved successfully.');}catch{eqToast('Unable to save. Check staff permissions.',true);}finally{save.disabled=false;}};
        details.append(form);reader.append(details);continue;
      }
      const kicker=document.createElement('span'); kicker.className='inbox-ticket-kicker'; kicker.textContent=consultation?'Consultation enquiry':'Website support ticket';
      const titleRow=document.createElement('div'); titleRow.className='inbox-ticket-title-row';
      const heading=document.createElement('h3'); heading.textContent=title.textContent; heading.tabIndex=-1;
      const state=document.createElement('span'); state.className='inbox-ticket-state'+(consultation?(approvalStatus==='approved'?' is-done':approvalStatus==='declined'?' is-declined':' is-waiting'):record.reply?' is-done':' is-waiting');
      state.textContent=consultation
        ? approvalStatus==='approved'?'Approved & scheduled':approvalStatus==='declined'?'Declined':'Needs attorney approval'
        : record.reply?'Replied':'Awaiting reply';
      titleRow.append(heading,state);
      const readerMeta=document.createElement('span'); readerMeta.className='inbox-message-meta';
      readerMeta.textContent=[ticketCode(record),contact.email,date&&'Received '+date+' Sydney'].filter(Boolean).join(' · ');
      summary.append(kicker,titleRow,readerMeta); if(consultation){kicker.textContent='Enquiry Details';state.textContent=stageOf(record);} details.append(summary);
      if(consultation){
        const tabs=document.createElement('div'); tabs.className='inbox-contact-tabs'; tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','Client enquiry details');
        const tabNames=[['details','Details'],['matters','Matters'],['notes','Notes'],['communications','Communications']];
        for(const [key,label] of tabNames){
          const tab=document.createElement('button'); tab.type='button'; tab.setAttribute('role','tab'); tab.setAttribute('aria-selected',String(activeReaderTab===key)); tab.textContent=label;
          tab.addEventListener('click',()=>{activeReaderTab=key;render();});
          tabs.append(tab);
        }
        details.append(tabs);
      }
      if(consultation && activeReaderTab==='details'){
        const fields=document.createElement('div'); fields.className='inbox-ticket-fields';
        const topics={separation:'Separation and divorce',parenting:'Parenting arrangements',property:'Property and finances',consent:'Consent orders'};
        addTicketField(fields,'Inquiry type',topics[contact.topic]||contact.topic);
        addTicketField(fields,'Phone',contact.phone); addTicketField(fields,'Postcode',contact.postcode);
        addTicketField(fields,'New client',contact.newClient);
        addTicketField(fields,'Preferred date and time',formatPreferredTime(contact.preferredTime));
        details.append(fields);
        if(contact.preferredTime){const notice=document.createElement('p');notice.className='inbox-ticket-notice';notice.textContent='Requested appointment time · pending confirmation by the firm';details.append(notice);}
      }
      if(consultation && activeReaderTab==='matters'){
        const linkedMatter=contact.matter || contact.matterReference || '';
        const matterSection=document.createElement('section'); matterSection.className='inbox-ticket-message inbox-contact-tab-panel';
        const matterHeading=document.createElement('strong'); matterHeading.className='inbox-ticket-message-label'; matterHeading.textContent='Linked matters';
        const matterCopy=document.createElement('p'); matterCopy.textContent=linkedMatter?'Matter · '+linkedMatter:'No matter is linked to this consultation enquiry yet.';
        matterSection.append(matterHeading,matterCopy); details.append(matterSection);
      } else if(consultation && activeReaderTab==='notes'){
        const noteSection=document.createElement('section'); noteSection.className='inbox-ticket-message inbox-contact-tab-panel';
        const noteHeading=document.createElement('strong'); noteHeading.className='inbox-ticket-message-label'; noteHeading.textContent='Internal notes';
        const noteCopy=document.createElement('p'); noteCopy.textContent=record.internalNote || 'No internal note has been added to this enquiry.';
        noteSection.append(noteHeading,noteCopy); details.append(noteSection);
      } else if(consultation && activeReaderTab==='communications'){
        const communication=document.createElement('section'); communication.className='inbox-ticket-message inbox-contact-tab-panel';
        const communicationHeading=document.createElement('strong'); communicationHeading.className='inbox-ticket-message-label'; communicationHeading.textContent='Communications';
        const communicationCopy=document.createElement('p'); communicationCopy.textContent='Website consultation enquiry · '+(date||'Received date unavailable');
        communication.append(communicationHeading,communicationCopy); details.append(communication);
      } else if(!consultation || activeReaderTab==='details') {
        const messageSection=document.createElement('section'); messageSection.className='inbox-ticket-message';
        const messageLabel=document.createElement('strong'); messageLabel.className='inbox-ticket-message-label';
        messageLabel.textContent=consultation?'Client message':'Message';
        message.textContent=String(record.message??'').trim()||'No message details provided.';
        if(record.kind==='support'){message.className='chat-message';const sender=document.createElement('strong');sender.textContent='Visitor';message.prepend(sender);}
        messageSection.append(messageLabel,message); details.append(messageSection);
      }
      if (consultation && activeReaderTab==='communications' && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(contact.email || '')) {
        const email = document.createElement('a');
        email.className = 'inbox-email-action';
        email.href = 'mailto:' + contact.email.split('@').map(encodeURIComponent).join('@') + '?subject=' +
          encodeURIComponent('Re: Your consultation inquiry');
        email.textContent = 'Email client';
        details.append(email);
      }
      if (record.kind === 'support') {
        const form = document.createElement('form');
        const label = document.createElement('label');
        const reply = document.createElement('textarea');
        const button = document.createElement('button');
        reply.required = true;
        reply.maxLength = 1000;
        if (record.reply) {
          const previous = document.createElement('p');
          previous.className = 'chat-message chat-message-staff';
          const sender = document.createElement('strong');
          sender.textContent = 'Staff';
          previous.append(sender, record.reply);
          details.append(previous);
        }
        reply.value = drafts.get(record.id) ?? record.reply ?? '';
        reply.addEventListener('input', () => drafts.set(record.id, reply.value));
        label.textContent = 'Reply to client';
        label.append(reply);
        button.textContent = record.reply ? 'Update reply' : 'Send reply';
        const feedback = document.createElement('p');
        feedback.setAttribute('role', 'status');
        form.append(label, button, feedback);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const value = reply.value.trim();
          if (!value) return;
          button.disabled = true;
          try {
            if (sampleMode) {
              record.reply = value;
              showOverviewInbox(entries.filter(item => item.kind === 'support' && !item.reply).length);
              render();
            } else await updateDoc(doc(db, 'clientInbox', record.id), {reply:value});
            if (!alive) return;
            drafts.delete(record.id);
            status.textContent = sampleMode ? 'Sample reply updated.' : 'Reply saved and visible to the visitor.';
          } catch {
            if (alive) (feedback.isConnected ? feedback : status).textContent = 'Reply could not be saved.';
          }
          finally { button.disabled = false; }
        });
        details.append(form);
      }
      reader.append(details);
    }
  }
  filter.onchange=()=>{stageFilter='all';page=0;render();};sort.onchange=search.oninput=()=>{page=0;render();};
  let unsubscribe;
  function refreshStaff(event){if(event.detail.sampleMode!==sampleMode)return;staffDirectory=event.detail.staff||[];if(ready)render();}
  window.addEventListener('enquiry-staff-directory',refreshStaff);
  window.dispatchEvent(new Event('enquiry-staff-request'));
  function connect() {
    unsubscribe?.();
    ready = false;
    retry.hidden = true;
    status.textContent = 'Connecting to the website inbox…';
    unsubscribe = onSnapshot(query(collection(db, 'clientInbox'), orderBy('createdAt', 'desc'), limit(100)), snapshot => {
      if (!alive) return;
      ready = true;
      entries = snapshot.docs.map(item => ({id:item.id, ...item.data()}));
      showOverviewInbox(entries.filter(item => item.kind === 'support' && !item.reply).length);
      render();
    }, error => {
      if (!alive) return;
      ready = false;
      showOverviewInbox();
      const accessDenied = ['permission-denied', 'unauthenticated'].includes(error.code);
      status.textContent = accessDenied
        ? 'Inbox access unavailable. Ask your Firebase administrator to verify your staff role and the published rules.'
        : 'The website inbox could not connect. Try again.';
      retry.hidden = accessDenied;
      list.replaceChildren();
      reader.textContent = 'Messages will appear here when the inbox connects.';
      count.textContent = '';
    });
  }
  retry.onclick = connect;
  if (sampleMode) {
    entries = [
      {kind:'consultation', contact:{firstName:'Mia', lastName:'Bennett', email:'mia.bennett@example.com', phone:'0400 234 567', postcode:'2060', topic:'parenting', newClient:'Yes', preferredTime:'2026-11-26T13:00'}, message:'Hello, I’d like to arrange an initial consultation about school-holiday arrangements. Do you have any availability next week?'},
      {kind:'consultation', contact:{firstName:'Jordan', lastName:'Lee', email:'jordan.lee@example.com', phone:'0400 123 456', postcode:'2000', topic:'parenting', newClient:'Yes', preferredTime:'2026-11-25T10:00'}, message:'I need advice about a proposed parenting arrangement and the upcoming school holidays. Could someone contact me about an initial consultation?'},
      {kind:'consultation', contact:{firstName:'Alex', lastName:'Taylor', email:'alex.taylor@example.com', phone:'0400 345 678', postcode:'2065', topic:'property settlement', newClient:'Yes', preferredTime:'2026-11-27T11:30'}, message:'I am looking for advice about a property settlement following separation. I have started gathering our financial documents.'},
      {kind:'support', contact:{firstName:'Casey', lastName:'Turner', email:'casey.turner@example.com'}, message:'Could you confirm whether I should upload my bank statements before the appointment?'},
      {kind:'support', contact:{firstName:'Samantha', lastName:'Roberts', email:'samantha.roberts@example.com'}, message:'Can I move my consultation to an afternoon slot?', reply:'Please share two afternoon times that work for you and we’ll check availability.'},
      {kind:'support', contact:{firstName:'Mark', lastName:'Hughes', email:'mark.hughes@example.com'}, message:'I have uploaded the signed authority form. Please let me know if anything else is required.'}
    ].map((item, index) => ({id:'sample-message-' + index, reply:'', ...item, createdAt:{toDate:() => new Date(Date.now() - (index + 1) * 3600000)}}));
    ready = true;
    showOverviewInbox(entries.filter(item => item.kind === 'support' && !item.reply).length);
    render();
  } else connect();
  stop = () => { alive = false; unsubscribe?.(); window.removeEventListener('enquiry-staff-directory',refreshStaff); };
}
