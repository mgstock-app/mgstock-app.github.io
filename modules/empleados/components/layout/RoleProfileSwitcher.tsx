"use client";
import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronDown, LockKeyhole, RefreshCcw, UserRound, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { rpc } from "@/features/access/api";
import "./role-profile-switcher.css";
type Context = {
 tenant_id:string;company_name:string;role:string;
 local_ids:string[];local_names:{id:string;name:string}[];active:boolean;
};
const roles:Record<string,string>={dueno:"Dueño/a",gerente:"Gerente",creadora:"Administración",
  colaborador:"Colaborador/a",lectura:"Colaborador/a"};
type OfflineBridge={pending?:()=>Promise<number>;invalidateContext?:()=>Promise<void>};
export function RoleProfileSwitcher(){
 const {user} = useAuth();
 const [open,setOpen]=useState(false);
 const [items,setItems]=useState<Context[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [loaded,setLoaded]=useState(false);
 const online=()=>typeof navigator!=="undefined"&&navigator.onLine;
 const load=useCallback(async()=>{
   if(!user||!online()) {setError("Conectate a internet para consultar tus empresas.");return;}
   setBusy(true);setError("");
   try{
     const result=await rpc<Context[]>("gestlok_my_role_contexts");
     setItems(Array.isArray(result)?result.filter(x=>x && x.tenant_id && x.company_name):[]);
     setLoaded(true);
   }catch{setError("No se pudieron consultar tus roles autorizados.");}
   finally{setBusy(false);}
 },[user]);
 useEffect(()=>{
   if(!open || loaded)return;
   let active=true;
   queueMicrotask(()=>{if(active)void load();});
   return ()=>{active=false;};
 },[open,loaded,load]);
 if(!user||user.status!=="approved")return null;
 const bridge=()=> (window as unknown as {GestLokOffline?:OfflineBridge}).GestLokOffline;
 const switchTo=async(item:Context,localId="")=>{
   if(busy||(item.active&&!localId))return;
   if(!online()){setError("Cambiar de empresa requiere conexión.");return;}
   setBusy(true);setError("");
   try{
     const unsent=await bridge()?.pending?.()||0;
     if(unsent)throw new Error("Tenés cambios pendientes de sincronizar. Guardalos antes de cambiar de empresa.");
     if(!item.active){
       const accepted=await rpc<{tenant_id:string}>("gestlok_choose_role_context",{p_tenant:item.tenant_id});
       if(accepted.tenant_id!==item.tenant_id)throw new Error("La selección no fue confirmada.");
       await bridge()?.invalidateContext?.();
     }
     if(localId){
       const known=(item.local_names||[]).some(l=>l.id===localId);
       if(!known)throw new Error("Ese local no está disponible en tu perfil.");
       try{sessionStorage.setItem("gestlok:profile-next-local",
         JSON.stringify({email:String(user?.email||"").toLowerCase(),tenant_id:item.tenant_id,local_id:localId}));}
       catch{}
     }
     window.location.assign(process.env.NEXT_PUBLIC_GESTLOK_HOME||"/");
   }catch(e){setError(e instanceof Error?e.message:"No se pudo cambiar de empresa.");setBusy(false);}
 };
 return <>
   <button type="button" className="module-profile-button" aria-expanded={open}
      aria-label="Abrir mi perfil y cambiar empresa o rol" onClick={()=>setOpen(true)}>
      <UserRound size={18}/><span>Mi perfil</span><ChevronDown size={14}/>
   </button>
   {open&&<div className="module-profile-overlay">
     <button type="button" className="module-profile-backdrop" aria-label="Cerrar selección de perfil" onClick={()=>setOpen(false)}/>
     <section role="dialog" aria-modal="true" aria-label="Perfil, empresas y roles"
       className="module-profile-dialog">
       <header><div><small>GESTLOK · MI PERFIL</small><h2>Empresas y roles</h2>
         <p>{user.display_name||"Mi cuenta"}</p></div>
         <button type="button" onClick={()=>setOpen(false)} aria-label="Cerrar perfil"><X size={20}/></button>
       </header>
       <p className="module-profile-description">Usá la misma cuenta para trabajar en distintas empresas y locales. Solo se muestran roles que ya tenés autorizados.</p>
       <div className="module-profile-items">
         {items.map(c=><div key={c.tenant_id} className="module-profile-group">
           <button type="button" className="module-profile-context"
             disabled={busy||c.active} aria-current={c.active?"true":undefined}
             onClick={()=>void switchTo(c)}>
               <Building2 size={20}/><span><strong>{c.company_name}</strong>
                 <small>{roles[c.role]||c.role}</small></span>
               <em>{c.active?"Actual":"Elegir"}</em>
           </button>
           {Array.isArray(c.local_names)&&c.local_names.length>0&&<div className="module-profile-locals">
             {c.local_names.map(l=><button type="button" key={l.id} disabled={busy}
               onClick={()=>void switchTo(c,l.id)}>Abrir {l.name==="Torcuato"?"Don Torcuato":l.name}</button>)}
           </div>}
         </div>)}
       </div>
       {busy&&<p role="status">Comprobando permisos…</p>}
       {!busy&&loaded&&items.length===0&&<p className="module-profile-no-switch">Tu acceso actual: {user.role||"Gerente"}. No hay otras empresas habilitadas para cambiar desde este perfil.</p>}
       {error&&<p role="alert" className="module-profile-error">{error}</p>}
       <p className="module-profile-security"><LockKeyhole size={15}/> Cambiar de empresa nunca agrega permisos ni habilita recibos de otros colaboradores.</p>
       <button type="button" className="module-profile-refresh" onClick={()=>void load()} disabled={busy}><RefreshCcw size={16}/> Actualizar mis empresas</button>
     </section>
   </div>}
 </>;
}
