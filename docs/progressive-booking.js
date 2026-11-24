/* Progressive consultation inquiry: preferred time -> details -> review.
   Existing Firebase clientInbox submission remains unchanged. Slots are requests,
   NOT confirmed bookings: no server-side reservation service exists yet. */
(() => {
 let mounted=null;
 function init(){
  const form=document.querySelector('.client-home #consultation-form');
  if(!form||form===mounted)return;
  const fields=form.querySelector('.consultation-fields');
  const calendar=form.querySelector('.premium-booking');
  const footer=form.querySelector('.consultation-footer');
  if(!fields||!calendar||!footer)return;
  mounted=form;
  const preferred=fields.querySelector('input[name="preferredTime"]');
  const timeLabel=preferred?.closest('label');
  if(timeLabel)timeLabel.hidden=true;
  const steps=document.createElement('div');steps.className='premium-booking-steps';
  steps.innerHTML='<span data-step="2"><b>01</b><span>Date & time</span></span><span data-step="1"><b>02</b><span>Your details</span></span><span data-step="3"><b>03</b><span>Review & submit</span></span>';
  form.querySelector('h3')?.after(steps);
  const controls=document.createElement('div');controls.className='premium-booking-navigation';
  controls.innerHTML='<button type="button" class="premium-back" hidden>Back</button><button type="button" class="premium-next" disabled>Next</button>';
  footer.before(controls);
  const back=controls.querySelector('.premium-back'),next=controls.querySelector('.premium-next'),submit=footer.querySelector('button[type="submit"]');
  const review=document.createElement('div');review.className='premium-booking-review';review.hidden=true;
  footer.before(review);
  const originalContinue=calendar.querySelector('[data-continue]');
  if(originalContinue)originalContinue.hidden=true;
  let step=2;
  let transitioning=false;
  function updateNextState(){
   const ready=step===2?Boolean(preferred?.value):step===1 && [...fields.querySelectorAll('[required]')].every(field=>field.checkValidity());
   next.disabled=transitioning||!ready;
   next.setAttribute('aria-disabled',String(transitioning||!ready));
   back.disabled=transitioning;
  }
  preferred?.addEventListener('change',updateNextState);
  fields.addEventListener('input',updateNextState);
  fields.addEventListener('change',updateNextState);
  function show(n){
   const changed=n!==step;
   step=n;form.classList.toggle('booking-step-2',n===2);fields.hidden=n!==1;calendar.hidden=n!==2;review.hidden=n!==3;
   updateNextState();
   back.hidden=n===2;next.hidden=n===3;footer.hidden=n!==3;
   next.textContent='Next';
   for(const item of steps.children){
    const id=Number(item.dataset.step),completed=n===1?id===2:n===3&&id!==3;
    item.classList.toggle('active',id===n);item.classList.toggle('completed',completed);item.classList.remove('completing');item.removeAttribute('aria-busy');
    const badge=item.querySelector('b');if(badge){if(!badge.dataset.number)badge.dataset.number=badge.textContent;badge.textContent=completed?'✓':badge.dataset.number;}
   }
   if(changed && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    const panel=n===1?fields:n===2?calendar:review;
    panel.animate?.([{opacity:.86,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'cubic-bezier(.2,.75,.25,1)'});
   }
   if(n===3){
    const data=new FormData(form),v=k=>String(data.get(k)||'').trim();
    const row=(title,value)=>{const p=document.createElement('p'),strong=document.createElement('strong');strong.textContent=title+': ';p.append(strong,document.createTextNode(value||'Not provided'));return p;};
    review.replaceChildren(row('Name',[v('firstName'),v('lastName')].join(' ')),row('Email',v('email')),row('Phone',v('phone')),row('Topic',v('topic')),row('Preferred consultation',v('preferredTime')?v('preferredTime').replace('T',' ')+' Sydney local time':'No time selected'),row('How can we help?',v('message')));
    const info=document.createElement('p');info.className='premium-booking-disclaimer';info.textContent='Submitting sends an inquiry to the firm. Your appointment is not booked until the firm confirms it.';review.append(info);
   }
  }
  const email=fields.querySelector('input[name="email"]');
  const emailDomainSuggestions={
   'gmial.com':'gmail.com',
   'gamil.com':'gmail.com',
   'gmai.com':'gmail.com',
   'hotmial.com':'hotmail.com',
   'outlok.com':'outlook.com',
   'yaho.com':'yahoo.com'
  };
  email.addEventListener('input',()=>email.setCustomValidity(''));
  function validateDetails(){
   email.setCustomValidity('');
   const address=email.value.trim();
   const at=address.lastIndexOf('@');
   const domain=address.slice(at+1).toLowerCase();
   const suggested=Object.hasOwn(emailDomainSuggestions,domain) && emailDomainSuggestions[domain];
   if(at>0 && suggested) email.setCustomValidity('Please check your email address. Did you mean '+address.slice(0,at+1)+suggested+'?');

   const required=[...fields.querySelectorAll('[required]')];
   for(const field of required){if(!field.reportValidity())return false;}
   return true;
  }
  function advance(to){
   if(transitioning)return;
   const current=[...steps.children].find(item=>Number(item.dataset.step)===step);
   if(!current){show(to);return;}
   transitioning=true;updateNextState();
   current.classList.add('completing');current.setAttribute('aria-busy','true');
   const badge=current.querySelector('b');if(badge)badge.textContent='';
   window.setTimeout(()=>{
    current.classList.remove('completing');current.classList.add('completed');current.removeAttribute('aria-busy');
    if(badge)badge.textContent='✓';
    window.setTimeout(()=>{show(to);transitioning=false;updateNextState();},260);
   },520);
  }
  next.addEventListener('click',()=>{
   if(transitioning)return;
   if(step===1){if(!validateDetails())return;advance(3);}
   else if(step===2){if(!preferred.value){const status=calendar.querySelector('[data-status]');if(status)status.textContent='Please select a preferred date and time before continuing.';return;}advance(1);}
  });
  back.addEventListener('click',()=>{if(!transitioning)show(step===3?1:2);});
  form.addEventListener('submit',e=>{if(step!==3){e.preventDefault();e.stopImmediatePropagation();show(2);}},true);
  const result=form.querySelector('#consultation-result');
  if(result){const observer=new MutationObserver(()=>{if(/Inquiry received/i.test(result.textContent||'')){document.querySelector('.booking-workflow-dialog')?.close();show(2);}});observer.observe(result,{childList:true,characterData:true,subtree:true});}
  form.addEventListener('prevail:booking-open',()=>{show(2);});
  show(2);
 }
 new MutationObserver(()=>{if(document.querySelector('.client-home #consultation-form .premium-booking'))init();}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();