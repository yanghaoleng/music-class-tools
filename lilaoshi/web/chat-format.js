/* Only bounded emphasis and known concepts become markup; arbitrary HTML stays text. */
(()=>{
 const principles=["音高", "力度", "时值", "音色", "拍点", "节奏", "四分音符", "二分音符", "八分音符", "休止符", "附点", "五线谱", "高音谱号", "低音谱号", "中央 C", "半音", "全音", "大调音阶", "音程", "大三度", "三和弦", "主和弦", "转位", "分解和弦", "连奏", "乐句", "延音踏板", "慢练"];
 const definitions={"音高": "声音听起来有多高或多低，和振动频率有关。换一个琴键可以改变音高。", "力度": "声音的强弱。在钢琴上，较轻或较强的触键会影响声音力度。", "时值": "一个音或一次休止持续多久。音符长短是比例，实际秒数还取决于速度。", "音色": "声音的质感，由起音、泛音与衰减等共同影响。相同音高也能有不同音色。", "拍点": "音乐里均匀前进的时间参照，可以用走步、拍手或节拍器感受。", "节奏": "声音与静默在时间里的长短、疏密与组合，可以发生在稳定拍点之中。", "四分音符": "常见音符，时值是二分音符的一半。题目规定四分音符为一拍时，它持续一拍。", "二分音符": "时值是四分音符的两倍。四分音符为一拍时，它持续两拍。", "八分音符": "时值是四分音符的一半。四分音符为一拍时，它持续半拍。", "休止符": "有明确长度的静默。不发声的时间也要保持内心拍点。", "附点": "加在音符右边的小点，增加原音符时值的一半。", "五线谱": "用五条线、四个间和加线表示音高的位置，还需结合谱号理解具体音名。", "高音谱号": "也叫G谱号，标记从下往上第二条线是G4。", "低音谱号": "也叫F谱号，两个点夹住的第四条线是F3。", "中央 C": "键盘中央附近的C，本课程记为C4（MIDI 60）。不同设备的八度编号可能不同。", "半音": "十二平均律键盘上相邻琴键之间的距离，包含黑键与白键。", "全音": "两个半音合起来的音高距离，C到D是一个全音。", "大调音阶": "从主音向上按全、全、半、全、全、全、半构成的一组音。", "音程": "两个音的音高关系。度数数基本音级，音程性质还需结合半音距离。", "大三度": "如C到E，包含三个基本音级，距离四个半音。", "三和弦": "按三度关系叠置的三个音构成的和弦，例如C、E、G。", "主和弦": "以当前调的主音为根音的I级和弦，C大调主和弦是C、E、G。", "转位": "和弦组成音不变，把三音或五音放到最低声部等不同排列。", "分解和弦": "把同一和弦的各音按一定顺序先后弹出。", "连奏": "让相邻声音自然衔接，避免明显空隙和无意的长时间叠响。", "乐句": "音乐里相对完整的一句话，通常有方向、连接与收束。", "延音踏板": "钢琴上使声音继续延长的踏板，使用与更换要结合和声及实际声音。", "慢练": "降低到能够控制动作与拍点的速度，解决具体难点，再逐步连接和提速。"};
 const concepts=Object.keys(definitions);
 const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const terms=[...new Set([...principles,...concepts])].sort((a,b)=>b.length-a.length);
 function render(value){
  const text=String(value),seen=new Set();let result='',position=0,bold=0,links=0;
  while(position<text.length){
   const term=terms.find(word=>text.startsWith(word,position));
   if(term){let markup=escape(term);if(!seen.has(term)){
    if(concepts.includes(term)&&links<5){markup=`<button type="button" class="concept-term" data-concept-term="${escape(term)}" aria-label="解释概念：${escape(term)}" aria-expanded="false" aria-haspopup="dialog">${markup}</button>`;links++}
    if(principles.includes(term)&&bold<2){markup=`<strong>${markup}</strong>`;bold++}seen.add(term)
   }result+=markup;position+=term.length;continue}
   // A short explicit **emphasis** from the model is safe; never parse HTML or links.
   if(text.startsWith('**',position)&&bold<2){const end=text.indexOf('**',position+2);if(end>position+2&&end-position<=26){result+=`<strong>${escape(text.slice(position+2,end))}</strong>`;bold++;position=end+2;continue}}
   result+=escape(text[position]);position++;
  }
  return result;
 }
 let popup=null,anchor=null;
 function close(){if(!popup)return;anchor?.setAttribute('aria-expanded','false');popup.remove();popup=null;anchor=null}
 function place(){
  if(!popup||!anchor?.isConnected){close();return}
  const rect=anchor.getBoundingClientRect(),bounds=window.visualViewport;
  const left=bounds?.offsetLeft||0,top=bounds?.offsetTop||0,width=bounds?.width||window.innerWidth,height=bounds?.height||window.innerHeight;
  popup.style.maxWidth=`${Math.min(280,width-32)}px`;
  const box=popup.getBoundingClientRect();
  popup.style.left=`${Math.max(left+16,Math.min(rect.left,left+width-box.width-16))}px`;
  popup.style.top=`${Math.max(top+12,Math.min(rect.bottom+10,top+height-box.height-12))}px`;
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-concept-term]');if(!button)return;
  if(anchor===button){close();return}close();
  const term=button.dataset.conceptTerm;if(!definitions[term])return;
  anchor=button;popup=document.createElement('aside');popup.className='concept-popover';popup.id='concept-explanation';popup.setAttribute('role','dialog');popup.setAttribute('aria-label',term+'的解释');popup.setAttribute('popover','manual');
  popup.innerHTML=`<div class="concept-popover-heading"><strong>${escape(term)}</strong><button type="button" aria-label="关闭解释">×</button></div><p>${escape(definitions[term])}</p>`;
  (button.closest('dialog[open]')||document.body).append(popup);
  button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls',popup.id);
  popup.querySelector('button').onclick=close;
  if(popup.showPopover)popup.showPopover();place();
 });
 document.addEventListener('pointerdown',event=>{if(popup&&!popup.contains(event.target)&&!event.target.closest?.('[data-concept-term]'))close()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&popup){event.preventDefault();event.stopPropagation();const target=anchor;close();target?.focus({preventScroll:true})}},true);
 document.addEventListener('scroll',event=>{if(popup&&!popup.contains(event.target))place()},true);
 document.addEventListener('close',close,true);
 window.addEventListener?.('resize',close);
 window.RefineRichText={render};
})();
