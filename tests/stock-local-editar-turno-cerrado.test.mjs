import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/stock/app.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('function stockLocalPuedeEditarCierre('),source.indexOf('function histCardF('));
function harness({local='munro',write=true,offline=false,conflict=false}={}){
 const filas=[{pid:'a',nombre:'Producto',local:null,fabrica:null,total:0,sin:false,cambio:false}];
 const record={id:'cierre-h-2026-11-25',tipo:'fabrica',hoja:'h',turnoCerrado:true,fechaOperativa:'2026-11-25',filas};
 const writes=[],messages=[],inputs={};
 const S={local,me:{tenant_id:'mi-gusto'},loaded:{h:true,c:true},conteos:[record],uid:'editor',offline,panel:null};
 const context=vm.createContext({S,MI_GUSTO_TENANT:'mi-gusto',canW:()=>write,needWrite:()=>write,miGustoStockLocal:()=>({id:'h'}),navigator:{onLine:!offline},
  esc:String,fmtIn:n=>n==null?'':String(n),num:n=>n==null?null:Number(n),numQ:v=>v.trim()===''?null:Number(v.replace(',','.')),
  isQuarter:n=>Number.isInteger(n*4),round:n=>Math.round(n*100)/100,localNombre:()=>local,ic:()=>'',openPanel:()=>{},closePanel:()=>{S.panel=null;},
  $:sel=>inputs[sel],toast:m=>messages.push(m),render:()=>{},fail:e=>{throw e;},
  C:col=>({doc:id=>({get:async()=>({exists:true,data:()=>conflict?{...record,filas:[{...filas[0],local:9}]}:record}),update:async patch=>writes.push({col,id,patch})})})});
 vm.runInContext(block,context);
 inputs['[data-stock-closed-local="0"]']={value:'2,5'};
 inputs['[data-stock-closed-ingreso="0"]']={value:''};
 return {context,record,S,writes,messages,inputs};
}
for(const local of ['munro','torcuato'])test('corrige el mismo cierre en '+local+' sin tocar el stock actual',async()=>{
 const h=harness({local});
 h.context.stockLocalEditarCierre(h.record.id);
 await h.context.stockLocalGuardarCierre();
 assert.equal(h.writes.length,1);
 const {col,id,patch}=h.writes[0];
 assert.equal(col,'conteos');assert.equal(id,h.record.id);
 assert.equal(patch.filas[0].local,2.5);assert.equal(patch.filas[0].fabrica,null);
 assert.equal(patch.filas[0].total,2.5);assert.equal(patch.modificado,true);
 assert.equal('fechaOperativa' in patch,false);assert.equal('turnoCerrado' in patch,false);
});
test('rechaza lectura, otro local, desconexión y cambios recibidos',async()=>{
 for(const opts of [{write:false},{local:'otro'},{offline:true},{conflict:true}]){
  const h=harness(opts);h.context.stockLocalEditarCierre(h.record.id);await h.context.stockLocalGuardarCierre();assert.equal(h.writes.length,0);
 }
});
test('distingue cero de no cargado y rechaza cantidades inválidas',async()=>{
 const h=harness();h.context.stockLocalEditarCierre(h.record.id);
 h.inputs['[data-stock-closed-local="0"]'].value='-2';await h.context.stockLocalGuardarCierre();assert.equal(h.writes.length,0);
 h.inputs['[data-stock-closed-local="0"]'].value='0';await h.context.stockLocalGuardarCierre();assert.equal(h.writes[0].patch.filas[0].sin,true);
});
