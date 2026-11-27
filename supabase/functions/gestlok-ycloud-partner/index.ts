import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createPartnerLink, verifyPartnerPhone, PartnerError } from "./partner.mjs";
const ORIGIN="https://gestlok.com.ar";
const headers={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
const json=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers});
const env=(key:string)=>Deno.env.get(key)||"";
Deno.serve(async request=>{
  if(request.headers.get("origin")!==ORIGIN)return json({error:"Origen no autorizado."},403);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="POST")return json({error:"Método no permitido."},405);
  const projectUrl=env("SUPABASE_URL");
  if(projectUrl!=="https://vgsepaaewbctjsjcpeta.supabase.co")return json({error:"Proyecto no autorizado."},503);
  const apiKey=env("YCLOUD_PARTNER_API_KEY"),serviceKey=env("SUPABASE_SERVICE_ROLE_KEY");
  const approved=env("YCLOUD_PARTNER_APPROVED")==="true"&&env("YCLOUD_PARTNER_WEBHOOK_READY")==="true"&&env("YCLOUD_PARTNER_WEBHOOK_SECRET").length>=24&&!!apiKey&&!!serviceKey;
  const authorization=request.headers.get("Authorization")||"";
  if(!/^Bearer [^\s]+$/.test(authorization))return json({error:"Iniciá sesión."},401);
  try{
    const raw=await request.text();if(raw.length>2048)return json({error:"Solicitud inválida."},400);
    let input;try{input=JSON.parse(raw);}catch{return json({error:"Solicitud inválida."},400);}
    if(!input||typeof input!=="object"||Array.isArray(input))return json({error:"Solicitud inválida."},400);
    const client=createClient(projectUrl,env("SUPABASE_ANON_KEY"),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await client.rpc("gestlok_chat_admin_whatsapp_premium",{p_accion:"listar"});
    if(error||!Array.isArray(data?.numeros))return json({error:"Acceso exclusivo de administradora."},403);
    if(input.action==="status")return json({ready:approved,manualReady:approved&&env("YCLOUD_MANUAL_PILOT_ENABLED")==="true"&&!!env("YCLOUD_WHATSAPP_API_KEY"),automation:false});
    if(!approved)return json({error:"Vinculación oficial pendiente de habilitación."},503);
    const row=data.numeros.find((n:{id:string})=>n.id===input.id&&n.habilitada===true&&n.local_existe===true);
    if(!row)return json({error:"Número no autorizado."},403);
    const service=createClient(projectUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const rpc=async(args:Record<string,unknown>)=>{
      const {data,error}=await service.rpc("gestlok_chat_partner_estado",args);
      if(error)throw new PartnerError(500,"No se pudo guardar la vinculación.");
      return data;
    };
    const current=await rpc({p_accion:"consultar",p_id:row.id});
    if(!current)return json({error:"Número no autorizado."},403);
    if(input.action==="verify"){
      const found=await verifyPartnerPhone({apiKey,waba:current.waba,number:current.numero});
      const saved=await rpc({p_accion:"verificar",p_id:row.id,p_waba:found.waba,p_phone_id:found.phoneId,p_phone:found.phone});
      if(!saved?.verificado_at)return json({error:"No se pudo confirmar el número."},409);
      return json({status:"numero_verificado",automation:false});
    }
    if(input.action!=="link")return json({error:"Acción inválida."},400);
    if(current.waba)return json({error:"Ya hay una cuenta autorizada. Comprobá el número."},409);
    const result=await createPartnerLink({approved,projectUrl,apiKey,authorization,id:row.id,onboardingType:input.onboardingType,authorize:async()=>row});
    const saved=await rpc({p_accion:"enlace",p_id:row.id,p_vence:new Date(result.expiresAt).toISOString()});
    if(!saved?.enlace_vence)return json({error:"No se pudo registrar el enlace."},409);
    return json(result);
  }catch(error){
    if(error instanceof PartnerError)return json({error:error.message},error.status);
    return json({error:"No se pudo preparar la vinculación."},500);
  }
});
