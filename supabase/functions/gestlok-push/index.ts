// GestLok Web Push · cinco avisos, exclusivamente Dueña que aceptó el permiso.
// Solo servicios de envío confiables. No se exponen claves VAPID privadas.
import {createClient} from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";
const SUPA_URL=Deno.env.get("SUPABASE_URL")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const SITE="https://mgstock-app.github.io";
const allowed=["master","order_ready","due_soon","due_today","urgent_chat","important_changes"] as const;
type Flag=typeof allowed[number];
type Prefs=Record<Flag,boolean>;
const defaults:Prefs={master:true,order_ready:true,due_soon:true,due_today:true,urgent_chat:true,important_changes:true};
const cors={"Access-Control-Allow-Origin":SITE,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-gestlok-cron",
"Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin"};
const json=(code:number,body:unknown)=>new Response(JSON.stringify(body),{status:code,headers:{
  ...cors,"Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store"}});
const admin=createClient(SUPA_URL,SERVICE,{auth:{autoRefreshToken:false,persistSession:false}});
const endpointValid=(s:unknown)=>{
 if(typeof s!=="string"||s.length>2048)return false;
 try{
  const u=new URL(s),host=u.hostname.toLowerCase();
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash)return false;
  return host==="fcm.googleapis.com" || host==="updates.push.services.mozilla.com" ||
   host==="push.services.mozilla.com" || host==="updates.push.services.mozilla.org" ||
   host.endsWith(".notify.windows.com") || host==="notify.windows.com" ||
   host==="web.push.apple.com" || host.endsWith(".push.apple.com");
 }catch{return false;}
};
const validKey=(k:unknown,max:number)=>typeof k==="string"&&k.length>=16&&k.length<=max&&/^[A-Za-z0-9_-]+$/.test(k);
async function auth(req:Request){
 const bearer=req.headers.get("authorization")||"";
 if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer))return null;
 const {data,error}=await admin.auth.getUser(bearer.slice(7));
 if(error||!data.user)return null;
 const client=createClient(SUPA_URL,ANON,{global:{headers:{Authorization:bearer}},
  auth:{autoRefreshToken:false,persistSession:false}});
 const {data:access,error:accessError}=await client.rpc("mi_acceso");
 if(accessError||access?.rol!=="dueno"||!access.tenant_id)return null;
 return {user:data.user,tenant_id:String(access.tenant_id)};
}
async function prefOf(tenant:string,user:string):Promise<Prefs>{
 const {data}=await admin.from("gestlok_push_preferences").select(
  "master,order_ready,due_soon,due_today,urgent_chat,important_changes")
  .eq("tenant_id",tenant).eq("user_id",user).maybeSingle();
 return Object.fromEntries(allowed.map(k=>[k,data?.[k]??true])) as Prefs;
}
async function verifyCron(token:string){
 if(!/^[a-f0-9]{64}$/i.test(token))return false;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
 const actual=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
 const {data,error}=await admin.from("gestlok_push_control").select("cron_token_hash").eq("id",1).single();
 return !error && data?.cron_token_hash===actual;
}
async function dispatch(){
 const {data:config,error:keysError}=await admin.from("gestlok_push_settings")
  .select("public_key,private_jwk").eq("id",1).single();
 if(keysError||!config?.public_key||!config.private_jwk?.privateKey)
  return json(503,{ok:false,error:"Claves push no configuradas"});
 // La clave privada se guardó históricamente como JWK JSON, no como d base64url.
 let privateKey="";
 try{
  const stored=config.private_jwk.privateKey;
  if(stored && typeof stored==="object")privateKey=String(stored.d||"");
  else{
   const raw=String(stored||"");
   privateKey=raw.startsWith("{")?String(JSON.parse(raw).d||""):raw;
  }
 }catch{return json(503,{ok:false,error:"Clave push inválida"});}
 if(!/^[A-Za-z0-9_-]{43}$/.test(privateKey))
  return json(503,{ok:false,error:"Clave push inválida"});
 webpush.setVapidDetails(SITE,config.public_key,privateKey);
 const {data:events,error:eventsError}=await admin.from("gestlok_push_events")
  .select("id,tenant_id,local_id,category,title,body,path")
  .is("delivered_at",null).not("category","is",null)
  .lte("scheduled_at",new Date().toISOString())
  .order("id",{ascending:true}).limit(45);
 if(eventsError)return json(503,{ok:false,error:"Cola no disponible"});
 let attempted=0,delivered=0;
 for(const evt of events||[]){
  const {data:devices,error:deviceError}=await admin.from("gestlok_push_devices")
   .select("endpoint,auth_key,p256dh_key,user_id,tenant_id")
   .eq("tenant_id",evt.tenant_id).eq("enabled",true).limit(75);
  if(deviceError)continue;
  let retry=false;
  const users=new Map<string,boolean>();
  for(const device of devices||[]){
   if(!endpointValid(device.endpoint))continue;
   let eligible=users.get(device.user_id);
   if(eligible===undefined){
    const {data:identity}=await admin.auth.admin.getUserById(device.user_id);
    const email=String(identity?.user?.email||"").toLowerCase();
    if(!email)eligible=false;
    else{
     const {data:staff}=await admin.from("docs").select("data")
       .eq("tenant_id",evt.tenant_id).eq("col","equipo").limit(200);
     eligible=!!staff?.some(s=>String(s.data?.email||"").toLowerCase()===email && s.data?.rol==="dueno");
    }
    users.set(device.user_id,eligible);
   }
   if(!eligible)continue;
   const prefs=await prefOf(evt.tenant_id,device.user_id);
   if(!prefs.master || !prefs[evt.category as Flag])continue;
   const {data:prev}=await admin.from("gestlok_push_deliveries")
     .select("attempts,delivered_at").eq("event_id",evt.id).eq("endpoint",device.endpoint).maybeSingle();
   if(prev?.delivered_at||Number(prev?.attempts||0)>=3)continue;
   attempted++;
   await admin.from("gestlok_push_deliveries").upsert({
     event_id:evt.id,endpoint:device.endpoint,attempts:Number(prev?.attempts||0)+1
   },{onConflict:"event_id,endpoint"});
   try {
     await webpush.sendNotification({endpoint:device.endpoint,
       keys:{auth:device.auth_key,p256dh:device.p256dh_key}},
       JSON.stringify({title:evt.title,body:evt.body,path:"/",local:evt.local_id,view:evt.path,tag:String(evt.category)+":"+evt.id}),{
       TTL:3600,urgency:evt.category==="urgent_chat"?"high":"normal"});
     delivered++;
     await admin.from("gestlok_push_deliveries").update({delivered_at:new Date().toISOString(),last_error:null})
       .eq("event_id",evt.id).eq("endpoint",device.endpoint);
   }catch(e){
     const status=Number((e as {statusCode?:number}).statusCode||0);
     if(status===404||status===410){
       await admin.from("gestlok_push_devices").update({enabled:false}).eq("endpoint",device.endpoint);
     }else if(Number(prev?.attempts||0)<2)retry=true;
     await admin.from("gestlok_push_deliveries").update({last_error:"push HTTP "+(status||"error")})
       .eq("event_id",evt.id).eq("endpoint",device.endpoint);
   }
  }
  if(!retry)await admin.from("gestlok_push_events").update({delivered_at:new Date().toISOString()}).eq("id",evt.id);
 }
 return json(200,{ok:true,attempted,delivered,deliveryEnabled:true});
}
Deno.serve(async(req:Request)=>{
 if(req.headers.get("origin") && req.headers.get("origin")!==SITE)return json(403,{ok:false,error:"Origen no permitido"});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(!SUPA_URL||!SERVICE||!ANON)return json(503,{ok:false,error:"Servicio no configurado"});
 const op=new URL(req.url).searchParams.get("op");
 if(req.method==="GET"&&op==="config"){
  const {data,error}=await admin.from("gestlok_push_settings").select("public_key").eq("id",1).single();
  return error||!data?.public_key?json(503,{ok:false,error:"Clave pública no disponible"}):
   json(200,{ok:true,publicKey:data.public_key,deliveryEnabled:true});
 }
 if(req.method==="POST"&&op==="dispatch"){
   if(!await verifyCron(req.headers.get("x-gestlok-cron")||""))return json(403,{ok:false,error:"No autorizado"});
   return await dispatch();
 }
 if(req.method!=="GET"&&req.method!=="POST")return json(405,{ok:false,error:"Método no permitido"});
 const account=await auth(req);
 if(!account)return json(403,{ok:false,error:"Solo Dueña puede gestionar notificaciones"});
 if(req.method==="GET"&&op==="preferences"){
   return json(200,{ok:true,preferences:await prefOf(account.tenant_id,account.user.id)});
 }
 if(req.method!=="POST")return json(405,{ok:false,error:"Método no permitido"});
 let data:Record<string,unknown>;
 try{
  if(Number(req.headers.get("content-length")||0)>8192)throw Error("too long");
  data=await req.json();
  if(!data||typeof data!=="object"||Array.isArray(data))throw Error("invalid");
 }catch{return json(400,{ok:false,error:"Datos inválidos"});}
 if(data.op==="set-preference"){
   if(!allowed.includes(data.key as Flag)||typeof data.value!=="boolean")
      return json(400,{ok:false,error:"Preferencia inválida"});
   const prefs=await prefOf(account.tenant_id,account.user.id);
   prefs[data.key as Flag]=data.value;
   const {error}=await admin.from("gestlok_push_preferences").upsert({
     tenant_id:account.tenant_id,user_id:account.user.id,...prefs,updated_at:new Date().toISOString()
   },{onConflict:"tenant_id,user_id"});
   return error?json(503,{ok:false,error:"No se guardó la preferencia"}):
     json(200,{ok:true,preferences:prefs});
 }
 if(data.op!=="subscribe"&&data.op!=="unsubscribe")return json(400,{ok:false,error:"Operación inválida"});
 const sub=data.subscription as {endpoint?:unknown,keys?:{auth?:unknown,p256dh?:unknown}};
 if(!sub||!endpointValid(sub.endpoint))return json(400,{ok:false,error:"Endpoint no admitido"});
 if(data.op==="unsubscribe"){
   const {error}=await admin.from("gestlok_push_devices").delete()
     .eq("endpoint",sub.endpoint).eq("user_id",account.user.id).eq("tenant_id",account.tenant_id);
   return error?json(503,{ok:false,error:"No se pudo quitar dispositivo"}):json(200,{ok:true});
 }
 if(!validKey(sub.keys?.auth,100)||!validKey(sub.keys?.p256dh,200))
   return json(400,{ok:false,error:"Claves push inválidas"});
 const {error}=await admin.from("gestlok_push_devices").upsert({
   endpoint:sub.endpoint,user_id:account.user.id,tenant_id:account.tenant_id,
   auth_key:sub.keys?.auth,p256dh_key:sub.keys?.p256dh,enabled:true,registered_at:new Date().toISOString()
 },{onConflict:"endpoint"});
 return error?json(503,{ok:false,error:"No se pudo registrar dispositivo"}):json(200,{ok:true});
});
