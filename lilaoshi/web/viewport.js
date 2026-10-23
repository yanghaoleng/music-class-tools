/* Keep the mobile canvas at its authored scale while preserving normal scrolling. */
(()=>{
 for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,event=>event.preventDefault(),{passive:false});
 let lastTap=null,start=null;
 document.addEventListener('touchstart',event=>{start=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY,time:Date.now()}:null},{passive:true});
 document.addEventListener('touchend',event=>{
  if(event.touches.length||event.changedTouches.length!==1){lastTap=null;return}
  const touch=event.changedTouches[0],now=Date.now();
  if(!start||now-start.time>350||Math.hypot(touch.clientX-start.x,touch.clientY-start.y)>12){lastTap=null;return}
  if(lastTap&&now-lastTap.time<300&&Math.hypot(touch.clientX-lastTap.x,touch.clientY-lastTap.y)<24){event.preventDefault();lastTap=null}
  else lastTap={time:now,x:touch.clientX,y:touch.clientY};
 },{passive:false});
})();
