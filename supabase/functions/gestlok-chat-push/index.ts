// Push exclusivo para clientes GESTLOK Chat. No comparte dispositivos con dueños/gerentes.
import {createClient} from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";
type Json=Record<string,unknown>;
const url=Deno.env.get("SUPABASE_URL")||"";
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const allowedOrigins=new Set(["https://gestlok.com.ar","https://www.gestlok.com.ar","https://mgstock-app.github.io"]);
const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const okOrigin=(origin:string|null)=>!origin||allowedOrigins.has(origin);
const reply=(status:number,data:unknown,origin:string|null)=>new Response(JSON.stringify(data),{
 status,headers:{"content-type":"application/json;charset=utf-8","cache-control":"no-store",
 "Access-Control-Allow-Origin":origin&&allowedOrigins.has(origin)?origin:"https://gestlok.com.ar",
 "Access-Control-Allow-Headers":"content-type,apikey,authorization,x-gestlok-cron",
 "Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin"}});
const validEndpoint=(value:unknown)=>{
 if(typeof value!=="string"||value.length<60||value.length>2048)return false;
 try{
  const u=new URL(value),host=u.hostname.toLowerCase();
  return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&(
   host==="fcm.googleapis.com"||host==="updates.push.services.mozilla.com"||
   host==="push.services.mozilla.com"||host==="updates.push.services.mozilla.org"||
   host==="notify.windows.com"||host.endsWith(".notify.windows.com")||
   host==="web.push.apple.com"||host.endsWith(".push.apple.com")
  );
 }catch{return false;}
};
const key=(v:unknown,len:number)=>typeof v==="string"&&v.length>=16&&v.length<=len&&/^[A-Za-z0-9_-]+$/.test(v);
async function sha(s:string){
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
}
async function config(slug:string){
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw Error("Sucursal inválida");
 const [one,two]=await Promise.all([
  db.from("gestlok_push_settings").select("public_key").eq("id",1).single(),
  db.rpc("gestlok_chat_push_public_config",{p_slug:slug})
 ]);
 // La tabla privada no se expone en PostgREST: solo RPC de datos mínimos.
 if(one.error||!one.data?.public_key||two.error||!two.data?.slug)
   throw Error("Las notificaciones todavía no están disponibles");
 return {publicKey:one.data.public_key,promocionesHabilitadas:two.data.promociones_habilitadas===true};
}
async function checkCron(token:string){
 if(!/^[a-f0-9]{64}$/i.test(token))return false;
 const {data,error}=await db.from("gestlok_push_control").select("cron_token_hash").eq("id",1).single();
 return !error&&data?.cron_token_hash===await sha(token);
}
async function delivery(){
 const {data:setting,error:setErr}=await db.from("gestlok_push_settings")
   .select("public_key,private_jwk").eq("id",1).single();
 if(setErr||!setting?.public_key||!setting?.private_jwk?.privateKey)throw Error("Claves VAPID no disponibles");
 let privateKey="";
 try {
   const v=setting.private_jwk.privateKey;
   privateKey=typeof v==="object"?String(v.d||""):
     String(v).startsWith("{")?String(JSON.parse(v).d||""):String(v);
 }catch{throw Error("Clave VAPID incorrecta");}
 if(!/^[A-Za-z0-9_-]{43}$/.test(privateKey))throw Error("Clave VAPID incorrecta");
 webpush.setVapidDetails("https://gestlok.com.ar",setting.public_key,privateKey);
 const {data:events,error:eventsError}=await db.from("gestlok_chat_cliente_push_events")
   .select("id,sucursal_id,conversacion_id,categoria,titulo,cuerpo,creado_at")
   .is("enviado_at",null).order("id",{ascending:true}).limit(30);
 if(eventsError)throw Error("No se pudo leer la cola");
 let attempted=0,delivered=0;
 for(const e of events||[]){
  // Un estado antiguo no debería llegar mucho después de completado.
  if(Date.now()-new Date(e.creado_at).getTime()>48*3600000){
   await db.from("gestlok_chat_cliente_push_events").update({enviado_at:new Date().toISOString()}).eq("id",e.id);
   continue;
  }
  let query=db.from("gestlok_chat_cliente_push_devices")
   .select("endpoint,p256dh_key,auth_key,conversacion_id")
   .eq("sucursal_id",e.sucursal_id).eq("enabled",true);
  if(e.categoria==="pedido"){
   if(!e.conversacion_id)continue;
   query=query.eq("pedidos",true).eq("conversacion_id",e.conversacion_id);
  }else{
   const {data:cfg}=await db.rpc("gestlok_chat_push_public_config",{p_sucursal:e.sucursal_id});
   if(!cfg?.promociones_habilitadas){
    await db.from("gestlok_chat_cliente_push_events").update({enviado_at:new Date().toISOString()}).eq("id",e.id);
    continue;
   }
   query=query.eq("promos",true);
  }
  const {data:devices,error:devError}=await query.limit(500);
  if(devError)continue;
  let retry=false;
  for(const d of devices||[]){
   if(!validEndpoint(d.endpoint))continue;
   const {data:previous}=await db.from("gestlok_chat_cliente_push_deliveries")
     .select("intentos,entregado_at").eq("event_id",e.id).eq("endpoint",d.endpoint).maybeSingle();
   if(previous?.entregado_at||Number(previous?.intentos||0)>=3)continue;
   attempted++;
   await db.from("gestlok_chat_cliente_push_deliveries").upsert({
     event_id:e.id,endpoint:d.endpoint,intentos:Number(previous?.intentos||0)+1
   },{onConflict:"event_id,endpoint"});
   try {
    const {data:cfg}=await db.rpc("gestlok_chat_push_public_config",{p_sucursal:e.sucursal_id});
    const slug=String(cfg?.slug||"");
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))continue;
    await webpush.sendNotification({endpoint:d.endpoint,keys:{auth:d.auth_key,p256dh:d.p256dh_key}},
      JSON.stringify({title:e.titulo,body:e.cuerpo,slug,tag:"gchat:"+e.id}),{
        TTL:e.categoria==="promocion"?21600:86400,urgency:e.categoria==="pedido"?"high":"normal"});
    delivered++;
    await db.from("gestlok_chat_cliente_push_deliveries")
      .update({entregado_at:new Date().toISOString(),error:null})
      .eq("event_id",e.id).eq("endpoint",d.endpoint);
   }catch(error){
    const status=Number((error as {statusCode?:number}).statusCode||0);
    if(status===404||status===410)
      await db.from("gestlok_chat_cliente_push_devices").update({enabled:false}).eq("endpoint",d.endpoint);
    else if(Number(previous?.intentos||0)<2)retry=true;
    await db.from("gestlok_chat_cliente_push_deliveries")
      .update({error:"Push HTTP "+(status||"error")}).eq("event_id",e.id).eq("endpoint",d.endpoint);
   }
  }
  if(!retry)await db.from("gestlok_chat_cliente_push_events")
    .update({enviado_at:new Date().toISOString()}).eq("id",e.id);
 }
 return {ok:true,attempted,delivered};
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(!okOrigin(origin))return reply(403,{ok:false,error:"Origen no autorizado"},origin);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
   "Access-Control-Allow-Origin":origin||"https://gestlok.com.ar",
   "Access-Control-Allow-Headers":"content-type,apikey,authorization,x-gestlok-cron",
   "Access-Control-Allow-Methods":"GET,POST,OPTIONS"}});
 if(!url||!service)return reply(503,{ok:false,error:"Servicio no disponible"},origin);
 const op=new URL(req.url).searchParams.get("op");
 if(req.method==="POST"&&op==="dispatch"){
   if(!await checkCron(req.headers.get("x-gestlok-cron")||""))
     return reply(403,{ok:false,error:"No autorizado"},origin);
   try{return reply(200,await delivery(),origin)}
   catch{return reply(503,{ok:false,error:"No se pudieron enviar los avisos"},origin)}
 }
 if(req.method==="GET"&&op==="config"){
   try {
    const slug=new URL(req.url).searchParams.get("slug")||"";
    return reply(200,{ok:true,...await config(slug)},origin);
   }catch{return reply(503,{ok:false,error:"Notificaciones no disponibles"},origin)}
 }
 if(req.method!=="POST")return reply(405,{ok:false,error:"Método no permitido"},origin);
 let body:Json;
 try{
  if(Number(req.headers.get("content-length")||0)>6500)throw Error("too long");
  body=await req.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error("bad");
 }catch{return reply(400,{ok:false,error:"Datos inválidos"},origin)}
 if(body.op!=="subscribe"&&body.op!=="unsubscribe")
   return reply(400,{ok:false,error:"Acción no permitida"},origin);
 const slug=String(body.slug||"");
 const token=String(body.token||"");
 const sub=body.subscription as {endpoint?:unknown,keys?:{p256dh?:unknown,auth?:unknown}}|undefined;
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>60||
    !/^[A-Za-z0-9_-]{32,64}$/.test(token)||!sub||!validEndpoint(sub.endpoint))
   return reply(400,{ok:false,error:"Sesión o dispositivo inválido"},origin);
 if(body.op==="subscribe"&&(!key(sub.keys?.p256dh,200)||!key(sub.keys?.auth,100)))
   return reply(400,{ok:false,error:"Claves de dispositivo inválidas"},origin);
 try{
  const hash="\\x"+await sha(token);
  const {data,error}=await db.rpc("gestlok_chat_cliente_push_vincular",{
   p_slug:slug,p_token_hash:hash,p_endpoint:sub.endpoint,
   p_p256dh:body.op==="subscribe"?sub.keys?.p256dh:"",
   p_auth:body.op==="subscribe"?sub.keys?.auth:"",
   p_pedidos:body.op==="subscribe"&&body.pedidos===true,
   p_promos:body.op==="subscribe"&&body.promos===true,
   p_desvincular:body.op==="unsubscribe"});
  if(error||!data?.ok)return reply(403,{ok:false,error:"No se pudo validar el permiso de esta conversación"},origin);
  return reply(200,{ok:true,enabled:data.enabled},origin);
 }catch{return reply(503,{ok:false,error:"No se pudo registrar el dispositivo"},origin)}
});
