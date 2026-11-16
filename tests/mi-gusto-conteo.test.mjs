import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js', import.meta.url),'utf8');
const events=[];
const window={};
vm.runInNewContext(source,{window,document:{addEventListener:(type,fn)=>events.push([type,fn])},navigator:{onLine:true},Date,Intl,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
const mod=window.GestLokMunroConteo;

test('módulo de conteo exporta navegación y funciones visuales',()=>{
 assert.equal(typeof mod.view,'function');
 assert.equal(typeof mod.reset,'function');
 assert.equal(mod._test.labelDay('2026-11-01'),'01/11/2026');
 assert.equal(mod._test.plusDays('2026-11-01',3),'2026-11-04');
});
test('quinto trazo cruza el cuadrado en diagonal',()=>{
 assert.equal((mod._test.marks(4).match(/<path /g)||[]).length,4);
 assert.equal((mod._test.marks(5).match(/<path /g)||[]).length,5);
 assert.match(mod._test.marks(5),/M5 30L29 4/);
 assert.equal((mod._test.marks(7).match(/<svg /g)||[]).length,2);
});
test('una misma casilla permite chapas y unidades sueltas',()=>{
 assert.match(source,/cell\.chapas/);
 assert.match(source,/cell\[kind\]=val/);
 assert.match(source,/p_chapas:newCell\.chapas,p_sueltas:newCell\.sueltas/);
 assert.match(source,/v\.chapas\*p\.units_per_chapa\+v\.sueltas/);
});
test('catálogo editable solo por creadora y tres turnos por sucursal',()=>{
 assert.match(source,/LOCALES\.includes\(api\.S\?\.local\)/);
 assert.match(source,/api\.misLocales\(\)\.includes\(api\.S\.local\)/);
 assert.match(source,/api\.miRol\(\)==='creadora'/);
 assert.match(source,/noche_salida/);
 assert.ok(events.find(([type])=>type==='click'));
});
test('MV se renombra a SGR sin crear dos productos activos',()=>{
 const db=fs.readFileSync(new URL('../supabase/migrations/20261114172500_munro_conteo_mv_27.sql',import.meta.url),'utf8');
 assert.match(db,/name='MV'/);
 assert.match(db,/units_per_chapa=27/);
 const fix=fs.readFileSync(new URL('../supabase/migrations/20261114202000_munro_mv_renombrada_sgr.sql',import.meta.url),'utf8');
 assert.match(fix,/set name='SGR', units_per_chapa=27/);
 assert.match(fix,/where id='c1-22'/);
 assert.match(fix,/set active=false/);
 assert.match(fix,/where id='c1-24'/);
});
