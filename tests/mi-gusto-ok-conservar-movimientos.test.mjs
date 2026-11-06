import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/stock/mi-gusto-cierre-online.js',import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111';
const shift='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const movements=[
 {id,method:'efectivo',comanda:'41',amount:21600,discount_amount:2400,ok:false},
 {id:'22222222-2222-4222-8222-222222222222',method:'efectivo',comanda:'42',amount:16650,discount_amount:1850,ok:false},
 {id:'33333333-3333-4333-8333-333333333333',method:'transferencia',comanda:'43',amount:28080,discount_amount:0,ok:false},
 {id:'44444444-4444-4444-8444-444444444444',method:'efectivo',comanda:'44',amount:10800,discount_amount:1200,ok:false}
];
const before={active:{id:shift,status:'abierto',movements,efectivo:49050},history:[]};
const after={...before.active,movements:movements.map(m=>m.id===id?{...m,ok:true}:m)};

function setup(loc){
 const listeners={},requests=[],renders=[],toasts=[];
 let reply=after;
 const window={GestLokSupabase:{rpc:async(name,args)=>{requests.push({name,args});return {data:reply};}}};
 const document={
  addEventListener:(event,fn)=>{(listeners[event]||=[]).push(fn);},
  getElementById:()=>null
 };
 const instrumented=source.replace(/\}\)\(\);\s*$/, 'window.__setSnapshot=value=>{snapshot=value;}; window.__getSnapshot=()=>snapshot;\n})();');
 assert.notEqual(instrumented,source);
 runInNewContext(instrumented,{window,document,navigator:{onLine:true},Intl,Date,Number,String,Array,Object,console,queueMicrotask:()=>{}});
 const api={S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:loc,view:'cierre-online',offline:false},miRol:()=> 'dueno',misLocales:()=>[loc],render:()=>renders.push(1),toast:(message)=>toasts.push(message)};
 window.GestLokMiGustoOnline.attach(api);
 window.__setSnapshot(before);
 return {window,listeners,requests,renders,toasts,setReply:value=>{reply=value;}};
}

for(const loc of ['munro','torcuato']){
 test('Marcar OK en '+loc+' mantiene las 4 comandas y el efectivo sin pedir otro estado',async()=>{
  const h=setup(loc);
  const input={checked:true,disabled:false,dataset:{mgonCashOk:id},closest(selector){return selector==='[data-mgon-cash-ok]'?this:null;}};
  h.listeners.click[0]({target:input});
  await new Promise(resolve=>setImmediate(resolve));
  const active=h.window.__getSnapshot().active;
  assert.equal(active.movements.length,4);
  assert.equal(active.movements.find(m=>m.id===id).ok,true);
  assert.equal(active.efectivo,49050);
  assert.deepEqual(h.requests.map(r=>r.name),['gestlok_mg_online_cash_ok']);
  assert.equal(h.requests[0].args.p_local,loc);
  assert.equal(h.renders.length,1);
  assert.deepEqual(h.toasts,[]);
 });

 test('Respuesta vacía después de OK en '+loc+' no borra el detalle visible',async()=>{
  const h=setup(loc);
  h.setReply({...after,movements:[]});
  const input={checked:true,disabled:false,dataset:{mgonCashOk:id},closest(selector){return selector==='[data-mgon-cash-ok]'?this:null;}};
  h.listeners.click[0]({target:input});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.window.__getSnapshot().active.movements.length,4);
  assert.equal(h.window.__getSnapshot().active.movements[0].ok,false);
  assert.equal(input.checked,false);
  assert.match(h.toasts[0],/La tabla se conserva/);
 });
}

test('Una lectura atrasada del mismo turno no sustituye 4 movimientos por 0',()=>{
 const h=setup('munro');
 const updated={...before,active:{...before.active,movements:[]}};
 assert.throws(()=>h.window.GestLokMiGustoOnline._test.safeShiftState(updated),/Se conservan las comandas/);
 assert.equal(h.window.GestLokMiGustoOnline._test.safeShiftState(updated,true),updated,'Una eliminación explícita sigue permitida');
 const anotherShift={...updated,active:{...updated.active,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}};
 assert.equal(h.window.GestLokMiGustoOnline._test.safeShiftState(anotherShift),anotherShift,'El siguiente turno nuevo puede comenzar sin movimientos');
});
