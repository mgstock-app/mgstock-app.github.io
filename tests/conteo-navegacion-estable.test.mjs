import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Los eventos de scroll replicados no devuelven al principio',()=>{
 const handlers={},root={querySelectorAll:()=>[a,b,ruler]};
 const make=()=>({scrollLeft:0,matches:()=>true,closest:()=>root});
 const a=make(),b=make(),ruler=make();
 const document={addEventListener:(t,fn)=>{(handlers[t]??=[]).push(fn);}},window={};
 vm.runInNewContext(read('public/stock/mi-gusto-conteo.js'),{document,window,Date,Intl,Promise,Map,Set,WeakMap,Object,Array,String,Number,JSON,Math,console});
 const scroll=handlers.scroll[0];
 a.scrollLeft=210;scroll({target:a});assert.equal(b.scrollLeft,210);assert.equal(ruler.scrollLeft,210);
 scroll({target:b});scroll({target:ruler});assert.equal(a.scrollLeft,210);
 b.scrollLeft=445;scroll({target:b});assert.equal(a.scrollLeft,445);assert.equal(ruler.scrollLeft,445);
 scroll({target:a});scroll({target:ruler});assert.equal(b.scrollLeft,445);
});
test('El render conserva desplazamiento de Conteo',()=>{
 const app=read('public/stock/app.js'),conteo=read('public/stock/mi-gusto-conteo.js');
 assert.match(app,/function captureConteoViewport/);
 assert.match(app,/restoreConteoViewport\(conteoViewport\)/);
 assert.doesNotMatch(conteo,/if\(sheet\)sheet\.scrollLeft=0/);
});
test('Una actualización espera a que se salga de Conteo',()=>{
 assert.match(read('public/stock/gestlok-pwa-update.js'),/document\.querySelector\?\.\('\.gcm-count-screen'\)/);
});
