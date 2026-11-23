import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');
const verification=source.slice(source.indexOf('async function verifyTurnSaved('),source.indexOf('\nfunction view(){'));
const cell={qty:144,chapas:0,sueltas:0};
const record=data=>({status:'borrador',shift:'manana_entrada',responsable:'Cami',data,decomiso:{},consumption:[],waste:[]});
async function verify(local,remote){
 const context={day:'2026-11-23',shift:'manana_entrada',queues:new Map(),activePending:()=>[],
  entry:()=>local,responsables:()=>['Cami'],rpc:async()=>({counts:remote?[remote]:[]})};
 vm.createContext(context);
 vm.runInContext(verification+'\nthis.verify=verifyTurnSaved;',context);
 return context.verify(true);
}
for(const savedFlag of [undefined,false]){
 test('cierra cantidades guardadas con Sin stock false y servidor '+String(savedFlag),async()=>{
  const saved={v2:cell};if(savedFlag!==undefined)saved.sin_stock=savedFlag;
  const remote=record({corona:saved});
  assert.equal((await verify(record({corona:{v2:cell,sin_stock:false}}),remote)).remote,remote);
 });
}
test('acepta Sin stock confirmado sin celdas y cantidades cero guardadas',async()=>{
 await verify(record({corona:{sin_stock:true}}),record({corona:{sin_stock:true}}));
 await verify(record({corona:{v1:{qty:0},sin_stock:false}}),record({corona:{v1:{qty:0}}}));
});
for(const [label,remote] of [
 ['cantidad diferente',record({corona:{v2:{...cell,qty:143}}})],
 ['celda faltante',record({corona:{}})],
 ['marca Sin stock diferente',record({corona:{v2:cell,sin_stock:true}})],
 ['turno inexistente',null],
 ['decomiso diferente',{...record({corona:{v2:cell}}),decomiso:{corona:{qty:1}}}],
 ['consumo diferente',{...record({corona:{v2:cell}}),consumption:[{name:'Cami',value:'1'}]}]
]){
 test('bloquea '+label,async()=>{
  const local=record({corona:{v2:cell,sin_stock:false}});
  if(label==='decomiso diferente')local.decomiso={corona:{qty:2}};
  await assert.rejects(verify(local,remote));
 });
}
test('bloquea Sin stock marcado que el servidor no confirmó',async()=>{
 await assert.rejects(verify(record({corona:{sin_stock:true}}),record({corona:{}})));
});
test('no confunde cero sin guardar con una celda guardada',async()=>{
 await assert.rejects(verify(record({corona:{v1:{qty:0}}}),record({corona:{}})));
});
