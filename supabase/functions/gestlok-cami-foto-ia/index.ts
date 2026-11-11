/* GESTLOK ZAYRO · Mis Productos · edición fotográfica con IA generativa gratuita.
   Proveedor: Cloudflare Workers AI (FLUX.2 klein 4B) con la cuenta gratuita de la
   dueña del negocio: 10.000 neuronas/día sin tarjeta (≈90 fotos 1024×1024). En el plan
   gratuito Cloudflare corta al llegar al cupo: nunca cobra.
   - Solo Camila (dueña) o la creadora autorizada pueden usarla.
   - El token vive en Vault; esta función es la única que lo lee (service_role).
   - El prompt es fijo en el servidor: el cupo no se puede usar para otras imágenes.
   - La foto viaja una sola vez a Cloudflare y no se guarda en ningún lado aquí. */
import {createClient} from 'npm:@supabase/supabase-js@2.78.0';

const OWNER_UID='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3';
const OWNER='camilab.lopez99@gmail.com';
const CREATOR='kmu15lopez@gmail.com';
const MODEL='@cf/black-forest-labs/flux-2-klein-4b';
const PROMPT=[
 'Professional e-commerce catalog photograph of the exact same product shown in image 0.',
 'Pure white seamless studio background (#FFFFFF). No shadows, no floor reflection, no props.',
 'Soft, even, high-key studio lighting with large softboxes; bright and crisp; natural subtle',
 'highlights and reflections on glass and glossy surfaces; shadows on the product gently filled.',
 'Neutral white balance and true-to-life colors.',
 'Keep the product identical: same bottle, cap, box, liquid color, shape, size, position, angle,',
 'labels, logos and text. Do not add, remove, rewrite or move anything. Same framing, centered.'
].join(' ');
const MAX_IMAGE=600*1024;
const DAILY_GUARD=150;
const ALLOWED_ORIGINS=['https://gestlok.com.ar','https://mgstock-app.github.io'];
const allowedOrigin=(req:Request)=>ALLOWED_ORIGINS.includes(req.headers.get('origin')||'')?req.headers.get('origin')!:'https://gestlok.com.ar';
function output(req:Request,status:number,data:Record<string,unknown>){
 return new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json','Cache-Control':'no-store',
  'Access-Control-Allow-Origin':allowedOrigin(req),'Vary':'Origin',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS'
 }});
}
// Errores de negocio con 200 para que la app muestre el mensaje exacto.
const fail=(req:Request,code:string,message:string,extra:Record<string,unknown>={})=>output(req,200,{ok:false,code,message,...extra});

