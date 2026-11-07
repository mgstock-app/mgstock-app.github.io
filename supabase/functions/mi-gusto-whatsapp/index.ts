/* Mi Gusto · WhatsApp Cloud API (oficial de Meta) → GESTLOK · Pedidos WhatsApp.
 * - Webhook firmado con el App Secret (X-Hub-Signature-256). Sin firma válida no se procesa nada.
 * - Cada Phone Number ID apunta a una única sucursal (Munro y Don Torcuato trabajan por separado).
 * - Conexión «coexistencia»: el número sigue funcionando en la app WhatsApp Business del teléfono.
 * - Token de Meta y App Secret viven en Supabase Vault o en los secretos de la función; nunca en el navegador.
 * - El bot no modifica Caja, Stock, Pagos Online ni registra cobros. Solo responde a quien escribe.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

type Json = Record<string, unknown>;
type Texts = {
 welcome_text:string; option_order:string; option_prices:string; option_human:string;
 human_text:string; review_text:string; confirmed_text:string;
};
type Route = {local:Local; token:string; enabled:boolean};
const env = (k:string) => Deno.env.get(k) || "";
const locals = {munro:"Munro",torcuato:"Don Torcuato"} as const;
type Local = keyof typeof locals;
const isLocal = (v:unknown):v is Local => v==="munro"||v==="torcuato";
const money = (v:unknown) => new Intl.NumberFormat("es-AR",{
  style:"currency",currency:"ARS",maximumFractionDigits:2
}).format(Number(v)||0);
const text = (v:unknown,max=500) => String(v ?? "").slice(0,max);
const plain = (to:string,body:string) => ({messaging_product:"whatsapp",to,type:"text",text:{preview_url:false,body:body.slice(0,3900)}});
const buttons = (to:string,body:string,choices:{id:string,title:string}[]) => ({
 messaging_product:"whatsapp",to,type:"interactive",interactive:{
  type:"button",body:{text:body.slice(0,1024)},action:{
   buttons:choices.slice(0,3).map(v=>({type:"reply",reply:{id:v.id,title:v.title.slice(0,20)}}))
  }
 }
});
const listMessage = (to:string,body:string,button:string,title:string,rows:{id:string,title:string,description?:string}[]) => ({
 messaging_product:"whatsapp",to,type:"interactive",interactive:{
  type:"list",body:{text:body.slice(0,1024)},
  action:{button:button.slice(0,20),sections:[{title:title.slice(0,24),rows:rows.slice(0,10).map(r=>({
   id:r.id.slice(0,200),title:r.title.slice(0,24),...(r.description?{description:r.description.slice(0,72)}:{})
  }))}]}
 }
});
const START = [
 {id:"mi:order",title:"Hacer pedido"},
 {id:"mi:prices",title:"Ver precios"},
 {id:"mi:human",title:"Hablar con local"}
];
const CART_BUTTONS=[
 {id:"mi:more",title:"Agregar otro"},
 {id:"mi:finish",title:"Finalizar pedido"},
 {id:"mi:cancel",title:"Cancelar"}
];
const REVIEW_BUTTONS=[
 {id:"mi:confirm",title:"Confirmar pedido"},
 {id:"mi:edit",title:"Modificar"},
 {id:"mi:cancel",title:"Cancelar"}
];
const QUANTITIES=[1,2,3,4,6,12,18,24];
function textsOf(result:Json):Texts|null{
 const t=result.texts as Json|undefined;
 if(!t||typeof t!=="object")return null;
 const keys=["welcome_text","option_order","option_prices","option_human","human_text","review_text","confirmed_text"];
 return keys.every(k=>typeof t[k]==="string"&&String(t[k]).trim())?t as unknown as Texts:null;
}
function summary(rows:unknown):string{
 const a=Array.isArray(rows)?rows.slice(0,25):[];
 return a.map(p=>{
  const item=p as Json;
  return text(item.quantity,3)+" × "+text(item.name,90)+" · "+money(Number(item.quantity)*Number(item.price));
 }).join("\n");
}
function answer(to:string,local:Local,result:Json):Json|null {
 const t=text(result.type,25),name=locals[local],cat=Array.isArray(result.catalog)?result.catalog as Json[]:[];
 const custom=textsOf(result);
 if(t==="silent")return null;
 if(t==="welcome")return custom
  ? buttons(to,custom.welcome_text,[
     {id:"mi:order",title:custom.option_order},
     {id:"mi:prices",title:custom.option_prices},
     {id:"mi:human",title:custom.option_human}])
  : buttons(to,"¡Hola! 👋 Bienvenido/a a Mi Gusto "+name+". ¿En qué podemos ayudarte?",START);
 if(t==="human")return plain(to,custom?custom.human_text:"¡Perfecto! Alguien de Mi Gusto "+name+" va a continuar con tu consulta. Para volver al menú, escribí MENU.");
 if(t==="empty")return plain(to,"Todavía no tenemos la carta automática habilitada en Mi Gusto "+name+". Te va a atender alguien del local. Escribí MENU para volver al inicio.");
 if(t==="prices"){
  const list=cat.slice(0,35).map(x=>"• "+text(x.name,90)+": "+money(x.price)).join("\n");
  return plain(to, list ? "Carta de Mi Gusto "+name+":\n"+list+"\n\nPago únicamente en efectivo. Para hacer un pedido, escribí MENU." : "La carta de precios está pendiente de cargar. Un asesor puede ayudarte. Escribí MENU para volver.");
 }
 if(t==="catalog"){
  const page=Math.max(0,Math.min(20,Number(result.page)||0)),perPage=9;
  const slice=cat.slice(page*perPage,page*perPage+perPage);
  if(!slice.length)return plain(to,"No tenemos productos disponibles para cargar pedidos. Un asesor te puede ayudar.");
  const rows=slice.map(x=>({id:"mi:product:"+text(x.id,40),title:text(x.name,24),description:money(x.price)}));
  if(cat.length>(page+1)*perPage)rows.push({id:"mi:next",title:"Ver más opciones",description:"Siguiente página"});
  return listMessage(to,"Elegí un producto de Mi Gusto "+name+". Después elegís la cantidad.","Ver carta","Productos y precios",rows);
 }
 if(t==="quantity")return listMessage(to,
  "Elegiste "+text(result.name,100)+(result.price!=null?" ("+money(result.price)+" c/u)":"")+".\n¿Cuántas unidades querés? Elegí una opción o escribí otra cantidad del 1 al 50.",
  "Elegir cantidad","Cantidad",QUANTITIES.map(q=>({id:"mi:qty:"+q,title:q+(q===1?" unidad":" unidades")})));
 if(t==="invalid_quantity")return plain(to,"Ingresá una cantidad válida entre 1 y 50. Ejemplo: 6.");
 if(t==="ask_name")return plain(to,"¿A nombre de quién registramos el pedido? Escribí nombre y apellido.");
 if(t==="invalid_name")return plain(to,"Escribí un nombre de al menos dos letras para confirmar tu pedido.");
 if(t==="ask_notes")return buttons(to,"¿Querés agregar alguna observación? Por ejemplo: sin cebolla u horario de retiro. Escribila o tocá «Sin observaciones».",[{id:"mi:nonotes",title:"Sin observaciones"}]);
 if(t==="cart")return buttons(to,
  "Tu pedido hasta ahora:\n"+summary(result.cart)+"\n\nSubtotal: "+money(result.total)+
  (result.full===true?"\n(Máximo 8 productos distintos por pedido.)":"")+"\nPago: únicamente efectivo. ¿Cómo seguimos?",
  CART_BUTTONS);
 if(t==="review"){
  const head=custom?custom.review_text:"Confirmá tu pedido, "+text(result.name,90)+":";
  const notes=text(result.notes,300).trim();
  return buttons(to,
   head+"\n"+summary(result.cart)+"\n\nTotal: "+money(result.total)+"\nPAGO SOLO EN EFECTIVO"+
   "\nA nombre de: "+text(result.name,90)+(notes?"\nObservaciones: "+notes:"")+
   "\nAl confirmar, llega al local "+name+".",
   REVIEW_BUTTONS);
 }
 if(t==="confirmed")return plain(to,
  (custom?custom.confirmed_text:"✅ ¡Pedido confirmado! Mi Gusto "+name+" recibió tu pedido para control interno.")+
  (result.order_code?"\nN.º "+text(result.order_code,20):"")+
  "\nTotal: "+money(result.total)+"\nPago: efectivo.\nPara hacer otro pedido, escribí MENU.");
 return null;
}

// Configuración por secretos de la función (opcional) y por GESTLOK (Vault).
const config = () => ({
 enabled:env("MG_WA_ENABLED")==="true",
 secret:env("MG_WA_APP_SECRET"),
 verify:env("MG_WA_VERIFY_TOKEN"),
 appId:env("MG_WA_APP_ID"),
 url:env("SUPABASE_URL"),
 service:env("SUPABASE_SERVICE_ROLE_KEY"),
 anon:env("SUPABASE_ANON_KEY")||env("SUPABASE_PUBLISHABLE_KEY"),
 ids:{munro:env("MG_WA_PHONE_ID_MUNRO"),torcuato:env("MG_WA_PHONE_ID_TORCUATO")},
 tokens:{munro:env("MG_WA_TOKEN_MUNRO"),torcuato:env("MG_WA_TOKEN_TORCUATO")}
});
type Config = ReturnType<typeof config>;
// Nunca usar un número que no tenga ID Y token configurados.
function configured(c:Config,loc:Local):boolean{
 return Boolean(c.ids[loc]&&c.tokens[loc]);
}
// Números cargados por secretos: dos sucursales jamás comparten un Phone Number ID.
function envRoutesValid(c:Config):boolean{
 return !(configured(c,"munro")&&configured(c,"torcuato")&&c.ids.munro===c.ids.torcuato);
}
type ServerCfg = {secret:string;verify:string;appId:string};
let cached:{at:number;value:ServerCfg}|null=null;
async function serverConfig(c:Config,admin:ReturnType<typeof createClient>,fresh=false):Promise<ServerCfg>{
 if(!fresh&&cached&&Date.now()-cached.at<60000)return cached.value;
 const {data,error}=await admin.rpc("gestlok_mg_whatsapp_server_config");
 if(error)throw Error("No se pudo leer la configuración de WhatsApp");
 const d=(data||{}) as Json;
 const value={secret:c.secret||text(d.app_secret,200),verify:c.verify||text(d.verify_token,200),appId:c.appId||text(d.app_id,40)};
 cached={at:Date.now(),value};
 return value;
}
function json(status:number,body:Json,headers:Record<string,string>={}):Response{
 return new Response(JSON.stringify(body),{status,headers:{
  "Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store",...headers
 }});
}
function sameText(a:string,b:string):boolean{
 if(!a||!b||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
async function signed(req:Request,secret:string,bytes:Uint8Array):Promise<boolean>{
 const sig=req.headers.get("x-hub-signature-256")||"";
 if(!/^sha256=[a-f0-9]{64}$/i.test(sig))return false;
 const expected=new Uint8Array(32);
 for(let i=0;i<32;i++)expected[i]=parseInt(sig.slice(7+i*2,9+i*2),16);
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["verify"]);
 return await crypto.subtle.verify("HMAC",key,expected,bytes);
}
function parseMessage(m:Json):string|null {
 const type=text(m.type,30);
 if(type==="text")return text((m.text as Json|undefined)?.body,500);
 if(type==="interactive"){
  const content=m.interactive as Json|undefined;
  const b=(content?.button_reply||content?.list_reply) as Json|undefined;
  return b?text(b.id,500):null;
 }
 if(type==="button")return text((m.button as Json|undefined)?.payload,500);
 return null;
}
function graphBase():string{
 const version=env("MG_WA_GRAPH_VERSION")||"v25.0";
 if(!/^v\d{1,2}\.0$/.test(version))throw Error("Invalid Graph version");
 return "https://graph.facebook.com/"+version;
}
async function graph(method:"GET"|"POST",path:string,token:string,body?:Json):Promise<Json>{
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const res=await fetch(graphBase()+path,{
   method,signal:controller.signal,headers:{
    ...(token?{Authorization:"Bearer "+token}:{}),...(body?{"Content-Type":"application/json"}:{})
   },body:body?JSON.stringify(body):undefined
  });
  let data:Json={};
  try{data=await res.json() as Json;}catch{data={};}
  if(!res.ok){
   const e=(data.error||{}) as Json;
   // Solo código y mensaje de Meta: nunca tokens ni datos del cliente.
   throw Error("Meta API "+res.status+(e.code?" code "+text(e.code,10):"")+(e.message?": "+text(e.message,200):""));
  }
  return data;
 }finally{clearTimeout(timeout);}
}
async function send(route:Route,to:string,phoneId:string,payload:Json){
 await graph("POST","/"+phoneId+"/messages",route.token,payload);
}
async function resolveRoute(c:Config,admin:ReturnType<typeof createClient>,phoneId:string):Promise<Route|null>{
 if(!/^[0-9]{5,25}$/.test(phoneId))return null;
 const envLoc=(Object.keys(c.ids) as Local[]).find(k=>configured(c,k)&&c.ids[k]===phoneId);
 if(envLoc&&envRoutesValid(c))return {local:envLoc,token:c.tokens[envLoc],enabled:c.enabled};
 const {data,error}=await admin.rpc("gestlok_mg_whatsapp_route",{p_phone_number_id:phoneId});
 if(error)throw Error("No se pudo identificar la sucursal");
 const d=data as Json|null;
 if(!d||!isLocal(d.local)||!d.token)return null;
 return {local:d.local,token:text(d.token,2000),enabled:d.enabled===true};
}

// ---- Conexión desde GESTLOK (Embedded Signup de Meta, con coexistencia) ----
const ORIGINS=["https://gestlok.com.ar","https://www.gestlok.com.ar","https://mgstock-app.github.io"];
function cors(req:Request):Record<string,string>{
 const origin=req.headers.get("origin")||"";
 return ORIGINS.includes(origin)?{
  "Access-Control-Allow-Origin":origin,"Vary":"Origin",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-gestlok-action",
  "Access-Control-Max-Age":"600"
 }:{"Vary":"Origin"};
}
// Argentina: WhatsApp puede mostrar el 9 de celulares (+54 9 11 …). Se compara sin ese 9.
const phoneKey=(v:unknown)=>{const d=String(v??"").replace(/[^0-9]/g,"");return d.startsWith("549")?"54"+d.slice(3):d;};
async function handleConnect(req:Request,c:Config):Promise<Response>{
 const h=cors(req);
 if(!h["Access-Control-Allow-Origin"])return json(403,{ok:false,error:"Origen no permitido"},h);
 const auth=req.headers.get("authorization")||"";
 if(!/^Bearer [A-Za-z0-9._-]{20,}$/.test(auth))return json(401,{ok:false,error:"Iniciá sesión en GESTLOK"},h);
 if(!c.url||!c.service||!c.anon)return json(503,{ok:false,error:"Servidor sin configurar"},h);
 let body:Json;
 try{body=await req.json() as Json;}catch{return json(400,{ok:false,error:"Datos inválidos"},h);}
 const local=body.local,code=text(body.code,3000);
 const wabaId=text(body.waba_id,30);
 let phoneId=text(body.phone_number_id,30);
 if(!isLocal(local))return json(403,{ok:false,error:"Sucursal inválida"},h);
 if(code.length<10||!/^[A-Za-z0-9._#-]+$/.test(code))return json(400,{ok:false,error:"Meta no devolvió el código de autorización"},h);
 if(!/^[0-9]{5,25}$/.test(wabaId))return json(400,{ok:false,error:"Meta no devolvió la cuenta de WhatsApp. Repetí la conexión."},h);
 if(phoneId&&!/^[0-9]{5,25}$/.test(phoneId))return json(400,{ok:false,error:"Número de Meta inválido"},h);
 const user=createClient(c.url,c.anon,{global:{headers:{Authorization:auth}},auth:{autoRefreshToken:false,persistSession:false}});
 const allowed=await user.rpc("gestlok_mg_whatsapp_can_connect",{p_local:local});
 if(allowed.error||!(allowed.data as Json)?.ok)return json(403,{ok:false,error:"Solo el dueño o la administradora conectan WhatsApp"},h);
 const expected=text((allowed.data as Json).expected_number,20),userId=text((allowed.data as Json).user_id,40)||null;
 const admin=createClient(c.url,c.service,{auth:{autoRefreshToken:false,persistSession:false}});
 try{
  const cfg=await serverConfig(c,admin,true);
  if(!cfg.appId||!cfg.secret)return json(400,{ok:false,error:"Primero guardá el App ID y el App Secret de Meta"},h);
  const tok=await graph("GET","/oauth/access_token?client_id="+encodeURIComponent(cfg.appId)+
   "&client_secret="+encodeURIComponent(cfg.secret)+"&code="+encodeURIComponent(code),"");
  const token=text(tok.access_token,2000);
  if(token.length<20)throw Error("Meta no entregó el permiso de acceso");
  if(!phoneId){
   const list=await graph("GET","/"+wabaId+"/phone_numbers?fields=id,display_phone_number",token);
   const found=(Array.isArray(list.data)?list.data as Json[]:[]).find(p=>phoneKey(p.display_phone_number)===phoneKey(expected));
   phoneId=text(found?.id,30);
   if(!/^[0-9]{5,25}$/.test(phoneId))return json(409,{ok:false,error:"La cuenta conectada no tiene el número de "+locals[local]},h);
  }
  const info=await graph("GET","/"+phoneId+"?fields=display_phone_number,verified_name,is_on_biz_app,platform_type,code_verification_status",token);
  if(!expected||phoneKey(info.display_phone_number)!==phoneKey(expected))
   return json(409,{ok:false,error:"El número conectado ("+text(info.display_phone_number,30)+") no es el de "+locals[local]+". No se guardó nada."},h);
  await graph("POST","/"+wabaId+"/subscribed_apps",token,{});
  const sync:Json={};
  if(info.is_on_biz_app===true){
   // Coexistencia: Meta pide sincronizar dentro de las 24 h. No borra ni mueve chats del teléfono.
   for(const kind of ["smb_app_state_sync","history"]){
    try{await graph("POST","/"+phoneId+"/smb_app_data",token,{messaging_product:"whatsapp",sync_type:kind});sync[kind]="ok";}
    catch(e){sync[kind]=e instanceof Error?e.message.slice(0,200):"error";}
   }
  }
  const saved=await admin.rpc("gestlok_mg_whatsapp_connection_save",{
   p_local:local,p_waba_id:wabaId,p_phone_number_id:phoneId,
   p_display_phone:text(info.display_phone_number,40),p_verified_name:text(info.verified_name,200),
   p_is_on_biz_app:info.is_on_biz_app===true,p_platform_type:text(info.platform_type,40),
   p_token:token,p_user:userId,p_sync:sync
  });
  if(saved.error)throw Error("No se pudo guardar la conexión");
  return json(200,{ok:true,display_phone:text(info.display_phone_number,40),verified_name:text(info.verified_name,200),
   is_on_biz_app:info.is_on_biz_app===true,platform_type:text(info.platform_type,40),sync},h);
 }catch(e){
  console.error("Mi Gusto WhatsApp conexión:",e instanceof Error?e.message:"error");
  return json(502,{ok:false,error:e instanceof Error?e.message.slice(0,240):"No se pudo completar la conexión con Meta"},h);
 }
}

Deno.serve(async(req:Request)=>{
 const c=config();
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
 if(req.method==="POST"&&req.headers.get("x-gestlok-action")==="connect")return await handleConnect(req,c);
 if(!c.url||!c.service)return json(503,{ok:false,error:"Servidor sin configurar"});
 const admin=createClient(c.url,c.service,{auth:{autoRefreshToken:false,persistSession:false}});
 let cfg:ServerCfg;
 try{cfg=await serverConfig(c,admin);}catch{return json(503,{ok:false,error:"Configuración no disponible"});}
 // Meta verifica el webhook antes de activar el bot: solo devuelve el desafío si el token coincide.
 if(req.method==="GET"){
  if(!cfg.verify)return json(503,{ok:false,error:"Verificación de Meta sin configurar"});
  const url=new URL(req.url);
  const mode=url.searchParams.get("hub.mode"),token=url.searchParams.get("hub.verify_token")||"";
  const challenge=url.searchParams.get("hub.challenge")||"";
  if(mode!=="subscribe"||!sameText(token,cfg.verify)||!/^[0-9]{1,60}$/.test(challenge))
   return json(403,{ok:false,error:"Verificación no autorizada"});
  try{await admin.rpc("gestlok_mg_whatsapp_webhook_verified");}catch{/* el desafío igual se responde */}
  return new Response(challenge,{status:200,headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});
 }
 if(req.method!=="POST")return json(405,{ok:false,error:"Método inválido"});
 if(!cfg.secret)return json(503,{ok:false,error:"Falta el App Secret de Meta"});
 if(Number(req.headers.get("content-length")||0)>1024*1024)return json(413,{ok:false,error:"Body muy grande"});
 let raw:Uint8Array;
 try{
  raw=new Uint8Array(await req.arrayBuffer());
  if(raw.byteLength>1024*1024)return json(413,{ok:false,error:"Body muy grande"});
 }catch{return json(400,{ok:false,error:"Body inválido"});}
 if(!await signed(req,cfg.secret,raw))return json(403,{ok:false,error:"Firma Meta inválida"});
 let payload:Json;
 try{payload=JSON.parse(new TextDecoder().decode(raw));}
 catch{return json(400,{ok:false,error:"JSON inválido"});}
 if(payload.object!=="whatsapp_business_account")return json(200,{ok:true,ignored:true});
 const entries=Array.isArray(payload.entry)?payload.entry as Json[]:[];
 let processed=0;
 try{
  for(const e of entries.slice(0,10)){
   for(const change of (Array.isArray(e.changes)?e.changes as Json[]:[]).slice(0,10)){
    // history, smb_app_state_sync, smb_message_echoes y account_update se aceptan sin procesar.
    if(change.field!=="messages")continue;
    const value=change.value as Json|undefined;
    const phoneId=text((value?.metadata as Json|undefined)?.phone_number_id,80);
    const route=await resolveRoute(c,admin,phoneId);
    // Bot apagado: el local atiende desde la app del teléfono. No se acumulan reintentos de Meta.
    if(!route||!route.enabled||!route.token)continue;
    const loc=route.local;
    for(const m of (Array.isArray(value?.messages)?value?.messages as Json[]:[]).slice(0,15)){
     const id=text(m.id,250),from=text(m.from,20),cmd=parseMessage(m);
     if(!/^[0-9]{8,15}$/.test(from)||id.length<5||!cmd)continue;
     const contacts=Array.isArray(value?.contacts)?value.contacts as Json[]:[];
     const contact=contacts.find(x=>x.wa_id===from);
     const profile=text((contact?.profile as Json|undefined)?.name,100);
     const turn=await admin.rpc("gestlok_mg_whatsapp_turn",{
      p_local:loc,p_sender:from,p_message_id:id,p_text:cmd,p_profile_name:profile
     });
     if(turn.error)throw Error("WhatsApp conversation transaction failed");
     const result=turn.data as Json;
     if(result?.sent===true)continue;
     const reply=answer(from,loc,result);
     if(reply)await send(route,from,phoneId,reply);
     const sent=await admin.rpc("gestlok_mg_whatsapp_sent",{p_local:loc,p_message_id:id});
     if(sent.error||sent.data!==true)throw Error("Could not mark WhatsApp response");
     processed++;
    }
   }
  }
  return json(200,{ok:true,processed});
 }catch(e){
  // Meta reintenta eventos; el pedido ya guardado es idempotente por mensaje.
  console.error("Mi Gusto WhatsApp webhook:",e instanceof Error?e.message:"error");
  return json(503,{ok:false,error:"Procesamiento temporalmente no disponible"});
 }
});
