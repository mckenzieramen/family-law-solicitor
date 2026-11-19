import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import { getAuth, getIdTokenResult, onIdTokenChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import { doc, getDocFromServer, getFirestore, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyBSRANSn7e2npR9SZ_tRdtxwe8QH-VAVUA',
  authDomain: 'family-law-firm.firebaseapp.com',
  projectId: 'family-law-firm',
  storageBucket: 'family-law-firm.firebasestorage.app',
  messagingSenderId: '900885902164',
  appId: '1:900885902164:web:f50b1989df3fd972a1cec1'
});
const auth = getAuth(app);
const db = getFirestore(app);
const dutyGroups = [
 {id:'legal', title:'Legal Administration', duties:[
  'Prepare, format and proofread legal correspondence and documents.',
  'Assist with drafting letters, emails and court documents using templates and solicitor instructions.',
  'Prepare briefs and organise documents for court hearings.',
  'Manage electronic client files and maintain accurate records.'
 ]},
 {id:'family', title:'Family Law Support', duties:[
  'Assist with the preparation of financial disclosure documents.',
  'Review, sort and organise bank statements, tax returns, payslips and superannuation records.',
  'Create schedules of assets, liabilities and financial information.',
  'Conduct preliminary legal research and case law searches under supervision.'
 ]},
 {id:'admin', title:'Administrative Support', duties:[
  'Liaise with clients professionally and courteously.',
  'Schedule appointments, meetings and court dates.',
  'Follow up with clients for outstanding documents and information.',
  'Maintain file management systems, electronic databases and archives.',
  'Carry out general administrative duties as required.'
 ]}
];
const login = document.getElementById('staff-login');
const logout = document.getElementById('staff-logout');
const panel = document.getElementById('staff-checklist');
const list = document.getElementById('duty-groups');
const authStatus = document.getElementById('auth-status');
const saveStatus = document.getElementById('save-status');
let generation = 0;
let checklist;

function render(progress) {
  list.replaceChildren();
  for (const group of dutyGroups) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'duty-group';
    const legend = document.createElement('legend');
    legend.textContent = group.title;
    fieldset.append(legend);
    for (const [index, duty] of group.duties.entries()) {
      const key = group.id + '-' + index;
      const label = document.createElement('label');
      label.className = 'duty-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.duty = key;
      input.checked = progress[key] === true;
      label.append(input, duty);
      fieldset.append(label);
    }
    list.append(fieldset);
  }
}

login.addEventListener('submit', async event => {
  event.preventDefault();
  const button = login.querySelector('button');
  const data = new FormData(login);
  button.disabled = true;
  authStatus.textContent = 'Signing in…';
  try {
    await signInWithEmailAndPassword(auth, data.get('email').trim(), data.get('password'));
    login.reset();
  } catch {
    authStatus.textContent = 'Sign-in failed. Check your credentials or contact your Firebase administrator.';
  } finally {
    button.disabled = false;
  }
});

logout.addEventListener('click', async () => {
  try { await signOut(auth); }
  catch { authStatus.textContent = 'Sign-out failed. Please try again.'; }
});

onIdTokenChanged(auth, async user => {
  const current = ++generation;
  checklist = undefined;
  panel.hidden = true;
  list.replaceChildren();
  login.hidden = Boolean(user);
  logout.hidden = !user;
  authStatus.textContent = user ? 'Checking staff access…' : 'Sign in with your solicitor account.';
  if (!user) return;
  try {
    const { claims } = await getIdTokenResult(user);
    if (current !== generation) return;
    if (claims.role !== 'solicitor') {
      authStatus.textContent = 'This account does not have solicitor access.';
      return;
    }
    const reference = doc(db, 'solicitorChecklists', user.uid);
    const snapshot = await getDocFromServer(reference);
    if (current !== generation) return;
    checklist = reference;
    render(snapshot.data()?.progress ?? {});
    saveStatus.textContent = '';
    panel.hidden = false;
    authStatus.textContent = 'Signed in as solicitor.';
  } catch {
    if (current === generation) authStatus.textContent = 'Checklist unavailable. Verify the Firestore database and access rules.';
  }
});

list.addEventListener('change', async event => {
  const box = event.target;
  if (!checklist || !box.matches('input[data-duty]')) return;
  const current = generation;
  const checked = box.checked;
  box.disabled = true;
  saveStatus.textContent = 'Saving…';
  try {
    await setDoc(checklist, {progress: {[box.dataset.duty]: checked}, updatedAt: serverTimestamp()}, {merge: true});
    if (current === generation) saveStatus.textContent = 'Saved to Firestore.';
  } catch {
    if (current === generation) {
      box.checked = !checked;
      saveStatus.textContent = 'The change could not be saved.';
    }
  } finally {
    box.disabled = false;
  }
});
