import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/stock/gestlok-creator-mode.js','utf8');
function load(rpc,{creadora=true,reason='Corrección pedida'}={}){
 const listeners={},calls=[],toasts=[];let changes=0;
 const window={prompt:()=>reason,GestLokSupabase:{rpc:async(fn,args)=>{calls.push([fn,args]);return rpc(fn,args);}}};
 vm.runInNewContext(source,{window,document:{addEventListener(n,f){listeners[n]=f;},visibilityState:'visible'},setTimeout,clearTimeout,Date});
 const m=window.GestLokCreatorMode;m.attach({isCreadora:()=>creadora,toast:(t,e)=>toasts.push([t,!!e]),onChange:()=>changes++});
 return {m,calls,toasts,listeners,changes:()=>changes};
}
const click=(listeners,mode)=>listeners.click({preventDefault(){},target:{closest:()=>({dataset:{creatorMode:mode}})}});
const tick=()=>new Promise(r=>setTimeout(r,0));
test('La creadora empieza en solo lectura, también si el backend no responde',async()=>{
 const {m}=load(async()=>({data:null,error:{message:'offline'}}));
 assert.equal(m.readOnly(),true);await m.refresh();assert.equal(m.readOnly(),true);
 assert.match(m.banner(),/Modo consulta: solo lectura/);assert.match(m.banner(),/data-creator-mode="on"/);
});
test('Habilitar edición pide motivo, dura 30 minutos y se puede cerrar',async()=>{
 const exp=new Date(Date.now()+1800000).toISOString();
 const {m,calls,listeners}=load(async fn=>fn==='gestlok_creator_enable_editing'?{data:{active:true,expires_at:exp},error:null}:{data:{active:false,expires_at:null},error:null});
 click(listeners,'on');await tick();await tick();
 const call=calls.find(c=>c[0]==='gestlok_creator_enable_editing');
 assert.equal(call[1].p_minutes,30);assert.equal(call[1].p_reason,'Corrección pedida');
 assert.equal(m.readOnly(),false);assert.match(m.banner(),/Edición habilitada hasta/);assert.match(m.banner(),/data-creator-mode="off"/);
 click(listeners,'off');await tick();await tick();
 assert.ok(calls.some(c=>c[0]==='gestlok_creator_disable_editing'));assert.equal(m.readOnly(),true);
});
test('Sin motivo no se pide habilitación; un permiso vencido vuelve a solo lectura',async()=>{
 const {m,calls,listeners}=load(async()=>({data:{active:true,expires_at:new Date(Date.now()-1000).toISOString()},error:null}),{reason:''});
 click(listeners,'on');await tick();
 assert.equal(calls.filter(c=>c[0]==='gestlok_creator_enable_editing').length,0);
 await m.refresh();assert.equal(m.readOnly(),true);
});
test('Otros roles no ven el aviso de la creadora',()=>{
 const {m}=load(async()=>({data:null,error:null}),{creadora:false});
 assert.equal(m.banner(),'');
});
