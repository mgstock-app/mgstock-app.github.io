import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {lineKey,seal,open,createRemoteStore,useRemoteAuthState,migrateLegacy} from './remote-auth.mjs';
import {createPollStore} from './poll-store.mjs';
const central='c'.repeat(64),line='10000000-0000-4000-8000-000000000001';
// Base simulada: solo responde al equipo que tiene el turno.
function fakeDb(){
 const rows=new Map();let turno='pc',calls=0;
 const call=equipo=>async(accion,args)=>{
  calls++;if(equipo!==turno)return null;
  if(accion==='leer'){const valores={};for(const k of args.p_claves){const v=rows.get(args.p_tipo+'|'+k);if(v)valores[k]=v;}return {ok:true,valores};}
  if(accion==='guardar'){for(const c of args.p_cambios){if(c.v==null)rows.delete(c.t+'|'+c.k);else rows.set(c.t+'|'+c.k,c.v);}return {ok:true};}
  if(accion==='borrar'){rows.clear();return {ok:true};}
  return null;
 };
 return {rows,call,set turno(v){turno=v;},get calls(){return calls;}};
}
const deps={initAuthCreds:()=>({noiseKey:{private:'nuevo'},me:null}),BufferJSON:{replacer:(k,v)=>v,reviver:(k,v)=>v},proto:{Message:{AppStateSyncKeyData:{fromObject:o=>({...o,proto:true})}}}};
test('cifrado por línea: sin la clave central no se lee y no se puede cambiar de lugar',()=>{
 const k=lineKey(central,line),c=seal(k,'secreto de sesión',line,'session','a.0');
 assert.equal(open(k,c,line,'session','a.0'),'secreto de sesión');
 assert.doesNotMatch(Buffer.from(c,'base64').toString('latin1'),/secreto/);
 assert.throws(()=>open(k,c,line,'session','b.0'));
 assert.throws(()=>open(lineKey('d'.repeat(64),line),c,line,'session','a.0'));
 assert.throws(()=>lineKey('corta',line));
});
test('la PC guarda la sesión y el teléfono la retoma sin QR nuevo cuando le toca el turno',async()=>{
 const db=fakeDb();
 const pc=await useRemoteAuthState(createRemoteStore({call:db.call('pc'),lineId:line,centralKey:central}),{deps});
 assert.deepEqual(pc.state.creds,{noiseKey:{private:'nuevo'},me:null});
 pc.state.creds.me={id:'5491100000001:7@s.whatsapp.net'};await pc.saveCreds();
 await pc.state.keys.set({session:{'5491100000002.0':'ratchet-1'},'pre-key':{'1':{pub:'x'}},'app-state-sync-key':{'AB/CD':{keyData:'k'}}});
 assert.ok([...db.rows.values()].every(v=>!/ratchet|5491100000001/.test(Buffer.from(v,'base64').toString('latin1'))),'la base solo guarda datos cifrados');
 // El teléfono no puede leer mientras la PC tiene el turno.
 await assert.rejects(()=>useRemoteAuthState(createRemoteStore({call:db.call('telefono'),lineId:line,centralKey:central}),{deps}),/turno/);
 db.turno='telefono';
 const tel=await useRemoteAuthState(createRemoteStore({call:db.call('telefono'),lineId:line,centralKey:central}),{deps});
 assert.equal(tel.state.creds.me.id,'5491100000001:7@s.whatsapp.net');
 const got=await tel.state.keys.get('session',['5491100000002.0','falta']);
 assert.equal(got['5491100000002.0'],'ratchet-1');assert.equal(got.falta,null);
 assert.equal((await tel.state.keys.get('app-state-sync-key',['AB/CD']))['AB/CD'].proto,true);
 // La PC ya no puede escribir: no pisa la sesión del teléfono.
 await assert.rejects(()=>pc.state.keys.set({session:{'5491100000002.0':'viejo'}}),/turno/);
 await tel.state.keys.set({session:{'5491100000002.0':null}});
 assert.equal((await tel.state.keys.get('session',['5491100000002.0']))['5491100000002.0'],null);
});
test('se guarda en tandas y un QR nuevo borra la sesión anterior',async()=>{
 const db=fakeDb(),store=createRemoteStore({call:db.call('pc'),lineId:line,centralKey:central,chunk:100});
 const before=db.calls;
 await store.set(Array.from({length:812},(_,i)=>({tipo:'pre-key',clave:String(i),texto:'{"k":'+i+'}'})));
 assert.equal(db.calls-before,9);assert.equal(db.rows.size,812);
 await store.clear();assert.equal(db.rows.size,0);
 await assert.rejects(()=>store.set([{tipo:'Mal',clave:'x',texto:'y'}]),/Clave inválida/);
});
test('pasa una sesión vieja en archivos a GESTLOK una sola vez (sin claves de grupos)',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wai-legado-'));
 try{
  await writeFile(join(dir,'creds.json'),'{"me":{"id":"5491100000001:3@s.whatsapp.net"}}');
  await writeFile(join(dir,'pre-key-1.json'),'{"pub":"a"}');
  await writeFile(join(dir,'session-5491100000002.0.json'),'"s"');
  await writeFile(join(dir,'app-state-sync-key-AB__CD.json'),'{"keyData":"k"}');
  await writeFile(join(dir,'sender-key-grupo--x.json'),'"g"');
  const db=fakeDb(),store=createRemoteStore({call:db.call('pc'),lineId:line,centralKey:central});
  const auth=await useRemoteAuthState(store,{deps,legacyDir:dir});
  assert.equal(auth.state.creds.me.id,'5491100000001:3@s.whatsapp.net');
  assert.equal(db.rows.size,4);assert.ok(db.rows.has('app-state-sync-key|AB/CD'));assert.ok(!db.rows.has('sender-key|grupo--x'));
  assert.equal(await migrateLegacy(store,join(dir,'no-existe')),0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('las encuestas propias quedan en GESTLOK para que el respaldo lea los votos',async()=>{
 const db=fakeDb(),store=createRemoteStore({call:db.call('pc'),lineId:line,centralKey:central});
 const polls=createPollStore('/no-se-usa',{kv:store.kv('poll'),now:()=>Date.parse('2026-11-28T00:00:00Z')});
 const grant={id:'p1',tester:'+5491100000002',vence_at:'2026-11-28T06:00:00Z'};
 await polls.create('ev1','5491100000002@s.whatsapp.net','5491100000002@s.whatsapp.net',grant,{pregunta:'¿Retiro o envío?',opciones:[{id:'retiro',label:'Retiro'},{id:'envio',label:'Envío'}]});
 db.turno='telefono';
 const tel=createPollStore('/no-se-usa',{kv:createRemoteStore({call:db.call('telefono'),lineId:line,centralKey:central}).kv('poll'),now:()=>Date.parse('2026-11-28T00:01:00Z')});
 const r=await tel.get('ev1',grant,'5491100000002@s.whatsapp.net','5491100000002@s.whatsapp.net');
 assert.equal(r.pregunta,'¿Retiro o envío?');assert.equal(Buffer.from(r.secret,'base64').length,32);
 assert.equal(await tel.get('otra',grant,'5491100000002@s.whatsapp.net','5491100000002@s.whatsapp.net'),null);
});
