import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
const url=process.env.XIANJI_URL || 'http://127.0.0.1:5186/xianji/';
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark'});
  await page.goto(url);await page.getByRole('button',{name:'暂停',exact:true}).waitFor();
  await page.getByRole('button',{name:'画笔与音色',exact:true}).click();await page.getByRole('dialog').waitFor();
  assert.equal(await page.locator('.color-swatch').count(),0);assert.equal(await page.locator('.instrument-grid button').count(),12);
  for(const [id,label] of [['kick','低沉底鼓 厚实低频，短促有力'],['cymbal','金属镲片 轻亮的金属敲击，细碎余响']]){
   await page.getByRole('button',{name:label,exact:true}).click();
   assert.equal(await page.locator('.instrument-grid button.chosen img').getAttribute('src'),`/xianji/instruments/${id}.svg`);
   assert.equal(await page.locator(`img[src="/xianji/instruments/${id}.svg"]`).first().evaluate(i=>i.complete&&i.naturalWidth>0),true);
  }
  await page.waitForTimeout(300);await page.screenshot({path:`artifacts/percussion-brushes-${name}.png`});
  await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  const sounds=await page.evaluate(async()=>{
   const {voice}=await import('/xianji/src/synth.mjs');const results=[];
   for(const id of ['kick','cymbal','analog','glass']){
    const rate=22050,ctx=new OfflineAudioContext(1,rate*2,rate);let buffers=0,sources=0;
    const nativeBuffer=ctx.createBuffer.bind(ctx),nativeSource=ctx.createBufferSource.bind(ctx);
    ctx.createBuffer=(...a)=>{buffers++;return nativeBuffer(...a);};ctx.createBufferSource=()=>{sources++;return nativeSource();};
    voice(ctx,ctx.destination,{instrument:id,midi:60,volume:.7},0,.2);
    voice(ctx,ctx.destination,{instrument:id,midi:72,volume:.7},.8,.2);
    const data=(await ctx.startRendering()).getChannelData(0);
    let full=0,lowEnergy=0,low=0,peak=0;const alpha=1-Math.exp(-2*Math.PI*300/rate);
    for(let i=0;i<rate*.6;i++){low+=alpha*(data[i]-low);full+=data[i]**2;lowEnergy+=low**2;peak=Math.max(peak,Math.abs(data[i]));}
    const tail=data.slice(rate*1.6);results.push({id,rms:Math.sqrt(full/(rate*.6)),lowRatio:lowEnergy/full,peak,buffers,sources,tail:Math.sqrt(tail.reduce((s,v)=>s+v*v,0)/tail.length)});
   }
   return results;
  });
  for(const s of sounds){assert.ok(s.rms>.003,`${s.id} is audible`);assert.ok(s.peak<.5,`${s.id} has controlled peaks`);}
  const [kick,cymbal]=sounds;assert.ok(kick.lowRatio>.8,'kick concentrates in low frequencies');assert.ok(cymbal.lowRatio<.05,'cymbal has a distinct metallic high band');
  for(const s of [kick,cymbal]){assert.equal(s.buffers,1,'one cached buffer per timbre/context');assert.equal(s.sources,2);assert.equal(s.tail,0,'percussion fully releases');}
  const wav=await page.evaluate(async()=>{
   const {createDoc}=await import('/xianji/src/model.mjs'),{renderWav}=await import('/xianji/src/audio.mjs');
   const doc={...createDoc(),bars:2,bpm:200};doc.strokes=['kick','cymbal'].map((instrument,i)=>({id:'drum'+i,track:doc.tracks[0].id,instrument,color:'#169f9b',width:3,points:[{x:0,y:.3+i*.3},{x:1,y:.3+i*.3}]}));
   const bytes=await (await renderWav(doc)).arrayBuffer(),v=new DataView(bytes);let energy=0;
   for(let p=44;p<bytes.byteLength;p+=2)energy+=(v.getInt16(p,true)/32768)**2;
   return {header:String.fromCharCode(...new Uint8Array(bytes,0,4)),rms:Math.sqrt(energy/((bytes.byteLength-44)/2))};
  });
  assert.equal(wav.header,'RIFF');assert.ok(wav.rms>.01,'WAV includes actual percussion');
  console.log(`PASS ${name}: 12 instrument-only brushes, bass drum/metal cymbal separation, cached one-shots, legacy voices and audible WAV`,sounds.map(({id,rms,lowRatio})=>({id,rms:+rms.toFixed(4),lowRatio:+lowRatio.toFixed(4)})));
 }finally{await browser.close();}
}
