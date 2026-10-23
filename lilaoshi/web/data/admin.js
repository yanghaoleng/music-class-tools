const $=s=>document.querySelector(s),esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const fmt=n=>Number(n).toLocaleString('zh-CN'),pct=(a,b)=>b?`${(100*a/b).toFixed(1)}%`:'—',date=t=>t?new Date(t*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
let period='7',data=null,pin='',busy=false,lockedUntil=0,userPage=0,generation=0,detailGeneration=0,selectedUser=null,recordPage=0,searchTimer;
const transcriptNodes=new Map();
// Retarget from the current presentation when an interaction interrupts motion.
const adminMotion=new WeakMap(),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let keyboardInput=false;
document.addEventListener('keydown',()=>{keyboardInput=true;document.documentElement.dataset.adminInput='keyboard'},true);
document.addEventListener('pointerdown',()=>{keyboardInput=false;document.documentElement.dataset.adminInput='pointer'},true);
function moveContent(node,{offset=0,x=0,scale=1,duration=180,delay=0,exit=false}={}){
 const running=adminMotion.get(node),current=running?getComputedStyle(node):null;
 const from=current?{opacity:current.opacity,transform:current.transform}:{opacity:exit?1:.6,transform:exit?'none':`translate(${x}px,${offset}px) scale(${scale})`};
 running?.cancel();adminMotion.delete(node);
 if(keyboardInput||!node.animate||!node.getClientRects().length)return Promise.resolve();
 const to={opacity:exit?0:1,transform:reducedMotion.matches?'none':exit?'scale(.98)':'none'};
 if(reducedMotion.matches)from.transform='none';
 const easing=getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim();
 const animation=node.animate([from,to],{duration:reducedMotion.matches?125:duration,delay:reducedMotion.matches?0:delay,easing,fill:'backwards'});
 adminMotion.set(node,animation);
 return animation.finished.catch(()=>{}).finally(()=>{if(adminMotion.get(node)===animation)adminMotion.delete(node)});
}
function counter(host,value){
 const text=String(value);host.setAttribute('aria-label',text);
 if(!window.RefineText){host.textContent=text;return}
 if(host.dataset.counterReady){window.RefineText.slots(host,text);return}
 host.dataset.counterReady='true';window.RefineText.slots(host,reducedMotion.matches?text:'0');
 requestAnimationFrame(()=>{if(host.isConnected)window.RefineText.slots(host,text)});
}
let modalCloseGeneration=0;
function showDetail(){
 modalCloseGeneration++;const modal=$('#detail-modal'),wasOpen=modal.open;
 adminMotion.get(modal)?.cancel();modal.classList.remove('is-closing');
 if(!wasOpen){modal.showModal();moveContent(modal,{duration:250,scale:.98})}
 else moveContent(modal.querySelector('section:not([hidden])'),{duration:180});
}
async function closeDetail(){
 const modal=$('#detail-modal');if(!modal.open||modal.classList.contains('is-closing'))return;
 const token=++modalCloseGeneration;modal.classList.add('is-closing');
 await moveContent(modal,{duration:180,exit:true});
 if(token!==modalCloseGeneration)return;
 modal.close();modal.classList.remove('is-closing');
}
$('#detail-modal').addEventListener('cancel',event=>{event.preventDefault();closeDetail()});

const tableSorts=new Map(),tableRows=new WeakMap();
let savedColumnWidths={};try{savedColumnWidths=JSON.parse(localStorage.getItem('lilaoshi-admin-column-widths')||'{}')}catch{}
if(!savedColumnWidths||typeof savedColumnWidths!=='object'||Array.isArray(savedColumnWidths))savedColumnWidths={};
function tableValue(cell){const raw=cell.dataset.value??cell.textContent.trim();if(raw===''||raw==='—')return null;return /^-?\d+(\.\d+)?$/.test(raw)?Number(raw):raw}
function compareTableValues(a,b,direction){
 if(a===null||b===null)return a===b?0:a===null?1:-1;
 const value=typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b),'zh-CN',{numeric:true});return direction==='asc'?value:-value;
}
function applyTableSort(table){
 const body=table.tBodies[0];if(!body)return;
 const current=[...body.rows];let original=tableRows.get(table);
 if(!original||current.length!==original.length||current.some(row=>!original.includes(row))){original=current;tableRows.set(table,original)}
 const state=tableSorts.get(table.id);
 if(!table.dataset.remoteSort){
  const rows=[...original];if(state?.direction)rows.sort((a,b)=>compareTableValues(tableValue(a.cells[state.column]),tableValue(b.cells[state.column]),state.direction)||original.indexOf(a)-original.indexOf(b));
  for(const row of rows)body.append(row);
 }
 [...table.tHead.rows[0].cells].forEach((th,index)=>{
  const direction=state?.column===index?state.direction:null;
  th.setAttribute('aria-sort',direction==='asc'?'ascending':direction==='desc'?'descending':'none');
  th.querySelector('.sort-indicator').textContent=direction==='asc'?'↑':direction==='desc'?'↓':'↕';
  const next=direction==='asc'?'降序':direction==='desc'?'恢复原始顺序':'升序';th.querySelector('.column-sort').title='点击'+next;
 });
}
function setColumnWidths(table,widths){
 let group=table.querySelector('colgroup');if(!group){group=document.createElement('colgroup');table.prepend(group)}
 while(group.children.length<widths.length)group.append(document.createElement('col'));
 widths.forEach((width,index)=>{group.children[index].style.width=width+'px';const grip=table.tHead.rows[0].cells[index].querySelector('.column-resize');grip?.setAttribute('aria-valuenow',Math.round(width))});
 table.style.tableLayout='fixed';table.style.width=widths.reduce((a,b)=>a+b,0)+'px';
}
function resizeTableColumn(table,index,width){
 const headers=[...table.tHead.rows[0].cells];
 let widths=savedColumnWidths[table.id];if(!Array.isArray(widths)||widths.length!==headers.length)widths=headers.map(th=>Math.max(72,th.getBoundingClientRect().width||140));else widths=[...widths];
 widths[index]=Math.max(72,Math.min(900,width));savedColumnWidths[table.id]=widths;setColumnWidths(table,widths);
 try{localStorage.setItem('lilaoshi-admin-column-widths',JSON.stringify(savedColumnWidths))}catch{}
}
function enhanceTables(root=document){
 root.querySelectorAll('table').forEach(table=>{
  if(!table.id||!table.tHead?.rows[0]||!table.tBodies[0])return;
  const headers=[...table.tHead.rows[0].cells];
  headers.forEach((th,index)=>{
   if(th.querySelector('.column-sort'))return;
   const label=th.textContent.trim();th.textContent='';
   const button=document.createElement('button');button.type='button';button.className='column-sort';button.innerHTML=`<span>${esc(label)}</span><span class="sort-indicator" aria-hidden="true">↕</span>`;th.append(button);
   button.onclick=()=>{
    const previous=tableSorts.get(table.id),direction=previous?.column!==index||!previous.direction?'asc':previous.direction==='asc'?'desc':null;
    tableSorts.set(table.id,{column:index,direction});applyTableSort(table);
    if(table.dataset.remoteSort){userPage=0;load()}else moveContent(table.tBodies[0],{duration:125})
   };
   const grip=document.createElement('span');grip.className='column-resize';grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label',`调整${label}列宽`);grip.setAttribute('aria-valuemin','72');grip.setAttribute('aria-valuemax','900');grip.setAttribute('aria-valuenow',Math.round(th.getBoundingClientRect().width||140));th.append(grip);
   grip.onpointerdown=event=>{
    event.preventDefault();event.stopPropagation();const start=event.clientX,width=th.getBoundingClientRect().width;
    grip.setPointerCapture(event.pointerId);table.classList.add('resizing');
    grip.onpointermove=move=>resizeTableColumn(table,index,width+move.clientX-start);
    const finish=()=>{grip.onpointermove=null;table.classList.remove('resizing');grip.onpointerup=null;grip.onpointercancel=null};grip.onpointerup=finish;grip.onpointercancel=finish;
   };
   grip.onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();resizeTableColumn(table,index,th.getBoundingClientRect().width+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?40:10))};
  });
  const widths=savedColumnWidths[table.id];if(Array.isArray(widths)&&widths.length===headers.length&&widths.every(v=>Number.isFinite(v)&&v>=72&&v<=900))setColumnWidths(table,widths);
  applyTableSort(table);
 });
}
function userSortQuery(){const state=tableSorts.get('user-table');if(!state?.direction)return '';const key=['label','depth','chapters','correct','accuracy','openAnswers','lastActive','bookmarks'][state.column];return `&sort=${key}&direction=${state.direction}`}

