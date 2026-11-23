import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261123024500_mi_gusto_pya_simbolico_pagos_online.sql');
const js=read('public/stock/mi-gusto-cierre-online.js');

test('PYA: marca guardada en Supabase y excluida de TODOS los medios de pago',()=>{
 new Script(js);
 assert.match(migration,/add column if not exists pya boolean not null default false/i);
 assert.match(migration,/'pya',m\.pya/);
 for(const m of ['transferencia','getnet','mercado_pago','efectivo']){
  assert.match(migration,new RegExp("filter\\(where m\\.method='"+m+"' and not m\\.pya\\)"));
 }
 assert.match(migration,/filter\(where m\.app and m\.method<>'efectivo' and not m\.pya\)/);
 assert.match(migration,/filter\(where m\.method<>'efectivo' and not m\.pya\)/);
 assert.match(migration,/filter\(where m\.pya\)/);
 assert.match(migration,/'total_pya',z\.total_pya/);
 assert.match(migration,/'online_local',z\.total_ventas-z\.total_app/);
 assert.match(migration,/where shift_id=s\.id and method in \('getnet','mercado_pago'\) and not pya/);
 assert.match(migration,/gestlok_mg_online_private\.authorized\(p_local\)/);
 assert.match(migration,/gestlok_mg_online_save_note_pya/);
 assert.match(migration,/p_pya boolean/);
 assert.match(migration,/pya=p_pya/);
 assert.match(migration,/revoke all on function public\.gestlok_mg_online_save_note_pya/);
 assert.doesNotMatch(migration,/\btruncate table\b|\bdrop table\b|\bdelete from\b/i);
});

test('PYA: botón independiente en formulario y comandas, lectura en historial',()=>{
 assert.match(js,/role="switch" aria-label="PYA simbólico de comanda/);
 assert.match(js,/data-mgon-pya/);
 assert.match(js,/name="pya"/);
 assert.match(js,/p_pya:!m\.pya/);
 assert.match(js,/p_pya:pya/);
 assert.match(js,/p_pya:!!m\.pya/);
 assert.match(js,/function cashMovementDetail\(s=snapshot\?\.active\)/);
 assert.match(js,/r\.pya\?0:Number\(r\.amount\)/);
 assert.match(js,/r\.ok\|\|r\.pya\?v/);
 assert.match(js,/'total_pya','PYA simbólico · no suma'/);
 assert.match(js,/total_pya:0,comandas:0/);
 assert.match(js,/colspan="6"/);
 assert.match(js,/<th>PYA<\/th>/);
 assert.match(js,/m\.pya\?'Simbólico':'No'/);
 assert.match(js,/!m\.pya&&\(m\.method==='getnet'/);
 assert.match(read('components/stock-runtime.tsx'),/mi-gusto-cierre-online\.js\?rev=pya-simbolico-20261123/);
 assert.match(read('app/mi-gusto-pagos-online.css'),/\.mg-on-pya-toggle\[aria-checked=true\]/);
});

test('PYA: historial diario agrupa referencia simbólica sin agregarla a ventas reales',()=>{
 const window={};
 runInNewContext(js,{window,document:{addEventListener(){}},navigator:{onLine:true},Intl,Date,String,Number,Array,Object,console,queueMicrotask(){}});
 const mod=window.GestLokMiGustoOnline;
 mod.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',offline:false,view:'cierre-online'},
  miRol:()=> 'dueno',misLocales:()=>['munro','torcuato'],render(){}});
 const rows=[
  {day:'2026-11-22',turno:'manana',total_pya:20000,transferencia:1000,total_ventas:1000,online_local:1000,comandas:2},
  {day:'2026-11-22',turno:'tarde',total_pya:500,transferencia:3000,total_ventas:3000,online_local:3000,comandas:2}
 ];
 const [day]=mod._test.historyGroups(rows);
 assert.equal(day.total_pya,20500);
 assert.equal(day.transferencia,4000);
 assert.equal(day.total_ventas,4000);
 assert.equal(day.online_local,4000);
 assert.equal(day.comandas,4);
});
