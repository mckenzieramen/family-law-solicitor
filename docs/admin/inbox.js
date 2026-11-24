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
}

export function mountInbox(db, sampleMode = false) {
  if (!panel) return;
  panel.hidden = nav.hidden = false;
  if (overviewLink) overviewLink.hidden = false;
  status.textContent = 'Loading messages…';
  let entries = [];
  let alive = true;
  let ready = false;
  let selectedId;
  let activeReaderTab = 'details';
  const drafts = new Map();
  for (const card of quickCards) card.onclick = () => { filter.value = card.dataset.inboxQuickFilter; render(); };
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
    const selected = visible.find(record => record.id === selectedId) ?? visible[0];
    selectedId = selected?.id;
    list.replaceChildren();
    reader.replaceChildren();
    if (!selected) reader.textContent = 'No message to display.';

    status.textContent = visible.length ? '' : term ? 'No messages match your search.' : 'No messages in this view.';
    for (const record of visible) {
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
      rowTop.append(rowTitle,rowState); row.append(rowTop,rowCode,rowMeta,preview); list.append(row);
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
      summary.append(kicker,titleRow,readerMeta); details.append(summary);
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
  filter.onchange = sort.onchange = search.oninput = render;
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
      {kind:'consultation', contact:{firstName:'Mia', lastName:'Bennett', email:'mia@example.com', phone:'0400 123 456', postcode:'2060', topic:'parenting', newClient:'Yes', preferredTime:'2026-11-25T13:00'}, message:'Hello, I’d like to arrange an initial consultation about school-holiday arrangements. Do you have any availability next week?'},
      {kind:'support', contact:{}, message:'Could you confirm whether I should upload my statements before the appointment?'},
      {kind:'support', contact:{}, message:'Can I move my consultation to an afternoon slot?', reply:'Please share two afternoon times that work for you and we’ll check availability.'}
    ].map((item, index) => ({id:'sample-message-' + index, reply:'', ...item, createdAt:{toDate:() => new Date(Date.now() - (index + 1) * 3600000)}}));
    ready = true;
    showOverviewInbox(entries.filter(item => item.kind === 'support' && !item.reply).length);
    render();
  } else connect();
  stop = () => { alive = false; unsubscribe?.(); };
}