function decodeBase64(text:string){
 const clean=text.replace(/^data:image\/[a-z+]+;base64,/i,'').replace(/\s/g,'');
 if(!/^[A-Za-z0-9+/]+=*$/.test(clean))return null;
 const bin=atob(clean),bytes=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
 return bytes;
}
const isJpeg=(b:Uint8Array)=>b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
const isPng=(b:Uint8Array)=>b.length>8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47;
const isWebp=(b:Uint8Array)=>b.length>12&&b[8]===0x57&&b[9]===0x45&&b[10]===0x42&&b[11]===0x50;
function jpegSize(b:Uint8Array){
 // Leer ancho y alto del marcador SOF para validar el límite de Workers AI (<512 px).
 let i=2;
 while(i+9<b.length){
  if(b[i]!==0xff){i++;continue;}
  const m=b[i+1],len=(b[i+2]<<8)|b[i+3];
  if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc)return {h:(b[i+5]<<8)|b[i+6],w:(b[i+7]<<8)|b[i+8]};
  i+=2+len;
 }
 return null;
}
function cloudflareMessage(status:number,body:Record<string,unknown>|null){
 const errors=Array.isArray(body?.errors)?body!.errors as Array<Record<string,unknown>>:[];
 const codes=errors.map(e=>Number(e?.code)).filter(Number.isFinite);
 const text=errors.map(e=>String(e?.message||'')).join(' ').slice(0,240);
 if(status===429||codes.includes(3036)||/daily free allocation|neurons/i.test(text))
  return {code:'cupo',message:'Se usó el cupo gratuito de hoy de la IA (≈90 fotos). Se renueva a las 21:00, hora de Argentina.',detail:text};
 if(codes.includes(5035))
  return {code:'plan',message:'Cloudflare pide el plan pago para este modelo. No se activó nada pago: avisá a la administradora.',detail:text};
 if(status===401||status===403||codes.includes(10000)||codes.includes(9109))
  return {code:'conexion',message:'Cloudflare rechazó la conexión. Revisá el Account ID y que el token tenga el permiso «Workers AI».',detail:text};
 return {code:'ia',message:'La IA gratuita no respondió bien ('+status+'). Probá de nuevo en un minuto.',detail:text};
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return output(req,200,{ok:true});
 if(req.method!=='POST')return output(req,405,{ok:false,message:'Método no permitido.'});
 const auth=req.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer '))return output(req,401,{ok:false,code:'sesion',message:'Iniciá sesión en GESTLOK.'});
 const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!anon||!serviceKey)return output(req,503,{ok:false,code:'servicio',message:'Servicio de fotos no disponible.'});
 const userDb=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:{user},error:userError}=await userDb.auth.getUser(auth.slice(7));
 if(userError||!user)return output(req,401,{ok:false,code:'sesion',message:'Sesión inválida.'});
 const email=String(user.email||'').toLowerCase();
 let allowed=user.id===OWNER_UID&&email===OWNER;
 if(!allowed&&email===CREATOR){
  const ok=await userDb.rpc('gestlok_cami_creator_authorized');
  allowed=!ok.error&&ok.data===true;
 }
 if(!allowed)return output(req,403,{ok:false,code:'permiso',message:'La edición de fotos es privada de Mis Productos.'});
 let body:Record<string,unknown>={};
 try{body=await req.json();}catch{return fail(req,'datos','Pedido inválido.');}
 const action=String(body.action||'');
 const svc=createClient(url,serviceKey,{auth:{persistSession:false}});

 if(action==='status'){
  const st=await svc.rpc('gestlok_cami_foto_ia_estado');
  const envReady=!!(Deno.env.get('CF_ACCOUNT_ID')&&Deno.env.get('CF_API_TOKEN'));
  if(st.error)return fail(req,'servicio','No se pudo leer la conexión de IA.');
  const s=st.data as Record<string,unknown>;
  return output(req,200,{ok:true,connected:s.connected===true||envReady,account_hint:s.account_hint??null,
   connected_at:s.connected_at??null,hoy:Number(s.hoy)||0,cupo_estimado:90,model:MODEL,ultimo_error:s.ultimo_error??null});
 }

 if(action==='connect'){
  const account=String(body.account_id||'').trim().toLowerCase();
  const token=String(body.token||'').trim();
  if(!/^[0-9a-f]{32}$/.test(account))return fail(req,'datos','El Account ID tiene 32 letras y números (0-9, a-f). Copialo desde Cloudflare.');
  if(token.length<20||token.length>200||/\s/.test(token))return fail(req,'datos','El token no parece válido. Copialo completo desde Cloudflare.');
  try{
   // Prueba liviana: listar un modelo confirma cuenta + permiso Workers AI, sin gastar cupo.
   const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/ai/models/search?per_page=1',
    {headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
   const j=await r.json().catch(()=>null);
   if(!r.ok||j?.success!==true){const m=cloudflareMessage(r.status,j);return fail(req,m.code,m.message);}
  }catch{return fail(req,'red','No se pudo comprobar la conexión con Cloudflare. Probá de nuevo.');}
  const saved=await svc.rpc('gestlok_cami_foto_ia_guardar',{p_account:account,p_token:token,p_user:user.id});
  if(saved.error)return fail(req,'servicio','Cloudflare respondió bien, pero no se pudo guardar la conexión.');
  return output(req,200,{ok:true,connected:true,account_hint:account.slice(-4)});
 }

 if(action==='disconnect'){
  const r=await svc.rpc('gestlok_cami_foto_ia_quitar');
  if(r.error)return fail(req,'servicio','No se pudo quitar la conexión.');
  return output(req,200,{ok:true,connected:false});
 }

 if(action==='edit'){
  const bytes=typeof body.image==='string'?decodeBase64(body.image):null;
  if(!bytes||!isJpeg(bytes))return fail(req,'datos','La foto para la IA debe ser JPG.');
  if(bytes.length>MAX_IMAGE)return fail(req,'datos','La foto para la IA es demasiado pesada.');
  const size=jpegSize(bytes);
  if(!size||size.w>=512||size.h>=512)return fail(req,'datos','La copia para la IA debe medir menos de 512 px.');
  let account=Deno.env.get('CF_ACCOUNT_ID')||'',token=Deno.env.get('CF_API_TOKEN')||'';
  if(!account||!token){
   const cred=await svc.rpc('gestlok_cami_foto_ia_credenciales');
   const c=(cred.data||{}) as Record<string,string>;
   account=c.account_id||'';token=c.token||'';
  }
  if(!account||!token)return fail(req,'sin_conexion','Falta conectar la IA gratuita (Cloudflare). Tocá «Conectar IA gratuita».');
  const st=await svc.rpc('gestlok_cami_foto_ia_estado');
  if(Number((st.data as Record<string,unknown>|null)?.hoy)>=DAILY_GUARD)
   return fail(req,'cupo','Se llegó al máximo de ediciones de hoy. Se renueva a las 21:00, hora de Argentina.');
  const seed=Number.isInteger(body.seed)?Math.abs(Number(body.seed))%2147483647:Math.floor(Math.random()*2147483647);
  const form=new FormData();
  form.append('prompt',PROMPT);
  form.append('input_image_0',new Blob([bytes],{type:'image/jpeg'}),'producto.jpg');
  form.append('width','1024');form.append('height','1024');form.append('seed',String(seed));
  const started=Date.now();
  let res:Response;
  try{
   res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/ai/run/'+MODEL,
    {method:'POST',headers:{Authorization:'Bearer '+token},body:form,signal:AbortSignal.timeout(100000)});
  }catch{
   await svc.rpc('gestlok_cami_foto_ia_registrar',{p_ok:false,p_error:'sin respuesta'});
   return fail(req,'red','La IA tardó demasiado en responder. Probá de nuevo.');
  }
  // Workers AI responde JSON {result:{image:base64}}; algunos modelos devuelven la imagen binaria.
  let json:Record<string,unknown>|null=null,image='';
  if(/^image\//i.test(res.headers.get('content-type')||'')&&res.ok){
   const raw=new Uint8Array(await res.arrayBuffer());let bin='';
   for(let i=0;i<raw.length;i+=32768)bin+=String.fromCharCode(...raw.subarray(i,i+32768));
   image=btoa(bin);
  }else{
   json=await res.json().catch(()=>null) as Record<string,unknown>|null;
   const result=(json?.result||{}) as Record<string,unknown>;
   image=typeof result.image==='string'?result.image:'';
  }
  if(!res.ok||json?.success===false||!image){
   const m=cloudflareMessage(res.status,json);
   await svc.rpc('gestlok_cami_foto_ia_registrar',{p_ok:false,p_error:(m.code+': '+m.detail).slice(0,300)});
   return fail(req,m.code,m.message);
  }
  const out=decodeBase64(image);
  if(!out||!(isJpeg(out)||isPng(out)||isWebp(out))){
   await svc.rpc('gestlok_cami_foto_ia_registrar',{p_ok:false,p_error:'imagen inválida'});
   return fail(req,'ia','La IA devolvió un archivo que no es una imagen.');
  }
  const total=await svc.rpc('gestlok_cami_foto_ia_registrar',{p_ok:true});
  return output(req,200,{ok:true,image,mime:isPng(out)?'image/png':isWebp(out)?'image/webp':'image/jpeg',
   model:MODEL,ms:Date.now()-started,hoy:Number(total.data)||null,cupo_estimado:90});
 }
 return fail(req,'datos','Acción desconocida.');
});
