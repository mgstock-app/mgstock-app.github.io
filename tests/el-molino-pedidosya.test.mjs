import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// PedidosYa (09/11/2026): exclusivo de Molino Café · Acassuso. Cálculo, permisos y aislamiento.
const TENANT='6c8717ea-5f78-426b-9458-74a5dcac6e4e';
const ACASSUSO='loc-6c8717ea5f78426b9458';
const SAN_ISIDRO='loc-6c8717ea5f78426b9458-si';
const pyaSrc=readFileSync('public/stock/gestlok-molino-pya.js','utf8');
const molinoSrc=readFileSync('public/stock/gestlok-molino.js','utf8');
const sql=readFileSync('supabase/migrations/20261109040000_molino_acassuso_pedidosya.sql','utf8');
const runtime=readFileSync('components/stock-runtime.tsx','utf8');

function load(local,tenant=TENANT){
 const window={addEventListener(){}};
 const document={addEventListener(){},getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];},
  body:{classList:{toggle(){},add(){},remove(){}}},createElement(){return {setAttribute(){},dataset:{}};},head:{appendChild(){}}};
 const ctx={window,document,navigator:{onLine:true},Intl,Date,setTimeout:()=>0,clearTimeout,setInterval:()=>0,clearInterval,Number,String,Array,Promise,Object,JSON,Math,Map,Set};
 vm.runInNewContext(pyaSrc,ctx);vm.runInNewContext(molinoSrc,ctx);
 window.GestLokMolino.attach({S:{me:{tenant_id:tenant},local},role:()=> 'creadora'});
 return window;
}

test('Precio PYA = Precio Local + porcentaje (50 % inicial), redondeado hacia arriba a $100, y lectura de precios argentinos', ()=>{
 const {GestLokMolinoPYA:m}=load(ACASSUSO);
 // Redondeo hacia arriba a múltiplos de $100.
 assert.equal(m.pya(2500),3800);assert.equal(m.pya(1200),1800);assert.equal(m.pya(14000),21000);assert.equal(m.pya(1210),1900);
 assert.equal(m.pya(2500.5),3800);assert.equal(m.pya(1100,10),1300);assert.equal(m.pya(2000,10),2200);
 assert.equal(m.pya(2800,40),4000);assert.equal(m.pya(null),null);
 assert.equal(m.parsePrice('$ 2.500'),2500);assert.equal(m.parsePrice('2500,50'),2500.5);assert.equal(m.parsePrice('14.000'),14000);
 assert.equal(m.parsePrice(''),null);assert.ok(Number.isNaN(m.parsePrice('abc')));assert.ok(Number.isNaN(m.parsePrice('-5')));
});

test('El menú muestra PedidosYa solo en Acassuso', ()=>{
 assert.match(load(ACASSUSO).GestLokMolino.navHTML(),/data-pya-open[^>]*data-mol-nav="pedidosya"/);
 assert.doesNotMatch(load(SAN_ISIDRO).GestLokMolino.navHTML(),/pedidosya/i);
 assert.equal(load(ACASSUSO,'cb0dc04a-9a13-434f-a3d0-47f1d8f39670').GestLokMolino.navHTML(),'');
 assert.match(pyaSrc,/inAcassuso\(\)/);
});

