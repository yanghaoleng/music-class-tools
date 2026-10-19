import abcjs from 'abcjs';
import fs from 'node:fs';
import {encodeNotes} from '../src/music.js';
const base='/tmp/oneill-master/1001/abc';
const popular=['Drowsy Maggie','Shandon bells','Blarney pilgrim','Kesh','Butterfly','Silver spear','Wind that shakes','Irish washerwoman','Morrison','Swallow','Maid behind','Banish misfortune','Harvest home','Boys of Bluehill','Rights of man','Cooley','Sally','South wind','Fisher','Out on the ocean'];
const tunes=[];
for(const file of fs.readdirSync(base)){
 const abc=fs.readFileSync(base+'/'+file,'utf8');
 try{
 const t=abcjs.parseOnly(abc)[0],seq=t.setUpAudio({qpm:100});
 const notes=seq.tracks.flat().filter(x=>x.cmd==='note').sort((a,b)=>a.start-b.start).map(x=>({midi:Math.round(x.pitch),duration:Math.round(x.duration*4*1000)/1000}));
 if(!notes.length || notes.length>500 || notes.some(n=>!Number.isFinite(n.duration)||n.duration<=0))continue;
 const title=t.metaText.title;
 const range=notes.filter(n=>n.midi>=62&&n.midi<=86).length/notes.length;
 if(range<.96)continue;
 tunes.push({id:'oneill-'+parseInt(file),title,subtitle:'O’Neill · 1907',type:abc.match(/^R:(.+)$/m)?.[1].trim()||'传统',key:abc.match(/^K:(.+)$/m)?.[1].trim()||'D',meter:abc.match(/^M:(.+)$/m)?.[1].trim()||'4/4',difficulty:notes.length<100?'入门':'进阶',notes,abc,source:'Francis O’Neill · The Dance Music of Ireland (1907) · 第 '+parseInt(file)+' 首',sourceUrl:'https://github.com/folkies/oneill/blob/master/1001/abc/'+file});
 }catch(e){}
}
tunes.sort((a,b)=>Number(popular.some(p=>b.title.toLowerCase().includes(p.toLowerCase())))-Number(popular.some(p=>a.title.toLowerCase().includes(p.toLowerCase()))));
fs.writeFileSync('catalog.json',JSON.stringify(tunes.slice(0,100).map(({notes,abc,...t})=>({...t,scoreText:encodeNotes(notes)}))));
console.log('catalog',tunes.length,'selected',Math.min(tunes.length,100),tunes.slice(0,5).map(t=>[t.title,t.notes.slice(0,3)]));
