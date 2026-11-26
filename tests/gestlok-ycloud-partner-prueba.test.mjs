import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartnerLink } from '../supabase/functions/gestlok-ycloud-partner-prueba/partner.mjs';

const id = 'c2b151de-b334-4728-8df6-9f10879f13db';
const now = 1800000000000;
function fixture(overrides = {}) {
  const calls = [];
  const options = {
    approved:true, projectUrl:'https://irqeitzbfyerxcrogkyh.supabase.co', apiKey:'fake-only',
    authorization:'Bearer dummy', id, onboardingType:'WHATSAPP_BUSINESS_APP', now:() => now,
    authorize: async () => ({id,habilitada:true,local_existe:true}),
    fetcher: async (...args) => {
      calls.push(args);
      return new Response(JSON.stringify({onboardingUrl:'https://connect.ycloud.com/open/whatsapp/onboard#token=ficticio',expiresAt:now+3600000}));
    }, ...overrides
  };
  return {calls, options};
}
for (const [name,overrides,status] of [
  ['approval pending',{approved:false},503],
  ['wrong project',{projectUrl:'https://vgsepaaewbctjsjcpeta.supabase.co'},503],
  ['missing key',{apiKey:''},503],
  ['no authenticated session',{authorization:''},401],
  ['invalid ID',{id:'123'},400],
  ['invalid onboarding mode',{onboardingType:'unknown'},400],
  ['non-admin',{authorize:async()=>null},403],
  ['paused number',{authorize:async()=>({id,habilitada:false,local_existe:true})},403],
  ['deleted local',{authorize:async()=>({id,habilitada:true,local_existe:false})},403],
]) test(name + ' never calls YCloud', async () => {
  const {calls,options}=fixture(overrides);
  await assert.rejects(createPartnerLink(options),e=>e.status===status);
  assert.equal(calls.length,0);
});
test('authorized onboarding uses only link endpoint and opaque id',async()=>{
  const {calls,options}=fixture();
  const result=await createPartnerLink(options);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'https://api.ycloud.com/v2/partner/embeddedSignup/links');
  assert.equal(calls[0][1].redirect,'error');
  assert.deepEqual(JSON.parse(calls[0][1].body),{partnerCustomerId:id, onboardingType:'WHATSAPP_BUSINESS_APP', locale:'es_ES'});
  assert.equal(result.status,'pendiente_autorizacion_comercio');
  assert.equal(result.expiresAt,now+3600000);
});
for (const [name,response] of [
  ['foreign link', {onboardingUrl:'https://invalid.example/open/whatsapp/onboard#token=x',expiresAt:now+1000}],
  ['link without token',{onboardingUrl:'https://connect.ycloud.com/open/whatsapp/onboard',expiresAt:now+1000}],
  ['expired link',{onboardingUrl:'https://connect.ycloud.com/open/whatsapp/onboard#token=fake',expiresAt:now-1}],
]) test(name+' rejected',async()=>{
  const {options}=fixture({fetcher:async()=>new Response(JSON.stringify(response))});
  await assert.rejects(createPartnerLink(options),e=>e.status===502);
});