test('La base restringe PedidosYa a Acassuso y los nombres/orden a la administradora', ()=>{
 assert.match(sql,/gestlok_molino_scope\(\) in \('admin','dueno','acassuso'\)/);
 assert.match(sql,/revoke all on public\.gestlok_molino_pya_settings, public\.gestlok_molino_pya_categories,\s*public\.gestlok_molino_pya_products, public\.gestlok_molino_pya_changes from anon, authenticated/);
 for(const fn of ['category_save','category_delete','product_save','product_delete','reorder','set_percent','mark_updated']){
  const body=sql.split('function public.gestlok_molino_pya_'+fn+'(')[1].split('$$;')[0];
  assert.match(body,/gestlok_molino_pya_require\(true\)/,fn+' exige administradora');
 }
 for(const fn of ['save_prices','sync','state']){
  const body=sql.split('function public.gestlok_molino_pya_'+fn+'(')[1].split('$$;')[0];
  assert.match(body,/gestlok_molino_pya_require\(false\)/,fn+' exige Acassuso');
 }
 // San Isidro solo se lee: ninguna escritura sobre gestlok_molino_prices.
 assert.doesNotMatch(sql,/(update|insert into|delete from)\s+public\.gestlok_molino_prices/i);
 // Registro del precio anterior y nuevo con fecha; los manuales no se pisan sin confirmación.
 assert.match(sql,/old_price numeric\(12,2\),\s*new_price numeric\(12,2\)/);
 assert.match(sql,/r\.price_source = 'san_isidro' or r\.price_local is null or r\.id = any\(coalesce\(p_confirm/);
 assert.match(sql,/pending_pya = true/);
});

test('Se carga solo fuera de la demo de visitantes y antes del Vínculo', ()=>{
 assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-molino-pya\.js\?rev=pedidosya-sobrio-20261110"\);\s*\n\s*if \(!visitor\) await load\("\/stock\/gestlok-molino\.js/);
});

const cats=readFileSync('supabase/migrations/20261109200000_molino_pya_categorias.sql','utf8');
test('Las 18 categorías aprobadas se cargan vacías, en orden y sin duplicados', ()=>{
 const want=['Promociones y combos','Desayunos y meriendas','Cafetería','Pastelería','Panadería','Sándwiches y tostados','Hamburguesas','Ensaladas',
  'Entradas y para compartir','Pizzas','Milanesas y supremas','Pastas','Platos principales','Guarniciones','Postres','Cervezas frías','Vinos','Especiales de temporada'];
 const lists=[...cats.matchAll(/unnest\(array\[([\s\S]*?)\]\)/g)].map(m=>[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]));
 assert.equal(lists.length,2);for(const l of lists)assert.deepEqual(l,want);
 assert.match(cats,/where not exists \(select 1 from public\.gestlok_molino_pya_categories c/);
 assert.match(cats,/create unique index if not exists gestlok_molino_pya_categories_name_uniq\s+on public\.gestlok_molino_pya_categories \(tenant_id, lower\(btrim\(name\)\)\)/);
 assert.match(cats,/Ya existe una categoría con ese nombre/);
 // Solo categorías: ni productos ni precios, y nada de San Isidro ni de otras empresas.
 assert.doesNotMatch(cats,/insert into public\.gestlok_molino_pya_products|(update|insert into|delete from)\s+public\.gestlok_molino_prices/i);
 assert.equal([...cats.matchAll(/'([0-9a-f-]{36})'/g)].every(m=>m[1]===TENANT),true);
 assert.doesNotMatch(cats,/\b(drop table|truncate|delete from)\b/i);
});

test('Ordenar y renombrar categorías es solo de la administradora; el PYA redondea a $100 también en la base', ()=>{
 for(const fn of ['category_reorder','category_save']){
  const body=cats.split('function public.gestlok_molino_pya_'+fn+'(')[1].split('$$;')[0];
  assert.match(body,/gestlok_molino_pya_require\(true\)/,fn);
 }
 assert.match(cats,/revoke all on function public\.gestlok_molino_pya_category_reorder\(uuid\[\]\) from public, anon/);
 assert.match(cats,/ceil\(round\(p \* \(100 \+ coalesce\(pct, 50\)\) \/ 100\.0, 2\) \/ 100\) \* 100/);
 assert.match(pyaSrc,/data-pya-cat-move/);
 assert.match(pyaSrc,/rpc\('gestlok_molino_pya_category_reorder',\{p_ids:list\}\)/);
 // Editar, eliminar y ordenar categorías solo se dibujan para la administradora.
 assert.match(pyaSrc,/const actions=!admin\?'':ordering\?catMove\(c\):/);
 assert.match(pyaSrc,/\(admin\?' draggable="true"':''\)/);
});

test('Diseño de PedidosYa: vistas separadas, tabla de categorías y menú lateral solo dentro de Acassuso', ()=>{
 const css=readFileSync('public/stock/gestlok-molino-pya.css','utf8');
 // Cinco vistas en pestañas y la de Categorías como tabla con editar, eliminar y ordenar.
 for(const v of ['categorias','productos','sin','modificados','todos'])assert.match(pyaSrc,new RegExp("\\['"+v+"','"));
 assert.match(pyaSrc,/role="tablist"/);
 assert.match(pyaSrc,/data-pya-edit-category=/);assert.match(pyaSrc,/data-pya-delete-category=/);assert.match(pyaSrc,/data-pya-ordering/);
 // Sin cambios de lógica: mismas RPC de siempre.
 const rpcs=[...new Set([...pyaSrc.matchAll(/rpc\('(gestlok_molino_pya_[a-z_]+)'/g)].map(m=>m[1]))].sort();
 assert.deepEqual(rpcs,['gestlok_molino_pya_category_delete','gestlok_molino_pya_category_reorder','gestlok_molino_pya_category_save','gestlok_molino_pya_mark_updated',
  'gestlok_molino_pya_product_delete','gestlok_molino_pya_product_save','gestlok_molino_pya_reorder','gestlok_molino_pya_save_prices','gestlok_molino_pya_set_percent',
  'gestlok_molino_pya_state','gestlok_molino_pya_sync']);
 // Las reglas del menú lateral solo aplican con PedidosYa abierto (Acassuso), nunca en San Isidro ni en otras empresas.
 for(const rule of css.split('}').filter(r=>/#side/.test(r)))assert.match(rule,/body(\.gl-molino-tenant)?\.gl-pya-open/);
 assert.match(pyaSrc,/l\.href='\/stock\/gestlok-molino-pya\.css\?rev=pedidosya-sobrio-20261110'/);
 // Al tocar otra sección del menú, PedidosYa se cierra (y pregunta si hay cambios sin guardar).
 assert.match(pyaSrc,/if\(!close\(\)\)\{e\.preventDefault\(\);e\.stopPropagation\(\);\}/);
});


test('PedidosYa de Acassuso usa una paleta sobria sin fondos amarillos ni el rojo decorativo',()=>{
 const css=readFileSync('public/stock/gestlok-molino-pya.css','utf8');
 assert.match(css,/--pya-navy:#233C55/);
 assert.match(css,/\.gl-pya-cat-head\{[^}]*background:#F2F5F7/);
 assert.match(css,/\.gl-pya-pya\{[^}]*background:#F0F3F6/);
 assert.match(css,/\.gl-pya-row\.is-draft\{[^}]*box-shadow:inset 3px 0 0/);
 assert.match(css,/\.gl-pya-row\.is-pending\{[^}]*box-shadow:inset 3px 0 0/);
 assert.match(css,/\.gl-pya-logo\{[^}]*background:#273F56/);
 assert.doesNotMatch(css,/#E5384D|#F8EFE3|#FFF5CC|#FFFBEF|#FDE7C2|#EAF6EE/i);
 assert.match(runtime,/gestlok-molino-pya\.js\?rev=pedidosya-sobrio-20261110/);
 // Cambios solo de apariencia: el aislamiento a Acassuso sigue vigente.
 assert.match(pyaSrc,/inAcassuso\(\)/);
});
