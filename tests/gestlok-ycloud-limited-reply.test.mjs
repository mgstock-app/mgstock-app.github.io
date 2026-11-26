import test from 'node:test';
import assert from 'node:assert/strict';
import {attemptLimitedReply,routeKey} from '../supabase/functions/gestlok-ycloud-webhook/limited-reply.mjs';
const config={waba:'ficticio',to:'+5491100000001',from:'+5491100000002'};
const event={id:'e1',type:'whatsapp.inbound_message.received',whatsappInboundMessage:{id:'m1',wabaId:config.waba,to:config.to,from:config.from,type:'text',text:{body:'GESTLOK PRUEBA ABCD1234'}}};
function fixture(overrides={}){
 let claimed=false;const calls=[],states=[];
 const args={project:'https://irqeitzbfyerxcrogkyh.supabase.co',enabled:true,verified:true,apiKey:'fake',event:structuredClone(event),config,
  claim:async()=>claimed?null:(claimed=true,'12345678-aaaa-4444-8000-123456789abc'),
  finish:async(...a)=>states.push(a),isExcluded:async()=>false,fetcher:async(url,opts)=>{
   calls.push({url,opts});return new Response(JSON.stringify(url.endsWith('/balance')?{amount:0.50,currency:'USD'}:{id:'mock-message'}));
  },...overrides};return {args,calls,states};
}
for(const [name,over] of [['wrong project',{project:'production'}],['unverified signature',{verified:false}],['disabled',{enabled:false}],['no api key',{apiKey:''}],['no approval',{claim:async()=>null}]]){
 test(name,async()=>{const f=fixture(over);await attemptLimitedReply(f.args);assert.equal(f.calls.length,0);});
}
for(const [name,changes] of [['other sender',{from:'+5491100000009'}],['other local',{to:'+5491100000009'}],['group',{groupId:'group'}],['normal customer text',{text:{body:'Hola'}}],['media',{type:'image'}]]){
 test(name,async()=>{const f=fixture();Object.assign(f.args.event.whatsappInboundMessage,changes);assert.equal(await attemptLimitedReply(f.args),'NOT_ELIGIBLE');assert.equal(f.calls.length,0)});
}
test('only one live request even if the same marker comes twice',async()=>{
 const f=fixture();assert.equal(await attemptLimitedReply(f.args),'ACCEPTED');assert.equal(await attemptLimitedReply(f.args),'NOT_ARMED');
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].opts.method,'GET');const body=JSON.parse(f.calls[1].opts.body);
 assert.equal(body.from,config.to);assert.equal(body.to,config.from);assert.equal(body.type,'text');assert.equal('category' in body,false);assert.equal('template' in body,false);
 assert.equal(f.states.length,1);
});
test('excluded number never calls provider',async()=>{const f=fixture({isExcluded:async()=>true});assert.equal(await attemptLimitedReply(f.args),'BLOCKED');assert.equal(f.calls.length,0)});
test('insufficient balance never sends',async()=>{let calls=0;const f=fixture({fetcher:async()=>{calls++;return new Response(JSON.stringify({amount:0,currency:'USD'}))}});assert.equal(await attemptLimitedReply(f.args),'BLOCKED');assert.equal(calls,1)});
test('network ambiguity freezes approval, no retry',async()=>{let calls=0;const f=fixture({fetcher:async()=>{if(++calls===1)return new Response(JSON.stringify({amount:.5,currency:'USD'}));throw Error('timeout')}});assert.equal(await attemptLimitedReply(f.args),'UNKNOWN');assert.equal(await attemptLimitedReply(f.args),'NOT_ARMED');assert.equal(calls,2)});
test('Argentina sender aliases hash identically but other numbers do not',async()=>{assert.equal(await routeKey(config),await routeKey({...config,from:'+541100000002'}));assert.notEqual(await routeKey(config),await routeKey({...config,from:'+5491100000003'}))});
