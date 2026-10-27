import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin=read('public/stock/gestlok-tienda.js');
const demo=read('public/stock/gestlok-demo.js');
const app=read('public/stock/app.js');
const sql=read('supabase/migrations/20261024_gestlok_online_admin_only.sql');

test('Gestión de tienda online es administrativa, nunca una vidriera para compradores',()=>{
  assert.doesNotThrow(()=>new Script(admin));
  assert.doesNotThrow(()=>new Script(demo));
  assert.equal(existsSync(new URL('../public/tienda.html',import.meta.url)),false);
  assert.equal(existsSync(new URL('../public/stock/tienda-publica.js',import.meta.url)),false);
  assert.doesNotMatch(admin,/window\.open|wa\.me|data-gl-publish|Publicar mi tienda|carrito|checkout/i);
  assert.match(admin,/Organización de productos/);
  assert.match(admin,/Gestionar pedidos/);
  assert.match(admin,/Stock mínimo/);
  assert.match(admin,/tenant_id/);
  assert.match(admin,/local_id/);
  assert.match(admin,/publicado:false/);
});

test('Las modalidades siguen por empresa, con física como valor por defecto',()=>{
  const commerce=read('public/stock/gestlok-commerce.js');
  assert.match(commerce,/const tipo = \(\) => TIPOS\[cfg\?\.tipo\] \? cfg\.tipo : 'fisica'/);
  assert.match(app,/v === 'tienda-online' && window\.GestLokCommerce\?\.online\(\)/);
  assert.match(app,/S\.view === 'tienda-online'/);
  assert.match(app,/GestLokTienda\?\.attach/);
  assert.match(read('components/stock-runtime.tsx'),/gestlok-demo\.js/);
});

test('La demo está restringida a la creadora y nunca utiliza una base de datos',()=>{
  const handlers={}, document={addEventListener:(k,fn)=>{handlers[k]=fn;},getElementById:()=>null};
  const window={};let renders=0;
  new Script(demo).runInNewContext({window,document,Intl,Number,String,Array,Object});
  window.GestLokDemo.attach({isCreadora:()=>false,render:()=>renders++});
  assert.equal(window.GestLokDemo.view(),'');
  window.GestLokDemo.attach({isCreadora:()=>true,render:()=>renders++});
  let html=window.GestLokDemo.view();
  for(const phrase of ['DEMO FICTICIA','Productos y stock','Pedidos','Proveedores','Reportes','Volver a administración','3</strong>']){
    assert.ok(html.includes(phrase),phrase);
  }
  handlers.change({target:{matches:q=>q==='[data-demo-stock]',dataset:{demoStock:'p2'},value:'20'}});
  html=window.GestLokDemo.view();
  assert.match(html,/Alertas de stock/);
  assert.equal(renders,1);
  window.GestLokDemo.reset();
  assert.match(window.GestLokDemo.view(),/DEMO FICTICIA/);
});

test('Solo la creadora encuentra la demo sin crear local, tenant ni tienda real',()=>{
  assert.match(app,/adm && listo && S\.db && S\.demoTienda/);
  assert.match(app,/data-act="admin-demo-online"/);
  assert.match(app,/case 'admin-demo-online': if\(isCreadora\(\)/);
  assert.match(app,/case 'admin-demo-close'/);
  assert.match(app,/GestLokDemo\?\.attach\(\{isCreadora,render\}\)/);
  assert.doesNotMatch(demo,/\.from\(|C\(|\.rpc\(|fetch\(|localStorage|sessionStorage/);
});

test('RLS niega compradores anónimos, impide publicar y protege registros existentes',()=>{
  assert.match(sql,/revoke all on public\.gestlok_tiendas, public\.gestlok_productos_tienda from anon/);
  assert.match(sql,/drop policy if exists gestlok_tiendas_read_public/);
  assert.match(sql,/drop policy if exists gestlok_productos_read_public/);
  assert.match(sql,/check \(visible is false\)/);
  assert.match(sql,/check \(publicado is false\)/);
  assert.match(sql,/add column if not exists minimo/);
  assert.doesNotMatch(sql,/\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\.docs\b|\bdrop\s+table\b/i);
  assert.doesNotMatch(read('public/stock/gestlok-tienda.js'),/\.from\('docs'\)/);
});

test('En sesión iniciada no se superponen los enlaces legales en el panel',()=>{
 const page=read('app/page.tsx');
 assert.match(page,/\.stock-legal-nav \{ display:none/);
 assert.match(page,/html\.auth-on \.stock-legal-nav \{ display:flex/);
});
