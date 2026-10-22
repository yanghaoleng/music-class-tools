import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createDoc,INSTRUMENTS} from '../src/model.mjs';
const url=process.env.XIANJI_URL || 'http://127.0.0.1:5186/xianji/';
const library=Array.from({length:20},(_,i)=>createDoc('旋律 '+(i+1)));
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await context.addInitScript(library=>{if(!localStorage.getItem('xianji.workspace.v1'))localStorage.setItem('xianji.workspace.v1',JSON.stringify({library}));},library);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const button=name=>page.getByRole('button',{name,exact:true});
  const close=async()=>{await button('关闭').click();await page.getByRole('dialog').waitFor({state:'detached'});};
  const open=async name=>{await button(name).click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(250);};
  const count=async()=>Number(await page.locator('.music-canvas').getAttribute('data-stroke-count'));
  const draw=async y=>{const r=await page.locator('.music-canvas').boundingBox();await page.mouse.move(r.width*.13,r.height*y);await page.mouse.down();await page.mouse.move(r.width*.85,r.height*(y-.05),{steps:20});await page.mouse.up();};
  const dragHeader=async distance=>{const r=await page.locator('.glass-modal .modal-header').boundingBox();const x=r.x+r.width*.45,y=r.y+30;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+distance,{steps:12});await page.mouse.up();};
  await page.goto(url);await draw(.4);
  await open('画笔与音色');
  assert.equal(await page.getByText('线条粗细',{exact:true}).count(),0);
  assert.equal(await page.locator('.color-swatch').count(),12);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await button('画笔颜色 '+INSTRUMENTS[1].color).click();
  assert.equal(await button(INSTRUMENTS[1].name+' '+INSTRUMENTS[1].description).getAttribute('aria-pressed'),'true');
  await button(INSTRUMENTS[7].name+' '+INSTRUMENTS[7].description).click();
  assert.equal(await button('画笔颜色 '+INSTRUMENTS[7].color).getAttribute('aria-pressed'),'true');
  await page.waitForTimeout(200);await page.screenshot({path:`artifacts/rainbow-${name}.png`});
  // A small, slow pull springs back; a new click can still close immediately.
  await dragHeader(20);await page.waitForTimeout(250);assert.equal(await page.getByRole('dialog').count(),1);
  await close();await draw(.6);await page.waitForTimeout(900);
  let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('xianji.workspace.v1')).draft);
  assert.equal(stored.division,4);assert.deepEqual(stored.strokes.map(s=>s.width),[3,3]);
  assert.deepEqual(stored.strokes.map(s=>s.instrument),['keys','glass']);
  assert.deepEqual(stored.strokes.map(s=>s.color),[INSTRUMENTS[0].color,INSTRUMENTS[7].color]);
  await button('橡皮擦 (E)').tap();await page.waitForTimeout(400);assert.equal(await count(),2);
  await button('橡皮擦 (E)').tap();await page.waitForTimeout(80);await button('橡皮擦 (E)').tap();
  assert.equal(await count(),0);await button('撤销').click();assert.equal(await count(),2);
  await page.reload();await page.getByRole('button',{name:'暂停',exact:true}).waitFor();
  // Every blocking modal uses the common dismissal surface.
  for(const name of ['画笔与音色','旋律规则','声部混音','我的作品','导出','画布菜单']){
    await open(name);await dragHeader(170);await page.getByRole('dialog').waitFor({state:'detached'});
  }
  for(const name of ['图标方案','灵感示例','怎么玩']){
    await open('画布菜单');await page.getByRole('button',{name,exact:false}).click();await page.waitForTimeout(200);
    await dragHeader(170);await page.getByRole('dialog').waitFor({state:'detached'});
  }
  // Content first scrolls; pulling down once it reaches the top dismisses.
  await open('我的作品');
  await page.locator('.project-grid').evaluate(el=>{el.scrollTop=200;});
  assert.ok(await page.locator('.project-grid').evaluate(el=>el.scrollTop)>0);
  const touch=async(type,y)=>page.locator('.project-grid').evaluate((el,{type,y})=>{
    const t={identifier:4,target:el,clientX:150,clientY:y},event=new Event(type,{bubbles:true,cancelable:true});
    Object.defineProperties(event,{touches:{value:type==='touchend'?[]:[t]},changedTouches:{value:[t]}});el.dispatchEvent(event);
  },{type,y});
  await touch('touchstart',300);await touch('touchmove',330);
  assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.locator('.glass-modal').getAttribute('data-dragging'),null);
  await page.locator('.project-grid').evaluate(el=>{el.scrollTop=0;});
  await touch('touchmove',370);await touch('touchmove',520);await touch('touchend',520);
  await page.getByRole('dialog').waitFor({state:'detached'});
  if(name==='chromium'){
    const cdp=await context.newCDPSession(page);
    for(const kind of ['header','content']){
      await open(kind==='header'?'旋律规则':'我的作品');
      const r=await page.locator(kind==='header'?'.modal-header':'.project-grid').boundingBox();
      const x=r.x+r.width*.4,y=r.y+28;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let n=1;n<=8;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+n*22}]});await page.waitForTimeout(20);}
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.getByRole('dialog').waitFor({state:'detached'});
    }
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${name}: paired rainbow brushes, quarter beat, 3px lines, double-tap clear/undo, all modal drags, spring-back and scroll handoff`);
 }finally{await browser.close();}
}
