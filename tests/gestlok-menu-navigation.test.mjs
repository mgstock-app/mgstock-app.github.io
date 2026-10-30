import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('menú global conserva todas las hojas, prioriza Stock Local y elimina solo Hojas',()=>{
 const s=file('public/stock/gestlok-navigation-editor.js');
 new Script(s);
 assert.match(s,/preferred=\['inicio','stock','proveedores'/);
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

test('Stock Local y Pagos Online quedan primeros y son accesos diarios autorizados',()=>{
 const nav=file('public/stock/gestlok-navigation-editor.js');
 const mobile=file('public/stock/gestlok-mobile-dock.js');
 new Script(mobile);
 assert.match(nav,/const pinned=\['inicio','stock'\]/);
 assert.match(nav,/originalPayment=nav\.querySelector\('\.snav-sub button\[data-go="cierre-online"\]'\)/);
 assert.match(nav,/payment\.dataset\.go='cierre-online'/);
 assert.match(nav,/last=payment/);
 assert.match(nav,/payment\?\.remove\(\)/);
 assert.match(mobile,/\['stock','Stock Local','stock',!!stock\(\)\]/);
 assert.match(mobile,/\['pagos','Pagos Online','payment',!!pagos\(\)\]/);
 assert.match(mobile,/if\(k==='stock'\)/);
 assert.match(mobile,/if\(k==='pagos'\)/);
 assert.match(mobile,/const stock=\(\)=>localNav\('stock'\)/);
 assert.match(mobile,/const pagos=\(\)=>localNav\('cierre-online'\)/);
});
