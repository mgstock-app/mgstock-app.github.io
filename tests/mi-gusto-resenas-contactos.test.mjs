import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const moduleCode=read('public/stock/mi-gusto-resenas-contactos.js');
const migration=read('supabase/migrations/20261030212421_mi_gusto_resenas_mensajes_whatsapp.sql');

function widget(role='gerente',branch='munro'){
 const handlers={}; const calls=[]; const notices=[];
 const name=role==='gerente'?'Mariana Díaz':'Cliente';
 const base='<section class="rv-page"><button class="rv-new" data-rv="new">Nuevo cupón</button>'+
 '<div class="rv-table"><table><tbody><tr><td>'+name+'</td><td>1122337788</td>'+
 '<td><b>ABC234</b></td><td>pendiente</td><td>30/10/26</td>'+
 '<td><button data-rv="edit" data-id="1">Ver / Modificar</button></td></tr></tbody></table></div>'+
 '<div class="rv-code"><small>Cupón · 10% OFF</small><strong>ABC234</strong></div>'+
 '<p>▣ Válido del 1 al 12 de noviembre 2026</p></section>';
 const window={GestLokResenas:{
   _t:{E:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),normalizePhone:s=>String(s).replace(/\\D/g,'')},
   permitido:()=>['gerente','dueno','creadora'].includes(role),
   view:()=>base,attach(){},subscribe(){},reset(){}
 },GestLokSupabase:{rpc:async(fn,args)=>{calls.push([fn,args]);return {data:null,error:null};}}};
 const document={activeElement:null,addEventListener:(event,handler)=>{handlers[event]=handler;}};
 const api={S:{local:branch,view:'resenas',offline:false},toast:(...x)=>notices.push(x),render:()=>{}};
 runInNewContext(moduleCode,{window,document,navigator:{onLine:true,clipboard:{writeText:async s=>notices.push(['copied',s])}},FormData,Intl,Date,Promise,setTimeout,clearTimeout});
 window.GestLokResenas.attach(api);
 return {view:()=>window.GestLokResenas.view(),handlers,calls,notices,module:window.GestLokResenasComunicaciones,window};
}

test('El mensaje de agradecimiento y cupón combina datos correctos sin mezclas de sucursales',()=>{
 const m=widget();
 assert.match(m.view(),/Agradecimiento y cupón/);
 assert.match(m.view(),/Copiar mensaje para Mariana/);
 assert.match(m.view(),/https:\/\/wa.me\/5491122337788/);
 assert.match(m.view(),/10% OFF · Mi Gusto Munro/);
 assert.match(m.view(),/de lunes a jueves/);
 assert.match(m.view(),/6 unidades o más/);
 assert.match(m.view(),/No acumulable con otras promociones/);
 assert.match(m.view(),/Copiar cupón con condiciones/);
 assert.match(m.module.defaultMessage('munro'),/¡Hola, \{nombre\}!/);
 assert.doesNotMatch(m.module.defaultMessage('munro'),/g\.page/);
 assert.equal(m.module.couponValidity({period:'2026-11-01'}),'del 1 al 12 de noviembre 2026');
 const one=m.module.messageForCoupon({id:'1',local:'munro',customer_name:'Mariana Díaz',code:'ABC234',period:'2026-11-01',status:'pending'});
 assert.match(one,/¡Hola, Mariana Díaz!/);
 assert.match(one,/ABC234 — 10% OFF/);
 assert.match(one,/del 1 al 12 de noviembre 2026/);
 assert.match(one,/lunes a jueves/);
 assert.match(one,/6 unidades o más/);
 assert.match(one,/Exclusivo en \*Mi Gusto Munro\*/);
 assert.match(one,/No acumulable/);
 assert.doesNotMatch(one,/g\.page|google\.com\/maps/);
 assert.doesNotMatch(one,/7 unidades o más/);
 assert.doesNotMatch(one,/\{nombre\}/);
 assert.equal(m.module.messageForCoupon({local:'torcuato',code:'ABC234'}),'');
 assert.equal(m.module.phoneNumber('1122337788'),'5491122337788');
 assert.match(m.module.couponText('ABC234','del 1 al 12 de noviembre 2026'),/Exclusivo para Mi Gusto Munro/);
 const torcuato=widget('gerente','torcuato');
 assert.match(torcuato.view(),/10% OFF · Mi Gusto Torcuato/);
 assert.match(torcuato.module.couponText('XYZ999','del 1 al 12 de diciembre 2026'),/Exclusivo para Mi Gusto Torcuato/);
 const two=torcuato.module.messageForCoupon({local:'torcuato',customer_name:'Estela',code:'XYZ999',period:'2026-12-01'});
 assert.match(two,/Mi Gusto Torcuato/);
 assert.match(two,/del 1 al 12 de diciembre 2026/);
 assert.doesNotMatch(two,/Mi Gusto Munro/);
});


