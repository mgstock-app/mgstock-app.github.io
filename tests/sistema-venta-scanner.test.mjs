import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const scanner=require('../public/stock/sistema-venta/barcode-scanner.js');
test('camera scanner reports unsupported when browser APIs are unavailable',()=>assert.equal(scanner.supported(),false));
test('camera scanner refuses to run without camera support',async()=>{await assert.rejects(scanner.scan({},()=>{}),/Ingresá el código manualmente/);});
test('camera scanner does not request permissions on module import',()=>assert.equal(typeof scanner.scan,'function'));

test('EAN-13, EAN-8 y UPC validan el dígito de control, no aceptan lecturas falsas',()=>{
 assert.equal(scanner.validCode('5901234123457'),true);
 assert.equal(scanner.validCode('5901234123458'),false);
 assert.equal(scanner.validCode('96385074'),true);
 assert.equal(scanner.validCode('96385075'),false);
 assert.equal(scanner.validCode('036000291452'),true);
 assert.equal(scanner.validCode('ABC12345'),true);
 assert.equal(scanner.validCode(''),false);
 assert.equal(scanner.validCode('ABC'),false);
});
test('lector de cámara permite mantener la sesión hasta cierre explícito',async()=>{
 const {readFileSync}=await import('node:fs');
 const {createContext,runInContext}=await import('node:vm');
 const src=readFileSync(new URL('../public/stock/sistema-venta/barcode-scanner.js',import.meta.url),'utf8');
 let requested=0,closed=0;
 const frames=[];
 const good=[{rawValue:'5901234123457'}],other=[{rawValue:'96385074'}];
 let feed=[good,good,other];
 const stream={getTracks:()=>[{stop:()=>closed++}]};
 const fakeRoot={
  navigator:{mediaDevices:{getUserMedia:async()=>{requested++;return stream;}}},
  BarcodeDetector:class{
   static getSupportedFormats=async()=>['ean_13','ean_8'];
   detect=async()=>feed.shift()||[];
  },
  requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},
  cancelAnimationFrame:()=>{},
  Date,
  document:{createElement:()=>({})}
 };
 const api=runInContext(src+';GestLokPosScanner',createContext({window:fakeRoot,globalThis:fakeRoot}));
 assert.equal(requested,0,'no abre cámara automáticamente al importar');
 assert.equal(api.supported(),true);
 const video={srcObject:null,muted:false,setAttribute:()=>{},play:async()=>{},pause:()=>{}};
 const codes=[];
 const stop=await api.scan(video,code=>codes.push(code),{continuous:true});
 assert.equal(requested,1);
 for(let i=0;i<3;i++){const next=frames.shift();assert.ok(next);await next();await Promise.resolve();}
 assert.deepEqual(codes,['5901234123457','96385074'],'la misma etiqueta continua no se duplica');
 stop();
 assert.equal(closed,1,'libera la cámara al cerrar');
 assert.equal(video.srcObject,null);
});
test('solicitud denegada explica permiso y libera cámara',async()=>{
 const {readFileSync}=await import('node:fs');
 const {createContext,runInContext}=await import('node:vm');
 const src=readFileSync(new URL('../public/stock/sistema-venta/barcode-scanner.js',import.meta.url),'utf8');
 const fakeRoot={
  navigator:{mediaDevices:{getUserMedia:async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'});}}},
  BarcodeDetector:class{detect=async()=>[];},
  document:{createElement:()=>({})}
 };
 const api=runInContext(src+';GestLokPosScanner',createContext({window:fakeRoot,globalThis:fakeRoot}));
 const video={setAttribute:()=>{},pause:()=>{},srcObject:null};
 await assert.rejects(api.scan(video,()=>{}),/Permití el acceso a la cámara/);
});
