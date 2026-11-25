(() => {
  const byId = id => document.getElementById(id);
  const safeText = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const emptyRows = (cols, text) => '<tr><td colspan="'+cols+'" class="pm-empty">'+text+'</td></tr>';
  const table = (heads, empty) => '<div class="pm-table-wrap"><table class="pm-table"><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+emptyRows(heads.length,empty)+'</tbody></table></div>';
  const notice = '<div class="pm-connection-note"><span class="pm-lock" aria-hidden="true">✓</span><span><strong>Secure firm workspace</strong><br>A confirmation appears after Firebase successfully saves this record.</span></div>';
  const header = (eyebrow,title,description,action='') => '<header class="pm-heading"><div><p class="module-eyebrow">'+eyebrow+'</p><p>'+description+'</p></div>'+action+'</header>';
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
      html: header('Directory','Clients &amp; Contacts','Manage clients, other parties, barristers, mediators, courts and referrers.',button('Add contact','pm-contact'))+
       '<div class="pm-panel">'+toolbar(field('Search contacts','search','search','placeholder="Name, email, phone or firm"')+select('Contact type','type',['All contact types','Client','Other party','Barrister','Mediator','Court','Referrer','Other'])+select('Linked matter','matter',['All matters'])+select('Status','status',['All statuses','Active','Inactive'])+'<button type="button" class="pm-link" data-clear-filters>Clear filters</button>')+
       '<div class="pm-content-grid"><div>'+table(['Name','Type','Email / phone','Linked matter','Last contact','Status'],'No contacts have been saved yet.')+'</div><aside class="pm-detail-card"><h3>Contact details</h3><div class="pm-tabs" role="tablist"><button type="button" aria-selected="true">Details</button><button type="button">Matters</button><button type="button">Notes</button><button type="button">Communications</button></div><p>Select a contact to see linked matters, notes and communication history.</p></aside></div></div>'+
       dialog('pm-contact','Add contact',field('First name','firstName','text','required maxlength="70"')+field('Last name','lastName','text','required maxlength="70"')+select('Contact type','type',['Client','Other party','Barrister','Mediator','Court','Referrer','Other'])+field('Organisation / firm','firm','text','maxlength="160"')+field('Email','email','email','maxlength="254"')+field('Phone','phone','tel','maxlength="25"')+field('Address','address','text','maxlength="250"')+field('Linked matter reference','matter','text','maxlength="80"')+select('Status','status',['Active','Inactive'])+area('Internal notes','notes',4,'maxlength="2000"'),'Save contact')
    },
    'work-employees': {
      html: '<div class="pm-employee-actions">'+button('Add team member','pm-employee')+'</div>'+
       '<div class="pm-panel">'+toolbar(field('Search team members','search','search','placeholder="Name or work email"')+select('Role','role',['All roles','Solicitor','Practice manager','Admin','Employee'])+select('Status','status',['All statuses','Active','On leave','Inactive']))+
       '<div class="pm-content-grid"><div>'+table(['Name','Work email','Role','Job title','Status','Assigned matters'],'No team members have been saved yet.')+'</div><aside class="pm-detail-card"><h3>Team member details</h3><p>Select a staff profile to see contact information, assigned work, access and workload.</p><h4>Role-based access</h4><ul><li>Access is controlled by Firebase roles.</li><li>Do not grant access from this preview form.</li></ul></aside></div></div>'+
       dialog('pm-employee','Add team member',field('Full name','name','text','required maxlength="120"')+field('Work email','email','email','required maxlength="254"')+field('Firebase Auth UID','uid','text','required maxlength="128" placeholder="Paste UID from Firebase Authentication → Users"')+'<small class="pm-field-hint pm-span-2">Create the employee’s sign-in account in Firebase Authentication first. This form links that existing account; it does not create a login.</small>'+select('Workspace role','role',['Employee'])+field('Job title','jobTitle','text','maxlength="120"')+field('Work phone','phone','tel','maxlength="25"')+select('Status','status',['Active','On leave','Inactive'])+area('Role notes / access scope','notes',3,'maxlength="1000"'),'Add team member')
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
      link.innerHTML=id==='work-trust'?'<span class="admin-nav-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18L12 3 3 9zM5 9v9M9 9v9M15 9v9M19 9v9M3 21h18M2 18h20"/></svg></span><span>Trust</span>':'<span class="admin-nav-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M5.7 16a3.4 3.4 0 0 1 6.6 0M14 10h4M14 14h4"/></svg></span><span>Clients &amp; Contacts</span>';
      const before=nav.querySelector('a[href="#work-settings"]'); nav.insertBefore(link,before);
      document.querySelector('#workspace-content').append(section);
    }
    if (section) { section.innerHTML=config.html; const h2=section.querySelector('.pm-heading h2'); if(h2) { h2.id=id+'-heading'; section.setAttribute('aria-labelledby',h2.id); } else section.setAttribute('aria-labelledby','dashboard-title'); }
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
      matters.insertAdjacentHTML('beforeend',dialog('pm-matter-dialog','Create matter',field('Matter reference','reference','text','required maxlength="80"')+field('Matter name','title','text','required maxlength="160"')+field('Client reference','client','text','required maxlength="80"')+select('Matter type','type',['Parenting arrangements','Property settlement','Separation','Divorce','Financial agreement','Consent orders','Other family law'])+select('Status','status',['Active','On hold','Closed'])+field('Responsible solicitor','solicitor','text','maxlength="120"')+field('Opened date','opened','date','required')+field('Next important date','nextDate','date')+area('Matter summary','summary',4,'maxlength="3000"'),'Create matter'));
    }
  }
  coreRecordForms();
  const rootWatch=new MutationObserver(()=>{coreRecordForms();});
  const workflowRoot=byId('staff-workspace');
  if(workflowRoot)rootWatch.observe(workflowRoot,{childList:true,subtree:true});
  document.addEventListener('input',event=>{
    if(event.target.closest('.pm-searchbar,.pm-toolbar') && event.target.type==='search')renderRecords();
    if(event.target.matches('#matter-search')){matterPage=1;renderMatterDirectory();}
  });
  document.addEventListener('change',event=>{
    if(event.target.closest('.pm-searchbar,.pm-toolbar'))renderRecords();
    if(event.target.matches('#matter-type-filter,#matter-status-filter,#matter-solicitor-filter')){matterPage=1;renderMatterDirectory();}
  });
  document.addEventListener('click',event=>{
    if(event.target.closest('#matter-clear-filters')){
      const section=byId('work-matters');
      section?.querySelectorAll('#matter-search,#matter-type-filter,#matter-status-filter,#matter-solicitor-filter').forEach(field=>field.value='');
      matterPage=1;renderMatterDirectory();return;
    }
    if(event.target.closest('#matter-page-prev')){matterPage=Math.max(1,matterPage-1);renderMatterDirectory();return;}
    if(event.target.closest('#matter-page-next')){matterPage++;renderMatterDirectory();return;}
  });
  document.addEventListener('click', event => {
    const open=event.target.closest('[data-open-dialog]');
    if(open){byId(open.dataset.openDialog)?.showModal();return;}
    const close=event.target.closest('[data-close-dialog]');
    if(close){close.closest('dialog')?.close();return;}
    const tab=event.target.closest('[data-setting-tab]');
    if(tab){const wrap=tab.closest('.pm-settings');wrap.querySelectorAll('[data-setting-tab]').forEach(x=>x.setAttribute('aria-selected',String(x===tab)));wrap.querySelectorAll('[data-setting-panel]').forEach(x=>x.hidden=x.dataset.settingPanel!==tab.dataset.settingTab);return;}
    if(event.target.closest('[data-not-saved]')){const panel=event.target.closest('.pm-setting-panel');panel.querySelector('[role="status"]').textContent='Nothing was saved. Secure settings storage is not connected.';return;}
    if(event.target.closest('[data-report]')){event.target.closest('.pm-panel').querySelector('.pm-report-placeholder p').textContent=practiceContext?.sampleMode?'Sample report refreshed from the fictional workspace records shown below.':'No live report source is connected yet. Connect the secure matter, task, time and billing records to generate this report.';return;}
    if(event.target.closest('[data-export]')){event.target.closest('.pm-panel').querySelector('.pm-report-placeholder p').textContent=practiceContext?.sampleMode?'The table below contains fictional preview records. No live records have been exported.':'There are no connected report records to export.';return;}
    if(event.target.closest('[data-clear-filters]')){const panel=event.target.closest('.pm-panel');panel.querySelectorAll('input,select').forEach(x=>{if(x.type==='search'||x.type==='text')x.value='';else if(x.type==='date'||x.type==='month')x.value='';else x.selectedIndex=0;});renderRecords();}
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
  let matterPage = 1;
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
  function renderMatterDirectory(){const statusIcon=label=>'<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#b08a42">'+(["<path d=\"m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5\"/>","<path d=\"M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 15h8m-4-4v8\"/>","<rect x=\"3\" y=\"7\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M8 7V4h8v3M3 12h18\"/>","<circle cx=\"12\" cy=\"12\" r=\"9\" stroke-dasharray=\"8 3\"/>","<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M10 8v8m4-8v8\"/>","<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m8 12 3 3 5-6\"/>"])[['All Matters','New','Active','In Progress','On Hold','Finalised'].indexOf(label)]+'</svg>';
    const section=byId('work-matters'); if(!section)return; 
    if(!section.dataset.compactMatterTop){const stat=byId('matter-stat-open');const table=section.querySelector('#pm-matter-table');if(stat&&table){section.dataset.compactMatterTop='1';const card=stat.closest('article')||stat.closest('.matter-stat-card')||stat.parentElement.parentElement;const cards=card.parentElement;const heading=section.querySelector('header,.pm-heading,.module-heading');const create=Array.from(section.querySelectorAll('button')).find(b=>/new matter|create matter/i.test(b.textContent));const search=byId('matter-search');if(create&&search){const toolbar=search.closest('.pm-toolbar,.matter-filters,.pm-searchbar')||search.parentElement.parentElement;toolbar.append(create);}if(heading&&!heading.contains(table))heading.style.display='none';if(cards&&!cards.contains(table)&&cards.contains(byId('matter-stat-finalised')))cards.style.display='none';}}

    if(!section.querySelector('.matter-premium-nav')){
      const table=section.querySelector('#pm-matter-table');
      if(table){
        const style=document.createElement('style');style.textContent='#work-matters .matter-premium-nav{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0;padding:10px;background:#f7f3ed;border:1px solid #ded3c4;border-radius:12px}#work-matters .matter-premium-nav button{padding:10px 14px;border:1px solid #ded3c4;border-radius:8px;background:#fffdf9;color:#101f30;cursor:pointer}#work-matters .matter-premium-nav button[aria-pressed=true]{background:#101f30;color:white}#work-matters .matter-premium-grid{display:grid;grid-template-columns:minmax(0,68fr) minmax(240px,32fr);gap:16px;align-items:stretch;min-height:580px}#work-matters .matter-premium-grid.closed{grid-template-columns:minmax(0,1fr)}#work-matters .matter-premium-detail{padding:18px;border:1px solid #ded3c4;border-radius:12px;background:#fffdf9;color:#101f30}#work-matters .matter-premium-detail button{display:block;width:100%;text-align:left;padding:10px;border:1px solid #ded3c4;background:transparent;border-radius:6px;margin:5px 0;cursor:pointer;color:inherit}#work-matters .matter-reference{cursor:pointer;color:#96712e}#work-matters .matter-premium-grid>div{min-width:0;overflow:auto}@media(max-width:900px){#work-matters .matter-premium-grid{grid-template-columns:1fr}}';section.append(style);
        const nav=document.createElement('nav');nav.className='matter-premium-nav';nav.setAttribute('aria-label','Matter status');const filter=byId('matter-status-filter');
        const choices=['All Matters','New','Active','In Progress','On Hold','Finalised'];choices.forEach(label=>{const b=document.createElement('button');b.type='button';b.dataset.matterState=label;b.textContent=label;b.onclick=()=>{if(filter){const value=label==='All Matters'?'':label; if(value&&!Array.from(filter.options).some(o=>o.value===value))filter.add(new Option(value,value));filter.value=value;matterPage=1;renderMatterDirectory();}};nav.append(b);});
        const wrap=table.parentElement;wrap.before(nav);const grid=document.createElement('div');grid.className='matter-premium-grid closed';wrap.before(grid);grid.append(wrap);wrap.style.minHeight='580px';wrap.style.border='1px solid #ded3c4';wrap.style.borderRadius='10px';const detail=document.createElement('aside');detail.className='matter-premium-detail';detail.hidden=true;grid.append(detail);
      }
    }
    const all=recordRows('matter');
    const monthKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit'}).format(new Date());
    const dateKey=value=>{
      if(!value)return '';
      const date=value?.toDate?.() || (value instanceof Date?value:new Date(value));
      return Number.isNaN(date.valueOf())?'':new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    };
    const activeRows=all.filter(r=>!['closed','finalised','finalized'].includes(String(r.payload.status||'').toLowerCase()));
    const newThisMonth=all.filter(r=>(String(r.payload.opened||'').slice(0,7)||dateKey(r.createdAt).slice(0,7))===monthKey).length;
    const finalised=all.filter(r=>['closed','finalised','finalized'].includes(String(r.payload.status||'').toLowerCase())&&dateKey(r.updatedAt).slice(0,7)===monthKey).length;
    const clients=new Set(activeRows.map(r=>String(r.payload.client||'').trim().toLowerCase()).filter(Boolean));
    const set=(id,value)=>{const node=byId(id);if(node)node.textContent=String(value);};
    set('matter-stat-open',activeRows.length);
    set('matter-stat-new',newThisMonth);
    set('matter-stat-clients',clients.size);
    set('matter-stat-finalised',finalised);
    const staffFilter=byId('matter-solicitor-filter');
    if(staffFilter){
      const selected=staffFilter.value;
      const staff=[...new Set(all.map(r=>String(r.payload.solicitor||'').trim()).filter(Boolean))].sort();
      staffFilter.innerHTML='<option value="">All staff</option>'+staff.map(name=>'<option value="'+safeText(name)+'">'+safeText(name)+'</option>').join('');
      staffFilter.value=staff.includes(selected)?selected:'';
    }
    const query=(byId('matter-search')?.value||'').trim().toLowerCase();
    const type=byId('matter-type-filter')?.value||'';
    const status=byId('matter-status-filter')?.value||'';
    const solicitor=staffFilter?.value||'';
    const filtered=all.filter(r=>{
      const p=r.payload||{};
      return (!query||[p.reference,p.title,p.client,p.type,p.solicitor].join(' ').toLowerCase().includes(query))
        &&(!type||p.type===type)&&(!status||p.status===status)&&(!solicitor||p.solicitor===solicitor);
    }).sort((a,b)=>String(b.payload.reference||'').localeCompare(String(a.payload.reference||''),undefined,{numeric:true}));
    const pages=Math.max(1,Math.ceil(filtered.length/5)); matterPage=Math.min(Math.max(1,matterPage),pages);
    const start=(matterPage-1)*5; const shown=filtered.slice(start,start+5);
    const body=section.querySelector('#pm-matter-table tbody');
    if(body)body.innerHTML=shown.length?shown.map(r=>{
      const p=r.payload||{};
      const state=String(p.status||'Active');
      return '<tr><td><strong class="matter-reference">'+safeText(p.reference||'—')+'</strong></td><td>'+safeText(p.title||'—')+'</td><td>'+safeText(p.client||'—')+'</td><td>'+safeText(p.type||'—')+'</td><td><span class="matter-status-pill" data-status="'+safeText(state.toLowerCase().replaceAll(' ','-'))+'">'+safeText(state)+'</span></td><td>'+safeText(p.nextDate?new Intl.DateTimeFormat('en-AU',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(p.nextDate+'T12:00:00Z')):'—')+'</td><td>'+safeText(p.solicitor||'—')+'</td></tr>';
    }).join(''):emptyRows(7,'No matters match these filters yet.');
    const matterNav=section.querySelector('.matter-premium-nav');if(matterNav){const create=Array.from(section.querySelectorAll('button')).find(b=>/new matter|create matter/i.test(b.textContent));if(create){matterNav.append(create);create.style.cssText+=';margin-left:auto;background:#a47b36;color:white;border-color:#a47b36;font-weight:600;white-space:nowrap';}} 
    section.querySelectorAll('[data-matter-state]').forEach(b=>{const label=b.dataset.matterState;const count=label==='All Matters'?all.length:all.filter(r=>String(r.payload.status||'').toLowerCase()===label.toLowerCase()).length;b.innerHTML=statusIcon(label)+'<span>'+label+' ('+count+')</span>';b.style.display='inline-flex';b.style.alignItems='center';b.style.gap='7px';b.setAttribute('aria-pressed',String(label==='All Matters'?!status:label===status));});
    const detail=section.querySelector('.matter-premium-detail'),grid=section.querySelector('.matter-premium-grid');
    if(body&&detail&&grid){Array.from(body.querySelectorAll('tr')).forEach((tr,index)=>{const r=shown[index];if(!r)return;const ref=tr.querySelector('.matter-reference');if(!ref)return;ref.setAttribute('role','button');ref.tabIndex=0;const open=()=>{const p=r.payload;detail.hidden=false;grid.classList.remove('closed');detail.getAnimations?.().forEach(a=>a.cancel());if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)detail.animate([{transform:'translateX(32px)',opacity:0},{transform:'translateX(0)',opacity:1}],{duration:240,easing:'ease-out'});const linked=types=>practiceRecords.filter(x=>types.includes(x.recordType)&&[p.reference,p.title,r.id,[p.reference,p.title].filter(Boolean).join(' — ')].filter(Boolean).some(v=>[x.payload?.matter,x.payload?.matterId,x.payload?.matterReference].includes(v)));const matterIcon=name=>'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;flex-shrink:0">'+({"grid":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M12 3v18M3 12h18\"/>","folder":"<path d=\"M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z\"/>","list":"<path d=\"M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1\"/>","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M16 3v4M8 3v4M3 10h18\"/>","note":"<path d=\"M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5M7 8h8M7 12h5M14 20l1-4 5-5 3 3-5 5-4 1Z\"/>","mail":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m3 7 9 6 9-6\"/>","receipt":"<path d=\"M5 3l3 2 4-2 4 2 3-2v18l-3-2-4 2-4-2-3 2ZM9 9h6M9 13h6\"/>","history":"<path d=\"M3 12a9 9 0 1 1 3 7M3 4v8h8M12 7v5l3 2\"/>","user":"<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/>","flag":"<path d=\"M4 22V3m0 1c5-4 9 4 16 0v12c-7 4-11-4-16 0\"/>","external":"<path d=\"M13 5h6v6M19 5l-9 9M10 5H5v14h14v-5\"/>","chevron":"<path d=\"m9 6 6 6-6 6\"/>"})[name]+'</svg>';const menus=[['grid','Matter Overview',[]],['folder','Documents',['document']],['list','Tasks & Deadlines',['task','deadline']],['calendar','Appointments & Hearings',['appointment','hearing']],['note','Case Notes',['caseNote','note']],['mail','Correspondence',['correspondence','email']],['receipt','Billing & Time Records',['invoice','timeEntry','expense']],['history','Activity History',['activity','audit']]];detail.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ded3c4;padding-bottom:10px"><h3 style="font-family:Georgia,serif;font-size:20px;margin:0">Matter Details</h3><button type="button" data-close-matter aria-label="Close details" style="width:auto;border:0;color:#a47b36;font-size:22px;margin:0;padding:0">×</button></div><div style="display:flex;gap:8px;margin:12px 0"><span style="background:#f8e8c6;padding:5px 9px;border-radius:6px">'+safeText(p.reference||'')+'</span><span class="matter-status-pill" data-status="'+safeText(String(p.status||'').toLowerCase().replaceAll(' ','-'))+'">'+safeText(p.status||'')+'</span></div><h2 style="font-family:Georgia,serif;font-size:23px;margin:0">'+safeText(p.title||'')+'</h2><p style="margin:5px 0 14px">'+safeText(p.type||'')+'</p><div style="display:grid;grid-template-columns:1fr 1fr;border-block:1px solid #ded3c4;padding:10px 0;gap:12px">'+[['user','Client',p.client],['user','Responsible',p.solicitor],['calendar','Next Hearing',p.hearingDate],['flag','Priority',p.priority]].map(([icon,label,value])=>'<div style="display:flex;gap:8px"><span style="color:#a47b36;font-size:20px">'+matterIcon(icon)+'</span><div><small>'+label+'</small><br><strong>'+safeText(value||'Not recorded')+'</strong></div></div>').join('')+'</div><nav style="margin:12px 0">'+menus.map(([icon,label,types],i)=>'<button type="button" data-matter-menu="'+i+'" style="display:flex;align-items:center;gap:10px;border:0;margin:2px 0;padding:9px;background:'+(i===0?'#f5ead6':'transparent')+'"><span style="color:#a47b36;font-size:19px;width:20px">'+matterIcon(icon)+'</span><span style="flex:1">'+label+(types.length?' ('+linked(types).length+')':'')+'</span><span style="color:#a47b36">'+matterIcon('chevron')+'</span></button>').join('')+'</nav><div data-matter-content hidden style="border-top:1px solid #ded3c4;padding:10px 0;overflow-wrap:anywhere"></div><button type="button" data-full-matter style="background:#101f30;color:white;text-align:center;font-weight:600;padding:13px;margin-top:14px"><span style="display:inline-flex;align-items:center;gap:9px"><span style="color:#d6b574">'+matterIcon('external')+'</span>Open Full Matter</span></button>';const content=detail.querySelector('[data-matter-content]');const show=(i)=>{const [,label,types]=menus[i];detail.querySelectorAll('[data-matter-menu]').forEach((btn,j)=>{btn.style.background=i===j?'#f5ead6':'transparent';btn.setAttribute('aria-pressed',String(i===j));});content.hidden=false;const rows=linked(types);content.innerHTML='<h4>'+label+'</h4>'+(i===0?'<p>'+safeText(p.summary||'No summary recorded.')+'</p>':rows.length?rows.map(x=>'<p>'+safeText(x.payload.title||x.payload.description||x.payload.name||x.payload.number||'Linked record')+'</p>').join(''):'<p>No linked records available in this workspace.</p>');};const addForms={1:'pm-upload',6:'pm-time'};const originalShow=show;detail.querySelectorAll('[data-matter-menu]').forEach(btn=>btn.onclick=()=>{const i=Number(btn.dataset.matterMenu);originalShow(i);if(addForms[i]){const add=document.createElement('button');add.type='button';add.textContent=i===1?'＋ Upload document':'＋ Add time entry';add.onclick=()=>{const d=byId(addForms[i]);if(!d)return;const input=d.querySelector('[name="matter"]');if(input){if(input.tagName==='SELECT'&&!Array.from(input.options).some(o=>o.value===p.reference))input.add(new Option(p.reference,p.reference));input.value=p.reference;}const client=d.querySelector('[name="client"]');if(client)client.value=p.client||'';d.showModal();};content.append(add);}});detail.querySelector('[data-full-matter]').onclick=()=>{
const page=document.createElement('section');page.className='matter-full-workspace';const siblings=Array.from(section.children).filter(el=>el.tagName!=='STYLE'&&el.tagName!=='DIALOG');const previous=siblings.map(el=>[el,el.hidden,el.style.display]);previous.forEach(([el])=>el.style.display='none');section.append(page);
page.innerHTML='<style>.matter-full-workspace{color:inherit;padding:18px;min-height:75vh}.mf-top,.mf-hero,.mf-tabs{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.mf-top{justify-content:space-between}.mf-btn{border:1px solid #ded3c4;background:transparent;color:inherit;border-radius:8px;padding:10px 14px;cursor:pointer}.mf-hero{margin:20px 0}.mf-hero h2{font:700 32px Georgia,serif;margin:0}.mf-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin:18px 0}.mf-card{border:1px solid #ded3c4;border-radius:12px;padding:16px;display:grid;gap:8px;background:rgba(176,138,66,.035)}.mf-tabs{border-bottom:1px solid #ded3c4;padding:10px 0}.mf-tabs button[aria-selected=true]{background:#101f30;color:white}.mf-body{padding:20px 0}.mf-record{border:1px solid #ded3c4;border-radius:9px;padding:14px;margin:8px 0;display:flex;gap:12px;align-items:center}.mf-gold{color:#a47b36}.mf-card strong{font-size:16px}</style><div class="mf-top"><button class="mf-btn" data-mf-back>‹ Back to Matters</button><span>'+safeText(p.reference||'')+'</span></div><div class="mf-hero"><span class="mf-gold">'+matterIcon('folder')+'</span><div style="flex:1"><h2>'+safeText(p.title||'Matter')+'</h2><p>'+safeText(p.type||'')+'</p></div><span class="matter-status-pill">'+safeText(p.status||'')+'</span></div><div class="mf-cards">'+[['user','Client',p.client],['user','Responsible solicitor',p.solicitor],['calendar','Next important date',p.nextDate],['calendar','Date opened',p.opened],['flag','Priority',p.priority]].map(([ic,label,v])=>'<article class="mf-card"><span class="mf-gold">'+matterIcon(ic)+'</span><small>'+label+'</small><strong>'+safeText(v||'Not recorded')+'</strong></article>').join('')+'</div><nav class="mf-tabs" aria-label="Matter sections">'+menus.map(([ic,label,types],i)=>'<button class="mf-btn" type="button" data-mf-tab="'+i+'" aria-selected="false">'+label+(types.length?' ('+linked(types).length+')':'')+'</button>').join('')+'</nav><div class="mf-body"></div>';
const body=page.querySelector('.mf-body');const selectTab=i=>{page.querySelectorAll('[data-mf-tab]').forEach((btn,j)=>btn.setAttribute('aria-selected',String(i===j)));const [ic,label,types]=menus[i];const records=linked(types);body.innerHTML=i===0?'<h3>Matter Overview</h3><div class="mf-cards">'+menus.slice(1).map(([icon,name,t],j)=>'<button class="mf-card mf-btn" data-mf-jump="'+(j+1)+'"><span class="mf-gold">'+matterIcon(icon)+'</span><strong style="font-size:24px">'+linked(t).length+'</strong><span>'+name+'</span></button>').join('')+'</div><article class="mf-card"><h3>Matter summary</h3><p>'+safeText(p.summary||'No summary recorded.')+'</p></article>':'<h3>'+label+'</h3>'+(records.length?records.map(x=>'<article class="mf-record"><span class="mf-gold">'+matterIcon(ic)+'</span><div><strong>'+safeText(x.payload.title||x.payload.description||x.payload.name||x.payload.number||'Linked record')+'</strong><p>'+safeText(x.payload.status||x.payload.category||x.payload.date||'')+'</p></div></article>').join(''):'<article class="mf-card">No linked records available.</article>');body.querySelectorAll('[data-mf-jump]').forEach(btn=>btn.onclick=()=>selectTab(Number(btn.dataset.mfJump)));};page.querySelectorAll('[data-mf-tab]').forEach(btn=>btn.onclick=()=>selectTab(Number(btn.dataset.mfTab)));const back=()=>{page.remove();previous.forEach(([el,hidden,display])=>{el.hidden=hidden;el.style.display=display;});window.removeEventListener('hashchange',back);};page.querySelector('[data-mf-back]').onclick=back;window.addEventListener('hashchange',back);selectTab(0);page.scrollIntoView({block:'start'});
};const priorityField=Array.from(detail.querySelectorAll('small')).find(el=>el.textContent==='Priority')?.parentElement; if(priorityField){const select=document.createElement('select');select.setAttribute('aria-label','Priority');select.style.cssText='border:1px solid transparent;border-radius:6px;padding:4px 8px;font-weight:600;cursor:pointer;max-width:100%';const colors={'':['#eee','#555'],Normal:['#e4ebf3','#29445e'],High:['#f9dfd9','#982d25'],Urgent:['#a51e2d','#fff']};for(const v of ['', 'Normal','High','Urgent']){const o=new Option(v||'Not recorded',v);o.style.background=colors[v][0];o.style.color=colors[v][1];select.add(o);}select.value=p.priority||'';const paint=()=>{const c=colors[select.value]||colors[''];select.style.background=c[0];select.style.color=c[1];};paint();priorityField.querySelector('strong')?.replaceWith(select);const msg=document.createElement('small');msg.setAttribute('role','status');priorityField.append(msg);select.onchange=async()=>{const old=p.priority||'',value=select.value;paint();select.disabled=true;try{const ctx=practiceContext;if(!ctx)throw Error('Workspace unavailable');if(!ctx.sampleMode){const fs=await import(firebaseModuleUrl);await fs.updateDoc(fs.doc(ctx.db,'firmRecords',r.id),{'payload.priority':value,updatedBy:ctx.user.uid,updatedAt:fs.serverTimestamp()});}p.priority=value;msg.textContent='Saved';setTimeout(()=>msg.textContent='',1000);}catch(e){select.value=old;paint();msg.textContent='Unable to save';}finally{select.disabled=false;}};}detail.querySelector('[data-close-matter]').onclick=()=>{detail.getAnimations?.().forEach(a=>a.cancel());const finish=()=>{detail.hidden=true;grid.classList.add('closed');ref.focus();};if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!detail.animate){finish();return;}const animation=detail.animate([{transform:'translateX(0)',opacity:1},{transform:'translateX(32px)',opacity:0}],{duration:180,easing:'ease-in'});animation.onfinish=finish;};};tr.style.cursor='pointer';tr.onclick=e=>{if(!e.target.closest('button,input,select,a'))open();};ref.onclick=open;ref.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};});}
    set('matter-page-count',filtered.length?('Showing '+(start+1)+'–'+(start+shown.length)+' of '+filtered.length+' matters'):'Showing 0 matters');
    set('matter-page-current',matterPage);
    const prev=byId('matter-page-prev'),next=byId('matter-page-next');
    if(prev)prev.disabled=matterPage<=1;
    if(next)next.disabled=matterPage>=pages;
  }
  function publishEnquiryStaff(){window.dispatchEvent(new CustomEvent('enquiry-staff-directory',{detail:{sampleMode:!!practiceContext?.sampleMode,staff:practiceRecords.filter(r=>r.recordType==='employee'&&r.payload?.status==='Active'&&(practiceContext?.sampleMode||r.payload.uid)).map(r=>({id:r.payload.uid||r.id,name:r.payload.name,email:r.payload.email}))}}));}
  window.addEventListener('enquiry-staff-request',publishEnquiryStaff);
  function renderRecords() {publishEnquiryStaff();
    const tableTargets = [
      ['work-documents','document', r=>[r.payload.title||r.payload.fileName||'Document',r.payload.category||'—',r.payload.matter||'—',r.payload.uploadedBy||practiceContext?.user?.displayName||'Staff',sydneyDate(r.createdAt),'Saved']],
      ['work-time','timeEntry', r=>[r.payload.date||'—',r.payload.staff||practiceContext?.user?.displayName||'Staff',r.payload.matter||'—',r.payload.description||'—',(r.payload.hours||0)+' hrs',r.payload.billable||'—',r.payload.status||'Unbilled']],
      ['work-time','expense', r=>[r.payload.date||'—',r.payload.staff||practiceContext?.user?.displayName||'Staff',r.payload.matter||'—',r.payload.description||r.payload.type||'Expense','AUD '+Number(r.payload.amount||0).toFixed(2),'—','Saved']],
      ['work-billing','invoice', r=>[r.payload.number||'—',r.payload.client||'—',r.payload.matter||'—',r.payload.issueDate||'—',r.payload.dueDate||'—','AUD '+Number((Number(r.payload.quantity)||0)*(Number(r.payload.rate)||0)).toFixed(2),r.payload.status||'Draft','Saved']],
      ['work-trust','trustTransaction', r=>[r.payload.date||'—',r.payload.reference||'—',[r.payload.matter,r.payload.client||r.payload.payee].filter(Boolean).join(' / ')||'—',r.payload.transactionType||'—',r.payload.transactionType==='Receipt'?'AUD '+Number(r.payload.amount||0).toFixed(2):'—',r.payload.transactionType==='Withdrawal'?'AUD '+Number(r.payload.amount||0).toFixed(2):'—',r.payload.balance!=null?'AUD '+Number(r.payload.balance).toFixed(2):r.payload.transactionType==='Reconciliation'?'Reconciled':'—']],
      ['work-contacts','contact', r=>[[r.payload.firstName,r.payload.lastName].filter(Boolean).join(' '),r.payload.type||'—',[r.payload.email,r.payload.phone].filter(Boolean).join(' · ')||'—',r.payload.matter||'—',sydneyDate(r.createdAt),r.payload.status||'Active']],
      ['work-employees','employee', r=>[r.payload.name||'Team member',r.payload.email||'—',r.payload.role||'Employee',r.payload.jobTitle||'—',r.payload.status||'Active',r.payload.matter||'—']]
    ];
    for(const [moduleId,type,cells] of tableTargets){
      const module=byId(moduleId); if(!module)continue;
      let body=module.querySelector('.pm-table tbody'); if(!body)continue;
      let rows=recordRows(type);
      if(type==='contact') rows=[...rows,...recordRows('client').map(r=>({...r,payload:{...r.payload,type:'Client'}}))];
      const filters=module.querySelector('.pm-searchbar,.pm-toolbar');
      if(filters){
        for(const select of filters.querySelectorAll('select[name="matter"],select[name="client"],select[name="staff"]')){
          const key=select.name, current=select.value, first=select.options[0]?.textContent||'All';
          const values=[...new Set(rows.map(r=>String(r.payload[key]||'')).filter(Boolean))].sort();
          select.replaceChildren(new Option(first,first),...values.map(v=>new Option(v,v))); if(values.includes(current))select.value=current;
        }
        rows=rows.filter(r=>[...filters.querySelectorAll('input,select')].every(f=>{
          const v=f.value.trim().toLowerCase(); if(!v||f.tagName==='SELECT'&&f.selectedIndex===0)return true;
          if(f.type==='search')return Object.values(r.payload).join(' ').toLowerCase().includes(v);
          if(f.name==='uploadedDate')return sydneyDate(r.createdAt)===sydneyDate(new Date(f.value+'T12:00:00Z'));
          if(f.type==='month')return String(r.payload.date||'').startsWith(v);
          return String(r.payload[f.name]||'').toLowerCase()===v;
        }));
      }
      if(!rows.length){if(moduleId==='work-time')continue;body.innerHTML=emptyRows(module.querySelectorAll('.pm-table thead th').length,'No records match the current filters.');continue;}
      body.innerHTML=rows.map(record=>'<tr>'+cells(record).map(cell=>'<td>'+safeText(cell)+'</td>').join('')+'</tr>').join('');
      if(type==='contact'){
        const detail=module.querySelector('.pm-detail-card');
        const trs=[...body.querySelectorAll('tr')];
        let selected=rows.findIndex(r=>r.id&&r.id===module.dataset.selectedContact);
        if(selected<0)selected=0;
        function preview(index,tab='Details'){
          const r=rows[index];if(!r||!detail)return;
          const p=r.payload||{};module.dataset.selectedContact=r.id||'';
          trs.forEach((tr,i)=>{tr.setAttribute('aria-selected',String(i===index));tr.style.background=i===index?'#F5EDDF':'';});
          const name=[p.firstName,p.lastName].filter(Boolean).join(' ')||p.name||'Contact';
          detail.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><h3>'+safeText(name)+'</h3><button type="button" class="pm-link" data-contact-close aria-label="Close contact preview">Close ×</button></div><span class="matter-status-pill">'+safeText(p.type||'Contact')+'</span><div class="pm-tabs" role="tablist">'+['Details','Matters','Notes','Communications'].map(t=>'<button type="button" role="tab" aria-selected="'+(t===tab)+'" data-contact-tab="'+t+'">'+t+'</button>').join('')+'</div><div data-contact-content role="tabpanel"></div>';
          const content=detail.querySelector('[data-contact-content]');
          const fields=tab==='Details'?[['Organisation',p.firm],['Email',p.email],['Phone',p.phone],['Address',p.address],['Status',p.status||'Active'],['Last contact',sydneyDate(r.createdAt)]]:tab==='Matters'?[['Linked matter',p.matter]]:tab==='Notes'?[['Internal notes',p.notes]]:[['Email',p.email],['Phone',p.phone],['History','No communication history is linked in this contact record.']];
          content.innerHTML='<dl class="pm-dl">'+fields.map(([k,v])=>'<div><dt>'+safeText(k)+'</dt><dd style="overflow-wrap:anywhere;white-space:pre-wrap">'+safeText(v||'Not recorded')+'</dd></div>').join('')+'</dl>'+(practiceContext?.sampleMode?'<small>Sample contact — demo only.</small>':'');
          detail.querySelectorAll('[data-contact-tab]').forEach(b=>b.onclick=()=>preview(index,b.dataset.contactTab));
          detail.querySelector('[data-contact-close]').onclick=()=>{detail.innerHTML='<h3>Contact details</h3><p>Select a contact to preview its profile.</p>';trs.forEach(tr=>{tr.style.background='';tr.setAttribute('aria-selected','false')});};
        }
        trs.forEach((tr,i)=>{tr.tabIndex=0;tr.style.cursor='pointer';tr.title='Open contact preview';tr.onclick=()=>preview(i);tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();preview(i);}};});
        preview(selected);
      }

    }
    if(practiceContext?.sampleMode){
      const times=recordRows('timeEntry'), expenses=recordRows('expense'), invoices=recordRows('invoice'), transactions=recordRows('trustTransaction');
      const sum=(rows,fn)=>rows.reduce((total,row)=>total+fn(row.payload||{}),0);
      const timeModule=byId('work-time');
      if(timeModule){
        const timeBody=timeModule.querySelector('.pm-table tbody');
        const combined=[...times.map(r=>({date:r.payload.date,staff:r.payload.staff,matter:r.payload.matter,description:r.payload.description,amount:(Number(r.payload.hours)||0).toFixed(2)+' hrs',billable:r.payload.billable||'—',status:r.payload.status||'Unbilled'})),...expenses.map(r=>({date:r.payload.date,staff:r.payload.staff,matter:r.payload.matter,description:r.payload.description||r.payload.type,amount:'AUD '+Number(r.payload.amount||0).toFixed(2),billable:'—',status:r.payload.status||'Saved'}))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
        if(timeBody)timeBody.innerHTML=combined.map(r=>'<tr>'+[r.date,r.staff,r.matter,r.description,r.amount,r.billable,r.status].map(cell=>'<td>'+safeText(cell||'—')+'</td>').join('')+'</tr>').join('');
        const unbilled=sum(times,p=>String(p.status).toLowerCase()==='unbilled'?Number(p.hours)||0:0);
        const billable=sum(times,p=>String(p.billable).toLowerCase()==='yes'?Number(p.hours)||0:0);
        const timeAmount=sum(times,p=>String(p.billable).toLowerCase()==='yes'?(Number(p.hours)||0)*(Number(p.rate)||0):0);
        const expenseAmount=sum(expenses,p=>Number(p.amount)||0);
        const kpis=timeModule.querySelectorAll('.pm-kpis article');
        [[unbilled.toFixed(2)+' hrs','Sample unbilled entries'],[billable.toFixed(2)+' hrs','Sample billable entries'],['AUD '+expenseAmount.toFixed(2),expenses.length+' sample expenses'],['AUD '+(timeAmount+expenseAmount).toFixed(2),'Time and expenses']].forEach(([value,label],i)=>{if(kpis[i]){kpis[i].querySelector('strong').textContent=value;kpis[i].querySelector('small').textContent=label;}});
        const totals=timeModule.querySelectorAll('.pm-dl dd');
        [billable.toFixed(2)+' hrs',unbilled.toFixed(2)+' hrs','AUD '+expenseAmount.toFixed(2),'AUD '+(timeAmount+expenseAmount).toFixed(2)].forEach((value,i)=>{if(totals[i])totals[i].textContent=value;});
        const recent=timeModule.querySelector('.pm-content-grid aside p');
        if(recent)recent.textContent='Latest: '+(times[0]?.payload.description||expenses[0]?.payload.description||'Sample time entry')+' · demo only';
      }
      const billing=byId('work-billing');
      if(billing){
        const kpis=billing.querySelectorAll('.pm-kpis article');
        ['Draft','Sent','Overdue','Paid'].forEach((state,i)=>{const matches=invoices.filter(r=>r.payload.status===state);if(kpis[i]){kpis[i].querySelector('strong').textContent=String(matches.length);kpis[i].querySelector('small').textContent='AUD '+sum(matches,p=>(Number(p.quantity)||0)*(Number(p.rate)||0)).toFixed(2);}});
      }
      const trust=byId('work-trust');
      if(trust){
        const receipts=sum(transactions,p=>p.transactionType==='Receipt'?Number(p.amount)||0:0);
        const withdrawals=sum(transactions,p=>p.transactionType==='Withdrawal'?Number(p.amount)||0:0);
        const banner=trust.querySelector('.pm-trust-banner');
        if(banner){banner.querySelector('strong').textContent='AUD '+(receipts-withdrawals).toFixed(2);banner.querySelector('small').textContent='Illustrative sample ledger';const values=banner.querySelectorAll('dd');[receipts,withdrawals,receipts-withdrawals].forEach((value,i)=>{if(values[i])values[i].textContent='AUD '+value.toFixed(2);});}
        const callout=trust.querySelector('.pm-callout');if(callout)callout.textContent='Sample reconciliation: balanced to the illustrative statement dated '+(transactions[0]?.payload.date||'today')+'. Example values only; not a live trust ledger.';
      }
      const reports=byId('work-reports');
      if(reports){
        const reportRows=[
          ['25 Nov 2026','PF-100348','Client consultation','J. Nguyen','Completed'],
          ['25 Nov 2026','PF-100347','Review parenting proposal','M. Clarke','In progress'],
          ['26 Nov 2026','PF-100345','File response evidence','L. Wilson','Due soon'],
          ['27 Nov 2026','PF-100346','Disclosure deadline','S. Patel','Upcoming']
        ];
        const body=reports.querySelector('.pm-table tbody');if(body)body.innerHTML=reportRows.map(row=>'<tr>'+row.map(cell=>'<td>'+safeText(cell)+'</td>').join('')+'</tr>').join('');
        const metrics=reports.querySelectorAll('.pm-kpis strong');[5,8,4,billableHours(times)].forEach((value,i)=>{if(metrics[i])metrics[i].textContent=i===3?Number(value).toFixed(2)+' hrs':String(value);});
        const preview=reports.querySelector('.pm-report-placeholder');if(preview){preview.innerHTML='<h3>Workspace record overview</h3><p>Illustrative activity for the last six months. These fictional figures are for preview only.</p><div class="pm-sample-bars" aria-label="Sample open matters by month"><span style="--bar:56%"><b>Jun</b><i>38</i></span><span style="--bar:61%"><b>Jul</b><i>41</i></span><span style="--bar:66%"><b>Aug</b><i>44</i></span><span style="--bar:74%"><b>Sep</b><i>49</i></span><span style="--bar:82%"><b>Oct</b><i>52</i></span><span style="--bar:90%"><b>Nov</b><i>56</i></span></div>';}
      }
      const documentModule=byId('work-documents');
      if(documentModule){const detail=documentModule.querySelector('.pm-detail-card');if(detail)detail.innerHTML='<h3>Document details</h3><strong>Consent Orders Draft.pdf</strong><p>Court documents · PF-100348 — Wilson v Wilson</p><dl class="pm-dl"><div><dt>Client</dt><dd>Emma Wilson</dd></div><div><dt>Uploaded by</dt><dd>E. Parker</dd></div><div><dt>File type</dt><dd>PDF · 1.2 MB</dd></div><div><dt>Pages</dt><dd>8</dd></div></dl><div class="pm-actions"><button disabled>Download</button><button disabled>Share</button><button disabled>Rename</button><button disabled>Move</button><button disabled>Delete</button></div><small>Sample preview only; no file is stored.</small>';}
    }
    const em=byId('work-employees');
    if(em){
      const detail=em.querySelector('.pm-detail-card'),body=em.querySelector('.pm-table tbody');
      if(detail&&body){
        const records=recordRows('employee'),rows=[...body.querySelectorAll('tr')].filter(tr=>tr.cells.length===6);
        function open(tr,tab='Details'){
          const v=[...tr.cells].map(c=>c.textContent.trim()),p=records.find(r=>r.payload.email===v[1]&&r.payload.name===v[0])?.payload||{};
          rows.forEach(row=>{row.style.background=row===tr?'#F5EDDF':'';row.setAttribute('aria-selected',String(row===tr));});
          detail.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>'+safeText(v[0])+'</h3><button type="button" class="pm-link" data-employee-close>Close ×</button></div><span class="matter-status-pill">'+safeText(v[4])+'</span><div class="pm-tabs" role="tablist">'+['Details','Workload','Access','Notes'].map(t=>'<button type="button" role="tab" aria-selected="'+(t===tab)+'" data-employee-tab="'+t+'">'+t+'</button>').join('')+'</div><div role="tabpanel" data-employee-content></div>';
          const fields=tab==='Details'?[['Work email',v[1]],['Phone',p.phone],['Role',v[2]],['Job title',v[3]],['Status',v[4]]]:tab==='Workload'?[['Assigned matters',v[5]],['Active tasks',p.activeTasks],['Hours this month',p.hoursThisMonth]]:tab==='Access'?[['Recorded role',v[2]],['Permissions','Actual access is enforced by Firebase rules; this profile does not grant permissions.']]:[['Internal notes',p.notes]];
          detail.querySelector('[data-employee-content]').innerHTML='<dl class="pm-dl">'+fields.map(([k,val])=>'<div><dt>'+safeText(k)+'</dt><dd style="overflow-wrap:anywhere;white-space:pre-wrap">'+safeText(val==null||val===''?'Not recorded':val)+'</dd></div>').join('')+'</dl>'+(practiceContext?.sampleMode?'<small>Illustrative sample profile — demo only.</small>':'');
          detail.querySelectorAll('[data-employee-tab]').forEach(b=>b.onclick=()=>open(tr,b.dataset.employeeTab));
          detail.querySelector('[data-employee-close]').onclick=()=>{detail.innerHTML='<h3>Team member details</h3><p>Select a team member to preview their profile.</p>';rows.forEach(row=>{row.style.background='';row.setAttribute('aria-selected','false');});};
        }
        detail.innerHTML='<h3>Team member details</h3><p>Select a team member to preview their profile.</p>';
        rows.forEach(tr=>{tr.tabIndex=0;tr.style.cursor='pointer';tr.title='View team member profile';tr.onclick=()=>open(tr);tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(tr);}};});
        if(rows.length)open(rows[0]);
      }
    }
    const tm=byId('work-time');
    if(tm){
      const body=tm.querySelector('.pm-table tbody'),aside=tm.querySelector('.pm-content-grid aside');
      if(body&&aside){
        aside.querySelector('[data-time-preview]')?.remove();
        const records=[...recordRows('timeEntry'),...recordRows('expense')];
        const rows=[...body.querySelectorAll('tr')].filter(tr=>tr.cells.length===7);
        rows.forEach(tr=>{
          tr.tabIndex=0;tr.style.cursor='pointer';tr.title='View transaction details';
          const open=()=>{
            rows.forEach(row=>{row.style.background=row===tr?'#F5EDDF':'';row.setAttribute('aria-selected',String(row===tr));});
            aside.querySelector('[data-time-preview]')?.remove();
            const values=[...tr.cells].map(c=>c.textContent.trim());
            const record=records.find(r=>{const p=r.payload||{};return String(p.date||'')===values[0]&&String(p.matter||'—')===values[2]&&String(p.description||p.type||'Expense')===values[3]&&(!p.staff||p.staff===values[1]);});
            const p=record?.payload||{};
            const panel=document.createElement('section');panel.dataset.timePreview='';panel.style.cssText='border-top:1px solid #DAD8D3;margin-top:18px;padding-top:16px';
            const fields=[['Date',values[0]],['Staff',values[1]],['Matter',values[2]],['Description',values[3]],['Hours / amount',values[4]],['Billable',values[5]],['Status',values[6]]];
            if(p.rate!=null)fields.push(['Hourly rate','AUD '+Number(p.rate).toFixed(2)]);
            if(p.notes)fields.push(['Notes',p.notes]);
            panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>Transaction preview</h3><button type="button" class="pm-link" aria-label="Close transaction preview">Close ×</button></div><dl class="pm-dl">'+fields.map(([k,v])=>'<div><dt>'+safeText(k)+'</dt><dd style="overflow-wrap:anywhere;white-space:pre-wrap">'+safeText(v||'Not recorded')+'</dd></div>').join('')+'</dl>'+(practiceContext?.sampleMode?'<small>Sample transaction — demo only.</small>':'');
            panel.querySelector('button').onclick=()=>{panel.remove();rows.forEach(row=>{row.style.background='';row.setAttribute('aria-selected','false');});};
            aside.append(panel);
          };
          tr.onclick=open;tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
        });
      }
    }
    renderMatterDirectory();
  }
  function billableHours(rows){return rows.reduce((total,row)=>total+(String(row.payload.billable).toLowerCase()==='yes'?(Number(row.payload.hours)||0):0),0);}
  async function connectPractice(context) {
    practiceStop?.(); practiceStop=null; practiceSettingsStop?.(); practiceSettingsStop=null; practiceRecords=[]; practiceContext=context;
    if(!context||context.sampleMode||!context.db||!context.user||!context.firmUid){
      if(context?.sampleMode){
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        const offset=days=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
        const demos=[
          {reference:'PF-100348',title:'Wilson v Wilson',client:'Emma Wilson',type:'Property settlement',status:'Active',solicitor:'J. Nguyen',priority:'High',hearingDate:offset(12),opened:offset(-16),nextDate:offset(12)},
          {reference:'PF-100347',title:'Chen v Li',client:'Daniel Chen',type:'Parenting arrangements',status:'Active',solicitor:'M. Clarke',priority:'Normal',opened:offset(-7),nextDate:offset(8)},
          {reference:'PF-100346',title:'Roberts v Roberts',client:'Samantha Roberts',type:'Separation',status:'Active',solicitor:'S. Patel',priority:'Normal',opened:offset(-30),nextDate:offset(20)},
          {reference:'PF-100345',title:'Hughes v Hughes',client:'Mark Hughes',type:'Property settlement',status:'In Progress',solicitor:'L. Wilson',priority:'High',opened:offset(-5),nextDate:offset(6)},
          {reference:'PF-100344',title:'Patel v Patel',client:'Asha Patel',type:'Parenting arrangements',status:'On Hold',solicitor:'J. Nguyen',priority:'Normal',opened:offset(-45),nextDate:''}
        ];
        const examples=[ 
          ['task',{matter:'PF-100348',title:'Review financial disclosure',status:'Open'},-1],
          ['task',{matter:'PF-100348',title:'Prepare court documents',status:'Open'},-1],
          ['hearing',{matter:'PF-100348',title:'Court hearing — 07 December 2026'},-1],
          ['appointment',{matter:'PF-100348',title:'Client consultation — 01 December 2026'},-1],
          ['caseNote',{matter:'PF-100348',title:'Initial consultation completed'},-1],
          ['correspondence',{matter:'PF-100348',title:'Consultation confirmation'},-1],
          ['activity',{matter:'PF-100348',title:'Matter created'},-1],

          ['document',{title:'Consent Orders Draft.pdf',category:'Court documents',matter:'PF-100348 — Wilson v Wilson',uploadedBy:'E. Parker',client:'Emma Wilson',fileName:'Consent Orders Draft.pdf'},-1],
          ['document',{title:'Financial Disclosure.xlsx',category:'Financial documents',matter:'PF-100348 — Wilson v Wilson',uploadedBy:'E. Parker',client:'Emma Wilson',fileName:'Financial Disclosure.xlsx'},-2],
          ['document',{title:'Parenting Plan Draft.pdf',category:'Client documents',matter:'PF-100347 — Chen v Li',uploadedBy:'M. Clarke',client:'Daniel Chen',fileName:'Parenting Plan Draft.pdf'},-3],
          ['document',{title:'Client Correspondence.docx',category:'Correspondence',matter:'PF-100345 — Hughes v Hughes',uploadedBy:'L. Wilson',client:'Mark Hughes',fileName:'Client Correspondence.docx'},-4],
          ['timeEntry',{staff:'Emma Carter',matter:'PF-100348 — Wilson v Wilson',description:'Review financial disclosure and prepare document index',hours:2.5,rate:420,billable:'Yes',status:'Unbilled'},-1],
          ['timeEntry',{staff:'James Miller',matter:'PF-100347 — Chen v Li',description:'Prepare for mediation conference',hours:1.8,rate:380,billable:'Yes',status:'Billed'},-2],
          ['timeEntry',{staff:'Sophie Monroe',matter:'PF-100346 — Roberts v Roberts',description:'Client conference and attendance note',hours:1.2,rate:350,billable:'Yes',status:'Unbilled'},-3],
          ['expense',{staff:'Emma Carter',matter:'PF-100348 — Wilson v Wilson',description:'Court filing fee',type:'Court filing fee',amount:334,status:'Pending'},-1],
          ['expense',{staff:'James Miller',matter:'PF-100347 — Chen v Li',description:'Process server disbursement',type:'Disbursement',amount:165,status:'Pending'},-4],
          ['invoice',{number:'INV-1032',client:'Emma Wilson',matter:'PF-100348 — Wilson v Wilson',issueDate:offset(-3),dueDate:offset(11),quantity:4,rate:420,status:'Draft'},-3],
          ['invoice',{number:'INV-1031',client:'Daniel Chen',matter:'PF-100347 — Chen v Li',issueDate:offset(-5),dueDate:offset(9),quantity:6,rate:380,status:'Sent'},-5],
          ['invoice',{number:'INV-1030',client:'Samantha Roberts',matter:'PF-100346 — Roberts v Roberts',issueDate:offset(-18),dueDate:offset(-2),quantity:5,rate:360,status:'Overdue'},-18],
          ['invoice',{number:'INV-1029',client:'Mark Hughes',matter:'PF-100345 — Hughes v Hughes',issueDate:offset(-24),dueDate:offset(-10),quantity:3,rate:400,status:'Paid'},-24],
          ['trustTransaction',{date:offset(-3),reference:'TR-001458',matter:'PF-100348',client:'Emma Wilson',transactionType:'Receipt',amount:10000,balance:10000},-3],
          ['trustTransaction',{date:offset(-2),reference:'TR-001457',matter:'PF-100347',client:'Daniel Chen',transactionType:'Withdrawal',amount:2500,balance:7500},-2],
          ['trustTransaction',{date:offset(-1),reference:'TR-001456',matter:'PF-100346',client:'Samantha Roberts',transactionType:'Receipt',amount:15000,balance:22500},-1],
          ['trustTransaction',{date:offset(0),reference:'TR-001455',matter:'PF-100345',client:'Mark Hughes',transactionType:'Withdrawal',amount:1000,balance:21500},0],
          ['contact',{firstName:'Jordan',lastName:'Reeves',type:'Mediator',firm:'Resolution Chambers',email:'j.reeves@example.com',phone:'(02) 5550 1305',matter:'PF-100348 — Wilson v Wilson',status:'Active'},-1],
          ['contact',{firstName:'Casey',lastName:'Turner',type:'Client',email:'casey.turner@example.com',phone:'(02) 5550 1101',matter:'PF-100348 — Wilson v Wilson',status:'Active'},-2],
          ['contact',{firstName:'Morgan',lastName:'Wells',type:'Barrister',firm:'Chambers Law',email:'m.wells@example.com',phone:'(02) 5550 1200',matter:'PF-100346 — Roberts v Roberts',status:'Active'},-3],
          ['contact',{firstName:'Family Court',lastName:'— Central Registry',type:'Court',firm:'Federal Circuit and Family Court',email:'registry@example.com',phone:'(02) 5550 1400',matter:'PF-100347 — Chen v Li',status:'Active'},-4],
          ['employee',{name:'Emily Carter',email:'emily.carter@example.com',role:'Solicitor',jobTitle:'Senior Family Law Solicitor',status:'Active',matter:'28'},-1],
          ['employee',{name:'James Whitfield',email:'james.whitfield@example.com',role:'Solicitor',jobTitle:'Family Law Solicitor',status:'Active',matter:'21'},-2],
          ['employee',{name:'Sophie Monroe',email:'sophie.monroe@example.com',role:'Practice manager',jobTitle:'Practice Manager',status:'Active',matter:'6'},-3],
          ['employee',{name:'Daniel Reeves',email:'daniel.reeves@example.com',role:'Admin',jobTitle:'Operations Administrator',status:'Active',matter:'3'},-4],
          ['employee',{name:'Aisha Rahman',email:'aisha.rahman@example.com',role:'Employee',jobTitle:'Legal Assistant',status:'Active',matter:'12'},-5]
        ];
        const record=(recordType,payload,index,daysAgo)=>{const createdAt=new Date((recordType==='matter'?payload.opened:offset(daysAgo))+'T12:00:00Z');return{id:'sample-'+recordType+'-'+index,firmUid:'sample',recordType,payload,createdAt,updatedAt:{toMillis:()=>createdAt.getTime()}};};
        practiceRecords=[...demos.map((payload,index)=>record('matter',payload,index,Number(payload.opened.slice(-2))-Number(today.slice(-2)))),...examples.map(([type,payload,daysAgo],index)=>record(type,{...payload,...(['timeEntry','expense'].includes(type)?{date:offset(daysAgo)}:{})},index,daysAgo))];
        renderRecords();
      }else document.querySelectorAll('.pm-dialog [data-preview-form]').forEach(form=>setStatus(form,'Sign in to the live workspace to save records.',true));
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
        batch.set(fs.doc(context.db,'users',String(payload.uid)),{role:'employee',lawyerUid:context.firmUid},{merge:true});
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
        ? (type==='employee' ? 'Firestore denied this team member. Publish the updated Firestore rules and verify your active firm role and the employee’s existing Firebase UID.' : 'Firebase denied this save. Publish the latest Firestore and Storage rules, and check your firm role.')
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
