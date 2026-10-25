// GestLok Web Push: opt-in de Dueña. Sin envío/dispatch hasta definir condiciones.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const URL=Deno.env.get("SUPABASE_URL")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const SITE="https://mgstock-app.github.io";
const cors={"Access-Control-Allow-Origin":SITE,
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin"};
const json=(code:number,body:unknown)=>new Response(JSON.stringify(body),{
  status:code,headers:{...cors,"Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store"}});
const validKey=(key:unknown,length:number)=>typeof key==="string" && key.length>=16 &&
  key.length<=length && /^[A-Za-z0-9_-]+$/.test(key);
Deno.serve(async(request:Request)=>{
  const origin=request.headers.get("origin");
  if(origin && origin!==SITE)return json(403,{ok:false,error:"Origen no permitido"});
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(!URL||!ANON||!SERVICE)return json(503,{ok:false,error:"Servicio no configurado"});
  const admin=createClient(URL,SERVICE,{auth:{autoRefreshToken:false,persistSession:false}});
  if(request.method==="GET" && new URL(request.url).searchParams.get("op")==="config"){
    const {data,error}=await admin.from("gestlok_push_settings").select("public_key").eq("id",1).single();
    if(error||!data?.public_key)return json(503,{ok:false,error:"Clave push pública no disponible"});
    return json(200,{ok:true,publicKey:data.public_key,deliveryEnabled:false});
  }
  if(request.method!=="POST")return json(405,{ok:false,error:"Método no permitido"});
  const bearer=request.headers.get("authorization")||"";
  if(!/^Bearer [\w.\-_]+$/i.test(bearer))return json(401,{ok:false,error:"Sesión requerida"});
  const token=bearer.slice(7);
  const {data:identity,error:authError}=await admin.auth.getUser(token);
  if(authError||!identity?.user?.id)return json(401,{ok:false,error:"Sesión inválida"});
  const userClient=createClient(URL,ANON,{
    global:{headers:{Authorization:bearer}},
    auth:{autoRefreshToken:false,persistSession:false}});
  const {data:access,error:roleError}=await userClient.rpc("mi_acceso");
  if(roleError||access?.rol!=="dueno"||!access?.tenant_id)return json(403,{ok:false,error:"Solo Dueña puede activar push"});
  let input:Record<string,unknown>;
  try{
    if(Number(request.headers.get("content-length")||0)>8192)return json(413,{ok:false,error:"Solicitud demasiado grande"});
    input=await request.json();
    if(!input||typeof input!=="object"||Array.isArray(input))throw Error("invalid");
  }catch{return json(400,{ok:false,error:"Datos inválidos"});}
  if(input.op!=="subscribe"&&input.op!=="unsubscribe")return json(400,{ok:false,error:"Operación inválida"});
  const item=input.subscription;
  if(!item||typeof item!=="object"||Array.isArray(item))return json(400,{ok:false,error:"Suscripción inválida"});
  const sub=item as {endpoint?:unknown,keys?:{auth?:unknown,p256dh?:unknown}};
  const endpoint=sub.endpoint;
  if(typeof endpoint!=="string"||endpoint.length>2048||!endpoint.startsWith("https://"))
    return json(400,{ok:false,error:"Endpoint inválido"});
  try{
    const p=new URL(endpoint);
    if(p.username||p.password||p.port||p.hash)return json(400,{ok:false,error:"Endpoint inválido"});
  }catch{return json(400,{ok:false,error:"Endpoint inválido"});}
  if(input.op==="unsubscribe"){
    const {error}=await admin.from("gestlok_push_devices").delete()
      .eq("endpoint",endpoint).eq("user_id",identity.user.id).eq("tenant_id",access.tenant_id);
    return error?json(503,{ok:false,error:"No se pudo desactivar"}):json(200,{ok:true,deliveryEnabled:false});
  }
  if(!validKey(sub.keys?.auth,100)||!validKey(sub.keys?.p256dh,200))
    return json(400,{ok:false,error:"Claves push inválidas"});
  const {error}=await admin.from("gestlok_push_devices").upsert({
    endpoint,user_id:identity.user.id,tenant_id:access.tenant_id,
    auth_key:sub.keys!.auth,p256dh_key:sub.keys!.p256dh,
    enabled:true,registered_at:new Date().toISOString()
  },{onConflict:"endpoint"});
  return error?json(503,{ok:false,error:"No se pudo registrar el dispositivo"}):
    json(200,{ok:true,deliveryEnabled:false});
});
