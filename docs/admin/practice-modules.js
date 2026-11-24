(() => {
  const byId = id => document.getElementById(id);
  const safeText = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const emptyRows = (cols, text) => '<tr><td colspan="'+cols+'" class="pm-empty">'+text+'</td></tr>';
  const table = (heads, empty) => '<div class="pm-table-wrap"><table class="pm-table"><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+emptyRows(heads.length,empty)+'</tbody></table></div>';
  const notice = '<div class="pm-connection-note"><span class="pm-lock" aria-hidden="true">✓</span><span><strong>Your changes will be saved to this firm’s secure Firebase workspace when you submit the form.</span></div>';
  const header = (eyebrow,title,description,action='') => '<header class="pm-heading"><div><p class="module-eyebrow">'+eyebrow+'</p><h2>'+title+'</h2><p>'+description+'</p></div>'+action+'</header>';
  const toolbar = fields => '<div class="pm-toolbar">'+fields+'</div>';
  const button = (label,dialog,primary=true) => '<button type="button" class="pm-button '+(primary?'pm-primary':'')+'" data-open-dialog="'+dialog+'">'+label+'</button>';
  const dialog = (id,title,fields,submitText) => '<dialog class="pm-dialog" id="'+id+'"><form class="pm-form" data-preview-form><header><div><p class="module-eyebrow">New record</p><h3>'+title+'</h3></div><button type="button" class="pm-close" data-close-dialog aria-label="Close">×</button></header>'+notice+'<div class="pm-form-grid">'+fields+'</div><footer><p role="status" class="pm-status"></p><button type="button" class="pm-button" data-close-dialog>Cancel</button><button class="pm-button pm-primary" type="submit">'+submitText+'</button></footer></form></dialog>';
  const field=(label,name,type='text',opts='')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" '+opts+'></label>';
  const select=(label,name,items)=>'<label>'+label+'<select name="'+name+'">'+items.map(x=>'<option>'+x+'</option>').join('')+'</select></label>';
  const area=(label,name,rows=3,opts='')=>'<label class="pm-span-2">'+label+'<textarea name="'+name+'" rows="'+rows+'" '+opts+'></textarea></label>';

  const modules = {
    'work-documents': {
      html: header('Matter files','Documents','Secure matter file library with search, filters and document details.',button('Upload document','pm-upload'))+
        '<div class="pm-panel"><div class="pm-searchbar">'+field('Search documents','search','search','placeholder="Document name, keyword or content"')+select('Matter','matter',['All matters'])+select('Client','client',['All clients'])+select('Category','category',['All categories','Court documents','Financial documents','Correspondence','Agreements','Client documents','Forms'])+field('Uploaded date','uploadedDate','date')+'<button type="button" class="pm-link" data-clear-filters>Clear filters</button></div>'+
        table(['Document name','Category','Matter','Uploaded by','Date uploaded','Actions'],'No documents have been uploaded yet.')+'</div><aside class="pm-detail-card"><h3>Document details</h3><p>Select a document to see its matter, client, uploader and file information.</p><div class="pm-actions"><button disabled>Download</button><button disabled>Share</button><button disabled>Rename</button><button disabled>Move</button><button disabled>Delete</button></div></aside>'+
        dialog('pm-upload','Upload document',field('Document name','title','text','required maxlength="180"')+field('Choose file','file','file','required accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"')+select('Category','category',['Court documents','Financial documents','Correspondence','Agreements','Client documents','Forms','Other'])+field('Matter reference','matter','text','maxlength="80"')+field('Client name','client','text','maxlength="120"')+area('Description','description',3),'Upload document'),
      },
    'work-time': {
      html: header('Practice operations','Time & Expenses','Track billable work and disbursements by date, matter and staff.',button('Add time entry','pm-time')+button('Add expense','pm-expense',false))+
       '<div class="pm-kpis"><article><span>Unbilled time</span><strong>— hrs</strong><small>No time records connected</small></article><article><span>Billable hours</span><strong>— hrs</strong><small>Current period</small></article><article><span>Expenses pending</span><strong>AUD —</strong><small>No expense records connected</small></article><article><span>This month</span><strong>AUD —</strong><small>Time and expenses</small></article></div>'+
       '<div class="pm-content-grid"><div class="pm-panel">'+toolbar(field('Date range','dateRange','month')+select('Matter','matter',['All matters'])+select('Staff','staff',['All staff']))+
       table(['Date','Staff','Matter','Description','Hours / amount','Billable','Status'],'No time entries yet. Add time or expenses after secure storage is connected.')+'</div><aside class="pm-panel"><h3>Period summary</h3><dl class="pm-dl"><div><dt>Billable time</dt><dd>— hrs</dd></div><div><dt>Unbilled time</dt><dd>— hrs</dd></div><div><dt>Expenses</dt><dd>AUD —</dd></div><div><dt>Total</dt><dd>AUD —</dd></div></dl><h3>Recent activity</h3><p>No activity available.</p></aside></div>'+
       dialog('pm-time','Add time entry',field('Date','date','date','required')+select('Staff member','staff',['Select staff'])+field('Matter reference','matter','text','required maxlength="80"')+field('Client','client','text','maxlength="120"')+field('Duration (hours)','hours','number','required min="0.1" step="0.1"')+field('Hourly rate (AUD)','rate','number','min="0" step="0.01"')+select('Billable','billable',['Yes','No'])+select('Status','status',['Unbilled','Billed','Written off'])+area('Work description','description',4,'required maxlength="2000"'),'Save time entry')+
       dialog('pm-expense','Add expense',field('Date','date','date','required')+field('Expense type','type','text','required maxlength="100"')+field('Matter reference','matter','text','required maxlength="80"')+field('Client','client','text','maxlength="120"')+field('Amount (AUD)','amount','number','required min="0.01" step="0.01"')+select('GST','gst',['GST included','GST excluded','GST free'])+field('Receipt','receipt','file','accept=".pdf,.jpg,.jpeg,.png"')+area('Description','description',3,'required maxlength="1000"'),'Save expense')
      },
    'work-billing': {
      html: header('Accounts','Invoices','Create and review invoices with line items, GST and payment status.',button('Create invoice','pm-invoice'))+
       '<div class="pm-kpis"><article><span>Draft</span><strong>0</strong><small>AUD 0.00</small></article><article><span>Sent</span><strong>0</strong><small>AUD 0.00</small></article><article class="pm-warn"><span>Overdue</span><strong>0</strong><small>AUD 0.00</small></article><article class="pm-good"><span>Paid</span><strong>0</strong><small>AUD 0.00</small></article></div>'+
       '<div class="pm-panel">'+toolbar(field('Search invoices','search','search','placeholder="Invoice number or client"')+select('Client','client',['All clients'])+select('Status','status',['All statuses','Draft','Sent','Overdue','Paid'])+select('Date range','range',['All dates','This month','Last month','Custom']))+
       table(['Invoice no.','Client','Matter','Issue date','Due date','Amount (AUD)','Status','Actions'],'No invoices have been saved yet.')+'</div>'+
       dialog('pm-invoice','Create invoice',field('Invoice number','number','text','required maxlength="40"')+field('Client name','client','text','required maxlength="120"')+field('Client email','email','email','required maxlength="254"')+field('Matter reference','matter','text','required maxlength="80"')+field('Issue date','issueDate','date','required')+field('Due date','dueDate','date','required')+field('Currency','currency','text','value="AUD" readonly')+select('Status','status',['Draft','Ready for review'])+'<div class="pm-span-2 pm-line-items"><strong>Line items</strong><div class="pm-line-row">'+field('Description','lineDescription','text','required maxlength="160"')+field('Quantity / hours','quantity','number','required min="0.1" step="0.1"')+field('Rate (AUD)','rate','number','required min="0" step="0.01"')+'</div><p>Subtotal, GST and total will be calculated after billing is connected.</p></div>'+area('Notes / payment terms','notes',3,'maxlength="1000"'),'Save invoice draft')
    },
    'work-trust': {
      html: header('Accounts','Trust','Review the trust account ledger, receipts, withdrawals and reconciliation.',button('Record receipt','pm-receipt')+button('Record withdrawal','pm-withdraw',false)+button('Reconcile account','pm-reconcile',false))+
       '<div class="pm-trust-banner"><div><span>TRUST ACCOUNT BALANCE</span><strong>AUD —</strong><small>No connected ledger</small></div><dl><div><dt>Total receipts</dt><dd>AUD —</dd></div><div><dt>Total withdrawals</dt><dd>AUD —</dd></div><div><dt>Net change</dt><dd>AUD —</dd></div></dl></div><div class="pm-panel">'+toolbar(select('Matter','matter',['All matters'])+select('Client','client',['All clients'])+field('Search transactions','search','search','placeholder="Reference, matter or client"'))+table(['Date','Reference','Matter / Client','Transaction type','Receipt','Withdrawal','Balance'],'No trust transactions have been recorded yet. Verify the firm’s trust accounting procedures before relying on these records.')+'<p class="pm-callout">Reconciliation status: unavailable until the firm trust ledger and authorised approval process are configured.</p></div>'+
       dialog('pm-receipt','Record trust receipt',field('Date received','date','date','required')+field('Reference','reference','text','required maxlength="80"')+field('Matter reference','matter','text','required maxlength="80"')+field('Client','client','text','required maxlength="120"')+select('Receipt type','type',['Retainer','Additional funds','Property hold','Other'])+field('Amount (AUD)','amount','number','required min="0.01" step="0.01"')+select('Payment method','method',['Bank transfer','Cheque','Other'])+area('Description','description',3,'required maxlength="1000"'),'Record receipt')+
       dialog('pm-withdraw','Record trust withdrawal',field('Date','date','date','required')+field('Reference','reference','text','required maxlength="80"')+field('Matter reference','matter','text','required maxlength="80"')+field('Payee','payee','text','required maxlength="120"')+select('Withdrawal type','type',['Disbursement','Fees (trust)','Refund','Other'])+field('Amount (AUD)','amount','number','required min="0.01" step="0.01"')+area('Reason / authority','reason',3,'required maxlength="1000"'),'Record withdrawal')+
       dialog('pm-reconcile','Reconcile trust account',field('Statement date','date','date','required')+field('Statement closing balance (AUD)','balance','number','required step="0.01"')+field('Bank statement reference','reference','text','maxlength="120"')+area('Reconciliation notes','notes',3,'maxlength="1200"'),'Start reconciliation')
    },
    'work-contacts': {
      html: header('Directory','Contacts','Manage clients, other parties, barristers, mediators, courts and referrers.',button('Add contact','pm-contact'))+
       '<div class="pm-panel">'+toolbar(field('Search contacts','search','search','placeholder="Name, email, phone or firm"')+select('Contact type','type',['All contact types','Client','Other party','Barrister','Mediator','Court','Referrer','Other'])+select('Linked matter','matter',['All matters'])+select('Status','status',['All statuses','Active','Inactive'])+'<button type="button" class="pm-link" data-clear-filters>Clear filters</button>')+
       '<div class="pm-content-grid"><div>'+table(['Name','Type','Email / phone','Linked matter','Last contact','Status'],'No contacts have been saved yet.')+'</div><aside class="pm-detail-card"><h3>Contact details</h3><div class="pm-tabs" role="tablist"><button type="button" aria-selected="true">Details</button><button type="button">Matters</button><button type="button">Notes</button><button type="button">Communications</button></div><p>Select a contact to see linked matters, notes and communication history.</p></aside></div></div>'+
       dialog('pm-contact','Add contact',field('First name','firstName','text','required maxlength="70"')+field('Last name','lastName','text','required maxlength="70"')+select('Contact type','type',['Client','Other party','Barrister','Mediator','Court','Referrer','Other'])+field('Organisation / firm','firm','text','maxlength="160"')+field('Email','email','email','maxlength="254"')+field('Phone','phone','tel','maxlength="25"')+field('Address','address','text','maxlength="250"')+field('Linked matter reference','matter','text','maxlength="80"')+select('Status','status',['Active','Inactive'])+area('Internal notes','notes',4,'maxlength="2000"'),'Save contact')
    },
    'work-employees': {
      html: header('Staff access','Employees','Firm team directory, access roles and work allocation.',button('Add team member','pm-employee'))+
       '<div class="pm-panel">'+toolbar(field('Search team members','search','search','placeholder="Name or work email"')+select('Role','role',['All roles','Solicitor','Practice manager','Admin','Employee'])+select('Status','status',['All statuses','Active','On leave','Inactive']))+
       '<div class="pm-content-grid"><div>'+table(['Name','Work email','Role','Job title','Status','Assigned matters'],'No team members have been saved yet.')+'</div><aside class="pm-detail-card"><h3>Team member details</h3><p>Select a staff profile to see contact information, assigned work, access and workload.</p><h4>Role-based access</h4><ul><li>Access is controlled by Firebase roles.</li><li>Do not grant access from this preview form.</li></ul></aside></div></div>'+
       dialog('pm-employee','Add team member',field('Full name','name','text','required maxlength="120"')+field('Work email','email','email','required maxlength="254"')+field('Existing Firebase account UID','uid','text','required maxlength="128" placeholder="UID from Firebase Authentication"')+select('Workspace role','role',['Employee'])+field('Job title','jobTitle','text','maxlength="120"')+field('Work phone','phone','tel','maxlength="25"')+select('Status','status',['Active','On leave','Inactive'])+area('Role notes / access scope','notes',3,'maxlength="1000"'),'Add team member')
    },
    'work-reports': {
      html: header('Practice insights','Reports','Review operational activity by date, matter, staff member and status.')+
       '<div class="pm-panel">'+toolbar(select('Report','report',['Matter overview','Task completion','Calendar activity','Time and expenses','Invoice status'])+field('From','from','date')+field('To','to','date')+select('Matter','matter',['All matters'])+select('Staff','staff',['All staff'])+'<button class="pm-button pm-primary" type="button" data-report>Generate report</button><button type="button" class="pm-button" data-export>Export CSV</button>')+
       '<div class="pm-kpis"><article><span>Matters in period</span><strong>—</strong></article><article><span>Tasks completed</span><strong>—</strong></article><article><span>Upcoming deadlines</span><strong>—</strong></article><article><span>Billable hours</span><strong>—</strong></article></div><div class="pm-report-placeholder"><h3>Report preview</h3><p>Choose a report and date range. Financial reports will appear only after the relevant secure modules are connected.</p></div>'+table(['Date','Matter','Activity','Assigned to','Status'],'No report data available for the selected period.')+'</div>'
    },
    'work-settings': {
      html: header('Configuration','Settings','Manage firm profile, calendar defaults, matter types, notifications and access.')+
       '<div class="pm-settings"><nav class="pm-setting-tabs" role="tablist">'+['Firm profile','Calendar & timezone','Matter types','Notifications','Team access'].map((t,i)=>'<button type="button" role="tab" aria-selected="'+(!i)+'" data-setting-tab="'+i+'">'+t+'</button>').join('')+'</nav>'+
       '<section class="pm-panel pm-setting-panel" data-setting-panel="0"><div class="pm-content-grid"><div><h3>Firm profile</h3><p>Core firm details, location and office hours.</p>'+notice+'<div class="pm-form-grid">'+field('Firm name','firmName','text','value="Prevail Family Law" required')+field('Public email','email','email','maxlength="254"')+field('Phone','phone','tel','maxlength="25"')+field('Address','address','text','maxlength="250"')+select('Timezone','timezone',['Australia/Sydney (AEST/AEDT)'])+select('Office opens','opens',['09:00','09:30','10:00'])+select('Office closes','closes',['16:30','17:00','17:30'])+field('Firm logo','logo','file','accept="image/*"')+'</div></div><aside class="pm-detail-card"><h3>Firm logo</h3><img class="pm-logo-preview" src="/prevail-official-logo.png?v=brand-1" alt="Prevail Family Law logo preview"><p data-logo-name>Current firm logo. Choose a file to preview a replacement.</p></aside></div><footer><button class="pm-button pm-primary" type="button" data-not-saved>Save changes</button><span class="pm-status" role="status"></span></footer></section>'+
       '<section class="pm-panel pm-setting-panel" data-setting-panel="1" hidden><h3>Calendar & timezone</h3><p>Calendar defaults used by the firm.</p>'+notice+'<div class="pm-form-grid">'+select('Timezone','timezone',['Australia/Sydney (AEST/AEDT)'])+select('Week starts on','weekStart',['Monday','Sunday'])+select('Default calendar view','view',['Month','Week','Agenda'])+select('Default appointment duration','duration',['30 minutes','45 minutes','60 minutes'])+select('Working days','days',['Monday–Friday','Monday–Saturday'])+'</div><footer><button class="pm-button pm-primary" type="button" data-not-saved>Save changes</button><span class="pm-status" role="status"></span></footer></section>'+
       '<section class="pm-panel pm-setting-panel" data-setting-panel="2" hidden><h3>Matter types</h3><p>Configure the matter categories used in new records.</p>'+notice+field('New matter type','matterType','text','placeholder="e.g. Financial agreement" maxlength="100"')+'<div class="pm-chip-list"><span>Parenting arrangements</span><span>Property settlement</span><span>Separation</span><span>Consent orders</span></div><button class="pm-button pm-primary" type="button" data-not-saved>Save matter types</button><span class="pm-status" role="status"></span></section>'+
       '<section class="pm-panel pm-setting-panel" data-setting-panel="3" hidden><h3>Notifications</h3><p>Choose which workspace events should notify the team.</p>'+notice+'<div class="pm-check-list">'+['New consultation enquiry','Appointment awaiting attorney review','Task due or overdue','New client support message','Document uploaded','Invoice overdue'].map(x=>'<label><input type="checkbox" checked>'+x+'</label>').join('')+'</div><button class="pm-button pm-primary" type="button" data-not-saved>Save notification settings</button><span class="pm-status" role="status"></span></section>'+
       '<section class="pm-panel pm-setting-panel" data-setting-panel="4" hidden><h3>Team access</h3><p>Access is managed through authorised Firebase accounts and roles.</p>'+notice+table(['Staff member','Role','Status','Last active'],'No staff directory connection.')+'<div class="pm-form-grid">'+select('Default employee access','employeeAccess',['No access until assigned','Assigned matters only'])+select('Solicitor permissions','solicitorAccess',['Firm-wide access'])+'</div><button class="pm-button pm-primary" type="button" data-not-saved>Save access settings</button><span class="pm-status" role="status"></span></section></div>'
    }
  };
  for (const [id,config] of Object.entries(modules)) {
    let section=byId(id);
    if (!section && (id==='work-trust'||id==='work-contacts')) {
      section=document.createElement('section'); section.id=id; section.className='admin-module'; section.hidden=true;
      section.setAttribute('aria-labelledby',id+'-heading');
      const nav=document.querySelector('#staff-navigation');
      const link=document.createElement('a'); link.href='#'+id;
      link.innerHTML='<span class="admin-nav-symbol" aria-hidden="true">◈</span><span>'+(id==='work-trust'?'Trust':'Contacts')+'</span>';
      const before=nav.querySelector('a[href="#work-settings"]'); nav.insertBefore(link,before);
      document.querySelector('#workspace-content').append(section);
    }
    if (section) { section.innerHTML=config.html; const h2=section.querySelector('.pm-heading h2'); if(h2) h2.id=id+'-heading'; section.setAttribute('aria-labelledby',id+'-heading'); }
  }

  function coreRecordForms(){
    const clients=byId('work-clients');
    if(clients&&!clients.querySelector('#pm-client-dialog')){
      const h=clients.querySelector('.module-heading');
      if(h)h.insertAdjacentHTML('beforeend','<button type="button" class="pm-button pm-primary" data-open-dialog="pm-client-dialog">Add client</button>');
      clients.insertAdjacentHTML('beforeend',dialog('pm-client-dialog','Add client',field('Client reference','reference','text','required maxlength="40"')+field('First name','firstName','text','required maxlength="70"')+field('Last name','lastName','text','required maxlength="70"')+field('Email','email','email','required maxlength="254"')+field('Phone','phone','tel','maxlength="25"')+field('Preferred contact method','preferredContact','text','maxlength="40"')+field('Linked matter reference','matter','text','maxlength="80"')+select('Intake status','status',['New enquiry','Conflict check pending','Ready for review'])+area('Internal notes','notes',3,'maxlength="1500"'),'Create client record'));
    }
    const matters=byId('work-matters');
    if(matters&&!matters.querySelector('#pm-matter-dialog')){
      const h=matters.querySelector('.admin-section-heading');
      if(h)h.insertAdjacentHTML('beforeend','<button type="button" class="pm-button pm-primary" data-open-dialog="pm-matter-dialog">Create matter</button>');
      matters.insertAdjacentHTML('beforeend',dialog('pm-matter-dialog','Create matter',field('Matter reference','reference','text','required maxlength="80"')+field('Matter name','title','text','required maxlength="160"')+field('Client reference','client','text','required maxlength="80"')+select('Matter type','type',['Parenting arrangements','Property settlement','Separation','Financial agreement','Consent orders','Other family law'])+select('Status','status',['Active','On hold','Closed'])+field('Responsible solicitor','solicitor','text','maxlength="120"')+field('Opened date','opened','date','required')+field('Next important date','nextDate','date')+area('Matter summary','summary',4,'maxlength="3000"'),'Create matter'));
    }
  }
  coreRecordForms();
  const rootWatch=new MutationObserver(()=>{coreRecordForms();});
  const workflowRoot=byId('staff-workspace');
  if(workflowRoot)rootWatch.observe(workflowRoot,{childList:true,subtree:true});
  document.addEventListener('click', event => {
    const open=event.target.closest('[data-open-dialog]');
    if(open){byId(open.dataset.openDialog)?.showModal();return;}
    const close=event.target.closest('[data-close-dialog]');
    if(close){close.closest('dialog')?.close();return;}
    const tab=event.target.closest('[data-setting-tab]');
    if(tab){const wrap=tab.closest('.pm-settings');wrap.querySelectorAll('[data-setting-tab]').forEach(x=>x.setAttribute('aria-selected',String(x===tab)));wrap.querySelectorAll('[data-setting-panel]').forEach(x=>x.hidden=x.dataset.settingPanel!==tab.dataset.settingTab);return;}
    if(event.target.closest('[data-not-saved]')){const panel=event.target.closest('.pm-setting-panel');panel.querySelector('[role="status"]').textContent='Nothing was saved. Secure settings storage is not connected.';return;}
    if(event.target.closest('[data-report]')){event.target.closest('.pm-panel').querySelector('.pm-report-placeholder p').textContent='No live report source is connected yet. Connect the secure matter, task, time and billing records to generate this report.';return;}
    if(event.target.closest('[data-export]')){event.target.closest('.pm-panel').querySelector('.pm-report-placeholder p').textContent='There are no connected report records to export.';return;}
    if(event.target.closest('[data-clear-filters]')){const panel=event.target.closest('.pm-panel');panel.querySelectorAll('input,select').forEach(x=>{if(x.type==='search'||x.type==='text')x.value='';else if(x.type==='date'||x.type==='month')x.value='';else x.selectedIndex=0;});}
  });
  document.addEventListener('change', event => {
    if(event.target.matches('input[name="logo"][type="file"]')){
      const file=event.target.files?.[0];
      if(!file)return;
      if(!file.type.startsWith('image/')){event.target.value='';return;}
      const preview=event.target.closest('.pm-setting-panel')?.querySelector('.pm-logo-preview');
      const label=event.target.closest('.pm-setting-panel')?.querySelector('[data-logo-name]');
      if(preview){if(preview.dataset.objectUrl)URL.revokeObjectURL(preview.dataset.objectUrl);const objectUrl=URL.createObjectURL(file);preview.dataset.objectUrl=objectUrl;preview.src=objectUrl;}
      if(label)label.textContent=file.name+' — preview only; not saved.';
    }
  });
  let practiceContext = null;
  let practiceStop = null;
  let practiceSettingsStop = null;
  let practiceRecords = [];
  const firebaseModuleUrl = 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';
  const storageModuleUrl = 'https://www.gstatic.com/firebasejs/12.5.0/firebase-storage.js';
  const recordTypeByForm = {
    'pm-upload':'document', 'pm-time':'timeEntry', 'pm-expense':'expense',
    'pm-invoice':'invoice', 'pm-receipt':'trustTransaction',
    'pm-withdraw':'trustTransaction', 'pm-reconcile':'trustTransaction',
    'pm-contact':'contact', 'pm-employee':'employee',
    'pm-client-dialog':'client', 'pm-matter-dialog':'matter'
  };
  const sydneyDate = value => {
    if (!value) return '—';
    const d = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(d.valueOf()) ? String(value) :
      new Intl.DateTimeFormat('en-AU',{day:'2-digit',month:'short',year:'numeric',timeZone:'Australia/Sydney'}).format(d);
  };
  function recordPayload(form) {
    const payload = {};
    let file = null;
    for (const [key, entry] of new FormData(form).entries()) {
      if (entry instanceof File) { if (entry.size) file = entry; continue; }
      const value = String(entry).trim();
      if (!value) continue;
      const control = form.elements.namedItem(key);
      payload[key] = control && control.type === 'number' ? Number(value) : value;
    }
    if (form.id === 'pm-receipt') payload.transactionType = 'Receipt';
    if (form.id === 'pm-withdraw') payload.transactionType = 'Withdrawal';
    if (form.id === 'pm-reconcile') payload.transactionType = 'Reconciliation';
    if (form.id === 'pm-expense' && payload.amount) payload.amount = Number(payload.amount);
    return {payload,file};
  }
  function setStatus(form, text, error=false) {
    const status=form.querySelector('[role="status"]');
    if(status){status.textContent=text;status.dataset.state=error?'error':'success';}
  }
  function recordRows(type) {
    return practiceRecords.filter(r=>r.recordType===type)
      .sort((a,b)=>(b.updatedAt?.toMillis?.()||0)-(a.updatedAt?.toMillis?.()||0));
  }
  function renderRecords() {
    const tableTargets = [
      ['work-documents','document', r=>[r.payload.title||r.payload.fileName||'Document',r.payload.category||'—',r.payload.matter||'—',r.payload.uploadedBy||practiceContext?.user?.displayName||'Staff',sydneyDate(r.createdAt),'Saved']],
      ['work-time','timeEntry', r=>[r.payload.date||'—',r.payload.staff||practiceContext?.user?.displayName||'Staff',r.payload.matter||'—',r.payload.description||'—',(r.payload.hours||0)+' hrs',r.payload.billable||'—',r.payload.status||'Unbilled']],
      ['work-time','expense', r=>[r.payload.date||'—',r.payload.staff||practiceContext?.user?.displayName||'Staff',r.payload.matter||'—',r.payload.description||r.payload.type||'Expense','AUD '+Number(r.payload.amount||0).toFixed(2),'—','Saved']],
      ['work-billing','invoice', r=>[r.payload.number||'—',r.payload.client||'—',r.payload.matter||'—',r.payload.issueDate||'—',r.payload.dueDate||'—','AUD '+Number((Number(r.payload.quantity)||0)*(Number(r.payload.rate)||0)).toFixed(2),r.payload.status||'Draft','Saved']],
      ['work-trust','trustTransaction', r=>[r.payload.date||'—',r.payload.reference||'—',[r.payload.matter,r.payload.client||r.payload.payee].filter(Boolean).join(' / ')||'—',r.payload.transactionType||'—',r.payload.transactionType==='Receipt'?'AUD '+Number(r.payload.amount||0).toFixed(2):'—',r.payload.transactionType==='Withdrawal'?'AUD '+Number(r.payload.amount||0).toFixed(2):'—',r.payload.transactionType==='Reconciliation'?'Reconciliation saved':'—']],
      ['work-contacts','contact', r=>[[r.payload.firstName,r.payload.lastName].filter(Boolean).join(' '),r.payload.type||'—',[r.payload.email,r.payload.phone].filter(Boolean).join(' · ')||'—',r.payload.matter||'—',sydneyDate(r.createdAt),r.payload.status||'Active']],
      ['work-employees','employee', r=>[r.payload.name||'Team member',r.payload.email||'—',r.payload.role||'Employee',r.payload.jobTitle||'—',r.payload.status||'Active',r.payload.matter||'—']]
    ];
    for(const [moduleId,type,cells] of tableTargets){
      const module=byId(moduleId); if(!module)continue;
      let body=module.querySelector('.pm-table tbody'); if(!body)continue;
      const rows=recordRows(type);
      if(!rows.length)continue;
      body.innerHTML=rows.map(record=>'<tr>'+cells(record).map(cell=>'<td>'+safeText(cell)+'</td>').join('')+'</tr>').join('');
    }
  }
  async function connectPractice(context) {
    practiceStop?.(); practiceStop=null; practiceSettingsStop?.(); practiceSettingsStop=null; practiceRecords=[]; practiceContext=context;
    if(!context||context.sampleMode||!context.db||!context.user||!context.firmUid){
      document.querySelectorAll('.pm-dialog [data-preview-form]').forEach(form=>setStatus(form,'Sign in to the live workspace to save records.',true));
      return;
    }
    try {
      const fs=await import(firebaseModuleUrl);
      const q=fs.query(fs.collection(context.db,'firmRecords'),fs.where('firmUid','==',context.firmUid),fs.limit(250));
      practiceStop=fs.onSnapshot(q,snapshot=>{
        practiceRecords=snapshot.docs.map(d=>({id:d.id,...d.data()}));
        renderRecords();
      },error=>{
        document.querySelectorAll('.pm-dialog [data-preview-form]').forEach(form=>setStatus(form,error.code==='permission-denied'?'Firebase denied access. Check that the latest Firestore rules are deployed.':'Could not load saved firm records.',true));
      });
      const settingsRef=fs.doc(context.db,'firmSettings',context.firmUid);
      practiceSettingsStop=fs.onSnapshot(settingsRef,snapshot=>{
        if(!snapshot.exists())return;
        const payload=snapshot.data().payload||{};
        const panel=document.querySelector('.pm-setting-panel[data-setting-panel="'+(payload.section||'0')+'"]');
        if(!panel)return;
        for(const [name,value] of Object.entries(payload.values||{})){
          const field=panel.elements?.namedItem(name)||panel.querySelector('[name="'+CSS.escape(name)+'"]');
          if(field&&field.type!=='file'&&field.type!=='checkbox')field.value=value;
          else if(field?.type==='checkbox')field.checked=Boolean(value);
        }
      });
    } catch {
      document.querySelectorAll('.pm-dialog [data-preview-form]').forEach(form=>setStatus(form,'Firebase connection failed. Nothing has been saved.',true));
    }
  }
  window.addEventListener('practice-firebase-ready',event=>{connectPractice(event.detail);});
  window.addEventListener('practice-firebase-clear',()=>{practiceStop?.();practiceStop=null;practiceSettingsStop?.();practiceSettingsStop=null;practiceContext=null;practiceRecords=[];});
  async function savePracticeForm(form) {
    const context=practiceContext;
    if(!context||context.sampleMode){setStatus(form,'Sign in to the live workspace before saving.',true);return;}
    const type=recordTypeByForm[form.closest('dialog')?.id||form.id];
    if(!type){setStatus(form,'This form is not connected to a Firebase record type.',true);return;}
    const {payload,file}=recordPayload(form);
    if(type==='employee'){
      const uid=String(payload.uid||'').trim();
      if(!uid||uid.length>128||uid.includes('/')){setStatus(form,'Enter the existing Firebase Authentication UID for this employee.',true);return;}
      if(payload.role&&payload.role!=='Employee'){setStatus(form,'Only Employee access can be granted from this form. Use authorised account management for solicitor or admin access.',true);return;}
      payload.role='Employee';
    }
    if(file&&file.size>25*1024*1024){setStatus(form,'Files must be smaller than 25 MB.',true);return;}
    const submitButton=form.querySelector('[type="submit"]');
    if(submitButton)submitButton.disabled=true;
    setStatus(form,'Saving securely to Firebase…');
    let uploadedPath='';
    try{
      const fs=await import(firebaseModuleUrl);
      const storage=await import(storageModuleUrl);
      const recordRef=fs.doc(fs.collection(context.db,'firmRecords'));
      const now={createdBy:context.user.uid,updatedBy:context.user.uid,createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp()};
      if(file){
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-150)||'upload';
        uploadedPath='firmFiles/'+context.firmUid+'/'+recordRef.id+'/'+safeName;
        await storage.uploadBytes(storage.ref(context.storage,uploadedPath),file,{contentType:file.type});
        payload.fileName=file.name;payload.storagePath=uploadedPath;payload.contentType=file.type;payload.fileSize=file.size;
      }
      if(type==='trustTransaction')payload.recordKind=payload.transactionType||'Receipt';
      const record={firmUid:context.firmUid,recordType:type,payload, ...now};
      if(type==='employee'){
        const batch=fs.writeBatch(context.db);
        batch.set(fs.doc(context.db,'users',String(payload.uid)),{role:'employee',lawyerUid:context.firmUid});
        batch.set(recordRef,record);
        await batch.commit();
      }else await fs.setDoc(recordRef,record);
      setStatus(form,'Saved to the firm Firebase workspace.');
      form.reset();
      const dialog=form.closest('dialog');
      if(dialog?.open)setTimeout(()=>dialog.close(),450);
    }catch(error){
      if(uploadedPath){try{const storage=await import(storageModuleUrl);await storage.deleteObject(storage.ref(context.storage,uploadedPath));}catch{}}
      const message=error?.code==='permission-denied'
        ? 'Firebase denied this save. Deploy the latest Firestore and Storage rules, and check the account role.'
        : type==='employee'
          ? 'Could not grant employee access. Check that the UID is an existing Firebase account without a conflicting role.'
          : 'Could not save this record. Check the connection and try again.';
      setStatus(form,message,true);
    }finally{if(submitButton)submitButton.disabled=false;}
  }
  async function saveSettings(panel){
    const context=practiceContext;const status=panel.querySelector('[role="status"]');
    if(!context||context.sampleMode){if(status)status.textContent='Sign in to the live workspace before saving settings.';return;}
    const values={};
    panel.querySelectorAll('input,select,textarea').forEach(field=>{
      if(field.type==='file'||!field.name)return;
      values[field.name]=field.type==='checkbox'?field.checked:field.value;
    });
    let uploadedPath='';
    const logo=panel.querySelector('input[name="logo"][type="file"]')?.files?.[0];
    try{
      const fs=await import(firebaseModuleUrl);
      if(logo){
        if(!['image/png','image/jpeg'].includes(logo.type)||logo.size>25*1024*1024)throw new Error('Choose a PNG or JPEG logo under 25 MB.');
        const storage=await import(storageModuleUrl);
        uploadedPath='firmFiles/'+context.firmUid+'/settings/firm-logo';
        await storage.uploadBytes(storage.ref(context.storage,uploadedPath),logo,{contentType:logo.type});
        values.logoPath=uploadedPath;
      }
      await fs.setDoc(fs.doc(context.db,'firmSettings',context.firmUid),{
        firmUid:context.firmUid,payload:{section:panel.dataset.settingPanel,values},
        updatedBy:context.user.uid,updatedAt:fs.serverTimestamp()
      });
      if(status)status.textContent='Settings saved to Firebase.';
      const label=panel.querySelector('[data-logo-name]');if(label&&logo)label.textContent=logo.name+' — saved securely.';
    }catch(error){
      if(uploadedPath){try{const storage=await import(storageModuleUrl);await storage.deleteObject(storage.ref(context.storage,uploadedPath));}catch{}}
      if(status)status.textContent=error?.code==='permission-denied'?'Firebase denied this settings change. Check that the latest rules are deployed and your account is an active admin or solicitor.':error.message||'Settings could not be saved.';
    }
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-not-saved]');if(button){event.preventDefault();saveSettings(button.closest('.pm-setting-panel'));return;}
  });
  document.addEventListener('submit', async event => {
    const form=event.target.closest('[data-preview-form]');
    if(!form)return;
    event.preventDefault();
    await savePracticeForm(form);
  });
  document.querySelectorAll('.pm-dialog').forEach(d => d.addEventListener('click', e=>{if(e.target===d)d.close();}));
})();