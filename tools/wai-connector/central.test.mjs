import test from 'node:test';
import assert from 'node:assert/strict';
import {createCentral,validInventory} from './central.mjs';
const line=n=>({id:'10000000-0000-4000-8000-'+String(n).padStart(12,'0'),number:'+549110000'+String(n).padStart(4,'0'),key:'a'.repeat(64)});
test('una instancia recibe altas y bajas sin reinicio; conserva el resto',async()=>{
 let list=[line(1)],created=[],closed=[],ticks=[],released=false;
 const service=createCentral({inventory:async a=>a==='liberar'?void(released=true):{ok:true,sessions:list},create:l=>{created.push(l.id);return {tick:async()=>ticks.push(l.id),close:async()=>closed.push(l.id)};}});
 await service.tick();list.push(line(2));await service.tick();
 assert.equal(service.size(),2);assert.deepEqual(created,[line(1).id,line(2).id]);assert.deepEqual(closed,[]);
 list=[line(2)];await service.tick();assert.deepEqual(closed,[line(1).id]);assert.equal(service.size(),1);
 list=[line(1),line(2)];await service.tick();assert.equal(service.size(),2);assert.equal(created.length,3);
 await service.close();assert.equal(service.size(),0);assert.equal(released,true);
});
test('inventario inválido, ocupado o sin red pausa las sesiones',async()=>{
 let result={ok:true,sessions:[line(1),line(2)]},closed=[];
 const service=createCentral({inventory:async()=>{if(result instanceof Error)throw result;return result;},create:l=>({tick:async()=>{},close:async()=>closed.push(l.id)})});
 await service.tick();result={ok:false,ocupado:true};await service.tick();assert.equal(service.size(),0);assert.equal(closed.length,2);
 result={ok:true,sessions:[line(1)]};await service.tick();result=Error('offline');await service.tick();assert.equal(service.size(),0);
 assert.equal(validInventory({ok:true,sessions:[line(1),{...line(2),number:line(1).number}]}),null);
});
test('cambio de clave reemplaza solamente la sesión afectada',async()=>{
 let list=[line(1),line(2)],closed=[];
 const s=createCentral({inventory:async()=>({ok:true,sessions:list}),create:l=>({tick:async()=>{},close:async()=>closed.push(l.id)})});
 await s.tick();list=[{...line(1),key:'b'.repeat(64)},line(2)];await s.tick();
 assert.deepEqual(closed,[line(1).id]);await s.close();
});
test('50 líneas simuladas y 20 altas adicionales sin reiniciar las existentes',async()=>{
 let lines=Array.from({length:50},(_,i)=>line(i+1)),created=0,ticks=0,closed=0;
 const service=createCentral({inventory:async()=>({ok:true,sessions:lines}),create:()=>{created++;return {tick:async()=>ticks++,close:async()=>closed++};}});
 await service.tick();assert.equal(service.size(),50);assert.equal(ticks,50);
 lines=[...lines,...Array.from({length:20},(_,i)=>line(i+51))];
 await service.tick();assert.equal(service.size(),70);assert.equal(created,70);assert.equal(closed,0);
 lines=lines.slice(10);await service.tick();assert.equal(closed,10);assert.equal(created,70);
 await service.close();
});
test('el inventario continúa sincronizándose durante una operación lenta',async()=>{
 let list=[line(1)],resolveSlow,entered=false;
 const slow=new Promise(r=>resolveSlow=r);
 const service=createCentral({inventory:async()=>({ok:true,sessions:list}),create:l=>({tick:async()=>{if(l.id===line(1).id){entered=true;await slow;}},close:async()=>{}})});
 const first=service.tick();
 while(!entered)await Promise.resolve();
 list.push(line(2));await service.tick();assert.equal(service.size(),2);
 resolveSlow();await first;await service.close();
});
