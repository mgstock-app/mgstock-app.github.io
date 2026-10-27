import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/stock/gestlok-creator-support.js','utf8');
function load(rpc,{creadora=true,reason='Revisión visual',preview='',me={tenant_id:'own'}}={}){
 const listeners={},calls=[],toasts=[],store=new Map(preview?[['gestlok-preview-rol',preview]]:[]);let reloads=0;
 const el={remove(){this.gone=true;},setAttribute(){},style:{}};
 const window={prompt:()=>reason,sessionStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},GestLokSupabase:{rpc:async(fn,args)=>{calls.push([fn,args]);return rpc(fn,args);}}};
 const document={addEventListener(n,f){listeners[n]=f;},visibilityState:'visible',getElementById:()=>null,createElement:()=>el,body:{prepend(){}}};
 vm.runInNewContext(source,{window,document,location:{reload(){reloads++;}},setTimeout:(f,ms)=>{const t=setTimeout(f,ms);t.unref?.();return t;},clearTimeout,Date});
 const s=window.GestLokCreatorSupport;s.attach({isCreadora:()=>creadora,toast:(t,e)=>toasts.push([t,!!e]),S:{me}});
 return {s,calls,toasts,listeners,reloads:()=>reloads,store};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
const target=(attr,dataset)=>({preventDefault(){},target:{closest:sel=>sel===attr?{dataset}:null}});
test('Abrir otra empresa pide motivo, dura 30 minutos y recarga',async()=>{
 const {s,calls,listeners,reloads}=load(async()=>({data:{active:true,name:'Perfumes',expires_at:new Date(Date.now()+1800000).toISOString()},error:null}));
 listeners.click(target('[data-support-open]',{supportOpen:'t-2',supportName:'Perfumes'}));await tick();await tick();
 const c=calls.find(x=>x[0]==='gestlok_creator_open_company');
 assert.equal(c[1].p_tenant,'t-2');assert.equal(c[1].p_minutes,30);assert.equal(c[1].p_reason,'Revisión visual');
 assert.equal(reloads(),1);assert.equal(s.state().active,true);
});
test('Sin motivo no se abre nada, y quien no es creadora no puede abrir',async()=>{
 let r=load(async()=>({data:{},error:null}),{reason:''});
 r.listeners.click(target('[data-support-open]',{supportOpen:'t-2'}));await tick();
 assert.equal(r.calls.length,0);
 r=load(async()=>({data:{},error:null}),{creadora:false});
 r.listeners.click(target('[data-support-open]',{supportOpen:'t-2'}));await tick();
 assert.equal(r.calls.length,0);
});
test('Salir cierra la sesión de soporte y recarga',async()=>{
 const {calls,listeners,reloads}=load(async()=>({data:{active:false},error:null}));
 listeners.click(target('[data-support-close]',{}));await tick();await tick();
 assert.ok(calls.some(c=>c[0]==='gestlok_creator_close_company'));assert.equal(reloads(),1);
});
test('La vista previa por rol solo aplica a la creadora y solo con roles conocidos',()=>{
 assert.equal(load(async()=>({}),{preview:'gerente'}).s.previewRol(),'gerente');
 assert.equal(load(async()=>({}),{preview:'dueno'}).s.previewRol(),'dueno');
 assert.equal(load(async()=>({}),{preview:'creadora'}).s.previewRol(),'');
 assert.equal(load(async()=>({}),{preview:'admin'}).s.previewRol(),'');
 assert.equal(load(async()=>({}),{preview:'gerente',creadora:false}).s.previewRol(),'','un gerente real no puede activar una vista previa');
});
test('El botón de consulta no aparece sobre la propia empresa; la vista previa ofrece tres roles',()=>{
 const {s}=load(async()=>({}));
 assert.match(s.openButton('own','Mi Gusto'),/Tu empresa/);
 assert.match(s.openButton('t-2','Perfumes'),/data-support-open="t-2"/);
 const card=s.previewCard();for(const k of ['dueno','gerente','lectura'])assert.match(card,new RegExp('data-preview-rol="'+k+'"'));
 assert.match(card,/No cambia permisos ni datos/);
});
test('Un estado de soporte que falla deja la pantalla normal',async()=>{
 const {s}=load(async()=>({data:null,error:{message:'x'}}),{me:{tenant_id:'own',support:true}});
 await s.refresh();assert.equal(s.state().active,false);
});
