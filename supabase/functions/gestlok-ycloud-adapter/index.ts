// GESTLOK Chat · YCloud test-only inbound prototype.
// HARD STOP: no commercial production deployment or outbound WhatsApp sends.
// The official provider must be configured by the account owner separately.
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createSignedYCloudBridge,createSupabasePilotStore} from './bridge.mjs';
import {selectTestRoute} from './test-route.mjs';

const env=(key:string)=>Deno.env.get(key)||'';
const TEST_URL='https://irqeitzbfyerxcrogkyh.supabase.co';
const disabled=()=>new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});
const noContent=()=>new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
let handle:ReturnType<typeof createSignedYCloudBridge>|null=null;
let readiness='wrong_project';
try {
 // Deliberately impossible to enable on a different Supabase project.
 if(env('SUPABASE_URL').replace(/\/$/,'')!==TEST_URL)readiness='wrong_project';
 else if(env('YCLOUD_PILOT_ENABLED')!=='true')readiness='pilot_disabled';
 else if(env('YCLOUD_PILOT_DRY_RUN_ONLY')!=='true')readiness='dry_run_flag_required';
 else if(env('YCLOUD_WEBHOOK_SECRET').length<24)readiness='missing_webhook_secret';
 else if(!env('SUPABASE_SERVICE_ROLE_KEY'))readiness='missing_service_credentials';
 else {
  readiness='invalid_route';
  const route=selectTestRoute({routes:JSON.parse(env('YCLOUD_ROUTES_JSON')),waba:env('YCLOUD_PILOT_WABA'),to:env('YCLOUD_PILOT_NUMBER'),from:env('YCLOUD_TEST_SENDER')});
  if(!route)throw Error('Invalid pilot route');
  const db=createClient(TEST_URL,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const store=createSupabasePilotStore((fn:string,args:Record<string,unknown>)=>db.rpc(fn,args));
  handle=createSignedYCloudBridge({secret:env('YCLOUD_WEBHOOK_SECRET'),routes:[route],store,enabled:true});
  readiness='ready';
 }
}catch{handle=null;}
Deno.serve(async req=>{
 if(!handle){console.info('YCLOUD_TEST_ADAPTER_'+readiness.toUpperCase());return disabled();}
 if(req.method!=='POST')return new Response(null,{status:405});
 const length=Number(req.headers.get('content-length')||'0');
 if(length>262144)return new Response(null,{status:413});
 let raw:Uint8Array;
 try{
  const reader=req.body?.getReader();if(!reader)return new Response(null,{status:400});
  let size=0;const parts:Uint8Array[]=[];
  while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>262144){await reader.cancel();return new Response(null,{status:413});}parts.push(next.value);}
  raw=new Uint8Array(size);let at=0;for(const p of parts){raw.set(p,at);at+=p.length;}
 }catch{return new Response(null,{status:400});}
 try{
  const result=await handle({raw,signature:req.headers.get('ycloud-signature')||''});
  if(result.status==='invalid_signature')return new Response(null,{status:403});
  if(result.status==='conflict_retry_later')return new Response(null,{status:503});
  // No response bodies, phones, customer messages or order details in logs.
  console.info('YCLOUD_TEST_ADAPTER_'+result.status.toUpperCase());
  return noContent();
 }catch{
  console.error('YCLOUD_TEST_ADAPTER_ERROR');
  return new Response(null,{status:500,headers:{'Cache-Control':'no-store'}});
 }
});
