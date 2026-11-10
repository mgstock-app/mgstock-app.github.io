/* GESTLOK ZAYRO · lectura de pedidos de TiendaNube.
   Requiere TIENDANUBE_STORE_ID, TIENDANUBE_APP_ID y TIENDANUBE_ACCESS_TOKEN
   en secretos de Supabase. El acceso de ChatGPT a TiendaNube NO los entrega.
   Sin tokens no se realiza ninguna consulta externa ni se inventan movimientos. */
import {createClient} from 'npm:@supabase/supabase-js@2.78.0';
const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
const OWNER_UID='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3';
const OWNER='camilab.lopez99@gmail.com';
const CREATOR='kmu15lopez@gmail.com';
const STATE='gestlok_zayro_tn_state',ORDERS='gestlok_zayro_tn_orders';
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
const str=(s:unknown)=>String(s??'').slice(0,180);
function sanitized(row:Record<string,unknown>){
 const id=str(row.id);
 if(!/^\d{1,20}$/.test(id))return null;
 const products=Array.isArray(row.products)?row.products:[];
 const quantity=products.reduce((sum:number,p:Record<string,unknown>)=>sum+Math.max(0,Number(p.quantity)||0),0);
 const numericTotal=Number(row.total??0);
 const shipping=typeof row.shipping_option==='string'?row.shipping_option:
  typeof row.shipping==='string'?row.shipping:
  (row.shipping&&typeof row.shipping==='object'?str((row.shipping as Record<string,unknown>).name):'');
 const dateValue=(x:unknown)=>typeof x==='string'&&!Number.isNaN(Date.parse(x))?x:null;
 return {
  tenant_id:TENANT,order_id:id,order_number:str(row.number??row.id),
  order_status:str(row.status||'open'),payment_status:str(row.payment_status||'pending'),
  fulfillment_status:str(row.fulfillment_status??row.shipping_status)||null,
  total_amount:Number.isFinite(numericTotal)?Math.max(0,numericTotal):0,
  currency:str(row.currency||'ARS').slice(0,3),shipping_method:str(shipping)||null,
  item_count:Math.min(9999,Math.floor(quantity)),
  created_at_tn:dateValue(row.created_at),
  updated_at_tn:dateValue(row.updated_at),
  synced_at:new Date().toISOString()
 };
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return output(req,200,{ok:true});
 if(req.method!=='POST')return output(req,405,{ok:false,message:'Método no permitido.'});
 const auth=req.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer '))return output(req,401,{ok:false,message:'Iniciá sesión en GESTLOK.'});
 const url=Deno.env.get('SUPABASE_URL')||'';
 const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
 const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!anon||!serviceKey)return output(req,503,{ok:false,message:'Servicio de sincronización no disponible.'});
 const userDb=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:{user},error:userError}=await userDb.auth.getUser(auth.slice(7));
 if(userError||!user)return output(req,401,{ok:false,message:'Sesión inválida.'});
 const email=String(user.email||'').toLowerCase();
 const owner=user.id===OWNER_UID&&email===OWNER;
 let creator=false;
 if(!owner&&email===CREATOR){
  const allowed=await userDb.rpc('gestlok_cami_creator_authorized');
  creator=!allowed.error&&allowed.data===true;
 }
 if(!owner&&!creator)return output(req,403,{ok:false,message:'Esta sección es privada de ZAYRO.'});
 // Validación independiente de RLS: impide que alguien use este endpoint para otro tenant.
 const guard=await userDb.from(STATE).select('tenant_id').eq('tenant_id',TENANT).maybeSingle();
 if(guard.error||!guard.data)return output(req,403,{ok:false,message:'Sin permiso de TiendaNube.'});
 const storeId=Deno.env.get('TIENDANUBE_STORE_ID')||'';
 const appId=Deno.env.get('TIENDANUBE_APP_ID')||'';
 const token=Deno.env.get('TIENDANUBE_ACCESS_TOKEN')||'';
 if(!/^\d+$/.test(storeId)||!/^\d+$/.test(appId)||!token){
  return output(req,409,{ok:false,message:'Falta autorizar TiendaNube con permiso read_orders para GESTLOK. La tienda todavía no está vinculada.'});
 }
 const svc=createClient(url,serviceKey,{auth:{persistSession:false}});
 const status=await svc.from(STATE).select('last_sync_at,connection_state').eq('tenant_id',TENANT).single();
 if(!status.error&&status.data?.last_sync_at&&
    Date.now()-Date.parse(status.data.last_sync_at)<30000){
  return output(req,200,{ok:true,unchanged:true,message:'Movimientos consultados recientemente.'});
 }
 try{
  const headers={'Authorization':'bearer '+token,'User-Agent':'GESTLOK ZAYRO ('+appId+')','Accept':'application/json'};
  let totalFetched=0;
  // Importación incremental idempotente. No se importan nombres, contactos ni domicilios.
  for(let page=1;page<=3;page++){
   const endpoint='https://api.tiendanube.com/v1/'+storeId+'/orders?page='+page+'&per_page=100';
   const remote=await fetch(endpoint,{headers,signal:AbortSignal.timeout(12000)});
   if(!remote.ok)throw Error('La API de TiendaNube rechazó la sincronización. Revisá la autorización.');
   const data=await remote.json();
   if(!Array.isArray(data))throw Error('La respuesta de TiendaNube no contiene pedidos válidos.');
   const rows=data.map((v:Record<string,unknown>)=>sanitized(v)).filter(Boolean);
   if(rows.length){
    const upsert=await svc.from(ORDERS).upsert(rows,{onConflict:'tenant_id,order_id'});
    if(upsert.error)throw Error('No fue posible guardar el resumen de movimientos.');
   }
   totalFetched+=data.length;
   if(data.length<100)break;
  }
  const updated=await svc.from(STATE).update({
   connection_state:'connected',last_sync_at:new Date().toISOString(),
   last_sync_count:totalFetched,last_error:null,updated_at:new Date().toISOString()
  }).eq('tenant_id',TENANT);
  if(updated.error)throw Error('No se pudo actualizar el estado de sincronización.');
  return output(req,200,{ok:true,imported:totalFetched});
 }catch(e){
  const msg=e instanceof Error?e.message:'Error de sincronización';
  await svc.from(STATE).update({
   connection_state:'error',last_error:msg.slice(0,160),updated_at:new Date().toISOString()
  }).eq('tenant_id',TENANT);
  return output(req,502,{ok:false,message:msg});
 }
});
