const assistantTabs = ['Overview', 'Matters', 'Correspondence', 'Tasks', 'Clients', 'Resources'];
let assistantTab = 'Overview';
const assistantStateKey = 'family-law-assistant-v3';
function readAssistantState() {
  try { return JSON.parse(localStorage.getItem(assistantStateKey)) || {}; }
  catch { return {}; }
}
const assistantState = readAssistantState();
const submitted = assistantState.submitted || [];
const completed = assistantState.completed || {};
function saveAssistantState() {
  try { localStorage.setItem(assistantStateKey, JSON.stringify({ submitted, completed })); return true; }
  catch { return false; }
}
const escapeHtml = value => String(value).replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const priorities = [
  ['Draft letter to other party', 'M-014', 'Today'],
  ['Finalise disclosure index', 'M-017', 'Today'],
  ['Prepare brief for solicitor review', 'M-021', 'Today']
];
const followUps = [
  ['Follow up for signed authorisation', 'M-014', 'Today'],
  ['Confirm document receipt', 'M-019', '29 Jan'],
  ['Check in re: mediation availability', 'M-021', '30 Jan']
];
const pending = [
  ['Update asset and liability schedule', 'M-014', '30 Jan'],
  ['Draft consent orders', 'M-014', '31 Jan'],
  ['Prepare covering letter', 'M-014', '31 Jan'],
  ['Collate final disclosure documents', 'M-014', '3 Feb']
];
const initialReviews = [
  {id:'D-04', title:'Draft consent orders', matter:'M-014', body:'Sample draft consent orders for solicitor review.', status:'For review'},
  {id:'D-05', title:'Letter – property disclosure', matter:'M-017', body:'Sample letter requesting updated property disclosure.', status:'For review'}
];
records.push(...initialReviews, ...submitted);
matters['M-017'] = 'Property disclosure';
const allTasks = [...priorities, ...pending, ...followUps];
const templates = [
  ['Letters', 'Letter – requesting disclosure', 'Dear [Other Party’s Solicitor],\n\nRe: Property settlement – our client\n\nWe write in relation to the above matter. Please provide your client’s updated financial disclosure, including:\n\n• A completed Financial Statement;\n• Current bank statements.'],
  ['Emails', 'Email – document follow-up', 'Dear [Client],\n\nI’m following up on the outstanding documents for your matter. Please let us know if you need help providing them.'],
  ['Court documents', 'Court document – drafting notes', 'Matter: M-014\n\nSolicitor instructions:\n\nDrafting notes:']
];
let templateIndex = 0;
let editorText = templates[0][2];
let assistantNotice = '';
const proofreading = ['Spelling and grammar', 'Consistent tone and style', 'Correct matter reference (M-014)', 'Appropriate legal language', 'Check attachments (if any)'];
let proofChecks = new Set([0, 1, 2, 3]);
function showStaff() {
  document.querySelector('.header-nav').hidden = true;
  entry.textContent = 'Back to homepage';
  app.innerHTML = '<div class="shell"><main class="staff-choice"><h1>Staff workspace</h1><p>Open a workspace with sample records. Real staff accounts are pending setup. Do not enter client information.</p><div class="actions"><button class="action" data-assistant="Overview">Legal Assistant</button><button class="secondary" data-solicitor>Solicitor</button></div></main></div>';
}
function taskRows(rows) {
  return '<div class="table-scroll"><table><thead><tr><th scope="col">Task</th><th scope="col">Matter</th><th scope="col">Due</th></tr></thead><tbody>' + rows.map(([title,id,due]) => {
    const index = allTasks.findIndex(task => task[0] === title);
    return '<tr><td><label class="check-row"><input type="checkbox" data-task="'+index+'" '+(completed[index]?'checked':'')+'>'+title+'</label></td><td>'+id+'</td><td><span class="status">'+due+'</span></td></tr>';
  }).join('')+'</tbody></table></div>';
}
function panel(title, content, button='') {
  return '<section class="card"><div class="panel-head"><h2>'+title+'</h2>'+button+'</div>'+content+'</section>';
}
function reviewRows() {
  return '<div class="table-scroll"><table><thead><tr><th>Item</th><th>Matter</th><th>Status</th></tr></thead><tbody>'+[...initialReviews,...submitted].map(record =>
    '<tr><td>'+escapeHtml(record.title)+'</td><td>'+record.matter+'</td><td><span class="status">'+(status(record)==='For review'?'Ready for review':status(record))+'</span></td></tr>'
  ).join('')+'</tbody></table></div>';
}
function assistantContent() {
  const instructionsText = instructions['M-014'] || 'Prepare property settlement documentation, including draft consent orders, based on the latest financial disclosure. Ensure all assets and liabilities are captured and cross-referenced.';
  switch (assistantTab) {
    case 'Overview': {
      const due = priorities.filter((_, index) => !completed[index]).length;
      return '<div class="cards assistant-metrics">'+[[due,'Due today'],[8,'Due in 7 days'],[1,'Overdue'],[5,'Matter updates']].map(([number,label]) => '<div class="card"><span>'+label+'</span><strong class="metric">'+number+'</strong></div>').join('')+'</div><div class="assistant-grid">'+panel('Today’s priorities',taskRows(priorities),'<button class="text-button" data-assistant="Tasks">View all tasks</button>')+panel('Client follow-ups',taskRows(followUps),'<button class="text-button" data-assistant="Clients">View all</button>')+'</div>'+panel('Solicitor review',reviewRows(),'<button class="text-button" data-solicitor>View review queue</button>');
    }
    case 'Matters':
      return '<div class="matter-meta card">'+[['Matter ID','M-014'],['Matter type','Property settlement'],['Stage','Negotiation'],['Solicitor','SOL-001']].map(([label,value])=>'<div><small>'+label+'</small><br><strong>'+value+'</strong></div>').join('')+'</div>'+panel('Solicitor instructions','<p class="note">'+escapeHtml(instructionsText)+'</p>')+'<div class="assistant-grid">'+panel('Pending tasks',taskRows(pending))+panel('Linked files','<ul class="files"><li>Financial disclosure (v2).pdf <small>2.4 MB</small></li><li>Asset schedule.xlsx <small>412 KB</small></li><li>Draft consent orders.docx <small>56 KB</small></li><li>Correspondence – other party.pdf <small>1.1 MB</small></li></ul><small>Sample file list</small>')+'</div>';
    case 'Correspondence': {
      const categories = templates.map(([category], i) => '<button type="button" class="secondary" data-template="'+i+'" aria-pressed="'+(i===templateIndex)+'">'+category+'</button>').join('');
      return '<form id="assistant-draft">'+panel('Select a template','<div class="template-categories" aria-label="Template categories">'+categories+'</div><label for="draft-template">Template</label><select id="draft-template">'+templates.map(([category,title],i)=>'<option value="'+i+'" '+(i===templateIndex?'selected':'')+'>'+category+' · '+title+'</option>').join('')+'</select>')+'<div class="assistant-grid editor-grid">'+panel('Draft (editable)','<label for="draft-body">Document text</label><textarea id="draft-body" maxlength="12000" required>'+escapeHtml(editorText)+'</textarea><small id="word-count"></small>')+panel('Proofreading checks',proofreading.map((text,i)=>'<label class="check-row"><input type="checkbox" data-proof="'+i+'" '+(proofChecks.has(i)?'checked':'')+'>'+text+'</label>').join('')+'<button class="action">Submit for solicitor review</button>')+'</div></form>';
    }
    case 'Tasks': return panel('All tasks',taskRows(allTasks));
    case 'Clients': return panel('Client follow-ups',taskRows(followUps));
    case 'Resources': return panel('Draft templates','<p>Start with a letter, email, or court document template.</p><button class="action" data-assistant="Correspondence">Open correspondence</button>');
  }
}
function renderAssistant() {
  entry.textContent = 'Sign out';
  const title = assistantTab === 'Overview' ? 'Legal Assistant Overview' : assistantTab === 'Matters' ? 'M-014 – Property settlement' : assistantTab;
  app.innerHTML = '<div class="shell assistant"><nav aria-label="Legal Assistant workspace"><div class="role">Family Law<br><small>Legal Assistant · LA-002</small></div>'+assistantTabs.map(name=>'<button data-assistant="'+name+'" aria-current="'+(name===assistantTab)+'">'+name+'</button>').join('')+'</nav><main><h1>'+title+'</h1><p class="muted">Sample workspace · Changes stay in this browser</p><p id="notice" role="status">'+escapeHtml(assistantNotice)+'</p>'+assistantContent()+'</main></div>';
  updateWordCount();
}
function updateWordCount() {
  const count = document.querySelector('#word-count');
  if (count) count.textContent = 'Word count · '+(editorText.trim() ? editorText.trim().split(/\s+/).length : 0);
}
app.addEventListener('click', event => {
  const category = event.target.closest('[data-template]');
  if (category) {
    const next = Number(category.dataset.template);
    if (next !== templateIndex) selectTemplate(next);
    return;
  }
  const button = event.target.closest('[data-assistant],[data-solicitor]');
  if (!button) return;
  if (button.hasAttribute('data-solicitor')) {
    tab = 'Review Queue';
    selected = submitted.at(-1)?.id || 'D-04';
    notice = '';
    workspace();
    return;
  }
  assistantTab = button.dataset.assistant;
  assistantNotice = '';
  renderAssistant();
});
function selectTemplate(next) {
  if (editorText !== templates[templateIndex][2] && !window.confirm('Switch templates and replace the current draft?')) {
    renderAssistant();
    return;
  }
  templateIndex = next;
  editorText = templates[templateIndex][2];
  proofChecks.clear();
  renderAssistant();
}
app.addEventListener('change', event => {
  const field = event.target;
  if (field.id === 'draft-template') {
    selectTemplate(Number(field.value));
  }
  if (field.hasAttribute('data-task')) {
    completed[field.dataset.task] = field.checked;
    saveAssistantState();
    if (assistantTab === 'Overview') document.querySelector('.assistant-metrics .metric').textContent = priorities.filter((_,i)=>!completed[i]).length;
  }
  if (field.hasAttribute('data-proof')) {
    const check = Number(field.dataset.proof);
    if (field.checked) proofChecks.add(check);
    else proofChecks.delete(check);
  }
});
app.addEventListener('input', event => {
  if (event.target.id !== 'draft-body') return;
  editorText = event.target.value;
  updateWordCount();
});
app.addEventListener('submit', event => {
  if (event.target.id !== 'assistant-draft') return;
  event.preventDefault();
  if (!editorText.trim()) {
    const field = document.querySelector('#draft-body');
    field.setCustomValidity('Enter draft text before submitting.');
    field.reportValidity();
    return;
  }
  const record = {id:'A-'+Date.now()+'-'+submitted.length, title:templates[templateIndex][1], matter:'M-014', body:editorText.trim(), status:'For review'};
  submitted.push(record);
  records.push(record);
  assistantTab = 'Overview';
  assistantNotice = saveAssistantState() ? 'Draft added to the solicitor review queue.' : 'Draft added for this session only.';
  renderAssistant();
});
