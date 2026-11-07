/* Mi Gusto · WhatsApp Cloud API webhook.
 * NO emite ni recibe mensajes comerciales sin habilitación explícita de Meta.
 * Webhook firmado con app secret, cada Phone Number ID apunta a un único local.
 * El bot no modifica Caja, stock, Pagos Online ni envía cobros.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

type Json = Record<string, unknown>;
const env = (k:string) => Deno.env.get(k) || "";
const locals = {munro:"Munro",torcuato:"Don Torcuato"} as const;
type Local = keyof typeof locals;
const money = (v:unknown) => new Intl.NumberFormat("es-AR",{
  style:"currency",currency:"ARS",maximumFractionDigits:2
}).format(Number(v)||0);
const text = (v:unknown,max=500) => String(v ?? "").slice(0,max);
const plain = (to:string,body:string) => ({messaging_product:"whatsapp",to,type:"text",text:{preview_url:false,body:body.slice(0,3900)}});
const buttons = (to:string,body:string,choices:{id:string,title:string}[]) => ({
 messaging_product:"whatsapp",to,type:"interactive",interactive:{
  type:"button",body:{text:body.slice(0,1000)},action:{
   buttons:choices.map(v=>({type:"reply",reply:{id:v.id,title:v.title.slice(0,20)}}))
  }
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
function summary(rows:unknown):string{
 const a=Array.isArray(rows)?rows.slice(0,25):[];
 return a.map(p=>{
  const item=p as Json;
  return text(item.quantity,3)+" × "+text(item.name,90)+" · "+money(Number(item.quantity)*Number(item.price));
 }).join("\n");
}
function answer(to:string,local:Local,result:Json):Json|null {
 const t=text(result.type,25),name=locals[local],cat=Array.isArray(result.catalog)?result.catalog as Json[]:[];
 if(t==="silent")return null;
 if(t==="welcome")return buttons(to,"¡Hola! 👋 Bienvenido/a a Mi Gusto "+name+". ¿En qué podemos ayudarte?",START);
 if(t==="human")return plain(to,"¡Perfecto! Alguien de Mi Gusto "+name+" va a continuar con tu consulta. Para volver al menú, escribí MENU.");
 if(t==="empty")return plain(to,"Todavía no tenemos la carta automática habilitada en Mi Gusto "+name+". Te va a atender alguien del local. Escribí MENU para volver al inicio.");
 if(t==="prices"){
  const list=cat.slice(0,35).map(x=>"• "+text(x.name,90)+": "+money(x.price)).join("\n");
  return plain(to, list ? "Carta de Mi Gusto "+name+":\n"+list+"\n\nPara hacer un pedido, escribí MENU. Para promociones, consultá al local." : "La carta de precios está pendiente de cargar. Un asesor puede ayudarte. Escribí MENU para volver.");
 }
 if(t==="catalog"){
  const page=Math.max(0,Math.min(20,Number(result.page)||0)),perPage=9;
  const slice=cat.slice(page*perPage,page*perPage+perPage);
  if(!slice.length)return plain(to,"No tenemos productos disponibles para cargar pedidos. Un asesor te puede ayudar.");
  const rows=slice.map(x=>({
    id:"mi:product:"+text(x.id,40),
    title:text(x.name,24),description:money(x.price).slice(0,72)
  }));
  if(cat.length>(page+1)*perPage)rows.push({id:"mi:next",title:"Ver más opciones",description:"Siguiente página"});
  return {
   messaging_product:"whatsapp",to,type:"interactive",interactive:{
    type:"list",body:{text:"Elegí un producto de Mi Gusto "+name+". Después indicás la cantidad."},
    action:{button:"Ver carta",sections:[{title:"Productos y precios",rows}]}
   }
  };
 }
 if(t==="quantity")return plain(to,"Elegiste "+text(result.name,100)+". ¿Cuántas unidades querés? Respondé con un número del 1 al 50.");
 if(t==="invalid_quantity")return plain(to,"Ingresá una cantidad válida entre 1 y 50. Ejemplo: 6.");
 if(t==="ask_name")return plain(to,"¿A nombre de quién registramos el pedido? Escribí nombre y apellido.");
 if(t==="invalid_name")return plain(to,"Escribí un nombre de al menos dos letras para confirmar tu pedido.");
 if(t==="cart")return buttons(to,
  "Tu pedido hasta ahora:\n"+summary(result.cart)+"\n\nSubtotal: "+money(result.total)+"\nPago: únicamente efectivo. ¿Cómo seguimos?",
  CART_BUTTONS);
 if(t==="review")return buttons(to,
  "Confirmá tu pedido, "+text(result.name,90)+":\n"+summary(result.cart)+
  "\n\nTotal: "+money(result.total)+"\nForma de pago: efectivo. Al confirmar, llega al local "+name+".",
  REVIEW_BUTTONS);
 if(t==="confirmed")return plain(to,
  "✅ ¡Pedido confirmado! Mi Gusto "+name+" recibió tu pedido para control interno.\nTotal: "+money(result.total)+"\nPago: efectivo.\nPara comenzar otro pedido, escribí MENU.");
 return null;
}

const config = () => ({
 enabled:env("MG_WA_ENABLED")==="true",
 secret:env("MG_WA_APP_SECRET"),
 verify:env("MG_WA_VERIFY_TOKEN"),
 url:env("SUPABASE_URL"),
 service:env("SUPABASE_SERVICE_ROLE_KEY"),
 ids:{munro:env("MG_WA_PHONE_ID_MUNRO"),torcuato:env("MG_WA_PHONE_ID_TORCUATO")},
 tokens:{munro:env("MG_WA_TOKEN_MUNRO"),torcuato:env("MG_WA_TOKEN_TORCUATO")}
});
// Permitir activar una sola sucursal (primero Munro) sin exigir las credenciales
// de Don Torcuato. Nunca usar un número que no tenga ID Y token configurados.
function configured(c:ReturnType<typeof config>,loc:Local):boolean{
 return Boolean(c.ids[loc]&&c.tokens[loc]);
}
function ready(c:ReturnType<typeof config>):boolean{
 const munro=configured(c,"munro"),torcuato=configured(c,"torcuato");
 return c.enabled&&Boolean(c.secret&&c.verify&&c.url&&c.service)&&
  (munro||torcuato)&&(!munro||!torcuato||c.ids.munro!==c.ids.torcuato);
}
function json(status:number,body:Json):Response{
 return new Response(JSON.stringify(body),{status,headers:{
  "Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store"
 }});
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
async function send(c:ReturnType<typeof config>,loc:Local,to:string,phoneId:string,payload:Json){
 const version=env("MG_WA_GRAPH_VERSION")||"v27.0";
 if(!/^v\d{1,2}\.0$/.test(version))throw Error("Invalid Graph version");
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const res=await fetch("https://graph.facebook.com/"+version+"/"+phoneId+"/messages",{
   method:"POST",signal:controller.signal,headers:{
    Authorization:"Bearer "+c.tokens[loc],"Content-Type":"application/json"
   },body:JSON.stringify(payload)
  });
  if(!res.ok)throw Error("Meta API status "+res.status);
 }finally{clearTimeout(timeout);}
}
Deno.serve(async(req:Request)=>{
 const c=config();
 if(!ready(c))return json(503,{ok:false,error:"Integración sin habilitar"});
 if(req.method==="GET"){
  const url=new URL(req.url);
  const mode=url.searchParams.get("hub.mode"),token=url.searchParams.get("hub.verify_token");
  const challenge=url.searchParams.get("hub.challenge")||"";
  if(mode!=="subscribe"||token!==c.verify||!/^[0-9]{1,60}$/.test(challenge))
   return json(403,{ok:false,error:"Verificación no autorizada"});
  return new Response(challenge,{status:200,headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});
 }
 if(req.method!=="POST")return json(405,{ok:false,error:"Método inválido"});
 if(Number(req.headers.get("content-length")||0)>1024*1024)return json(413,{ok:false,error:"Body muy grande"});
 let raw:Uint8Array;
 try{
  raw=new Uint8Array(await req.arrayBuffer());
  if(raw.byteLength>1024*1024)return json(413,{ok:false,error:"Body muy grande"});
 }catch{return json(400,{ok:false,error:"Body inválido"});}
 if(!await signed(req,c.secret,raw))return json(403,{ok:false,error:"Firma Meta inválida"});
 let payload:Json;
 try{payload=JSON.parse(new TextDecoder().decode(raw));}
 catch{return json(400,{ok:false,error:"JSON inválido"});}
 if(payload.object!=="whatsapp_business_account")return json(200,{ok:true,ignored:true});
 const admin=createClient(c.url,c.service,{auth:{autoRefreshToken:false,persistSession:false}});
 const entries=Array.isArray(payload.entry)?payload.entry as Json[]:[];
 let processed=0;
 try{
  for(const e of entries.slice(0,10)){
   for(const change of (Array.isArray(e.changes)?e.changes as Json[]:[]).slice(0,10)){
    if(change.field!=="messages")continue;
    const value=change.value as Json|undefined;
    const phoneId=text((value?.metadata as Json|undefined)?.phone_number_id,80);
    const loc=(Object.keys(c.ids) as Local[]).find(k=>configured(c,k)&&c.ids[k]===phoneId);
    if(!loc)continue;
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
     if(reply)await send(c,loc,from,phoneId,reply);
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
