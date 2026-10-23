/* Anamorphic line sculptures: their front projection is the chapter's drawing. */
(()=>{
 const CONFIG={dpr:2,fps:30},reduced=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');
 let fields=[],frame=0,last=0,intersection=null,resize=null,theme=null;
 function drawing(kind){
  const paths=[],line=(...p)=>paths.push(p),curve=(cx,cy,rx,ry,start=0,end=Math.PI*2)=>{const p=[];for(let i=0;i<=40;i++){const a=start+(end-start)*i/40;p.push([cx+rx*Math.cos(a),cy+ry*Math.sin(a)])}paths.push(p)};
  if(kind===0){
   line([-.25,.35],[-.25,-.65],[.55,-.85],[.55,.15]);curve(-.48,.4,.25,.17);curve(.32,.2,.25,.17);line([-.25,-.45],[.55,-.65]);
  }else if(kind===1){
   line([-.65,.75],[-.25,-.8],[.25,-.8],[.65,.75],[-.65,.75]);line([-.3,.49],[.3,.49]);line([0,.49],[.35,-.48]);curve(0,.49,.08,.08);line([-.13,-.4],[.13,-.4]);
  }else if(kind===2){
   for(let i=0;i<5;i++)line([-.88,-.48+i*.24],[.88,-.48+i*.24]);curve(-.48,.24,.16,.1);line([-.32,.24],[-.32,-.57]);curve(.28,-.12,.16,.1);line([.44,-.12],[.44,-.8]);
  }else if(kind===3){
   for(let i=0;i<5;i++){const x=-.65+i*.32,y=.65-i*.3;line([x-.13,y],[x+.15,y]);curve(x,y-.07,.05,.05)}line([-.75,-.6],[.7,-.6]);line([.53,-.75],[.7,-.6],[.53,-.45]);
  }else if(kind===4){
   for(let i=0;i<3;i++)curve(-.24,.45-i*.32,.25,.15);line([.01,.45],[.01,-.8]);line([-.75,.76],[.75,.76]);line([-.75,-.7],[.75,-.7]);
  }else if(kind===5){
   line([-.88,-.55],[.88,-.55],[.88,.65],[-.88,.65],[-.88,-.55]);for(let i=1;i<7;i++)line([-.88+i*1.76/7,-.55],[-.88+i*1.76/7,.65]);for(const i of [1,2,4,5,6]){const x=-.88+i*1.76/7;line([x-.055,-.55],[x-.055,.06],[x+.055,.06],[x+.055,-.55])}
  }else{
   line([-.72,.38],[-.72,-.2],[-.35,-.72],[.35,-.72],[.78,-.1],[.78,.38],[-.72,.38]);line([-.72,.03],[.78,.03]);line([-.55,.38],[-.55,.8]);line([.56,.38],[.56,.8]);for(let i=0;i<6;i++)line([-.5+i*.2,.03],[-.5+i*.2,.38]);line([-.2,-.72],[-.2,-.12]);curve(-.36,-.12,.16,.1);
  }
  return paths.map((path,index)=>{
   const points=[],lengths=[0];let total=0;
   for(let i=1;i<path.length;i++){total+=Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]);lengths.push(total)}
   for(let i=1;i<path.length;i++){
    const [a,b]=[path[i-1],path[i]],n=Math.max(1,Math.ceil((lengths[i]-lengths[i-1])*22));
    for(let j=i===1?0:1;j<=n;j++){const t=j/n,u=(lengths[i-1]+(lengths[i]-lengths[i-1])*t)/total;
     points.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,.7*Math.sin(u*Math.PI*1.7+index*1.91)+.25*Math.cos(u*Math.PI*3+index*.8)]);
    }
   }return points;
  });
 }
 function prepare(f){const r=f.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,CONFIG.dpr);f.w=Math.max(1,r.width);f.h=Math.max(1,r.height);f.canvas.width=Math.round(f.w*dpr);f.canvas.height=Math.round(f.h*dpr);f.ctx.setTransform(dpr,0,0,dpr,0,0);f.color=getComputedStyle(f.canvas).color}
 function draw(f,now,dt){
  if(!f.target)f.phase+=dt*.18;
  f.reveal=reduced.matches?1:f.reveal+(f.target-f.reveal)*(1-Math.exp(-dt*9));
  const blend=1-f.reveal,rx=(.65+Math.sin(f.phase*.63)*.24)*blend,ry=(1.5+Math.sin(f.phase)*.54)*blend,rz=(Math.sin(f.phase*.7)*.3-.2)*blend;
  const cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz),scale=Math.min(f.w,f.h)*.38;
  const project=([x,y,z])=>{const yy=y*cx-z*sx,zz=y*sx+z*cx,xx=x*cy+zz*sy,depth=-x*sy+zz*cy;return [(xx*cz-yy*sz)*scale+f.w/2,(xx*sz+yy*cz)*scale+f.h/2,depth]};
  const segments=[];
  for(const path of f.paths){let a=project(path[0]);for(let i=1;i<path.length;i++){const b=project(path[i]);segments.push({a,b,z:(a[2]+b[2])/2});a=b}}
  segments.sort((a,b)=>a.z-b.z);const c=f.ctx;c.clearRect(0,0,f.w,f.h);c.strokeStyle=f.color;c.lineCap='round';c.lineJoin='round';
  for(const {a,b,z} of segments){c.globalAlpha=.38+Math.min(1,Math.max(0,(z+1.4)/2.8))*.5+f.reveal*.1;c.lineWidth=Math.max(1.25,Math.min(f.w,f.h)*.018)*(1+z*.13*blend);c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke()}
  c.globalAlpha=1;
 }
 function running(){return !document.hidden&&!reduced.matches&&fields.some(f=>f.visible&&f.canvas.isConnected&&f.canvas.closest('dialog')?.open)}
 function tick(now){frame=0;if(!running())return;if(!last||now-last>=1000/CONFIG.fps){const dt=last?Math.min((now-last)/1000,.06):0;last=now;for(const f of fields)if(f.visible&&f.canvas.isConnected)draw(f,now,dt)}frame=requestAnimationFrame(tick)}
 function resume(){if(running()&&!frame){last=0;frame=requestAnimationFrame(tick)}}
 function pause(){cancelAnimationFrame(frame);frame=0;last=0}
 function dispose(){pause();intersection?.disconnect();resize?.disconnect();theme?.disconnect();for(const f of fields)for(const [event,fn] of Object.entries(f.events))f.row.removeEventListener(event,fn);fields=[]}
 function mount(root){
  dispose();fields=[...root.querySelectorAll('[data-particle-chapter]')].map(canvas=>{
   const kind=+canvas.dataset.particleChapter,row=canvas.closest('.course-chapter'),f={canvas,row,ctx:canvas.getContext('2d'),paths:drawing(kind),phase:kind*1.27+.8,reveal:reduced.matches?1:0,target:0,visible:true,hover:false,focus:false};
   const update=()=>{f.target=f.hover||f.focus?1:0;resume()};
   f.events={pointerenter:event=>{if(event.pointerType==='touch'||!fine.matches)return;f.hover=true;update()},pointerleave:()=>{f.hover=false;update()},focusin:()=>{f.focus=true;update()},focusout:event=>{if(!row.contains(event.relatedTarget)){f.focus=false;update()}}};
   for(const [event,fn]of Object.entries(f.events))row.addEventListener(event,fn);prepare(f);draw(f,performance.now(),0);return f;
  });
  intersection=new IntersectionObserver(entries=>{for(const e of entries){const f=fields.find(f=>f.canvas===e.target);if(f)f.visible=e.isIntersecting}if(running())resume();else pause()},{root:document.querySelector('#training')});
  resize=new ResizeObserver(entries=>{for(const e of entries){const f=fields.find(f=>f.canvas===e.target);if(f){prepare(f);draw(f,performance.now(),0)}}resume()});
  for(const f of fields){intersection.observe(f.canvas);resize.observe(f.canvas)}
  theme=new MutationObserver(()=>{for(const f of fields){prepare(f);draw(f,performance.now(),0)}});theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});resume();
 }
 reduced.addEventListener('change',()=>{pause();for(const f of fields){f.reveal=reduced.matches?1:0;draw(f,performance.now(),0)}resume()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else resume()});
 window.RefineParticles={mount,dispose};
})();
