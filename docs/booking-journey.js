/* Consultation date/time preference UI: no availability claims or bookings.
   Existing preferredTime input and submission workflow remain authoritative. */
(() => {
  const tz='Australia/Sydney';
  const pad=n=>String(n).padStart(2,'0');
  const iso=(y,m,d)=>y+'-'+pad(m)+'-'+pad(d);
  const parts=new Intl.DateTimeFormat('en-AU',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=k=>Number(parts.find(p=>p.type===k)?.value);
  const today=iso(part('year'),part('month'),part('day'));
  const options=['09:00','10:00','11:00','13:00','14:00','15:00','16:00'];
  const monthLabel=(y,m)=>new Intl.DateTimeFormat('en-AU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1)));
  let currentForm=null;
  function setup(form){
    if(form.dataset.premiumCalendar)return;
    const input=form.querySelector('input[name="preferredTime"]');
    if(!input)return;
    form.dataset.premiumCalendar='true';
    const shell=document.createElement('section');shell.className='premium-booking';shell.setAttribute('aria-label','Preferred consultation date and time');
    shell.innerHTML='<div class="premium-booking-head"><span class="premium-booking-head-icon" aria-hidden="true">▦</span><div><strong>Preferred consultation time</strong><small>Choose a preferred date and time · Sydney local time</small></div></div><div class="premium-booking-grid"><div class="premium-calendar"><div class="premium-calendar-header"><button type="button" data-prev aria-label="Previous month">‹</button><strong data-month></strong><button type="button" data-next aria-label="Next month">›</button></div><div class="premium-calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="premium-calendar-days" data-days></div></div><div class="premium-times"><strong>Preferred time</strong><p>These are suggested enquiry times, not confirmed available appointments.</p><div class="premium-time-grid" data-times></div><p class="premium-booking-status" data-status aria-live="polite">Select a date and time to include in your enquiry.</p></div></div><div class="premium-booking-footer"><small>Appointment requests are subject to confirmation by the firm.</small><button type="button" data-continue>Continue to your details →</button></div>';
    const fields=form.querySelector('.consultation-fields');
    if(!fields)return;fields.before(shell);
    let year=part('year'),month=part('month'),selectedDate='',selectedTime='';
    const monthEl=shell.querySelector('[data-month]'),days=shell.querySelector('[data-days]'),times=shell.querySelector('[data-times]'),status=shell.querySelector('[data-status]');
    // Only confirmed bookings supplied by a trusted integration are marked booked.
    const booked=()=>new Set(Array.isArray(window.PREVAIL_CONFIRMED_BOOKED_SLOTS)?window.PREVAIL_CONFIRMED_BOOKED_SLOTS:[]);
    const isBooked=(d,t)=>booked().has(d+'T'+t);
    function sync(){
      if(selectedDate&&selectedTime&&isBooked(selectedDate,selectedTime))selectedTime='';
      input.value=selectedDate&&selectedTime?selectedDate+'T'+selectedTime:'';
      input.dispatchEvent(new Event('change',{bubbles:true}));
      renderTimes();
      status.textContent=selectedDate&&selectedTime?'Requested: '+new Intl.DateTimeFormat('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(selectedDate+'T12:00:00Z'))+' at '+selectedTime+' (Sydney time). Awaiting firm confirmation.':'Select a date and time to include in your enquiry.';
    }
    function renderDays(){
      monthEl.textContent=monthLabel(year,month);days.replaceChildren();
      shell.querySelector('[data-prev]').disabled=year===part('year')&&month===part('month');
      const first=new Date(Date.UTC(year,month-1,1)).getUTCDay();
      const count=new Date(Date.UTC(year,month,0)).getUTCDate();
      for(let i=0;i<first;i++){const blank=document.createElement('span');blank.className='premium-blank';days.append(blank);}
      for(let day=1;day<=count;day++){
        const value=iso(year,month,day),button=document.createElement('button');button.type='button';button.textContent=day;button.disabled=value<today;button.setAttribute('aria-label',value);button.setAttribute('aria-pressed',String(value===selectedDate));
        button.dataset.state=button.disabled?'unavailable':'requestable';
        button.addEventListener('click',()=>{selectedDate=value;selectedTime='';renderDays();sync();});
        days.append(button);
      }
    }
    function renderTimes(){
      times.replaceChildren();
      const fullDate=selectedDate;
      for(const time of options){
        const button=document.createElement('button');
        button.type='button';
        button.textContent=new Intl.DateTimeFormat('en-AU',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'UTC'}).format(new Date('2026-01-01T'+time+':00Z'));
        const occupied=!!fullDate&&isBooked(fullDate,time);
        button.disabled=!fullDate||occupied;
        button.dataset.state=!fullDate?'unavailable':occupied?'booked':'requestable';
        button.setAttribute('aria-label',button.textContent+(occupied?' booked':!fullDate?' select a date first':' open for request'));
        button.setAttribute('aria-pressed',String(!occupied&&selectedTime===time));
        button.title=occupied?'Already booked':!fullDate?'Select a date first':'Request this time; confirmation required';
        button.addEventListener('click',()=>{if(occupied)return;selectedTime=time;sync();});
        times.append(button);
      }
    }
    // A calendar integration can update confirmed bookings and dispatch this event.
    window.addEventListener('prevail:bookings-updated',()=>{
      if(selectedDate&&selectedTime&&isBooked(selectedDate,selectedTime))selectedTime='';
      renderDays();sync();
    });
    function shift(amount){month+=amount;if(month===13){month=1;year++;}if(month===0){month=12;year--;}renderDays();}
    shell.querySelector('[data-prev]').addEventListener('click',()=>shift(-1));
    shell.querySelector('[data-next]').addEventListener('click',()=>shift(1));
    shell.querySelector('[data-continue]').addEventListener('click',()=>{if(!selectedDate||!selectedTime){status.textContent='Choose a preferred date and time first, or use the optional date/time field below.';return;}const first=fields.querySelector('input');first?.focus();});
    input.addEventListener('change',()=>{if(input.value&&input.value!==selectedDate+'T'+selectedTime){selectedDate=input.value.slice(0,10);selectedTime=input.value.slice(11,16);const [y,m]=selectedDate.split('-').map(Number);year=y;month=m;renderDays();renderTimes();}});
    renderDays();renderTimes();
  }
  function init(){const form=document.querySelector('.client-home #consultation-form');if(form&&form!==currentForm){currentForm=form;setup(form);}}
  new MutationObserver(init).observe(document.getElementById('app')||document.body,{childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
