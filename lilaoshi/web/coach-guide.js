/* One avatar, carried outside changing content until its next anchor is ready. */
(()=>{
 let frame=0,carrier=null,target=null,flight=0;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const avatar=()=>document.getElementById('coach-avatar');
 const brand=()=>document.querySelector('.brand-coach-slot');
 function stop(){cancelAnimationFrame(frame);frame=0;flight++}
 function clean(){document.querySelectorAll('.coach-avatar-target:empty').forEach(el=>el.remove())}
 function raise(){if(carrier?.showPopover){carrier.hidePopover();carrier.showPopover()}}
 function lift(){
  const node=avatar();if(!node)return null;
  const start=node.getBoundingClientRect();stop();target=null;
  if(!carrier){carrier=document.createElement('div');carrier.className='coach-flight';carrier.setAttribute('popover','manual');document.body.append(carrier);carrier.showPopover?.()}
  // Freeze the rendered position, including any interrupted flight or scroll.
  carrier.style.transform=`translate(${start.left}px,${start.top}px) scale(${start.width/54},${start.height/54})`;
  carrier.append(node);return start;
 }
 function land(anchor){
  const node=avatar();stop();if(!node||!anchor?.isConnected)return;
  anchor.append(node);node.classList.toggle('coach-at-brand',anchor===brand());
  carrier?.remove();carrier=null;target=anchor;clean();
 }
 function move(anchor){
  const node=avatar();if(!node||!anchor?.isConnected||anchor===target)return;
  if(reduced.matches){land(anchor);return}
  const start=lift();target=anchor;node.classList.remove('coach-at-brand');
  const mover=carrier,token=flight,began=performance.now();
  // Sample the existing --motion-ease token while tracking a moving destination.
  const bezier=(t,a,b)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
  const ease=t=>{let lo=0,hi=1;for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(bezier(mid,.16,.3)<t)lo=mid;else hi=mid}return bezier((lo+hi)/2,1,1)};
  function track(now){
   if(token!==flight)return;
   if(!anchor.isConnected){lift();return}
   const t=Math.min(1,(now-began)/500),p=t===1?1:ease(t),end=anchor.getBoundingClientRect();
   const sx=start.left+start.width/2,sy=start.top+start.height/2,dx=end.left+end.width/2-sx,dy=end.top+end.height/2-sy;
   const width=start.width+(end.width-start.width)*p,height=start.height+(end.height-start.height)*p;
   const bend=Math.min(64,Math.hypot(dx,dy)*.12)*4*p*(1-p);
   const x=sx+dx*p-width/2-bend,y=sy+dy*p-height/2;
   mover.style.transform=`translate(${x}px,${y}px) scale(${width/54},${height/54})`;
   if(t<1){frame=requestAnimationFrame(track);return}
   land(anchor);
  }
  frame=requestAnimationFrame(track);
 }
 function home(){move(document.querySelector('.coach-identity'))}
 function latest(){
  const message=[...document.querySelectorAll('#chat-messages>.assistant:not(.typing-message)')].filter(message=>!message.hidden).at(-1);
  if(!message)return;
  let anchor=message.querySelector('.coach-avatar-target');
  if(!anchor){anchor=document.createElement('span');anchor.className='coach-avatar-target';message.prepend(anchor)}
  move(anchor);
 }
 function map(index){
  const entry=document.querySelector(`[data-chapter="${index}"]`),row=entry?.closest('.course-chapter'),action=row?.querySelector('.chapter-action');if(!action)return;
  let anchor=action.querySelector('.chapter-guide-slot');
  if(!anchor){anchor=document.createElement('span');anchor.className='chapter-guide-slot';action.prepend(anchor)}
  const rect=row.getBoundingClientRect(),chrome=document.querySelector('.training-chrome').getBoundingClientRect();
  if(rect.top<chrome.bottom||rect.bottom>innerHeight)row.scrollIntoView({block:'center',behavior:'instant'});
  move(anchor);
 }
 function brandHome(){move(brand())}
 function init(){
  const image=document.querySelector('header .brand-icon'),node=avatar();if(!image||!node)return;
  const slot=document.createElement('span');slot.className='brand-coach-slot';image.before(slot);slot.append(image);
  node.style.setProperty('--coach-brand-image',`url("${image.src}")`);
  slot.append(node);node.classList.add('coach-at-brand');target=slot;
 }
 reduced.addEventListener('change',()=>{if(reduced.matches&&target)land(target)});
 window.RefineGuide={hold:lift,raise,home,latest,map,brand:brandHome};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
