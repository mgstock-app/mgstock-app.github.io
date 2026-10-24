// GestLok push gateway. JWT verification for users and an independent private
// cron secret for background delivery. No payment or customer data is exported.
import {createClient} from "npm:@supabase/supabase-js@2.118.0";
import {ApplicationServer, generateVapidKeys, exportVapidKeys, importVapidKeys, exportApplicationServerKey} from "jsr:@negrel/webpush@0.5.0";

const projectUrl=Deno.env.get("SUPABASE_URL") || "";
const secretKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if(!projectUrl || !secretKey)throw new Error("No server Supabase credentials");
const admin=createClient(projectUrl,secretKey,{auth:{autoRefreshToken:false,persistSession:false}});
const APP_ORIGIN="https://mgstock-app.github.io";
const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(data:unknown,status=200,origin="")=>new Response(JSON.stringify(data),{
 status,headers:{...headers,...(origin===APP_ORIGIN?{"Access-Control-Allow-Origin":origin,"Vary":"Origin"}:{})}
});
const bad=(message="Acceso denegado",status=403,origin="")=>reply({ok:false,error:message},status,origin);
const hash=async (value:string)=>{
 const bytes=new TextEncoder().encode(value);
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)))
 .map(x=>x.toString(16).padStart(2,"0")).join("");
};
const safeCompare=(a:string,b:string)=>{
 if(a.length!==b.length || !a)return false;
 let result=0;for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);
 return result===0;
};
const approvedOwner=async(req:Request)=>{
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer /i,"");
 if(!token || token.length>5000)return null;
 const {data:{user},error}=await admin.auth.getUser(token);
 if(error || !user?.id || !user.email)return null;
 const email=user.email.toLowerCase();
 const {data:team,error:teamError}=await admin.from("docs")
 .select("tenant_id,data").eq("col","equipo").eq("id",email).maybeSingle();
 if(teamError || !team || !team.tenant_id || !["dueno","creadora"].includes(team.data?.rol))return null;
 return {userId:user.id,tenantId:team.tenant_id,email};
};
const keys=async()=>{
 const {data:existing,error:queryError}=await admin.from("gestlok_push_settings")
 .select("public_key,private_jwk").eq("id",1).maybeSingle();
 if(queryError)throw queryError;
 if(existing)return existing;
 const vapid=await generateVapidKeys({extractable:true});
 const exported=await exportVapidKeys(vapid);
 const publicKey=await exportApplicationServerKey(vapid);
 const {error}=await admin.from("gestlok_push_settings").upsert({
   id:1,public_key:publicKey,private_jwk:exported
 },{onConflict:"id",ignoreDuplicates:true});
 if(error)throw error;
 const {data:stored,error:err}=await admin.from("gestlok_push_settings")
 .select("public_key,private_jwk").eq("id",1).single();
 if(err || !stored)throw (err||new Error("No VAPID settings"));
 return stored;
};
const allowedEndpoint=(text:unknown)=>{
 if(typeof text!=="string" || text.length>1800)return false;
 try{
  const url=new URL(text);
  return url.protocol==="https:" && (
    url.hostname==="fcm.googleapis.com" ||
    url.hostname==="updates.push.services.mozilla.com" ||
    url.hostname==="web.push.apple.com" ||
    url.hostname.endsWith(".push.apple.com")
  );
 }catch{return false;}
};
const validKey=(k:unknown,min:number,max:number)=>typeof k==="string" &&
 k.length>=min && k.length<=max && /^[A-Za-z0-9_-]+={0,2}$/.test(k);
