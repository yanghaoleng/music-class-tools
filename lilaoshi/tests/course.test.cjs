const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),course=JSON.parse(fs.readFileSync(path.join(root,'web/course.json'))),ctx={window:{},Math};
for(const name of ['question-run','chapter-score','chapter-practice'])vm.runInNewContext(fs.readFileSync(path.join(root,`web/${name}.js`),'utf8'),ctx);
test('seven progressive chapters have complete, original exercise data and synchronized navigation',()=>{
 assert.equal(course.questions.length,56);assert.equal(course.chapters.length,7);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.RefinePractice.menu.chapters)),course.chapters);
 for(const ch of course.chapters){const qs=course.questions.filter(q=>q.chapter===ch.id);assert.equal(qs.length,8);assert.equal(qs.filter(q=>q.kind==='open').length,2)}
 for(const [i,q]of course.questions.entries()){assert.equal(q.id,i);assert.ok(q.sources.every(s=>s.url.startsWith('https://')));assert.ok(q.visuals.every(v=>v.kind==='music'));if(q.kind==='choice'){assert.equal(q.visuals.length,2);assert.ok(q.coachOpening.length);assert.ok([0,1].includes(q.correct))}}
});
test('shuffling A/B preserves musical A and B note names in all explanations and matching audio',()=>{
 for(const base of course.questions)for(const variant of ['base','alternate'])for(const order of [[0,1],[1,0]]){
  const q=ctx.window.RefineRun.resolve(base,variant,order);assert.equal(q.id,base.id);assert.equal(q.why,base.why);
  if(q.kind==='choice'){assert.equal(order[q.correct],base.correct);assert.deepEqual(q.visuals[q.correct].notes,base.visuals[base.correct].notes);assert.deepEqual(q.coachOpening,base.coachOpening)}
 }
});
test('a skipped question returns, and a wrong answer requires correcting only that question to pass',()=>{
 const qs=course.questions.slice(0,8),run=ctx.window.RefineRun.create(qs),deferred=ctx.window.RefineRun.defer(run.order,0,{});
 assert.equal(deferred.at(-1),run.order[0]);assert.equal(new Set(deferred).size,8);
 const answers=Object.fromEntries(qs.map(q=>[q.id,1]));answers[3]=0;assert.equal(ctx.window.RefineScores.calculate(qs,answers).passed,false);
 const plan=ctx.window.RefinePractice.prepare(qs,{answers});assert.deepEqual(Array.from(plan.questions,q=>q.id),[3]);
 const merged=ctx.window.RefinePractice.merge(qs,plan.baseline,{3:1});assert.equal(ctx.window.RefineScores.calculate(qs,merged).passed,true);
});
test('audio stimuli encode the intended pitch, duration, silence and simultaneous chords',()=>{
 const timers=[],sounds=[],fakeDocument={addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
 class AudioContext{constructor(){this.currentTime=10;this.state='running';this.destination={}}async resume(){}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}createOscillator(){const entry={};sounds.push(entry);return {frequency:{set value(v){entry.frequency=v}},connect(){},disconnect(){},start(t){entry.start=t},stop(t){entry.end=t}}}}
 const scope={window:{AudioContext},document:fakeDocument,setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},console};vm.runInNewContext(fs.readFileSync(path.join(root,'web/music.js'),'utf8'),scope);
 const button=()=>({classList:{add(){},remove(){}},setAttribute(){},closest(){return null}});
 return (async()=>{
  await scope.window.MusicClass.play({notes:[69,null,72],durations:[1,1,1],bpm:60},button());assert.equal(sounds[0].frequency,440);assert.ok(Math.abs(sounds[3].start-sounds[0].start-2)<1e-8);
  scope.window.MusicClass.stop();sounds.length=0;await scope.window.MusicClass.play({mode:'chord',notes:[60,64,67],bpm:60},button());assert.equal(sounds.length,9);assert.equal(new Set(sounds.map(s=>s.start)).size,1);
 })();
});
