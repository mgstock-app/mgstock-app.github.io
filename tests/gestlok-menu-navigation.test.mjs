import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('menú global conserva todas las hojas, prioriza Stock Local y elimina solo Hojas',()=>{
 const s=file('public/stock/gestlok-navigation-editor.js');
 new Script(s);
 assert.match(s,/preferred=\['inicio','cierre-online','stock','stock-cajas','proveedores'/);
 assert.match(s,/id==='stock'\?'Stock Local'/);
 assert.match(s,/nav\.querySelector\('\.snav-l'\)\?\.remove\(\)/);
 assert.doesNotMatch(s,/nav\.querySelector\('\.snav-add'\)\?\.remove\(\)/);
 assert.match(s,/gestlok_navigation_read/);
 assert.match(s,/gestlok_navigation_save/);
 assert.match(s,/c\.creator/);
 assert.match(s,/destino|targets\.includes\(item\.target\)/);
 assert.match(s,/button\.id='gl-nav-logout'/);
});
test('únicamente la creadora puede guardar menú; sin acceso directo a tablas privadas',()=>{
 const sql=file('supabase/migrations/20261030030000_navigation_creator_local_layouts.sql');
 assert.match(sql,/gestlok_platform\.require_admin\(\)/);
 assert.match(sql,/gestlok_tenancy\.current_tenant_id\(\)/);
 assert.match(sql,/primary key\(tenant_id,local_id\)/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on gestlok_platform\.navigation_layouts from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.gestlok_navigation_save/);
 assert.match(sql,/v_id=any\(v_seen\)/);
 assert.doesNotMatch(sql,/\bdrop table\b|\bdelete from\b|\btruncate\b/i);
});
test('volver y cerrar sesión en empleados, sin cambiar permisos',()=>{
 const g=file('modules/empleados/components/pages/GerenteHome.tsx');
 const b=file('modules/empleados/components/gestlok/GestlokModuleBar.tsx');
 const p=file('modules/empleados/components/layout/RoleProfileSwitcher.tsx');
 assert.match(g,/gl-gerente__back-home/);
 assert.match(g,/Volver a GESTLOK/);
 assert.match(g,/gl-gerente__module-actions/);
 assert.match(g,/void signOut\(\)/);
 assert.match(b,/Volver a GESTLOK/);
 assert.match(b,/Cerrar sesión/);
 assert.match(p,/module-profile-signout/);
 const auth=file('public/stock/auth.js');
 assert.match(auth,/signOut\(\{ scope: 'local' \}\)/);
});
test('integración Next, PWA y contexto tenant',()=>{
 const runtime=file('components/stock-runtime.tsx');
 assert.match(runtime,/gestlok-navigation-editor\.js/);
 assert.match(file('app/layout.tsx'),/gestlok-nav-fixes\.css/);
 assert.match(file('public/stock/app.js'),/window\.GestLokNavContext=/);
 for(const name of ['scripts/sw-template.js','public/sw.js'])
  assert.match(file(name),/'\/stock\/gestlok-navigation-editor\.js'/);
});

test('Inicio, Pagos Online y Stock Local en ese orden son accesos diarios autorizados',()=>{
 const nav=file('public/stock/gestlok-navigation-editor.js');
 const mobile=file('public/stock/gestlok-mobile-dock.js');
 new Script(mobile);
 assert.match(nav,/isMiGusto=c=>/);
 assert.match(nav,/\['inicio','cierre-online','stock','stock-cajas'\]/);
 assert.match(nav,/const directPayment=nav\.querySelector/);
 assert.match(nav,/const nestedPayment=nav\.querySelector/);
 assert.match(nav,/payment\.nextElementSibling!==stockLocal/);
 assert.match(nav,/gestlok_navigation_save/);
 assert.match(mobile,/\['stock','Stock Local','stock',!!stock\(\)\]/);
 assert.match(mobile,/\['pagos','Pagos Online','payment',!!pagos\(\)\]/);
 assert.ok(mobile.indexOf("['pagos','Pagos Online'")<mobile.indexOf("['stock','Stock Local'"),'Dock: Pagos Online antes de Stock Local');
 assert.match(mobile,/if\(k==='stock'\)/);
 assert.match(mobile,/if\(k==='pagos'\)/);
 assert.match(mobile,/const stock=\(\)=>localNav\('stock'\)/);
 assert.match(mobile,/const pagos=\(\)=>localNav\('cierre-online'\)/);
});

test('una hoja llamada «Stock» no congela el menú: un solo botón por categoría y el hilo se libera',()=>{
 const nav=file('public/stock/gestlok-navigation-editor.js');
 new Script(nav);
 // El primer botón «Stock»/«Stock Local» (el acceso diario) gana; otra hoja con el mismo nombre conserva su lugar y su nombre.
 assert.match(nav,/if\(permitted\.includes\(id\)&&!found\.has\(id\)\)found\.set\(id,el\)/);
 assert.doesNotMatch(nav,/const nodes=\(\)=>new Map\(/);
 // Si el menú se redibuja demasiadas veces seguidas, se cede el hilo en vez de encadenar microtareas sin fin.
 assert.match(nav,/if\(\+\+burst>20\)setTimeout\(run,100\);else queueMicrotask\(run\);/);
 // Las pruebas Cypress de ingreso y remito usan justamente una hoja «Stock» de tipo ingreso.
 for(const spec of ['qa/cypress/e2e/ingreso.cy.js','qa/cypress/e2e/remito.cy.js'])
  assert.match(file(spec),/nombre: "Stock", tipo: "ingreso"/);
});
