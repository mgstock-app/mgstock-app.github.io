import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/stock/auth.js','utf8');
const session={user:{id:'synthetic-user',email:'owner@example.invalid'}};
const tick=()=>new Promise(r=>setImmediate(r));
function setup(hash=''){
 let event,resolve,reject,calls=0;
 const pending=new Promise((a,b)=>{resolve=a;reject=b;});
 const box={hidden:false,querySelectorAll:()=>[],querySelector:()=>null};
 const message={};const logout={hidden:true};
 const document={readyState:'complete',addEventListener(){},documentElement:{classList:{add(){},remove(){}}},querySelector:s=>s==='#auth'?box:s==='#au-msg'?message:s==='#logout-wrap'?logout:null};
 const sb={auth:{onAuthStateChange:f=>{event=f;},getSession:()=>pending},rpc:async()=>{calls++;return {data:{rol:'dueno',locales:['munro'],tenant_id:'test-company'}};}};
 const window={SPM_CONFIG:{},supabase:{createClient:()=>sb},addEventListener(){}};
 vm.runInNewContext(source,{window,document,location:{origin:'https://test.invalid',pathname:'/',search:'',hash},history:{replaceState(){}},URLSearchParams,console,setTimeout,clearInterval,navigator:{onLine:true}});
 return {event:(...x)=>event(...x),resolve,reject,box,message,calls:()=>calls,window};
}
test('INITIAL_SESSION and getSession bootstrap only once',async()=>{
 const h=setup();h.event('INITIAL_SESSION',session);h.resolve({data:{session}});await tick();
 assert.equal(h.calls(),1);assert.equal(h.box.hidden,true);
 assert.equal((await (await h.window.claude.use('user')).me()).tenant_id,'test-company');
});
for(const kind of ['empty','error','reject'])test('late '+kind+' getSession does not reopen login',async()=>{
 const h=setup();h.event('INITIAL_SESSION',session);await tick();
 if(kind==='reject')h.reject(new Error('network'));else h.resolve({data:{session:null},error:kind==='error'?new Error('network'):null});
 await tick();assert.equal(h.box.hidden,true);assert.equal(h.calls(),1);
});
test('visitor and recovery do not load private data',async()=>{
 const visitor=setup();visitor.resolve({data:{session:null}});await tick();assert.equal(visitor.box.hidden,false);assert.equal(visitor.calls(),0);
 const recovery=setup('#type=recovery');recovery.event('PASSWORD_RECOVERY',session);recovery.resolve({data:{session}});await tick();assert.equal(recovery.calls(),0);assert.match(recovery.message.textContent,/contraseña nueva/);
});
