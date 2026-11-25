import {createClient} from "npm:@supabase/supabase-js@2.118.0";
import {extractPilotMessages,verifySignature} from "./pilot.mjs";
const env=(k:string)=>Deno.env.get(k)||"";
const reply=(body:string,status=200)=>new Response(body,{status,headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});
Deno.serve(async req=>{
 // Default off. Never attach this endpoint to a live number during the pilot.
 if(env("GL_WA_PILOT_ENABLED")!=="true"||!env("SUPABASE_URL").includes("irqeitzbfyerxcrogkyh"))return reply("Disabled",503);
 const secret=env("GL_WA_PILOT_APP_SECRET"),verify=env("GL_WA_PILOT_VERIFY_TOKEN");
 const config={waba:env("GL_WA_PILOT_WABA"),phoneId:env("GL_WA_PILOT_PHONE_ID"),testSenders:env("GL_WA_PILOT_SENDERS").split(",").map(s=>s.trim()).filter(s=>/^\d{8,15}$/.test(s))};
 if(!secret||verify.length<24||!config.waba||!config.phoneId||!config.testSenders.length)return reply("Not configured",503);
 if(req.method==="GET"){
  const p=new URL(req.url).searchParams;
  return p.get("hub.mode")==="subscribe"&&p.get("hub.verify_token")===verify?reply(p.get("hub.challenge")||""):reply("Forbidden",403);
 }
 if(req.method!=="POST")return reply("Method not allowed",405);
 const reader=req.body?.getReader();if(!reader)return reply("Bad request",400);
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();return reply("Too large",413);}chunks.push(value);}}catch{return reply("Bad request",400);}
 const raw=new Uint8Array(size);let off=0;for(const c of chunks){raw.set(c,off);off+=c.length;}
 if(!await verifySignature(raw,req.headers.get("x-hub-signature-256"),secret))return reply("Forbidden",403);
 let payload;try{payload=JSON.parse(new TextDecoder().decode(raw));}catch{return reply("Bad request",400);}
 const messages=extractPilotMessages(payload,config);
 if(!messages.length)return reply("OK");
 const db=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
 const {error}=await db.rpc("gestlok_wa_pilot_ingest",{p_messages:messages});
 return error?reply("Retry",503):reply("OK");
});
