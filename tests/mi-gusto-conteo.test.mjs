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
 assert.match(source,/const amount=\(p,v\)=>p\.units_per_chapa>0\?/);
 assert.match(source,/\(Number\(v\.chapas\)\|\|0\)\*p\.units_per_chapa\+\(Number\(v\.sueltas\)\|\|0\)\+\(Number\(v\.qty\)\|\|0\)/);
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


test('Conteo identifica el turno activo del servidor, sin modificar cantidades',async()=>{
 const cases=[
  {active:'manana_entrada',finished:[],label:'Mañana · entrada'},
  {active:'manana_salida',finished:['manana_entrada'],label:'Mañana · salida'},
  {active:'noche_salida',finished:['manana_entrada','manana_salida'],label:'Noche · salida'}
 ];
 for(const {active,finished,label} of cases){
  const win={};
  const state={
   products:[{id:'emp',name:'Carne',section:'EMPANADAS',active:true,units_per_chapa:27}],
   counts:[...finished.map(shift=>({shift,status:'finalizado',responsable:'Tizi',data:{emp:{v1:{chapas:1,sueltas:3,qty:0}}}})),
    {shift:active,status:'borrador',responsable:'Tizi',data:{emp:{v1:{chapas:1,sueltas:4,qty:0}}}}],
   history:[],settings:{locked:true,hidden_sections:[]}
  };
  const original=JSON.stringify(state),requested=[];
  win.GestLokSupabase={rpc:async(name)=>{requested.push(name);return {error:null,data:JSON.parse(JSON.stringify(state))};}};
  vm.runInNewContext(source,{window:win,document:{addEventListener:()=>{}},
   navigator:{onLine:true},Date,Intl,Promise,Set,Map,Math,Array,Object,Number,String,JSON,console});
  const instance=win.GestLokMunroConteo;
  instance.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670',id:'tester'},local:'munro',view:'conteo-munro',ro:false,offline:false},
   miRol:()=> 'gerente',misLocales:()=>['munro'],render:()=>{},toast:()=>{}});
  assert.match(instance.view(),/Verificando turno…/);
  for(let i=0;i<9;i++)await Promise.resolve();
  const html=instance.view();
  assert.match(html,new RegExp('class="gcm-current-shift"[^>]*><span>Turno de conteo</span><strong>'+label+'</strong>'));
  assert.match(html,new RegExp('class="gcm-expiry-shift" aria-hidden="true"><span>Planilla activa</span><strong>'+label+'</strong>'));
  assert.doesNotMatch(html,/data-gcm-shift=|<nav class="gcm-tabs"/);
  assert.equal(JSON.stringify(state),original,'mostrar el turno no debe tocar cantidades');
  assert.ok(requested.includes('gestlok_munro_conteo_state'));
  const css=fs.readFileSync(new URL('../app/mi-gusto-conteo.css',import.meta.url),'utf8');
  assert.match(css,/\.gcm-count-screen \.gcm-expiry-shift\{/);
  assert.match(css,/\.gcm-count-screen \.gcm-expiry-ruler\{[\s\S]*?position:sticky/);
 }
});
