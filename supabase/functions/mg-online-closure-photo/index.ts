// GESTLOK · Mi Gusto · foto de cierre de turno. Bucket privado.
// Cada solicitud valida la sesión Supabase y los permisos de la sucursal en PostgreSQL.
// Nunca enviar claves de servicio al navegador ni generar enlaces públicos.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
const BUCKET="mg-online-closures";
const MAX_BYTES=3*1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowOrigins=new Set(["https://gestlok.com.ar","https://www.gestlok.com.ar","https://mgstock-app.github.io"]);
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const headers={
  "Content-Type":"application/json;charset=utf-8",
  "Cache-Control":"no-store",
  "Vary":"Origin",
  ...(allowOrigins.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
 };
 const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return response({error:"Método no permitido"},405);
 if(origin&&!allowOrigins.has(origin))return response({error:"Origen no autorizado"},403);
 try{
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||
   JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}")?.default;
  const secretKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||
   JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}")?.default;
  if(!supabaseUrl||!anonKey||!secretKey)return response({error:"Servicio no configurado"},503);
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return response({error:"Iniciá sesión"},401);
  const userClient=createClient(supabaseUrl,anonKey,{
   global:{headers:{Authorization:"Bearer "+token}},
   auth:{persistSession:false,autoRefreshToken:false}
  });
  const auth=await userClient.auth.getUser(token);
  if(auth.error||!auth.data.user)return response({error:"Sesión inválida"},401);
  const isForm=(req.headers.get("content-type")||"").includes("multipart/form-data");
  const body=isForm?await req.formData():await req.json();
  const action=String(isForm?body.get("action"):body.action);
  const loc=String(isForm?body.get("local"):body.local);
  const shiftId=String(isForm?body.get("shift_id"):body.shift_id);
  if(!["munro","torcuato"].includes(loc)||!UUID.test(shiftId)||!["get","upload"].includes(action))
   return response({error:"Solicitud inválida"},400);
  const access=await userClient.rpc("gestlok_mg_online_photo_access",{p_local:loc,p_shift:shiftId});
  if(access.error||!access.data)return response({error:"Sin permiso para acceder al cierre"},403);
  const admin=createClient(supabaseUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const path=loc+"/"+shiftId+"/cierre.jpg";
  if(action==="get"){
   if(access.data.photo_path!==path)return response({error:"Este turno no tiene foto"},404);
   const signed=await admin.storage.from(BUCKET).createSignedUrl(path,120);
   if(signed.error)return response({error:"No se pudo abrir la foto"},404);
   return response({signedUrl:signed.data.signedUrl,expiresIn:120});
  }
  if(access.data.photo_path)return response({error:"Este cierre ya tiene fotografía"},409);
  if(!isForm)return response({error:"Se requiere imagen"},400);
  const file=body.get("photo");
  if(!(file instanceof File)||file.type!=="image/jpeg"||file.size===0||file.size>MAX_BYTES)
   return response({error:"Usá una foto JPG de menos de 3 MB"},400);
  const buffer=await file.arrayBuffer();
  const magic=new Uint8Array(buffer.slice(0,3));
  if(magic[0]!==0xff||magic[1]!==0xd8||magic[2]!==0xff)
   return response({error:"El archivo no es una imagen JPG válida"},400);
  // Una sola imagen por turno: ruta determinística, sin sobrescritura.
  const existing=await admin.storage.getBucket(BUCKET);
  if(existing.data?.public===true)return response({error:"Configuración de almacenamiento insegura"},503);
  if(existing.error){
   const created=await admin.storage.createBucket(BUCKET,{
     public:false,fileSizeLimit:MAX_BYTES,allowedMimeTypes:["image/jpeg"]
   });
   if(created.error){
    const retry=await admin.storage.getBucket(BUCKET);
    if(retry.error||retry.data?.public===true)
     return response({error:"No se pudo preparar el almacenamiento privado"},503);
   }
  }
  const upload=await admin.storage.from(BUCKET).upload(path,new Uint8Array(buffer),{
   contentType:"image/jpeg",cacheControl:"120",upsert:false
  });
  if(upload.error)return response({error:"Este cierre ya tiene una foto o no se pudo guardar"},409);
  const linked=await userClient.rpc("gestlok_mg_online_photo_register",{p_local:loc,p_shift:shiftId});
  if(linked.error){
   await admin.storage.from(BUCKET).remove([path]);
   return response({error:"No se pudo vincular la fotografía al cierre"},409);
  }
  return response({ok:true,photo_at:linked.data?.photo_at||null});
 }catch(err){
  console.error("mg-online-closure-photo:",err instanceof Error?err.message:"unknown");
  return response({error:"No se pudo procesar la fotografía"},500);
 }
});
