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
  const caption=document.createElement('span'); caption.textContent=label;
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
  let entries = [];
  let alive = true;
  let ready = false;
  let selectedId;
  let activeReaderTab = 'details';
  const drafts = new Map();
  for (const card of quickCards) card.onclick = () => { filter.value = card.dataset.inboxQuickFilter; render(); };
  let stageFilter='all', page=0;
  const stages=['New','Contacted','Consultation Booked','Converted','Closed'];
  const stageOf=r=>r.approvalStatus==='declined'?'Closed':r.approvalStatus==='approved'?'Consultation Booked':stages.includes(r.enquiryStatus)?r.enquiryStatus:'New';
  const pipeline=document.createElement('div');pipeline.className='enquiry-pipeline';
  const metrics=document.createElement('div');metrics.className='enquiry-metrics';
  const pager=document.createElement('div');pager.className='enquiry-pager';
  list.before(pipeline);list.before(metrics);list.after(pager);
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
    const visible = entries.filter(record => {
      if(stageFilter!=='all'&&(record.kind!=='consultation'||stageOf(record)!==stageFilter))return false;
      const {kind, contact, message, reply} = record;
      if (type === 'unanswered' && (kind !== 'support' || reply)) return false;
      if (type === 'replied' && (kind !== 'support' || !reply)) return false;
      if (type === 'newToday' && (kind !== 'consultation' || !receivedToday(record))) return false;
      if (type === 'appointment' && (kind !== 'consultation' || !contact?.preferredTime)) return false;
      if (['consultation', 'support'].includes(type) && type !== kind) return false;
      return !term || [contact?.firstName, contact?.lastName, contact?.email, contact?.topic, message]
        .filter(Boolean).join(' ').toLowerCase().includes(term);
    });
    if (sort.value === 'oldest') visible.reverse();
    if (sort.value === 'name') visible.sort((a, b) => sortText(senderName(a), senderName(b)));
    if (sort.value === 'email') visible.sort((a, b) => sortText(a.contact?.email, b.contact?.email));
    count.textContent = 'Showing ' + visible.length + ' of ' + entries.length + ' loaded messages' +
      (entries.length === 100 ? ' · latest 100' : '');
    const consultations=entries.filter(r=>r.kind==='consultation');
    for(const [container,labels] of [[metrics,['All enquiries',...stages]],[pipeline,['All',...stages]]]){
      container.replaceChildren();
      for(const label of labels){const key=label.startsWith('All')?'all':label;const n=key==='all'?consultations.length:consultations.filter(r=>stageOf(r)===key).length;const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(stageFilter===key));if(container===metrics){const strong=document.createElement('strong');strong.textContent=n;const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.innerHTML=metricIcons[labels.indexOf(label)];const caption=document.createElement('span');caption.textContent=label;b.append(svg,strong,caption);}else b.textContent=label+' ('+n+')';b.onclick=()=>{stageFilter=key;filter.value='consultation';page=0;render();};container.append(b);}
    }
    page=Math.min(page,Math.max(0,Math.ceil(visible.length/8)-1));
    const pageRows=visible.slice(page*8,page*8+8);
    pager.replaceChildren();const info=document.createElement('span');info.textContent='Showing '+(visible.length?page*8+1:0)+'–'+Math.min(visible.length,page*8+8)+' of '+visible.length;pager.append(info);
    for(const [label,delta] of [['Previous',-1],['Next',1]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=delta<0?page===0:(page+1)*8>=visible.length;b.onclick=()=>{page+=delta;render();};pager.append(b);}
    const selected = pageRows.find(record => record.id === selectedId) ?? pageRows[0];
    selectedId = selected?.id;
    list.replaceChildren();
    reader.replaceChildren();
    if (!selected) reader.textContent = 'No message to display.';

    status.textContent = visible.length ? '' : term ? 'No messages match your search.' : 'No messages in this view.';
    const table=document.createElement('table');table.className='enquiry-table';const head=table.createTHead().insertRow();for(const label of ['Received','Name','Subject','Preferred contact','Assigned to','Status','Follow-up']){const th=document.createElement('th');th.textContent=label;head.append(th);}const tbody=table.createTBody();list.append(table);
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
      rowTop.append(rowTitle,rowState); row.append(rowTop,rowCode,rowMeta,preview); const tr=tbody.insertRow();tr.tabIndex=0;tr.setAttribute('aria-selected',String(record.id===selectedId));for(const val of [date,title.textContent,contact.topic||record.message?.slice(0,70)||'—',contact.email||contact.phone||'—',record.assignedTo||'Unassigned',consultation?stageOf(record):stateText,record.followUpDate||'—'])tr.insertCell().textContent=val||'—';const statusCell=tr.cells[5];if(statusCell){const pill=document.createElement('span');pill.className='enquiry-status';pill.dataset.stage=statusCell.textContent;pill.textContent=statusCell.textContent;statusCell.replaceChildren(pill);}tr.onclick=()=>row.click();tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();row.click();}};
      if(record.id!==selectedId) continue;
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
  stop = () => { alive = false; unsubscribe?.(); };
}
