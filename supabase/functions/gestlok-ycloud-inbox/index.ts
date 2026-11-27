import {createClient} from "npm:@supabase/supabase-js@2.118.0";
import {sendSingleReply} from "./send.mjs";
const env=(k:string)=>Deno.env.get(k)||"";
const ORIGIN="https://gestlok.com.ar";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
const json=(obj:unknown,status=200)=>new Response(JSON.stringify(obj),{status,headers});
Deno.serve(async request=>{
 if(request.headers.get("origin")!==ORIGIN)return json({error:"Origen no autorizado."},403);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="POST")return json({error:"Método no autorizado."},405);
 const project=env("SUPABASE_URL"),apiKey=env("YCLOUD_WHATSAPP_API_KEY"),serviceKey=env("SUPABASE_SERVICE_ROLE_KEY");
 if(project!=="https://vgsepaaewbctjsjcpeta.supabase.co")return json({error:"Proyecto no autorizado."},503);
 const enabled=env("YCLOUD_PARTNER_APPROVED")==="true"&&env("YCLOUD_PARTNER_WEBHOOK_READY")==="true"&&env("YCLOUD_PARTNER_WEBHOOK_SECRET").length>=24&&env("YCLOUD_MANUAL_PILOT_ENABLED")==="true"&&!!apiKey&&!!serviceKey;
 const auth=request.headers.get("Authorization")||"";
 if(!/^Bearer [^\s]+$/.test(auth))return json({error:"Ingresá a GESTLOK."},401);
 try{
  const raw=await request.text();if(raw.length>4500)return json({error:"Solicitud inválida."},400);
  let p;try{p=JSON.parse(raw);}catch{return json({error:"Solicitud inválida."},400);}
  if(!p||!uuid.test(p.sucursal||""))return json({error:"Sucursal inválida."},400);
  const user=createClient(project,env("SUPABASE_ANON_KEY"),{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:auth}}});
  const {error}=await user.rpc("gestlok_chat_panel_whatsapp_bandeja",{p_sucursal:p.sucursal});
  if(error)return json({error:"No tenés permiso para esta sucursal."},403);
  if(p.action==="status")return json({ready:enabled,automation:false});
  if(!enabled)return json({error:"El proveedor todavía no está autorizado para la prueba real."},503);
  if(p.action!=="reply"||!uuid.test(p.id||"")||typeof p.text!=="string"||!p.text.trim()||p.text.length>1000)return json({error:"Respuesta inválida."},400);
  // The server authorizes the actor and atomically consumes the one-message
  // grant before any provider call. Browser cannot choose recipient or sender.
  const {data:route,error:claimError}=await user.rpc("gestlok_chat_panel_whatsapp_piloto_reservar",{p_sucursal:p.sucursal,p_id:p.id,p_texto:p.text});
  if(claimError||!route)return json({error:"Prueba vencida, pausada, ya utilizada o contacto excluido."},409);
  const service=createClient(project,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await sendSingleReply({route,apiKey,enabled,validate:async()=>{
   const {data,error}=await service.rpc("gestlok_chat_srv_whatsapp_piloto_validar",{p_id:route.id});return !error&&data===true;
  }});
  const {data:finished,error:finishError}=await service.rpc("gestlok_chat_srv_whatsapp_piloto_finalizar",{p_id:route.id,p_estado:result.status,p_proveedor:result.provider||null});
  if(finishError||finished!==true)return json({error:"Resultado sin confirmar. No vuelvas a enviar."},503);
  return json({status:result.status});
 }catch{return json({error:"No se pudo completar. Si ya enviaste, no repitas."},500);}
});
