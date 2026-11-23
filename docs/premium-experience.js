/* Public website enhancements. No backend, client records or admin permissions changed. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let progress, topButton;
  function ensureGlobalControls(){
    if (!progress) {
      progress=document.createElement('div');
      progress.className='premium-scroll-progress';
      progress.setAttribute('aria-hidden','true');
      document.body.append(progress);
    }
    // Floating back-to-top control intentionally removed.
  }
  function updateScroll(){
    if(!progress)return;
    const active=!!document.querySelector('.client-home');
    progress.hidden=!active;
    if(active){const total=document.documentElement.scrollHeight-innerHeight;progress.style.transform='scaleX('+(total>0?Math.min(1,scrollY/total):0)+')';}
  }
  function enhanceFaq(root){
    const faq=root.querySelector('#resources.client-faq');
    if(!faq||faq.dataset.premiumReady)return;
    faq.dataset.premiumReady='true';
    const details=[...faq.querySelectorAll('details')];
    if(!details.length)return;
    const tools=document.createElement('div');tools.className='premium-faq-tools';
    const label=document.createElement('label');label.className='premium-faq-search-label';
    label.textContent='Search frequently asked questions';
    const input=document.createElement('input');input.type='search';input.placeholder='Search topics or questions…';input.autocomplete='off';input.setAttribute('aria-label','Search FAQs');
    const count=document.createElement('span');count.className='premium-faq-count';count.setAttribute('aria-live','polite');
    label.append(input);tools.append(label,count);
    faq.querySelector('h2')?.after(tools);
    const empty=document.createElement('p');empty.className='premium-faq-empty';empty.hidden=true;empty.textContent='No matching questions. Try another keyword or send us an enquiry.';
    faq.append(empty);
    function filter(){
      const query=input.value.trim().toLocaleLowerCase('en-AU');let visible=0;
      for(const item of details){const show=item.textContent.toLocaleLowerCase('en-AU').includes(query);item.hidden=!show;if(show)visible++;}
      count.textContent=visible+' question'+(visible===1?'':'s');empty.hidden=visible!==0;
    }
    input.addEventListener('input',filter);filter();
  }
  function enhanceClock(root){
    const contact=root.querySelector('#contact-info');
    if(!contact||contact.querySelector('.premium-sydney-clock'))return;
    const clock=document.createElement('div');clock.className='premium-sydney-clock';
    clock.setAttribute('aria-label','Current Sydney local time');
    const title=document.createElement('span');title.textContent='SYDNEY LOCAL TIME';
    const value=document.createElement('strong');
    clock.append(title,value);contact.prepend(clock);
    function tick(){
      if(!clock.isConnected)return;
      value.textContent=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',weekday:'short',hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'short'}).format(new Date());
    }
    tick();const timer=setInterval(()=>{if(!clock.isConnected){clearInterval(timer);return;}tick();},60000);
  }
  function enhanceQuickNav(root){
    if(root.querySelector('.premium-quick-links'))return;
    const hero=root.querySelector('.hero-grid');if(!hero)return;
    const bar=document.createElement('nav');bar.className='premium-quick-links';bar.setAttribute('aria-label','Quick navigation');
    const items=[['Explore services','#services'],['Frequently asked questions','#resources'],['Client reviews','#reviews'],['Request consultation','#contact']];
    for(const [name,href] of items){const link=document.createElement('a');link.href=href;link.textContent=name;bar.append(link);}
    hero.after(bar);
  }
  function init(){
    const root=document.querySelector('.client-home');
    ensureGlobalControls();
    if(root){enhanceFaq(root);enhanceClock(root);enhanceQuickNav(root);}
    updateScroll();
  }
  let scheduled=false;
  new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;init();});}).observe(document.getElementById('app')||document.body,{childList:true});
  addEventListener('scroll',updateScroll,{passive:true});addEventListener('resize',updateScroll,{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
