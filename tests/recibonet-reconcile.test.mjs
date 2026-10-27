import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileReportBackups } from '../lib/recibonet/reconcile.mjs';
const fixture=()=>({tipo:'copia-ficticia',version:1,ajustes:{tema:{tono:'gris'}},hojas:[
  {id:'hoja-1',datos:{nombreHoja:'Prueba',local:'munro',monto:123,firma:'ficticia',contacto:{tel:'000'}},historial:[{id:'h1',datos:{total:123}}]},
  {id:'hoja-2',datos:{nombreHoja:'Prueba sin local original'},historial:[]}
]});
test('Una copia íntegra conserva datos y locales originales, pero no autoriza retirar ReciboNet',()=>{
  const a=fixture(),b=structuredClone(a);b.hojas.reverse();
  b.hojas[1].datos={contacto:{tel:'000'},firma:'ficticia',monto:123,local:'munro',nombreHoja:'Prueba'};
  const r=reconcileReportBackups(a,b);
  assert.equal(r.reportsMatch,true);assert.equal(r.readyToRetireReciboNet,false);
  assert.deepEqual(r.source.branches,{munro:1,dt:1});
  assert.equal(r.source.digest,r.candidate.digest);
  assert.ok(!JSON.stringify(r).includes('tel'));assert.ok(!JSON.stringify(r).includes('hoja-1'));
});
test('Detecta pérdida de hoja, historial, cambio de salario y cambio de firma',()=>{
  for(const change of [b=>b.hojas.pop(),b=>b.hojas[0].historial.pop(),b=>b.hojas[0].datos.monto++,b=>b.hojas[0].datos.firma='otra']){
    const a=fixture(),b=structuredClone(a);change(b);assert.equal(reconcileReportBackups(a,b).reportsMatch,false);
  }
});
test('No normaliza locales ni ignora campos nuevos, ajustes o registros extra',()=>{
  for(const change of [b=>b.hojas[0].datos.local='torcuato',b=>b.ajustes.tema.tono='otro',b=>b.hojas[0].datos.nuevo=true,b=>b.hojas[0].historial.push({id:'h2',datos:{total:10}})]){
    const a=fixture(),b=structuredClone(a);change(b);assert.equal(reconcileReportBackups(a,b).reportsMatch,false);
  }
});
test('Falla de forma cerrada ante historial ausente, IDs duplicados o copia vacía',()=>{
  for(const change of [b=>delete b.hojas[0].historial,b=>b.hojas.push(b.hojas[0]),b=>b.hojas[0].historial.push(b.hojas[0].historial[0]),b=>b.hojas=[],b=>b.version=2]){
    const b=fixture();change(b);assert.throws(()=>reconcileReportBackups(fixture(),b));
  }
});
