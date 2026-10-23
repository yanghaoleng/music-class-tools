/* A small contact panel anchored above the footer entry. */
(()=>{
 const entry=document.querySelector('.feedback-entry'),trigger=document.querySelector('#feedback-trigger'),panel=document.querySelector('#feedback-panel');if(!entry||!trigger||!panel)return;
 let timer=null,pinned=false;
 function place(){if(panel.hidden)return;const anchor=trigger.getBoundingClientRect(),box=panel.getBoundingClientRect();panel.style.left=Math.max(16,Math.min(anchor.left+anchor.width/2-box.width/2,innerWidth-box.width-16))+'px';panel.style.top=Math.max(16,anchor.top-box.height-10)+'px'}
 function show(){clearTimeout(timer);panel.hidden=false;trigger.setAttribute('aria-expanded','true');place()}
 function hide(){clearTimeout(timer);pinned=false;panel.hidden=true;trigger.setAttribute('aria-expanded','false')}
 function later(){if(pinned)return;clearTimeout(timer);timer=setTimeout(hide,160)}
 entry.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')show()});entry.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse')later()});
 panel.addEventListener('pointerenter',()=>clearTimeout(timer));panel.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse')later()});
 trigger.addEventListener('click',()=>{pinned=true;show()});entry.addEventListener('focusin',show);entry.addEventListener('focusout',event=>{if(!entry.contains(event.relatedTarget))hide()});
 document.addEventListener('pointerdown',event=>{if(!entry.contains(event.target))hide()});
 entry.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();trigger.focus();hide()}});
 window.addEventListener('resize',place);document.addEventListener('scroll',place,true);
 document.querySelector('#feedback-wechat').addEventListener('click',async()=>{
  const value='yanghaoleng',field=document.createElement('textarea'),focused=document.querySelector('#feedback-wechat');field.value=value;field.readOnly=true;field.tabIndex=-1;field.style.cssText='position:fixed;opacity:0;pointer-events:none';panel.append(field);field.select();field.setSelectionRange(0,value.length);
  let copied=false;try{copied=document.execCommand('copy')}catch{}finally{field.remove();focused?.focus({preventScroll:true})}
  try{if(!copied)await navigator.clipboard.writeText(value);pinned=true;show();window.RefineToast?.success('复制成功')}catch{window.RefineToast?.error('复制失败，请再试一次')}
 });
})();
