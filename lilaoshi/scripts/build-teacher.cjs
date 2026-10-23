// Derive production sprites and icons from the generated, transparent master atlas.
const fs=require('node:fs/promises');
const path=require('node:path');
let sharp;try{sharp=require('sharp')}catch{sharp=require('/Users/jojo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')}
const root=path.resolve(__dirname,'..'),out=path.join(root,'web/assets');
const moods=['neutral','happy','thinking','curious','surprised','encouraging','empathetic','confused','playful','delighted','approving','inspired','relieved','grateful','amused','cool','confident','mischievous'];
(async()=>{
 const source=path.join(root,'design/teacher-master.png'),meta=await sharp(source).metadata(),cell=meta.width/6;
 if(meta.width!==meta.height||!Number.isInteger(cell)||!meta.hasAlpha)throw Error('Expected square transparent 6×6 master atlas');
 await fs.mkdir(path.join(out,'icons'),{recursive:true});
 const cells=[];
 for(let i=0;i<36;i++)cells.push(await sharp(source).extract({left:(i%6)*cell,top:Math.floor(i/6)*cell,width:cell,height:cell}).resize(192,192).png().toBuffer());
 async function atlas(file,indices,cols){const height=Math.ceil(indices.length/cols)*192;await sharp({create:{width:cols*192,height,channels:4,background:'#00000000'}}).composite(indices.map((index,i)=>({input:cells[index],left:i%cols*192,top:Math.floor(i/cols)*192}))).webp({quality:84}).toFile(path.join(out,file))}
 await atlas('teacher-emotions.webp',Array.from({length:18},(_,i)=>i),6);
 await atlas('teacher-positive-emotions.webp',Array.from({length:12},(_,i)=>i+18),6);
 await atlas('teacher-cool-expressions.webp',[30,32,34,31,33,35],3);
 await atlas('teacher-gaze.webp',[6,4,7,5],2);
 for(let i=0;i<moods.length;i++)for(const [size,ext]of [[96,'webp'],[32,'png'],[180,'png']]){let img=sharp(cells[i*2]).resize(size,size);await img[ext]().toFile(path.join(out,'icons',`${moods[i]}-${size}.${ext}`))}
 for(const [file,size]of [['teacher-friendly-96.webp',96],['teacher-friendly-192.webp',192],['favicon-teacher-32.png',32],['apple-touch-teacher.png',180]]){const img=sharp(cells[0]).resize(size,size);await img[file.endsWith('.webp')?'webp':'png']().toFile(path.join(out,file))}
 // ICO directory plus a PNG image payload: readable by current desktop browsers.
 const png=await sharp(cells[0]).resize(32).png().toBuffer(),ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=32;ico[7]=32;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);await fs.writeFile(path.join(out,'favicon-teacher.ico'),Buffer.concat([ico,png]));
 console.log(`Built 18 teacher expressions, four sprite atlases and 58 app icons from ${meta.width}×${meta.height} transparent master.`);
})();
