import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const setup=()=>{
 const window={};
 runInNewContext(read('public/stock/gestlok-form-draft-guard.js'),{window});
 return window.GestLokFormDraftGuard;
};
function field({id='',name='',type='text',value='',original='',checked=false,defaultChecked=false,form=null,data={},tagName='INPUT',options=[]}={}){
 return {
  id,name,type,value,defaultValue:original,checked,defaultChecked,readOnly:false,disabled:false,
  dataset:data,tagName,options,selectionStart:2,selectionEnd:2,
  closest:selector=>selector==='form'?form:null,
  focus(args){this.focused=true;this.preventScroll=args?.preventScroll;},
  setSelectionRange(s,e){this.caret=[s,e];}
 };
}
const form=(id,key='')=>({id,getAttribute:k=>k==='data-draft-key'?key:null});
const root=arr=>({querySelectorAll:()=>arr});
test('Reclamos Internos: escribir cliente, teléfono, descuento, gerente y observación no pierde datos',()=>{
 const g=setup(),f=form('ri-form','nuevo');
 const old=[
  field({name:'name',value:'Mariana Díaz',form:f}),
  field({name:'phone',type:'tel',value:'1122337788',form:f}),
  field({name:'discount',value:'17,5',form:f}),
  field({name:'manager',value:'Gerente de turno',form:f}),
  field({name:'observation',tagName:'TEXTAREA',value:'Reclamo por demora en entrega',form:f})
 ];
 const snapshot=g.capture(root(old),'empresaA|usuario1|munro|reclamos-internos',old[0]);
 const next=old.map(o=>field({name:o.name,type:o.type,tagName:o.tagName,form:f}));
 g.restore(root(next),snapshot,'empresaA|usuario1|munro|reclamos-internos');
 assert.deepEqual(next.map(x=>x.value),old.map(x=>x.value));
 assert.equal(next[0].focused,true);
 assert.deepEqual(next[0].caret,[2,2]);
 assert.equal(next[0].preventScroll,true);
});
test('Vencimientos: conservar nombre, fechas y días, pero no el registro siguiente',()=>{
 const g=setup(),oldForm=form('gl-exp-form','servicio-A'),newForm=form('gl-exp-form','servicio-B');
 const old=[
  field({id:'gl-exp-name',value:'Fumigación',form:oldForm}),
  field({id:'gl-exp-done',type:'date',value:'2026-10-30',original:'2026-10-29',form:oldForm}),
  field({id:'gl-exp-days',type:'number',value:'60',original:'30',form:oldForm})
 ];
 const snap=g.capture(root(old),'tenant|gerente|munro|vencimientos',old[0]);
 const same=old.map(x=>field({id:x.id,type:x.type,value:x.defaultValue,original:x.defaultValue,form:oldForm}));
 g.restore(root(same),snap,'tenant|gerente|munro|vencimientos');
 assert.deepEqual(same.map(x=>x.value),old.map(x=>x.value));
 const other=old.map(x=>field({id:x.id,type:x.type,form:newForm}));
 g.restore(root(other),snap,'tenant|gerente|munro|vencimientos');
 assert.deepEqual(other.map(x=>x.value),['','','']);
});
test('Proveedores: preservar números del pedido y observación sin cruzar productos',()=>{
 const g=setup();
 const a=field({type:'number',value:'18',original:'0',data:{id:'p-55',provVal:'pedir'}});
 const b=field({type:'number',value:'6',original:'0',data:{id:'p-56',provVal:'pedir'}});
 const c=field({type:'text',value:'Reponer antes del sábado',data:{id:'p-55',provNote:'observacion'}});
 const snap=g.capture(root([a,b,c]),'tenant|gerente|local|proveedores',a);
 const dest=[field({type:'number',value:'0',original:'0',data:{id:'p-56',provVal:'pedir'}}),
  field({type:'number',value:'0',original:'0',data:{id:'p-55',provVal:'pedir'}}),
  field({type:'text',data:{id:'p-55',provNote:'observacion'}})];
 g.restore(root(dest),snap,'tenant|gerente|local|proveedores');
 assert.deepEqual(dest.map(x=>x.value),['6','18','Reponer antes del sábado']);
});
test('No reponer valores de otra persona, empresa, local, categoría ni de otro registro',()=>{
 const g=setup(),f=form('ri-form','123');
 const old=field({name:'name',value:'Cliente privado',form:f});
 const snap=g.capture(root([old]),'T1|U1|local1|reclamos',old);
 for(const scope of ['T2|U1|local1|reclamos','T1|U2|local1|reclamos','T1|U1|local2|reclamos','T1|U1|local1|proveedores']){
  const next=field({name:'name',form:f});
  g.restore(root([next]),snap,scope);
  assert.equal(next.value,'');
 }
 const next=field({name:'name',original:'Nuevo cliente en backend',value:'Nuevo cliente en backend',form:f});
 g.restore(root([next]),snap,'T1|U1|local1|reclamos');
 assert.equal(next.value,'Nuevo cliente en backend');
});
test('No restaurar contraseñas, archivos, borradores de campos de solo lectura ni valores en campos deshabilitados',()=>{
 const g=setup(),f=form('credentials');
 const old=[field({name:'password',type:'password',value:'secreto',form:f}),
 field({name:'file',type:'file',value:'factura.pdf',form:f}),
 field({name:'check',type:'checkbox',checked:true,defaultChecked:false,form:f}),
 field({name:'read',value:'privado',form:f})];old[3].readOnly=true;
 const snap=g.capture(root(old),'T|U|L|auth',old[0]);
 const next=old.map(x=>field({name:x.name,type:x.type,form:f}));
 g.restore(root(next),snap,'T|U|L|auth');
 assert.deepEqual(next.map(x=>x.value),['','','','']);
 assert.equal(next[2].checked,true);
});
test('Selección: conservar cambios sin confundir opción inicial con elección del usuario',()=>{
 const g=setup(),f=form('provider-form');
 const options=[{value:'transferencia',defaultSelected:true},{value:'mercado_pago',defaultSelected:false}];
 const s1=field({name:'method',tagName:'SELECT',type:'select-one',value:'mercado_pago',form:f,options});
 const snap=g.capture(root([s1]),'T|U|L|pagos',s1);
 const s2=field({name:'method',tagName:'SELECT',type:'select-one',value:'transferencia',form:f,options});
 g.restore(root([s2]),snap,'T|U|L|pagos');
 assert.equal(s2.value,'mercado_pago');
 const s3=field({name:'method',tagName:'SELECT',type:'select-one',value:'transferencia',form:f,options});
 const defaultSnap=g.capture(root([s3]),'T|U|L|pagos',s3);
 const next=field({name:'method',tagName:'SELECT',type:'select-one',value:'transferencia',form:f,options});
 g.restore(root([next]),defaultSnap,'T|U|L|pagos');
 assert.equal(next.value,'transferencia');
});
test('Integración en todas las categorías sin cambiar lógica ni datos',()=>{
 const app=read('public/stock/app.js');
 const runtime=read('components/stock-runtime.tsx');
 assert.match(app,/GestLokFormDraftGuard/);
 assert.match(app,/formGuard\?\.capture/);
 assert.match(app,/formGuard\?\.restore/);
 assert.match(app,/renderedFormScope===formScope/);
 assert.match(app,/S\.me\?\.tenant_id/);
 assert.match(app,/S\.me\?\.id\|\|S\.me\?\.email/);
 assert.match(read('public/stock/gestlok-updates.js'),/data-draft-key/);
 assert.match(read('public/stock/gestlok-reclamos-internos.js'),/data-draft-key/);
 assert.match(runtime,/load\("\/stock\/gestlok-form-draft-guard\.js/);
 assert.ok(runtime.indexOf('gestlok-form-draft-guard.js')<runtime.indexOf('/stock/app.js?rev'));
 for(const sw of ['scripts/sw-template.js','public/sw.js'])assert.match(read(sw),/'\/stock\/gestlok-form-draft-guard\.js'/);
});

test('Ingreso de mercadería: conservar destino seleccionado en la edición histórica',()=>{
 const g=setup(),p=form('ingreso-qa');
 const selected=field({id:'ing-dec-7',tagName:'SELECT',type:'select-one',value:'f:i-5',form:p,
  options:[{value:'',defaultSelected:true},{value:'f:i-5',defaultSelected:false}]});
 const snap=g.capture(root([selected]),'T|U|L|ingreso',selected,{legacy:true});
 const next=field({id:'ing-dec-7',tagName:'SELECT',type:'select-one',value:'',form:p,
  options:[{value:'',defaultSelected:true},{value:'f:i-5',defaultSelected:false}]});
 g.restore(root([next]),snap,'T|U|L|ingreso');
 assert.equal(next.value,'f:i-5');
 assert.match(read('public/stock/app.js'),/legacy:S\.view==='ingreso'/);
});

// ---- Todo GESTLOK: después de guardar, casillas vacías; sin listas de sugerencias del navegador ----
function setupDom(){
 const handlers={};
 const window={};
 const document={
  addEventListener:(type,fn)=>{handlers[type]=fn;},
  body:{querySelectorAll:()=>[]},
  getElementById:()=>null
 };
 class MutationObserver{observe(){}}
 runInNewContext(read('public/stock/gestlok-form-draft-guard.js'),{window,document,MutationObserver});
 return {g:window.GestLokFormDraftGuard,submit:f=>handlers.submit({target:f})};
}
const viewForm=(id,fields=[])=>({id,getAttribute:()=>null,closest:s=>s==='#view'?{}:null,querySelector:()=>null,querySelectorAll:()=>fields,reset(){this.wasReset=true;}});
const alertRoot=(arr,error)=>({querySelectorAll:()=>arr,querySelector:s=>error&&s.includes('role="alert"')?{}:null});
test('Todo GESTLOK: lo guardado no vuelve a aparecer en el formulario siguiente',()=>{
 const {g,submit}=setupDom();
 const f=viewForm('mg-online-form');
 const sent=[field({name:'comanda',value:'36',form:f}),field({name:'amount',type:'number',value:'1500',form:f})];
 f.querySelectorAll=()=>sent;
 submit(f);
 const snap=g.capture(alertRoot(sent,false),'t|u|munro|cierre-online',null);
 const next=sent.map(o=>field({name:o.name,type:o.type,form:f}));
 g.restore(alertRoot(next,false),snap,'t|u|munro|cierre-online');
 assert.deepEqual(next.map(x=>x.value),['','']);
});
test('Todo GESTLOK: si el guardado falla, lo escrito se repone y no se pierde',()=>{
 const {g,submit}=setupDom();
 const f=viewForm('ri-form');
 const sent=[field({name:'name',value:'Mariana Díaz',form:f}),field({name:'phone',type:'tel',value:'1122337788',form:f})];
 f.querySelectorAll=()=>sent;
 submit(f);
 const snap=g.capture(alertRoot(sent,false),'t|u|munro|reclamos-internos',null);
 const next=sent.map(o=>field({name:o.name,type:o.type,form:f}));
 g.restore(alertRoot(next,true),snap,'t|u|munro|reclamos-internos');
 assert.deepEqual(next.map(x=>x.value),['Mariana Díaz','1122337788']);
 // Una vez repuesto, los renders siguientes conservan el borrador como siempre.
 const again=g.capture(alertRoot(next,true),'t|u|munro|reclamos-internos',null);
 const third=sent.map(o=>field({name:o.name,type:o.type,form:f}));
 g.restore(alertRoot(third,false),again,'t|u|munro|reclamos-internos');
 assert.deepEqual(third.map(x=>x.value),['Mariana Díaz','1122337788']);
});
test('Todo GESTLOK: lo que se escribe después de enviar sí se conserva',()=>{
 const {g,submit}=setupDom();
 const f=viewForm('gl-exp-form');
 const el=field({id:'gl-exp-name',value:'Fumigación',form:f});
 f.querySelectorAll=()=>[el];
 submit(f);
 el.value='Desinfección';
 const snap=g.capture(alertRoot([el],false),'t|u|munro|vencimientos',null);
 const next=field({id:'gl-exp-name',form:f});
 g.restore(alertRoot([next],false),snap,'t|u|munro|vencimientos');
 assert.equal(next.value,'Desinfección');
});
test('Todo GESTLOK: en formularios de edición se mantiene el comportamiento anterior',()=>{
 const {g,submit}=setupDom();
 const f=viewForm('mo-name-form');
 const el=field({name:'nombre',value:'Lucas R.',original:'Lucas',form:f});
 f.querySelectorAll=()=>[el];
 submit(f);
 const snap=g.capture(alertRoot([el],false),'t|u|munro|motos',null);
 const next=field({name:'nombre',value:'Lucas',original:'Lucas',form:f});
 g.restore(alertRoot([next],false),snap,'t|u|munro|motos');
 assert.equal(next.value,'Lucas R.');
});
test('Todo GESTLOK: sin sugerencias del navegador, salvo email y contraseñas de ingreso',()=>{
 const {g}=setupDom();
 const attrs=(tag,type,auto)=>{const a=new Map(auto?[['autocomplete',auto]]:[]);return {tagName:tag,type,
  getAttribute:k=>a.get(k)??null,setAttribute:(k,v)=>a.set(k,v),closest:()=>null,querySelector:()=>null,a};};
 const comanda=attrs('INPUT','text'),nota=attrs('TEXTAREA','textarea'),monto=attrs('INPUT','number');
 const email=attrs('INPUT','email','email'),pass=attrs('INPUT','password','current-password'),check=attrs('INPUT','checkbox');
 const form={...attrs('FORM'),querySelector:()=>null};
 const list=[form,comanda,nota,monto,email,pass,check];
 g.noSuggestions({querySelectorAll:()=>list,matches:()=>false});
 for(const el of [form,comanda,nota,monto])assert.equal(el.a.get('autocomplete'),'off');
 assert.equal(email.a.get('autocomplete'),'email');
 assert.equal(pass.a.get('autocomplete'),'current-password');
 assert.equal(check.a.get('autocomplete'),undefined);
 // Pagos Online avisa que ya vació su formulario.
 const f=viewForm('mg-online-form');g.saved(f);assert.equal(f.wasReset,true);
});
test('El guardián de formularios se carga en las dos áreas de GESTLOK',()=>{
 assert.match(read('components/stock-runtime.tsx'),/gestlok-form-draft-guard\.js\?rev=sin-sugerencias-20261101/);
 assert.match(read('modules/empleados/app/layout.tsx'),/stock\/gestlok-form-draft-guard\.js\?rev=sin-sugerencias-20261101`\} strategy="afterInteractive"/);
});
