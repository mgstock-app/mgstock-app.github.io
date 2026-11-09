import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync('public/stock/gestlok-molino.js','utf8');
const creator=readFileSync('public/stock/gestlok-creator-home.js','utf8');
const owner=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
const app=readFileSync('public/stock/app.js','utf8');
const style=readFileSync('public/stock/gestlok-molino.css','utf8');
const asset=readFileSync('public/img/molino-cafe-marca.svg','utf8');
const TENANT='6c8717ea-5f78-426b-9458-74a5dcac6e4e';
const ACASSUSO='loc-6c8717ea5f78426b9458';
const SAN_ISIDRO='loc-6c8717ea5f78426b9458-si';
function load(){
 const doc={getElementById:()=>null,querySelector:()=>null,
   head:{appendChild(){}},addEventListener(){},
   createElement:()=>({setAttribute(){}})};
 const window={};
 vm.runInNewContext(source,{window,document:doc,Intl,Date,
   clearInterval(){},setInterval(){return 0},setTimeout(){return 0},clearTimeout(){}});
 return window.GestLokMolino;
}
test('Logo entregado: conserva letras amarillas y el distintivo naranja',()=>{
 assert.match(asset,/<svg[^>]+viewBox="32 57 380 174"/);
 assert.match(asset,/Molino café/);
 assert.match(asset,/fill="#fbe408"/);
 assert.match(asset,/fill="#ee4c1f"/);
 assert.ok(asset.length>3000);
});
test('Acassuso y San Isidro muestran solamente su propio nombre debajo',()=>{
 const a=load();
 const one=a.logoHTML(ACASSUSO,'hero',TENANT);
 const two=a.logoHTML(SAN_ISIDRO,'hero',TENANT);
 for(const [html,name,other] of [[one,'Acassuso','San Isidro'],[two,'San Isidro','Acassuso']]){
  assert.match(html,/molino-cafe-marca\.svg/);
  assert.match(html,/alt="Molino café"/);
  assert.match(html,new RegExp('<small>'+name+'</small>'));
  assert.doesNotMatch(html,new RegExp('<small>'+other+'</small>'));
 }
 assert.equal(a.logoHTML(ACASSUSO,'hero','cb0dc04a-9a13-434f-a3d0-47f1d8f39670'),'');
 assert.equal(a.logoHTML('local-desconocido','hero',TENANT),'');
 assert.equal(a.logoHTML(ACASSUSO,'otro',TENANT).includes('gl-molino-brand--hero'),true);
});
test('Logo de sucursal conectado a inicio, módulo, encabezado y selector de locales',()=>{
 const a=load();
 a.attach({S:{me:{tenant_id:TENANT},local:ACASSUSO},role:()=>'dueno'});
 assert.match(a.homeTile(),/data-molino-brand="acassuso"/);
 a.attach({S:{me:{tenant_id:TENANT},local:SAN_ISIDRO},role:()=>'dueno'});
 assert.match(a.homeTile(),/data-molino-brand="san-isidro"/);
 assert.match(source,/logoHTML\(api\?\.S\?\.local,'header'/);
 assert.match(owner,/GestLokMolino\?\.logoHTML\?\.\(api\?\.S\?\.local,'hero'/);
 assert.match(creator,/GestLokMolino\?\.logoHTML\?\.\(l\.id,'card'/);
 assert.match(app,/GestLokMolino\?\.logoHTML\?\.\(l\.id,'card'/);
 assert.match(style,/\.gl-molino-brand--hero/);
 assert.match(style,/\.gl-molino-brand--card/);
 assert.match(style,/@media\(max-width:760px\)/);
});
test('Los demás locales y empresas conservan su identidad previa',()=>{
 const a=load();
 a.attach({S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:ACASSUSO},role:()=>'dueno'});
 assert.equal(a.homeTile(),'');
 assert.equal(a.logoHTML(SAN_ISIDRO,'card','cb0dc04a-9a13-434f-a3d0-47f1d8f39670'),'');
 assert.match(owner,/img\/mi-gusto-blanco\.png/);
 new vm.Script(source);new vm.Script(creator);new vm.Script(owner);new vm.Script(app);
});
