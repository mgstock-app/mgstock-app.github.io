// Integration test of the deployed Prueba module: no providers or accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
test('Prueba: conversación compacta, aislamiento, desconexión, exclusión y cupo sin salida',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'gestlok-qr-test-'));
 try{
  execFileSync(process.execPath,['entornos/construir.mjs',dir],{env:{...process.env,ENTORNO:'prueba'}});
  const base=join(dir,'chat/prueba-whatsapp');
  assert.match(readFileSync(join(base,'index.html'),'utf8'),/connect-src 'none'/);
  assert.match(readFileSync(join(dir,'index.html'),'utf8'),/Laboratorio seguro de WhatsApp/);
  const {makeLab}=await import(pathToFileURL(join(base,'model.mjs')));
  let now=Date.now();const a=makeLab('munro',()=>now),b=makeLab('torcuato',()=>now);
  assert.equal((await a.send('Hola')).status,'not_paired');
  assert.match(a.generate(),/^FICTICIO-QR-/);now+=61000;assert.equal(a.pair(),false);
  a.generate();b.generate();assert.equal(a.pair(),true);assert.equal(b.pair(),true);
  const r=await a.send('Hola');assert.equal(r.status,'accepted');assert.ok(r.reply.length);assert.equal(r.sendAllowed,false);
  assert.equal((await a.send('Hola',{repeat:true})).status,'duplicate');
  a.exclude(true);assert.equal((await a.send('Hola')).status,'excluded_sender');assert.equal((await b.send('Hola')).status,'accepted');
  a.exclude(false);assert.equal((await a.send('Hola',{group:true})).status,'invalid_message');
  a.scenario(799);await a.advance();assert.equal(a.snapshot().used,800);assert.equal(a.snapshot().paused,false);
  a.scenario(899);await a.advance();assert.equal(a.snapshot().used,900);assert.equal(a.snapshot().paused,true);
  assert.equal(a.decide('continuar'),true);assert.equal((await a.send('Hola')).status,'quota_paused');assert.equal((await a.advance()).reserved,false);
  assert.equal(b.snapshot().paused,false);b.controller.disconnect();assert.equal((await b.send('Hola')).status,'not_paired');
  execFileSync(process.execPath,['entornos/construir.mjs',dir],{env:{...process.env,ENTORNO:'testing'}});
  assert.equal(existsSync(join(dir,'chat/prueba-whatsapp')),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
