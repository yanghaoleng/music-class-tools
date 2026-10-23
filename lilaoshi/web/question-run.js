/* Keep stable question identities while varying reading goals, order, and A/B placement. */
(()=>{
 function shuffle(items){const values=[...items];for(let i=values.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[values[i],values[j]]=[values[j],values[i]]}return values}
 function resolve(base,variantId='base',optionOrder=[0,1]){
  const variant=variantId==='base'?{}:base.variants.find(v=>v.id===variantId),q={...base,...variant,id:base.id,variantId,optionOrder,contextKey:variantId+':'+optionOrder.join('')};delete q.variants;
  if(q.kind==='choice'){
   q.correct=optionOrder.indexOf(q.correct);q.labels=optionOrder.map(i=>q.labels[i]);if(q.visuals.length)q.visuals=optionOrder.map(i=>q.visuals[i]);
  }
  return q;
 }
 function create(questions,previous={}){
  let order=shuffle(questions.map(q=>q.id));if(order.length>1&&order.join(',')===(previous.order||[]).join(','))order=[...order.slice(1),order[0]];
  const variants={};for(const q of questions){const ids=['base',...(q.variants||[]).map(v=>v.id)],pool=ids.filter(id=>id!==previous.variants?.[q.id]?.variantId),variantId=pool[Math.floor(Math.random()*pool.length)]||ids[0],optionOrder=q.kind==='choice'?shuffle([0,1]):[0,1];variants[q.id]=resolve(q,variantId,optionOrder)}
  return {order,variants};
 }
 // Move only the current unanswered question; completed positions and variants stay intact.
 function defer(order,position,answers={}){
  if(!Number.isInteger(position)||position<0||position>=order.length-1||Object.hasOwn(answers,order[position]))return null;
  const next=[...order],question=next.splice(position,1)[0];next.push(question);return next;
 }
 function nextPending(order,current,answers={}){
  const start=order.indexOf(current);
  for(let offset=1;offset<=order.length;offset++){const id=order[(Math.max(start,-1)+offset)%order.length];if(!Object.hasOwn(answers,id))return id}
  return null;
 }
 window.RefineRun={create,resolve,defer,nextPending};
})();
