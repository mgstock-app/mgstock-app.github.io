import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../tools/wai-domain/worker.mjs';
const origin='https://wai-mi-gusto-munro.gestlok.com.ar';
test('los subdominios viejos redirigen al local dentro de la app única gestlok.com.ar/wai',async()=>{
 for(const path of ['/','/chat/wai/','/chat/wai/?local=mi-gusto-torcuato','/stock/']){
  const r=await handle(new Request(origin+path));
  assert.equal(r.status,301);assert.equal(r.headers.get('location'),'https://gestlok.com.ar/wai/?local=mi-gusto-munro');
 }
 assert.equal((await handle(new Request('https://gestlok.com.ar/'))).status,404);
 assert.equal((await handle(new Request(origin+'/',{method:'POST'}))).status,405);
});
