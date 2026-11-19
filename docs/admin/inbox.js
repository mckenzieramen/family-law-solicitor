import {collection, query, orderBy, limit, onSnapshot, doc, updateDoc} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

const panel = document.getElementById('staff-inbox');
const list = document.getElementById('inbox-list');
const status = document.getElementById('inbox-status');
const filter = document.getElementById('inbox-filter');
const nav = document.getElementById('inbox-nav');
let stop;

export function clearInbox() {
  stop?.();
  stop = undefined;
  if (!panel) return;
  filter.onchange = null;
  panel.hidden = nav.hidden = true;
  list.replaceChildren();
}

export function mountInbox(db) {
  if (!panel) return;
  panel.hidden = nav.hidden = false;
  status.textContent = 'Loading messages…';
  let entries = [];
  function render() {
    const visible = entries.filter(({kind}) => filter.value === 'all' || filter.value === kind);
    list.replaceChildren();
    status.textContent = visible.length ? '' : 'No messages in this view.';
    for (const record of visible) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const message = document.createElement('p');
      const date = record.createdAt?.toDate().toLocaleString('en-AU', {timeZone:'Australia/Sydney'});
      const contact = record.contact ?? {};
      summary.textContent = (record.kind === 'consultation' ? 'Consultation · ' + contact.firstName + ' ' + contact.lastName : 'Support question') + (date ? ' · ' + date : '');
      message.textContent = record.message;
      details.append(summary);
      if (record.kind === 'consultation') {
        const fields = document.createElement('p');
        fields.textContent = [contact.topic, contact.email, contact.phone, contact.postcode, contact.newClient && 'New client: ' + contact.newClient, contact.preferredTime && 'Preferred time: ' + contact.preferredTime + ' Sydney'].filter(Boolean).join(' · ');
        details.append(fields);
      }
      details.append(message);
      if (record.kind === 'support') {
        const form = document.createElement('form');
        const label = document.createElement('label');
        const reply = document.createElement('textarea');
        const button = document.createElement('button');
        reply.required = true;
        reply.maxLength = 1000;
        reply.value = record.reply;
        label.textContent = 'Reply to client';
        label.append(reply);
        button.textContent = 'Send reply';
        form.append(label, button);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const value = reply.value.trim();
          if (!value) return;
          button.disabled = true;
          try { await updateDoc(doc(db, 'clientInbox', record.id), {reply:value}); }
          catch { status.textContent = 'Reply could not be saved.'; }
          finally { button.disabled = false; }
        });
        details.append(form);
      }
      list.append(details);
    }
  }
  filter.onchange = render;
  stop = onSnapshot(query(collection(db, 'clientInbox'), orderBy('createdAt', 'desc'), limit(100)), snapshot => {
    entries = snapshot.docs.map(item => ({id:item.id, ...item.data()}));
    render();
  }, () => { status.textContent = 'Inbox unavailable. Check the Firestore rules and staff permissions.'; });
}
