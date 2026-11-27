import {createClient} from "npm:@supabase/supabase-js@2.118.0";
import {parseEvent} from "./events.mjs";
const env=(k:string)=>Deno.env.get(k)||"";
const reply=(status:number)=>new Response(null,{status,headers:{"Cache-Control":"no-store"}});
Deno.serve(async request=>{
 if(request.method!=="POST")return reply(405);
 if(env("SUPABASE_URL")!=="https://vgsepaaewbctjsjcpeta.supabase.co"||env("YCLOUD_PARTNER_APPROVED")!=="true"||env("YCLOUD_PARTNER_WEBHOOK_READY")!=="true"||env("YCLOUD_PARTNER_WEBHOOK_SECRET").length<24||!env("SUPABASE_SERVICE_ROLE_KEY"))return reply(503);
 try{
  const result=await parseEvent(request,env("YCLOUD_PARTNER_WEBHOOK_SECRET"));
  if(!result.args)return reply(result.status);
  if(result.kind==="inbound"&&env("YCLOUD_MANUAL_PILOT_ENABLED")!=="true")return reply(204);
  const service=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
  const {error}=await service.rpc(result.kind==="account"?"gestlok_chat_partner_estado":"gestlok_chat_srv_whatsapp_piloto_recibir",result.args);
  return reply(error?500:204);
 }catch{return reply(500);}
});
