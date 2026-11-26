import {createClient} from "npm:@supabase/supabase-js@2.118.0";
import {parsePartnerEvent} from "./events.mjs";
const env=(k:string)=>Deno.env.get(k)||"";
const reply=(status:number)=>new Response(null,{status,headers:{"Cache-Control":"no-store"}});
Deno.serve(async request=>{
  if(request.method!=="POST")return reply(405);
  if(env("SUPABASE_URL")!=="https://irqeitzbfyerxcrogkyh.supabase.co"||env("YCLOUD_PARTNER_APPROVED")!=="true"||env("YCLOUD_PARTNER_WEBHOOK_READY")!=="true"||env("YCLOUD_PARTNER_WEBHOOK_SECRET").length<24||!env("SUPABASE_SERVICE_ROLE_KEY"))return reply(503);
  try{
    const result=await parsePartnerEvent(request,env("YCLOUD_PARTNER_WEBHOOK_SECRET"));
    if(!result.args)return reply(result.status);
    const service=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
    const {error}=await service.rpc("gestlok_chat_partner_prueba_estado",result.args);
    // Unknown IDs, duplicate events and unrelated accounts do not change state.
    return reply(error?500:204);
  }catch{return reply(500);}
});
