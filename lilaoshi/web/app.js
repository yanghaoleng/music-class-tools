const icon=name=>`<svg class="icon" aria-hidden="true" focusable="false"><use href="icons.svg#${name}"></use></svg>`;
const $=s=>document.querySelector(s);
const coachAssetImages=['assets/teacher-emotions.webp','assets/teacher-positive-emotions.webp','assets/teacher-cool-expressions.webp','assets/teacher-gaze.webp'].map(src=>{const image=new Image();image.src=src;return image});
const coachAssetsReady=Promise.allSettled(coachAssetImages.map(image=>image.decode()));
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}}
let notes=read('lilaoshi-notes',[]);if(!Array.isArray(notes))notes=[];window.RefineMetrics?.bookmarks?.(notes);
let progress=read('lilaoshi-course-v2',{});if(typeof progress!=='object'||Array.isArray(progress))progress={};
let chapterScores=read('lilaoshi-chapter-scores',{});if(!chapterScores||Array.isArray(chapterScores)||typeof chapterScores!=='object')chapterScores={};
let runOrder=[],runPosition=0,runVariants={},chapterBaseline={},runMode='full';
function activeQuestion(){return runVariants[current]||course?.questions[current]}
let course=null,current=0,chapter=0,selected=null,sessionAnswers={},screen='map',reviewController=null,reviewGeneration=0;
function persist(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
function updateCount(){for(const id of ['note-count','note-count-in']){const counter=$('#'+id);if(window.RefineText)window.RefineText.slots(counter,notes.length);else counter.textContent=notes.length;}for(const id of ['notes-open','notebook-in'])$('#'+id).setAttribute('aria-label',`我的笔记，${notes.length} 条收藏`)}updateCount();
function checkpoint(){return progress[current]||{}}
function saveProgress(patch){if(patch.messages)window.RefineMetrics?.conversation(activeQuestion(),patch.messages);progress[current]={...checkpoint(),...patch};syncBookmark();const ok=persist('lilaoshi-course-v2',progress);if(!ok&&$('#draft-storage'))$('#draft-storage').textContent='浏览器无法保存，离开前请复制内容';return ok}
function focusTitle(){$('#training').scrollTop=0;$('#exercise-title')?.focus({preventScroll:true})}
function stopReview(){window.MusicClass?.stop();window.RefineCharacters?.dispose();window.RefineSequence.cancel();reviewGeneration++;reviewController?.abort();reviewController=null;hideTyping()}
function transition(update){if($('#exercise').hasAttribute('aria-busy'))return;window.RefineGuide.hold();stopReview();window.RefineParticles?.dispose();return window.RefineMotion.swap($('#exercise'),update)}
function questionAnswered(id=current){return Object.hasOwn(sessionAnswers,id)||(runMode==='mistakes'&&!runOrder.includes(id)&&chapterBaseline[id]===1)}
function nextPendingQuestion(){return window.RefineRun.nextPending(runOrder,current,sessionAnswers)}
function updateRunProgress(){setExerciseProgress(runOrder.filter(id=>Object.hasOwn(sessionAnswers,id)).length,runOrder.length)}
function jumpQuestion(id){
 if(screen!=='lesson'||id===current||!course.questions.some(q=>q.id===id&&q.chapter===(course.chapters?.[chapter]?.id??chapter))||$('#exercise').hasAttribute('aria-busy'))return;
 transition(()=>{
  if(!runVariants[id]){const key=progress[id]?.contextKey||'base:01',split=key.lastIndexOf(':');runVariants[id]=window.RefineRun.resolve(course.questions[id],key.slice(0,split),key.slice(split+1).split('').map(Number))}
  current=id;const position=runOrder.indexOf(id);if(position!==-1)runPosition=position;selected=null;
  $('#exercise-catalog-popup').hidden=true;$('#exercise-catalog button').setAttribute('aria-expanded','false');render();
 });
}
function restoreChoiceAnswer(q){
 if(![0,1].includes(selected))selected=(sessionAnswers[current]??chapterBaseline[current])===1?q.correct:1-q.correct;
 $('.options').classList.add('answered');
 document.querySelectorAll('[data-option]').forEach(button=>{button.disabled=true;button.classList.toggle('selected',+button.dataset.option===selected);button.classList.toggle('correct',+button.dataset.option===q.correct)});
 const verdict=document.createElement('span');verdict.className=`option-verdict ${selected===q.correct?'is-correct':'is-incorrect'}`;verdict.setAttribute('role','img');verdict.setAttribute('aria-label',selected===q.correct?'答对了':'答错了');verdict.innerHTML=icon(selected===q.correct?'check':'xmark');verdict.style.animation='none';document.querySelector(`[data-option="${selected}"] .option-label`).append(verdict);
 $('#feedback-slot').innerHTML=`<div class="lesson-next">${nextButton()}</div><div id="discussion" hidden></div>`;openDiscussion(false,true);bindNext();revealConversation();
}
function catalogPoints(questions,navigate=false){return questions.map(q=>{const saved=navigate?(questionAnswered(q.id)?{done:true,correct:Object.hasOwn(sessionAnswers,q.id)?!!sessionAnswers[q.id]:chapterBaseline[q.id]===1}:{}):progress[q.id]||{},outcome=saved.correct===true?'correct':saved.correct===false?'incorrect':saved.done?'answered':'unanswered',label={correct:'答对',incorrect:'答错',answered:'已作答',unanswered:'未作答'}[outcome];return `<li class="catalog-point" data-question="${q.id}" data-complete="${!!saved.done}" data-outcome="${outcome}" aria-label="${esc(q.principle)}，${label}">${navigate?`<button type="button" class="catalog-jump" data-jump-question="${q.id}" ${q.id===current?'aria-current="step"':''}>${esc(q.principle)}</button>`:`<strong>${esc(q.principle)}</strong>`}</li>`}).join('')}
function updateExerciseCatalog(){const popup=$('#exercise-catalog-popup');if(!course||!popup)return;popup.innerHTML=`<ol>${catalogPoints(course.questions.filter(q=>q.chapter===(course.chapters?.[chapter]?.id??chapter)),screen==='lesson')}</ol>`;popup.setAttribute('aria-label',`${course.chapters[chapter].title}知识点目录`);popup.querySelectorAll('[data-jump-question]').forEach(button=>button.onclick=()=>jumpQuestion(+button.dataset.jumpQuestion))}
function setExerciseProgress(value=null,total=course?.questions.filter(q=>q.chapter===(course.chapters?.[chapter]?.id??chapter)).length||1){const bar=$('#exercise-progress'),wrapper=$('#exercise-catalog');bar.hidden=value===null;wrapper.hidden=value===null;if(value===null)return;bar.setAttribute('aria-valuenow',value);bar.setAttribute('aria-valuemax',total);bar.firstElementChild.style.transform=`scaleX(${value/total})`;updateExerciseCatalog();bindCatalogs()}
function chapterArt(index){return `<canvas class="chapter-illustration" data-particle-chapter="${index}" width="352" height="300" aria-hidden="true"></canvas>`}
function bindCatalogs(){document.querySelectorAll('.chapter-catalog').forEach(wrapper=>{const button=wrapper.querySelector('button'),popup=wrapper.querySelector('.catalog-popup');let timer;const hide=()=>{clearTimeout(timer);popup.hidden=true;button.setAttribute('aria-expanded','false')};const show=()=>{clearTimeout(timer);popup.hidden=false;button.setAttribute('aria-expanded','true');const rect=button.getBoundingClientRect(),height=popup.getBoundingClientRect().height;popup.style.left=Math.max(16,Math.min(rect.left,innerWidth-popup.offsetWidth-16))+'px';popup.style.top=Math.max(16,rect.bottom+10+height<innerHeight-16?rect.bottom+10:rect.top-height-10)+'px'};button.onpointerenter=show;button.onpointerleave=event=>{if(event.pointerType!=='touch')timer=setTimeout(hide,140)};popup.onpointerenter=()=>clearTimeout(timer);popup.onpointerleave=event=>{if(event.pointerType!=='touch')timer=setTimeout(hide,140)};button.onfocus=show;wrapper.onfocusout=event=>{if(!wrapper.contains(event.relatedTarget))hide()};button.onclick=show;wrapper.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide()}}})}
function showMap(){
 window.RefineMetrics?.stage?.('chapters',{action:screen==='map'?'start':'back_to_chapters'});
 navigationGeneration++;loadCourse().then(warmCourse).catch(()=>{});const menu=course||window.RefinePractice.menu;
 stopReview();stopCoachMood();setCoachGaze(null);screen='map';$('#coach-header').hidden=true;$('#exit').innerHTML=icon('arrow-left');$('#exit').setAttribute('aria-label','返回首页');setExerciseProgress();
 if(!$('#training').open||screen!=='map')return;
 $('#exercise').innerHTML=`<div class="course-map"><h2 id="exercise-title" class="sr-only" tabindex="-1">课程目录</h2><div class="course-chapters">${menu.chapters.map((ch,i)=>{const qs=menu.questions.filter(q=>q.chapter===ch.id),done=qs.filter(q=>progress[q.id]?.done).length,stored=chapterScores[qs[0].id],score=stored?{...stored,passed:stored.passed&&stored.total===qs.length}:null;return `${i===0||ch.track!==menu.chapters[i-1].track?`<h2 class="course-track-title">${esc(menu.tracks[ch.track].title)}</h2>`:''}<article class="course-chapter"><button class="chapter-entry" data-chapter="${i}" aria-label="${score?.passed?'已通过，从头练习':score?'从头练习':done?'重新练习':'开始练习'}${esc(ch.title)}"></button>${chapterArt(ch.id)}<div class="chapter-copy"><h3>${['一','二','三','四','五','六','七','八'][i]}、${ch.title}</h3><p>${ch.subtitle}</p><div class="chapter-catalog"><button class="catalog-trigger chapter-progress" aria-label="${esc(ch.title)}，已完成 ${done} / ${qs.length}，查看知识点" aria-expanded="false" aria-controls="catalog-${i}"><span class="chapter-progress-track"><span data-chapter-progress="${done/qs.length}"></span></span></button><div id="catalog-${i}" class="catalog-popup" role="region" aria-label="${ch.title}知识点目录" hidden><ol>${catalogPoints(qs)}</ol></div></div></div><div class="chapter-action">${score&&!score.passed?`<button class="chapter-arrow chapter-retry chapter-mistakes" data-mistakes="${i}" aria-label="消灭${esc(ch.title)}的 ${window.RefinePractice.prepare(qs,stored,progress).questions.length} 道错题">消灭错题（${window.RefinePractice.prepare(qs,stored,progress).questions.length}）</button>`:`<span class="chapter-arrow ${score?.passed?'chapter-passed':''}" aria-hidden="true">${score?.passed?icon('check'):icon('arrow-right')}</span>`}</div></article>`}).join('')}</div></div>`;
 document.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>transition(()=>begin(+b.dataset.chapter)));document.querySelectorAll('[data-mistakes]').forEach(b=>b.onclick=()=>transition(()=>begin(+b.dataset.mistakes,true)));document.querySelectorAll('[data-chapter-progress]').forEach(fill=>fill.style.transform=`scaleX(${fill.dataset.chapterProgress})`);bindCatalogs();requestAnimationFrame(()=>{if(screen==='map'&&$('#training').open)window.RefineParticles.mount($('#exercise'))});focusTitle();window.RefineGuide.map(window.RefinePractice.continueChapter(menu.chapters,menu.questions,chapterScores,progress,window.RefinePractice.lastChapterIndex(menu.chapters,read('lilaoshi-last-chapter',{}))));
}
/* Start quietly on the homepage; only a chosen chapter owns a visible wait. */
let courseRequest=null,navigationGeneration=0;
const illustrationImages=new Map(),backgroundChapters=new Map();
function loadCourse(){
 if(course)return Promise.resolve(course);if(courseRequest)return courseRequest;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 courseRequest=fetch('course.json',{signal:controller.signal}).then(response=>{if(!response.ok)throw Error('course unavailable');return response.json()}).then(data=>{course=data;return data}).catch(error=>{courseRequest=null;throw error}).finally(()=>clearTimeout(timer));
 return courseRequest;
}
function chapterAssets(index){const assets=new Set();for(const q of course.questions.filter(q=>q.chapter===(course.chapters?.[index]?.id??index)))for(const view of [q,...q.variants||[]])for(const v of view.visuals||[])for(const asset of [v.image,...(v.frames||[]).map(frame=>frame.image)].filter(Boolean))assets.add(asset);return [...assets]}
function loadIllustration(asset,urgent=false){
 const existing=illustrationImages.get(asset);if(existing){if(urgent)existing.image.fetchPriority='high';return existing.promise}
 const image=new Image();image.decoding='async';image.fetchPriority=urgent?'high':'low';
 const entry={image,ready:false,promise:null};illustrationImages.set(asset,entry);
 entry.promise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('image timeout')),15000);image.src=asset;image.decode().then(()=>{entry.ready=true;resolve()},reject).finally(()=>clearTimeout(timer))}).catch(error=>{illustrationImages.delete(asset);throw error});
 return entry.promise;
}
function preloadChapter(index,urgent=false){
 const assets=chapterAssets(index);
 if(urgent)return Promise.all(assets.map(asset=>loadIllustration(asset,true)));
 if(backgroundChapters.has(index))return backgroundChapters.get(index);
 const task=(async()=>{for(let i=0;i<assets.length;i+=3){await Promise.all(assets.slice(i,i+3).map(asset=>loadIllustration(asset)));await new Promise(resolve=>setTimeout(resolve,0))}})().catch(error=>{backgroundChapters.delete(index);throw error});backgroundChapters.set(index,task);return task;
}
async function warmCourse(){for(let index=0;index<course.chapters.length;index++){try{await preloadChapter(index)}catch{}}}
function showChapterLoading(index){
 $('#coach-header').hidden=false;$('#exercise').innerHTML=`<div class="chapter-loading" role="status"><span class="loading-spinner" aria-hidden="true"></span><span>正在准备${esc((course||window.RefinePractice.menu).chapters[index].title)}…</span></div>`;focusTitle();window.RefineGuide.home();
}
async function begin(index,mistakes=false){
 const token=++navigationGeneration;screen='loading';const waiting=setTimeout(()=>{if(token===navigationGeneration&&$('#training').open)showChapterLoading(index)},160);
 try{await loadCourse();await preloadChapter(index,true);if(token!==navigationGeneration||!$('#training').open)return;clearTimeout(waiting);
 chapter=index;persist('lilaoshi-last-chapter',{index,id:course.chapters[index].id});const all=course.questions.filter(q=>q.chapter===(course.chapters?.[index]?.id??index)),plan=window.RefinePractice.prepare(all,chapterScores[all[0].id],progress);
 runMode=mistakes&&plan.questions.length?'mistakes':'full';chapterBaseline=runMode==='mistakes'?plan.baseline:{};
 const questions=runMode==='mistakes'?plan.questions:all,run=window.RefineRun.create(questions,read('lilaoshi-last-run-'+all[0].id,{}));runOrder=run.order;runVariants=run.variants;runPosition=0;current=runOrder[0];persist('lilaoshi-last-run-'+all[0].id,run);selected=null;sessionAnswers={};screen='lesson';window.RefineMetrics?.start(all[0].id,all.map(q=>q.id));window.RefineMetrics?.stage?.('question',{q:current,chapter:course.chapters[chapter].id,mode:runMode,action:runMode==='mistakes'?'choose_mistakes':'choose_chapter'});render();
 }catch{if(token!==navigationGeneration||!$('#training').open)return;$('#exercise').innerHTML='<div class="chapter-loading" role="status"><span>本章暂时没有准备好。</span><button id="chapter-retry" class="secondary">重试</button></div>';$('#chapter-retry').onclick=()=>begin(index,mistakes)}finally{clearTimeout(waiting)}
}
document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>{window.RefineGuide.hold();$('#training').showModal();window.RefineGuide.raise();showMap()});
$('#exit').onclick=()=>{if(screen==='map'){window.RefineGuide.hold();stopReview();window.RefineMotion.closeDialog($('#training'))}else transition(showMap)};
$('#training').addEventListener('close',stopReview);
function sources(q){return q.sources?.length?`<div class="case-source">参考阅读：${q.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ${icon('arrow-up-right')}</a>`).join('')}<span>练习画面为原创示意，并非原站截图或原作复刻。</span></div>`:''}
function specimen(v){
 if(v.kind==='music')return window.MusicClass.render(v);
 if(v.kind==='character-study')return window.RefineCharacters.render(v);
 if(v.kind==='storyboard'||v.kind==='story-plan')return storySpecimen(v);
 if(v.kind==='ops')return operationsSpecimen(v);
 if(v.kind==='illustration')return `<figure class="specimen illustration"><img src="${esc(v.image)}" width="640" height="640" alt="${esc(v.alt)}" decoding="async">${v.title?`<figcaption>${esc(v.title)}</figcaption>`:''}</figure>`;
 const cls=esc(v.kind),lines=v.lines.map(esc);
 let content=lines.map(t=>`<p${v.kind.includes('placeholder')&&/^请输入/.test(t)?' class="field-placeholder"':''}>${t}</p>`).join('');
 if(v.kind.startsWith('menu'))content=lines.map(t=>`<div class="menu-row">${t.split('｜').map((x,i)=>`<span class="menu-part-${i}">${x}</span>`).join('')}</div>`).join('');
 if(v.kind.startsWith('status'))content=lines.map(t=>{const [name,status]=t.split('｜');return `<p class="status-row"><span>${name}</span><span class="status-marker ${status.includes('失败')||status==='红'?'failed':''}">${v.kind.includes('color-only')?'●':status}</span></p>`}).join('');
 if(v.kind.startsWith('chart'))content=`<div class="mini-chart ${v.kind.includes('truncated')?'axis-cut':''}"><div class="bar bar-a"><span>82</span></div><div class="bar bar-b"><span>84</span></div></div><div class="chart-key">活动 A　/　活动 B</div><p>${lines[2]}</p>`;
 return `<div class="specimen ${cls}"><div class="specimen-tag">${esc(v.tag)}</div><strong class="specimen-title">${esc(v.title)}</strong><div class="specimen-content">${content}</div></div>`
}
function activateQuestionContext(){
 const question=activeQuestion(),saved=progress[current]||{},key=question.contextKey||'base:01',oldKey=saved.contextKey||'base:01';
 if(key===oldKey)return;
 const archives={...saved.conversationArchives,[oldKey]:{messages:saved.messages||[],chatDraft:saved.chatDraft||'',openingVersion:saved.openingVersion}},restored=archives[key]||{};
 progress[current]={...saved,...restored,messages:restored.messages||[],chatDraft:restored.chatDraft||'',openingVersion:restored.openingVersion,contextKey:key,conversationArchives:archives};persist('lilaoshi-course-v2',progress);
}
function questionText(q){
 const brief=q.brief.trim();
 if(q.kind==='open'&&q.prompt?.trim())return `${esc(brief)} <strong>${esc(q.prompt.trim())}</strong>`;
 const sentences=brief.match(/[^。！？]+[。！？]?/g)||[brief],focus=sentences.pop();
 return `${esc(sentences.join(''))}<strong>${esc(focus)}</strong>`;
}
function presentQuestion(q,heading){
 // Input must remain usable even when a decorative animation cannot initialize.
 if(q.kind==='choice')document.querySelectorAll('[data-option]').forEach(button=>button.onclick=()=>answer(+button.dataset.option));
 const root=$('#exercise .options')||$('#exercise .open-case');let ready;
 try{ready=window.RefineMotion.assembleDesign(root,heading)}catch(error){for(const animation of root?.getAnimations?.({subtree:true})||[])animation.cancel();root?.removeAttribute('data-design-entering');console.error('Question presentation skipped',error)}
 Promise.resolve(ready).then(()=>{if(!heading.isConnected||screen!=='lesson'||!$('#training').open)return;window.MusicClass?.mount($('#exercise'));if(q.kind==='open')renderOpen(q)});
}
function render(){
 window.RefineMetrics?.stage?.('question',{q:current,chapter:course.chapters[chapter].id,mode:runMode,action:'next_question'});
 activateQuestionContext();screen='lesson';const q=activeQuestion(),ch=course.chapters[chapter];selected=questionAnswered()?checkpoint().choice??null:null;
 $('#coach-header').hidden=false;setCoachGaze(null);setCoachMood('curious');$('#exit').innerHTML=icon('arrow-left');$('#exit').setAttribute('aria-label','返回课程目录');updateRunProgress();
 $('#exercise').innerHTML=`<div class="lesson-stream"><section class="exercise-heading question-heading chat-message assistant" aria-label="李老师 的提问"><div class="chat-bubble question-bubble"><h2 id="exercise-title" tabindex="-1">${questionText(q)}</h2></div></section>${window.MusicClass?.controls(q)||''}${q.kind==='choice'?`<div class="options" aria-label="李老师 发来的两种音乐表达">${q.labels.map((label,i)=>`<button class="option" data-option="${i}" aria-label="选项 ${i?'B':'A'}：${esc(label)}"><div class="option-design">${q.visuals?.length?specimen(q.visuals[i]):sampleForQuestion(q,i)}</div><div class="option-label"><span class="letter">${i?'B':'A'}</span></div></button>`).join('')}</div>`:`<div class="open-case ${q.visuals.length>1?'case-pair':''}" aria-label="李老师 发来的音乐案例">${q.visuals.map(specimen).join('')}</div>`}<span id="bookmark-status" class="sr-only" role="status"></span><div id="feedback-slot" aria-live="polite"></div>${runPosition<runOrder.length-1&&!Object.hasOwn(sessionAnswers,current)?`<div class="lesson-skip"><button id="skip-question" class="skip-question" type="button" aria-label="暂时跳过这道题，稍后继续" title="移到本轮最后，稍后继续">跳过</button></div>`:''}</div>`;
 window.MusicClass.mount($('#exercise'),q);presentQuestion(q,$('#exercise .question-heading'));if(q.kind==='choice'&&questionAnswered())restoreChoiceAnswer(q);const skip=$('#skip-question');if(skip)skip.onclick=skipQuestion;positionControls();focusTitle();window.RefineGuide.home();
}
function skipQuestion(){
 if(screen!=='lesson'||Object.hasOwn(sessionAnswers,current)||runPosition>=runOrder.length-1||$('#exercise').hasAttribute('aria-busy'))return;
 const exercise=$('#exercise');exercise.inert=true;
 const task=transition(()=>{
  exercise.inert=false;
  const deferred=window.RefineRun.defer(runOrder,runPosition,sessionAnswers);if(!deferred)return;
  runOrder=deferred;current=runOrder[runPosition];selected=null;window.RefineMetrics?.stage?.('question',{q:current,chapter:course.chapters[chapter].id,mode:runMode,action:'skip_question'});
  const start=course.questions.find(q=>q.chapter===(course.chapters?.[chapter]?.id??chapter)).id;
  persist('lilaoshi-last-run-'+start,{order:runOrder,variants:runVariants});render();
 });
 Promise.resolve(task).finally(()=>{exercise.inert=false});
}
function recordAnswer(verdict,metricChoice=verdict){if(Object.hasOwn(sessionAnswers,current))return;sessionAnswers[current]=verdict;const skip=$('.lesson-skip');if(skip)skip.hidden=true;window.RefineMetrics?.send('answer',{q:current,choice:metricChoice});saveProgress({done:true,choice:activeQuestion().kind==='choice'?selected:verdict,correct:!!verdict});updateRunProgress()}
function nextButton(){return `<button id="bookmark" class="bookmark secondary" aria-label="收藏这道题" aria-pressed="false"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z"/></svg><span class="bookmark-label">收藏</span></button><button class="primary" id="next" aria-keyshortcuts="n" title="下一步">${runOrder.every(id=>id===current||Object.hasOwn(sessionAnswers,id))?'查看本章结果':'下一题'}<span>${icon('arrow-right')}</span></button>`}
function bindNext(){positionControls();$('#bookmark').onclick=toggleBookmark;updateBookmark();$('#next').onclick=()=>transition(()=>{const next=nextPendingQuestion();if(next===null)result();else{runPosition=runOrder.indexOf(next);current=next;selected=null;render()}})}
async function answer(i){
 if(selected!==null)return;setCoachGaze(null);window.RefineMotion.finishDesignBuild($('.options'));selected=i;const q=activeQuestion(),canonical=course.questions[current].correct;window.RefineMetrics?.mark?.('answer_choice',{option:i,correct:i===q.correct});recordAnswer(i===q.correct?1:0,i===q.correct?canonical:1-canonical);$('.options').classList.add('answered');
 document.querySelectorAll('[data-option]').forEach(b=>{b.disabled=true;b.classList.toggle('selected',+b.dataset.option===i);b.classList.toggle('correct',+b.dataset.option===q.correct)});
 const verdict=document.createElement('span');verdict.className=`option-verdict ${i===q.correct?'is-correct':'is-incorrect'}`;verdict.setAttribute('role','img');verdict.setAttribute('aria-label',i===q.correct?'答对了':'答错了');verdict.innerHTML=icon(i===q.correct?'check':'xmark');document.querySelector(`[data-option="${i}"] .option-label`).append(verdict);
 await window.RefineMotion.afterAnimations(verdict);if(!verdict.isConnected||screen!=='lesson'||$('#exercise').hasAttribute('aria-busy'))return;
 $('#feedback-slot').innerHTML=`<div class="lesson-next">${nextButton()}</div><div id="discussion" hidden></div>`;
 const restored=checkpoint().messages?.some(message=>message.role==='user');if(!restored)$('#feedback-slot').classList.add('feedback-sequence');openDiscussion(!restored,restored);bindNext();revealConversation();

}
function revealConversation(){const discussion=$('#discussion');requestAnimationFrame(()=>{if(discussion?.isConnected&&!discussion.hidden&&screen==='lesson'&&$('#training').open&&!$('#exercise').hasAttribute('aria-busy')){positionControls();window.RefineMotion.scrollConversation($('#training'),discussion,$('.training-chrome'),$('.lesson-next:not([hidden])'));window.RefineGuide.latest()}})}
function renderOpen(q){
 const saved=checkpoint();
 // Bring old submitted writing and its review into the same conversation.
 if(!saved.messages?.some(message=>message.role==='user')&&saved.done&&saved.draft){const messages=[...coachOpening(q),{role:'user',content:saved.draft}];if(saved.feedback)messages.push({role:'assistant',content:[...saved.feedback.strengths,...saved.feedback.gaps,saved.feedback.suggestion,saved.feedback.question].join('\n')});saveProgress({messages,openingVersion:5})}
 else if(!saved.chatDraft&&saved.draft&&!saved.done)saveProgress({chatDraft:saved.draft});
 const restored=checkpoint().messages?.some(message=>message.role==='user');
 $('#feedback-slot').innerHTML=`<div id="open-next" class="lesson-next" ${questionAnswered()?'':'hidden'}>${nextButton()}</div><div id="discussion" hidden></div>`;
 openDiscussion(false,restored);bindNext();const composer=$('#chat-form .chat-composer');composer.classList.toggle('awaiting-answer',!questionAnswered());animateMessage($('#chat-form'));revealConversation();
}
function chapterResultAction(passed,index,total,wrongCount){
 if(!passed)return {label:`消灭错题（${wrongCount}）`,chapter:index,mistakes:true};
 return index+1<total?{label:'学习下一章',chapter:index+1,mistakes:false}:{label:'返回课程目录',chapter:null,mistakes:false};
}
function result(){
 window.RefineMetrics?.stage?.('result',{chapter:course.chapters[chapter].id,mode:runMode,action:'view_result'});
 stopCoachMood();setCoachGaze(null);screen='result';$('#coach-header').hidden=false;if(runMode==='full')window.RefineMetrics?.send('complete');
 const qs=course.questions.filter(q=>q.chapter===(course.chapters?.[chapter]?.id??chapter)),combined=window.RefinePractice.merge(qs,chapterBaseline,sessionAnswers),score=window.RefineScores.calculate(qs,combined),review=qs.filter(q=>combined[q.id]!==1),opens=qs.filter(q=>q.kind==='open');
 if(score.complete){chapterScores[qs[0].id]={...score,answers:combined,date:new Date().toISOString()};persist('lilaoshi-chapter-scores',chapterScores)}
 setExerciseProgress(qs.length,qs.length);
 const action=chapterResultAction(score.passed,chapter,course.chapters.length,review.length);
 $('#exercise').innerHTML=`<div class="result" data-design-build><h2 id="exercise-title" class="sr-only" tabindex="-1">本章结果</h2><div id="result-score-line" class="result-score-line"><div id="result-score" class="result-count ${score.passed?'score-passed':''}" aria-label="${score.percent} 分">${score.percent}</div>${score.passed?`<span id="result-check" class="result-check" hidden aria-hidden="true">${icon('check')}</span>`:''}</div><section id="result-details" class="result-copy" hidden><span class="section-kicker">${esc(course.chapters[chapter].title)}</span><h3>${score.passed?'本章通过。':'只差这几道，继续就好。'}</h3><p>${score.correct} / ${score.total} 道题答对。<br>${score.passed?'本章题目全部答对。':`已答对的题目会保留，还有 ${review.length} 道错题。`}${opens.length?'简答题按 AI 对核心原则的判断计分。':''}</p>${review.length?`<p>再看看：${review.map(q=>esc(q.principle)).join('、')}。</p>`:''}<div class="result-actions"><button class="primary" id="retry-chapter">${esc(action.label)} ${icon('arrow-right')}</button></div></section></div>`;
 window.RefineText?.slots($('#result-score'),0);
 window.RefineSequence.settlement({score:$('#result-score'),stamp:$('#result-check'),scoreLine:$('#result-score-line'),details:$('#result-details'),updateScore:value=>window.RefineText?.slots($('#result-score'),value),value:score.percent,showDetails:()=>{animateMessage($('#result-details'));$('#result-details').querySelectorAll('h3,p').forEach(text=>window.RefineText?.text(text))}});
 $('#retry-chapter').onclick=()=>transition(()=>{if(action.chapter===null)showMap();else begin(action.chapter,action.mistakes)});focusTitle();window.RefineGuide.home();
}
function storySpecimen(v){
 if(v.kind==='story-plan')return `<div class="specimen story-plan"><div class="specimen-tag">${esc(v.tag)}</div><strong class="specimen-title">${esc(v.title)}</strong><ol class="story-beats">${v.lines.map(line=>`<li><i></i><span>${esc(line)}</span></li>`).join('')}</ol></div>`;
 return `<div class="specimen story-board"><div class="specimen-tag">${esc(v.tag)}</div><strong class="specimen-title">${esc(v.title)}</strong><div class="story-frames">${v.frames.map((f,i)=>`<figure><div class="story-frame-art">${f.image?`<img src="${esc(f.image)}" width="512" height="512" alt="${esc(f.alt)}${f.flip?'（镜像后方向反转）':''}" decoding="async" class="${f.flip?'frame-mirrored':''}">`:`<div class="legacy-shot">${esc(f.caption)}</div>`}</div><figcaption><span>${i+1}</span>${esc(f.caption)}</figcaption></figure>`).join('')}</div></div>`;
}
function operationsSpecimen(v){
 const book=`<svg viewBox="0 0 160 140" aria-hidden="true"><circle cx="83" cy="65" r="51" fill="currentColor" opacity=".12"/><path d="M29 41Q54 30 80 47Q106 30 131 41V111Q106 101 80 116Q54 101 29 111Z" fill="#fefbf0" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M80 47V116M43 57Q55 53 66 58M94 58Q107 53 118 57M43 73Q55 69 66 74M94 74Q107 69 118 73" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="120" cy="27" r="9" fill="currentColor"/><path d="M30 17L33 25L42 28L33 31L30 40L27 31L18 28L27 25Z" fill="currentColor"/></svg>`;
 return `<div class="ops-demo ${esc(v.appTheme||'daily')}"><div class="ops-appbar"><span>学习乐园</span><span>今天　发现</span></div><div class="ops-banner ops-${esc(v.variant)}"><div class="ops-art">${book}</div>${v.badges?`<div class="ops-badges">${v.badges.map(b=>`<span>${esc(b)}</span>`).join('')}</div>`:''}<strong class="ops-title">${esc(v.title)}</strong><p class="ops-subtitle">${esc(v.subtitle)}</p><div class="ops-cta">${esc(v.cta)} ${icon('arrow-right')}${v.gesture?'<span class="ops-pointer" aria-hidden="true">☝</span>':''}</div>${v.terms?`<p class="ops-terms ${v.tiny?'is-tiny':''}">${esc(v.terms)}</p>`:''}</div><div class="ops-under"><i></i><i></i><i></i></div></div>`;
}
function sampleForQuestion(q,i){return sample(course.questions[q.id],q.optionOrder?.[i]??i)}
function sample(q,i){if(q.type==='card')return `<div class="sample-card ${i===q.correct?'good':q.bad}"><div class="studio">LINJIAN DESIGN STUDIO</div><div><div class="name">陈默</div><div class="position">品牌设计师</div></div><div class="contact">hello@linjian.studio<br>138 **** 2026</div></div>`;if(q.type==='resource'||q.type==='offer'){const good=i===q.correct;const offer=q.type==='offer';return `<div class="resource-demo"><div class="app-bar"><b>生活灵感</b><span>附近　收藏</span></div><div class="resource-banner ${good?'':'loud'}"><strong>${offer?(good?'新客，来杯好咖啡。':'免费喝咖啡！'):(good?'周末，走慢一点。':'周末必去！立即出发！')}</strong><p>${offer?(good?'领 10 元咖啡券 · 满 30 元可用':'超值福利！限时抢！'):(good?'发现附近的 3 条散步路线':'发现宝藏路线！错过再等一年！')}</p><span>${offer?'去领券':'探索散步路线'} ${icon('arrow-right')}</span></div><div class="app-placeholder"><i></i><i></i><i></i></div></div>`}if(q.type==='path')return `<div class="path-sample"><div><small>用户看见</small>附近免费展览 ${icon('arrow-right')}</div><span>${icon('arrow-down')}</span><div><small>点击后抵达</small>${i===1?'附近免费展览列表 · 默认按距离排序':'品牌首页 · 商城 / 动态 / 会员 / 更多'}</div></div>`;return `<div class="path-sample"><div><small>给设计同事的反馈</small>${esc(q.labels[i])}</div><div><small>下一步</small>${i===1?'选出主利益，调整字号，再放回页面检验。':'设计师需要继续追问：「具体指哪里？」'}</div></div>`}
function noteForQuestion(){const key=activeQuestion()?.contextKey||'base:01';return notes.find(n=>n.questionId===current&&(n.contextKey||'base:01')===key)}
function syncBookmark(){const note=noteForQuestion();if(!note)return;Object.assign(note,{draft:checkpoint().draft||'',feedback:checkpoint().feedback||null,messages:checkpoint().messages||[],choice:checkpoint().choice});persist('lilaoshi-notes',notes);refreshNoteConversation(note)}
function updateBookmark(){const b=$('#bookmark');if(!b)return;const saved=!!noteForQuestion();b.setAttribute('aria-pressed',saved);b.setAttribute('aria-label',saved?'取消收藏':'收藏这道题');b.title=saved?'已收藏，点击取消':'收藏到我的笔记';b.querySelector('.bookmark-label').textContent=saved?'已收藏':'收藏'}
function toggleBookmark(event){const existing=noteForQuestion(),previous=notes.slice();if(existing)notes=notes.filter(n=>n!==existing);else{const q=activeQuestion();notes.push({questionId:current,contextKey:q.contextKey||'base:01',questionContext:q,choice:checkpoint().choice,title:q.title,topic:q.principle,brief:q.brief,date:new Date().toLocaleDateString('zh-CN'),draft:checkpoint().draft||'',feedback:checkpoint().feedback||null,messages:checkpoint().messages||[]})}if(!persist('lilaoshi-notes',notes)){notes=previous;$('#bookmark-status').textContent='浏览器无法保存，请先复制需要保留的内容。';return}window.RefineMetrics?.bookmarks?.(notes);window.RefineMetrics?.mark?.(existing?'remove_bookmark':'bookmark');updateBookmark();updateCount();$('#bookmark-status').textContent=existing?'已取消收藏':'已收藏到我的笔记';if(!existing)window.RefineMetrics?.send('note_saved');if(event.detail!==0)window.RefineMotion.bookmarkFeedback($('#bookmark .icon'),$('#note-count-in'))}
const coachEmotions=['neutral','happy','thinking','curious','surprised','encouraging','empathetic','confused','playful','delighted','approving','inspired','relieved','grateful','amused','cool','confident','mischievous'];
function conversationMarkup(messages){return messages.map(m=>`<div class="chat-message ${m.role}"><div class="chat-bubble">${typeof m.correct==='boolean'?`<span class="message-verdict ${m.correct?'is-correct':'is-incorrect'}" role="img" aria-label="${m.correct?'符合原则':'尚未符合原则'}">${icon(m.correct?'check':'xmark')}</span>`:''}<p>${m.role==='assistant'?window.RefineRichText.render(m.content):esc(m.content)}</p></div></div>`).join('')}
let coachMoodTimer=null,coachMoodAnchor='curious',coachMoodCurrent='curious',coachGazeDirection=null;
const coachMoodFamilies=[['neutral','curious','thinking'],['happy','delighted','approving','inspired','encouraging','grateful','amused','playful','cool','confident','mischievous'],['empathetic','relieved'],['confused','thinking','curious'],['surprised','curious','inspired']];
function stopCoachMood(){clearTimeout(coachMoodTimer);coachMoodTimer=null}
function drawCoachMood(mood){const avatar=$('#coach-avatar .coach-avatar');if(!avatar)return;coachMoodCurrent=mood;avatar.className=coachGazeDirection?`coach-avatar coach-emotion gaze-emotion emotion-look-${coachGazeDirection}`:`coach-avatar coach-emotion${coachEmotions.indexOf(mood)>=15?' cool-emotion':coachEmotions.indexOf(mood)>=9?' positive-emotion':''} emotion-${mood}`}
// Gaze is a temporary pointer reaction; conversation mood continues underneath it.
function optionGazeDirection(option){
 if(!option||option.disabled||!option.isConnected)return null;
 const parent=option.closest('.options');if(!parent||parent.hasAttribute('data-design-entering'))return null;
 const choices=[...parent.querySelectorAll('[data-option]')];if(choices.length!==2)return null;
 const [first,second]=choices.map(choice=>choice.getBoundingClientRect());
 if(!first.width||!second.width||Math.abs(first.top-second.top)>Math.min(first.height,second.height)*.25||first.right>second.left+2)return null;
 return choices.indexOf(option)===0?'left':choices.indexOf(option)===1?'right':null;
}
function setCoachGaze(direction){if(coachGazeDirection===direction)return;coachGazeDirection=direction;drawCoachMood(coachMoodCurrent)}
function scheduleCoachMood(){stopCoachMood();if(screen!=='lesson'||!$('#training').open||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;coachMoodTimer=setTimeout(()=>{const family=coachMoodFamilies.find(group=>group.includes(coachMoodAnchor))||coachMoodFamilies[0],alternatives=family.filter(mood=>mood!==coachMoodCurrent);drawCoachMood(alternatives[Math.floor(Math.random()*alternatives.length)]);scheduleCoachMood()},7000+Math.random()*1000)}
function setCoachMood(emotion='neutral'){coachMoodAnchor=coachEmotions.includes(emotion)?emotion:'neutral';drawCoachMood(coachMoodAnchor);scheduleCoachMood()}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCoachMood();else scheduleCoachMood()});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',scheduleCoachMood);


