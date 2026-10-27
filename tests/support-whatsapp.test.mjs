import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=read('public/stock/gestlok-support.js');
const migration=read('supabase/migrations/20261024_gestlok_support_whatsapp.sql');
const app=read('public/stock/app.js');

function environment(role='gerente',ownerName='Gisela'){
  const handlers={},elems={};
  const document={
    addEventListener:(type,fn)=>handlers[type]=fn,
    querySelector:q=>elems[q]??null,
    createElement:tag=>({tag,addEventListener(){},setAttribute(){},remove(){delete elems['#gl-soporte-whatsapp'];}}),
    body:{appendChild(el){elems['#'+el.id]=el;}},
    get hidden(){return false;},
    visibilityState:'visible',activeElement:null
  };
  const window={setInterval(){}};
  const data={whatsapp:'5491144715168'};
  const state={
    db:{},me:{email:'manager@example.invalid',name:'Operador'},
    local:'munro',view:'stock',provOpen:'',equipo:[
      {rol:'dueno',nombre:ownerName,email:'owner@example.invalid'}
    ]
  };
  const calls=[];
  window.GestLokSupabase={
    from:()=>({select:()=>({eq:()=>({single:async()=>({data,error:null})})})}),
    rpc:async(name,args)=>{calls.push({name,args});data.whatsapp=args.p_phone;return {data:args.p_phone,error:null};}
  };
  new Script(code).runInNewContext({window,document,Number,String,Promise,Object,
    encodeURIComponent,FormData});
  const appCtx={
    S:state,miRol:()=>role,isCreadora:()=>role==='creadora',localNombre:()=> 'Munro',
    nombreHoja:id=>({'stock':'Stock','h-stock-cajas':'Stock cajas'}[id]||'Inicio'),
    toast:()=>{},renderHub:()=>{}
  };
  window.GestLokSupport.attach(appCtx);
  return {window,document,handlers,state,data,calls,appCtx,elems,support:window.GestLokSupport};
}
test('En Munro, el mensaje incluye exactamente el dueño y la hoja abierta',async()=>{
  const e=environment();
  await e.support.load();
  assert.equal(e.support.message(),
    'Hola soy de Munro de la empresa de Gisela necesito ayuda en el sector de Stock');
  e.state.view='h-stock-cajas';
  assert.equal(e.support.message(),
    'Hola soy de Munro de la empresa de Gisela necesito ayuda en el sector de Stock cajas');
  assert.equal(e.support.link(),
    'https://wa.me/5491144715168?text='+encodeURIComponent(e.support.message()));
  e.support.render();
  assert.equal(e.elems['#gl-soporte-whatsapp'].href,e.support.link());
});
test('Detecta el sector del pedido, chat, carpeta de proveedor y conteo diario',()=>{
  const e=environment();
  e.state.view='pedidos-online';assert.equal(e.support.sector(),'Pedidos online');
  e.state.view='chat';assert.equal(e.support.sector(),'Chat del local');
  e.state.view='proveedores';e.state.provOpen='Distribuidora Central';
  assert.equal(e.support.sector(),'Proveedores / Distribuidora Central');
  e.state.view='diario';assert.equal(e.support.sector(),'Conteo Diario');
});
test('Dueño y Gerente ven Soporte; la creadora y otros roles no',async()=>{
  for(const role of ['dueno','gerente','lectura','creadora']){
    const e=environment(role);
    await e.support.load();
    e.support.render();
    assert.equal(!!e.elems['#gl-soporte-whatsapp'],['dueno','gerente'].includes(role));
    assert.equal(!!e.support.adminCard(),role==='creadora');
  }
});
test('Admite formato local argentino y número internacional sin alterar otros países',()=>{
  const e=environment().support;
  assert.equal(e.normalized('11 4471-5168'),'5491144715168');
  assert.equal(e.normalized('011 4471-5168'),'5491144715168');
  assert.equal(e.normalized('+54 9 11 4471 5168'),'5491144715168');
  assert.equal(e.normalized('541144715168'),'5491144715168');
  assert.equal(e.normalized('+34 612 345 678'),'34612345678');
  assert.equal(e.normalized('abc'),'');
  assert.equal(e.normalized('123'),'');
});
test('Formulario solo disponible a la creadora; seguridad en SQL',()=>{
  const e=environment('creadora');
  const html=e.support.adminCard();
  assert.match(html,/id="gl-support-form"/);
  assert.match(html,/Guardar número/);
  assert.match(migration,/gestlok_platform\.admins/);
  assert.match(migration,/auth\.uid\(\)/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/grant select on public\.gestlok_support_settings to authenticated/);
  assert.match(migration,/revoke all on public\.gestlok_support_settings from public, anon, authenticated/);
  assert.match(migration,/gestlok_creator_prepare_company_named/);
  assert.match(app,/GestLokSupport\?\.render\(\)/);
  assert.match(app,/GestLokSupport\?\.adminCard\(\)/);
  assert.match(read('components/stock-runtime.tsx'),/gestlok-support\.js/);
  assert.doesNotMatch(migration,/\btruncate\b|\bdrop\s+table\b/i);
});
