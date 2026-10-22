import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url=process.env.XIANJI_URL || 'http://127.0.0.1:5187/xianji/';
await fs.mkdir('artifacts',{recursive:true});
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,colorScheme:'dark'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const button=name=>page.getByRole('button',{name,exact:true});
  const count=async()=>Number(await page.locator('.music-canvas').getAttribute('data-stroke-count'));
  const close=async()=>{await button('关闭').click();await page.getByRole('dialog').waitFor({state:'detached'});};
  const menu=async()=>{await button('画布菜单').click();await page.locator('.file-menu').waitFor();};
  const drawing=async()=>{await page.waitForTimeout(1000);return page.evaluate(()=>JSON.parse(localStorage.getItem('xianji.workspace.v1')).draft);};
  await page.goto(url);await button('暂停').waitFor();await button('暂停').click();
  await page.touchscreen.tap(120,300);assert.equal(await count(),1);
  const circle=await page.locator('.music-canvas').evaluate(c=>{
    const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let minX=c.width,minY=c.height,maxX=-1,maxY=-1;
    for(let n=3;n<data.length;n+=4)if(data[n]){const p=(n-3)/4,x=p%c.width,y=Math.floor(p/c.width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    return {width:maxX-minX+1,height:maxY-minY+1,scale:c.width/c.clientWidth};
  });
  assert.ok(Math.abs(circle.width-circle.height)<=1,'tap is round, not stretched');
  assert.ok(circle.width/circle.scale>=8 && circle.width/circle.scale<=10,'tap is visibly larger than a 3px line');
  // Simulate sub-threshold touch jitter; pointer capture itself is exercised by
  // the trusted touchscreen tap and mouse drag around this case.
  await page.locator('.music-canvas').evaluate(c=>{
    const capture=c.setPointerCapture.bind(c),has=c.hasPointerCapture.bind(c);
    c.setPointerCapture=id=>{if(id!==92)capture(id);};
    c.hasPointerCapture=id=>id===92?false:has(id);
    try {
      for(const [type,x,y] of [['pointerdown',200,400],['pointermove',203,402],['pointerup',203,402]]){
        c.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:92,pointerType:'touch',button:0,clientX:x,clientY:y,buttons:type==='pointerup'?0:1}));
      }
    } finally {delete c.setPointerCapture;delete c.hasPointerCapture;}
  });
  assert.equal(await count(),2);
  await page.mouse.move(65,510);await page.mouse.down();await page.mouse.move(315,550,{steps:30});await page.mouse.up();assert.equal(await count(),3);
  let doc=await drawing();assert.deepEqual(doc.strokes.map(s=>s.width),[9,9,3]);assert.deepEqual(doc.strokes.slice(0,2).map(s=>s.points.length),[1,1]);assert.ok(doc.strokes[2].points.length>2);
  const origin=await page.locator('.music-canvas').evaluate(c=>{
    const scale=c.width/c.clientWidth,x=Math.round(65*scale),y=Math.round(510*scale),d=c.getContext('2d').getImageData(x-10,y-12,25,25).data;
    const rows=[];for(let row=0;row<25;row++)if(d.slice(row*25*4,(row+1)*25*4).some((v,i)=>i%4===3&&v))rows.push(row);
    return (Math.max(...rows)-Math.min(...rows)+1)/scale;
  });
  assert.ok(origin<7,'the large press preview leaves no dot behind when dragging');
  await page.screenshot({path:`artifacts/dots-lines-${name}.png`});
  await button('撤销').click();assert.equal(await count(),2);await button('重做').click();assert.equal(await count(),3);
  await page.reload();await button('暂停').waitFor();assert.equal(await count(),3);await button('暂停').click();
  doc=await drawing();assert.deepEqual(doc.strokes.map(s=>s.width),[9,9,3]);
  await button('历史记录').click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(250);
  assert.ok(await page.locator('.history-thumbnail circle').count()>=2,'history thumbnails retain circles');await close();
  await menu();await button('导出').click();const event=page.waitForEvent('download');await page.getByRole('button',{name:'画布图片 SVG',exact:false}).click();
  const svg=await fs.readFile(await (await event).path(),'utf8');assert.equal((svg.match(/<circle /g)||[]).length,2);assert.match(svg,/r="4.5"/);assert.match(svg,/stroke-width="3"/);
  await page.getByRole('dialog').waitFor({state:'detached'});await button('橡皮擦 (E)').click();await page.mouse.click(120,300);assert.equal(await count(),2);await button('撤销').click();assert.equal(await count(),3);
  assert.deepEqual(errors,[]);console.log(`PASS ${name}: round 9px taps, touch jitter, 3px drag without residual dot, undo/reload, thumbnails, SVG and erasing`);
 }finally{await browser.close();}
}
