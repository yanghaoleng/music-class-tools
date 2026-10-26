const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const app=fs.readFileSync('web/app.js','utf8');
test('a passed chapter continues forward, the final chapter returns to the menu, and mistakes remain targeted',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('function chapterResultAction('),app.indexOf('function result(){')),ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.chapterResultAction(true,1,4,0))),{label:'学习下一章',chapter:2,mistakes:false});
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.chapterResultAction(true,3,4,0))),{label:'返回课程目录',chapter:null,mistakes:false});
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.chapterResultAction(false,1,4,3))),{label:'消灭错题（3）',chapter:1,mistakes:true});
});
function composer(){
 const handlers={},sizes={},send={disabled:false},form={count:0,querySelector:()=>send,requestSubmit(){this.count++}},input={id:'chat-input',value:'',style:{},disabled:false,form,scrollHeight:34,closest:()=>({style:{setProperty:(name,value)=>sizes[name]=value}}),addEventListener:(name,fn)=>handlers[name]=fn};let resize;
 const ctx={Map,innerHeight:900,document:{activeElement:null,createElement:()=>({getContext:()=>({measureText:text=>({width:text.length*10})})})},getComputedStyle:()=>({font:'14px sans-serif'}),ResizeObserver:class{constructor(fn){resize=fn}observe(){}disconnect(){}},requestAnimationFrame:()=>{},revealConversation(){}};
 vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('const chatComposerBindings='),app.indexOf('function updateSend(){')),ctx);ctx.bindChatComposer(input);return {ctx,input,sizes,send,form,handlers,resize:width=>resize([{contentRect:{width}}])};
}
test('composer grows by its longest line and adjusts height after wrapping or resizing, then resets after sending',()=>{
 const e=composer();assert.equal(e.input.style.height,'34px');e.input.value='1234567890\n123';e.input.scrollHeight=100;e.handlers.input();assert.equal(e.sizes['--composer-content'],'190px');assert.equal(e.input.style.height,'100px');
 e.input.scrollHeight=144;e.resize(200);assert.equal(e.input.style.height,'144px');e.input.scrollHeight=400;e.resize(120);assert.equal(e.input.style.height,'240px');assert.equal(e.input.style.overflowY,'auto');
 e.input.value='';e.input.scrollHeight=34;e.ctx.fitChatComposer(e.input);assert.equal(e.input.style.height,'34px');assert.equal(e.input.style.overflowY,'hidden');
});
test('Enter sends, Shift+Enter inserts a line break, and composing or pending messages cannot submit',()=>{
 const e=composer();let prevented=0;const key=extra=>e.handlers.keydown({key:'Enter',preventDefault(){prevented++},...extra});
 key({});assert.equal(e.form.count,1);key({shiftKey:true});assert.equal(e.form.count,1);assert.equal(prevented,1);
 key({isComposing:true});key({keyCode:229});e.send.disabled=true;key({});assert.equal(e.form.count,1);
});