let activityItems=[],activityIndex=0,activitySignature='',activityColumns=0;
function prepareActivities(force=false){
 const records=data?.activity||[],signature=records.map(r=>r.id).join('|');
 if(force||signature!==activitySignature){
  activitySignature=signature;const pool=[...records];
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
  const first=[],types=new Set();for(const record of pool)if(!types.has(record.type)&&first.length<3){types.add(record.type);first.push(record)}
  activityItems=[...first,...pool.filter(record=>!first.includes(record))];activityIndex=0;
 }
 renderActivities();
}
function renderActivities(direction=0){
 const host=$('#activity-cards'),count=parseInt(getComputedStyle(host).getPropertyValue('--cards'))||3;
 activityColumns=count;
 if(activityIndex>=activityItems.length)activityIndex=0;
 const rows=activityItems.slice(activityIndex,activityIndex+count);
 const names={conversation:'和 AI 讨论',answer:'提交简答',score:'完成一轮答题'};
 host.innerHTML=rows.length?rows.map(record=>{
  let body='';
  if(record.type==='score')body=`<div class="activity-score">${record.accuracy===null?'待判定':`<span class="activity-number" data-counter="${record.accuracy}"></span><small>% 正确率</small>`}</div><p class="activity-result">完成 ${record.total} 道题 · 答对 ${record.correct} 道${record.graded<record.total?`<br>已判定 ${record.graded} 道，另有 ${record.total-record.graded} 道待判定；正确率按已判定题目计算`:''}</p>`;
  else body=`${record.userText?`<blockquote><small>用户</small><p>${esc(record.userText)}</p></blockquote>`:''}${record.aiText?`<blockquote class="activity-ai"><small>李老师</small><p>${esc(record.aiText)}</p></blockquote>`:''}`;
  return `<article class="activity-card"><div class="activity-card-meta"><span>${names[record.type]}</span><time>${date(record.ts)}</time></div><h3>${esc(record.title)}</h3><div class="activity-body">${body}</div><div class="activity-card-foot"><span>${esc(record.label)}</span><button class="activity-user" data-activity-user="${record.visitor}">查看详情 <span class="activity-arrow" aria-hidden="true">→</span></button></div></article>`;
 }).join(''):'<p class="activity-empty">当前范围还没有符合条件的动态。提交简答、与 AI 对话或完成一轮答题后会出现在这里。</p>';
 $('#activity-page').textContent=rows.length?`${activityIndex+1}–${activityIndex+rows.length} / ${activityItems.length}`:'0 / 0';
 for(const id of ['activity-prev','activity-next','activity-shuffle'])$('#'+id).disabled=activityItems.length<=count;
 host.querySelectorAll('[data-counter]').forEach(node=>counter(node,node.dataset.counter));
 [...host.children].forEach((card,index)=>moveContent(card,{offset:direction?0:8,x:direction*10,duration:180,delay:index*30}));
 host.querySelectorAll('[data-activity-user]').forEach(button=>button.onclick=()=>{openUser(button.dataset.activityUser)});
}
$('#activity-next').onclick=()=>{activityIndex=activityIndex+activityColumns>=activityItems.length?0:activityIndex+activityColumns;renderActivities(1)};
$('#activity-prev').onclick=()=>{activityIndex=activityIndex===0?Math.floor((activityItems.length-1)/activityColumns)*activityColumns:Math.max(0,activityIndex-activityColumns);renderActivities(-1)};
$('#activity-shuffle').onclick=()=>prepareActivities(true);
new ResizeObserver(()=>{const columns=parseInt(getComputedStyle($('#activity-cards')).getPropertyValue('--cards'))||3;if(columns!==activityColumns)renderActivities()}).observe($('#activity-cards'));

