// Mi Gusto · avisos operativos de WhatsApp Business por sucursal, sin Cloud API.
// Solo recibe señales autorizadas y una vista previa acotada si Android la muestra.
// No consulta chats de Meta ni interpreta si el pedido fue confirmado.
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
  if(Number(req.headers.get("content-length")||0)>1024)return json(413,{ok:false,error:"Solicitud demasiado grande"});
  const raw=await req.text();
  if(raw.length>1024)return json(413,{ok:false,error:"Solicitud demasiado grande"});
  if(raw.trim()){
   try{body=JSON.parse(raw);}
   catch{
    // Algunas versiones de MacroDroid insertan {not_text} sin escapar comillas
    // o saltos de línea dentro del cuerpo JSON. Admitimos solamente el molde
    // fijo de la macro autorizada; nunca ejecutamos ni interpretamos el texto.
    const captured=raw.match(/^\{"local":"(munro|torcuato)","customer_phone":"([\s\S]*?)","notification_preview":"([\s\S]*)"\}$/);
    if(!captured)return json(400,{ok:false,error:"JSON inválido"});
    body={local:captured[1],customer_phone:captured[2],notification_preview:captured[3]};
   }
  }
  if(!body||typeof body!=="object"||Array.isArray(body))return json(400,{ok:false,error:"Datos inválidos"});
 }catch{return json(400,{ok:false,error:"JSON inválido"});}
 const local=body.local;
 if(local!=="munro"&&local!=="torcuato")return json(400,{ok:false,error:"Indicá la sucursal"});
 // {not_title} de MacroDroid puede contener el nombre guardado y no un teléfono.
 // En tal caso el servidor guarda solo la alerta, SIN guardar el texto del contacto.
 const title=typeof body.customer_phone==="string"?body.customer_phone.slice(0,80):"";
 const phone=/^[+0-9().\s-]{10,32}$/.test(title)?title:null;
 // Vista previa opcional: solo texto visible de una notificación Android.
 // No se devuelve el contenido en la respuesta ni se registra en logs.
 if(body.notification_preview!=null&&typeof body.notification_preview!=="string")
  return json(400,{ok:false,error:"Vista previa inválida"});
 const preview=typeof body.notification_preview==="string"?body.notification_preview.slice(0,350):null;
 const client=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 try{
  const {data,error}=await client.rpc("gestlok_mg_android_bridge_ingest_v3",{
   p_local:local,p_token:token,p_customer_phone:phone,p_notification_preview:preview
  });
  if(error)return json(error.code==="42501"?401:503,{ok:false,error:"Vínculo no autorizado o temporalmente no disponible"});
  return json(200,{ok:true,created:data?.created===true,has_phone:data?.has_phone===true,has_preview:data?.has_preview===true});
 }catch{return json(503,{ok:false,error:"Servicio temporalmente no disponible"});}
});
