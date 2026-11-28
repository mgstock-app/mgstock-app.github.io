import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=readFileSync('supabase/functions/gestlok-hq-agent/index.ts','utf8');
function retiredHandler(name) {
 const src=readFileSync('supabase/functions/gestlok-hq-'+name+'/index.ts','utf8');
 const code=stripTypeScriptTypes(src,{mode:'strip'}).replace(/^import .*;$/m,'');
 let handler;
 const forbidden=()=>{throw Error('Un motor retirado no debe usar secretos, Supabase ni la red');};
 vm.runInNewContext(code,{Deno:{env:{get:forbidden},serve:fn=>{handler=fn;}},createClient:forbidden,Response,Request,AbortSignal,fetch:forbidden});
 return handler;
}
test('HQ retirado: agente rechaza conversaciones, tareas y estado sin red ni base de datos',async()=>{
 const handler=retiredHandler('agent');
 for(const action of ['chat','run','status']){
  const r=await handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test',origin:'https://gestlok.com.ar'},body:JSON.stringify({action})}));
  assert.equal(r.status,410);
  assert.equal((await r.json()).error,'GESTLOK HQ fue retirado');
 }
 const preflight=await handler(new Request('https://example.test',{method:'OPTIONS',headers:{origin:'https://gestlok.com.ar'}}));
 assert.equal(preflight.status,204);
});
test('HQ retirado: worker programado devuelve 410 sin consultar secretos, Groq o GitHub',async()=>{
 const handler=retiredHandler('worker');
 const r=await handler(new Request('https://example.test',{method:'POST',headers:{'x-gestlok-hq-worker':'a'.repeat(64)}}));
 assert.equal(r.status,410);
 assert.equal((await r.json()).error,'GESTLOK HQ fue retirado');
});

test('HQ: el motor manual y autónomo comparten exactamente la misma base',()=>{
 const worker=readFileSync('supabase/functions/gestlok-hq-worker/index.ts','utf8');
 assert.equal(source.match(/const SHARED_KNOWLEDGE=(.*);/)[1],worker.match(/const SHARED_KNOWLEDGE=(.*);/)[1]);
});

test('HQ: mensajes de conversación no disparan encargos ni avisos de Dirección',()=>{
 const sql=readFileSync('supabase/migrations/20261127031700_gestlok_hq_chat_isolation.sql','utf8');
 assert.match(sql,/registrar_encargo\(\)[\s\S]*left\(t\.instruction,length\(E'HQ_CHAT_V1\\n'\)\)=E'HQ_CHAT_V1\\n'/);
 assert.match(sql,/enqueue_director_push\(\)[\s\S]*left\(t\.instruction,length\(E'HQ_CHAT_V1\\n'\)\)<>E'HQ_CHAT_V1\\n'/);
 assert.match(sql,/length\(split_part\(linea,'\|',3\)\) between 15 and 500/);
 assert.doesNotMatch(sql,/\{15,500\}/);
});
