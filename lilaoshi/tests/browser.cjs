/* Local acceptance; AI is simulated for the 56-question walkthrough only. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/Users/jojo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const base=process.env.CLASSROOM_URL||'http://127.0.0.1:8798/lilaoshi/',out=path.resolve(__dirname,'../.runtime/verification');
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await playwright.chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce',colorScheme:'light'});
 const page=await context.newPage(),errors=[],report={modelMode:'simulated for walkthrough; real provider tested separately',chapters:[],checks:[]};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.route('**/api/review',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({reply:'你给出了具体的音乐依据，试着按这个顺序再练一遍。',correct:true,emotion:'approving'})}));
 await page.addInitScript(()=>{window.__tones=[];const API=window.AudioContext||window.webkitAudioContext;if(API){const create=API.prototype.createOscillator;API.prototype.createOscillator=function(){const osc=create.call(this),start=osc.start;osc.start=function(t){window.__tones.push({frequency:osc.frequency.value,start:t});return start.call(this,t)};return osc}}});
 await page.goto(base+'?qa=1');await page.waitForFunction(()=>typeof activeQuestion==='function');await page.screenshot({path:path.join(out,'home-desktop.png')});await page.locator('[data-start]').click();await page.waitForSelector('[data-chapter]');await page.screenshot({path:path.join(out,'chapters.png')});
 for(let chapter=0;chapter<7;chapter++){
  await page.locator(`[data-chapter="${chapter}"]`).click();await page.waitForFunction(ch=>screen==='lesson'&&activeQuestion().chapter===ch,chapter);
  let count=0,firstWrong=chapter===0;
  while(await page.evaluate(()=>screen==='lesson')){
   const q=await page.evaluate(()=>activeQuestion());
   if(q.id===40||q.id===41||q.id===42){await page.locator('.piano-explore summary').click();const key=page.locator('button[data-midi="60"]');await key.click();assert.equal(await page.locator('.piano-note-status').textContent(),'C4');await key.press('Enter');report.checks.push('piano C4 pointer and Enter');await page.screenshot({path:path.join(out,'piano-desktop.png')})}
   const listen=page.locator('[data-listen]').first();
   if(await listen.count()){
    await page.evaluate(()=>window.__tones=[]);await listen.click();assert.ok((await page.evaluate(()=>window.__tones.length))>0);await page.evaluate(()=>MusicClass.stop());
    const waves=await page.locator('.sound-wave i').count();if(waves)assert.ok(await page.locator('.sound-wave i').first().evaluate(el=>el.getBoundingClientRect().height>=6));
   }
   if(q.kind==='choice'){
    const pick=firstWrong?1-q.correct:q.correct;firstWrong=false;await page.locator(`[data-option="${pick}"]`).click();
   }else{
    await page.locator('#chat-input').fill('先保持稳定拍点，慢速分段练习，并把音高和时值分开检查，再连接完整乐句。');await page.locator('#chat-send').click();
   }
   await page.locator('#next').waitFor({state:'visible'});
   if(count===0&&chapter===0){await page.locator('#bookmark').click();await page.locator('#notebook-in').click();await page.locator('[data-note]').first().click();assert.ok(await page.locator('.note-question').isVisible());await page.keyboard.press('Escape');report.checks.push('bookmark, note detail, Escape')}
   await page.locator('#next').click();count++;
  }
  assert.equal(count,8);const score=await page.evaluate(()=>chapterScores[course.questions.find(q=>q.chapter===chapter).id]);assert.equal(score.passed,chapter!==0);report.chapters.push({chapter,count,score:score.percent??score.correct/score.total*100});
  if(chapter===0){await page.locator('#retry-chapter').click();await page.waitForFunction(()=>screen==='lesson');assert.equal(await page.evaluate(()=>runOrder.length),1);const q=await page.evaluate(()=>activeQuestion());await page.locator(`[data-option="${q.correct}"]`).click();await page.locator('#next').click();await page.waitForFunction(()=>screen==='result');assert.equal(await page.evaluate(()=>chapterScores[0].passed),true);report.checks.push('wrong-answer-only retry passes')}
  await page.locator('#exit').click();await page.waitForSelector('[data-chapter]');
 }
 // Reload, progress persistence, mobile and dark appearance.
 await page.reload();assert.equal(await page.evaluate(()=>Object.values(chapterScores).filter(s=>s.passed).length),7);report.checks.push('all chapter scores persisted after reload');
 const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',colorScheme:'light'}),mobile=await mobileContext.newPage();await mobile.goto(base+'?qa=1');await mobile.screenshot({path:path.join(out,'home-mobile.png')});await mobile.locator('[data-start]').click();await mobile.waitForSelector('[data-chapter]');await mobile.locator('[data-chapter="5"]').click({position:{x:20,y:20}});await mobile.waitForFunction(()=>screen==='lesson');await mobile.locator('.piano-explore summary').click();await mobile.screenshot({path:path.join(out,'piano-mobile.png')});assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.checks.push('390px mobile layout fits');
 await page.emulateMedia({colorScheme:'dark'});await page.reload();await page.screenshot({path:path.join(out,'home-dark.png')});report.checks.push('dark appearance');
 report.errors=errors;assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
