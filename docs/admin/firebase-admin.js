import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import { getAuth, getIdTokenResult, onIdTokenChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import { doc, getDocFromServer, getFirestore, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

import { mountInbox, clearInbox } from './inbox.js?v=workspace-design-6';
import { mountWorkflow, clearWorkflow } from './workflow.js?v=workspace-design-6';

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
const entryCard = document.getElementById('staff-entry');
const dashboardSession = document.getElementById('dashboard-session');
const signOutHome = logout.parentElement;

function updateDashboardTotals() {
  if (!dashboardSession) return;
  const boxes = [...list.querySelectorAll('input[data-duty]')];
  const done = boxes.filter(box => box.dataset.saved === 'true').length;
  const percent = boxes.length ? Math.round(done / boxes.length * 100) : 0;
  document.getElementById('dashboard-completed').textContent = done;
  document.getElementById('dashboard-remaining').textContent = boxes.length - done;
  document.getElementById('dashboard-percent').textContent = percent + '%';
  document.getElementById('dashboard-progress').value = percent;
}
const employeePanel = document.getElementById('employee-panel');
const employeeForm = document.getElementById('employee-form');
employeeForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const user = auth.currentUser;
  if (!user || employeePanel.hidden) return;
  const uid = new FormData(employeeForm).get('uid').trim();
  const output = document.getElementById('employee-status');
  if (!uid || uid.includes('/') || uid === '.' || uid === '..' || uid === user.uid) {
    output.textContent = 'Enter the UID of another Firebase Authentication account.';
    return;
  }
  const current = generation;
  const button = employeeForm.querySelector('button');
  button.disabled = true;
  try {
    await setDoc(doc(db, 'users', uid), {role: 'employee', lawyerUid: user.uid});
    if (current !== generation) return;
    employeeForm.reset();
    output.textContent = 'Employee access granted.';
  } catch {
    if (current === generation) output.textContent = 'Could not grant access. Check Firestore rules and whether the account already has a role.';
  } finally {
    button.disabled = false;
  }
});

function render(progress) {
  list.replaceChildren();
  for (const group of dutyGroups) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'duty-group';
    fieldset.id = 'duties-' + group.id;
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
      input.dataset.saved = String(input.checked);
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
  } catch (error) {
    const messages = {
      'auth/invalid-credential': 'Check your staff email and Firebase password. If you need a new password, contact your Firebase administrator.',
      'auth/operation-not-allowed': 'Email/password sign-in is disabled in Firebase Authentication.',
      'auth/user-disabled': 'This staff account is disabled. Contact your Firebase administrator.',
      'auth/too-many-requests': 'Too many sign-in attempts. Wait and try again.',
      'auth/network-request-failed': 'Could not reach Firebase Authentication. Check your internet connection and try again.',
      'auth/invalid-api-key': 'The Firebase connection is misconfigured. Contact your Firebase administrator.'
    };
    authStatus.textContent = messages[error?.code] || 'Sign-in failed. Contact your Firebase administrator.';
  } finally {
    button.disabled = false;
  }
});

logout.addEventListener('click', async () => {
  try { await signOut(auth); }
  catch { (panel.hidden ? authStatus : saveStatus).textContent = 'Sign-out failed. Please try again.'; }
});

onIdTokenChanged(auth, async user => {
  const current = ++generation;
  checklist = undefined;
  clearWorkflow();
  clearInbox();
  if (entryCard) {
    entryCard.hidden = false;
    signOutHome.append(logout);
  }
  panel.hidden = true;
  if (employeePanel) {
    employeePanel.hidden = true;
    employeeForm.reset();
    document.getElementById('employee-status').textContent = '';
  }
  list.replaceChildren();
  login.hidden = Boolean(user);
  logout.hidden = !user;
  authStatus.textContent = user ? 'Checking staff access…' : 'Sign in with your staff account.';
  if (!user) return;
  try {
    const { claims } = await getIdTokenResult(user);
    if (current !== generation) return;
    const profile = claims.role === 'solicitor' ? null :
      (await getDocFromServer(doc(db, 'users', user.uid))).data();
    const role = claims.role === 'solicitor' ? 'solicitor' : profile?.role;
    const admin = role === 'admin' && profile?.Active === true;
    if (current !== generation) return;
    if (role !== 'solicitor' && (employeePanel || (!admin && role !== 'employee'))) {
      authStatus.textContent = 'This account does not have access to this workspace.';
      return;
    }
    if (employeePanel) employeePanel.hidden = false;
    const reference = doc(db, 'solicitorChecklists', user.uid);
    const snapshot = await getDocFromServer(reference);
    if (current !== generation) return;
    checklist = reference;
    render(snapshot.data()?.progress ?? {});
    saveStatus.textContent = '';
    panel.hidden = false;
    if (dashboardSession) {
      document.getElementById('dashboard-role').textContent = {admin: 'Administrator', employee: 'Employee', solicitor: 'Solicitor'}[role];
      updateDashboardTotals();
      dashboardSession.append(logout);
      entryCard.hidden = true;
      mountWorkflow(db, user.uid);
      if (admin || role === 'solicitor') mountInbox(db);
    }
    authStatus.textContent = role === 'solicitor' ? 'Signed in as solicitor.' : admin ? 'Signed in as admin.' : 'Signed in as employee.';
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
    if (current === generation) {
      box.dataset.saved = String(checked);
      updateDashboardTotals();
      saveStatus.textContent = 'Progress saved.';
    }
  } catch {
    if (current === generation) {
      box.checked = !checked;
      saveStatus.textContent = 'The change could not be saved.';
    }
  } finally {
    box.disabled = false;
  }
});
