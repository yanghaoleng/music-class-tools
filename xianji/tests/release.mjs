import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createDoc} from '../src/model.mjs';
const url=process.env.XIANJI_URL || 'http://127.0.0.1:5187/xianji/';
const csp=(await fs.readFile(new URL('../ops/nginx-location.conf',import.meta.url),'utf8')).match(/Content-Security-Policy "([^"]+)"/)[1];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark'});
  if(process.env.XIANJI_TEST_CSP)await context.route('**/*',async route=>{
   if(route.request().resourceType()!=='document')return route.continue();
   const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'content-security-policy':csp}});
  });
  const doc=createDoc('旧音色兼容');doc.tracks[0].instrument='analog';doc.strokes=[{id:'old',track:doc.tracks[0].id,instrument:'glass',color:'#426bd4',width:3,points:[{x:.1,y:.3},{x:.8,y:.4}]}];
  await context.addInitScript(doc=>{
   if(!localStorage.getItem('xianji.workspace.v1'))localStorage.setItem('xianji.workspace.v1',JSON.stringify({draft:doc,library:[]}));
   document.addEventListener('DOMContentLoaded',()=>{window.__bootTheme=document.documentElement.dataset.theme;});
  },doc);
  const page=await context.newPage(),errors=[],missing=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)missing.push([r.status(),r.url()]);});
  const button=name=>page.getByRole('button',{name,exact:true});
  await page.goto(url);await button('暂停').waitFor();assert.equal(await page.evaluate(()=>window.__bootTheme),'dark');
  assert.equal(await page.locator('.music-canvas').getAttribute('data-stroke-count'),'1');
  assert.deepEqual(await page.locator('.top-right button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label'))),['撤销','历史记录','重做','保存作品']);
  assert.equal((await page.request.get(new URL(await page.locator('link[rel=icon]').getAttribute('href'),page.url()).href)).status(),200);
  await button('画布菜单').click();await page.locator('.file-menu').waitFor();await button('浅色').click();await page.reload();await button('暂停').waitFor();assert.equal(await page.evaluate(()=>window.__bootTheme),'light');
  await button('画布菜单').click();await button('暗色').click();await page.keyboard.press('Escape');
  await button('画笔与音色').click();await page.locator('.instrument-grid').waitFor();
  assert.equal(await page.locator('.instrument-grid button').count(),12);assert.equal(await page.locator('.color-swatch').count(),0);
  assert.deepEqual(await page.locator('.instrument-grid img').evaluateAll(imgs=>imgs.map(i=>i.getAttribute('src').split('/').at(-1).replace('.svg',''))),
    ['cymbal','bell','pluck','lead','keys','air','strings','choir','pad','bass','kick','sub'],'brushes run from bright attacks to deep bass');
  await page.locator('.instrument-grid img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
  await button('低沉底鼓 厚实低频，短促有力').click();await button('金属镲片 轻亮的金属敲击，细碎余响').click();
  await button('关闭').click();await page.getByRole('dialog').waitFor({state:'detached'});
  await page.mouse.move(60,450);await page.mouse.down();await page.mouse.move(320,500,{steps:20});await page.mouse.up();
  assert.equal(await page.locator('.music-canvas').getAttribute('data-stroke-count'),'2');
  await button('历史记录').click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.history-snapshot').count(),2);
  assert.equal(await page.locator('.history-description b').first().innerText(),'金属镲片 · 声部 1');
  await page.locator('.history-snapshot').last().click();assert.equal(await page.locator('.music-canvas').getAttribute('data-stroke-count'),'1');
  await page.locator('.history-snapshot').first().click();await button('关闭').click();await page.getByRole('dialog').waitFor({state:'detached'});
  await button('保存作品').click();await button('画布菜单').click();await button('导出').click();
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'可编辑作品文件',exact:false}).click();
  const download=await event,exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.deepEqual(exported.strokes.map(s=>s.instrument),['glass','cymbal']);
  assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${name}: ${url} built/released assets, production CSP, pre-paint theme, 12 brushes, legacy audio identity, history and export`);
 }finally{await browser.close();}
}
