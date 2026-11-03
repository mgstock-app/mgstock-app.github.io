import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validCode,labelModel}=require('../public/stock/sistema-venta/label-codes.js');
test('internal codes use printable ASCII format',()=>{assert.equal(validCode('ZAY-123456'),true);assert.equal(validCode(''),false);assert.equal(validCode('ZAY 123'),false);});
test('label model rejects missing product details',()=>assert.throws(()=>labelModel({name:'',sku:'ZAY-001'})));
test('label model preserves a missing price',()=>assert.equal(labelModel({name:'Perfume',sku:'ZAY-001'}).price,null));
test('label model rejects negative prices',()=>assert.throws(()=>labelModel({name:'Perfume',sku:'ZAY-001',unit_price:-1})));
