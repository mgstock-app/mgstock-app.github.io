import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {calculateClose}=require('../public/stock/sistema-venta/cash-register.js');
test('cash close separates transfers and cash, with reconciliation',()=>{
 const result=calculateClose({openingCash:10000,cashExpenses:500,
  sales:[{id:'a',payment_method:'efectivo',total:20000},{id:'b',payment_method:'transferencia',total:15000}],
  countedCash:29400});
 assert.equal(result.salesTotal,35000);
 assert.equal(result.cashSales,20000);
 assert.equal(result.transferSales,15000);
 assert.equal(result.expectedCash,29500);
 assert.equal(result.difference,-100);
});
test('duplicate sale cannot inflate cash total',()=>{
 assert.throws(()=>calculateClose({sales:[{id:'same',payment_method:'efectivo',total:10},{id:'same',payment_method:'efectivo',total:10}]}),/duplicada/);
});
test('invalid payment method and negative amounts are rejected',()=>{
 assert.throws(()=>calculateClose({sales:[{id:'a',payment_method:'tarjeta',total:10}]}),/Medio de pago/);
 assert.throws(()=>calculateClose({openingCash:-1}),/Importe inválido/);
});
