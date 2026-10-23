/* Anonymous browser identity; submitted conversations are recorded for the protected dashboard. */
(()=>{
 const publicBase=new URL('.',document.currentScript.src).pathname.replace(/\/$/,'');
 let visitor,session,qa=false,enabled=true,queue=Promise.resolve(),run=null;
 const threads=new Map(),sent=new Set();let identityRequest=null;
 try{
  const params=new URLSearchParams(location.search);
  if(params.has('qa'))sessionStorage.setItem('lilaoshi-qa',params.get('qa')==='1'?'1':'0');
  qa=sessionStorage.getItem('lilaoshi-qa')==='1';
  visitor=localStorage.getItem('lilaoshi-visitor')||crypto.randomUUID();localStorage.setItem('lilaoshi-visitor',visitor);
  session=sessionStorage.getItem('lilaoshi-session')||crypto.randomUUID();sessionStorage.setItem('lilaoshi-session',session);
 }catch{enabled=false}
 const active=()=>enabled&&!qa&&location.pathname.startsWith(publicBase+'/');
 async function post(path,body){
  for(let attempt=0;attempt<3;attempt++){
   try{const response=await fetch(publicBase+'/api/'+path,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true});if(response.ok)return true;if(response.status<500&&response.status!==429)return false}catch{}
   if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
  }
  return false;
 }
 window.RefineMetrics={
  identity(){
   if(!enabled||!visitor)return Promise.resolve(null);
   if(!identityRequest)identityRequest=fetch(publicBase+'/api/identity',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor})}).then(async response=>{if(!response.ok)throw Error('identity unavailable');const data=await response.json();if(!/^[A-Z0-9]{3,12}$/.test(data.id))throw Error('invalid identity');return data.id}).catch(()=>{identityRequest=null;return null});
   return identityRequest;
  },
  send(kind,extra={}){
   if(!active())return;
   const body={id:crypto.randomUUID(),visitor,session,kind,run,course:2,...extra};
   queue=queue.then(()=>post('collect',body)).catch(()=>{});
  },
  start(index,questions){run=crypto.randomUUID();this.send('start',{start:index,...(questions?{questions}:{})})},
  bookmarks(notes){if(!active())return;const questions=[...new Set((notes||[]).map(note=>note.questionId).filter(Number.isInteger))];queue=queue.then(()=>post('bookmarks',{visitor,session,questions})).catch(()=>{})},
  tracking(q){
   if(!active()||!q)return null;
   const key='lilaoshi-thread-'+q.id+'-'+(q.contextKey||q.variantId+':'+(q.optionOrder||[0,1]).join(''));
   try{if(!threads.has(key)){const id=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,id);threads.set(key,id)}}catch{return null}
   return {visitor,session,thread:threads.get(key)};
  },
  conversation(q,messages){
   const tracking=this.tracking(q);if(!tracking||!messages?.some(m=>m.role==='user'))return;
   messages.forEach((m,index)=>{m.id=m.id||crypto.randomUUID();m.position=index});
   for(const m of messages){
    if(sent.has(m.id))continue;
    // One message per request fits the existing 32 KiB recording limit, including Chinese text.
    const body={...tracking,q:q.id,variant:q.variantId||'base',optionOrder:q.optionOrder||[0,1],messages:[{id:m.id,position:m.position,role:m.role,content:m.content,...(typeof m.correct==='boolean'?{correct:m.correct}:{})}]};
    sent.add(m.id);queue=queue.then(async()=>{if(!await post('conversation',body))sent.delete(m.id)}).catch(()=>sent.delete(m.id));
   }
  }
 };
 // Keep submitted navigation steps independent of the model and analytics queues.
 const clock=()=>typeof performance!=='undefined'?performance.now():Date.now();
 let journeyStage={page:'home',q:null,chapter:null,mode:null},journeyTick=clock(),journeyPaused=typeof document!=='undefined'&&document.hidden,journeyStep=0;
 const visit=crypto.randomUUID();
 function journeyFlush(action,extra={}){
  if(!active())return;
  const tick=clock(),durationMs=Math.max(0,Math.min(86400000,Math.round(journeyPaused?0:tick-journeyTick)));journeyTick=tick;
  const next=extra.next||journeyStage;
  post('journey',{id:crypto.randomUUID(),visitor,session,visit,step:journeyStep++,page:journeyStage.page,q:journeyStage.q,chapter:journeyStage.chapter,mode:journeyStage.mode,durationMs,action,nextPage:next.page,nextQ:next.q,nextChapter:next.chapter,nextMode:next.mode,...(extra.option===0||extra.option===1?{option:extra.option}:{}),...(typeof extra.correct==='boolean'?{correct:extra.correct}:{})});
 }
 window.RefineMetrics.stage=(page,context={})=>{
  const next={page,q:context.q??null,chapter:context.chapter??null,mode:context.mode??null};
  if(JSON.stringify(next)===JSON.stringify(journeyStage))return;
  journeyFlush(context.action||'next_question',{next});journeyStage=next;journeyTick=clock();journeyFlush('arrive');
 };
 window.RefineMetrics.mark=(action,context={})=>journeyFlush(action,context);
 journeyFlush('arrive');
 if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('visibilitychange',()=>{if(document.hidden){journeyFlush('background');journeyPaused=true}else{journeyPaused=false;journeyTick=clock();journeyFlush('resume')}});
  window.addEventListener('pagehide',()=>journeyFlush('leave'));
  if(typeof setInterval==='function'&&active())setInterval(()=>{if(!journeyPaused)journeyFlush('stay')},15000);
 }

 window.RefineMetrics.send('view');
})();
