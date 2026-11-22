import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('public/stock/gestlok-chat-central.js');
const sw=read('scripts/sw-template.js');
const push=read('public/stock/gestlok-push.js');

function iniciar(rol='gerente'){
 const badges=[],clears=[];
 const data={habilitado:true,empresa:'Comercio',
   sucursales:[
    {id:'a',local_id:'munro',nombre:'Munro',activa:true,nivel:'gestionar',
     pendientes:4,pendientes_avisables:2,en_preparacion:0,reclamos:0},
    {id:'b',local_id:'torcuato',nombre:'Torcuato',activa:true,nivel:'gestionar',
     pendientes:8,pendientes_avisables:8,en_preparacion:0,reclamos:0},
    {id:'c',local_id:'sucursal-futura',nombre:'Sucursal futura',activa:true,nivel:'gestionar',
     pendientes:1,pendientes_avisables:1,en_preparacion:0,reclamos:0},
    {id:'d',local_id:'inactiva',nombre:'Inactiva',activa:false,nivel:'gestionar',
     pendientes:5,pendientes_avisables:5,en_preparacion:0,reclamos:0}
   ]};
 const document={
  hidden:false,addEventListener(){},querySelector(){return null;},
  querySelectorAll(){return [];},getElementById(){return null;}
 };
 const navigator={
  onLine:true, setAppBadge(n){badges.push(n);return Promise.resolve();},
  clearAppBadge(){clears.push(true);return Promise.resolve();}
 };
 const window={
  GestLokSupabase:{rpc:async()=>({data,error:null})},
  GestLokMobileDock:{refresh(){}}
 };
 runInNewContext(js,{window,document,navigator,Promise,Map,Set,Date,
  setInterval(){},clearInterval(){},queueMicrotask(){},console});
 let currentRole=rol;
 const api={S:{local:'munro',me:{tenant_id:'tenant-a'},ro:false,offline:false},
  miRol(){return currentRole;},misLocales(){return ['munro','sucursal-futura'];},
  render(){}};
 window.GestLokMiGustoOrders.attach(api);
 return {central:window.GestLokMiGustoOrders,api,badges,clears,
  cambiarRol(x){currentRole=x;},data};
}

test('el badge de gerentes cuenta SOLO pedidos reales avisables de locales asignados',async()=>{
 const {central,badges,clears,data}=iniciar();
 await central._test.descubrir();
 // Munro: 2 (excluye 2 programados). Sucursal futura asignada: 1.
 // Torcuato no está asignada y la inactiva no cuenta. El servidor también filtra es_prueba.
 assert.equal(badges.at(-1),3);
 assert.equal(clears.length,0);
 data.sucursales[0].pendientes_avisables=0;
 data.sucursales[2].pendientes_avisables=0;
 await central._test.consultar();
 assert.ok(clears.length>=1,'sin pedidos reales pendientes elimina la insignia');
 central.reset();
 assert.ok(clears.length>=2,'cambiar de local o cerrar la sesión limpia el badge');
});

test('propietarios, colaboradores y gerentes sin permisos no reciben badge numérico',async()=>{
 for (const rol of ['dueno','colaborador','lectura']){
  const {central,badges}=iniciar(rol);
  await central._test.descubrir();
  assert.equal(badges.length,0,'no debe generar badge ajeno al gerente: '+rol);
 }
});

test('no se rompe la Central cuando el dispositivo no implementa Badging API',async()=>{
 const {central}=iniciar();
 assert.doesNotThrow(()=>new Script(js));
 assert.doesNotThrow(()=>new Script(sw));
 assert.doesNotThrow(()=>new Script(push));
 // Acceso opcional, sin exigir permisos nativos ni activar push en segundo plano.
 assert.match(js,/navigator\.setAppBadge\?\.\(cantidad\)/);
 assert.match(js,/navigator\.clearAppBadge\?\.\(\)/);
 assert.match(sw,/chat_order:\[0-9\]\+/);
 assert.match(sw,/self\.navigator\?\.setAppBadge\?\.\(\)/);
 assert.match(push,/async function onLogout\(\)[\s\S]*?navigator\.clearAppBadge\?\.\(\)/);
 await central._test.descubrir();
});
