/* Browser acceptance for physical piano keys, feedback identity and avatar selection. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
let playwright;try{playwright=require('playwright')}catch{playwright=require('/Users/jojo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const base=process.env.CLASSROOM_URL||'http://127.0.0.1:8798/lilaoshi/',out=path.resolve(__dirname,'../.runtime/verification');
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await playwright.chromium.launch({headless:true,channel:'chrome'}),report=[];
 try{for(const width of [1440,390]){
  const ctx=await browser.newContext({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,colorScheme:'light',reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__tones=[];const API=window.AudioContext||window.webkitAudioContext;if(API){const create=API.prototype.createOscillator;API.prototype.createOscillator=function(){const osc=create.call(this),start=osc.start;osc.start=function(t){window.__tones.push(osc.frequency.value);return start.call(this,t)};return osc}}});
  await page.goto(base+'?qa=1');let previous=null;const expressions=[];
  for(let i=0;i<5;i++){
   if(i)await page.reload();await page.waitForFunction(()=>document.querySelector('link[rel="icon"]').href.includes('/icons/'));
   const icon=await page.locator('link[rel="icon"]').first().getAttribute('href'),image=await page.locator('header .brand-icon').getAttribute('src');
   const mood=icon.split('/').at(-1).replace('-32.png','');assert.notEqual(mood,previous);assert.ok(image.endsWith(mood+'-96.webp'));previous=mood;expressions.push(mood);
  }
  await page.locator('#feedback-trigger').click();await page.waitForFunction(()=>!document.querySelector('#feedback-uid').disabled);
  const uid=await page.locator('#feedback-uid-value').innerText();assert.equal(uid,await page.evaluate(()=>RefineMetrics.identity()));assert.ok(!((await page.locator('#feedback-panel').innerText()).includes('钉钉')));
  await page.locator('#feedback-wechat').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'yanghaoleng');
  await page.locator('#feedback-uid').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),uid);
  await page.screenshot({path:path.join(out,`feedback-${width}.png`)});await page.keyboard.press('Escape');
  await page.locator('[data-start]').click();await page.locator('[data-chapter="5"]').click({position:{x:20,y:20}});await page.waitForFunction(()=>screen==='lesson');await page.evaluate(()=>jumpQuestion(42));await page.waitForFunction(()=>activeQuestion().id===42);
  await page.locator('.keyboard-help-trigger').click();assert.equal(await page.locator('.mapping-key').count(),13);assert.equal(await page.locator('.keyboard-map').isVisible(),true);
  const mapping=[['a',60],['w',61],['s',62],['e',63],['d',64],['f',65],['t',66],['g',67],['y',68],['h',69],['u',70],['j',71],['k',72]];
  for(const [key,midi]of mapping){
   const before=await page.evaluate(()=>__tones.length);await page.keyboard.down(key);await page.waitForFunction(n=>__tones.length===n+3,before);const freq=await page.evaluate(n=>__tones[n],before);assert.ok(Math.abs(freq-440*2**((midi-69)/12))<.001);
   assert.equal(await page.locator(`button[data-midi="${midi}"].is-down`).count(),1);assert.equal(await page.locator(`[data-map-note="${midi}"].is-down`).count(),1);await page.keyboard.up(key);assert.equal(await page.locator('.piano-key.is-down').count(),0);
  }
  for(const key of ['a','d','g'])await page.keyboard.down(key);assert.equal(await page.locator('.piano-key.is-down').count(),3);await page.keyboard.up('a');assert.equal(await page.locator('.piano-key.is-down').count(),2);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await page.locator('.piano-key.is-down').count(),0);for(const key of ['d','g'])await page.keyboard.up(key);
  await page.locator('.keyboard-help-trigger').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('.keyboard-map').isVisible(),false);assert.equal(await page.locator('#training').evaluate(el=>el.open),true);await page.locator('.keyboard-help-trigger').click();
  const layout=await page.evaluate(()=>{const center=s=>{const r=document.querySelector(s).getBoundingClientRect();return r.left+r.width/2};return {width:innerWidth,scroll:document.documentElement.scrollWidth,tools:center('.music-tools'),piano:center('.piano-keyboard.interactive'),map:center('.keyboard-map')}});assert.ok(layout.scroll<=layout.width);assert.ok(Math.abs(layout.tools-layout.piano)<1);assert.ok(Math.abs(layout.tools-layout.map)<1);
  await page.screenshot({path:path.join(out,`keyboard-map-${width}.png`)});
  await page.locator('.keyboard-map-close').click();const answer=await page.evaluate(()=>activeQuestion().correct);await page.locator(`[data-option="${answer}"]`).click();await page.locator('#chat-input').waitFor({state:'visible'});await page.locator('#chat-input').focus();const before=await page.evaluate(()=>__tones.length);await page.keyboard.type('awsedftgyhujk');assert.equal(await page.evaluate(()=>__tones.length),before);
  assert.deepEqual(errors,[]);report.push({width,expressions,uidCopy:true,physicalKeys:13,chord:true,inputGuard:true,layout,errors});await ctx.close();
 }}finally{await browser.close()}
 await fs.writeFile(path.join(out,'widgets-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
