/* Mouse, touch and keyboard share the same native-link course panel. */
(()=>{
 const entry=document.querySelector('.courses-entry'),trigger=document.querySelector('#more-courses'),panel=document.querySelector('#more-courses-panel');if(!entry||!trigger||!panel)return;
 let timer=null,pinned=false;
 function place(){if(panel.hidden)return;const a=trigger.getBoundingClientRect(),b=panel.getBoundingClientRect();panel.style.left=Math.max(16,Math.min(a.left+a.width/2-b.width/2,innerWidth-b.width-16))+'px';panel.style.top=Math.max(16,a.top-b.height-10>=16?a.top-b.height-10:Math.min(a.bottom+10,innerHeight-b.height-16))+'px'}
 function show(){clearTimeout(timer);panel.hidden=false;trigger.setAttribute('aria-expanded','true');place()}
 function hide(){clearTimeout(timer);pinned=false;panel.hidden=true;trigger.setAttribute('aria-expanded','false')}
 function later(){if(pinned||entry.contains(document.activeElement))return;clearTimeout(timer);timer=setTimeout(hide,180)}
 entry.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')show()});entry.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')later()});
 panel.addEventListener('pointerenter',()=>clearTimeout(timer));panel.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')later()});
 trigger.addEventListener('click',()=>{if(pinned)hide();else{pinned=true;show()}});
 entry.addEventListener('focusin',show);entry.addEventListener('focusout',e=>{if(!entry.contains(e.relatedTarget))hide()});
 document.addEventListener('pointerdown',e=>{if(!entry.contains(e.target))hide()});
 entry.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();e.stopPropagation();trigger.focus({preventScroll:true});hide()}});
 window.addEventListener('resize',place);document.addEventListener('scroll',place,true);
})();
