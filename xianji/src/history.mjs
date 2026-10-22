import {uid, validateDoc, getInstrument} from './model.mjs';
export const beginHistory = doc => ({entries:[{id:uid(),parent:-1,label:doc.strokes.length?'打开作品':'空白画布',at:Date.now(),doc}],cursor:0,redo:[]});
export function editLabel(before, after) {
  if (before.title !== after.title) return '重命名作品';
  if (before.tracks.length !== after.tracks.length) return after.tracks.length > before.tracks.length ? '添加声部' : '删除声部';
  if (before.strokes.length !== after.strokes.length) return after.strokes.length > before.strokes.length ? '画下一笔' : after.strokes.length ? '擦除笔触' : '清空画布';
  if (before.bpm !== after.bpm) return '调整速度';
  if (before.scale !== after.scale) return '更换音阶';
  if (before.root !== after.root) return '更换调性';
  if (before.bars !== after.bars) return '调整画布长度';
  if (before.division !== after.division) return '调整发声节奏';
  if (before.tracks !== after.tracks) {
    if(before.tracks.some((t,i)=>t.muted!==after.tracks[i]?.muted))return '切换声部静音';
    if(before.tracks.some((t,i)=>t.solo!==after.tracks[i]?.solo))return '切换声部独奏';
    return '调整声部音量';
  }
  return '编辑作品';
}
// Derive display titles from each snapshot, so existing saved history benefits
// too. Keep operation labels separate and preserve the original parent indices.
const titleCache = new WeakMap();
export function historyTitle(entry, parent) {
  const cached = titleCache.get(entry);
  if (cached && cached.parent === parent) return cached.title;
  const after = entry.doc, before = parent?.doc;
  let score = after, stroke, track;
  if (before && after.strokes !== before.strokes) {
    const previousIds = new Set(before.strokes.map(s => s.id));
    stroke = after.strokes.findLast(s => !previousIds.has(s.id));
    if (!stroke) {
      const nextIds = new Set(after.strokes.map(s => s.id));
      stroke = before.strokes.findLast(s => !nextIds.has(s.id));
      if (stroke) score = before;
    }
  }
  if (!stroke && before && after.tracks !== before.tracks) {
    track = after.tracks.find(t => {
      const old = before.tracks.find(previous => previous.id === t.id);
      return !old || ['instrument', 'volume', 'muted', 'solo'].some(key => old[key] !== t[key]);
    });
    if (!track) {
      track = before.tracks.find(t => !after.tracks.some(next => next.id === t.id));
      if (track) score = before;
    }
    if (track) stroke = score.strokes.findLast(s => s.track === track.id);
  }
  if (!stroke && !track) stroke = after.strokes.at(-1);
  if (stroke) track = score.tracks.find(t => t.id === stroke.track);
  const instrument = getInstrument(stroke?.instrument || track?.instrument);
  const voice = track ? score.tracks.findIndex(t => t.id === track.id) + 1 : 0;
  const title = instrument && voice ? `${instrument.name} · 声部 ${voice}` : entry.label;
  titleCache.set(entry, {parent, title});
  return title;
}
export function recordHistory(history, doc, {merge=false}={}) {
  const current=history.entries[history.cursor], label=editLabel(current.doc,doc);
  // Erasing one gesture and typing one title form a single reversible operation.
  if (merge && (label !== '重命名作品' || Date.now()-current.at < 1000) && history.cursor===history.entries.length-1 && current.parent>=0 && (current.label===label || (['擦除笔触','清空画布'].includes(current.label) && ['擦除笔触','清空画布'].includes(label)))) {
    return {...history,entries:history.entries.map((e,i)=>i===history.cursor?{...e,doc,label,at:Date.now()}:e)};
  }
  return {entries:[...history.entries,{id:uid(),parent:history.cursor,label,at:Date.now(),doc}],cursor:history.entries.length,redo:[]};
}
export const nextHistory = history => history.redo?.[0] ?? history.entries.findLastIndex(e=>e.parent===history.cursor);
// Store each immutable stroke once. Thousands of points are never copied into
// every snapshot; thumbnails are generated only when they approach the viewport.
export function packHistory(history) {
  const pool=[], ids=new Map();
  const entries=history.entries.map(e=>({...e,doc:{...e.doc,strokes:e.doc.strokes.map(s=>{
    if(!ids.has(s)){ids.set(s,pool.length);pool.push(s);}return ids.get(s);
  })}}));
  return {version:1,pool,entries,cursor:history.cursor,redo:history.redo || []};
}
export function unpackHistory(packed, draft) {
  try {
    if(packed?.version!==1 || !Array.isArray(packed.pool) || !Array.isArray(packed.entries) || !packed.entries.length || !Number.isInteger(packed.cursor) || !packed.entries[packed.cursor])return null;
    const tracks=new Map();
    const entries=packed.entries.map((e,i)=>{
      if(e.doc?.id!==draft.id || !Number.isInteger(e.parent) || e.parent>=i || e.parent < -1 || (i>0 && e.parent<0) || !Array.isArray(e.doc.strokes))throw Error('Invalid snapshot');
      const d=validateDoc({...e.doc,strokes:[]});d.tracks.forEach(t=>tracks.set(t.id,t));
      return {id:uid(),parent:e.parent,label:typeof e.label==='string'?e.label.slice(0,60):'编辑作品',at:Number(e.at)||Date.now(),doc:{...d,id:draft.id,createdAt:draft.createdAt,updatedAt:Number(e.doc.updatedAt)||draft.updatedAt},refs:e.doc.strokes};
    });
    const pool=packed.pool.map(s=>validateDoc({...draft,tracks:[tracks.get(s.track)],strokes:[s]}).strokes[0]);
    for(const entry of entries){entry.doc.strokes=entry.refs.map(n=>{if(!Number.isInteger(n)||!pool[n]||!entry.doc.tracks.some(t=>t.id===pool[n].track))throw Error('Invalid stroke reference');return pool[n];});delete entry.refs;}
    const redo=[];let parent=packed.cursor;
    for(const n of Array.isArray(packed.redo)?packed.redo:[]){if(!Number.isInteger(n)||entries[n]?.parent!==parent)break;redo.push(n);parent=n;}
    return {entries,cursor:packed.cursor,redo};
  }catch{return null;}
}