const dispatch=async()=>{
 const stored=await keys();
 const vapid=await importVapidKeys(stored.private_jwk);
 const server=await ApplicationServer.new({
   contactInformation:APP_ORIGIN+"/",
   vapidKeys:vapid
 });
 const {data:events,error:eventError}=await admin.from("gestlok_push_events")
 .select("id,tenant_id,local_id,event_key,title,body,attempts")
 .is("delivered_at",null).order("created_at",{ascending:true}).limit(20);
 if(eventError)throw eventError;
 let sent=0;
 for(const event of events||[]){
  let successful=true;
  const {data:devices,error:deviceError}=await admin.from("gestlok_push_devices")
   .select("endpoint,auth_key,p256dh_key,user_id")
   .eq("tenant_id",event.tenant_id).eq("enabled",true).limit(100);
  if(deviceError)throw deviceError;
  const {data:teamRows,error:teamError}=await admin.from("docs")
   .select("id,data").eq("tenant_id",event.tenant_id).eq("col","equipo");
  if(teamError)throw teamError;
  for(const device of devices||[]){
   try {
    // Permissions are rechecked before delivery, including after revocations.
    const userInfo=await admin.auth.admin.getUserById(device.user_id);
    const email=userInfo.data?.user?.email?.toLowerCase();
    const member=(teamRows||[]).find(x=>x.id.toLowerCase()===email);
    if(!member || !["creadora","dueno"].includes(member.data?.rol)){
      await admin.from("gestlok_push_devices").delete().eq("endpoint",device.endpoint);
      continue;
    }
    if(!allowedEndpoint(device.endpoint))continue;
    const receiver=server.subscribe({endpoint:device.endpoint,
      keys:{p256dh:device.p256dh_key,auth:device.auth_key}});
    await receiver.pushTextMessage(JSON.stringify({
      title:event.title,body:event.body,tag:String(event.event_key).slice(-90)
    }),{ttl:43200});
    sent++;
   }catch(err){
    if(err && typeof err==="object" && "isGone" in err &&
     typeof (err as {isGone:()=>boolean}).isGone==="function" && (err as {isGone:()=>boolean}).isGone()){
      await admin.from("gestlok_push_devices").delete().eq("endpoint",device.endpoint);
    }else successful=false;
   }
  }
  const {error:markError}=await admin.from("gestlok_push_events")
   .update({attempts:event.attempts+1,
     delivered_at:successful || event.attempts>=4 ? new Date().toISOString() : null})
   .eq("id",event.id);
  if(markError)throw markError;
 }
 return {ok:true,processed:(events||[]).length,notifications:sent};
};
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 if(req.method==="OPTIONS"){
   if(origin!==APP_ORIGIN)return bad("Origen no permitido",403);
   return new Response(null,{status:204,headers:{
    "Access-Control-Allow-Origin":APP_ORIGIN,
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Access-Control-Allow-Headers":"authorization,apikey,content-type",
    "Access-Control-Max-Age":"600"
   }});
 }
 if(req.method!=="POST")return bad("Método no permitido",405,origin);
 let body:Record<string,unknown>;
 try{body=await req.json();if(!body || typeof body!=="object")throw Error();}
 catch{return bad("Solicitud inválida",400,origin);}
 try{
  if(body.op==="dispatch"){
   const given=req.headers.get("x-gestlok-cron")||"";
   const {data:control}=await admin.from("gestlok_push_control")
     .select("cron_token_hash").eq("id",1).maybeSingle();
   if(!control || !safeCompare(await hash(given),control.cron_token_hash)){
     return bad("Cron no autorizado",403,origin);
   }
   return reply(await dispatch(),200,origin);
  }
  if(origin && origin!==APP_ORIGIN)return bad("Origen no permitido",403);
  const owner=await approvedOwner(req);
  if(!owner)return bad("Solo dueñas autorizadas",403,origin);
  if(body.op==="config"){
    const setting=await keys();
    return reply({ok:true,publicKey:setting.public_key,time:"23:15",zone:"America/Argentina/Buenos_Aires"},200,origin);
  }
  if(body.op==="status"){
    const {count,error}=await admin.from("gestlok_push_devices").select("endpoint",{head:true,count:"exact"})
      .eq("tenant_id",owner.tenantId).eq("user_id",owner.userId).eq("enabled",true);
    if(error)throw error;
    return reply({ok:true,devices:count||0},200,origin);
  }
  if(body.op==="subscribe"){
    const sub=body.subscription as {endpoint?:string;keys?:{p256dh?:string;auth?:string}}|undefined;
    if(!allowedEndpoint(sub?.endpoint) || !validKey(sub?.keys?.auth,12,200) ||
      !validKey(sub?.keys?.p256dh,60,300))return bad("Suscripción inválida",400,origin);
    const {data:existing}=await admin.from("gestlok_push_devices")
      .select("user_id").eq("endpoint",sub!.endpoint).maybeSingle();
    if(existing && existing.user_id!==owner.userId)return bad("Dispositivo registrado para otra cuenta",409,origin);
    const {error}=await admin.from("gestlok_push_devices").upsert({
      endpoint:sub!.endpoint,user_id:owner.userId,tenant_id:owner.tenantId,
      auth_key:sub!.keys!.auth,p256dh_key:sub!.keys!.p256dh,enabled:true,
      registered_at:new Date().toISOString()
    },{onConflict:"endpoint"});
    if(error)throw error;
    return reply({ok:true},200,origin);
  }
  if(body.op==="unsubscribe"){
    if(typeof body.endpoint!=="string")return bad("Dispositivo inválido",400,origin);
    const {error}=await admin.from("gestlok_push_devices").delete()
      .eq("endpoint",body.endpoint).eq("user_id",owner.userId);
    if(error)throw error;
    return reply({ok:true},200,origin);
  }
  return bad("Operación desconocida",400,origin);
 }catch(error){
  console.error("GestLok push error",error instanceof Error?error.message:"unknown");
  return bad("El servicio de avisos no está disponible. Intentá más tarde.",503,origin);
 }
});