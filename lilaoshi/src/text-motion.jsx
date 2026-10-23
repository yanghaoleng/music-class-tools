import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Calligraph } from 'calligraph';
import { Toaster, toast } from 'sonner';
import { chineseTextRuns } from './chinese-line-break.mjs';

// Small React islands: the course and model requests stay in the existing app.
const entries = new Map();
const active = new Set();
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
const count = value => [...segmenter.segment(String(value))].length;
const duration = value => 240 + Math.min(550, Math.max(0, count(value) - 1) * 18);
function render(host, value, variant) {
  if (!host) return;
  let entry = entries.get(host);
  if (!entry) {
    host.replaceChildren();
    entry = { root: createRoot(host), value, variant };
    entries.set(host, entry);
  }
  entry.value = value;
  entry.variant = variant;
  const textRun = (run, index) => <span key={index} className={run.keep ? 'cjk-keep' : run.punctuation ? 'cjk-punctuation' : 'cjk-run'}>
    <Calligraph variant="text" initial={false} autoSize={false} animation="default"
      className="calligraph-text" style={{display:'inline',overflowWrap:'normal'}}>{run.text}</Calligraph>
  </span>;
  flushSync(() => entry.root.render(preference.matches
    ? <span>{value}</span>
    : variant === 'text'
      ? <span className="calligraph-copy">{chineseTextRuns(value).map(textRun)}</span>
      : <Calligraph variant="slots" initial={false} autoSize={false} animation="snappy"
          className="calligraph-slots" style={{display:'inline-flex',height:'1em',lineHeight:'1em',overflow:'hidden',verticalAlign:'middle'}}>
          {value}
        </Calligraph>));
}
function text(host, { delay = 0, step: stepOverride = null, value: replacement, exit = false } = {}) {
  if (!host) return [];
  if(host.querySelector('strong,.concept-term')){
    if(host.dataset.richMotionReady)return [];
    host.dataset.richMotionReady='true';
    const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT),nodes=[];
    while(walker.nextNode())if(walker.currentNode.textContent)nodes.push(walker.currentNode);
    let cursor=delay;const animations=[];
    const total=count(host.textContent),step=total>1?Math.min(18,550/(total-1)):0;
    for(const node of nodes){const run=document.createElement('span'),value=node.textContent;run.textContent=value;node.replaceWith(run);animations.push(...text(run,{delay:cursor,step}));cursor+=count(value)*step}
    return animations;
  }
  const value = replacement ?? entries.get(host)?.value ?? host.textContent;
  if (!exit) render(host, value, 'text');
  if (preference.matches) return [];
  const glyphs = [...host.querySelectorAll('.calligraph-text > span')];
  const step = stepOverride ?? (glyphs.length > 1 ? Math.min(18, 550 / (glyphs.length - 1)) : 0);
  // Calligraph 1.4.1 Text reconciles graphemes; add a bounded initial stagger.
  return glyphs.map((glyph, index) => {
    const animation = glyph.animate(exit ? [
      { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' },
      { opacity: 0, transform: 'translateY(-6px)', filter: 'blur(3px)' }
    ] : [
      { opacity: 0, transform: 'translateY(6px)', filter: 'blur(3px)' },
      { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' }
    ], { duration: exit ? 160 : 240, delay: delay + index * step, easing: 'cubic-bezier(.19,1,.22,1)', fill: exit ? 'forwards' : 'backwards' });
    active.add(animation);
    animation.finished.then(() => active.delete(animation), () => active.delete(animation));
    return animation;
  });
}
function slots(host, value) { render(host, String(value), 'slots'); }
preference.addEventListener('change', () => {
  for (const animation of active) { try { animation.finish(); } catch { animation.cancel(); } }
  active.clear();
  for (const [host, entry] of entries) if (host.isConnected) render(host, entry.value, entry.variant);
});
new MutationObserver(() => {
  for (const [host, entry] of entries) if (!host.isConnected) {
    entry.root.unmount();
    entries.delete(host);
  }
}).observe(document.body, { childList: true, subtree: true });
window.RefineText = { text, slots, duration };

const toastHost=document.createElement('div');toastHost.id='toast-host';document.body.append(toastHost);
const toastRoot=createRoot(toastHost);
flushSync(()=>toastRoot.render(<Toaster theme="system" position="top-center" offset={76} mobileOffset={72} visibleToasts={1} toastOptions={{duration:1800,style:{background:'var(--panel)',color:'var(--text)',border:'1px solid var(--line)',borderRadius:'12px',fontSize:'13px'}}} />));
function notify(type,message){const parent=document.querySelector('#home-notes-dialog[open],#training[open]')||document.body;if(toastHost.parentElement!==parent)parent.append(toastHost);toast[type](message,{id:'copy-concept'});}
window.RefineToast={success:message=>notify('success',message),error:message=>notify('error',message)};
