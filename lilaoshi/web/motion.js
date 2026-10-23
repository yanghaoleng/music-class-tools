/* Native Web Animations: 8/8/3, no dependencies, no perpetual loops or scroll listeners. */
(()=>{
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const running=new Set(),seen=new WeakSet(),swaps=new WeakMap(),closing=new WeakMap(),detailsReady=new WeakSet();
  const ease='cubic-bezier(.16,1,.3,1)';
  function play(el,frames,options={}){
    if(!el||preference.matches||!el.animate)return null;
    const a=el.animate(frames,{duration:540,easing:ease,fill:'backwards',...options});
    running.add(a);a.finished.then(()=>running.delete(a),()=>running.delete(a));return a;
  }
  const done=a=>a?a.finished.catch(()=>{}):Promise.resolve();
  function reveal(el,index=0){
    if(!el||seen.has(el)||el.closest('.catalog-popup')||el.closest('[data-design-build]')||el.closest('[hidden]')||el.closest('dialog:not([open])')||el.parentElement?.closest('details:not([open])'))return;
    seen.add(el);
    const base=getComputedStyle(el).transform;
    const rest=base==='none'?'':base;
    const distance=el.matches('.good-card,.bad-card,.case-poster')?60:30;
    play(el,[{opacity:0,transform:`translate3d(0,${distance}px,0) scale(.965) ${rest}`},{opacity:1,transform:`translate3d(0,0,0) scale(1) ${rest}`}],{duration:el.matches('.good-card,.bad-card')?960:680,delay:Math.min(index*65,390)});
  }
  const dynamicSelector=[
    '.course-chapter','.course-footnote','.open-prompt >*','.open-actions','.reference','.open-bottom','.model-feedback >*','.specimen','.exercise-heading >*','.options >.option','.feedback >h3','.feedback >p','.feedback >details','.feedback >.reflection','.feedback >.feedback-actions',
    '.result >*','.note-item','.empty','.coach-answer','.save-status','.metric-value','.insight >*','.chart >*','#questions >tr','#chapters >tr','#daily-table tr','#question-insight',
    '#pin-error','#load-state'
  ].join(',');
  function enter(root){
    if(!root||preference.matches)return;
    if(root.matches?.(dynamicSelector))reveal(root);
    root.querySelectorAll?.(dynamicSelector).forEach((el,i)=>reveal(el,i));
  }
  function swap(el,update){
    if(swaps.has(el))return swaps.get(el);
    if(preference.matches){update();return Promise.resolve()}
    const task=(async()=>{
      el.setAttribute('aria-busy','true');
      const exit=play(el,[{opacity:1,translate:'0 0'},{opacity:0,translate:'0 -18px'}],{duration:170,fill:'forwards',easing:'cubic-bezier(.4,0,1,1)'});
      try{await done(exit);update();}finally{exit?.cancel();el.removeAttribute('aria-busy')}
      enter(el);
    })();
    swaps.set(el,task);task.finally(()=>swaps.delete(el));return task;
  }
  function closeDialog(dialog){
    if(!dialog.open)return Promise.resolve();
    if(closing.has(dialog))return closing.get(dialog);
    if(preference.matches){dialog.close();return Promise.resolve()}
    const task=(async()=>{
      dialog.classList.add('is-leaving');
      const a=play(dialog,[{opacity:1,translate:'0 0',scale:'1'},{opacity:0,translate:'0 28px',scale:dialog.id==='training'?'1':'.96'}],{duration:240,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
      try{await done(a);dialog.close()}finally{a?.cancel();dialog.classList.remove('is-leaving')}
    })();closing.set(dialog,task);task.finally(()=>closing.delete(dialog));return task;
  }
  async function toggleDetails(details,open=!details.open){
    if(details.dataset.motionBusy)return;
    if(preference.matches){details.open=open;return}
    details.dataset.motionBusy='true';
    const content=details.querySelector('.details-body');
    try{
      if(open){details.open=true;await done(play(content,[{opacity:0,translate:'0 -12px'},{opacity:1,translate:'0 0'}],{duration:380}));}
      else{await done(play(content,[{opacity:1,translate:'0 0'},{opacity:0,translate:'0 -8px'}],{duration:180}));details.open=false;}
    }finally{delete details.dataset.motionBusy}
  }
  function prepareDetails(root){
    const items=[...(root.matches?.('details')?[root]:[]),...root.querySelectorAll('details')];
    items.forEach(details=>{
      if(detailsReady.has(details))return;detailsReady.add(details);
      const summary=details.querySelector(':scope >summary');if(!summary)return;
      const content=document.createElement('div');content.className='details-body';
      [...details.children].filter(n=>n!==summary).forEach(n=>content.append(n));details.append(content);
      summary.addEventListener('click',event=>{event.preventDefault();toggleDetails(details)});
    });
  }
  async function switchView(from,to){
    if(!from.hidden)await done(play(from,[{opacity:1,translate:'0 0'},{opacity:0,translate:'0 -18px'}],{duration:190}));
    from.hidden=true;to.hidden=false;
    play(to,[{opacity:0,translate:'0 24px'},{opacity:1,translate:'0 0'}],{duration:520});enter(to);
  }
  const builds=new WeakMap();
  function finishDesignBuild(root){
    for(const animation of builds.get(root)||[]){try{animation.finish()}catch{animation.cancel()}}
    builds.delete(root);
  }
  function assembleDesign(root,heading=null){
    if(!root)return;
    root.setAttribute('data-design-build','');
    heading?.setAttribute('data-design-build','');
    if(preference.matches)return;
    root.setAttribute('data-design-entering','');
    const cards=[...root.children].filter(el=>el.matches('.option,.specimen'));
    const animations=[];
    let cursor=80;
    if(heading){
      const entrance=play(heading,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,delay:cursor});
      if(entrance)animations.push(entrance);
      // The open-question summary is both the first paragraph and .question-task.
      // Schedule each node once so a second delayed animation cannot restart it.
      const paragraphs=new Set([heading.querySelector('h2'),heading.querySelector('p'),heading.querySelector('.question-task')].filter(Boolean));
      for(const element of paragraphs){
        const paragraph=play(element,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,delay:cursor});if(paragraph)animations.push(paragraph);
        let textDuration=240;
        if(window.RefineText){animations.push(...window.RefineText.text(element,{delay:cursor}));textDuration=window.RefineText.duration(element.textContent)}
        cursor+=textDuration+220;
      }
    }
    const partsSelector=[
      '.ops-appbar,.ops-art,.ops-badges>span,.ops-title,.ops-subtitle,.ops-cta,.ops-terms,.ops-under>i,.illustration img,.illustration figcaption,.sample-card .studio','.sample-card .name','.sample-card .position','.sample-card .contact',
      '.specimen-tag','.specimen-title','.specimen-content >p:not(.status-row)',
      '.menu-row >span','.status-row >span','.mini-chart .bar','.chart-key',
      '.app-bar >*','.resource-banner >*','.app-placeholder >i',
      '.path-sample >div','.path-sample >span','.story-frames >figure','.story-beats >li'
    ].join(',');
    // Finish assembling each message before the next design enters.
    for(const card of cards){
      const frames=card.matches('.option')?[{opacity:0},{opacity:1}]:[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}];
      const message=play(card,frames,{duration:260,delay:cursor});
      if(message)animations.push(message);
      const parts=[...card.querySelectorAll(partsSelector)],step=parts.length>8?50:75;
      parts.forEach((part,index)=>{
        const base=getComputedStyle(part).transform,rest=base==='none'?'':base;
        const entry=play(part,[{opacity:0,transform:`translate3d(0,8px,0) ${rest}`},{opacity:1,transform:`translate3d(0,0,0) ${rest}`}],{duration:220,delay:cursor+180+index*step});
        if(entry)animations.push(entry);
      });
      cursor+=Math.max(260,180+Math.max(0,parts.length-1)*step+220)+120;
    }
    builds.set(root,animations);
    const ready=Promise.all(animations.map(done)).then(()=>root.removeAttribute('data-design-entering'));
    // Interaction can always reveal the completed designs immediately.
    root.addEventListener('focusin',()=>finishDesignBuild(root),{once:true});
    return ready;
  }
  function afterAnimations(element){
    if(preference.matches)return Promise.resolve();
    return Promise.all((element?.getAnimations?.()||[]).map(done));
  }
  function scrollConversation(container,discussion,chrome,controls){
    if(!container||!discussion)return;
    const viewport=container.getBoundingClientRect(),conversation=discussion.getBoundingClientRect();
    const visual=window.visualViewport,visibleBottom=visual?visual.offsetTop+visual.height:viewport.bottom;
    const top=Math.max(viewport.top,chrome?.getBoundingClientRect().bottom||viewport.top)+16;
    const bottom=Math.min(viewport.bottom,visibleBottom,controls?.getBoundingClientRect().top||viewport.bottom)-20;
    if(bottom<=top)return;
    // Keep the composer above floating controls; long histories retain their latest turns.
    const shift=Math.max(0,conversation.bottom-bottom);
    const target=Math.max(0,Math.min(container.scrollHeight-container.clientHeight,container.scrollTop+shift));
    if(Math.abs(target-container.scrollTop)>1)container.scrollTo({top:target,behavior:preference.matches?'auto':'smooth'});
  }
  function bookmarkFeedback(symbol,counter){
    play(symbol,[{transform:'scale(1)'},{transform:'scale(1.25)',offset:.38},{transform:'scale(.94)',offset:.72},{transform:'scale(1)'}],{duration:330});

  }
  window.RefineMotion={swap,closeDialog,toggleDetails,switchView,assembleDesign,finishDesignBuild,afterAnimations,scrollConversation,bookmarkFeedback};
  preference.addEventListener('change',()=>{if(preference.matches){for(const a of running){try{a.finish()}catch{a.cancel()}}running.clear()}});
  function boot(){
    const observer=new IntersectionObserver(entries=>{
      entries.filter(e=>e.isIntersecting).forEach((entry,i)=>{reveal(entry.target,i);observer.unobserve(entry.target)});
    },{threshold:.12,rootMargin:'0px 0px -24px 0px'});
    const staticSelector='header .brand,header nav >*,header .nav-start,.hero-copy >*,.hero-art .bad-card,.hero-art .good-card,.art-guide,.art-cross,.art-star,.art-note,.art-index,.principle-strip >*,.section-heading >*,.lesson,.case-head >*,.case-poster,footer >*,.gate >*,.dash-title >*,.scope >*,.metrics >*,.chart-heading >*,.dash-section >h2,.definitions dl >div';
    document.querySelectorAll(staticSelector).forEach(el=>observer.observe(el));
    prepareDetails(document);
    document.querySelectorAll('dialog').forEach(dialog=>{
      dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog)});
    });
    new MutationObserver(records=>{
      const additions=new Set();
      for(const record of records){
        if(record.type==='attributes'&&record.target.open){
          const modal=record.target;
          play(modal,[{opacity:0,translate:modal.id==='training'?'0 40px':'0 28px',scale:modal.id==='training'?'1':'.94'},{opacity:1,translate:'0 0',scale:'1'}],{duration:560});
          modal.querySelectorAll('.training-top >button,.notes-head, #notebook-title, #notebook >p').forEach((el,i)=>{seen.delete(el);reveal(el,i)});
          enter(modal);
        }
        for(const node of record.addedNodes){
          if(node.nodeType===1)additions.add(node);
          else if(node.nodeType===3&&record.target.matches?.('#pin-error,.save-status,.coach-answer,#load-state')){
            const el=record.target;seen.delete(el);reveal(el);
            if(el.id==='pin-error'&&el.textContent.includes('不正确'))play(el,[{translate:'0 0'},{translate:'-7px 0'},{translate:'6px 0'},{translate:'-3px 0'},{translate:'0 0'}],{duration:340});
          }
        }
      }
      for(const root of additions){prepareDetails(root);enter(root)}
    }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
    const press=event=>{
      const target=event.target.closest('button:not(:disabled),a,summary');
      if(!target||target.matches('.option')||target.closest('[aria-busy="true"]'))return;
      // Scale uses an independent transform, preserving the card's composed rotation.
      play(target,[{scale:'1'},{scale:'.955',offset:.35},{scale:'1'}],{duration:330});
    };
    let navigating=false,navigationAnimation=null;
    document.addEventListener('click',async event=>{
      const link=event.target.closest('a[href]');
      if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.hasAttribute('download')||link.target==='_blank')return;
      const next=new URL(link.href,location.href);
      if(next.origin!==location.origin||next.pathname===location.pathname||!/^https?:$/.test(next.protocol))return;
      event.preventDefault();if(navigating)return;navigating=true;
      navigationAnimation=play(document.body,[{opacity:1,translate:'0 0'},{opacity:0,translate:'0 -16px'}],{duration:170,fill:'forwards'});
      await done(navigationAnimation);location.assign(next.href);
    });
    window.addEventListener('pageshow',event=>{if(event.persisted){navigationAnimation?.cancel();navigating=false;play(document.body,[{opacity:0,translate:'0 16px'},{opacity:1,translate:'0 0'}],{duration:440})}});
    document.addEventListener('pointerdown',press);
    document.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')press(event)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