function dots(){document.querySelectorAll('.pin-dots i').forEach((n,i)=>n.classList.toggle('filled',i<pin.length));$('.pin-dots').setAttribute('aria-label',`已输入 ${pin.length} 位`)}
function gate(){data=null;selectedUser=null;detailGeneration++;$('#gate').hidden=false;$('#dashboard').hidden=true;$('#users').replaceChildren();$('#transcripts').replaceChildren();$('#learner-detail').hidden=true;activityItems=[];activitySignature='';$('#activity-cards').replaceChildren();$('#detail-modal').close()}
async function api(path,options){const response=await fetch('../api/'+path,{cache:'no-store',...options});if(response.status===401){gate();throw Error('请重新输入访问码。')}const value=await response.json();if(!response.ok)throw Error(value.error||'数据暂时无法读取，请重试。');return value}
async function key(k){
 if(busy||Date.now()<lockedUntil)return;
 if(k==='clear')pin='';else if(k==='delete')pin=pin.slice(0,-1);else if(/^\d$/.test(k)&&pin.length<6)pin+=k;
 dots();if(pin.length!==6)return;busy=true;$('#pin-error').textContent='正在验证…';
 try{const response=await fetch('../api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:pin})});const result=await response.json();if(!response.ok){if(response.status===429)lockedUntil=Date.now()+(result.retryAfter||300)*1000;throw Error(result.error||'验证失败')}pin='';dots();await load()}
 catch(error){$('#pin-error').textContent=error.message==='Failed to fetch'?'连接失败，请重试。':error.message;pin='';dots()}
 finally{busy=false}
}
document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>key(b.dataset.key));
document.addEventListener('keydown',event=>{if($('#gate').hidden||event.ctrlKey||event.metaKey||event.altKey)return;let k=event.key;if(k==='Backspace')k='delete';if(k==='Escape')k='clear';if(/^\d$/.test(k)||['delete','clear'].includes(k)){event.preventDefault();key(k)}});
setInterval(()=>{if(Date.now()<lockedUntil)$('#pin-error').textContent=`尝试过于频繁，${Math.ceil((lockedUntil-Date.now())/1000)} 秒后重试。`;else if(lockedUntil){lockedUntil=0;$('#pin-error').textContent='可以重新输入访问码。'}},1000);
async function load(){
 const firstLoad=$('#dashboard').hidden;
 const token=++generation;$('#data-content').setAttribute('aria-busy','true');$('#load-state').textContent='正在读取…';$('#refresh').disabled=true;
 selectedUser=null;detailGeneration++;$('#learner-detail').hidden=true;
 try{
  const result=await api(`learners?days=${period}&page=${userPage}&search=${encodeURIComponent($('#user-search').value.trim())}${userSortQuery()}`);
  if(token!==generation)return;data=result;render();$('#load-state').textContent='';$('#pin-error').textContent='';$('#gate').hidden=true;$('#dashboard').hidden=false;
  if(firstLoad){[$('.dash-title'),$('#trend'),$('.activity-section'),$('#metrics')].forEach((node,index)=>moveContent(node,{offset:8,duration:220,delay:index*30}))}
  else moveContent($('#'+document.querySelector('[data-report][aria-selected=true]').dataset.report),{duration:150});
 }catch(error){if(token===generation){if($('#dashboard').hidden)$('#pin-error').textContent=error.message==='请重新输入访问码。'?'':error.message;else $('#load-state').textContent=error.message+' 当前数据未更新。'}}
 finally{if(token===generation){$('#refresh').disabled=false;$('#data-content').setAttribute('aria-busy','false')}}
}
function render(){
 const t=data.totals;
 $('#scope').textContent=`${period==='all'?'全部可用数据':`近 ${period} 天`} · ${data.trend.from} 至 ${data.trend.to} · 上海时区 · 刷新于 ${new Date().toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'})}`;
 const items=[['匿名用户',fmt(t.users),'按浏览器标识去重'],['答题记录',fmt(t.answers),'包含重复练习；正文另列'],['总体正确率',pct(t.correct,t.graded),`${fmt(t.correct)} / ${fmt(t.graded)} 次已判定`],['简答题原文',fmt(t.openAnswers),'用户提交消息数'],['对话消息',fmt(t.messages),'包含用户与 李老师']];
 if(!$('#metrics').children.length)$('#metrics').innerHTML=items.map(()=>'<div><div class="metric-label"></div><div class="metric-value"></div><div class="metric-detail"></div></div>').join('');
 items.forEach(([label,value,detail],index)=>{const item=$('#metrics').children[index];item.querySelector('.metric-label').textContent=label;item.querySelector('.metric-detail').textContent=detail;counter(item.querySelector('.metric-value'),value)});
 const chapter=$('#chapter').value;
 $('#chapter').innerHTML='<option value="all">全部章节</option>'+data.chapters.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('');$('#chapter').value=chapter;
 renderQuestions();drawTrend();prepareActivities();
 $('#users').innerHTML=data.users.length?data.users.map(u=>`<tr><td data-value="${esc(u.label)}"><button class="user-link" data-user="${u.id}">${esc(u.label)}</button><small>${u.starts} 轮练习</small></td><td data-value="${u.depth}"><span class="depth-value">${u.depth} / ${u.totalQuestions}</span><progress max="${u.totalQuestions}" value="${u.depth}" aria-label="答题深度 ${u.depth} / ${u.totalQuestions}"></progress></td><td data-value="${u.chapters}">${u.chapters} / ${data.chapters.length}</td><td data-value="${u.correct}">${u.correct} / ${u.graded}</td><td data-value="${u.graded?u.correct/u.graded:''}">${pct(u.correct,u.graded)}</td><td data-value="${u.openAnswers}">${u.openAnswers}</td><td data-value="${u.lastActive??''}">${date(u.lastActive)}</td><td data-value="${u.bookmarks??''}">${u.bookmarks===null?'未同步':u.bookmarks}</td></tr>`).join(''):'<tr><td colspan="8" class="empty-cell">当前范围暂无匹配用户。</td></tr>';
 $('#user-count').textContent=`${fmt(data.total)} 位用户`;$('#user-page').textContent=`第 ${userPage+1} / ${Math.max(1,Math.ceil(data.total/data.pageSize))} 页`;
 $('#user-prev').disabled=userPage===0;$('#user-next').disabled=(userPage+1)*data.pageSize>=data.total;
 enhanceTables();
 document.querySelectorAll('[data-user]').forEach(button=>button.onclick=()=>openUser(button.dataset.user));
 $('#recording-since').textContent=`简答与对话正文从 ${date(t.recordingSince)} 起接入。此前服务器未保存正文，无法恢复；后续继续对话时，可同步该浏览器仍保存的同题历史。数字统计与正文覆盖时间可能不同。`;
}
const trendSeries=[
 {key:'views',name:'访问量',unit:'次',axis:'count'},
 {key:'users',name:'用户数',unit:'人',axis:'count'},
 {key:'retention',name:'次日留存率',unit:'%',axis:'percent'},
 {key:'accuracy',name:'正确率',unit:'%',axis:'percent'},
 {key:'depth',name:'使用深度',unit:'题 / 人',axis:'count'}
];
const shownSeries=new Set(trendSeries.map(s=>s.key));let trendCursor=0;
function trendValue(series,value){return value===null||value===undefined?'—':series.axis==='percent'?`${value.toFixed(1)}%`:series.key==='depth'?`${Number(value.toFixed(2))} 题 / 人`:`${fmt(value)} ${series.unit}`}
function niceTrendMax(value){const power=10**Math.floor(Math.log10(Math.max(value,1))),ratio=value/power;return (ratio<=1?1:ratio<=2?2:ratio<=5?5:10)*power}
function drawTrend(){
 const rows=data?.trend?.days||[],active=trendSeries.filter(s=>shownSeries.has(s.key)),host=$('#trend-chart');
 if(!$('#trend-legend').children.length){
 $('#trend-legend').innerHTML=trendSeries.map(s=>`<label class="trend-toggle legend-${s.key}"><input type="checkbox" data-series="${s.key}" ${shownSeries.has(s.key)?'checked':''}><span class="metric-dot" aria-hidden="true"></span><span>${s.name}</span></label>`).join('');
 $('#trend-legend').querySelectorAll('input').forEach(input=>input.onchange=()=>{input.checked?shownSeries.add(input.dataset.series):shownSeries.delete(input.dataset.series);drawTrend();moveContent($('#trend-chart'),{duration:150})});
 }
 $('#trend-note').textContent='访问量、用户数和使用深度看左侧数量刻度；留存率与正确率看右侧百分比。留存的次日尚未结束时显示「待观察」。';
 $('#trend-table').innerHTML=`<table id="daily-table"><thead><tr><th>日期</th>${trendSeries.map(s=>`<th>${s.name}</th>`).join('')}<th>次日回来 / 首次出现</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.day}${r.covered?'':' · 未采集'}</td>${trendSeries.map(s=>`<td data-value="${r[s.key]??''}">${trendValue(s,r[s.key])}</td>`).join('')}<td data-value="${r.returned??''}">${!r.cohort?'—':r.retentionMature?`${r.returned} / ${r.cohort}`:`待观察 / ${r.cohort}`}</td></tr>`).join('')}</tbody></table>`;
 enhanceTables($('#trend-table'));
 $('#trend-tooltip').hidden=true;
 if(!active.length){host.innerHTML='<div class="trend-empty">选择上方任意指标，即可查看趋势。</div>';return}
 if(!rows.some(r=>active.some(s=>r[s.key]!==null&&r[s.key]!==undefined))){host.innerHTML='<div class="trend-empty">当前范围暂无这些指标的有效数据。</div>';return}
 const W=Math.max(320,Math.round($('#trend-plot').getBoundingClientRect().width)||900),H=300,left=44,right=48,top=26,bottom=36,plotW=W-left-right,plotH=H-top-bottom;
 const counts=active.filter(s=>s.axis==='count'),hasPercent=active.some(s=>s.axis==='percent');
 const max=niceTrendMax(Math.max(1,...rows.flatMap(r=>counts.map(s=>r[s.key]??0))));
 const x=i=>left+(rows.length===1?plotW/2:i*plotW/(rows.length-1)),y=(s,value)=>top+plotH*(1-value/(s.axis==='percent'?100:max));
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="关键指标每日趋势，左右方向键查看日期，详情可展开每日数值表">`;
 for(let i=0;i<=4;i++){
  const yy=top+plotH*i/4,count=max*(4-i)/4;
  svg+=`<line class="trend-grid" x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}"/>`;
  if(counts.length)svg+=`<text class="trend-axis" x="${left-10}" y="${yy+4}" text-anchor="end">${Number(count.toFixed(1))}</text>`;
  if(hasPercent)svg+=`<text class="trend-axis" x="${W-right+9}" y="${yy+4}">${100-i*25}%</text>`;
 }
 if(counts.length)svg+=`<text class="trend-axis" x="${left}" y="13">数量</text>`;
 if(hasPercent)svg+=`<text class="trend-axis" x="${W-right}" y="13" text-anchor="end">百分比</text>`;
 const ticks=Math.min(rows.length,Math.max(2,Math.floor(plotW/105))),indices=new Set(Array.from({length:ticks},(_,i)=>Math.round(i*(rows.length-1)/Math.max(1,ticks-1))));
 for(const i of indices)svg+=`<text class="trend-axis" x="${x(i)}" y="${H-10}" text-anchor="middle">${rows[i].day.slice(5)}</text>`;
 for(const s of active){
  let path='',connected=false;
  rows.forEach((r,i)=>{const v=r[s.key];if(v===null||v===undefined){connected=false;return}path+=`${connected?'L':'M'}${x(i).toFixed(2)},${y(s,v).toFixed(2)} `;connected=true});
  svg+=`<g class="trend-line line-${s.key}"><path d="${path}"/>${rows.map((r,i)=>r[s.key]===null||r[s.key]===undefined?'':`<circle cx="${x(i)}" cy="${y(s,r[s.key])}" r="2.4"/>`).join('')}</g>`;
 }
 svg+=`<line id="trend-cursor" class="trend-cursor" visibility="hidden" x1="0" x2="0" y1="${top}" y2="${H-bottom}"/></svg>`;
 host.innerHTML=svg;const drawing=host.querySelector('svg');
 function showPoint(index){
  trendCursor=Math.max(0,Math.min(rows.length-1,index));const row=rows[trendCursor],tip=$('#trend-tooltip'),cursor=$('#trend-cursor');
  cursor.setAttribute('x1',x(trendCursor));cursor.setAttribute('x2',x(trendCursor));cursor.setAttribute('visibility','visible');
  tip.innerHTML=`<strong>${row.day}${row.covered?'':' · 未采集'}</strong>${active.map(s=>{
   let detail=row.covered?trendValue(s,row[s.key]):'未采集';
   if(s.key==='retention'&&row.covered)detail=!row.cohort?'无首次出现用户':!row.retentionMature?'待观察':`${detail}（${row.returned} / ${row.cohort}）`;
   if(s.key==='accuracy'&&row.graded)detail+=`（${row.correct} / ${row.graded}）`;
   return `<div class="legend-${s.key}"><span class="metric-dot" aria-hidden="true"></span><span>${s.name}</span><b>${detail}</b></div>`;
  }).join('')}`;
  tip.hidden=false;tip.style.left=Math.max(0,Math.min(W-tip.offsetWidth,x(trendCursor)+12))+'px';
 }
 drawing.onpointermove=event=>{const rect=drawing.getBoundingClientRect(),px=(event.clientX-rect.left)*W/rect.width;showPoint(rows.length===1?0:Math.round((px-left)/plotW*(rows.length-1)))};
 drawing.onpointerdown=drawing.onpointermove;
 drawing.onpointerleave=()=>{$('#trend-tooltip').hidden=true;$('#trend-cursor')?.setAttribute('visibility','hidden')};
 drawing.onfocus=()=>showPoint(trendCursor);
 drawing.onblur=drawing.onpointerleave;
 drawing.onkeydown=event=>{let next=trendCursor;if(event.key==='ArrowLeft')next--;else if(event.key==='ArrowRight')next++;else if(event.key==='Home')next=0;else if(event.key==='End')next=rows.length-1;else return;event.preventDefault();showPoint(next)};
}
function selectPeriod(button){
 if(button.getAttribute('aria-selected')==='true')return;
 period=button.dataset.period;userPage=0;
 document.querySelectorAll('[data-period]').forEach(tab=>{const selected=tab===button;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1});
 $('#data-content').setAttribute('aria-labelledby',button.id);load();
}
document.querySelectorAll('[data-period]').forEach((button,index,all)=>{
 button.onclick=()=>selectPeriod(button);
 button.onkeydown=event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%all.length;else if(event.key==='ArrowLeft')next=(index+all.length-1)%all.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=all.length-1;else return;event.preventDefault();selectPeriod(all[next]);all[next].focus()};
});
function selectReport(button){
 if(button.getAttribute('aria-selected')==='true')return;
 $('.report-tabs').dataset.active=button.dataset.report;
 document.querySelectorAll('[data-report]').forEach(tab=>{const selected=tab===button;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$('#'+tab.dataset.report).hidden=!selected});enhanceTables($('#'+button.dataset.report));moveContent($('#'+button.dataset.report),{duration:150});
}
document.querySelectorAll('[data-report]').forEach((button,index,all)=>{
 button.onclick=()=>selectReport(button);
 button.onkeydown=event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%all.length;else if(event.key==='ArrowLeft')next=(index+all.length-1)%all.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=all.length-1;else return;event.preventDefault();selectReport(all[next]);all[next].focus()};
});
let chartWidth=0;new ResizeObserver(entries=>{const width=Math.round(entries[0].contentRect.width);if(width&&width!==chartWidth){chartWidth=width;if(data)drawTrend()}}).observe($('#trend-plot'));

