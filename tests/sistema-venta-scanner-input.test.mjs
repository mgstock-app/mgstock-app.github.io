import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {attach}=require('../public/stock/sistema-venta/scanner-input.js');
function fakeInput(){
 const handlers=new Map();
 return {value:'',addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:(k)=>handlers.delete(k),
 press(key){let prevented=false;handlers.get('keydown')?.({key,preventDefault(){prevented=true;}});return prevented;}};
}
test('keyboard scanner sends Enter-terminated barcode once',()=>{
 const input=fakeInput(),codes=[];
 const dispose=attach({input,onCode:code=>codes.push(code)});
 input.value='  ZAY-001  ';
 assert.equal(input.press('Enter'),true);
 assert.deepEqual(codes,['ZAY-001']);
 assert.equal(input.value,'');
 dispose();
 input.value='ZAY-002';input.press('Enter');
 assert.deepEqual(codes,['ZAY-001']);
});
test('empty scans do not create cart actions',()=>{
 const input=fakeInput(),codes=[];
 attach({input,onCode:code=>codes.push(code)});
 input.value='  ';input.press('Enter');
 assert.deepEqual(codes,[]);
});
