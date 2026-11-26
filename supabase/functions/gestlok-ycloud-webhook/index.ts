import {classifyPilot} from "./routing.mjs";
import {attemptLimitedReply} from "./limited-reply.mjs";
import {createClient} from "npm:@supabase/supabase-js@2.118.0";
// Signed test-only webhook. An explicit, private, expiring approval can permit one reply. Normal chats remain untouched.
const env=(k:string)=>Deno.env.get(k)||"";
const reply=(status:number)=>new Response(null,{status,headers:{"Cache-Control":"no-store"}});
Deno.serve(async req=>{
 if(env("SUPABASE_URL").replace(/\/$/,"")!=="https://irqeitzbfyerxcrogkyh.supabase.co")return reply(503);
 if(req.method!=="POST")return reply(405);
 const secret=env("YCLOUD_WEBHOOK_SECRET");
 if(secret.length<24||env("YCLOUD_PILOT_ENABLED")!=="true")return reply(503);
 const header=req.headers.get("ycloud-signature")||"";
 const m=header.match(/^t=(\d{10}),\s*s=([a-fA-F0-9]{64})$/);
 if(!m||Math.abs(Date.now()/1000-Number(m[1]))>300)return reply(403);
 const reader=req.body?.getReader();if(!reader)return reply(400);
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();return reply(413);}chunks.push(value);}}catch{return reply(400);}
 const prefix=new TextEncoder().encode(m[1]+".");const bytes=new Uint8Array(prefix.length+size);bytes.set(prefix);let off=prefix.length;for(const c of chunks){bytes.set(c,off);off+=c.length;}
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const sig=Uint8Array.from(m[2].match(/../g)!,x=>parseInt(x,16));
 if(!await crypto.subtle.verify("HMAC",key,sig,bytes))return reply(403);
 let p;try{p=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(prefix.length)));}catch{return reply(400);}
 const config={waba:env("YCLOUD_PILOT_WABA"),to:env("YCLOUD_PILOT_NUMBER"),from:env("YCLOUD_TEST_SENDER")};
 const result=classifyPilot(p,config);
 // All ordinary messages follow the original diagnostics-only path. Never
 // forward them, make orders, or send replies. New markers are owner-authorized.
 if(p?.type==="whatsapp.inbound_message.received" && /^GESTLOK PRUEBA [A-F0-9]{8}$/.test(p?.whatsappInboundMessage?.text?.body||"")){
  let state="UNREADY";
  try{
   const project=env("SUPABASE_URL").replace(/\/$/,"");
   const serviceKey=env("SUPABASE_SERVICE_ROLE_KEY");
   if(!serviceKey||!env("YCLOUD_API_KEY"))return reply(204);
   const supabase=createClient(project,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
   const rpc=async(name:string,args:Record<string,unknown>)=>{
     const {data,error}=await supabase.rpc(name,args);if(error)throw Error("RPC unavailable");return data;
   };
   state=await attemptLimitedReply({project,enabled:env("YCLOUD_PILOT_ENABLED")==="true",apiKey:env("YCLOUD_API_KEY"),verified:true,config,event:p,
    claim:(marker:string,route:string,event:string)=>rpc("gestlok_ycloud_one_reply_claim",{p_marker:marker,p_route_key:route,p_event_key:event}),
    finish:(id:string,state:string,http:number|null,provider:string|null)=>rpc("gestlok_ycloud_one_reply_finish",{p_id:id,p_state:state,p_http:http,p_provider_id:provider}),
    isExcluded:(sender:string)=>rpc("gestlok_chat_srv_whatsapp_excluido",{p_sucursal:"7e570000-0000-4000-8000-000000000002",p_numero:sender})
   });
  }catch{state="ERROR";}
  console.info("YCLOUD_LIMITED_REPLY_"+state);
  return reply(204);
 }
 console.info("YCLOUD_PILOT_"+result);
 return reply(204);
});