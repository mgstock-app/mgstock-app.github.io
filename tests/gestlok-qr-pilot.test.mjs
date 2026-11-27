import test from 'node:test';
import assert from 'node:assert/strict';
import {createQrPairingSimulation} from '../scripts/gestlok-qr-pilot/pairing.mjs';
const route={to:'+5491100000001',empresa:'ficticia',sucursal:'a',sucursalId:'a0000000-0000-4000-8000-000000000001',slug:'local-a',allowSenders:['+5491100000000']};
const other={...route,to:'+5491100000002',sucursal:'b',sucursalId:'a0000000-0000-4000-8000-000000000002',slug:'local-b'};
const qr='FICTICIO-QR-prueba001';
let now=Date.parse('2026-11-26T13:00:00Z');
const makeStore=()=>{
 let reads=0,writes=0;const sessions=new Map(),events=new Set(),excluded=new Set();
 return {sessions,events,excluded,get reads(){return reads;},get writes(){return writes;},async isExcluded(a){return excluded.has(a.sucursal+'|'+a.phone);},
  async load(a){reads++;return {revision:sessions.get(a.scope)?.revision||0,state:sessions.get(a.scope)?.state||null,sucursal:{nombre:'Local ficticio',empresa:'Empresa ficticia',acepta_retiro:true,medios_pago:['efectivo']},catalogo:{categorias:[],productos:[]},privado:{ia_activa:false}};},
  async commit(a){const key=a.scope+'|'+a.eventId;if(events.has(key))return {status:'duplicate'};events.add(key);writes++;sessions.set(a.scope,{revision:a.revision+1,state:a.state});return {status:'committed'};}};
};
const msg=(route,id,overrides={})=>({synthetic:true,type:'chat',from:route.allowSenders[0],to:route.to,body:'Hola',timestamp:now,id,...overrides});
const create=(route,store,overrides={})=>createQrPairingSimulation({projectRef:'irqeitzbfyerxcrogkyh',enabled:true,dryRunOnly:true,route,store,now:()=>now,...overrides});
const pair=(controller,route)=>{assert.equal(controller.open(),true);assert.equal(controller.offerQr(qr),true);assert.equal(controller.readQr(),qr);assert.equal(controller.pair({numero:route.to,challenge:qr}),true);};
test('QR ficticio solo en Pruebas, apagado por defecto y no acepta credenciales reales',async()=>{
 const store=makeStore();
 for(const opt of [{enabled:false},{dryRunOnly:false},{projectRef:'vgsepaaewbctjsjcpeta'}]){
  const x=create(route,store,opt);assert.equal(x.open(),false);assert.equal((await x.receive(msg(route,'1'))).status,'disabled');
 }
 const x=create(route,store);assert.equal(x.open(),true);assert.equal(x.offerQr('real-auth-secret'),false);assert.equal(x.readQr(),null);
 assert.equal(x.offerQr(qr),true);assert.equal(x.status().qrAvailable,true);now+=61000;assert.equal(x.readQr(),null);
 assert.equal(x.pair({numero:route.to,challenge:qr}),false);assert.equal(x.status().state,'disconnected');assert.equal(store.writes,0);
});
test('vinculación simulada verifica número, borra desafío, no cruza sucursales ni accede a mensajes reales',async()=>{
 const store=makeStore(),a=create(route,store),b=create(other,store);
 assert.equal(a.open(),true);assert.equal(a.offerQr(qr),true);
 assert.equal(a.pair({numero:other.to,challenge:qr}),false);assert.equal(a.readQr(),null);
 pair(a,route);pair(b,other);
 assert.equal(a.readQr(),null);assert.equal(a.status().state,'paired_simulated');assert.equal(a.status().sendAllowed,false);
 const rejected=[{synthetic:false},{fromMe:true},{history:true},{group:true},{from:'+5491100000009'},{to:other.to},{timestamp:now-600000}];
 for(const [i,o] of rejected.entries())assert.notEqual((await a.receive(msg(route,'r'+i,o))).status,'accepted');
 assert.equal(store.reads,0);
 store.excluded.add(route.sucursalId+'|'+route.allowSenders[0]);
 assert.equal((await a.receive(msg(route,'x'))).status,'excluded_sender');
 assert.equal((await b.receive(msg(other,'x'))).status,'accepted');
 store.excluded.clear();
 assert.equal((await a.receive(msg(route,'x'))).status,'accepted');
 assert.equal((await a.receive(msg(route,'x'))).status,'duplicate');
 assert.equal(store.sessions.size,2);assert.equal(store.writes,2);
 a.disconnect();assert.equal((await a.receive(msg(route,'another'))).status,'not_paired');assert.equal(store.writes,2);
});
test('si se desconecta antes de terminar la consulta, no registra mensaje ni pedido',async()=>{
 const store=makeStore(),x=create(route,store);pair(x,route);
 const load=store.load;store.load=async a=>{const result=await load(a);x.disconnect();return result;};
 const r=await x.receive(msg(route,'test'));
 assert.equal(r.sendAllowed,false);assert.equal(r.status,'blocked');assert.equal(store.writes,0);
});
