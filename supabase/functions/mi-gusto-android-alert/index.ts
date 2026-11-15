// GESTLOK · Mi Gusto Munro · aviso de notificación Android (sin WhatsApp Cloud API).
// Un teléfono autorizado con acceso a sus propias notificaciones envía una señal SIN texto del chat.
import {createClient} from "npm:@supabase/supabase-js@2.118.0";

const json=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store"}
});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json(405,{ok:false,error:"Usá POST"});
 if(Number(req.headers.get("content-length")||0)>256)return json(413,{ok:false,error:"Solicitud demasiado grande"});
 const token=req.headers.get("x-gestlok-bridge-key")||"";
 if(!/^[a-f0-9]{64}$/.test(token))return json(401,{ok:false,error:"Clave de vínculo inválida"});
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!service)return json(503,{ok:false,error:"Servicio no configurado"});
 const client=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 try{
  const {data,error}=await client.rpc("gestlok_mg_android_bridge_ingest",{p_local:"munro",p_token:token});
  if(error)return json(error.code==="42501"?401:503,{ok:false,error:"Vínculo no autorizado o temporalmente no disponible"});
  return json(200,{ok:true,created:data?.created===true});
 }catch{
  return json(503,{ok:false,error:"Servicio temporalmente no disponible"});
 }
});