function renderQuestions(){
 if(!data)return;
 const chapter=$('#chapter').value;
 const rows=data.questions.filter(q=>chapter==='all'||q.chapter===Number(chapter));
 rows.sort((a,b)=>a.id-b.id);
 $('#questions').innerHTML=rows.map(q=>`<tr><td data-value="${esc(q.title)}"><button class="question-link" data-question-detail="${q.id}">${q.id+1}. ${esc(q.title)}</button><small>${esc(q.chapterName)} · ${q.kind==='open'?'简答题 · AI 判定':'选择题'}</small></td><td data-value="${q.users}">${q.users}</td><td data-value="${q.answers}">${q.answers}</td><td data-value="${q.correct}">${q.correct} / ${q.graded}</td><td data-value="${q.graded?q.correct/q.graded:''}">${pct(q.correct,q.graded)}</td><td data-value="${q.bookmarks}">${q.bookmarks}</td></tr>`).join('');
 enhanceTables($('#learning'));
 $('#questions').querySelectorAll('[data-question-detail]').forEach(button=>button.onclick=()=>openQuestion(+button.dataset.questionDetail));
}
async function openUser(id){
 questionGeneration++;$('#question-detail').hidden=true;selectedUser=id;recordPage=0;transcriptNodes.clear();$('#transcripts').replaceChildren();$('#answer-history').replaceChildren();$('#learner-summary').textContent='';$('#learner-title').textContent=data?.users?.find(user=>user.id===id)?.label||'用户';$('#learner-detail').hidden=false;$('#records-more').hidden=true;$('#journeys').replaceChildren();$('#bookmarked-questions').replaceChildren();$('#journeys-more').hidden=true;showDetail();
 $('#detail-modal').scrollTop=0;$('#learner-title').focus({preventScroll:true});await loadRecords(true);
}
async function loadRecords(first=false){
 const id=selectedUser,token=++detailGeneration;$('#detail-status').textContent='正在读取作答与对话…';$('#records-more').disabled=true;
 try{
  const d=await api(`learner?id=${encodeURIComponent(id)}&days=${period}&page=${recordPage}`);
  if(token!==detailGeneration||selectedUser!==id)return;
  if(first){
   $('#learner-title').textContent=d.label;
   $('#bookmarked-questions').innerHTML=d.bookmarks===null?'<p class="section-description">此用户尚未同步收藏，无法确认当前收藏状态。</p>':d.bookmarkedQuestions.length?`<div class="bookmarked-list">${d.bookmarkedQuestions.map(q=>`<button class="question-link" data-bookmarked-question="${q.id}">${q.id+1}. ${esc(q.title)}</button>`).join('')}</div>`:'<p class="section-description">当前没有收藏的题目。</p>';
   $('#bookmarked-questions').querySelectorAll('[data-bookmarked-question]').forEach(button=>button.onclick=()=>openQuestion(+button.dataset.bookmarkedQuestion));
   $('#learner-summary').textContent=`答题深度 ${d.depth} / ${d.totalQuestions} · 涉及 ${d.chapters} 章 · 答题记录 ${d.answers.length} 次 · 正确率 ${pct(d.correct,d.graded)}（${d.correct} / ${d.graded} 次已判定）`;
   $('#answer-history').innerHTML=d.answers.length?`<table id="answer-table"><thead><tr><th>题目</th><th>题型</th><th>判定</th><th>时间</th></tr></thead><tbody>${d.answers.map(a=>`<tr><td data-value="${esc(a.title)}">${a.course===1?'旧版 · ':''}<button class="question-link" data-question-detail="${a.q}" ${a.course===1?'disabled':''}>${a.q+1}. ${esc(a.title)}</button></td><td>${a.kind==='open'?'简答':'选择'}</td><td data-value="${a.correct===null?'':a.correct?1:0}"><span class="outcome ${a.correct===null?'ungraded':a.correct?'right':'wrong'}">${a.correct===null?'未判定':a.correct?'答对':'答错'}</span></td><td data-value="${a.ts}">${date(a.ts)}</td></tr>`).join('')}</tbody></table>`:'<p class="empty-cell">暂无答题判定记录。</p>';
  }
  if(first)renderJourneys(d);
  enhanceTables($('#answer-history'));$('#answer-history').querySelectorAll('[data-question-detail]:not(:disabled)').forEach(button=>button.onclick=()=>openQuestion(+button.dataset.questionDetail));
  for(const m of d.records){
   let thread=transcriptNodes.get(m.thread);
   if(!thread){thread=document.createElement('details');thread.className='transcript';thread.open=true;thread.innerHTML=`<summary>${m.q+1}. ${esc(m.title)} <small>${m.kind==='open'?'简答题':'选择题讨论'}</small></summary><p class="transcript-question">${esc(m.question)}</p><ol class="message-list"></ol>`;$('#transcripts').append(thread);transcriptNodes.set(m.thread,thread)}
   const item=document.createElement('li');item.className='record-message '+m.role;
   item.innerHTML=`<div class="record-meta"><strong>${m.role==='user'?(m.kind==='open'?'用户 · 简答原文':'用户'):'李老师'}</strong><time>${date(m.ts)}</time>${m.correct!==null?`<span class="outcome ${m.correct?'right':'wrong'}">AI 判定${m.correct?'答对':'答错'}</span>`:''}</div><p>${esc(m.content)}</p>`;thread.querySelector('ol').append(item);
  }
  if(first)moveContent($('#learner-summary'),{duration:180});
  $('#records-more').hidden=!d.hasMore;$('#detail-status').textContent=d.messages?`已显示 ${$('#transcripts').querySelectorAll('li').length} / ${d.messages} 条消息`:'本期没有服务器保存的对话正文。历史正文未采集，无法恢复。';
 }catch(error){if(token===detailGeneration){$('#detail-status').textContent=error.message+' 可再次点击重试。';$('#records-more').hidden=false}}
 finally{if(token===detailGeneration)$('#records-more').disabled=false}
}
let questionGeneration=0,journeyPage=0;
function renderJourneys(result,append=false){
 if(!append){$('#journeys').replaceChildren();journeyPage=0}
 for(const path of result.journeys||[]){
  const item=document.createElement('details');item.className='journey-card';item.open=!$('#journeys').children.length;
  const summary=document.createElement('summary');summary.textContent=`${date(path.ts)} · ${path.precise?'使用路径':'历史会话（未记录停留时长）'} · ${path.steps} 步`;
  const text=document.createElement('p');text.className='journey-text';text.textContent=path.text;item.append(summary,text);$('#journeys').append(item);
 }
 $('#journeys-more').hidden=!result.journeysHasMore;
 $('#journey-status').textContent=$('#journeys').children.length?'':'本期尚无使用路径记录。精确停留时长从本次更新后开始采集。';
}
$('#journeys-more').onclick=async()=>{
 const id=selectedUser,token=detailGeneration;$('#journeys-more').disabled=true;
 try{const result=await api(`learner?id=${id}&days=${period}&journeyPage=${journeyPage+1}`);if(id!==selectedUser||token!==detailGeneration)return;journeyPage++;renderJourneys(result,true)}
 catch(error){if(id===selectedUser)$('#journey-status').textContent=error.message}
 finally{$('#journeys-more').disabled=false}
};
async function openQuestion(id){
 const token=++questionGeneration;detailGeneration++;selectedUser=null;$('#learner-detail').hidden=true;$('#question-detail').hidden=false;$('#question-title').textContent='题目详情';$('#question-content').replaceChildren();$('#question-status').textContent='正在读取…';
 showDetail();$('#detail-modal').scrollTop=0;$('#question-title').focus({preventScroll:true});
 try{
  const result=await api(`question?id=${id}&days=${period}`);if(token!==questionGeneration||!$('#detail-modal').open)return;
  const q=result.question;
  $('#question-title').textContent=`${q.id+1}. ${q.title}`;
  $('#question-content').innerHTML=`<p class="section-description">${esc(result.chapter)} · ${q.kind==='open'?'简答题':'选择题'} · ${result.answers} 次提交 · ${result.bookmarks} 人收藏 · 正确率 ${pct(result.correct,result.graded)}（${result.correct} / ${result.graded} 次已判定）</p><h4>完整题干</h4><p class="question-full-text">${esc(q.brief)} ${q.kind==='open'?`<strong>${esc(q.prompt)}</strong>`:''}</p>${q.kind==='choice'?`<h4>默认选项说明</h4><p class="section-description">练习中问法和选项位置可能变化；以下按默认顺序展示。</p><div class="question-options">${q.labels.map((label,index)=>`<div class="question-option"><strong>${index===0?'A':'B'}</strong><p>${esc(label)}</p>${index===q.correct?'<span class="outcome right">正确方案</span>':''}</div>`).join('')}</div><h4>判断依据</h4><p class="question-full-text">${esc(q.why)}</p>`:`<h4>参考思路</h4><p class="question-full-text">${esc(q.reference||'')}</p>`}${q.rule?`<h4>核心原则</h4><p class="question-full-text">${esc(q.rule)}</p>`:''}<h4>最近的作答用户</h4><p class="section-description">最多展示最近 50 次提交，点击用户可继续查看完整记录。</p><div class="table-wrap">${result.recentAnswers.length?`<table id="question-users-table"><thead><tr><th>用户</th><th>判定</th><th>提交时间</th></tr></thead><tbody>${result.recentAnswers.map(answer=>`<tr><td data-value="${esc(answer.label)}"><button class="user-link" data-detail-user="${answer.visitor}">${esc(answer.label)}</button></td><td data-value="${answer.correct===null?'':answer.correct?1:0}"><span class="outcome ${answer.correct===null?'ungraded':answer.correct?'right':'wrong'}">${answer.correct===null?'未判定':answer.correct?'答对':'答错'}</span></td><td data-value="${answer.ts}">${date(answer.ts)}</td></tr>`).join('')}</tbody></table>`:'<p class="empty-cell">本期尚无作答记录。</p>'}</div>`;
  enhanceTables($('#question-content'));$('#question-content').querySelectorAll('[data-detail-user]').forEach(button=>button.onclick=()=>openUser(button.dataset.detailUser));$('#question-status').textContent='';moveContent($('#question-content'),{duration:180});
 }catch(error){if(token===questionGeneration)$('#question-status').textContent=error.message}
}
$('#question-close').onclick=()=>closeDetail();
$('#detail-modal').addEventListener('close',()=>{detailGeneration++;questionGeneration++;selectedUser=null;$('#learner-detail').hidden=true;$('#question-detail').hidden=true;$('#transcripts').replaceChildren();$('#journeys').replaceChildren();$('#question-content').replaceChildren()});
$('#detail-modal').addEventListener('click',event=>{if(event.target!==$('#detail-modal'))return;const rect=$('#detail-modal').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDetail()});

$('#records-more').onclick=()=>{const count=$('#transcripts').querySelectorAll('li').length;recordPage=Math.floor(count/50);loadRecords(count===0)};
$('#detail-close').onclick=()=>closeDetail();
$('#chapter').onchange=()=>{renderQuestions();moveContent($('#questions'),{duration:150})};
$('#refresh').onclick=load;
$('#user-prev').onclick=()=>{userPage--;load()};$('#user-next').onclick=()=>{userPage++;load()};
$('#user-search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{userPage=0;load()},300)};
$('#logout').onclick=async()=>{generation++;detailGeneration++;try{await api('logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});gate();$('#pin-error').textContent='已退出。'}catch(error){$('#load-state').textContent=error.message}};
load();
