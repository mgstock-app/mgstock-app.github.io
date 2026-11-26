import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSignedReceipt,mergeReceiptState} from '../supabase/functions/gestlok-ycloud-adapter/pricing.mjs';
const secret='fixture-only-secret-not-a-real-key';
const expected={messageId:'mock-message-1',externalId:'mock-reference-1',currency:'USD'};
const now=1795656000000, t=Math.floor(now/1000);
const enc=new TextEncoder();
const base={id:expected.messageId,externalId:expected.externalId,bizType:'whatsapp',type:'text',status:'delivered',
 pricingModel:'PMP',pricingType:'free_customer_service',pricingCategory:'service',totalPrice:0,currency:'USD'};
async function check(patch={}, eventPatch={}, signSecret=secret, timestamp=t){
 const raw=JSON.stringify({id:'evt_test_1',type:'whatsapp.message.updated',apiVersion:'v2',whatsappMessage:{...base,...patch},...eventPatch});
 const key=await crypto.subtle.importKey('raw',enc.encode(signSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sign=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(timestamp+'.'+raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 return inspectSignedReceipt({raw,signature:'t='+timestamp+',s='+sign,secret,expected,now});
}
test('solo entrega de servicio con precio final cero y correlación válida confirma recibo gratuito; jamás autoriza salida',async()=>{
 for(const status of ['delivered','read'])assert.deepEqual(await check({status}),{state:'free_delivered',sendAllowed:false});
});
test('precio estimado o fallo de entrega no confirma gratuidad ni libera reserva',async()=>{
 for(const status of ['accepted','sent','failed'])assert.equal((await check({status})).state,'pending');
});
test('cargo positivo o clasificación facturable obliga a bloqueo',async()=>{
 assert.equal((await check({totalPrice:0.01})).state,'block_cost');
 assert.equal((await check({pricingType:'regular'})).state,'block_cost');
});
test('rechaza datos ambiguos, otra moneda, otras categorías, grupos e identificadores ajenos',async()=>{
 for(const patch of [{totalPrice:'0'},{totalPrice:null},{totalPrice:-1},{currency:'ARS'},{pricingModel:undefined},{pricingType:'free_entry_point',pricingCategory:'referral_conversion'},{pricingCategory:'utility'},{groupId:'group'},{externalId:'another'},{id:'another'},{type:'template'}])assert.equal((await check(patch)).state,'unverified');
});
test('rechaza firma incorrecta, timestamp viejo y eventos no destinados al recibo',async()=>{
 assert.equal((await check({}, {}, 'different-fixture-only-secret')).state,'unverified');
 assert.equal((await check({}, {}, secret,t-600)).state,'unverified');
 assert.equal((await check({}, {type:'whatsapp.inbound_message.received'})).state,'unverified');
});
test('notificaciones duplicadas o fuera de orden no borran bloqueo ni evidencia contradictoria',()=>{
 assert.equal(mergeReceiptState('pending','free_delivered'),'free_delivered');
 assert.equal(mergeReceiptState('free_delivered','pending'),'free_delivered');
 assert.equal(mergeReceiptState('free_delivered','free_delivered'),'free_delivered');
 assert.equal(mergeReceiptState('free_delivered','block_cost'),'block_cost');
 assert.equal(mergeReceiptState('block_cost','free_delivered'),'block_cost');
 assert.equal(mergeReceiptState('free_delivered','unverified'),'unverified');
 assert.equal(mergeReceiptState('unverified','free_delivered'),'unverified');
});
