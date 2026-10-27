import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/stock/gestlok-creator-mode.js','utf8');
function load(rpc,creadora=true){
 const calls=[];const window={GestLokSupabase:{rpc:async(fn)=>{calls.push(fn);return rpc(fn);}}};
 vm.runInNewContext(source,{window,document:{addEventListener(){}}});
 const m=window.GestLokCreatorMode;m.attach({isCreadora:()=>creadora,onChange(){}});
 return {m,calls};
}
test('La edición permanente exige confirmación del backend y falla cerrada sin conexión',async()=>{
 const {m}=load(async()=>({error:{message:'offline'}}));assert.equal(m.readOnly(),true);
 await m.refresh();assert.equal(m.readOnly(),true);
});
test('La creadora verificada puede editar sin vencimiento ni habilitación manual',async()=>{
 const {m,calls}=load(async()=>({data:{active:true,permanent:true,expires_at:null},error:null}));
 await m.refresh();assert.equal(m.readOnly(),false);assert.equal(m.state().permanent,true);
 assert.match(m.banner(),/Edición sin límite de tiempo/);assert.doesNotMatch(m.banner(),/30 min|data-creator-mode/);
 assert.deepEqual(calls,['gestlok_creator_editing_state']);
});
test('Una respuesta temporal o inválida no concede acceso permanente',async()=>{
 const {m}=load(async()=>({data:{active:true,expires_at:new Date(Date.now()+1800000).toISOString()}}));
 await m.refresh();assert.equal(m.readOnly(),true);
});
test('Otros roles no consultan el permiso ni reciben controles de creadora',async()=>{
 const {m,calls}=load(async()=>({data:{active:true,permanent:true}}),false);
 await m.refresh();assert.equal(m.banner(),'');assert.equal(calls.length,0);
});