function animateMessage(element){element=element?.querySelector('.chat-bubble')||element;if(!element||matchMedia('(prefers-reduced-motion: reduce)').matches)return;element.animate([{opacity:0,transform:'translateY(9px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:240,easing:'cubic-bezier(.23,1,.32,1)'})}

function coachOpening(q){return (q.kind==='open'?[]:q.coachOpening).map(content=>({role:'assistant',content,emotion:'curious'}))}
function appendChat(message){const list=$('#chat-messages'),form=$('#chat-form'),rect=form?.getBoundingClientRect(),view=$('#training').getBoundingClientRect(),follow=rect&&rect.top>=view.top&&rect.bottom<=view.bottom+80;list.insertAdjacentHTML('beforeend',conversationMarkup([message]));animateMessage(list.lastElementChild);window.RefineText?.text(list.lastElementChild.querySelector('p'),{delay:typeof message.correct==='boolean'?300:0});if(message.role==='assistant'){setCoachMood(message.emotion);window.RefineGuide.latest()}if(follow)revealConversation()}
const chatComposerBindings=new Map();
function fitComposerHeight(input){
 if(!input)return;const previous=input.style.height;input.style.height='0px';
 const maximum=Math.max(88,Math.min(240,innerHeight*.35)),height=Math.max(34,Math.min(input.scrollHeight,maximum));input.style.height=height+'px';input.style.overflowY=input.scrollHeight>maximum?'auto':'hidden';
 if(previous!==input.style.height&&document.activeElement===input&&input.id==='chat-input')requestAnimationFrame(revealConversation);
}
function fitChatComposer(input){
 if(!input)return;const composer=input.closest('.chat-composer');
 if(composer){const measure=document.createElement('canvas').getContext('2d');measure.font=getComputedStyle(input).font;const width=Math.max(0,...input.value.split('\n').map(line=>measure.measureText(line).width));composer.style.setProperty('--composer-content',Math.ceil(width+90)+'px')}
 fitComposerHeight(input);
}
function bindChatComposer(input){
 if(!input)return;chatComposerBindings.get(input.id)?.disconnect();
 let width=-1;const observer=new ResizeObserver(entries=>{const next=entries[0].contentRect.width;if(Math.abs(next-width)>.5){width=next;fitComposerHeight(input)}});observer.observe(input);chatComposerBindings.set(input.id,observer);
 input.addEventListener('input',()=>fitChatComposer(input));
 input.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.shiftKey)return;event.preventDefault();
  if(event.isComposing||event.keyCode===229||input.disabled)return;
  const send=input.form?.querySelector('button[type="submit"],button:not([type])');if(send&&!send.disabled)input.form.requestSubmit();
 });fitChatComposer(input);
}
function updateSend(){const button=$('#chat-send'),input=$('#chat-input');if(!button||!input)return;button.disabled=!!reviewController||noteRequests.has(current)||!input.value.trim();const composer=input.closest('.chat-composer');composer.classList.toggle('answer-pending',!!reviewController||noteRequests.has(current));if(Object.hasOwn(sessionAnswers,current))composer.classList.remove('awaiting-answer');fitChatComposer(input)}
function openDiscussion(sequenced=false,instant=false){const box=$('#discussion');if(!box.hidden){$('#chat-input').focus();return}box.hidden=false;let messages=checkpoint().messages||[];const fresh=!messages.length;if(fresh||checkpoint().openingVersion!==5){const opening=coachOpening(activeQuestion());let priorOpening=0;while(priorOpening<2&&messages[priorOpening]?.role==='assistant')priorOpening++;messages=[...opening,...messages.slice(priorOpening)];saveProgress({messages,openingVersion:5})}box.innerHTML=`<section class="discussion" aria-label="和 李老师 聊聊"><div id="chat-messages" aria-live="polite"></div><form id="chat-form"><div class="chat-composer"><label for="chat-input" class="sr-only">给 李老师 发消息</label><textarea id="chat-input" rows="1" maxlength="2000" required autocomplete="off" placeholder="说说你的想法…"></textarea><button type="submit" id="chat-send" aria-label="发送消息" title="发送 · Enter" disabled>${icon('arrow-up')}</button></div><p id="chat-status" role="status"></p></form></section>`;const waitingForAnswer=activeQuestion().kind==='open'&&!questionAnswered();$('#chat-messages').innerHTML=conversationMarkup(waitingForAnswer?[]:checkpoint().messages||[]);setCoachMood(waitingForAnswer?'curious':(checkpoint().messages||[]).findLast(message=>message.role==='assistant')?.emotion);if(sequenced){window.RefineSequence.opening({messages:[...$('#chat-messages').children],form:$('#chat-form'),duration:message=>window.RefineText?.duration(message.textContent)||790,showMessage:message=>{animateMessage(message);const paragraph=message.querySelector('p');if(paragraph)window.RefineText?.text(paragraph)},onChange:revealConversation})}else if(!instant){if(fresh)animateMessage($('#chat-messages').lastElementChild);$('#chat-messages').querySelectorAll('p').forEach(paragraph=>window.RefineText?.text(paragraph))}$('#chat-input').value=checkpoint().chatDraft||'';$('#chat-input').oninput=()=>{saveProgress({chatDraft:$('#chat-input').value});updateSend()};bindChatComposer($('#chat-input'));$('#chat-form').onsubmit=sendChat;updateSend();}

async function sendChat(event){event.preventDefault();if(reviewController||noteRequests.has(current))return;const text=$('#chat-input').value.trim();if(!text)return;window.RefineMetrics?.mark?.(activeQuestion().kind==='open'&&!questionAnswered()?'submit_answer':'send_message');const message={role:'user',content:text},messages=[...(checkpoint().messages||[]),message];saveProgress({messages,chatDraft:''});$('#chat-input').value='';updateSend();appendChat(message);$('#chat-input').focus();await requestChat()}
function hideTyping(){$('#coach-typing')?.remove()}
function showTyping(){hideTyping();$('#chat-messages').insertAdjacentHTML('beforeend','<div id="coach-typing" class="chat-message assistant typing-message" role="status" aria-label="李老师 正在回复"><div class="chat-bubble"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div>');animateMessage($('#coach-typing'))}
async function requestChat(){if(reviewController||noteRequests.has(current))return;const messages=checkpoint().messages||[];if(messages.at(-1)?.role!=='user')return;const assess=activeQuestion().kind==='open'&&!questionAnswered(),generation=++reviewGeneration,questionId=current,controller=new AbortController();reviewController=controller;updateSend();const timer=setTimeout(()=>controller.abort(),48000);$('#chat-send').disabled=true;$('#chat-status').textContent='';showTyping();try{const response=await fetch('api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),tracking:window.RefineMetrics?.tracking(activeQuestion()),q:questionId,variant:activeQuestion().variantId||'base',optionOrder:activeQuestion().optionOrder||[0,1],mode:assess?'assessment':'chat',messages:messages.slice(-12),answer:messages.at(-1).content}),signal:controller.signal});const data=await response.json();if(generation!==reviewGeneration)return;if(!response.ok)throw Error(data.error||'暂时无法回复，请重试。');hideTyping();if(assess&&typeof data.correct!=='boolean')throw Error('这次判定没有完成，请重试。');const reply={id:data.messageId,role:'assistant',content:data.reply,emotion:coachEmotions.includes(data.emotion)?data.emotion:'neutral',...(assess?{correct:data.correct}:{})};saveProgress({messages:[...messages,reply]});appendChat(reply);if(assess){recordAnswer(data.correct?1:0);await window.RefineMotion.afterAnimations($('#chat-messages').lastElementChild.querySelector('.message-verdict'));if(generation!==reviewGeneration)return;$('#open-next').hidden=false;positionControls();revealConversation();}$('#chat-status').textContent=''}catch(error){if(generation!==reviewGeneration)return;hideTyping();$('#chat-status').textContent=(error.name==='AbortError'?'等待较久，请重试。':error.message)+' 你的消息已保留。';const retry=document.createElement('button');retry.type='button';retry.className='chat-invite';retry.textContent='重试';retry.onclick=requestChat;$('#chat-status').append(retry)}finally{clearTimeout(timer);if(generation===reviewGeneration){hideTyping();reviewController=null;updateSend()}}}
function legacyNoteBody(n){return `${n.brief?`<p>${esc(n.brief)}</p>`:''}${n.text?`<p>${esc(n.text)}</p>`:''}${n.draft?`<p>${esc(n.draft)}</p>`:''}${n.feedback?`<p>${esc([...n.feedback.strengths,...n.feedback.gaps,n.feedback.suggestion,n.feedback.question].join('\n'))}</p>`:''}${conversationMarkup(n.messages||[])}`}
let notesOpener=null,notesDetail=null,notesScroll=0;
const noteRequests=new Map();
function noteTitle(note){return note.topic&&note.title?`${note.topic}：${note.title}`:note.title||note.topic||'音乐笔记'}
function renderNotesIndex(returnIndex=null){notesDetail=null;$('#notes-back').hidden=true;$('#notebook').classList.remove('showing-note');$('#notebook-title').textContent='我的笔记';$('#notes-list').innerHTML=notes.length?`<ol class="notes-index">${notes.map((n,index)=>({n,index})).reverse().map(({n,index})=>`<li><button class="note-index-row" data-note="${index}"><span class="note-index-copy"><strong>${esc(noteTitle(n))}</strong></span><span class="note-index-meta"><small>${n.messages?.length||0} 条消息</small>${icon('nav-arrow-right')}</span></button></li>`).join('')}</ol>`:'<div class="empty">还没有收藏。<br>作答后点击「下一题」旁的书签，把题目和对话留在这里。</div>';document.querySelectorAll('[data-note]').forEach(button=>button.onclick=()=>{notesScroll=$('#notebook').scrollTop;renderNoteDetail(+button.dataset.note)});if(returnIndex!==null){$('#notebook').scrollTop=notesScroll;document.querySelector(`[data-note="${returnIndex}"]`)?.focus({preventScroll:true})}}
function renderNoteDetail(index){
 const note=notes[index];if(!note){renderNotesIndex();return}notesDetail=index;$('#notes-back').hidden=false;$('#notebook').classList.add('showing-note');$('#notebook-title').textContent=noteTitle(note);
 const q=note.questionContext||course?.questions.find(question=>question.id===note.questionId);
 $('#notes-list').innerHTML=`<article class="note-item note-detail">${q?fullNoteQuestion(q,note.choice??((note.contextKey||'base:01')===(progress[note.questionId]?.contextKey||'base:01')?progress[note.questionId]?.choice:undefined)):legacyNoteBody(note)}</article>${q?`<section class="note-discussion" aria-label="继续聊这道题"><div id="note-messages" aria-live="polite"></div><form id="note-chat-form"><div class="chat-composer"><label class="sr-only" for="note-chat-input">继续聊这道题</label><textarea id="note-chat-input" rows="1" maxlength="2000" required autocomplete="off" placeholder="继续聊聊这道题…"></textarea><button id="note-chat-send" type="submit" aria-label="发送消息" disabled>${icon('arrow-up')}</button></div><p id="note-chat-status" role="status"></p></form></section>`:''}`;
 window.MusicClass?.mount($('#notes-list'),q);
 $('#notes-back').onclick=()=>renderNotesIndex(index);$('#notebook').scrollTop=0;$('#notebook-title').focus({preventScroll:true});
 if(!q)return;
 if(!note.messages?.length){note.messages=coachOpening(q);storeNoteConversation(note)}
 refreshNoteConversation(note,false,true);$('#note-chat-input').value=note.chatDraft||'';
 $('#note-chat-input').oninput=()=>{note.chatDraft=$('#note-chat-input').value;persist('lilaoshi-notes',notes);updateNoteSend(note)};
 bindChatComposer($('#note-chat-input'));
 $('#note-chat-form').onsubmit=event=>{event.preventDefault();sendNoteChat(note)};updateNoteSend(note);
}
function fullNoteQuestion(q,choice){
 return `<section class="note-question"><p>${questionText(q)}</p></section>${window.MusicClass.controls(q)}${q.kind==='choice'?`<div class="note-designs">${q.labels.map((label,i)=>`<article class="note-option"><div class="option-design">${q.visuals?.length?specimen(q.visuals[i]):sampleForQuestion(q,i)}</div><div class="note-option-label"><span>${i?'B':'A'}</span>${choice===i?`<span class="note-choice-result ${i===q.correct?'is-correct':'is-incorrect'}" aria-label="你的选择${i===q.correct?'，答对':'，答错'}">${icon(i===q.correct?'check':'xmark')}<span>你的选择</span></span>`:''}</div></article>`).join('')}</div>`:`<div class="note-designs">${q.visuals.map(specimen).join('')}</div>`}`;
}
function noteIsVisible(note){return !$('#notebook').hidden&&notes[notesDetail]===note&&!!$('#note-messages')}
function storeNoteConversation(note){
 window.RefineMetrics?.conversation(note.questionContext||course?.questions[note.questionId],note.messages);
 // The notebook and the lesson share a question's single conversation history.
 const qid=note.questionId,key=note.contextKey||'base:01',saved=progress[qid]||{};if((saved.contextKey||'base:01')===key)progress[qid]={...saved,messages:note.messages,openingVersion:5};else progress[qid]={...saved,conversationArchives:{...saved.conversationArchives,[key]:{messages:note.messages,openingVersion:5}}};
 persist('lilaoshi-notes',notes);persist('lilaoshi-course-v2',progress);
 if(qid===current&&(activeQuestion()?.contextKey||'base:01')===(note.contextKey||'base:01')&&screen==='lesson'&&$('#chat-messages')){window.RefineGuide.home();$('#chat-messages').innerHTML=conversationMarkup(note.messages);window.RefineGuide.latest()}
}
function updateNoteSend(note){if(!noteIsVisible(note))return;const pending=noteRequests.has(note.questionId)||(reviewController&&current===note.questionId);$('#note-chat-send').disabled=!!pending||!$('#note-chat-input').value.trim();fitChatComposer($('#note-chat-input'))}
function refreshNoteConversation(note,follow=false,initial=false){
 if(!noteIsVisible(note))return;
 const panel=$('#notebook'),nearBottom=panel.scrollHeight-panel.scrollTop-panel.clientHeight<120;
 $('#note-messages').innerHTML=conversationMarkup(note.messages||[]);
 if(noteRequests.has(note.questionId))$('#note-messages').insertAdjacentHTML('beforeend','<div class="chat-message assistant typing-message" role="status" aria-label="李老师 正在回复"><div class="chat-bubble"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div>');
 if(!initial&&(follow||nearBottom))requestAnimationFrame(()=>{if(noteIsVisible(note))panel.scrollTo({top:panel.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})});
 updateNoteSend(note);
}
async function sendNoteChat(note,retry=false){
 const qid=note.questionId;if(noteRequests.has(qid)||(reviewController&&current===qid))return;
 const input=$('#note-chat-input'),text=input?.value.trim();if(!retry&&!text)return;
 if(!retry){window.RefineMetrics?.mark?.('send_note_message');note.messages=[...((progress[qid]?.contextKey||'base:01')===(note.contextKey||'base:01')?progress[qid]?.messages||note.messages||[]:note.messages||[]),{role:'user',content:text}];note.chatDraft='';input.value='';storeNoteConversation(note)}
 if(note.messages.at(-1)?.role!=='user')return;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),48000);noteRequests.set(qid,controller);updateSend();if(noteIsVisible(note))$('#note-chat-status').textContent='';refreshNoteConversation(note,true);
 try{
  const response=await fetch('api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),tracking:window.RefineMetrics?.tracking(note.questionContext||course?.questions[qid]),q:qid,variant:note.questionContext?.variantId||'base',optionOrder:note.questionContext?.optionOrder||[0,1],mode:'chat',messages:note.messages.slice(-12),answer:note.messages.at(-1).content}),signal:controller.signal});
  const data=await response.json();if(!response.ok)throw Error(data.error||'暂时无法回复，请重试。');
  note.messages=[...note.messages,{id:data.messageId,role:'assistant',content:data.reply,emotion:coachEmotions.includes(data.emotion)?data.emotion:'neutral'}];storeNoteConversation(note);
 }catch(error){if(noteIsVisible(note)){$('#note-chat-status').textContent=(error.name==='AbortError'?'等待较久，请重试。':error.message)+' 你的消息已保留。';const button=document.createElement('button');button.type='button';button.className='chat-invite';button.textContent='重试';button.onclick=()=>sendNoteChat(note,true);$('#note-chat-status').append(button)}}
 finally{clearTimeout(timer);noteRequests.delete(qid);refreshNoteConversation(note,true);updateSend()}
}
function positionControls(){const stream=$('#feedback-slot');if(!stream)return;const right=Math.max(16,innerWidth-stream.getBoundingClientRect().right)+'px';document.querySelectorAll('.lesson-next,.lesson-skip').forEach(control=>control.style.right=right)}
new ResizeObserver(positionControls).observe($('#exercise'));window.addEventListener('resize',positionControls);window.visualViewport?.addEventListener('resize',()=>{if(document.activeElement===$('#chat-input'))revealConversation()});
function positionNotes(){positionControls();revealConversation();if($('#notebook').hidden)return;if($('#home-notes-dialog').open){const top=document.querySelector('header').getBoundingClientRect().bottom+12;$('#home-notes-dialog').style.setProperty('--home-notes-top',top+'px');$('#notebook').dataset.presentation='popover';return}$('#notebook').dataset.presentation=getComputedStyle($('#notebook')).position==='sticky'?'sidebar':'popover';const anchor=$('#training').open?$('#notebook-in'):$('#notes-open'),rect=anchor.getBoundingClientRect();const top=Math.min(Math.max(rect.bottom+14,70),innerHeight-180);$('#notebook').style.setProperty('--notes-top',top+'px');$('#notebook').style.setProperty('--notes-right',Math.max(16,innerWidth-rect.right)+'px')}
function closeNotes(restoreFocus=true){if(!$('#notebook').hidden)window.RefineMetrics?.mark?.('close_notes');$('#notebook').hidden=true;if($('#home-notes-dialog').open)$('#home-notes-dialog').close();document.body.classList.remove('notes-visible','home-notes-open');positionControls();revealConversation();for(const id of ['notes-open','notebook-in'])$('#'+id).setAttribute('aria-expanded','false');if(restoreFocus&&notesOpener?.isConnected)notesOpener.focus({preventScroll:true})}
async function copyNoteUserId(id){
 const field=document.createElement('textarea'),focused=document.activeElement;
 field.value=id;field.readOnly=true;field.tabIndex=-1;field.style.cssText='position:fixed;opacity:0;pointer-events:none';$('#notebook').append(field);field.select();field.setSelectionRange(0,id.length);
 let copied=false;try{copied=document.execCommand('copy')}catch{}finally{field.remove();focused?.focus({preventScroll:true})}
 if(!copied)await navigator.clipboard.writeText(id);
}
async function updateNoteUserId(){
 const button=$('#notes-user-id'),id=await window.RefineMetrics?.identity();
 if(!id){button.textContent='用户 ID 暂不可用';button.disabled=true;return}
 button.textContent=`ID ${id}`;button.disabled=false;button.title=`复制用户 ID：${id}`;
 button.onclick=async()=>{try{await copyNoteUserId(id);window.RefineToast?.success('用户 ID 已复制')}catch{window.RefineToast?.error('复制失败，请再试一次')}};
}
async function openNotes(event){const button=event?.currentTarget;if(!$('#notebook').hidden&&button?.matches('#notes-open,#notebook-in')){closeNotes();return}if(!course){try{await loadCourse()}catch{}}syncBookmark();notesOpener=$('#training').open?$('#notebook-in'):$('#notes-open');($('#training').open?$('#training-workspace'):$('#home-notes-host')).append($('#notebook'));renderNotesIndex();updateNoteUserId();$('#notebook').hidden=false;if($('#training').open)document.body.classList.add('notes-visible');else{document.body.classList.add('home-notes-open');$('#home-notes-dialog').show()}for(const id of ['notes-open','notebook-in']){$('#'+id).setAttribute('aria-controls','notebook');$('#'+id).setAttribute('aria-expanded','true')}positionNotes();$('#notebook').scrollTop=0;$('#notebook-title').focus({preventScroll:true});if(!matchMedia('(prefers-reduced-motion: reduce)').matches)$('#notebook').animate([{opacity:0,translate:'0 -6px'},{opacity:1,translate:'0 0'}],{duration:200,easing:'cubic-bezier(.23,1,.32,1)'})}
$('#notes-open').onclick=openNotes;$('#notebook-in').onclick=openNotes;
$('#home-notes-dialog').addEventListener('cancel',event=>{event.preventDefault();closeNotes()});
$('#home-notes-dialog').addEventListener('click',event=>{if(event.target===$('#home-notes-dialog'))closeNotes()});
$('#training').addEventListener('cancel',()=>window.RefineGuide.hold());
$('#training').addEventListener('close',()=>{window.RefineMetrics?.stage?.('home',{action:'back_home'});navigationGeneration++;screen='map';window.RefineGuide.brand();stopCoachMood();window.RefineParticles?.dispose();closeNotes(false)});window.addEventListener('resize',positionNotes);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#notebook').hidden){event.preventDefault();event.stopImmediatePropagation();closeNotes()}},true);

document.addEventListener('keydown',event=>{
 if(event.defaultPrevented||event.repeat||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||event.key.toLowerCase()!=='n')return;
 if(event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return;
 if(screen!=='lesson'||!$('#training').open||event.target.closest('#notebook')||$('#exercise').hasAttribute('aria-busy'))return;
 const next=$('#next');if(!next||next.disabled||!next.getClientRects().length)return;
 event.preventDefault();next.click();
});

document.addEventListener('pointermove',event=>{
 if(!event.movementX&&!event.movementY)return;
 const option=event.target.closest('.option');
 setCoachGaze(event.pointerType==='mouse'&&screen==='lesson'?optionGazeDirection(option):null);
 if(option&&!option.parentElement.hasAttribute('data-design-entering'))option.classList.add('hover-ready');
});
document.addEventListener('pointerout',event=>{
 const option=event.target.closest('.option');
 if(option&&!option.contains(event.relatedTarget)){option.classList.remove('hover-ready');setCoachGaze(null)}
});

document.addEventListener('pointerdown',event=>{document.querySelectorAll('.chapter-catalog').forEach(wrapper=>{if(!wrapper.contains(event.target)){wrapper.querySelector('.catalog-popup').hidden=true;wrapper.querySelector('button').setAttribute('aria-expanded','false')}})});

// Reuse the same in-flight work when the user later opens the directory.
loadCourse().then(warmCourse).catch(()=>{});


window.addEventListener('resize',()=>setCoachGaze(null));
window.addEventListener('blur',()=>setCoachGaze(null));
document.addEventListener('visibilitychange',()=>{if(document.hidden)setCoachGaze(null)});

// A floating notebook owns its scroll chain, including when it has no overflow.
const notebookPanel=$('#notebook');
notebookPanel.addEventListener('wheel',event=>{if(notebookPanel.dataset.presentation!=='popover')return;event.stopPropagation();const atTop=notebookPanel.scrollTop<=0,atBottom=notebookPanel.scrollTop+notebookPanel.clientHeight>=notebookPanel.scrollHeight-1;if((event.deltaY<0&&atTop)||(event.deltaY>0&&atBottom))event.preventDefault()},{passive:false});
let notebookTouch=null;
notebookPanel.addEventListener('touchstart',event=>{notebookTouch=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null},{passive:true});
notebookPanel.addEventListener('touchmove',event=>{if(notebookPanel.dataset.presentation!=='popover'||!notebookTouch||event.touches.length!==1)return;const touch=event.touches[0],dy=notebookTouch.y-touch.clientY,dx=notebookTouch.x-touch.clientX;notebookTouch={x:touch.clientX,y:touch.clientY};if(Math.abs(dx)>Math.abs(dy))return;event.stopPropagation();const atTop=notebookPanel.scrollTop<=0,atBottom=notebookPanel.scrollTop+notebookPanel.clientHeight>=notebookPanel.scrollHeight-1;if((dy<0&&atTop)||(dy>0&&atBottom))event.preventDefault()},{passive:false});
notebookPanel.addEventListener('touchend',()=>{notebookTouch=null},{passive:true});
document.addEventListener('pointerdown',event=>{if(notebookPanel.hidden||notebookPanel.dataset.presentation!=='popover'||notebookPanel.contains(event.target)||event.target.closest('#notes-open,#notebook-in,.concept-popover'))return;closeNotes(false)});

window.MusicClass.current=activeQuestion;
