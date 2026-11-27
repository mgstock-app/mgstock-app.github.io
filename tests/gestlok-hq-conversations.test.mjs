import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=readFileSync('supabase/functions/gestlok-hq-agent/index.ts','utf8');
const marker='HQ_CHAT_V1\n';
const creator='00000000-0000-0000-0000-000000000000', taskId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function row(id,agent,mode,message,status='cerrada'){return {id,agent,status,created_at:'2026-11-27T00:00:00Z',instruction:marker+JSON.stringify({mode,message})};}
function exercise({mode='private',agent='lider',action='chat',authorized=true,claimError=false,providerError=false}={}){
 const sent=[],rpcCalls=[];let handler;
 const tasks=[row(taskId,agent,mode,'Pregunta actual','pendiente'),row('private-alex','lider','private','Privado Alex'),row('private-tomas','testing','private','Privado Tomás'),row('meeting-tomas','testing','meeting','Consulta reunión'),{id:'op',agent:'desarrollo',status:'cerrada',instruction:'Informe comercial',created_at:'2026-11-26T00:00:00Z'}];
 const runs=tasks.slice(1).map(t=>({task_id:t.id,state:'review',result:'Respuesta '+t.id,created_at:t.created_at}));
 const db={auth:{getUser:async()=>({data:{user:{id:creator,email:authorized?'kmu15lopez@gmail.com':'usuario@example.com',email_confirmed_at:'yes'}}})},rpc:async(fn,args)=>{rpcCalls.push([fn,args]);if(fn==='gestlok_hq_claim_chat')return claimError?{error:{message:'Límite diario del equipo'}}:{data:{id:'run1',agent,instruction:tasks[0].instruction}};return {data:true};}};
 const session={rpc:async(fn)=>({data:fn==='gestlok_hq_list_tasks'?tasks:fn==='gestlok_hq_list_runs'?runs:fn==='gestlok_hq_pulso'?{sucursales:[]}:{}})};
 const code=stripTypeScriptTypes(source,{mode:'strip'}).replace(/^import .*;$/m,'');
 vm.runInNewContext(code,{Deno:{env:{get:k=>k==='GESTLOK_HQ_GROQ_FREE_API_KEY'?'fake-test-key':k==='SUPABASE_SERVICE_ROLE_KEY'?'service':'anon'},serve:fn=>{handler=fn;}},createClient:(_url,key)=>key==='service'?db:session,Response,Request,AbortSignal,fetch:async(url,o)=>{if(url.includes('api.github'))return new Response(JSON.stringify({workflow_runs:[]}),{status:200});if(url.includes('completions')){sent.push(JSON.parse(o.body));return providerError?new Response('{}',{status:429}):new Response(JSON.stringify({usage:{total_tokens:252},choices:[{message:{content:'Respuesta válida del asistente.'}}]}),{status:200});}throw Error('unexpected fetch');}});
 return {sent,rpcCalls,run:()=>handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({action,task_id:taskId})}))};
}
test('HQ: Alex responde con una consulta, con base común e historial exclusivamente privado',async()=>{
 const x=exercise();const r=await x.run();assert.equal((await r.json()).state,'review');assert.equal(x.sent.length,1);
 const prompt=x.sent[0].messages;assert.match(prompt[0].content,/Base común GESTLOK/);assert.match(prompt[0].content,/GESTLOK WAI/);
 const input=prompt[1].content;assert.match(input,/Privado Alex/);assert.doesNotMatch(input,/Privado Tomás|Consulta reunión/);assert.match(input,/Respuesta op/);
 assert.ok(x.rpcCalls.some(([fn])=>fn==='gestlok_hq_claim_chat'));
 const finish=x.rpcCalls.find(([fn])=>fn==='gestlok_hq_finish_director')[1];assert.equal(finish.p_hire,null);assert.equal(finish.p_result,'Respuesta válida del asistente.');
 assert.ok(x.rpcCalls.some(([fn,a])=>fn==='gestlok_hq_record_tokens'&&a.p_tokens===252));
});
test('HQ: reunión responde Tomás sin abrir conversaciones privadas',async()=>{
 const x=exercise({mode:'meeting',agent:'testing'});const r=await x.run();assert.equal((await r.json()).state,'review');assert.equal(x.sent.length,1);
 const input=x.sent[0].messages[1].content;assert.match(input,/Consulta reunión/);assert.doesNotMatch(input,/Privado Alex|Privado Tomás/);
 assert.ok(x.rpcCalls.some(([fn])=>fn==='gestlok_hq_finish_run'));
});
test('HQ: sesión incorrecta, cupo agotado y ruta incorrecta no consultan Groq',async()=>{
 for(const opts of [{authorized:false},{claimError:true},{action:'run'}]){const x=exercise(opts);const r=await x.run();assert.ok(r.status>=400);assert.equal(x.sent.length,0);}
});
test('HQ: rechazo 429 libera reserva sin respuesta inventada ni reintento',async()=>{
 const x=exercise({providerError:true});const r=await x.run();assert.equal((await r.json()).state,'released');assert.equal(x.sent.length,1);assert.ok(x.rpcCalls.some(([fn])=>fn==='gestlok_hq_release_run'));assert.ok(!x.rpcCalls.some(([fn])=>fn==='gestlok_hq_finish_director'));
});
test('HQ: el motor manual y autónomo comparten exactamente la misma base',()=>{
 const worker=readFileSync('supabase/functions/gestlok-hq-worker/index.ts','utf8');
 assert.equal(source.match(/const SHARED_KNOWLEDGE=(.*);/)[1],worker.match(/const SHARED_KNOWLEDGE=(.*);/)[1]);
});
