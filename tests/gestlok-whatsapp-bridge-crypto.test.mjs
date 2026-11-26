import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeCode,formatCode,parseCode,hashToken,seal,open,allowedAction} from '../entornos/whatsapp-lab/bridge-core.mjs';
test('código por sucursal, secreto aleatorio y cifrado autenticado',async()=>{
 const s=makeCode('munro');assert.deepEqual(parseCode(formatCode(s)),s);assert.match(await hashToken(s),/^[a-f0-9]{64}$/);
 assert.notEqual(s.token,s.key);assert.throws(()=>parseCode(formatCode(s).replace('munro','otro')));
 const raw={history:[{text:'mensaje de ensayo'}]},c=await seal(s,'state',raw);assert.ok(!c.includes('mensaje'));assert.deepEqual(await open(s,'state',c),raw);
 await assert.rejects(open(s,'command',c));await assert.rejects(open({...s,local:'torcuato'},'state',c));await assert.rejects(open(makeCode('munro'),'state',c));
 assert.notEqual(await seal(s,'state',raw),c);assert.ok(allowedAction('reply','Prueba'));assert.ok(!allowedAction('send','Prueba'));assert.ok(!allowedAction('reply','x'.repeat(301)));
});
