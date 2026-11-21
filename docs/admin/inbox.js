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
const senderName = record => [record.contact?.firstName, record.contact?.lastName].filter(Boolean).join(' ');
const compareText = (a, b) => a.localeCompare(b, 'en-AU', {sensitivity:'base'});
const sortText = (a, b) => a && b ? compareText(a, b) : Number(!a) - Number(!b);
const nav = document.getElementById('inbox-nav');
let stop;

export function clearInbox() {
  stop?.();
  stop = undefined;
  if (!panel) return;
  filter.onchange = sort.onchange = search.oninput = null;
  count.textContent = '';
  search.value = '';
  panel.hidden = nav.hidden = true;
  list.replaceChildren();
  reader.replaceChildren();
  retry.onclick = null;
  retry.hidden = true;
}

export function mountInbox(db) {
  if (!panel) return;
  panel.hidden = nav.hidden = false;
  status.textContent = 'Loading messages…';
  let entries = [];
  let alive = true;
  let ready = false;
  let selectedId;
  const drafts = new Map();
  function render() {
    if (!ready) return;
    const term = search.value.trim().toLowerCase();
    const type = filter.value;
    const visible = entries.filter(({kind, contact, message, reply}) => {
      if (type === 'unanswered' && (kind !== 'support' || reply)) return false;
      if (type === 'replied' && (kind !== 'support' || !reply)) return false;
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
        render();
        reader.querySelector('h3')?.focus();
      });
      const details = document.createElement('article');
      const summary = document.createElement('div');
      summary.className = 'inbox-reader-heading';
      const message = document.createElement('p');
      const date = record.createdAt?.toDate().toLocaleString('en-AU', {timeZone:'Australia/Sydney'});
      const contact = record.contact ?? {};
      const title = document.createElement('strong');
      const meta = document.createElement('span');
      const preview = document.createElement('span');
      const consultation = record.kind === 'consultation';
      title.textContent = consultation ? senderName(record) || 'Consultation inquiry' :
        (record.reply ? 'Support chat · Replied' : 'Support chat · Awaiting reply');
      meta.className = 'inbox-message-meta';
      meta.textContent = [consultation && contact.email, date && date + ' Sydney'].filter(Boolean).join(' · ');
      preview.className = 'inbox-message-preview';
      preview.textContent = String(record.message ?? '').replace(/\s+/g, ' ').trim();
      row.append(title.cloneNode(true), meta.cloneNode(true), preview);
      list.append(row);
      if (record.id !== selectedId) continue;
      const heading = document.createElement('h3');
      heading.textContent = title.textContent;
      heading.tabIndex = -1;
      summary.append(heading, meta);
      message.textContent = record.message;
      details.append(summary);
      if (consultation) {
        const fields = document.createElement('p');
        fields.textContent = [contact.topic, contact.phone, contact.postcode, contact.newClient && 'New client: ' + contact.newClient, contact.preferredTime && 'Preferred time: ' + contact.preferredTime + ' Sydney'].filter(Boolean).join(' · ');
        details.append(fields);
      }
      if (record.kind === 'support') {
        message.className = 'chat-message';
        const sender = document.createElement('strong');
        sender.textContent = 'Visitor';
        message.prepend(sender);
      }
      details.append(message);
      if (consultation && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(contact.email || '')) {
        const email = document.createElement('a');
        email.className = 'inbox-email-action';
        email.href = 'mailto:' + contact.email.split('@').map(encodeURIComponent).join('@') + '?subject=' +
          encodeURIComponent('Re: Your consultation inquiry');
        email.textContent = 'Open email draft';
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
            await updateDoc(doc(db, 'clientInbox', record.id), {reply:value});
            if (!alive) return;
            drafts.delete(record.id);
            status.textContent = 'Reply saved and visible to the visitor.';
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
      render();
    }, error => {
      if (!alive) return;
      ready = false;
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
  connect();
  stop = () => { alive = false; unsubscribe?.(); };
}
