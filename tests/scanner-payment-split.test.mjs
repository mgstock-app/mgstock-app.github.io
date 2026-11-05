import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateSplit}=require('../public/stock/sistema-venta/payment-split.js');
const methods=[{id:'efectivo',label:'Efectivo'},{id:'transferencia',label:'Transferencia'},{id:'tarjeta',label:'Tarjeta'}];
test('acepta tres medios configurados sin perder centavos',()=>{
 assert.deepEqual(validateSplit({total:50000,methods,parts:[{method:'efectivo',amount:20000},{method:'transferencia',amount:15000},{method:'tarjeta',amount:15000}]}),[{method:'efectivo',amount:20000},{method:'transferencia',amount:15000},{method:'tarjeta',amount:15000}]);
});
test('rechaza diferencias de un centavo',()=>assert.throws(()=>validateSplit({total:10,methods,parts:[{method:'tarjeta',amount:9.99}]}),/exactamente/));
test('rechaza medios que el local no habilitó',()=>assert.throws(()=>validateSplit({total:10,methods,parts:[{method:'cheque',amount:10}]}),/no habilitado/));
test('combina dos importes del mismo medio',()=>assert.deepEqual(validateSplit({total:12.5,methods,parts:[{method:'efectivo',amount:5},{method:'efectivo',amount:7.5}]}),[{method:'efectivo',amount:12.5}]));
test('rechaza importes negativos y no numéricos',()=>assert.throws(()=>validateSplit({total:10,methods,parts:[{method:'efectivo',amount:-10}]}),/inválido/));
