import {chromium, webkit} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createDoc, INSTRUMENTS} from '../src/model.mjs';
const url = process.env.XIANJI_URL || 'http://127.0.0.1:5186/xianji/';
const doc = createDoc('暗色彩虹');
doc.strokes = INSTRUMENTS.map((i,n)=>({id:`rainbow-${n}`,track:doc.tracks[0].id,instrument:i.id,color:i.color,width:3,
  points:Array.from({length:90},(_,j)=>({x:.08+j/89*.84,y:.18+n*.048+Math.sin(j/12+n)*.018}))}));
const luminance = rgb => rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const background=[26,28,32];
// Check the actual opaque grain against charcoal, without changing the palette.
for (const i of INSTRUMENTS) {
  const rgb=i.color.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16));
  const grain=rgb.map((v,n)=>v*240/255+background[n]*15/255);
  assert.ok((luminance(grain)+.05)/(luminance(background)+.05)>2.8,`${i.name} pigment remains distinct on charcoal`);
}
for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,colorScheme:'dark'});
    await context.addInitScript(doc=>{
      if (!localStorage.getItem('xianji.workspace.v1')) localStorage.setItem('xianji.workspace.v1',JSON.stringify({draft:doc,library:[doc]}));
      localStorage.setItem('xianji.icon.v2','a'); // Removed preference must not resurrect the gallery.
      window.__staticPaints=0;
      const stroke=CanvasRenderingContext2D.prototype.stroke;
      CanvasRenderingContext2D.prototype.stroke=function(...args){if(this.canvas.classList.contains('music-canvas'))window.__staticPaints++;return stroke.apply(this,args);};
      document.addEventListener('DOMContentLoaded',()=>{window.__bootTheme=document.documentElement.dataset.theme;});
    },doc);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const button=name=>page.getByRole('button',{name,exact:true});
    const menu=async()=>{await button('画布菜单').click();await page.getByRole('dialog').waitFor();};
    const close=async()=>{if(await page.locator('.file-menu').count())await page.keyboard.press('Escape');else await button('关闭').click();await page.getByRole('dialog').waitFor({state:'detached'});};
    const theme=()=>page.locator('html').getAttribute('data-theme');
    const ink=()=>page.locator('canvas.music-canvas').evaluate(c=>c.toDataURL());
    await page.goto(url);await button('暂停').waitFor();
    assert.equal(await page.evaluate(()=>window.__bootTheme),'dark','system dark applied before app mount');
    assert.equal(await theme(),'dark');
    assert.equal(await page.locator('.canvas-stage').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(26, 28, 32)');
    assert.equal(await page.locator('html').evaluate(e=>getComputedStyle(e).colorScheme),'dark');
    assert.equal(await page.locator('.canvas-menu img').count(),0);
    assert.match(await page.locator('link[rel=icon]').getAttribute('href'),/study-d-128.webp$/);
    const originalInk=await ink();assert.ok(originalInk.length>5000);
    await page.evaluate(()=>{window.__staticPaints=0;});
    // The playback overlay is just a narrow strip of existing pigment, with no halo.
    await page.waitForFunction(()=>{
      const c=document.querySelector('canvas.playback-ink');
      return c?.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v);
    });
    const band=await page.locator('canvas.playback-ink').evaluate(c=>{
      const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let min=c.width,max=-1;for(let n=3;n<d.length;n+=4)if(d[n]){const x=((n-3)/4)%c.width;min=Math.min(min,x);max=Math.max(max,x);}
      return {width:max-min+1,scale:c.width/c.clientWidth};
    });
    assert.ok(band.width>0 && band.width<=Math.ceil(16*band.scale),'highlight occupies at most 16 CSS pixels');
    await page.screenshot({path:`artifacts/appearance-dark-${name}.png`});
    await menu();await page.waitForTimeout(250);assert.equal(await page.getByRole('button',{name:'图标方案',exact:false}).count(),0);
    assert.equal(await button('跟随系统').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.file-menu').evaluate(e=>getComputedStyle(e).backdropFilter||getComputedStyle(e).webkitBackdropFilter),'none');
    await page.screenshot({path:`artifacts/appearance-menu-${name}.png`});
    await button('浅色').click();assert.equal(await theme(),'light');assert.equal(await ink(),originalInk);
    await page.emulateMedia({colorScheme:'light'});await page.emulateMedia({colorScheme:'dark'});
    assert.equal(await theme(),'light','manual choice overrides the system');
    await page.reload();await button('暂停').waitFor();assert.equal(await theme(),'light');
    assert.equal(await page.evaluate(()=>window.__bootTheme),'light','saved appearance applied before mount');
    await menu();await button('暗色').click();assert.equal(await theme(),'dark');await close();
    assert.equal(await ink(),originalInk,'theme never recolors or alters stored canvas pixels');
    await button('画笔与音色').click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(250);
    assert.equal(await page.locator('.instrument-grid>button').count(),12);
    const surfaces=await page.locator('.instrument-grid>button,.modal-header,.glass-modal').evaluateAll(es=>es.map(e=>getComputedStyle(e).backgroundColor));
    assert.ok(surfaces.every(c=>!c.startsWith('rgb(255, 255, 255)')),'dark modal has no white cards');
    await page.screenshot({path:`artifacts/appearance-brush-${name}.png`});await close();
    await page.evaluate(()=>{window.__staticPaints=0;});await menu();await button('浅色').click();await button('暗色').click();await close();
    assert.equal(await page.evaluate(()=>window.__staticPaints),0,'appearance switching does not repaint completed ink');
    await menu();await button('跟随系统').click();await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await close();
    await page.waitForTimeout(1200);
    const stripIds = strokes => strokes.map(({id,...s})=>s);
    assert.deepEqual(stripIds(await page.evaluate(()=>JSON.parse(localStorage.getItem('xianji.workspace.v1')).draft.strokes)),stripIds(doc.strokes),'appearance does not mutate artwork');
    await page.setViewportSize({width:1440,height:900});await button('画笔与音色').click();await page.locator('.dock-panel').waitFor();await page.waitForTimeout(250);
    await page.screenshot({path:`artifacts/appearance-desktop-${name}.png`});
    assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator('.dock-panel').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(39, 42, 47)');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${name}: system/manual/persisted themes, unchanged rainbow pigment, cached ink, fixed D icon, 16px playback band and dark phone/desktop panels`);
  } finally {await browser.close();}
}