test('El portapapeles obtiene el código de la base y no copia cupones usados',async()=>{
 const m=widget();
 m.window.GestLokSupabase.rpc=async(fn,args)=>{
   assert.equal(fn,'gestlok_resenas_list');
   assert.equal(args.p_local,'munro');
   return {data:[{id:'1',local:'munro',customer_name:'Mariana Díaz',code:'ABC234',valid_from:'2026-11-01',status:'pending'}],error:null};
 };
 const event={target:{closest:()=>({dataset:{glRv:'copy-message',id:'1'}})},preventDefault(){},stopImmediatePropagation(){}};
 m.handlers.click(event);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert(m.notices.some(n=>n[0]==='copied'&&n[1].includes('ABC234')&&n[1].includes('Mariana Díaz')&&n[1].includes('noviembre 2026')));
 m.notices.length=0;
 m.window.GestLokSupabase.rpc=async()=>({data:[{id:'1',local:'munro',customer_name:'Mariana Díaz',code:'ABC234',period:'2026-11-01',status:'used'}],error:null});
 m.handlers.click(event);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert(!m.notices.some(n=>n[0]==='copied'));
});

test('Los roles sin autorización no acceden al panel de contacto',()=>{
 const m=widget('colaborador');
 assert.doesNotMatch(m.view(),/Mensaje para clientes/);
 assert.doesNotMatch(m.view(),/https:\/\/wa.me/);
 assert.equal(m.module.permitted(),false);
});

test('Las plantillas de cada sucursal solo están accesibles con RLS y funciones autorizadas',async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon; create role authenticated; create schema auth; create schema gestlok_resenas_private;");
  await db.exec("create function auth.uid() returns uuid language sql stable as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;");
  await db.exec("create function gestlok_resenas_private.authorized(p_local text) returns boolean language sql stable as $$select current_setting('test.role',true)='gerente' and p_local=current_setting('test.local',true)$$;");
  await db.exec(migration);
  await db.query("select set_config('test.role','gerente',false)");
  await db.query("select set_config('test.local','munro',false)");
  await db.exec('set role authenticated');
  const text='Gracias por tu compra. Nos encanta conocer tu experiencia y leer tu opinión sincera.';
  const saved=(await db.query("select public.gestlok_resenas_message_save('munro',$1) r",[text])).rows[0].r;
  assert.equal(saved.local,'munro');
  assert.equal((await db.query("select public.gestlok_resenas_message_get('munro') r")).rows[0].r.body,text);
  await assert.rejects(()=>db.query("select public.gestlok_resenas_message_get('torcuato')"),/denegado/);
  await assert.rejects(()=>db.query("select public.gestlok_resenas_message_save('torcuato',$1)",[text]),/denegado/);
  await assert.rejects(()=>db.query("select * from gestlok_resenas_private.message_templates"),/permission denied/);
  await db.exec('reset role');
  await db.query("select set_config('test.role','colaborador',false)");
  await db.exec('set role authenticated');
  await assert.rejects(()=>db.query("select public.gestlok_resenas_message_get('munro')"),/denegado/);
  await db.exec('reset role; set role anon');
  await assert.rejects(()=>db.query("select public.gestlok_resenas_message_get('munro')"),/permission denied/);
 } finally {await db.close();}
});

test('La integración carga el complemento y lo agrega a la caché PWA',()=>{
 assert.match(read('public/stock/mi-gusto-resenas.js'),/GestLokResenasComunicaciones\?\.decorateRows/);
 assert.match(read('components/stock-runtime.tsx'),/load\("\/stock\/mi-gusto-resenas-contactos\.js/);
 assert.match(read('scripts/sw-template.js'),/'\/stock\/mi-gusto-resenas-contactos\.js'/);
 assert.match(moduleCode,/gestlok_resenas_message_get/);
 assert.match(moduleCode,/gestlok_resenas_message_save/);
 assert.match(moduleCode,/rel="noopener noreferrer"/);
 assert.doesNotMatch(moduleCode,/localStorage|sessionStorage/);
});
