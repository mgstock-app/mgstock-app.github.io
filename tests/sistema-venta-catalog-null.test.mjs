import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {catalog,lookup}=require('../public/stock/sistema-venta/catalog-adapter.js');
test('missing prices and quantities remain unknown, never zero',()=>{
 const [p]=catalog([{id:'1',name:'Perfume',sku:'123',active:true}]);
 assert.equal(p.price,null);assert.equal(p.stock,null);
});
test('inactive products are excluded from barcode lookup',()=>{
 assert.equal(lookup([{id:'1',name:'Perfume',sku:'123',active:false}], '123'),null);
});
test('barcode lookup matches exact code',()=>{
 assert.equal(lookup([{id:'1',name:'Perfume',sku:'123',active:true,unit_price:20000,stock_quantity:2}], '123').id,'1');
});
