import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Regresión: un error de la RPC inicial no debe crear un ciclo de microtareas
// ni congelar la pantalla de Pagos Online. Sin datos reales.
test('Pagos Online no repite infinitamente la carga cuando falla el servidor', async()=>{
 const source=readFileSync(new URL('../public/stock/mi-gusto-cierre-online.js',import.meta.url),'utf8');
 const pending=[];
 const window={GestLokSupabase:{rpc:async()=>({error:{message:'RPC de prueba no disponible'}})}};
 const document={querySelector:()=>null,addEventListener:()=>{}};
 runInNewContext(source,{
  window,document,Intl,Date,String,Number,Array,Object,console,
  navigator:{onLine:true},queueMicrotask:callback=>pending.push(callback)
 });
 const mod=window.GestLokMiGustoOnline;
 let renders=0;
 mod.attach({
  S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',offline:false,view:'cierre-online'},
  miRol:()=>'gerente',misLocales:()=>['munro'],
  render:()=>{renders++;mod.view();}
 });
 assert.match(mod.view(),/Cargando pagos online autorizados/);
 assert.equal(pending.length,1);
 await pending.shift()();
 assert.equal(renders,1);
 assert.equal(pending.length,0,'El error no debe programar otro refresh');
 assert.match(mod.view(),/RPC de prueba no disponible/);
 assert.equal(pending.length,0);
 // Un nuevo ingreso puede intentar cargar nuevamente; no se bloquea la recuperación.
 mod.openForEntry();
 mod.view();
 assert.equal(pending.length,1);
});
