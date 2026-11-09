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

test('Precio PYA = Precio Local + porcentaje (50 % inicial) y lectura de precios argentinos', ()=>{
 const {GestLokMolinoPYA:m}=load(ACASSUSO);
 assert.equal(m.pya(2500),3750);assert.equal(m.pya(1200),1800);assert.equal(m.pya(14000),21000);
 assert.equal(m.pya(2800,40),3920);assert.equal(m.pya(null),null);
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
 assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-molino-pya\.js\?rev=pedidosya-20261109"\);\s*\n\s*if \(!visitor\) await load\("\/stock\/gestlok-molino\.js/);
});
