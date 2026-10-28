"use client";
import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, RefreshCcw, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { rpc } from "@/features/access/api";
import { loadLegajoLocals } from "@/features/legajos/api";
import type { AppLocal, ReportAccess } from "@/types/access";
import { PrivateReceiptDetail, type PrivateReceiptPayload } from "./PrivateReceiptDetail";
import "./manager-personal-receipt.css";

/** Un gerente puede administrar empleados, pero el recibo propio NUNCA sale
 * de la nómina visible: solo de un RPC que revalida auth.uid() + empresa
 * activa + local aprobado + publicación del dueño.
 */
export function ManagerPersonalReceipt() {
  const {user} = useAuth();
  const [locals,setLocals] = useState<AppLocal[]>([]);
  const [local,setLocal] = useState("");
  const [state,setState] = useState<ReportAccess | null>(null);
  const [detail,setDetail] = useState<PrivateReceiptPayload | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [refreshIndex,setRefreshIndex] = useState(0);
  const reload = useCallback(()=>setRefreshIndex(n=>n+1),[]);
  const allowedIds = user?.gestlok_gerente?.local_ids || [];
  const scopeKey = allowedIds.join("|");
  useEffect(()=>{
    let alive=true;
    if(!scopeKey) { queueMicrotask(()=>setLoading(false));return; }
    loadLegajoLocals().then(value=>{
      if(!alive)return;
      const authorized=new Set(allowedIds);
      const available=value.filter(l=>authorized.has(l.id));
      setLocals(available);
      setLocal(old=>available.some(l=>l.id===old)?old:available[0]?.id||"");
      if(!available.length) {
        setLoading(false);
        setError("No hay locales con recibos personales habilitados en este contexto.");
      }
    }).catch(()=>{
      if(alive) {setLocals([]);setLoading(false);setError("No pudimos verificar los locales autorizados.");}
    });
    return ()=>{alive=false;};
  // La lista solo depende de los locales aprobados en el backend.
  },[scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(!local)return;
    let alive=true;
    const check=async()=>{
      try{
        const access=await rpc<ReportAccess>("rm_app_manager_personal_receipt_status",{p_local:local});
        if(!alive)return;
        setState(access);
        if(access.status!=="active") {setDetail(null);setError("");return;}
        const receipt=await rpc<PrivateReceiptPayload>("rm_app_manager_personal_receipt_detail",{p_local:local});
        if(!alive)return;
        if(!receipt?.sheet)throw new Error("Recibo sin datos.");
        setDetail(receipt);setError("");
      }catch(cause){
        if(alive){setState(null);setDetail(null);
          setError(cause instanceof Error ? cause.message : "No pudimos consultar tu recibo privado.");}
      }finally{if(alive)setLoading(false);}
    };
    queueMicrotask(()=>void check());
    const timer=window.setInterval(()=>{if(!document.hidden)void check();},15000);
    const visible=()=>{if(document.hidden)setDetail(null);else void check();};
    document.addEventListener("visibilitychange",visible);
    return()=>{alive=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[local,refreshIndex]);
  return <section className="manager-personal-receipt" aria-label="Mi recibo personal de gerente">
    <header><span className="manager-personal-receipt__icon"><Wallet size={23}/></span>
      <div><small>GESTLOK · ACCESO INDIVIDUAL</small><h1>Mi recibo personal</h1><p>Solo lectura. Liquidación publicada por el dueño.</p></div>
    </header>
    <div className="manager-personal-receipt__controls">
      <label htmlFor="manager-my-receipt-local">Local de mi recibo</label>
      {locals.length>1 ? <select id="manager-my-receipt-local" value={local}
        onChange={event=>{setLoading(true);setDetail(null);setLocal(event.target.value);}}>
          {locals.map(l=><option key={l.id} value={l.id}>{l.name==="Torcuato"?"Don Torcuato":l.name}</option>)}
        </select> : <strong>{locals[0]?.name || "Local autorizado"}</strong>}
      <button type="button" onClick={reload} aria-label="Actualizar mi recibo"
        disabled={loading}><RefreshCcw size={16}/> Actualizar</button>
    </div>
    {loading&&<p role="status">Comprobando tu recibo privado…</p>}
    {!loading && error && <p role="alert" className="manager-personal-receipt__error">{error}</p>}
    {!loading && !error && state?.status==="unavailable" &&
      <p className="manager-personal-receipt__empty">El dueño todavía no publicó tu recibo en este local. Cuando lo publique, aparecerá acá con el detalle de horas o turnos y el total a cobrar.</p>}
    {detail && <PrivateReceiptDetail receipt={detail}/>}
    <p className="manager-personal-receipt__privacy"><LockKeyhole size={15}/>
      Este es únicamente tu recibo personal. No podés editarlo ni acceder a los recibos de otros colaboradores desde esta pantalla.
    </p>
  </section>;
}
