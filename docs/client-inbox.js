import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import {getAuth, signInAnonymously} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import {getFirestore, collection, doc, setDoc, onSnapshot, serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';
const app = initializeApp({
  apiKey: 'AIzaSyBSRANSn7e2npR9SZ_tRdtxwe8QH-VAVUA',
  authDomain: 'family-law-firm.firebaseapp.com',
  projectId: 'family-law-firm',
  storageBucket: 'family-law-firm.firebasestorage.app',
  messagingSenderId: '900885902164',
  appId: '1:900885902164:web:f50b1989df3fd972a1cec1'
}, "client-intake");

const auth = getAuth(app);
const db = getFirestore(app);
const root = document.getElementById('app');
const supportKey = 'family-law-support-id';
let unsubscribe;
const pending = new WeakMap();
const topicNames = ['separation', 'parenting', 'property', 'financial', 'consent', 'maintenance', 'violence', 'mediation', 'other'];

async function clientIdentity() {
  await auth.authStateReady();
  return auth.currentUser ?? (await signInAnonymously(auth)).user;
}

function watchSupport(user, id) {
  unsubscribe?.();
  unsubscribe = onSnapshot(doc(db, 'clientInbox', id), snapshot => {
    const record = snapshot.data();
    const output = document.getElementById('support-result');
    if (!output || record?.ownerUid !== user.uid) return;
    output.textContent = record.reply ? 'Staff reply: ' + record.reply : 'Question sent. Waiting for a staff reply.';
  }, () => {
    const output = document.getElementById('support-result');
    if (output) output.textContent = 'Could not check for a reply.';
  });
}

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['consultation-form', 'support-form'].includes(form.id)) return;
  event.preventDefault();
  event.stopPropagation();
  const consultation = form.id === 'consultation-form';
  const output = document.getElementById(consultation ? 'consultation-result' : 'support-result');
  const button = form.querySelector('button[type=submit]');
  if (button.disabled) return;
  const data = new FormData(form);
  const value = name => String(data.get(name) ?? '').trim();
  const message = value('message');
  if (!message || (consultation && (!value('firstName') || !value('lastName') || !topicNames.includes(value('topic'))))) {
    output.textContent = 'Please fill in the required fields.';
    return;
  }
  button.disabled = true;
  output.textContent = 'Sending…';
  try {
    const user = await clientIdentity();
    const reference = pending.get(form) ?? doc(collection(db, 'clientInbox'));
    pending.set(form, reference);
    const contact = consultation ? Object.fromEntries(
      ['firstName', 'lastName', 'email', 'phone', 'postcode', 'topic', 'newClient', 'preferredTime'].map(name => [name, value(name)])
    ) : {};
    await setDoc(reference, {
      kind: consultation ? 'consultation' : 'support',
      ownerUid: user.uid,
      message, contact, createdAt: serverTimestamp(), reply: ''
    });
    pending.delete(form);
    form.reset();
    output.textContent = consultation ? 'Inquiry received. The team will contact you.' : 'Question sent. Waiting for a staff reply.';
    if (consultation) {
      const dialog = document.getElementById('consultation-success-dialog');
      if (dialog) {
        const referenceLabel=dialog.querySelector('[data-reference]');
        if(referenceLabel)referenceLabel.textContent=reference.id;
        document.querySelector('.booking-workflow-dialog')?.close();
        dialog.showModal();
      }
    }
    if (!consultation) {
      try { localStorage.setItem(supportKey, reference.id); } catch {}
      watchSupport(user, reference.id);
    }
  } catch (error) {
    console.error('Consultation enquiry submission failed:', error);
    const code = String(error?.code || '');
    output.textContent = code.includes('permission-denied')
      ? 'Your enquiry could not be saved because the form permissions need attention. Please contact the firm directly.'
      : code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation'
      ? 'The enquiry form is not fully enabled yet. Please contact the firm directly while this is being fixed.'
      : code.includes('network-request-failed') || code.includes('unavailable')
      ? 'Connection problem. Your enquiry was not confirmed. Please try again.'
      : 'Could not send your enquiry. Please try again or contact the firm directly.';
  } finally {
    button.disabled = false;
  }
}, true);

function enableForms() {
  for (const button of document.querySelectorAll('#consultation-form .consultation-footer button[type=submit], #support-form button[type=submit]')) button.disabled = false;
}
new MutationObserver(enableForms).observe(root, {childList:true});
enableForms();

let previous;
try { previous = localStorage.getItem(supportKey); } catch {}
if (previous) auth.authStateReady().then(() => {
  if (auth.currentUser) watchSupport(auth.currentUser, previous);
}).catch(() => {});
