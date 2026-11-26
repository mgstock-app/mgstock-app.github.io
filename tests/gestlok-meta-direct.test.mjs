import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {once} from 'node:events';
import {createMetaDirectHandler,createMetaDirectServer,verifyMetaSignature} from '../scripts/gestlok-meta-direct/receiver.mjs';
import {createSignedYCloudBridge} from '../supabase/functions/gestlok-ycloud-adapter/bridge.mjs';
import {dispatchSinglePilotReply} from '../supabase/functions/gestlok-ycloud-adapter/one-shot.mjs';
const secret='ficticio-meta-app-secret-1234567890',verifyToken='ficticio-verify-token-1234567890';
const route={waba:'11111',phoneId:'22222',to:'+5491100000001',empresa:'ficticia',sucursal:'a',slug:'local-a',sucursalId:'a0000000-0000-4000-8000-000000000001',allowSenders:['+5491100000000']};
const other={...route,waba:'33333',phoneId:'44444',to:'+5491100000002',sucursal:'b',slug:'local-b',sucursalId:'a0000000-0000-4000-8000-000000000002'};
const NOW=Date.parse('2026-11-26T13:00:00Z'),timestamp=String(Math.floor(NOW/1000));
const config={projectRef:'irqeitzbfyerxcrogkyh',appSecret:secret,verifyToken,routes:[route,other],enabled:true,dryRunOnly:true,now:()=>NOW};
const msg=(id='001',more={})=>({id:'wamid.'+id,from:'5491100000000',type:'text',timestamp,text:{body:'Hola'},...more});
const entry=(r,messages,field='messages')=>({id:r.waba,changes:[{field,value:{messaging_product:'whatsapp',metadata:{phone_number_id:r.phoneId},messages}}]});
const payload=(...entry)=>({object:'whatsapp_business_account',entry});
const signed=x=>{const raw=Buffer.from(JSON.stringify(x));return {method:'POST',url:'/webhooks/meta',raw,signature:'sha256='+createHmac('sha256',secret).update(raw).digest('hex')};};
const makeStore=()=>{
 const sessions=new Map(),events=[],excluded=new Set();
 let reads=0,checks=0;
 return {sessions,events,excluded,get reads(){return reads;},get checks(){return checks;},
  async isExcluded({sucursal,phone}){checks++;return excluded.has(sucursal+'|'+phone);},
  async load({scope}){reads++;return {revision:sessions.get(scope)?.revision||0,state:sessions.get(scope)?.state||null,sucursal:{nombre:'Local ficticio',empresa:'Comercio ficticio',acepta_retiro:true,medios_pago:['efectivo']},catalogo:{categorias:[],productos:[]},privado:{ia_activa:false}};},
  async commit(x){if(events.some(e=>e.scope===x.scope&&(e.messageId===x.messageId||e.wamid===x.wamid)))return {status:'duplicate'};events.push(x);sessions.set(x.scope,{revision:x.revision+1,state:x.state});return {status:'committed'};}
 };
};
test('Node directo permanece deshabilitado fuera de Pruebas; verifica desafío, firma y ruta',async()=>{
 const store=makeStore();
 for(const o of [{enabled:false},{dryRunOnly:false},{projectRef:'vgsepaaewbctjsjcpeta'}]){
  const h=createMetaDirectHandler({...config,...o,store});assert.equal((await h(signed(payload(entry(route,[msg()]))))).status,503);
 }
 const h=createMetaDirectHandler({...config,store});
 const challenge='/webhooks/meta?hub.mode=subscribe&hub.verify_token='+verifyToken+'&hub.challenge=12345';
 assert.deepEqual(await h({method:'GET',url:challenge}),{status:200,body:'12345',sendAllowed:false});
 assert.equal((await h({method:'GET',url:challenge+'&hub.verify_token=otro'})).status,403);
 assert.equal((await h({method:'GET',url:challenge.replace(verifyToken,'mal')})).status,403);
 const body=signed(payload(entry(route,[msg()])));
 assert.equal(verifyMetaSignature(body.raw,body.signature,secret),true);
 assert.equal((await h({...body,signature:'sha256='+'0'.repeat(64)})).status,403);
 assert.equal((await h({...body,raw:Buffer.alloc(262145)})).status,413);
 assert.equal((await h({...body,url:'/otra-ruta'})).status,404);
 assert.equal(store.reads,0);assert.equal(store.events.length,0);
});
test('eventos firmados solo de números de prueba, por sucursal, con exclusión dinámica y sin duplicar',async()=>{
 const store=makeStore();
 const h=createMetaDirectHandler({...config,store});
 const malformed=[msg('2',{from:'5491100000009'}),msg('3',{timestamp:String(Number(timestamp)-3600)}),msg('4',{group_id:'grupo'}),msg('5',{type:'image'}),msg('6',{id:['wamid.001']})];
 assert.equal((await h(signed(payload(entry(route,malformed),entry({...route,phoneId:'99999'},[msg()]),entry(route,[msg()],'smb_message_echoes'),entry(route,[msg()],'history'))))).status,200);
 assert.equal(store.reads,0);
 store.excluded.add(route.sucursalId+'|'+route.allowSenders[0]);
 const body=signed(payload(entry(route,[msg()]),entry(other,[msg('07')])));
 const r=await h(body);assert.equal(r.status,200);assert.equal(r.sendAllowed,false);
 assert.equal(store.events.length,1);assert.equal(store.events[0].sucursal,other.sucursalId);
 store.excluded.clear();await h(body);await h(body);
 assert.equal(store.events.length,2);assert.equal(store.sessions.size,2);
 assert.equal(store.events[1].wamid,'wamid.001');
 assert.ok(store.events[1].reply.some(m=>typeof m==='string'&&m.length>0));
 const old=store.isExcluded;store.isExcluded=async()=>undefined;
 assert.equal((await h(signed(payload(entry(route,[msg('08')]))))).status,503);assert.equal(store.events.length,2);
 store.isExcluded=old;
 assert.equal((await dispatchSinglePilotReply()).attempted,false);
});
test('misma identidad y wamid en ambos adaptadores no duplican el ensayo',async()=>{
 const store=makeStore(),h=createMetaDirectHandler({...config,store});
 const wa=msg('shared');assert.equal((await h(signed(payload(entry(route,[wa]))))).status,200);
 const y=createSignedYCloudBridge({secret,routes:[route],store,enabled:true});
 const raw=JSON.stringify({id:'ycloud-event',type:'whatsapp.inbound_message.received',apiVersion:'v2',whatsappInboundMessage:{id:'ycloud-id',wamid:wa.id,wabaId:route.waba,to:route.to,from:route.allowSenders[0],type:'text',text:{body:'Hola'}}});
 const sign='t='+timestamp+',s='+createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
 assert.equal((await y({raw,signature:sign,now:NOW})).status,'duplicate');
 assert.equal(store.events.length,1);assert.equal(store.sessions.size,1);
});
test('servidor HTTP Node en loopback: desafío real HTTP y POST firmado, sin servicios externos',async()=>{
 const store=makeStore(),server=createMetaDirectServer({...config,store});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const get=await fetch(base+'/webhooks/meta?hub.mode=subscribe&hub.verify_token='+verifyToken+'&hub.challenge=789');
  assert.equal(get.status,200);assert.equal(await get.text(),'789');
  const body=signed(payload(entry(route,[msg('http')])));
  const post=await fetch(base+body.url,{method:'POST',body:body.raw,headers:{'x-hub-signature-256':body.signature,'content-type':'application/json'}});
  assert.equal(post.status,200);assert.equal(await post.text(),'OK');assert.equal(store.events.length,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

import {projectMetaServiceText} from '../scripts/gestlok-meta-direct/outbound-preview.mjs';
test('proyección directa usa formato Cloud API, agrupa, nunca envía ni presume cupo',()=>{
 const base={from:route.to,to:route.allowSenders[0],metaPhoneId:route.phoneId,messages:['Hola','Menú'],lastInboundAt:NOW-60000,now:NOW};
 const preview=projectMetaServiceText(base);
 assert.deepEqual(preview.payloads,[{messaging_product:'whatsapp',recipient_type:'individual',to:'5491100000000',type:'text',text:{body:'Hola\n\nMenú',preview_url:false}}]);
 assert.equal(preview.units,1);assert.equal(preview.dispatchAllowed,false);assert.equal(preview.quotaVerified,false);
 assert.equal(projectMetaServiceText({...base,lastInboundAt:NOW-24*3600000}).reason,'unverified_service_window');
 assert.equal(projectMetaServiceText({...base,lastInboundAt:null}).reason,'unverified_service_window');
 assert.equal(projectMetaServiceText({...base,messages:['😀'.repeat(5000)]}).units,2);
});
