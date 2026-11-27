import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadMenuImage,permittedMenuUrl} from './menu-media.mjs';
import {pilotTransport} from './pilot.mjs';
const url='https://gestlok-prueba.vercel.app/chat/carta-wai/empanadas-sabores.jpg';
const bytes=readFileSync(new URL('../../public/chat/carta-wai/empanadas-sabores.jpg',import.meta.url));
test('carta: imagen JPEG real, tamaño limitado y sin redirecciones ni URLs arbitrarias',async()=>{
 for(const u of ['http://127.0.0.1/menu.jpg','https://gestlok-prueba.vercel.app.evil.test/chat/carta-wai/a.jpg',url+'?token=secret','https://gestlok-prueba.vercel.app/chat/carta-wai/../a.jpg'])assert.equal(permittedMenuUrl(u),null);
 const m=await loadMenuImage(url,{fetcher:async(u,opt)=>{assert.equal(u,url);assert.equal(opt.redirect,'error');return new Response(bytes,{headers:{'content-type':'image/jpeg'}});}});
 assert.equal(m.mimetype,'image/jpeg');assert.ok(m.image.equals(bytes));
 await assert.rejects(loadMenuImage(url,{fetcher:async()=>new Response('html',{headers:{'content-type':'image/jpeg'}})}),/Contenido/);
 await assert.rejects(loadMenuImage(url,{fetcher:async()=>new Response(new Uint8Array(2*1024*1024+1),{headers:{'content-type':'image/jpeg'}})}),/grande/);
});
test('conector envía foto como contenido nativo, solo al contacto autorizado',async()=>{
 const target='5491100000003@s.whatsapp.net',other='5491100000004@s.whatsapp.net',now=Date.now();
 let job=null,attempts=0,states=[];
 const p=pilotTransport({active:()=>true,now:()=>now,pollStore:{},decryptVote:()=>{},menuImage:async u=>{assert.equal(u,url);return {image:bytes,mimetype:'image/jpeg'};},
 socket:{sendMessage:async(j,m)=>{attempts++;assert.equal(j,target);assert.ok(m.image.equals(bytes));assert.equal(m.caption,undefined);assert.equal(m.text,undefined);return {key:{id:'native-photo'}};}},
 rpc:async(name,a)=>{if(a.p_accion==='control'){assert.equal(a.p_estado,'opciones_imagen_v2');return {id:'pilot',tester:'+5491100000003',vence_at:new Date(now+60000).toISOString()};}if(a.p_accion==='tomar'){const r=job;job=null;return r;}if(a.p_accion==='resultado'){states.push(a.p_estado);return {ok:true};}}});
 job={id:'j',jid:target,texto:'Carta',imagen_url:url};await p.tick('rev');
 job={id:'wrong',jid:other,texto:'Carta',imagen_url:url};await p.tick('rev');
 assert.equal(attempts,1);assert.deepEqual(states,['aceptado']);
});
