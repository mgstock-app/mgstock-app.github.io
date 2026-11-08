import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/stock/gestlok-creator-support.js','utf8');
function load(rpc,{creadora=true,reason='Revisión visual',preview='',me={tenant_id:'own'},storageFails=false,offlineFails=false}={}){
 const listeners={},calls=[],toasts=[],store=new Map(preview?[['gestlok-preview-rol',preview]]:[]);let reloads=0;
 const el={remove(){this.gone=true;},setAttribute(){},style:{}};
 const window={prompt:()=>reason,sessionStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(storageFails)throw Error('Storage blocked');store.set(k,v);},removeItem:k=>store.delete(k)},GestLokSupabase:{rpc:async(fn,args)=>{calls.push([fn,args]);return rpc(fn,args);}}};
 if(offlineFails)window.GestLokOffline={pending:async()=>0,invalidateContext:async()=>{throw Error('IndexedDB no disponible');}};
 const document={addEventListener(n,f){listeners[n]=f;},visibilityState:'visible',getElementById:()=>null,createElement:()=>el,body:{prepend(){}}};
 vm.runInNewContext(source,{window,document,location:{reload(){reloads++;}},setTimeout:(f,ms)=>{const t=setTimeout(f,ms);t.unref?.();return t;},clearTimeout,Date});
 const s=window.GestLokCreatorSupport;s.attach({isCreadora:()=>creadora,toast:(t,e)=>toasts.push([t,!!e]),S:{me}});
 return {s,calls,toasts,listeners,reloads:()=>reloads,store};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
