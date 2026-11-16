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
const NEW_SCANNER='11111111-1111-4111-8111-111111111111';
function setup(authorized=true,checked=false,pilotTenant=CAMI){
  const window={
    GestLokPilot:{authorized:()=>authorized,creatorMode:()=>authorized,accessChecked:()=>checked,tenantId:()=>pilotTenant,scanner:()=>authorized},
    GestLokZayroAdmin:{homeTile:()=>'<section>Tienda Online · ZAYRO · ADMINISTRAR</section>'},
    GestLokMisProductos:{authorized:()=>authorized,homeTile:()=>'<section>Mis Productos</section>'},
    GestLokTiendaNube:{authorized:()=>authorized,homeTile:()=>'<section>TiendaNube</section>'},
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
  assert.match(app,/GestLokPilot\?\.scanner\?\.\(\)/,'Nuevos planes Scanner deben usar su menú sin asignar un tenant fijo');
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
  assert.match(html,/TiendaNube/);
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
  assert.match(html,/data-mp-open/);
  assert.match(html,/data-tn-open/);
  assert.match(nav,/data-mp-open/);
  assert.match(nav,/data-tn-open/);
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

test('Un acceso denegado muestra explicación visible, nunca controles ni espera infinita',()=>{
  const menu=setup(false,true),h=host(CAMI,'creadora',true);
  assert.match(menu.home(ctx(CAMI),h),/no tiene autorizado/);
  assert.match(menu.navHTML(h),/Consultá soporte/);
  assert.doesNotMatch(menu.navHTML(h),/data-pilot-pos|data-pilot-stock|data-zayro-open/);
});

test('Un indicador visual isOwner no convierte a la dueña ni al gerente en creadora',()=>{
 const menu=setup(true);
 const owner=host();owner.S.me.isOwner=true;
 assert.match(menu.navHTML(owner),/data-pilot-pos/);
 assert.match(menu.navHTML(owner),/data-zayro-open/);
 const gerente=host(CAMI,'gerente',true);gerente.S.me.isOwner=true;
 assert.equal(menu.navHTML(gerente),'');
 assert.match(menu.home(ctx(CAMI),gerente),/No hay acceso autorizado/);
});

test('Nueva empresa Scanner autorizada: marca propia y módulos comunes sin ZAYRO',()=>{
  const menu=setup(true,true,NEW_SCANNER);
  const h=host(NEW_SCANNER,'dueno');
  const contexto={tenant_id:NEW_SCANNER,role:'dueno',company_name:'Kiosco Norte'};
  const html=menu.home(contexto,h),nav=menu.navHTML(h);
  assert.match(html,/Kiosco Norte <span>Plan Scanner/);
  for(const label of ['Caja','Sistema de ventas','Stock de productos','Precios','Dispositivos']){
    assert.ok(html.includes(label),label);
  }
  assert.match(nav,/data-pilot-pos/);
  assert.match(nav,/data-pilot-stock/);
  for(const forbidden of ['ZAYRO','Tienda Online','Mis Productos','TiendaNube','Resumen Mensual','PERFUMERÍA','Administrar a los empleados','Proveedores','Pedidos','data-scanner-menu-orders']){
    assert.doesNotMatch(html,new RegExp(forbidden),forbidden);
    assert.doesNotMatch(nav,new RegExp(forbidden),forbidden);
  }
  assert.equal(menu.home({...contexto,tenant_id:CAMI},h),null,'No mezclar contextos de otras empresas');
});

test('Otra empresa sin verificación Scanner y roles ajenos no ven controles',()=>{
  const h=host(NEW_SCANNER,'dueno');
  const context={tenant_id:NEW_SCANNER,role:'dueno',company_name:'Comercio nuevo'};
  const denied=setup(false,true,NEW_SCANNER);
  assert.equal(denied.home(context,h),null);
  assert.equal(denied.navHTML(h),'');
  const wrongTenant=setup(true,true,CAMI);
  assert.equal(wrongTenant.home(context,h),null);
  assert.equal(wrongTenant.navHTML(h),'');
  const permitted=setup(true,true,NEW_SCANNER);
  assert.equal(permitted.navHTML(host(NEW_SCANNER,'gerente')),'');
  assert.match(permitted.home(context,host(NEW_SCANNER,'gerente')),/No hay acceso autorizado/);
  for(const excluded of ['cb0dc04a-9a13-434f-a3d0-47f1d8f39670','6c8717ea-5f78-426b-9458-74a5dcac6e4e']){
    const x=setup(true,true,excluded);
    assert.equal(x.home({tenant_id:excluded,role:'dueno'},host(excluded)),null);
    assert.equal(x.navHTML(host(excluded)),'');
  }
});

test('El nombre del negocio se escapa para evitar inyectar etiquetas',()=>{
  const menu=setup(true,true,NEW_SCANNER);
  const html=menu.home({tenant_id:NEW_SCANNER,role:'dueno',company_name:'Tienda <script>alert(1)</script>'},host(NEW_SCANNER));
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
});
