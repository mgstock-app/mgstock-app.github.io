import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {checkout}=require('../public/stock/sistema-venta/checkout-client.js');
const product_id='123e4567-e89b-12d3-a456-426614174000';
test('rejects checkout without authorized pilot access',async()=>{
 globalThis.GestLokPilot={authorized:()=>false};
 await assert.rejects(checkout({db:{rpc(){throw Error('Must not call RPC');}},lines:[{product_id,quantity:1}],payment:'efectivo',requestId:product_id}),/no autorizado/);
});
test('rejects invalid quantities before calling database',async()=>{
 globalThis.GestLokPilot={authorized:()=>true};
 await assert.rejects(checkout({db:{rpc(){throw Error('Must not call RPC');}},lines:[{product_id,quantity:0}],payment:'efectivo',requestId:product_id}),/cantidad inválida/);
});
test('uses RPC and never updates inventory from browser',async()=>{
 globalThis.GestLokPilot={authorized:()=>true};
 const calls=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:'sale-1',error:null};}};
 const result=await checkout({db,lines:[{product_id,quantity:2}],payment:'transferencia',requestId:product_id});
 assert.equal(result.saleId,'sale-1');
 assert.equal(calls[0].name,'gestlok_pos_checkout');
 assert.deepEqual(calls[0].args.p_lines,[{product_id,quantity:2}]);
});
