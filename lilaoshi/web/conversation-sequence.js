/* Reading pauses belong to fresh messages; restored conversations stay immediate. */
(()=>{
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let timers=new Set(),generation=0,finish=null,scoreAnimation=null;
 const effects=new Set();let confetti=null;
 function cancel(){generation++;scoreAnimation?.cancel?.();scoreAnimation=null;for(const effect of effects)effect.cancel();effects.clear();confetti?.remove();confetti=null;for(const timer of timers)clearTimeout(timer);timers.clear();finish=null}
 function later(callback,delay){const token=generation,timer=setTimeout(()=>{timers.delete(timer);if(token===generation)callback()},delay);timers.add(timer)}
 function opening({messages,form,showMessage,onChange,duration}){
  cancel();if(!messages.length)return;
  const revealAll=()=>{for(const message of messages)message.hidden=false;form.hidden=false;form.inert=false;onChange()};
  if(reduced.matches){revealAll();return}
  finish=revealAll;messages.slice(1).forEach(message=>message.hidden=true);form.hidden=true;form.inert=true;
  showMessage(messages[0]);onChange();
  let delay=duration(messages[0])+1600;
  messages.slice(1).forEach((message,index)=>{later(()=>{if(!message.isConnected)return;message.hidden=false;showMessage(message);onChange()},delay);delay+=duration(message)+(index===messages.length-2?300:1000)});
  later(()=>{if(!form.isConnected)return;form.hidden=false;form.inert=false;showMessage(form);finish=null;onChange()},delay);
 }
 function trackEffect(animation){
  effects.add(animation);animation.finished.then(()=>effects.delete(animation),()=>effects.delete(animation));return animation;
 }
 function celebrate(scoreLine){
  if(!scoreLine?.isConnected||reduced.matches)return;
  const layer=document.createElement('span');layer.className='result-confetti';layer.setAttribute('aria-hidden','true');scoreLine.append(layer);confetti=layer;
  const colors=['#ffdc00','#ec78a4','#6baee8','#67c5a3','#ab8cdb'];
  const jobs=Array.from({length:28},(_,index)=>{
   const paper=document.createElement('i');paper.style.background=colors[index%colors.length];layer.append(paper);
   const angle=(index/28)*Math.PI*2,speed=140+Math.random()*120,vx=Math.cos(angle)*speed,vy=Math.sin(angle)*speed-110,duration=950+Math.random()*300,spin=(Math.random()-.5)*720;
   const frames=Array.from({length:9},(_,step)=>{
    const progress=step/8,time=progress*duration/1000;
    return {offset:progress,opacity:step===0?0:progress>.625?(1-progress)/.375:1,transform:`translate(${vx*time}px,${vy*time+230*time*time}px) rotate(${spin*progress}deg) scaleX(${.6+.4*Math.cos(progress*Math.PI*3)})`};
   });
   const animation=trackEffect(paper.animate(frames,{duration,easing:'linear',fill:'both'}));
   return animation.finished.catch(()=>{}).then(()=>{animation.cancel();paper.remove()});
  });
  Promise.all(jobs).then(()=>{layer.remove();if(confetti===layer)confetti=null});
 }
 function settlement({score,details,showDetails,updateScore,value,stamp,scoreLine}){
  cancel();const perfect=value===100&&!!stamp;
  const revealDetails=()=>{details.hidden=false;showDetails()};
  const reveal=()=>{updateScore?.(value);if(perfect)stamp.hidden=false;revealDetails()};
  if(reduced.matches){reveal();return}
  details.hidden=true;finish=reveal;
  if(updateScore){updateScore(0);for(let step=1;step<8;step++)later(()=>{if(score.isConnected)updateScore(Math.round(value*(1-Math.pow(1-step/8,2))*10)/10)},step*100)}
  const token=generation,animation=score.animate([{opacity:0,transform:'translateY(18px) scale(.94)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:updateScore?800:540,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});
  scoreAnimation=animation;
  animation.finished.catch(()=>{}).then(()=>{if(token===generation){updateScore?.(value);later(()=>{
   if(!details.isConnected)return;
   if(!perfect){finish=null;revealDetails();return}
   stamp.hidden=false;
   // A deliberate, slower stamp is reserved for a rare perfect-score celebration.
   const landing=trackEffect(stamp.animate([
    {opacity:0,transform:'translateY(-28px) scale(1.65) rotate(-18deg)'},
    {opacity:1,transform:'translateY(0) scale(.94) rotate(2deg)',offset:.8},
    {opacity:1,transform:'translateY(0) scale(1) rotate(0deg)'}
   ],{duration:680,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));
   landing.finished.then(()=>{
    if(token!==generation||!stamp.isConnected||reduced.matches)return;
    landing.cancel();celebrate(scoreLine);finish=null;revealDetails();
   },()=>{});
  },350)}});
 }
 reduced.addEventListener('change',()=>{if(reduced.matches){const reveal=finish;cancel();reveal?.()}});
 window.RefineSequence={opening,settlement,cancel};
})();
