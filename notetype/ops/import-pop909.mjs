// Import explicit vocal-melody and piano-arrangement references, preserving their
// provenance and distinguishing MIDI references from engraved MusicXML scores.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {melodyGrams} from '../server/matching.mjs';
const require=createRequire(import.meta.url),{Midi}=require('@tonejs/midi');
const rows=JSON.parse(await readFile('cache/pop909-index.json','utf8')).slice(1),index=JSON.parse(await readFile('catalog/index.json','utf8'));index.items=index.items.filter(s=>!s.id.startsWith('pop909-'));
let added=0;
for(const row of rows){
 const [songId,title,artist,,measureBeats]=row;let midi;
 try{midi=new Midi(await readFile(`cache/POP909/${songId}/${songId}.mid`));}catch{continue;}
 for(const variant of ['piano','melody']){
  const tracks=variant==='melody'?midi.tracks.filter(t=>t.name==='MELODY'):midi.tracks;
  const events=tracks.flatMap((track,i)=>track.notes.map(n=>({pitch:n.midi,beat:Math.round(n.ticks/midi.header.ppq*100000)/100000,length:Math.round(n.durationTicks/midi.header.ppq*100000)/100000,staff:n.midi<60?2:1,voice:String(i)+':'+track.name,measure:String(1+Math.floor(n.ticks/midi.header.ppq/(+measureBeats||4)))}))).filter(n=>n.length>0&&n.pitch>=21&&n.pitch<=108).sort((a,b)=>a.beat-b.beat||a.pitch-b.pitch);
  if(events.length<12||events.length>16000)continue;
  const hist=Array(12).fill(0);for(const n of events)hist[n.pitch%12]+=Math.min(2,n.length);const norm=Math.hypot(...hist)||1;
  const time=midi.header.timeSignatures[0]?.timeSignature||[4,4];
  const meta={id:`pop909-${songId}-${variant}`,title,composer:artist,aliases:`${artist} 中文流行 钢琴 吉他 旋律`,version:variant==='melody'?'主旋律 · MIDI 节奏参考':'旋律与钢琴编配 · MIDI 参考',kind:variant==='melody'?'melody':'score',rhythmKnown:true,format:'MIDI',source:`https://github.com/music-x-lab/POP909-Dataset/tree/master/POP909/${songId}`,sourceName:'POP909 编配参考',license:'MIT (dataset repository)',noteCount:events.length,beats:Math.max(...events.map(n=>n.beat+n.length)),keyFifths:0,timeSignature:time.join('/'),hist:hist.map(v=>Math.round(v/norm*100000)/100000),grams:[...melodyGrams(events.map(n=>({...n,start:n.beat,confidence:1})))].sort((a,b)=>a-b)};
  await writeFile(`catalog/scores/${meta.id}.json`,JSON.stringify({...meta,events}));index.items.push(meta);added++;
 }
}
index.sources=index.sources.filter(s=>s.name!=='POP909');index.sources.push({name:'POP909',url:'https://github.com/music-x-lab/POP909-Dataset',reference:'Wang et al., POP909: A Pop-song Dataset for Music Arrangement Generation, ISMIR 2020.',note:'909 pop arrangements; melody and piano MIDI reference variants are labeled separately.'});
await writeFile('catalog/index.json',JSON.stringify(index));console.log('Imported POP909 variants:',added,'Total reference versions:',index.items.length);
