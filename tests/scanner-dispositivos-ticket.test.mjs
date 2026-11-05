import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const require=createRequire(import.meta.url);
const devices=require('../public/stock/sistema-venta/pos-devices.js');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tenantA='11111111-1111-4111-8111-111111111111';
const tenantB='22222222-2222-4222-8222-222222222222';
const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};

test('Panel dispositivos: preferencias aisladas por empresa, por navegador y desactivadas por defecto',()=>{
 assert.deepEqual(devices.load(tenantA),{readerEnabled:false,printerEnabled:false,paper:'58mm'});
 devices.save(tenantA,{readerEnabled:true,printerEnabled:true,paper:'80mm'});
 assert.deepEqual(devices.load(tenantA),{readerEnabled:true,printerEnabled:true,paper:'80mm'});
 assert.deepEqual(devices.load(tenantB),{readerEnabled:false,printerEnabled:false,paper:'58mm'});
 assert.throws(()=>devices.save('mi-gusto',{readerEnabled:true}),/Empresa Scanner inválida/);
 assert.match(devices.renderSettings(tenantA),/Lector USB \/ Bluetooth/);
 assert.match(devices.renderSettings(tenantA),/58 mm/);
 assert.match(devices.renderSettings(tenantA),/80 mm/);
});

test('Lector USB/Bluetooth tipo teclado: añade lectura rápida solo fuera de formularios y se desmonta al salir',()=>{
 let handler=null,removed=false,now=0;
 const doc={addEventListener:(name,fn)=>{assert.equal(name,'keydown');handler=fn;},removeEventListener:(name,fn)=>{if(name==='keydown'&&fn===handler)removed=true;}};
 const accepted=[];
 const stop=devices.bindKeyboard(tenantA,code=>accepted.push(code),{doc,clock:()=>now});
 const event=(key,target={tagName:'BODY'})=>{now+=25;let prevented=false;handler({key,target,preventDefault:()=>{prevented=true;}});return prevented;};
 for(const key of '7791234567895')event(key);
 assert.equal(event('Enter'),true);
 assert.deepEqual(accepted,['7791234567895']);
 for(const key of '7791234567895')event(key,{tagName:'INPUT'});
 event('Enter',{tagName:'INPUT'});
 assert.equal(accepted.length,1,'No interceptar escritura en campos');
 for(const key of '7791234567895'){now+=200;event(key);}
 event('Enter');
 assert.equal(accepted.length,1,'No convertir tecleo lento en escaneo automático');
 stop();assert.ok(removed);
});

test('Ticket térmico 58/80: detalle de venta, pago y caracteres seguros',()=>{
 let html='';
 const open=()=>({document:{open:()=>{},write:s=>{html=s;},close:()=>{}}});
 const sale={id:'sale-123',date:'05/11/2026',lines:[{name:'Perfume <script>alert(1)</script>',quantity:2,price:8500}],total:17000,payment:'Efectivo $ 8.500 + Transferencia $ 8.500'};
 assert.equal(devices.printTicket(sale,'58mm',{open}),true);
 assert.match(html,/54mm/);
 assert.match(html,/N.º sale-123/);
 assert.match(html,/17\.000/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.equal(devices.printTicket(sale,'80mm',{open}),true);
 assert.match(html,/76mm/);
 assert.throws(()=>devices.printTicket(sale,'99mm',{open}),/Ticket inválido/);
});

test('Integración: activar hardware solo en Scanner y conservar ticket al refrescar stock y reportes',()=>{
 const pilot=read('public/stock/gestlok-pilot.js');
 const pos=read('public/stock/sistema-venta/pos-preview.js');
 const css=read('app/gestlok-pilot.css');
 const runtime=read('components/stock-runtime.tsx');
 new Script(pilot);new Script(pos);new Script(read('public/stock/sistema-venta/pos-devices.js'));
 assert.match(pilot,/SCANNER_MODULES=.*'dispositivos'/);
 assert.match(pilot,/pos-devices\.js/);
 assert.match(pilot,/function openPosPreview/);
 assert.match(pilot,/GestLokPosPreview\?\.update/);
 const onSale=pilot.slice(pilot.indexOf('onSale:async'),pilot.indexOf('async function switchSection'));
 assert.doesNotMatch(onSale,/await openPosPreview\(/,'No remontar el POS y perder el ticket tras cobrar');
 assert.match(pos,/activeUpdate=/);
 assert.match(pos,/receiptButton\.hidden=false/);
 assert.match(pos,/GestLokPosDevices\?\.bindKeyboard/);
 assert.match(css,/\.gl-pos-device-grid/);
 assert.match(runtime,/scanner-devices-receipts-20261105/);
});
