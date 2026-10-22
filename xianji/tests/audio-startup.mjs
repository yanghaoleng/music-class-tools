import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {createDoc} from '../src/model.mjs';
const url=process.env.XIANJI_URL||'http://127.0.0.1:5186/xianji/';
const doc=createDoc('首次出声验证');doc.bars=8;doc.bpm=96;
doc.strokes=[{id:'late-note',track:doc.tracks[0].id,instrument:'keys',color:'#9356b5',width:3,points:[{x:.9,y:.5}]}];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome',args:['--autoplay-policy=document-user-activation-required']}:{})});
 try{
  for(const mode of ['native','touchend-gate','legacy-ios']){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,...(mode==='legacy-ios'?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Version/16.6 Mobile/15E148 Safari/604.1'}:{})});
   await context.addInitScript(({doc,mode})=>{
    localStorage.setItem('xianji.workspace.v1',JSON.stringify({draft:doc,library:[]}));
    if(mode==='legacy-ios')Object.defineProperty(navigator,'audioSession',{value:undefined,configurable:true});
    window.__probe={starts:[],firstSound:null,gesture:null,gate:mode!=='touchend-gate'};
    document.addEventListener('touchend',e=>{if(e.isTrusted){window.__probe.gate=true;window.__probe.gesture=performance.now();}},{capture:true});
    const Native=window.AudioContext||window.webkitAudioContext;
    window.AudioContext=class extends Native{
     constructor(...a){super(...a);window.__ctx=this;}
     get state(){return window.__probe.gate?super.state:'suspended';}
     resume(){return window.__probe.gate?super.resume():new Promise(()=>{});}
     createOscillator(){const n=super.createOscillator(),start=n.start.bind(n);n.start=(t=0)=>{window.__probe.starts.push({at:performance.now(),delay:t-this.currentTime});return start(t);};return n;}
     createDynamicsCompressor(){const n=super.createDynamicsCompressor(),an=this.createAnalyser(),data=new Float32Array(an.fftSize);n.connect(an);setInterval(()=>{an.getFloatTimeDomainData(data);if(!window.__probe.firstSound&&data.some(x=>Math.abs(x)>.0001))window.__probe.firstSound=performance.now();},10);return n;}
    };
   },{doc,mode});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await page.getByRole('button',{name:'暂停',exact:true}).waitFor();
   await page.getByRole('button',{name:'画布菜单',exact:true}).tap();
   await page.waitForFunction(()=>window.__probe.firstSound!==null,{},{timeout:2500});
   const result=await page.evaluate(()=>({...window.__probe,state:window.__ctx.state,session:navigator.audioSession?.type,media:[...document.querySelectorAll('audio')].map(a=>({ready:a.readyState,paused:a.paused,muted:a.muted,loop:a.loop})),points:JSON.parse(localStorage.getItem('xianji.workspace.v1')).draft.strokes[0].points}));
   assert.equal(result.state,'running');assert.ok(result.starts[0].delay<.1);
   assert.ok(result.firstSound-result.gesture<1000,`${name}/${mode}: sound follows gesture promptly`);
   assert.deepEqual(result.points,doc.strokes[0].points,'cueing never changes the saved composition');
   if(mode==='touchend-gate')assert.ok(result.starts[0].at>=result.gesture,'touchend retries a pending initial resume');
   if(mode==='legacy-ios'){
    assert.equal(result.media.length,1);assert.ok(result.media[0].ready>=2);assert.equal(result.media[0].paused,false);assert.equal(result.media[0].muted,false);assert.equal(result.media[0].loop,true);
   }else if(result.session)assert.equal(result.session,'playback');
   await page.getByRole('button',{name:'画布菜单',exact:true}).tap();
   await page.getByRole('button',{name:'暂停',exact:true}).tap();
   if(mode==='legacy-ios')assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
   const before=await page.locator('.playhead').getAttribute('style');await page.waitForTimeout(150);assert.equal(await page.locator('.playhead').getAttribute('style'),before);
   await page.getByRole('button',{name:'播放',exact:true}).tap();
   assert.deepEqual(errors,[]);
   console.log(`PASS ${name}/${mode}: first sound ${Math.round(result.firstSound-result.gesture)}ms from touch; media route ${result.session||result.media.length+' bridge'}`);
   await context.close();
  }
 }finally{await browser.close();}
}
