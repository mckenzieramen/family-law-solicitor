import {collection, query, orderBy, limit, onSnapshot, doc, updateDoc} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

const panel = document.getElementById('staff-inbox');
const list = document.getElementById('inbox-list');
const status = document.getElementById('inbox-status');
const filter = document.getElementById('inbox-filter');
const search = document.getElementById('inbox-search');
const nav = document.getElementById('inbox-nav');
let stop;

export function clearInbox() {
  stop?.();
  stop = undefined;
  if (!panel) return;
  filter.onchange = search.oninput = null;
  search.value = '';
  panel.hidden = nav.hidden = true;
  list.replaceChildren();
}

export function mountInbox(db) {
  if (!panel) return;
  panel.hidden = nav.hidden = false;
  status.textContent = 'Loading messages…';
  let entries = [];
  let alive = true;
  const drafts = new Map();
  function render() {
    const term = search.value.trim().toLowerCase();
    const visible = entries.filter(({kind, contact, message}) => {
      if (filter.value !== 'all' && filter.value !== kind) return false;
      return !term || [contact?.firstName, contact?.lastName, contact?.email, message]
        .filter(Boolean).join(' ').toLowerCase().includes(term);
    });
    const expanded = new Set([...list.querySelectorAll('details[open]')].map(row => row.dataset.messageId));
    list.replaceChildren();
    status.textContent = visible.length ? '' : term ? 'No messages match your search.' : 'No messages in this view.';
    for (const record of visible) {
      const details = document.createElement('details');
      details.dataset.messageId = record.id;
      details.open = expanded.has(record.id);
      const summary = document.createElement('summary');
      const message = document.createElement('p');
      const date = record.createdAt?.toDate().toLocaleString('en-AU', {timeZone:'Australia/Sydney'});
      const contact = record.contact ?? {};
      summary.textContent = (record.kind === 'consultation' ? 'Consultation · ' + contact.firstName + ' ' + contact.lastName : record.reply ? 'Support chat · Replied' : 'Support chat · Awaiting reply') + (date ? ' · ' + date : '');
      message.textContent = record.message;
      details.append(summary);
      if (record.kind === 'consultation') {
        const fields = document.createElement('p');
        fields.textContent = [contact.topic, contact.email, contact.phone, contact.postcode, contact.newClient && 'New client: ' + contact.newClient, contact.preferredTime && 'Preferred time: ' + contact.preferredTime + ' Sydney'].filter(Boolean).join(' · ');
        details.append(fields);
      }
      if (record.kind === 'support') {
        message.className = 'chat-message';
        const sender = document.createElement('strong');
        sender.textContent = 'Visitor';
        message.prepend(sender);
      }
      details.append(message);
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
      list.append(details);
    }
  }
  filter.onchange = search.oninput = render;
  const unsubscribe = onSnapshot(query(collection(db, 'clientInbox'), orderBy('createdAt', 'desc'), limit(100)), snapshot => {
    entries = snapshot.docs.map(item => ({id:item.id, ...item.data()}));
    render();
  }, () => { status.textContent = 'Inbox unavailable. Check the Firestore rules and staff permissions.'; });
  stop = () => { alive = false; unsubscribe(); };
}
