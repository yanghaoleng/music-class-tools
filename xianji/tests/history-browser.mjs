import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
const url=process.env.XIANJI_URL || 'http://127.0.0.1:5186/xianji/';
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,colorScheme:'dark'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const button=name=>page.getByRole('button',{name,exact:true});
  const count=async()=>Number(await page.locator('.music-canvas').getAttribute('data-stroke-count'));
  const draw=async y=>{await page.mouse.move(50,y);await page.mouse.down();await page.mouse.move(330,y-30,{steps:20});await page.mouse.up();};
  const close=async()=>{await button('关闭').click();await page.getByRole('dialog').waitFor({state:'detached'});};
  const menu=async()=>{await button('画布菜单').click();await page.locator('.file-menu').waitFor();await page.waitForTimeout(220);};
  await page.goto(url);await button('暂停').waitFor();
  assert.deepEqual(await page.locator('.top-right button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label'))),['撤销','历史记录','重做','保存作品']);
  assert.equal(await page.getByRole('button',{name:'我的作品',exact:true}).count(),0);assert.equal(await button('导出').count(),0);
  assert.equal(await page.locator('.floating-tools').count(),0);assert.equal(await page.locator('.canvas-menu img').count(),0);
  await draw(300);await draw(400);assert.equal(await count(),2);
  await button('撤销').click();assert.equal(await count(),1);await button('重做').click();assert.equal(await count(),2);
  await button('历史记录').click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(250);
  assert.equal(await page.locator('.history-snapshot').count(),3);
  assert.ok(await page.locator('.history-thumbnail path').count()>0,'thumbnails contain actual strokes');
  await page.getByRole('button',{name:'快照 2 画下一笔',exact:true}).click();assert.equal(await count(),1);await close();
  await draw(500);assert.equal(await count(),2);
  await button('历史记录').click();await page.getByRole('dialog').waitFor();
  assert.equal(await page.locator('.history-snapshot').count(),4,'editing old snapshot retains alternate future');
  await page.getByRole('button',{name:'快照 3 画下一笔',exact:true}).click();assert.equal(await count(),2);
  await page.screenshot({path:`artifacts/history-phone-${name}.png`});await close();
  await button('撤销').click();await button('重做').click();await button('历史记录').click();await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('button',{name:'快照 3 画下一笔',exact:true}).getAttribute('aria-current'),'step','redo returns to the exact branch that was just undone');await close();
  await menu();assert.equal(await page.locator('.file-menu svg,.file-menu img').count(),0,'file dropdown uses text only');
  await page.getByLabel('作品名称',{exact:true}).fill('夜里的小旋律');await page.keyboard.press('Escape');await page.locator('.file-menu').waitFor({state:'detached'});
  assert.equal(await page.locator('.canvas-menu>span').innerText(),'夜里的小旋律');
  await button('保存作品').click();await page.waitForTimeout(1400);await page.reload();await button('暂停').waitFor();
  assert.equal(await count(),2);assert.equal(await page.locator('.canvas-menu>span').innerText(),'夜里的小旋律');
  await button('历史记录').click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.history-snapshot').count(),5);
  await page.getByRole('button',{name:'快照 1 空白画布',exact:true}).click();assert.equal(await count(),0);await close();
  await button('重做').click();assert.equal(await count(),1,'undo/redo remain usable after reload and arbitrary jump');
  await button('历史记录').click();await page.getByRole('dialog').waitFor();
  await page.getByRole('button',{name:'快照 5 重命名作品',exact:true}).click();await close();
  await menu();await button('我的作品').click();await page.getByRole('button',{name:'打开 夜里的小旋律',exact:true}).waitFor();await close();
  await menu();await button('导出').click();await page.getByRole('dialog').waitFor();await close();
  await menu();await button('新建画布').click();await page.locator('.file-menu').waitFor({state:'detached'});assert.equal(await count(),0);
  await menu();await button('我的作品').click();await page.getByRole('button',{name:'打开 夜里的小旋律',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  await button('历史记录').click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.history-snapshot').count(),5,'saved projects retain their own history');await close();
  for(const width of [320,360,390,768,1440]) {
   await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const a=await page.locator('.canvas-menu').boundingBox(),b=await page.locator('.top-right').boundingBox();assert.ok(a.x+a.width<b.x,'title and editing toolbar never overlap');
  }
  await button('历史记录').click();await page.locator('.dock-panel').waitFor();await page.waitForTimeout(250);await page.screenshot({path:`artifacts/history-desktop-${name}.png`});
  assert.deepEqual(errors,[]);console.log(`PASS ${name}: compact toolbar, text dropdown, snapshots/thumbnails, branching, restore, persisted per-project history and responsive layout`);
 } finally {await browser.close();}
}
