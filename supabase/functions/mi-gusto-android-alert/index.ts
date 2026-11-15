// Mi Gusto · avisos operativos de WhatsApp Business por sucursal, sin Cloud API.
// Únicamente señal de un Android autorizado y número visible en la notificación (si existe).
// No almacena conversaciones, nombres ni interpreta si hay un pedido confirmado.
import {createClient} from "npm:@supabase/supabase-js@2.118.0";

const json=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store"}
});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json(405,{ok:false,error:"Usá POST"});
 const token=req.headers.get("x-gestlok-bridge-key")||"";
 if(!/^[a-f0-9]{64}$/.test(token))return json(401,{ok:false,error:"Clave de vínculo inválida"});
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!service)return json(503,{ok:false,error:"Servicio no configurado"});
 let body:Record<string,unknown>={};
 try{
  if(Number(req.headers.get("content-length")||0)>512)return json(413,{ok:false,error:"Solicitud demasiado grande"});
  const raw=await req.text();
  if(raw.length>512)return json(413,{ok:false,error:"Solicitud demasiado grande"});
  if(raw.trim())body=JSON.parse(raw);
  if(!body||typeof body!=="object"||Array.isArray(body))return json(400,{ok:false,error:"Datos inválidos"});
 }catch{return json(400,{ok:false,error:"JSON inválido"});}
 const local=body.local;
 if(local!=="munro"&&local!=="torcuato")return json(400,{ok:false,error:"Indicá la sucursal"});
 // {not_title} de MacroDroid puede contener el nombre guardado y no un teléfono.
 // En tal caso el servidor guarda solo la alerta, SIN guardar el texto del contacto.
 const title=typeof body.customer_phone==="string"?body.customer_phone.slice(0,80):"";
 const phone=/^[+0-9().\s-]{10,32}$/.test(title)?title:null;
 const client=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 try{
  const {data,error}=await client.rpc("gestlok_mg_android_bridge_ingest_v2",{
   p_local:local,p_token:token,p_customer_phone:phone
  });
  if(error)return json(error.code==="42501"?401:503,{ok:false,error:"Vínculo no autorizado o temporalmente no disponible"});
  return json(200,{ok:true,created:data?.created===true,has_phone:data?.has_phone===true});
 }catch{return json(503,{ok:false,error:"Servicio temporalmente no disponible"});}
});
