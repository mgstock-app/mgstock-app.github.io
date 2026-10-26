import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {create}=createRequire(import.meta.url)('../public/stock/gestlok-offline.js');
const base='https://offline-test.supabase.co',tenant='00000000-0000-4000-8000-000000000010';
const actorA='00000000-0000-4000-8000-000000000001',actorB='00000000-0000-4000-8000-000000000002';
const token=id=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:id})).toString('base64url')+'.synthetic';
function harness(t){
 const records=new Map(),receipts=new Map(),server=new Map([['p',{col:'munro/productos',id:'p',data:{nombre:'Producto ficticio',stock:1}}]]);
 const store={get:async k=>structuredClone(records.get(k)),put:async(k,v)=>{records.set(k,structuredClone(v));},remove:async k=>{records.delete(k);},all:async()=>[...records.values()].map(v=>structuredClone(v))};
 let connected=true,identity=actorA,loseReply=false,calls=0;
 const network=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url);if(!connected)throw new TypeError('Failed to fetch');
  const id=JSON.parse(Buffer.from(req.headers.get('authorization').split('.')[1],'base64url')).sub;
  const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
  if(url.pathname.endsWith('gestlok_sync_context'))return json({actor:id,tenant});
  if(url.pathname.endsWith('gestlok_sync_apply')){
   const args=await req.json();if(receipts.has(args.p_id))return json(receipts.get(args.p_id));calls++;
   const result=[];for(const r of args.p_payload.rows){const old=server.get(r.key.id);if(r.check&&JSON.stringify(old?.data??null)!==JSON.stringify(r.expected??null))return new Response(JSON.stringify({message:'SYNC_CONFLICT'}),{status:400});
    const row={...old,...r.key,...r.body};if(r.merge_data)row.data={...old?.data,...r.body.data};server.set(r.key.id,row);result.push(row);}
   receipts.set(args.p_id,result);if(loseReply){loseReply=false;throw new TypeError('response lost');}return json(result);
  }
  return json([...server.values()].filter(r=>!url.searchParams.has('col')||r.col===url.searchParams.get('col').slice(3)));
 };
 const previous=globalThis.fetch;globalThis.fetch=network;t.after(()=>{globalThis.fetch=previous;});
 const engine=()=>create({store,online:()=>connected});let api=engine();
 const request=(method='GET',body=null,id=identity)=>api.transport(base,'public-test',network)(base+(method==='GET'?'/rest/v1/docs?select=id,data&col=eq.munro%2Fproductos':'/rest/v1/rpc/doc_update'),{method,headers:{authorization:'Bearer '+token(id),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {records,server,store,request,get api(){return api;},offline(){connected=false;},online(){connected=true;},switchAccount(id){identity=id;},loseReply(){loseReply=true;},calls:()=>calls,reload(){api=engine();},bind(){api.bindAuth(async()=>({user:{id:identity},access_token:token(identity)}));}};
}
test('offline edit survives reload and is visible locally, with no credentials in the outbox',async t=>{
 const h=harness(t);await h.request();h.offline();await h.request('POST',{p_col:'munro/productos',p_id:'p',p_patch:{stock:4}});
 assert.equal(h.server.get('p').data.stock,1);h.reload();const r=await h.request();assert.equal((await r.json())[0].data.stock,4);
 const ops=await h.api.list();assert.equal(ops.length,1);assert.ok(!JSON.stringify(ops).includes(token(actorA)));assert.ok(!JSON.stringify(ops).includes('authorization'));
});
test('queued writes replay automatically with the same identity and preserve unrelated fields',async t=>{
 const h=harness(t);await h.request();h.offline();await h.request('POST',{p_col:'munro/productos',p_id:'p',p_patch:{stock:4}});h.online();h.bind();await new Promise(r=>setImmediate(r));await h.api.flush();
 assert.equal(h.server.get('p').data.stock,4);assert.equal(h.server.get('p').data.nombre,'Producto ficticio');assert.equal((await h.api.list()).length,0);
});
test('lost response reuses the same operation id rather than applying twice',async t=>{
 const h=harness(t);await h.request();h.loseReply();await h.request('POST',{p_col:'munro/productos',p_id:'p',p_patch:{stock:7}});
 assert.equal(h.calls(),1);h.bind();await new Promise(r=>setImmediate(r));await h.api.flush();assert.equal(h.calls(),1);assert.equal((await h.api.list()).length,0);
});
test('a concurrent edit is retained as a blocked change and never overwrites the server',async t=>{
 const h=harness(t);await h.request();h.offline();await h.request('POST',{p_col:'munro/productos',p_id:'p',p_patch:{stock:4}});h.server.get('p').data.stock=9;h.online();h.bind();await new Promise(r=>setImmediate(r));await h.api.flush();
 assert.equal(h.server.get('p').data.stock,9);const [op]=await h.api.list();assert.equal(op.state,'blocked');assert.match(op.error,/CONFLICT/);
});
test('another account cannot read or submit the previous account pending changes',async t=>{
 const h=harness(t);await h.request();h.offline();await h.request('POST',{p_col:'munro/productos',p_id:'p',p_patch:{stock:4}});h.switchAccount(actorB);
 await assert.rejects(h.request(),/Failed to fetch/);assert.equal((await h.api.list()).length,0);h.online();await h.request();h.bind();await new Promise(r=>setImmediate(r));await h.api.flush();assert.equal(h.server.get('p').data.stock,1);assert.equal(h.calls(),0);
});
