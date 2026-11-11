import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync('public/stock/gestlok-mis-productos.js','utf8');
const ui=readFileSync('app/gestlok-mis-productos.css','utf8');
const runtime=readFileSync('components/stock-runtime.tsx','utf8');
function harness(){
 const ctxs=[];
 const document={
  addEventListener(){},
  createElement(tag){
   if(tag!=='canvas')throw Error('No se esperaba DOM extra: '+tag);
   const ctx={
    fillStyle:'',font:'600 29px Georgia',textAlign:'',textBaseline:'',
    calls:[],fillRect(...args){this.calls.push(['rect',...args]);},
    fillText(...args){this.calls.push(['text',...args]);},
    measureText(text){return {width:String(text).length*Number(this.font.match(/(\d+)px/)?.[1]||16)*0.53};},
    translate(...args){this.calls.push(['translate',...args]);},
    rotate(...args){this.calls.push(['rotate',...args]);},
    drawImage(...args){this.calls.push(['drawImage',...args.slice(1)]);}
   };
   const c={width:0,height:0,getContext:()=>ctx,toDataURL:()=>'data:image/png;base64,cG5n'};
   ctxs.push({c,ctx});return c;
  },
  querySelector(){return null;}
 };
 let requested;
 const window={
  Niimbot:{isSupported:()=>true,printImage(image,opts){requested={image,opts};return Promise.resolve();}},
  addEventListener(){}
 };
 const exposed=source.replace('window.GestLokMisProductos=Object.freeze(', 
  'window.__d110={labelArtwork,updateLabelPreview,printBluetooth,printSystem,row};window.GestLokMisProductos=Object.freeze(');
 assert.notEqual(exposed,source);
 runInNewContext(exposed,{window,document,Date,FormData,console});
 return {window,document,ctxs,printed:()=>requested};
}
test('El cuaderno privado muestra la acción de imprimir nombre sin mezclarlo con Scanner',()=>{
 const h=harness();
 assert.match(h.window.__d110.row({id:'p1',product:'Perfume Acqua 50ml',liked:true,note:''}),/data-mp-print="p1"/);
 assert.match(runtime,/gestlok-mis-productos\.js\?rev=cami-cartulina-v4-20261111/);
 assert.match(source,/const item=items\.find\(x=>x\.id===print\.dataset\.mpPrint\)/);
 assert.match(source,/await assertAccess\(\)/);
 assert.doesNotMatch(source,/gestlok_pilot_products|gestlok_scanner_pos_sales|gestlok_pilot_records/);
 assert.match(ui,/\[data-mp-label-modal\]/);
});
test('Etiqueta elegante imprime únicamente nombre centrado y crea raster D110 96×240',()=>{
 const h=harness();
 const art=h.window.__d110.labelArtwork('Acqua di Gio 50ml');
 assert.match(art.screen,/^data:image\/png/);
 assert.match(art.printer,/^data:image\/png/);
 assert.equal(h.ctxs.length,2);
 assert.equal(h.ctxs[0].c.width,240);
 assert.equal(h.ctxs[0].c.height,96);
 assert.equal(h.ctxs[1].c.width,96);
 assert.equal(h.ctxs[1].c.height,240);
 assert.equal(h.ctxs[0].ctx.textAlign,'center');
 assert.match(h.ctxs[0].ctx.font,/Georgia/);
 assert.deepEqual(h.ctxs[0].ctx.calls.filter(x=>x[0]==='text').map(x=>x[1]).join(' '),'Acqua di Gio 50ml');
 assert.ok(h.ctxs[0].ctx.calls.filter(x=>x[0]==='text').every(x=>x[2]===120));
 assert.ok(h.ctxs[1].ctx.calls.some(x=>x[0]==='rotate'),'el controlador gira para el cabezal');
 assert.throws(()=>h.window.__d110.labelArtwork('Super Nombre Excesivamente Largo '.repeat(15)),/muy largo/);
});
test('Vista previa usa exclusivamente PNG, papel 30×12 mm y permite abreviar sin modificar datos',()=>{
 const h=harness();
 let html='';
 const field={value:'Idôle 100ml'};
 const preview={src:'',removeAttribute(){}};
 const status={textContent:''};
 const bt={disabled:true};
 const system={disabled:true};
 const frame={contentDocument:{open(){},write(s){html=s;},close(){}}};
 const modal={dataset:{},querySelector(k){
  return ({
   '[data-mp-label-text]':field,
   '[data-mp-label-preview]':preview,
   '[data-mp-label-message]':status,
   '[data-mp-label-bluetooth]':bt,
   '[data-mp-label-system]':system,
   '[data-mp-label-frame]':frame
  })[k];
 }};
 h.window.__d110.updateLabelPreview(modal);
 assert.match(preview.src,/^data:image\/png/);
 assert.match(html,/@page\{size:30mm 12mm;margin:0\}/);
 assert.match(html,/src="data:image\/png/);
 assert.doesNotMatch(html,/Idôle|<svg|barcode|ean13/i);
 assert.equal(bt.disabled,false);
 assert.equal(system.disabled,false);
 assert.match(status.textContent,/nombre y, si está seleccionado, el tipo de fragancia/);
});
test('Impresión Bluetooth D110 sin esperar otro clic, y sistema como alternativa',async()=>{
 const h=harness();
 let focused=false,opened=false;
 const bt={disabled:false,textContent:''};
 const status={textContent:''};
 const frame={contentWindow:{focus(){focused=true;},print(){opened=true;}}};
 const modal={dataset:{printImage:'data:image/png;base64,cG5n'},isConnected:true,querySelector(s){
  if(s==='[data-mp-label-bluetooth]')return bt;
  if(s==='[data-mp-label-message]')return status;
  if(s==='[data-mp-label-frame]')return frame;
 }};
 h.window.__d110.printBluetooth(modal);
 const req=h.printed();
 assert.ok(req,'debe iniciar Bluetooth en el mismo gesto del usuario');
 assert.deepEqual({w:req.opts.size.w_px,h:req.opts.size.h_px}, {w:96,h:240});
 assert.deepEqual(Array.from(req.opts.model.name_prefixes),['D110']);
 assert.equal(req.opts.model.dpi,203);
 await Promise.resolve(); await Promise.resolve();
 assert.match(status.textContent,/confirmó/);
 h.window.__d110.printSystem(modal);
 assert.equal(focused,true);
 assert.equal(opened,true);
});

test('Etiqueta D110 incluye tipo de fragancia cuando se selecciona, sin código de barras',()=>{
 const h=harness();
 h.window.__d110.labelArtwork('Hawas Ice','hombre');
 const texts=h.ctxs[0].ctx.calls.filter(x=>x[0]==='text').map(x=>x[1]);
 assert.ok(texts.includes('HOMBRE'));
 assert.ok(texts.includes('Hawas Ice'));
 assert.match(h.window.__d110.row({id:'p2',product:'Hawas Ice',fragrance_type:'hombre',liked:true,note:''}),/data-mp-fragrance="p2"/);
 assert.match(source,/fragrance_type:value\|\|null/);
});