const target=(attr,dataset)=>({preventDefault(){},target:{closest:sel=>sel===attr?{dataset}:null}});
test('Abrir otra empresa sin ventana emergente valida acceso, registra motivo y recarga',async()=>{
 const {s,calls,listeners,reloads}=load(async(fn,args)=>({
   data:fn==='gestlok_my_role_contexts'?[]:{
     active:true,tenant_id:args?.p_tenant||'t-2',name:'Perfumes',
     expires_at:new Date(Date.now()+1800000).toISOString()
   },error:null
 }));
 listeners.click(target('[data-support-open]',{supportOpen:'t-2',supportName:'Perfumes'}));await tick();await tick();
 const c=calls.find(x=>x[0]==='gestlok_creator_open_company');
 assert.equal(c[1].p_tenant,'t-2');assert.equal(c[1].p_minutes,60);
 assert.match(c[1].p_reason,/Revisión administrativa/);
 assert.equal(reloads(),1);
});
test('No depender del motivo manual: el botón no pide prompt; solo creadora puede abrir',async()=>{
 let r=load(async(fn,args)=>({
   data:fn==='gestlok_my_role_contexts'?[]:{
     tenant_id:args?.p_tenant||'t-2',active:true,name:'Empresa',
     expires_at:new Date(Date.now()+1800000).toISOString()
   },error:null
 }),{reason:''});
 r.listeners.click(target('[data-support-open]',{supportOpen:'t-2'}));await tick();await tick();
 assert.equal(r.reloads(),1);
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

test('Abrir un local de otra empresa conserva destino y cuenta antes de recargar',async()=>{
 const {calls,listeners,reloads,store}=load(async(fn,args)=>({
   data:fn==='gestlok_my_role_contexts'?[]:
     {tenant_id:args?.p_tenant||'other',active:true},error:null
 }),{me:{tenant_id:'own',email:'Admin@Example.com'}});
 listeners.click(target('[data-company-local]',{companyTenant:'other',companyLocal:'munro',companyName:'Otra empresa'}));await tick();await tick();
 assert.ok(calls.some(c=>c[0]==='gestlok_my_role_contexts'));
 const supportCall=calls.find(c=>c[0]==='gestlok_creator_open_company');
 assert.ok(supportCall);assert.equal(supportCall[1].p_tenant,'other');
 const target=JSON.parse(store.get('gestlok:profile-next-local'));
 assert.equal(target.email,'admin@example.com');
 assert.equal(target.tenant_id,'other');
 assert.equal(target.local_id,'munro');
 assert.equal(Number.isFinite(target.created_at),true);
 assert.equal(store.get('gestlok-admin-tab'),'locales');assert.equal(reloads(),1);
});

test('Un local propio de la creadora abre su contexto comercial sin modo soporte',async()=>{
 const {calls,listeners,reloads,store}=load(async(fn,args)=>{
   if(fn==='gestlok_my_role_contexts')return {data:[
     {tenant_id:'molino',role:'creadora',local_names:[{id:'acassuso',name:'Acassuso'},{id:'san-isidro',name:'San Isidro'}]}],error:null};
   if(fn==='gestlok_creator_support_state')return {data:{active:false},error:null};
   if(fn==='gestlok_choose_role_context')return {data:{tenant_id:args.p_tenant,role:'creadora'},error:null};
   throw Error('No debe abrir soporte para un local propio');
 },{me:{tenant_id:'mi-gusto',email:'kmu15lopez@gmail.com'}});
 listeners.click(target('[data-company-local]',{companyTenant:'molino',companyLocal:'san-isidro',companyName:'El Molino Café'}));
 await tick();await tick();
 const chosen=calls.find(c=>c[0]==='gestlok_choose_role_context');
 assert.equal(chosen?.[1]?.p_tenant,'molino');
 assert.ok(!calls.some(c=>c[0]==='gestlok_creator_open_company'));
 assert.equal(JSON.parse(store.get('gestlok:profile-next-local')).local_id,'san-isidro');
 assert.equal(reloads(),1);
});

test('Un usuario sin membresía explícita conserva apertura auditada de soporte',async()=>{
 const {calls,listeners,reloads}=load(async(fn)=>{
   if(fn==='gestlok_my_role_contexts')return {data:[{tenant_id:'other',role:'lectura',local_names:[{id:'x'}]}],error:null};
   return {data:{tenant_id:'other',active:true},error:null};
 },{me:{tenant_id:'mi-gusto',email:'kmu15lopez@gmail.com'}});
 listeners.click(target('[data-company-local]',{companyTenant:'other',companyLocal:'x',companyName:'Terceros'}));
 await tick();await tick();
 assert.ok(calls.some(c=>c[0]==='gestlok_creator_open_company'));
 assert.ok(!calls.some(c=>c[0]==='gestlok_choose_role_context'));
 assert.equal(reloads(),1);
});

const MOLINO='6c8717ea-5f78-426b-9458-74a5dcac6e4e';
test('El Molino no muestra Abrir empresa por soporte auditado',()=>{
 const {s}=load(async()=>({data:{},error:null}));
 assert.equal(s.openButton(MOLINO,'El Molino Café'),'');
 assert.match(s.openButton('otro-tenant','Empresa ajena'),/data-support-open/);
});
test('El Molino no abre soporte auditado tampoco por botones secundarios',async()=>{
 const t=load(async()=>{throw Error('No debe invocar RPC de soporte');});
 t.listeners.click(target('[data-support-open]',{supportOpen:MOLINO,supportName:'El Molino Café'}));
 await tick();
 assert.equal(t.calls.length,0);
 assert.equal(t.reloads(),0);
 assert.ok(t.toasts.some(([message,error])=>error && message.includes('Ver locales')));
});
test('El Molino nunca abre una auditoría de soporte sin membresía verificada',async()=>{
 const t=load(async(fn)=>({data:fn==='gestlok_my_role_contexts'?[]:{},error:null}),
   {me:{tenant_id:'mi-gusto',email:'kmu15lopez@gmail.com'}});
 t.listeners.click(target('[data-company-local]',{companyTenant:MOLINO,companyLocal:'acassuso',companyName:'El Molino Café'}));
 await tick();await tick();
 assert.ok(!t.calls.some(([fn])=>fn==='gestlok_creator_open_company'));
 assert.ok(!t.calls.some(([fn])=>fn==='gestlok_choose_role_context'));
 assert.equal(t.reloads(),0);
 assert.ok(t.toasts.some(([message,err])=>err && message.includes('acceso directo')));
});
test('Tras elegir El Molino se recarga aunque falle el almacenamiento móvil',async()=>{
 const t=load(async(fn,args)=>{
   if(fn==='gestlok_my_role_contexts')return {data:[{tenant_id:MOLINO,role:'creadora',local_names:[{id:'acassuso'}]}],error:null};
   if(fn==='gestlok_creator_support_state')return {data:{active:false},error:null};
   if(fn==='gestlok_choose_role_context')return {data:{tenant_id:args.p_tenant,role:'creadora'},error:null};
   throw Error('No se debe abrir modo soporte');
 },{me:{tenant_id:'mi-gusto',email:'kmu15lopez@gmail.com'},storageFails:true,offlineFails:true});
 t.listeners.click(target('[data-company-local]',{companyTenant:MOLINO,companyLocal:'acassuso',companyName:'El Molino Café'}));
 await tick();await tick();
 assert.ok(t.calls.some(([fn])=>fn==='gestlok_choose_role_context'));
 assert.ok(!t.calls.some(([fn])=>fn==='gestlok_creator_open_company'));
 assert.equal(t.reloads(),1);
});

test('Cierra sesión de soporte previa desde el servidor antes de entrar a una empresa propia',async()=>{
 const t=load(async(fn,args)=>{
   if(fn==='gestlok_my_role_contexts')return {data:[{
     tenant_id:'molino',role:'creadora',local_names:[{id:'acassuso'}]
   }],error:null};
   if(fn==='gestlok_creator_support_state')return {data:{active:true,tenant_id:'perfumes'},error:null};
   if(fn==='gestlok_creator_close_company')return {data:{active:false},error:null};
   if(fn==='gestlok_choose_role_context')return {data:{tenant_id:args.p_tenant,role:'creadora'},error:null};
   throw Error('RPC inesperado '+fn);
 },{me:{tenant_id:'perfumes',email:'kmu15lopez@gmail.com',support:true}});
 t.listeners.click(target('[data-company-local]',{companyTenant:'molino',companyLocal:'acassuso',companyName:'El Molino Café'}));
 await tick();await tick();
 assert.deepEqual(t.calls.slice(0,4).map(x=>x[0]),[
   'gestlok_my_role_contexts','gestlok_creator_support_state',
   'gestlok_creator_close_company','gestlok_choose_role_context'
 ]);
 assert.equal(t.reloads(),1);
 assert.equal(JSON.parse(t.store.get('gestlok:profile-next-local')).local_id,'acassuso');
});

test('Rechaza redirección si RPC de soporte devuelve una empresa distinta',async()=>{
 const t=load(async(fn,args)=>{
   if(fn==='gestlok_my_role_contexts')return {data:[],error:null};
   return {data:{active:true,tenant_id:'un-tenant-distinto'},error:null};
 },{me:{tenant_id:'own',email:'kmu15lopez@gmail.com'}});
 t.listeners.click(target('[data-company-local]',{companyTenant:'perfumes',companyLocal:'un-local',companyName:'Perfumes'}));
 await tick();await tick();
 assert.equal(t.reloads(),0);
 assert.ok(t.toasts.some(([message,isError])=>isError&&message.includes('no autorizó')));
});
