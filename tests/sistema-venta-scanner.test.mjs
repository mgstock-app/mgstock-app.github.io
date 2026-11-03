import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const scanner=require('../public/stock/sistema-venta/barcode-scanner.js');
test('camera scanner reports unsupported when browser APIs are unavailable',()=>assert.equal(scanner.supported(),false));
test('camera scanner refuses to run without camera support',async()=>{await assert.rejects(scanner.scan({},()=>{}),/Ingresá el código manualmente/);});
test('camera scanner does not request permissions on module import',()=>assert.equal(typeof scanner.scan,'function'));
