import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from './session.mjs';
function fixture(number='+5491100000001',id='a'){
 let rev='initial',order='reconectar',enabled=true,t=1000,handler,fail=false;
 const reports=[],actions=[];
 const s=createSession({id,number,now:()=>t,exchange:async p=>{
   reports.push(p);if(fail)throw Error('offline');
   return {habilitada:enabled,revision:rev,orden:order,numero:number};
 },transport:async({reset,onEvent})=>{
   actions.push(['start',reset]);handler=onEvent;
   return {close:async()=>actions.push(['close'])};
 }});
 return {s,reports,actions,event:e=>handler(e),advance:x=>t+=x,command:(r,o)=>{rev=r;order=o;},disable:()=>enabled=false,net:v=>fail=v};
}
test('cada sesión recupera cortes sin pedir QR al usuario; otro comercio sigue en línea',async()=>{
 const a=fixture(),b=fixture('+5491100000002','b');
 await Promise.all([a.s.tick(),b.s.tick()]);
 a.event({type:'open',number:'+541100000001'});b.event({type:'open',number:'+5491100000002'});
 await Promise.all([a.s.tick(),b.s.tick()]);
 assert.equal(a.reports.at(-1).p_estado,'conectado');
 assert.equal(b.reports.at(-1).p_estado,'conectado');
 a.event({type:'close',retryable:true});
 await a.s.tick();assert.equal(a.actions.length,1);
 a.advance(2000);await a.s.tick();
 assert.deepEqual(a.actions,[['start',false],['start',false]]);
 assert.equal(b.s.state(),'conectado');
 a.event({type:'open',number:'+5491100000001'});await a.s.tick();
 assert.equal(a.reports.at(-1).p_estado,'conectado');
});
test('QR real de transporte temporal, rotación dirigida, nunca aceptar teléfono distinto',async()=>{
 const a=fixture();
 await a.s.tick();a.event({type:'qr',qr:'fake-transport-qr-1234567890'});await a.s.tick();
 assert.match(a.reports.at(-1).p_qr,/fake-transport/);
 a.advance(41000);await a.s.tick();assert.equal(a.reports.at(-1).p_qr,null);assert.equal(a.reports.at(-1).p_estado,'desconectado');
 a.command('new','qr');await a.s.tick();assert.deepEqual(a.actions.at(-1),['start',true]);
 a.event({type:'open',number:'+5491100000002'});await a.s.tick();
 assert.equal(a.s.state(),'desconectado');assert.equal(a.reports.at(-1).p_numero,null);
});
test('deshabilitar, perder control o revocar autenticación no deja sesión activa',async()=>{
 const a=fixture();await a.s.tick();a.event({type:'open',number:'+5491100000001'});
 a.net(true);await a.s.tick();assert.equal(a.s.state(),'sin_senal');assert.deepEqual(a.actions.at(-1),['close']);
 a.net(false);await a.s.tick();a.event({type:'close',retryable:false});a.advance(60000);await a.s.tick();assert.equal(a.s.state(),'desconectado');
 a.command('recover','reconectar');await a.s.tick();a.event({type:'open',number:'+5491100000001'});
 a.disable();await a.s.tick();assert.equal(a.s.state(),'sin_senal');assert.deepEqual(a.actions.at(-1),['close']);
});
test('reiniciar el proceso no descarta credenciales aunque haya una orden QR anterior',async()=>{
 const a=fixture();a.command('old','qr');await a.s.tick();assert.deepEqual(a.actions,[['start',false]]);
});
test('revinculación explícita reemplaza únicamente la sesión solicitada aunque figure conectada',async()=>{
 const a=fixture(),b=fixture('+5491100000002','b');
 await a.s.tick();await b.s.tick();a.event({type:'open',number:'+5491100000001'});b.event({type:'open',number:'+5491100000002'});
 a.command('forced','qr_forzado');await a.s.tick();
 assert.deepEqual(a.actions,[['start',false],['close'],['start',true]]);
 assert.equal(b.s.state(),'conectado');
 const restarted=fixture();restarted.command('forced','qr_forzado');await restarted.s.tick();assert.deepEqual(restarted.actions,[['start',true]]);
});
test('una señal local no mantiene el estado conectado si el transporte no responde',async()=>{
 let handler,healthy=true;
 const reports=[];
 const s=createSession({id:'probe',number:'+5491100000001',transport:async({onEvent})=>{handler=onEvent;return {verify:async()=>healthy,close:async()=>{}}},exchange:async r=>{reports.push(r);return {habilitada:true,revision:'r',orden:'reconectar',numero:'+5491100000001'}}});
 await s.tick();handler({type:'open',number:'+5491100000001'});await s.tick();assert.equal(reports.at(-1).p_estado,'conectado');
 healthy=false;await s.tick();assert.equal(reports.at(-1).p_estado,'desconectado');assert.equal(s.state(),'desconectado');
});

test('carga simulada: diez sesiones, 60 ciclos, caída parcial y reconexión aislada',async()=>{
 const sessions=Array.from({length:10},(_,i)=>({number:'+54911000000'+String(i+10),...fixture('+54911000000'+String(i+10),'sesion-'+i)}));
 const tick=()=>Promise.all(sessions.map(v=>v.s.tick()));
 await tick();
 sessions.forEach(v=>v.event({type:'open',number:v.number}));
 await tick();
 for(let i=0;i<60;i++){
  if(i===10){
   sessions[1].event({type:'close',retryable:true});
   sessions[3].net(true);
   sessions[5].event({type:'close',retryable:false});
  }
  if(i===12){sessions[3].net(false);}
  sessions.forEach(v=>v.advance(1000));
  await tick();
  if(i===12){sessions[1].event({type:'open',number:sessions[1].number});sessions[3].event({type:'open',number:sessions[3].number});}
  for(const j of [0,2,4,6,7,8,9]){
   assert.equal(sessions[j].s.state(),'conectado');
   assert.equal(sessions[j].actions.length,1);
   assert.equal(sessions[j].reports.at(-1).p_id,'sesion-'+j);
   assert.equal(sessions[j].reports.at(-1).p_numero,sessions[j].number);
  }
 }
 assert.equal(sessions[1].s.state(),'conectado');
 assert.equal(sessions[3].s.state(),'conectado');
 assert.equal(sessions[5].s.state(),'desconectado');
 assert.equal(sessions[5].actions.filter(v=>v[0]==='start').length,1);
 await Promise.all(sessions.map(v=>v.s.close()));
});
