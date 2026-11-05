import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const payments=require('../public/stock/sistema-venta/payment-split.js');
const checkout=require('../public/stock/sistema-venta/checkout-client.js');
const tenant='11111111-1111-4111-8111-111111111111';
const product='22222222-2222-4222-8222-222222222222';
const request='33333333-3333-4333-8333-333333333333';
globalThis.GestLokPilot={authorized:()=>true,tenantId:()=>tenant};
globalThis.GestLokPosPayments=payments;
test('split checkout uses dedicated RPC and server-side tenant',async()=>{
 let call;
 const db={rpc:async(name,args)=>{call={name,args};return {data:request,error:null};}};
 const result=await checkout.checkout({db,lines:[{product_id:product,quantity:1}],payments:[{method:'efectivo',amount:10},{method:'tarjeta',amount:20}],methods:[{id:'efectivo'},{id:'tarjeta'}],total:30,requestId:request});
 assert.equal(result.saleId,request);
 assert.equal(call.name,'gestlok_pos_checkout_split');
 assert.equal(call.args.p_tenant,tenant);
 assert.deepEqual(call.args.p_payments,[{method:'efectivo',amount:10},{method:'tarjeta',amount:20}]);
});
test('rejects disabled method before calling RPC',async()=>{
 let called=false;
 const db={rpc:async()=>{called=true;return {data:request,error:null};}};
 await assert.rejects(checkout.checkout({db,lines:[{product_id:product,quantity:1}],payments:[{method:'tarjeta',amount:30}],methods:[{id:'efectivo'}],total:30,requestId:request}),/no habilitado/);
 assert.equal(called,false);
});
