import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../tools/wai-domain/worker.mjs';
test('wai.gestlok.com.ar es el único subdominio y lleva a la app gestlok.com.ar/wai',async()=>{
 for(const path of ['/','/cualquier/ruta','/?x=1']){
  const r=await handle(new Request('https://wai.gestlok.com.ar'+path));
  assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://gestlok.com.ar/wai/');
 }
 const local=await handle(new Request('https://wai.gestlok.com.ar/?local=mi-gusto-munro'));
 assert.equal(local.headers.get('location'),'https://gestlok.com.ar/wai/?local=mi-gusto-munro');
 assert.equal((await handle(new Request('https://wai.gestlok.com.ar/?local=../x'))).headers.get('location'),'https://gestlok.com.ar/wai/');
 assert.equal((await handle(new Request('https://wai-mi-gusto-munro.gestlok.com.ar/'))).status,404,'no hay subdominios por local');
 assert.equal((await handle(new Request('https://wai.gestlok.com.ar/',{method:'POST'}))).status,405);
});
