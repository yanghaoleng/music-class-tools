import {chromium, webkit} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createDoc, COLORS} from '../src/model.mjs';
const url = process.env.XIANJI_URL || 'http://127.0.0.1:5186/xianji/';
const doc = createDoc('手机性能验证');
doc.tracks[0].instrument = 'pad';
doc.strokes = Array.from({length:30},(_,j)=>({id:'line'+j,track:doc.tracks[0].id,color:COLORS[j%6],width:7,
  points:Array.from({length:400},(_,k)=>({x:.02+k/399*.96,y:.12+(j%9)*.07+.03*Math.sin(k/20+j)}))}));
for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser = await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
  const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const errors=[];
  try {
    await context.addInitScript(doc=>{
      if (!localStorage.getItem('xianji.workspace.v1')) localStorage.setItem('xianji.workspace.v1',JSON.stringify({draft:doc,library:[]}));
      window.__paint={static:0,live:0,segments:0,rects:0};
      const Native = window.AudioContext || window.webkitAudioContext;
      window.__audio = [];
      window.AudioContext = class extends Native {
        constructor(...args) {super(...args);this.outputs=[];window.__audio.push(this);}
        createDynamicsCompressor() {const node=super.createDynamicsCompressor();this.outputs.push(node);return node;}
      };
      const stroke=CanvasRenderingContext2D.prototype.stroke;
      CanvasRenderingContext2D.prototype.stroke=function(...args){
        if(this.canvas.classList.contains('music-canvas'))window.__paint.static++;
        if(this.canvas.classList.contains('live-ink'))window.__paint.live++;
        return stroke.apply(this,args);
      };
      const lineTo=Path2D.prototype.lineTo;
      Path2D.prototype.lineTo=function(...args){window.__paint.segments++;return lineTo.apply(this,args);};
      const bounds=Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect=function(...args){if(this.classList.contains('music-canvas'))window.__paint.rects++;return bounds.apply(this,args);};
    },doc);
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.getByRole('button',{name:'暂停',exact:true}).waitFor();
    await page.locator('.music-canvas').evaluate(c=>{const bytes=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i])ink++;if(ink<1000)throw Error('canvas did not paint actual ink');});
    const resolution=await page.locator('.music-canvas').evaluate(c=>({width:c.width,height:c.height,css:c.clientWidth}));
    assert.equal(resolution.width,780);assert.equal(resolution.height,1688,'DPR capped at 2 on 3x iPhone');
    await page.evaluate(()=>{window.__paint.static=0;window.__paint.segments=0;});
    await page.waitForTimeout(1000);
    assert.equal((await page.evaluate(()=>window.__paint)).static,0,'completed ink is not redrawn during playback');
    assert.equal((await page.evaluate(()=>window.__paint)).segments,0,'paths are not rebuilt by the playback clock');
    const canvas=page.locator('.music-canvas'),r=await canvas.boundingBox();
    await page.evaluate(()=>{window.__paint.rects=0;window.__paint.segments=0;});
    await page.mouse.move(r.x+r.width*.1,r.y+r.height*.65);await page.mouse.down();
    await page.mouse.move(r.x+r.width*.85,r.y+r.height*.5,{steps:60});
    assert.ok(await page.locator('.live-ink').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)),'live input paints before pointer up');
    const audio = await page.evaluate(async () => {
      const ctx=window.__audio[0], analyser=ctx.createAnalyser();ctx.outputs.at(-1).connect(analyser);
      let rms=0;const data=new Float32Array(analyser.fftSize);
      for(let n=0;n<5;n++){await new Promise(r=>setTimeout(r,60));analyser.getFloatTimeDomainData(data);rms=Math.max(rms,Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length));}
      ctx.outputs.at(-1).disconnect(analyser);return {state:ctx.state,rms};
    });
    assert.equal(audio.state,'running','first gesture unlocks audio');assert.ok(audio.rms>.0001,`${name} produces real audio`);
    await page.mouse.up();
    assert.equal(await canvas.getAttribute('data-stroke-count'),'31');
    const work=await page.evaluate(()=>window.__paint);
    assert.ok(work.rects<=3,`one geometry read per gesture, got ${work.rects}`);
    assert.ok(work.segments<700,`new segments + one committed path, got ${work.segments}`);
    await page.getByRole('button',{name:'暂停',exact:true}).click();
    const cursor=await page.locator('.playhead').getAttribute('style');
    await page.waitForTimeout(250);assert.equal(await page.locator('.playhead').getAttribute('style'),cursor);
    await page.getByRole('button',{name:'画笔与音色',exact:true}).click();await page.getByRole('dialog').waitFor();
    assert.equal(await page.locator('.glass-modal').evaluate(e=>getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter),'none');
    await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('xianji.workspace.v1')).draft.strokes.length),31);
    await page.reload();assert.equal(await canvas.getAttribute('data-stroke-count'),'31');
    await page.touchscreen.tap(200,300);
    assert.equal(await canvas.getAttribute('data-stroke-count'),'32','touch input still creates a stroke');
    await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/mobile-${name}.png`});
    assert.deepEqual(errors,[]);
    console.log(`PASS ${name}: DPR3 phone, cached real ink, linear input, pause, glass fallback, autosave/reload and touch`,work);
  } finally {await browser.close();}
}
