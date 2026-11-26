import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialNumberKey,reserveSimulatedQuota} from '../supabase/functions/gestlok-ycloud-adapter/quota.mjs';
import {dispatchSinglePilotReply} from '../supabase/functions/gestlok-ycloud-adapter/one-shot.mjs';
const from='+5491100000001';
const key='a'.repeat(64);
test('el cupo pertenece al número comercial y no al cliente ni a la sucursal',async()=>{
 const a=await commercialNumberKey(from);
 assert.match(a,/^[a-f0-9]{64}$/);assert.equal(a,await commercialNumberKey(from));
 assert.notEqual(a,await commercialNumberKey('+5491100000002'));
 await assert.rejects(commercialNumberKey('5491100000001'));
});
test('reserva únicamente ficticia, no permite autorización de envío',async()=>{
 let called=0;
 const result=await reserveSimulatedQuota({from,messageKey:key,units:2,rpc:async (name,args)=>{
  called++;assert.equal(name,'gestlok_ycloud_pilot_reserve_quota');
  assert.deepEqual(args,{p_sender_key:await commercialNumberKey(from),p_message_key:key,p_units:2});
  return {data:{reserved:true,reason:'simulated_reservation',remaining:898,simulated:true,sendAllowed:false}};
 }});
 assert.equal(called,1);assert.equal(result.reserved,true);
 assert.equal(result.sendAllowed,false);
 assert.equal((await dispatchSinglePilotReply(result)).attempted,false);
});
test('falla cerrado ante evidencia faltante, vencida, límite, errores y resultados que permiten enviar',async()=>{
 for(const reply of [{data:{reserved:false,reason:'no_unique_current_evidence',simulated:true,sendAllowed:false}},{data:{reserved:false,reason:'stale_or_boundary_evidence',simulated:true,sendAllowed:false}},{data:{reserved:false,reason:'limit_reached',remaining:0,simulated:true,sendAllowed:false}},{error:{message:'network'}},{data:{reserved:true,sendAllowed:true,simulated:true}},{data:{reserved:true,reason:'simulated_reservation',remaining:999,sendAllowed:false,simulated:true}},{}]){
  const r=await reserveSimulatedQuota({from,messageKey:key,units:1,rpc:async()=>reply});
  assert.equal(r.reserved,false);assert.equal(r.sendAllowed,false);
 }
 let calls=0;
 const r=await reserveSimulatedQuota({from,messageKey:'invalid',units:1,rpc:async()=>{calls++;}});
 assert.equal(r.reason,'invalid_request');assert.equal(calls,0);
});

import {selectTestRoute} from '../supabase/functions/gestlok-ycloud-adapter/test-route.mjs';
test('el piloto conectado solo admite el remitente personal y el número comercial preautorizados',()=>{
 const route={waba:'waba-ficticia',to:from,empresa:'a',sucursal:'a',allowSenders:['+5491100000002','+5491100000003']};
 const other={...route,to:'+5491100000004',sucursal:'b'};
 const base={routes:[route,other],waba:route.waba,to:route.to,from:route.allowSenders[0]};
 const selected=selectTestRoute(base);
 assert.deepEqual(selected.allowSenders,['+5491100000002']);
 assert.equal(selected.sucursal,'a');
 assert.equal(selectTestRoute({...base,from:'+5491100000005'}),null);
 assert.equal(selectTestRoute({...base,to:'+5491100000006'}),null);
 assert.equal(selectTestRoute({...base,routes:[route,route]}),null);
 assert.equal(selectTestRoute({...base,routes:[]}),null);
 assert.equal(selectTestRoute({...base,waba:'unknown'}),null);
});
