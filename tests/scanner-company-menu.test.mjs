import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const js=readFileSync('public/stock/gestlok-scanner-menu.js','utf8');
const app=readFileSync('public/stock/app.js','utf8');
const owner=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
const runtime=readFileSync('components/stock-runtime.tsx','utf8');
const sw=readFileSync('scripts/sw-template.js','utf8');
const CAMI='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
function setup(authorized=true){
  const window={
    GestLokPilot:{authorized:()=>authorized,creatorMode:()=>authorized},
    GestLokZayroAdmin:{homeTile:()=>'<section>Tienda Online · ZAYRO · ADMINISTRAR</section>'},
    GestLokMisProductos:{homeTile:()=>'<section>Mis Productos</section>'},
    GestLokCamiMonthly:{homeTile:()=>'<section>Resumen Mensual</section>'}
  };
  const listeners={};
  const document={head:null,addEventListener:(key,callback)=>listeners[key]=callback};
  vm.runInNewContext(js,{window,document});
  return window.GestLokScannerMenu;
}
function host(tenant=CAMI,role='dueno',creator=false){
  return {S:{me:{tenant_id:tenant},local:'munro'},role:()=>role,isCreadora:()=>creator};
}
const ctx=tenant=>({tenant_id:tenant,role:'dueno',company_name:'Perfumes'});

test('Plan Scanner de Camila queda aislado en menú por tenant sin afectar Mi Gusto o El Molino',()=>{
  assert.doesNotThrow(()=>new vm.Script(js));
  assert.match(app,/'2a97bf8d-7d08-4aa7-b051-5d1a4dc80103': Object\.freeze\(\{microapps:Object\.freeze\(\['scanner'\]\)\}\)/);
  assert.match(app,/'6c8717ea-5f78-426b-9458-74a5dcac6e4e': Object\.freeze\(\{microapps:Object\.freeze\(\['molino'\]\)\}\)/);
  assert.match(app,/GestLokScannerMenu\?\.navHTML/);
  assert.match(owner,/api\?\.S\?\.local\?window\.GestLokScannerMenu\?\.home\?\.\(state\.data,api,shown\):null/);
  assert.ok(owner.indexOf('const scannerHome=')<owner.indexOf("const commerce=allowed('comercial')"));
  assert.match(runtime,/await load\("\/stock\/gestlok-scanner-menu\.js/);
  assert.match(sw,/gestlok-scanner-menu\.js/);
});

test('Dueña autenticada y autorizada ve únicamente Plan Scanner y ZAYRO',()=>{
  const menu=setup(),h=host(),html=menu.home(ctx(CAMI),h),nav=menu.navHTML(h);
  assert.match(html,/ZAYRO/);
  assert.match(html,/Plan Scanner/);
  assert.match(html,/Sistema de ventas/);
  assert.match(html,/Stock de productos/);
  assert.match(html,/Precios/);
  assert.match(html,/Tienda Online/);
  assert.match(html,/data-zayro-open|ADMINISTRAR/);
  assert.match(nav,/data-pilot-pos/);
  assert.match(nav,/data-pilot-stock/);
  assert.match(nav,/data-zayro-open/);
  for(const forbidden of ['Administrar a los empleados','Administrar mi empresa','Proveedores','Reclamos Internos','Vencimientos','Stock Local']){
    assert.equal(html.includes(forbidden),false,forbidden);
    assert.equal(nav.includes(forbidden),false,forbidden);
  }
});
test('Creadora verificada puede operar Scanner; no hereda funciones de Mi Gusto',()=>{
  const menu=setup(true),h=host(CAMI,'creadora',true),html=menu.home(ctx(CAMI),h),nav=menu.navHTML(h);
  assert.match(html,/ZAYRO/);
  assert.match(html,/Administración general · Acceso verificado/);
  assert.match(html,/data-scanner-card="ventas" data-pilot-pos/);
  assert.match(nav,/data-scanner-section="ventas"/);
  assert.doesNotMatch(html,/disabled|Solo lectura/);
  assert.match(nav,/data-pilot-stock/);
  assert.doesNotMatch(nav,/data-zayro-open/);
  assert.doesNotMatch(html,/Administrar a los empleados/);
});
test('Creadora no verificada no recibe controles de Scanner',()=>{
  const menu=setup(false),h=host(CAMI,'creadora',true),html=menu.home(ctx(CAMI),h),nav=menu.navHTML(h);
  assert.match(html,/Comprobando el acceso/);
  assert.doesNotMatch(html,/data-pilot-pos/);
  assert.doesNotMatch(nav,/data-pilot-stock/);
});
test('No muestra acciones sin un plan verificado; ningún tenant ajeno recibe la microapp',()=>{
  const menu=setup(false),h=host();
  assert.match(menu.home(ctx(CAMI),h),/Comprobando el acceso al Plan Scanner/);
  assert.doesNotMatch(menu.home(ctx(CAMI),h),/data-pilot-pos/);
  assert.equal(menu.home(ctx('cb0dc04a-9a13-434f-a3d0-47f1d8f39670'),h),null);
  assert.equal(menu.navHTML(host('cb0dc04a-9a13-434f-a3d0-47f1d8f39670')),'');
});

test('Antes de elegir local se conserva el selector autorizado y no se abre Caja ni Ventas',()=>{
 const menu=setup(),h=host();h.S.local='';
 const html=menu.home(ctx(CAMI),h,{locals:[{id:'munro'}],card:l=>'<button data-act="local" data-id="'+l.id+'">Entrar</button>'});
 assert.match(html,/data-act="local"/);
 assert.doesNotMatch(html,/data-pilot-pos/);
 assert.doesNotMatch(html,/data-pilot-caja/);
});
