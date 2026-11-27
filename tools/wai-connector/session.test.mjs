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
