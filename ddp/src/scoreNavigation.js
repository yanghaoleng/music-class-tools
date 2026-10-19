// Use actual row positions so keyboard navigation follows every density and width.
export function nextNoteIndex(positions,current,key){
 if(!positions.length)return -1;
 if(current<0||current>=positions.length)return 0;
 if(key==='ArrowLeft')return Math.max(0,current-1);
 if(key==='ArrowRight')return Math.min(positions.length-1,current+1);
 const origin=positions[current],direction=key==='ArrowUp'?-1:key==='ArrowDown'?1:0;
 if(!direction)return current;
 const candidates=positions.map((p,index)=>({...p,index})).filter(p=>direction*(p.top-origin.top)>1);
 if(!candidates.length)return current;
 const distance=Math.min(...candidates.map(p=>Math.abs(p.top-origin.top)));
 return candidates.filter(p=>Math.abs(Math.abs(p.top-origin.top)-distance)<1).reduce((best,p)=>Math.abs(p.left-origin.left)<Math.abs(best.left-origin.left)?p:best).index;
}
