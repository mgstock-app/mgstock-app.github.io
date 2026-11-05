import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
let form=null;
const preview=()=>({textContent:'',hidden:true});
const makeForm=(amount,method='efectivo')=>{
 const output=preview();
 return {elements:{amount:{value:amount},method:{value:method}},
  querySelector:selector=>selector==='#mg-on-cash-preview'?output:null,output};
};
const window={};
const document={addEventListener:()=>{},querySelector:selector=>selector==='#mg-online-form'?form:null};
runInNewContext(read('public/stock/mi-gusto-cierre-online.js'),{
 window,document,navigator:{onLine:true},Intl,Date,String,Number,Array,Object,console,queueMicrotask:()=>{}
});
const sync=window.GestLokMiGustoOnline.syncCashPreview;

test('Mi Gusto: el efectivo muestra solo total final con descuento del 10%',()=>{
 form=makeForm('20.000');
 sync();
 assert.match(form.output.textContent,/Total a cobrar:\s*\$\s*18\.000/);
 assert.doesNotMatch(form.output.textContent,/Bruto|10%|Descuento|Efectivo/);
 assert.equal(form.output.hidden,false);
});

test('Mi Gusto: re-render con borrador restaurado vuelve a mostrar el total descontado',()=>{
 form=makeForm('20.000');sync();
 // Simula el reemplazo del formulario que hace app.render() y el monto restaurado.
 form=makeForm('20.000');sync();
 assert.match(form.output.textContent,/18\.000/);
 assert.equal(form.output.hidden,false);
 const app=read('public/stock/app.js');
 const restored=app.indexOf("formGuard?.restore($('#view'),preserved,formScope)");
 const refreshed=app.indexOf("window.GestLokMiGustoOnline?.syncCashPreview?.()");
 assert.ok(restored>=0&&refreshed>restored&&refreshed-restored<350);
});

test('Mi Gusto: otros medios o montos vacíos no muestran descuento de efectivo',()=>{
 for(const [amount,method] of [['20.000','transferencia'],['20.000','getnet'],['20.000','mercado_pago'],['','efectivo'],['0','efectivo']]){
  form=makeForm(amount,method);sync();
  assert.equal(form.output.hidden,true);
  assert.equal(form.output.textContent,'');
 }
});

test('Mi Gusto: montos decimales usan el neto correcto',()=>{
 form=makeForm('1.234,56');sync();
 assert.match(form.output.textContent,/1\.111,10/);
});
