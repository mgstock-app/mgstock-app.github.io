import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {checkout}=require('../public/stock/sistema-venta/checkout-client.js');
const productId='123e4567-e89b-12d3-a456-426614174000';
const tenantId='11111111-1111-4111-8111-111111111111';
const saleId='22222222-2222-4222-8222-222222222222';
const mockPilot=(allowed=true,tenant=tenantId)=>globalThis.GestLokPilot={
 authorized:()=>allowed,tenantId:()=>tenant
};
test('Scanner no realiza ventas sin autorización',async()=>{
 mockPilot(false);
 await assert.rejects(checkout({db:{rpc(){throw Error('No llamar RPC');}},lines:[{product_id:productId,quantity:1}],payment:'efectivo',requestId:saleId}),/no autorizado/i);
});
test('Scanner no permite otro tenant ni cantidad inválida',async()=>{
 mockPilot();
 const db={rpc(){throw Error('No llamar RPC');}};
 await assert.rejects(checkout({db,lines:[{product_id:productId,quantity:1}],payment:'efectivo',tenantId:'33333333-3333-4333-8333-333333333333',requestId:saleId}),/Sucursal no autorizada/);
 await assert.rejects(checkout({db,lines:[{product_id:productId,quantity:0}],payment:'efectivo',requestId:saleId}),/cantidad invalida/i);
 await assert.rejects(checkout({db,lines:[{product_id:productId,quantity:1}],payment:'tarjeta',requestId:saleId}),/Medio de pago invalido/);
});
test('Scanner envía tenant + request_id y nunca cambia stock desde navegador',async()=>{
 mockPilot();
 const calls=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:saleId,error:null};}};
 const result=await checkout({db,lines:[{product_id:productId,quantity:2}],payment:'transferencia',requestId:saleId});
 assert.equal(result.saleId,saleId);
 assert.equal(result.requestId,saleId);
 assert.equal(result.tenantId,tenantId);
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'gestlok_pos_checkout');
 assert.deepEqual(calls[0].args,{
  p_tenant:tenantId,p_request:saleId,p_payment:'transferencia',
  p_lines:[{product_id:productId,quantity:2}]
 });
});
test('Scanner conserva errores SQL para manejar reintentos seguros',async()=>{
 mockPilot();
 const db={rpc:async()=>({data:null,error:{code:'22023',message:'Stock insuficiente'}})};
 await assert.rejects(checkout({db,lines:[{product_id:productId,quantity:2}],payment:'efectivo',requestId:saleId}),err=>{
  assert.equal(err.code,'22023');return /Stock insuficiente/.test(err.message);
 });
});
