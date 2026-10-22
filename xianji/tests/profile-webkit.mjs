import {webkit} from 'playwright';
import {createDoc,COLORS} from '../src/model.mjs';
import fs from 'node:fs/promises';
const doc=createDoc('WebKit基准');
doc.strokes=Array.from({length:30},(_,j)=>({id:'s'+j,track:doc.tracks[0].id,color:COLORS[j%6],width:7,
  points:Array.from({length:400},(_,k)=>({x:.02+k/399*.96,y:.1+(j%9)*.075+.03*Math.sin(k/16+j)}))}));
const current=process.env.XIANJI_URL || 'http://127.0.0.1:5186/xianji/';
const runs=process.env.XIANJI_BEFORE_URL ? [['before',process.env.XIANJI_BEFORE_URL],['after',current]] : [['current',current]];
const results=[];
for(const [label,url] of runs){
  const browser=await webkit.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    await context.addInitScript(doc=>{
      localStorage.setItem('xianji.workspace.v1',JSON.stringify({draft:doc,library:[]}));
      const Native=AudioContext;window.__profileAudio=[];
      window.AudioContext=class extends Native {constructor(...args){super(...args);window.__profileAudio.push(this);}};
    },doc);
    const page=await context.newPage();await page.goto(url);await page.waitForTimeout(1000);
    const result=await page.evaluate(()=>new Promise(resolve=>{
      let last=performance.now(),start=last;const gaps=[];
      function sample(t){
        gaps.push(t-last);last=t;
        if(t-start<4000)requestAnimationFrame(sample);
        else {gaps.sort((a,b)=>a-b);resolve({audioState:window.__profileAudio[0]?.state,durationMs:t-start,frames:gaps.length,
          p95:gaps[Math.floor(gaps.length*.95)],over50:gaps.filter(x=>x>50).length});}
      }
      requestAnimationFrame(sample);
    }));
    results.push({label,...result});console.log(results.at(-1));
  } finally {await browser.close();}
}
await fs.mkdir('artifacts',{recursive:true});
await fs.writeFile('artifacts/perf-webkit.json',JSON.stringify(results,null,2));
