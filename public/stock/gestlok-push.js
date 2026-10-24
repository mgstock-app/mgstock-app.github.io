/* GestLok · Opt-in Web Push. No notification permission is requested on page load. */
(() => {
 'use strict';
 const endpoint="https://vgsepaaewbctjsjcpeta.supabase.co/functions/v1/gestlok-push";
 let publicKey="",initialized=false,inflight=false,enabled=false,issue="";
 let updateUI=()=>{};
 const supported=()=>typeof Notification!=="undefined" && "serviceWorker" in navigator && "PushManager" in window;
 const getSession=async()=>{
   const result=await window.GestLokSession?.();
   return result?.data?.session || null;
 };
 async function request(op,body={}){
   const session=await getSession();
   if(!session?.access_token)throw Error("Primero iniciá sesión.");
   const res=await fetch(endpoint,{
    method:"POST",mode:"cors",headers:{
     "Content-Type":"application/json",
     "Authorization":"Bearer "+session.access_token,
     "apikey":window.SPM_CONFIG?.key || ""
    },
    body:JSON.stringify({op,...body})
   });
   let json;try{json=await res.json();}catch{json={};}
   if(!res.ok || !json.ok)throw Error(json.error || "No se pudo conectar el servicio de avisos.");
   return json;
 }
 const keyBytes=key=>{
   const base64=key.replace(/-/g,"+").replace(/_/g,"/");
   const bytes=atob(base64.padEnd(Math.ceil(base64.length/4)*4,"="));
   return Uint8Array.from(bytes,c=>c.charCodeAt(0));
 };
 const state=()=>({
  supported:supported(),
  ready:!!publicKey,
  enabled,
  issue,
  permission:supported()?Notification.permission:"unsupported"
 });
 const announce=()=>{updateUI();};
 async function init(onChange){
   if(typeof onChange==="function")updateUI=onChange;
   if(initialized || !supported())return;
   initialized=true;
   try{
     const conf=await request("config");
     if(!conf.publicKey)throw Error("Clave pública no configurada");
     publicKey=conf.publicKey;
     const reg=await navigator.serviceWorker.ready;
     const sub=await reg.pushManager.getSubscription();
     enabled=!!sub && Notification.permission==="granted";
     issue="";
   }catch(e){issue=e?.message || "No hay conexión con las notificaciones.";}
   announce();
 }
 async function enable(){
   if(inflight || !supported())return;
   if(!publicKey){issue="Todavía no se configuró el servicio. Volvé a ingresar.";announce();return;}
   inflight=true;
   try{
     // Explicit tap only. The browser OS displays its own permission dialog.
     const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
     if(permission!=="granted"){issue="No autorizaste las notificaciones en este dispositivo.";return;}
     const reg=await navigator.serviceWorker.ready;
     const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});
     try{await request("subscribe",{subscription:sub.toJSON()});}
     catch(e){await sub.unsubscribe();throw e;}
     enabled=true;issue="";
   }catch(e){issue=e?.message || "No se pudieron activar los avisos.";enabled=false;}
   finally{inflight=false;announce();}
 }
 async function disable(){
   if(inflight || !supported())return;
   inflight=true;
   try {
     const reg=await navigator.serviceWorker.ready;
     const sub=await reg.pushManager.getSubscription();
     if(sub){
       try{await request("unsubscribe",{endpoint:sub.endpoint});}
       finally{await sub.unsubscribe();}
     }
     enabled=false;issue="";
   }catch(e){issue=e?.message || "No pudimos actualizar el permiso.";enabled=false;}
   finally{inflight=false;announce();}
 }
 window.GestLokPush={init,enable,disable,state};
})();