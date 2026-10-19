import {useEffect,useRef,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {createUISFX} from 'uisfx';
import {Check} from '@phosphor-icons/react';

// Match Weight Calendar's interaction pack and spring values.
const uiSfx=createUISFX({pack:'zen',volume:0.65,preferences:{key:'ddp:sound'}});
export function playSfx(cue){try{return uiSfx.play(cue)}catch{return null}}
export function useInterfaceSounds(enabled){
 useEffect(()=>{uiSfx.setEnabled(enabled)},[enabled]);
 useEffect(()=>{
  const unlock=()=>{void uiSfx.unlock()};
  const click=event=>{
   if(!(event.target instanceof Element))return;
   const control=event.target.closest('button');
   if(control&&!control.disabled)playSfx(control.dataset.sfx||'press');
   const summary=event.target.closest('summary');
   if(summary)playSfx(summary.parentElement?.open?'collapse':'expand');
  };
  document.addEventListener('pointerdown',unlock,true);
  document.addEventListener('keydown',unlock,true);
  document.addEventListener('click',click);
  return()=>{document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('keydown',unlock,true);document.removeEventListener('click',click)};
 },[]);
}
export function SelectionCheck({visible}){
 return <AnimatePresence initial={false}>{visible&&<motion.span className="selection-check" initial={{opacity:0,scale:1.85}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.72}} transition={{type:'spring',stiffness:520,damping:18,mass:.55}}><Check/></motion.span>}</AnimatePresence>;
}
export function InteractiveIcon(){
 const [bounce,setBounce]=useState(false);const frame=useRef(null);
 useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 function replay(){cancelAnimationFrame(frame.current);setBounce(false);frame.current=requestAnimationFrame(()=>{frame.current=requestAnimationFrame(()=>setBounce(true))})}
 return <button className="app-icon-button" aria-label="让图标动一下" title="点一下，让图标动一下" data-sfx="press" onClick={replay}><img className={'app-icon'+(bounce?' app-icon--bounce':'')} src="/ddp/app-icon.webp" width="52" height="52" alt="" draggable="false"/></button>;
}

export function usePageNavigation(initialPage){
 const [page,setPage]=useState(initialPage),[direction,setDirection]=useState(1);const index=useRef(0);
 useEffect(()=>{
  history.replaceState({...history.state,ddpView:initialPage,ddpParent:null,ddpIndex:0},'',location.href);
  const pop=event=>{const state=event.state;const next=state?.ddpView||'home';setDirection((state?.ddpIndex||0)<index.current?-1:1);index.current=state?.ddpIndex||0;setPage(next)};
  addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);
 },[]);
 function navigate(next){
  if(next===page)return;
  if(history.state?.ddpView===page&&history.state.ddpParent===next){history.back();return}
  index.current++;setDirection(1);history.pushState({...history.state,ddpView:next,ddpParent:page,ddpIndex:index.current},'',next==='data'?'/ddp/data':'/ddp/');setPage(next);
 }
 return [page,navigate,direction];
}
