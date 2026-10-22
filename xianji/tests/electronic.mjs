const strokeCount = async page => Number(await page.locator(".music-canvas").getAttribute("data-stroke-count"));
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(process.env.XIANJI_URL || 'http://127.0.0.1:5186/xianji/');
 await page.getByRole('button',{name:'画笔与音色',exact:true}).click();
 await page.locator('.dock-panel').waitFor();
 assert.equal(await page.getByRole('dialog').count(),0);
 assert.equal(await page.locator('.workbench').getAttribute('inert'),null);
 assert.equal(await page.locator('.instrument-grid button').count(),12);
 assert.equal(await page.locator('.instrument-grid img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)),true);
 await page.getByRole('button',{name:'低沉底鼓 厚实低频，短促有力',exact:true}).click();
 const box=await page.locator('.music-canvas').boundingBox();
 assert.equal(box.width,1056);
 await page.mouse.move(box.width*.12,500);await page.mouse.down();await page.mouse.move(box.width*.85,420,{steps:24});await page.mouse.up();
 assert.equal(await strokeCount(page),1);
 await page.keyboard.press('e'); assert.equal(await page.getByRole('button',{name:'橡皮擦 (E)',exact:true}).getAttribute('aria-pressed'),'true');
 await page.keyboard.press('b');assert.equal(await page.getByRole('button',{name:'画笔 (B)',exact:true}).getAttribute('aria-pressed'),'true');
 await page.keyboard.press('Space'); assert.equal(await page.getByRole('button',{name:'播放',exact:true}).count(),1);
 await page.keyboard.press('Space');
 await fs.mkdir('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/electronic-sidebar.png'});
 await page.keyboard.press('c');await page.locator('.dock-panel').waitFor({state:'detached'});
 assert.equal((await page.locator('.music-canvas').boundingBox()).width,1440);
 await page.keyboard.press('c');await page.locator('.dock-panel').waitFor();
 await page.setViewportSize({width:390,height:844});
 await page.locator('.dock-panel').waitFor({state:'detached'});
 await page.getByRole('button',{name:'画笔与音色',exact:true}).click();await page.getByRole('dialog').waitFor();
 assert.equal(await page.locator('.workbench').getAttribute('inert'),'');
 await page.waitForTimeout(400);await page.screenshot({path:'artifacts/electronic-mobile.png'});
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 const sounds=await page.evaluate(async()=>{
  const {INSTRUMENTS}=await import('/xianji/src/model.mjs');
  const {SYNTHS,scheduleStep}=await import('/xianji/src/synth.mjs');
  const results=[];
  for(const i of INSTRUMENTS){
   const rate=22050,ctx=new OfflineAudioContext(1,rate*4,rate),bank=new Map();
   let count=0;const create=ctx.createOscillator.bind(ctx);ctx.createOscillator=()=>{count++;return create();};
   let initialCount=0;for(let step=0;step<16;step++){scheduleStep(ctx,ctx.destination,[{midi:60+step%3,instrument:i.id,volume:.7,stroke:'line'}],step*.1,.098,step,bank);if(step===0)initialCount=count;}
   const buffer=await ctx.startRendering(),data=buffer.getChannelData(0);
   const rms=(start,end)=>{const a=data.slice(start*rate,end*rate);return Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length);};
   results.push({id:i.id,count,expected:initialCount,continuous:!!i.continuous,rms:rms(.4,1.5),tail:rms(3.6,3.9),minWindow:Math.min(...Array.from({length:11},(_,n)=>rms(.4+n*.1,.42+n*.1)))});
  }return results;
 });
 for(const s of sounds){assert.ok(s.rms>.001,`${s.id} audible`);assert.ok(s.tail<.0002,`${s.id} releases`);if(s.continuous){assert.equal(s.count,s.expected,`${s.id} reuses oscillator phase across 16 notes`);assert.ok(s.minWindow>.001,`${s.id} has no gaps`);}}
 console.log('PASS 12 instruments audible; 6 legato voices retain phase, have no gaps and release fully');
 assert.deepEqual(errors,[]);console.log('PASS wide nonblocking inspector, canvas drawing, keyboard, resize and mobile dialog');
}finally{await browser.close();}
