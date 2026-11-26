import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchSinglePilotReply} from '../supabase/functions/gestlok-ycloud-adapter/one-shot.mjs';

test('costo cero estricto: ni autorización antigua, credenciales, cupo supuesto ni llamada inyectada habilitan salida',async()=>{
 let calls=0;
 const mock=()=>{calls++;throw Error('No debe ejecutar');};
 const args={projectId:'irqeitzbfyerxcrogkyh',route:{waba:'ficticia',from:'+5491100000001',to:'+5491100000002'},receipt:{verified:true},approval:{explicit:true,currency:'USD',maxAuthorized:0.05},apiKey:'mock-only',remainingFreeMessages:1000,claim:mock,fetchImpl:mock,messages:['Prueba']};
 for(const input of [undefined,{},args,{...args,approval:{explicit:true,currency:'USD',maxAuthorized:0}}]){
  assert.deepEqual(await dispatchSinglePilotReply(input),{attempted:false,reason:'zero_spend_policy',dispatchAllowed:false});
 }
 assert.equal(calls,0);
});
