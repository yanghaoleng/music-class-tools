import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createDoc,COLORS} from '../src/model.mjs';
const d=createDoc('性能基准');d.bpm=120;d.bars=4;d.division=4;
d.tracks.push({...d.tracks[0],id:'pad',instrument:'pad'});
d.strokes=Array.from({length:30},(_,j)=>({id:'s'+j,track:j%2?'pad':d.tracks[0].id,color:COLORS[j%6],width:7,points:Array.from({length:400},(_,k)=>({x:.02+k/399*.96,y:.1+(.7*(j%9)/9)+.05*Math.sin(k/16+j)}))}));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const results=[];
try{for(const mode of ['full','no-visual-effects','audio-only','visual-only','paused']){
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 await context.addInitScript(({d})=>{localStorage.setItem('xianji.workspace.v1',JSON.stringify({draft:d,library:[]}));
 const Native=AudioContext;window.__audio=[];window.AudioContext=class extends Native{constructor(...a){super(...a);window.__audio.push(this);}};
 const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>raf(t=>{if(!window.__stopRAF)cb(t);});
 },{d});
 const page=await context.newPage(),cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Performance.enable');
 await page.goto(process.env.XIANJI_URL || 'http://127.0.0.1:5186/xianji/');await page.getByRole('button',{name:'暂停',exact:true}).waitFor();await page.waitForTimeout(1000);
 if(mode==='paused')await page.getByRole('button',{name:'暂停',exact:true}).click();
 if(mode==='visual-only')await page.evaluate(()=>window.__audio[0].suspend());
 if(mode==='no-visual-effects')await page.evaluate(()=>{document.querySelectorAll('[filter]').forEach(e=>e.removeAttribute('filter'));const s=document.createElement('style');s.textContent='*{filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';document.head.append(s);});
 if(mode==='audio-only')await page.evaluate(()=>{window.__stopRAF=true;document.querySelector('.canvas-stage').style.display='none';});
 const before=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const frames=await page.evaluate(()=>new Promise(resolve=>{const t=performance.now(),gaps=[];let last=t;const raf=window.__stopRAF?null:window.requestAnimationFrame;const probe=now=>{gaps.push(now-last);last=now;if(now-t<4000)raf(probe);else{gaps.sort((a,b)=>a-b);resolve({frames:gaps.length,p95:gaps[Math.floor(gaps.length*.95)],over50:gaps.filter(x=>x>50).length});}};if(raf)raf(probe);else setTimeout(()=>resolve({frames:0}),4000);}));
 const after=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const r={mode,...frames,mainThreadMs:Math.round((after.TaskDuration-before.TaskDuration)*1000),scriptMs:Math.round((after.ScriptDuration-before.ScriptDuration)*1000),layoutMs:Math.round((after.LayoutDuration-before.LayoutDuration)*1000),heapMB:Math.round(after.JSHeapUsedSize/1e6)};results.push(r);console.log(r);await context.close();
}}finally{await browser.close();}
await fs.mkdir('artifacts',{recursive:true});
await fs.writeFile('artifacts/perf-'+(process.env.PROFILE_LABEL || 'current').replace(/[^a-z0-9-]/gi,'')+'.json',JSON.stringify({device:'390×844, DPR3, Chrome CPU4x, 30 strokes × 400 points, 4 seconds',results},null,2));
