import React,{useState,useEffect,useRef,useMemo} from 'react';
import {motion} from 'motion/react';
import {ArrowLeft,X,Play,Pause,Star,Microphone,Stop,DownloadSimple,Trash,ArrowCounterClockwise} from '@phosphor-icons/react';
import {noteName,fingering,arrangeWhistle,playNotes,preparePlayback,stopAudio,pauseAudio,resumeAudio,seekAudio,encodeNotes,decodeNotes,rhythmGrid,durationTicks} from './music';
import {FollowSession,listenMicrophone} from './practice';
import {nextNoteIndex} from './scoreNavigation';

export function Holes({midi,small=false,whistle=62}){
 const f=fingering(midi,whistle);
 return <div className={'finger '+(small?'small':'')} aria-label={midi==null?'休止':noteName(midi)+(f.oct?' 超吹':'')+' 指法'}>
  <span className="octave">{f.oct?'＋'.repeat(f.oct):' '}</span>
  {f.rest?<span className="rest">—</span>:f.holes?<div className="pipe">{f.holes.map((h,i)=><i key={i} className={h==='x'?'closed':h==='h'?'half':''}/>)}</div>:<span className="rest">待适配</span>}
 </div>;
}
const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export default function Score({tune,close,starred,toggle,onSave,onDelete}){
 const [notes,setNotes]=useState(tune.notes||[]),[title,setTitle]=useState(tune.title),[bpm,setBpm]=useState(96);
 const [density,setDensity]=useState(()=>{try{const saved=localStorage.getItem('ddp-score-density');return ['compact','standard','spacious'].includes(saved)?saved:'compact'}catch{return 'compact'}});
 useEffect(()=>{try{localStorage.setItem('ddp-score-density',density)}catch{}},[density]);
 const [whistle,setWhistle]=useState(62),[transpose,setTranspose]=useState(0),[soundOctave,setSoundOctave]=useState(12);
 const [edit,setEdit]=useState(false),[text,setText]=useState(encodeNotes(tune.notes||[],{integer:true})),[selected,setSelected]=useState(-1),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [playerOpen,setPlayerOpen]=useState(false),[playing,setPlaying]=useState(false),[paused,setPaused]=useState(false),[active,setActive]=useState(-1),[progress,setProgress]=useState(0),[skipRests,setSkipRests]=useState(true);
 const [following,setFollowing]=useState(false),[micPending,setMicPending]=useState(false),[targetIndex,setTargetIndex]=useState(-1),[matched,setMatched]=useState([]),[heard,setHeard]=useState(null),[report,setReport]=useState(null);
 const mic=useRef(null),micAbort=useRef(null),session=useRef(null),generation=useRef(0),hasMedia=useRef(false),startIndex=useRef(0),seekTime=useRef(null),playerRun=useRef(0),paper=useRef(null),mounted=useRef(true);
 const arrangement=useMemo(()=>arrangeWhistle(notes,whistle,transpose),[notes,whistle,transpose]);
 const displayed=arrangement.notes,grid=rhythmGrid(notes);
 const sounding=useMemo(()=>displayed.map(n=>({...n,midi:n.midi==null?null:n.midi+soundOctave})),[displayed,soundOctave]);
 const timeline=useMemo(()=>preparePlayback(sounding,bpm,{skipLongRests:skipRests}),[sounding,bpm,skipRests]);
 function endFollow(showReport=true){generation.current++;micAbort.current?.abort();micAbort.current=null;mic.current?.();mic.current=null;setMicPending(false);setFollowing(false);setHeard(null);setTargetIndex(-1);if(showReport&&session.current)setReport(session.current.result());session.current=null}
 function exitPlayer(){playerRun.current++;stopAudio();hasMedia.current=false;startIndex.current=0;seekTime.current=null;setPlayerOpen(false);setPlaying(false);setPaused(false);setActive(-1);setSelected(-1);setProgress(0)}
 useEffect(()=>{mounted.current=true;const previous=document.title;document.title=title+' · 洞洞谱';return()=>{mounted.current=false;generation.current++;micAbort.current?.abort();mic.current?.();stopAudio();document.title=previous}},[]);
 useEffect(()=>{exitPlayer();endFollow(false);setReport(null);setMatched([])},[bpm,whistle,transpose,soundOctave,skipRests,notes]);
 useEffect(()=>{const index=following?targetIndex:active;if(index>=0)paper.current?.querySelector(`[data-note="${index}"]`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'})},[targetIndex,active,following]);
 useEffect(()=>{const hide=()=>{if(document.hidden){if(session.current||micPending)endFollow();if(hasMedia.current){pauseAudio();setPlaying(false);setPaused(true)}}};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide)},[micPending]);
 async function play({restart=false}={}){
  if(following||micPending)endFollow();setPlayerOpen(true);setMessage('');setSelected(-1);
  if(restart){playerRun.current++;stopAudio();hasMedia.current=false;startIndex.current=0;seekTime.current=null;setProgress(0);setActive(-1)}
  if(playing&&!restart){pauseAudio();setPlaying(false);setPaused(true);return}
  try{
   if(hasMedia.current&&paused&&!restart){await resumeAudio();setPlaying(true);setPaused(false);return}
   if(startIndex.current>=sounding.length){startIndex.current=0;setProgress(0)}
   const run=++playerRun.current;
   setPlaying(true);setPaused(false);
   await playNotes(sounding,bpm,setActive,()=>{hasMedia.current=false;setPlaying(false);setPaused(false);startIndex.current=0;seekTime.current=null;setProgress(timeline.duration)},
    {title,skipLongRests:skipRests,startIndex:startIndex.current,startTime:seekTime.current??undefined,onProgress:setProgress,onError:setMessage});
   if(run===playerRun.current&&mounted.current&&timeline.events.length)hasMedia.current=true;
  }catch(e){hasMedia.current=false;setPlaying(false);setPaused(false);setMessage(e.code==='SCORE_TOO_LONG'?e.message:'无法开始试听，请再次点击并检查媒体音量。')}
 }
 function selectNote(index){
  setSelected(index);if(edit||following||micPending)return;
  playerRun.current++;stopAudio();hasMedia.current=false;setPlaying(false);setPaused(true);setPlayerOpen(true);setActive(index);
  startIndex.current=index+1;seekTime.current=null;
  setProgress(timeline.events.find(e=>e.index>index)?.start??timeline.duration);
 }
 function scrub(value){
  setProgress(value);setPlaying(false);setPaused(true);pauseAudio();
  if(hasMedia.current)seekAudio(value);else seekTime.current=value;
  const event=timeline.events.find(e=>value>=e.start&&value<e.end);setActive(event?.index??-1);setSelected(-1);
 }
 async function startFollow(){
  exitPlayer();setEdit(false);setReport(null);setMatched([]);setMessage('');
  const next=new FollowSession(displayed,bpm,{soundOctave,rhythmKnown:tune.rhythmKnown!==false&&tune.difficulty!=='待校正'});
  if(!next.target){setMessage('这份谱子没有可练习的音符。');return}
  session.current=next;setMicPending(true);const token=++generation.current;const controller=new AbortController();micAbort.current=controller;
  try{
   const stop=await listenMicrophone((pitch,time,error)=>{
    if(token!==generation.current||!mounted.current)return;
    if(error){endFollow();setMessage(error);return}
    setHeard(pitch?.midi??null);
    const result=next.feed(pitch?.midi??null,time);
    if(result){setMatched(next.hits.map(h=>h.index));setActive(result.hit.index);setTargetIndex(result.next?.index??-1);if(result.done)endFollow()}
   },{signal:controller.signal});
   if(token!==generation.current||!mounted.current){stop();return}
   mic.current=stop;setMicPending(false);setFollowing(true);setTargetIndex(next.target?.index??-1);
  }catch(e){if(token!==generation.current||!mounted.current)return;endFollow(false);setMessage(e.name==='NotAllowedError'?'麦克风权限未开启，请在浏览器中允许访问后重试。':e.name==='NotFoundError'?'没有找到麦克风，请连接设备后重试。':e.message||'无法使用麦克风，请重试。')}
 }
 function change(midi,duration){const next=notes.map((n,i)=>i===selected?{midi,duration}:n);setNotes(next);setText(encodeNotes(next,{integer:true}))}
 async function save(){setBusy(true);try{await onSave({...tune,title,notes:displayed.map(({midi,duration})=>({midi,duration}))});setMessage('已保存到我的曲谱')}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 useEffect(()=>{if(report)paper.current?.parentElement.querySelector('.practice-report')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'})},[report]);
 const lock=following||micPending;
 useEffect(()=>{
  const handle=e=>{
   if(e.defaultPrevented||e.isComposing||e.metaKey||e.ctrlKey||e.altKey||document.querySelector('[role="dialog"]'))return;
   if(e.key==='Escape'){if(!e.repeat){e.preventDefault();close()}return}
   if(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return;
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter'].includes(e.key))return;
   e.preventDefault();
   if(lock||e.repeat&&(e.key===' '||e.key==='Enter'))return;
   if(e.key===' '){void play();return}
   if(e.key==='Enter'){void play({restart:playing});return}
   const elements=[...(paper.current?.querySelectorAll('[data-note]')||[])];
   const index=nextNoteIndex(elements.map(el=>({top:el.offsetTop,left:el.offsetLeft})),selected>=0?selected:active,e.key);
   if(index<0)return;
   selectNote(index);elements[index]?.focus({preventScroll:true});
   elements[index]?.scrollIntoView({behavior:'instant',block:'nearest'});
  };
  document.addEventListener('keydown',handle);return()=>document.removeEventListener('keydown',handle);
 });
 return <motion.article className={'score-page '+(playerOpen||lock?'has-player':'')} data-density={density} role="main" aria-label={title+' 曲谱详情'} initial={{opacity:0,x:24}} animate={{opacity:1,x:0}} exit={{opacity:0,x:24}} transition={{duration:.24}}>
  <header className="score-header"><button className="icon-btn" aria-label="返回曲库" data-sfx="back" onClick={close}><ArrowLeft/></button><div><small>我的吹奏时光</small><h1>{title}</h1></div><button className={'star-text '+(starred?'is-star':'')} aria-label={starred?'取消收藏':'收藏曲谱'} onClick={()=>tune.id==='draft'?setEdit(true):toggle(tune.id)}><Star weight={starred?'fill':'regular'}/><span>{tune.id==='draft'?'另存':starred?'已收藏':'收藏'}</span></button></header>
  <div className="score-content">
   <div className="score-meta"><span>{tune.type} · {tune.key} · {tune.meter}</span><span>{notes.length} 音 · 哨笛演奏版</span></div>
   {tune.difficulty==='待校正'&&<p className="notice">识别初稿，尚未逐音核对。请试听、校正后保存；跟吹仅评估音准。</p>}
   <section className="score-toolbar" aria-label="演奏设置">
    <div className="score-modes"><button className="primary" disabled={!timeline.events.length} onClick={play}>{playing?<Pause/>:<Play weight="fill"/>}{playing?'暂停试听':paused?'继续试听':'试听旋律'}</button><button className={lock?'following-button':'practice-button'} disabled={edit} onClick={()=>lock?endFollow():startFollow()}>{lock?<Stop weight="fill"/>:<Microphone/>}{micPending?'取消开启':following?'停止并评分':'开始跟吹'}</button></div>
    <div className="score-config"><label>速度 <input disabled={lock} aria-label="演奏速度" type="range" min="40" max="180" step="1" value={bpm} onChange={e=>setBpm(+e.target.value)}/><b>{bpm}</b></label>
    <select disabled={lock} aria-label="哨笛调性" value={whistle} onChange={e=>setWhistle(+e.target.value)}><option value="62">D 调哨笛</option><option value="60">C 调哨笛</option></select>
    <select disabled={lock} aria-label="哨笛高低音型号" value={soundOctave} onChange={e=>setSoundOctave(+e.target.value)}><option value="12">高音哨笛（常用）</option><option value="0">低音哨笛</option></select>
    <select disabled={lock} aria-label="移调" value={transpose} onChange={e=>setTranspose(+e.target.value)}>{Array.from({length:25},(_,i)=>i-12).map(i=><option key={i} value={i}>{i===0?'原调':(i>0?'+':'')+i+' 半音'}</option>)}</select></div>
    <div className="playback-options"><label><input disabled={lock} type="checkbox" checked={skipRests} onChange={e=>setSkipRests(e.target.checked)}/>试听略过长空拍</label><span>{grid===1?'时值以整拍显示':`每拍 ${grid} 格，时值以整数格显示`}</span></div>
   </section>
   <div className="legend">● 按住　○ 放开　◐ 半孔　<span>＋ 超吹，高一个八度</span></div>
   <details className="blowing-help"><summary>怎么看高音和超吹？</summary><p>＋ 表示气流更快、更集中，吹出高一个八度。高音 D 使用打开最上孔的指法；变化音需要半孔或叉指，不同哨笛可能需要微调。</p><p>本页按哨笛记谱显示。常用高音哨笛实际发声高一个八度；低音哨笛按显示音高发声。请按你的型号选择，试听和跟吹会同步调整。</p><a href="https://learntinwhistle.com/resources/tin-whistle-fingering-charts/" target="_blank" rel="noreferrer">参考指法与超吹说明 ↗</a></details>
   {arrangement.adjusted>0&&<p className="notice">已适配常用的两个八度：{arrangement.folded>0?`${arrangement.adjusted} 个音做了八度调整，旋律走向可能与原曲不同`:`整首${arrangement.shift>0?'升高':'降低'} ${Math.abs(arrangement.shift)/12} 个八度`}，保留原调音级。调整的音标有 ↑8 / ↓8；试听与跟吹均按当前指法。原始音符保留在校正文本中。</p>}
   <section className={'follow-panel '+(lock?'is-listening':'')} aria-label="跟吹模式">
    <div><b>{micPending?'正在申请麦克风权限…':following?`跟吹中 · 下一个是第 ${targetIndex+1} 音`:'吹准一音，再前进一步'}</b><p>{following?`已完成 ${matched.length} / ${session.current?.targets.length||0} 音 · ${heard==null?'等待声音':`听到 ${noteName(Math.round(heard))}，目标 ${noteName(session.current?.target?.midi)}`}`:'安静环境下单独吹奏，持续吹准约 0.1 秒即可前进。相同音连奏需轻吐或短暂换气。'}</p></div>
    {following&&<span className="listening-dot" aria-label="麦克风正在使用"/>}
    <small>仅在本机分析，不上传、不保存录音。节奏按 {bpm} BPM 的起音间隔评分；跟吹保留谱中休止。</small>
   </section>
   {report&&<section className="practice-report" aria-label="跟吹评分" role="status"><div><h2>{report.completed===report.total?'这一遍，吹完啦':'这次练习已结束'}</h2><span>完成 {report.completed} / {report.total} 音{report.completed<report.total?' · 以下是已练部分的分数':''}</span></div><div className="practice-metrics">{[['练习得分',report.score],['音准',report.pitch],['节奏',report.rhythm]].map(([label,value])=><div key={label}><strong>{value??'—'}</strong><small>{label}</small></div>)}</div><p>{report.pitch==null?'还没有识别到稳定音高，吹响后再试一次。':report.rhythm==null?'节奏评分需要至少吹中两个音，且曲谱节奏已确认。':'音准占 60%，节奏占 40%。节奏比较相邻正确音的起音间隔，分数供练习参考。'}</p><button onClick={startFollow}><ArrowCounterClockwise/>再吹一遍</button></section>}
   {tune.id.startsWith('nas-')&&<details className="original-score"><summary>查看 NAS 原谱 · 逐音核对</summary><img loading="lazy" src={'/ddp/api/nas/image/'+tune.id} alt={title+' 原始洞洞谱'}/></details>}
   <p className="score-shortcuts" aria-label="键盘快捷键"><span><kbd>Esc</kbd> 返回</span><span><kbd>←</kbd><kbd>→</kbd> 前后音符</span><span><kbd>↑</kbd><kbd>↓</kbd> 上下一行</span><span><kbd>空格</kbd> 播放 / 暂停</span><span><kbd>Enter</kbd> 继续 · 播放中再按从头播放</span></p>
   <div className="score-density-bar"><span>谱面密度</span><div className="density-switch" role="group" aria-label="谱面排列密度">{[['compact','紧凑'],['standard','标准'],['spacious','宽松']].map(([id,label])=><button key={id} type="button" aria-pressed={density===id} data-sfx="select" onClick={()=>setDensity(id)}><span className={'density-glyph density-glyph--'+id} aria-hidden="true">{Array.from({length:3},(_,i)=><i key={i}/>)}</span>{label}</button>)}</div></div>
   <div className="score-paper" ref={paper}>{displayed.map((n,i)=><button key={i} data-note={i} disabled={lock} aria-label={`第 ${i+1} 音 ${noteName(n.midi)}${n.octaveShift?' 八度已适配':''}`} aria-current={targetIndex===i?'step':undefined} className={'note '+(active===i?'sounding ':'')+(selected===i?'selected ':'')+(targetIndex===i?'follow-target ':'')+(matched.includes(i)?'matched':'')} onClick={()=>selectNote(i)}><span className="note-name">{noteName(n.midi)}</span><Holes midi={n.midi} whistle={whistle}/><span className="duration">{durationTicks(n.duration,grid)} {grid===1?'拍':'格'}</span><small className="octave-adjust">{n.octaveShift?`${n.octaveShift>0?'↑':'↓'}${Math.abs(n.octaveShift)===12?'8':Math.abs(n.octaveShift)/12+'×8'}`:' '}</small>{matched.includes(i)&&<span className="matched-check">✓</span>}</button>)}</div>
   <div className="score-actions"><button disabled={lock} onClick={()=>{exitPlayer();setEdit(!edit)}}>{edit?'收起校正':'校正 / 另存'}</button><button onClick={()=>window.print()}><DownloadSimple/>打印 / PDF</button>{(tune.id.startsWith('p-')||tune.id.startsWith('nas-'))&&<button disabled={lock} className="danger" onClick={()=>onDelete(tune.id)}><Trash/>删除私谱</button>}</div>
   {edit&&<section className="editor"><label>曲名<input value={title} maxLength={100} onChange={e=>setTitle(e.target.value)}/></label>{selected>=0&&notes[selected]&&<div className="inline-editor"><span>第 {selected+1} 音 · 原始音高</span><select aria-label="音高" value={notes[selected].midi??'rest'} onChange={e=>change(e.target.value==='rest'?null:+e.target.value,notes[selected].duration)}><option value="rest">休止</option>{Array.from({length:65},(_,i)=>i+36).map(m=><option key={m} value={m}>{noteName(m)}</option>)}</select><input aria-label="音符时值" type="number" min="1" max={16*grid} step="1" value={durationTicks(notes[selected].duration,grid)} onChange={e=>{if(+e.target.value>0)change(notes[selected].midi,Math.max(1,Math.round(+e.target.value))/grid)}}/><button onClick={()=>{const next=notes.filter((_,i)=>i!==selected);setNotes(next);setText(encodeNotes(next,{integer:true}));setSelected(-1)}}>删除此音</button></div>}<label>原始纯文本音符<textarea spellCheck="false" rows={5} value={text} onChange={e=>setText(e.target.value)}/></label><small>DDP/1 整数格式：@ticks 指定每拍格数，D4:2 表示 D4 两格，R:1 表示休止一格。另存会保存当前适配后的演奏版。</small><button onClick={()=>{try{setNotes(decodeNotes(text));setSelected(-1);setMessage('已更新预览')}catch(e){setMessage(e.message)}}}>应用文本到预览</button><button className="primary" disabled={busy||!notes.length} onClick={save}>{busy?'正在保存…':'保存为我的曲谱'}</button></section>}
   <p role="status" className="status">{message}</p><p className="source">{tune.sourceUrl?<a href={tune.sourceUrl} target="_blank" rel="noreferrer">{tune.source} ↗</a>:tune.source}</p>{tune.rhythmKnown===false&&<p className="notice">节奏尚未确认；试听使用参考时值，不代表原曲节奏，跟吹不评节奏。</p>}
  </div>
  {lock&&<aside className="score-dock follow-dock" aria-label="跟吹控制条"><div className="dock-inner"><Microphone size={26}/><div className="dock-track"><b>{micPending?'等待麦克风授权':`目标：第 ${targetIndex+1} 音 ${noteName(displayed[targetIndex]?.midi)}`}</b><small>{micPending?'可随时取消':`已吹准 ${matched.length} 音 · ${heard==null?'等待声音':`听到 ${noteName(Math.round(heard))}`}`}</small></div><button className="following-button" onClick={()=>endFollow()}><Stop weight="fill"/>{micPending?'取消':'停止评分'}</button></div></aside>}
  {playerOpen&&<motion.aside className="score-dock" aria-label="试听播放器" initial={{y:100,opacity:0}} animate={{y:0,opacity:1}} transition={{type:'spring',stiffness:380,damping:29}}><div className="dock-inner"><button className="dock-play primary" aria-label={playing?'暂停':'继续播放'} onClick={play}>{playing?<Pause weight="fill"/>:<Play weight="fill"/>}</button><div className="dock-track"><b>{title}</b><small>{playing?'正在试听':paused&&selected>=0?`已停在第 ${selected+1} 音 · 继续将从下一音开始`:paused?'已暂停':'试听已结束 · 可重新播放'}</small><div><span>{clock(progress)}</span><input aria-label="试听进度" type="range" min="0" max={timeline.duration||1} step="0.05" value={Math.min(progress,timeline.duration)} onChange={e=>scrub(+e.target.value)}/><span>{clock(timeline.duration)}</span></div></div><button className="icon-btn" aria-label="关闭播放器并退出试听" data-sfx="close" onClick={exitPlayer}><X/></button></div></motion.aside>}
 </motion.article>;
}
