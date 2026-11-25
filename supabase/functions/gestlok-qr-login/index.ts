import {createClient} from "npm:@supabase/supabase-js@2.118.0";
const env=(k:string)=>Deno.env.get(k)||"";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const proof=/^[a-f0-9]{64}$/;
const hex=(a:Uint8Array)=>Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
const secret=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));
const code=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0");
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const url=env("SUPABASE_URL"),key=env("SUPABASE_ANON_KEY");
 // Never allow production credentials to be paired from a test origin (or vice versa).
 const allowed=url.includes("irqeitzbfyerxcrogkyh")?["https://gestlok-prueba.vercel.app","https://gestlok-testing.vercel.app"]:url.includes("vgsepaaewbctjsjcpeta")?["https://gestlok.com.ar","https://www.gestlok.com.ar"]:[];
 const headers={"Content-Type":"application/json","Cache-Control":"no-store","Referrer-Policy":"no-referrer","Vary":"Origin","Access-Control-Allow-Origin":allowed.includes(origin)?origin:"null","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(!allowed.includes(origin))return reply({error:"Origen no autorizado"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply({error:"Método inválido"},405);
 const raw=await req.text();if(raw.length>2048)return reply({error:"Solicitud inválida"},400);
 let b;try{b=JSON.parse(raw);}catch{return reply({error:"Solicitud inválida"},400);}
 if(!b||!["create","preview","approve","claim","cancel"].includes(b.action))return reply({error:"Solicitud inválida"},400);
 const admin=createClient(url,env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
 const op=async(args:Record<string,unknown>)=>await admin.rpc("gestlok_qr_operation",{p_action:b.action,p_origin:origin,...args});
 try{
  if(b.action==="create"){
   const desktop=secret(),scan=secret();
   const {data,error}=await op({p_proof:await digest(desktop),p_other:await digest(scan),p_code:code()});
   if(error||!data?.id)return reply({error:"No se pudo generar el QR. Probá nuevamente."},429);
   return reply({...data,desktop,scan});
  }
  if(typeof b.id!=="string"||!uuid.test(b.id)||typeof b.proof!=="string"||!proof.test(b.proof))return reply({error:"Solicitud inválida"},400);
  const args:Record<string,unknown>={p_id:b.id,p_proof:await digest(b.proof)};
  if(b.action==="preview"||b.action==="approve"){
   const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
   if(!token)return reply({error:"Abrí GESTLOK con tu cuenta activa."},401);
   const {data:{user},error}=await admin.auth.getUser(token);
   if(error||!user||!user.email_confirmed_at||user.is_anonymous)return reply({error:"Sesión no disponible."},401);
   // Decode the session id only after Auth has validated this JWT.
   const part=token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
   const claims=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,"=")));
   if(!uuid.test(String(claims.session_id||"")))return reply({error:"Sesión no disponible."},401);
   const phone=createClient(url,key,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
   const access=await phone.rpc("mi_acceso");
   if(access.error||!access.data?.rol)return reply({error:"Tu cuenta todavía no tiene acceso activo."},403);
   args.p_user=user.id;args.p_session=claims.session_id;
   if(b.action==="approve"){
    if(b.confirm!==true||typeof b.code!=="string"||!/^\d{6}$/.test(b.code))return reply({error:"Confirmación requerida."},400);
    args.p_code=b.code;
   }
  }
  const {data,error}=await op(args);
  if(error||!data)return reply({error:"No se pudo completar la vinculación."},400);
  if(b.action!=="claim"||data.state!=="claimed")return reply(data);
  const userResult=await admin.auth.admin.getUserById(data.user_id);
  const u=userResult.data?.user;
  if(userResult.error||!u?.email||!u.email_confirmed_at||u.is_anonymous||u.id!==data.user_id)return reply({error:"Cuenta no disponible."},403);
  // Fail closed if MFA is present or could not be verified. QR cannot downgrade MFA.
  const factors=await admin.auth.admin.mfa.listFactors({userId:u.id});
  if(factors.error||!Array.isArray(factors.data?.factors)||factors.data.factors.length)return reply({error:"Usá el ingreso habitual para esta cuenta."},403);
  // Mint a NEW Supabase session, not a copy of the phone's session. No email is sent.
  const link=await admin.auth.admin.generateLink({type:"magiclink",email:u.email});
  if(link.error||link.data.user?.id!==u.id||!link.data.properties?.hashed_token)return reply({error:"No se pudo iniciar una sesión nueva."},400);
  const desktop=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await desktop.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:"email"});
  const s=verified.data?.session;
  if(verified.error||!s||s.user.id!==u.id)return reply({error:"No se pudo iniciar una sesión nueva."},400);
  return reply({state:"ready",access_token:s.access_token,refresh_token:s.refresh_token});
 }catch{return reply({error:"No se pudo completar la vinculación."},400);}
});
