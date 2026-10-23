/* Original score diagrams and Web Audio exercises. Playback starts only on request. */
(()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const names=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
 const noteName=m=>names[m%12]+(Math.floor(m/12)-1);
 const computerKeys=[['a',60,1],['w',61,2],['s',62,3],['e',63,4],['d',64,5],['f',65,7],['t',66,8],['g',67,9],['y',68,10],['h',69,11],['u',70,12],['j',71,13],['k',72,15]];
 const keyNotes=new Map(computerKeys.map(([key,midi])=>['Key'+key.toUpperCase(),midi])),heldKeys=new Map();
 let audio=null,voices=new Set(),timers=new Set(),active=null,generation=0,widgetId=0;
 function context(){if(!audio){const API=window.AudioContext||window.webkitAudioContext;if(!API)throw Error('此浏览器暂不支持声音播放。');audio=new API()}return audio}
 function stop(){generation++;releaseKeys();for(const t of timers)clearTimeout(t);timers.clear();for(const v of voices){try{v.stop()}catch{}}voices.clear();if(active){active.classList.remove('is-playing');active.setAttribute('aria-pressed','false');active=null}document.querySelectorAll('.piano-key.is-down,.mapping-key.is-down').forEach(k=>k.classList.remove('is-down'))}
 function later(fn,ms){const id=setTimeout(()=>{timers.delete(id);fn()},ms);timers.add(id)}
 function tone(midi,start,duration,velocity=.7){
  const ctx=context(),fundamental=440*Math.pow(2,(midi-69)/12),gain=ctx.createGain();
  gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.19*velocity,start+.008);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,.045*velocity),start+Math.max(.04,duration*.65));gain.gain.exponentialRampToValueAtTime(.0001,start+duration+.09);gain.connect(ctx.destination);
  let remaining=3,released=false;const oscillators=[];
  for(const [multiple,level] of [[1,1],[2,.25],[3,.09]]){const osc=ctx.createOscillator(),harmonic=ctx.createGain();oscillators.push(osc);osc.type='sine';osc.frequency.value=fundamental*multiple;harmonic.gain.value=level;osc.connect(harmonic);harmonic.connect(gain);voices.add(osc);osc.onended=()=>{voices.delete(osc);osc.disconnect();harmonic.disconnect();if(--remaining===0)gain.disconnect()};osc.start(start);osc.stop(start+duration+.12)}
  return ()=>{if(released||remaining===0)return;released=true;const now=ctx.currentTime;if(gain.gain.cancelAndHoldAtTime)gain.gain.cancelAndHoldAtTime(now);else gain.gain.cancelScheduledValues(now);gain.gain.setTargetAtTime(.0001,now,.025);for(const osc of oscillators)try{osc.stop(now+.13)}catch{}};
 }
 function releaseKey(code){const held=heldKeys.get(code);if(!held)return;heldKeys.delete(code);held.release?.();held.key.classList.remove('is-down');held.map?.classList.remove('is-down')}
 function releaseKeys(){for(const code of heldKeys.keys())releaseKey(code)}
 async function play(v,button){
  const wasActive=active===button;stop();if(wasActive)return;
  try{
   const request=generation,ctx=context();await ctx.resume();if(request!==generation)return;if(ctx.state!=='running')throw Error('请再次点按试听，开启声音。');
   active=button;button.classList.add('is-playing');button.setAttribute('aria-pressed','true');const token=generation;
   const beat=60/(v.bpm||84),base=ctx.currentTime+.06;let elapsed=0;
   if(v.mode==='progression'){for(const group of v.groups||[]){for(const m of group)tone(m,base+elapsed,beat*1.7);elapsed+=beat*2}}
   else if(v.mode==='chord'){for(const m of v.notes||[])tone(m,base,beat*2);elapsed=beat*2}
   else for(const [i,m] of (v.notes||[]).entries()){const length=(v.durations?.[i]??1)*beat;if(m!==null)tone(m,base+elapsed,Math.max(.06,length*(v.articulation==='legato'?.99:.86)),v.velocity||.7);elapsed+=length}
   later(()=>{if(token===generation){button.classList.remove('is-playing');button.setAttribute('aria-pressed','false');active=null}},(elapsed+.25)*1000);
  }catch(error){stop();button.closest('.music-tools')?.querySelector('.music-audio-status')?.replaceChildren(document.createTextNode(error.message))}
 }
 function staff(v){
  const notes=v.notes||[],bass=v.clef==='bass',width=460,start=67,space=Math.min(45,338/Math.max(notes.length,1));
  const lines=[40,54,68,82,96].map(y=>`<path d="M18 ${y}H442"/>`).join('');
  const steps=[0,0,1,2,2,3,3,4,5,5,6,6];
  const glyphs=notes.map((m,i)=>{
   const x=v.mode==='chord'?220:start+i*space;
   if(m===null)return `<path d="M${x} 52l7 14-10 11 7 12-8 11" class="score-rest"/>`;
   const degree=(Math.floor(m/12)-1)*7+steps[m%12],reference=bass?18:30,y=96-(degree-reference)*7;
   const duration=v.durations?.[i]??1,whole=duration>=4,empty=duration>=2,down=y<68;
   const ledgers=[];if(y>=110)for(let k=110;k<=y;k+=14)ledgers.push(`<path d="M${x-12} ${k}h24"/>`);if(y<=26)for(let k=26;k>=y;k-=14)ledgers.push(`<path d="M${x-12} ${k}h24"/>`);
   const stem=whole?'':`<path d="M${x+(down?-7:7)} ${y}v${down?35:-35}" class="note-stem"/>`;
   const flag=duration<1?`<path d="M${x+(down?-7:7)} ${y+(down?35:-35)}q${down?-15:15} 10 3 22" class="note-stem"/>`:'';
   const accidental=[1,3,6,8,10].includes(m%12)?`<text x="${x-22}" y="${y+5}" class="score-accidental">${[3,8,10].includes(m%12)?'♭':'♯'}</text>`:'';
   return `${ledgers.join('')}${accidental}<ellipse cx="${x}" cy="${y}" rx="8" ry="5.5" transform="rotate(-18 ${x} ${y})" class="note-head ${empty?'empty':''}"/>${stem}${flag}${duration%1===.5&&duration>1?`<circle cx="${x+15}" cy="${y-3}" r="2" class="note-dot"/>`:''}${v.hideNames||v.mode==='chord'?'':`<text x="${x}" y="139" class="score-name">${escape(noteName(m))}</text>`}`;
  }).join('');
  return `<svg class="music-score" viewBox="0 0 ${width} 162" role="img" aria-label="${escape(v.title)}谱例"><g class="staff-lines">${lines}</g><text x="23" y="88" class="score-clef">${bass?'𝄢':'𝄞'}</text><g class="score-notes">${glyphs}</g>${v.mode==='chord'?`<text x="220" y="139" class="score-name">${notes.map(noteName).join(' · ')}</text>`:''}${v.mode==='phrase'?'<path d="M68 25Q220 -3 387 25" class="phrase-arc"/>':''}</svg>`;
 }
 function rhythm(v){
  let x=28;const duration=v.durations||[],total=duration.reduce((a,b)=>a+b,0)||4,unit=390/total;
  const parts=(v.notes||[]).map((m,i)=>{const d=duration[i]??1,cx=x+9;x+=d*unit;const text=m===null?'休止':d===4?'全音符':d===2?'二分':d===1.5?'附点四分':d===.5?'八分':'四分';return `<g><rect x="${cx-10}" y="22" width="${Math.max(15,d*unit-9)}" height="58" rx="7" class="rhythm-block ${m===null?'is-rest':''}"/><text x="${cx-1}" y="53" class="rhythm-duration">${d}</text><text x="${cx-1}" y="106" class="rhythm-name">${text}</text></g>`}).join('');
  return `<svg class="music-rhythm" viewBox="0 0 440 133" role="img" aria-label="${escape(duration.join('、'))}拍的节奏">${parts}</svg>`;
 }
 function keyboard(v,interactive=false){
  const min=interactive?60:48,max=interactive?72:72,white=[];for(let m=min;m<=max;m++)if(![1,3,6,8,10].includes(m%12))white.push(m);
  const width=100/white.length;let markup='';
  for(let m=min;m<=max;m++){
   const black=[1,3,6,8,10].includes(m%12),index=white.filter(n=>n<m).length,left=black?(index*width-width*.31):index*width;
   const highlight=!interactive&&(v.target?names[m%12]===v.target:(v.notes||[]).includes(m));
   const geometry=`data-key-left="${left}" data-key-width="${black?width*.62:width}"`;
   const label=interactive?names[m%12]:(v.hideNames||v.mode==='keygroup'?'':names[m%12]);
   markup+=interactive?`<button class="piano-key ${black?'black':'white'}" type="button" ${geometry} data-midi="${m}" aria-label="弹奏 ${escape(noteName(m))}"><span>${escape(label)}</span></button>`:`<span class="piano-key ${black?'black':'white'} ${highlight?'highlight':''}" ${geometry}><span>${escape(label)}</span></span>`;
  }
  return `<div class="piano-keyboard ${interactive?'interactive':''}" ${interactive?'role="group" aria-label="可弹奏的钢琴键盘，中央 C 到高八度 C"':'role="img" aria-label="键盘示意"'}>${markup}</div>`;
 }
 function render(v){
  let art='';
  if(['staff','scale','chord','phrase','fingering'].includes(v.mode))art=staff(v);
  if(['keyboard','keygroup'].includes(v.mode))art=keyboard(v);
  if(v.mode==='rhythm')art=rhythm(v);
  if(v.mode==='sound')art=`<div class="sound-wave" aria-hidden="true">${Array.from({length:28},(_,i)=>`<i data-wave="${Math.max(6,22+Math.sin(i*.8)*14+Math.cos(i*.39)*18)}"></i>`).join('')}</div>`;
  if(v.mode==='beats')art='<div class="music-beats"><i>1</i><i>2</i><i>3</i><i>4</i></div>';
  if(v.mode==='fingering')art+=`<div class="finger-numbers">${(v.fingers||[]).map(n=>`<span>${n}</span>`).join('')}</div>`;
  if(v.mode==='hands')art='<div class="hand-numbers"><span>1<small>拇指</small></span><span>2<small>食指</small></span><span>3<small>中指</small></span><span>4<small>无名指</small></span><span>5<small>小指</small></span></div>';
  if(v.mode==='progression')art=`<div class="chord-progression">${(v.groups||[]).map(g=>`<span>${g.map(m=>escape(noteName(m))).join(' · ')}</span>`).join('<i>→</i>')}</div>`;
  if(v.mode==='grand')art=`<div class="grand-staff">${staff({...v,clef:'treble'})}${staff({...v,clef:'bass'})}</div>`;
  if(v.mode==='coordination')art='<div class="coordination-row"><b>右手</b><span>●</span><span>●</span><span>●</span><span>●</span></div><div class="coordination-row"><b>左手</b><span class="held-note">● ━━━━━━━━━</span></div>';
  if(v.mode==='posture')art='<svg class="posture-drawing" viewBox="0 0 300 130" aria-hidden="true"><circle cx="105" cy="24" r="17"/><path d="M105 42v48h48l13 30M105 56l38 17h57M68 94h57M79 94v30M209 76v48M178 75h95M262 75v49"/></svg>';
  return `<div class="specimen music-specimen mode-${escape(v.mode)}"><strong class="music-specimen-title">${escape(v.title)}</strong>${art}<div class="music-specimen-lines">${(v.lines||[]).map(t=>`<p>${escape(t)}</p>`).join('')}</div></div>`;
 }
 function controls(q){
  const playables=(q.visuals||[]).map((v,i)=>({v,i})).filter(({v})=>v.notes?.some(n=>n!==null));
  const piano=q.chapter>=5;
  if(!playables.length&&!piano)return '';
  const helpId='piano-keyboard-map-'+(++widgetId);
  return `<section class="music-tools" aria-label="本题音乐体验"><div class="music-listen-row">${playables.map(({v,i})=>`<button type="button" class="listen-button" data-listen="${i}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg><span>${q.kind==='choice'?'试听 '+(i?'B':'A'):'听听这段音乐'}</span><i class="listen-bars" aria-hidden="true"><b></b><b></b><b></b></i></button>`).join('')}<span class="music-listen-hint">${playables.length?'可反复试听，再慢慢想':''}</span></div>${piano?`<div class="piano-widget"><details class="piano-explore"><summary>在琴键上试一试 <span>点按或按键发声</span></summary>${keyboard({},true)}<p class="piano-note-status" aria-live="polite">中央 C · 本课程记为 C4</p></details><button class="keyboard-help-trigger" type="button" aria-label="查看电脑键盘映射图" title="电脑键盘映射" aria-expanded="false" aria-controls="${helpId}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 15h10"/></svg></button><section id="${helpId}" class="keyboard-map" aria-label="电脑键盘映射图" hidden><div class="keyboard-map-heading"><strong>电脑键盘映射</strong><button type="button" class="keyboard-map-close" aria-label="关闭键盘映射图">×</button></div><div class="keyboard-map-keys">${computerKeys.map(([key,midi,column])=>`<span class="mapping-key ${[1,3,6,8,10].includes(midi%12)?'mapping-black':'mapping-white'}" data-map-note="${midi}" data-map-column="${column}"><kbd>${key.toUpperCase()}</kbd><small>${noteName(midi)}</small></span>`).join('')}</div><p>下排白键，上排黑键。可同时按键弹和弦。</p></section></div>`:''}<p class="music-audio-status" role="status"></p></section>`;
 }
 function layout(root){
  root?.querySelectorAll('[data-wave]').forEach(el=>el.style.setProperty('--wave',el.dataset.wave+'px'));
  root?.querySelectorAll('[data-key-left]').forEach(el=>{el.style.left=el.dataset.keyLeft+'%';el.style.width=el.dataset.keyWidth+'%'});
  root?.querySelectorAll('[data-map-column]').forEach(el=>el.style.gridColumn=el.dataset.mapColumn+' / span 2');
 }
 function mount(root,q=window.MusicClass.current?.()){
  layout(root);
  root.querySelectorAll('[data-listen]').forEach(button=>button.onclick=()=>{const v=q?.visuals?.[+button.dataset.listen];if(v)play(v,button)});
  root.querySelectorAll('.piano-widget').forEach(widget=>{
   const button=widget.querySelector('.keyboard-help-trigger'),map=widget.querySelector('.keyboard-map'),details=widget.querySelector('.piano-explore');
   const close=()=>{map.hidden=true;button.setAttribute('aria-expanded','false')};
   button.onclick=()=>{const open=map.hidden;map.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)details.open=true};
   widget.querySelector('.keyboard-map-close').onclick=()=>{close();button.focus({preventScroll:true})};
   widget.onkeydown=event=>{if(event.key==='Escape'&&!map.hidden){event.preventDefault();event.stopPropagation();close();button.focus({preventScroll:true})}};
   details.ontoggle=()=>{if(!details.open){releaseKeys();close()}};
  });
 }
 document.addEventListener('pointerdown',async event=>{
  const key=event.target.closest?.('button[data-midi]');if(!key)return;event.preventDefault();key.focus({preventScroll:true});
  try{const ctx=context();await ctx.resume();tone(+key.dataset.midi,ctx.currentTime+.01,.7);key.classList.add('is-down');key.closest('.piano-explore').querySelector('.piano-note-status').textContent=noteName(+key.dataset.midi);later(()=>key.classList.remove('is-down'),300)}catch{}
 });
 document.addEventListener('keydown',async event=>{
  if(event.defaultPrevented||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.target.isContentEditable||event.target.closest?.('input,textarea,select,[contenteditable],[role="textbox"]'))return;
  const focused=event.target.closest?.('button[data-midi]');
  if(focused&&['Enter',' '].includes(event.key)){event.preventDefault();try{const ctx=context();await ctx.resume();tone(+focused.dataset.midi,ctx.currentTime+.01,.7);focused.classList.add('is-down');focused.closest('.piano-explore').querySelector('.piano-note-status').textContent=noteName(+focused.dataset.midi);later(()=>focused.classList.remove('is-down'),300)}catch{}return}
  const code=event.code||'Key'+event.key.toUpperCase(),midi=keyNotes.get(code);if(midi===undefined||heldKeys.has(code))return;
  const notes=document.querySelector('#notebook:not([hidden])'),root=notes||document.querySelector('#training[open] #exercise');
  const piano=root?.querySelector('.piano-explore[open] .piano-keyboard.interactive');if(!piano?.getClientRects().length)return;
  const key=piano.querySelector(`[data-midi="${midi}"]`),map=piano.closest('.piano-widget').querySelector(`[data-map-note="${midi}"]`),held={key,map,release:null};
  event.preventDefault();heldKeys.set(code,held);key.classList.add('is-down');map?.classList.add('is-down');piano.closest('.piano-explore').querySelector('.piano-note-status').textContent=noteName(midi);
  try{const ctx=context();await ctx.resume();if(heldKeys.get(code)!==held)return;held.release=tone(midi,ctx.currentTime+.01,4)}catch{releaseKey(code)}
 });
 document.addEventListener('keyup',event=>releaseKey(event.code||'Key'+event.key.toUpperCase()));
 window.addEventListener?.('blur',stop);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
 window.MusicClass={render,controls,mount,layout,play,stop,noteName};
 layout(document.querySelector('.hero-art'));
})();
