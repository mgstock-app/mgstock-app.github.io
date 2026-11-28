import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../tools/wai-domain/worker.mjs';
const origin='https://wai-mi-gusto-munro.gestlok.com.ar';
test('subdominio WAI mantiene el host, bloquea cruce de sucursal y no captura otros dominios',async()=>{
 const root=await handle(new Request(origin+'/'));
 assert.equal(root.status,302);assert.equal(root.headers.get('location'),origin+'/chat/wai/');
 assert.equal((await handle(new Request(origin+'/chat/wai/?local=mi-gusto-torcuato'))).status,404);
 assert.equal((await handle(new Request('https://gestlok.com.ar/'))).status,404);
 assert.equal((await handle(new Request(origin+'/stock/'))).status,404);
});
test('solo recursos estáticos de producción sin reenviar credenciales',async()=>{
 const r=await handle(new Request(origin+'/chat/wai/?local=mi-gusto-munro',{headers:{authorization:'secret',cookie:'secret'}}),async(target,options)=>{
  assert.equal(target,'https://gestlok.com.ar/chat/wai/?local=mi-gusto-munro');assert.equal(options.headers.has('authorization'),false);assert.equal(options.headers.has('cookie'),false);
  return new Response('portal',{headers:{'set-cookie':'secret'}});
 });
 assert.equal(await r.text(),'portal');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.has('set-cookie'),false);
});
test('el panel del local puede cargar el motor del chat por el subdominio',async()=>{
 const r=await handle(new Request(origin+'/chat/motor.js?v=1'),async target=>{assert.equal(target,'https://gestlok.com.ar/chat/motor.js?v=1');return new Response('motor');});
 assert.equal(r.status,200);
 assert.equal((await handle(new Request(origin+'/chat/otro.js'))).status,404);
});
