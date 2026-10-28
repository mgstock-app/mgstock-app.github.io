"use client";
import { useMemo, useState } from "react";
import { Check, ClipboardCopy, ExternalLink, Link2, MessageCircle, ShieldCheck, UserRoundPlus, X } from "lucide-react";
import type { AppLocal } from "@/types/access";
import { managerStaffInviteApi } from "@/features/onboarding/api";
import { managerStaffInviteUrl, staffInviteMessage } from "@/utils/manager-staff-invite";
import "./manager-staff-invite.css";

type NewInvite = Awaited<ReturnType<typeof managerStaffInviteApi.create>>;
export function ManagerStaffInvite({
  locals, initialLocal, onClose,
}: {locals: AppLocal[]; initialLocal?:string;onClose:()=>void}) {
  const [localId, setLocalId] = useState(initialLocal || locals[0]?.id || "");
  const [invite, setInvite] = useState<NewInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const selectedLocal = locals.find(l=>l.id===localId);
  const link = useMemo(()=>{
    if (!invite || typeof window==="undefined") return "";
    try {return managerStaffInviteUrl(window.location.origin,
      process.env.NEXT_PUBLIC_MODULE_BASE || "/empleados",invite.token);}
    catch {return "";}
  },[invite]);
  const whatsapp = link && selectedLocal
    ? "https://wa.me/?text=" + encodeURIComponent(staffInviteMessage(selectedLocal.name,link))
    : "";
  const generate = async () => {
    if (!selectedLocal || busy) return;
    setBusy(true); setMessage(""); setInvite(null); setCopied(false);
    try {
      const result = await managerStaffInviteApi.create(selectedLocal.id);
      if (result.local_id !== selectedLocal.id) throw new Error("El servidor devolvió un local diferente.");
      setInvite(result);
    } catch(cause) {setMessage(cause instanceof Error ? cause.message : "No se pudo crear la invitación.");}
    finally {setBusy(false);}
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true); setMessage("Enlace copiado. Enviáselo solamente al colaborador indicado.");
    } catch {setMessage("Seleccioná el enlace para copiarlo manualmente.");}
  };
  return <div className="msi-overlay" role="presentation">
    <section className="msi-dialog" role="dialog" aria-modal="true" aria-label="Invitar colaborador">
      <header className="msi-header">
        <div><small>GESTLOK · ADMINISTRACIÓN DE EMPLEADOS</small><h2><UserRoundPlus size={23}/> Invitar Colaborador</h2></div>
        <button type="button" onClick={onClose} aria-label="Cerrar invitación" disabled={busy}><X size={21}/></button>
      </header>
      <p className="msi-description">Compartí un enlace privado por WhatsApp. La persona ingresa con Google y queda asignada automáticamente como <strong>colaborador</strong> al local seleccionado, sin esperar aprobación.</p>
      <div className="msi-field">
        <label htmlFor="msi-local">Local que recibirá al colaborador</label>
        {locals.length>1 ? <select id="msi-local" value={localId} disabled={busy||!!invite}
          onChange={event=>setLocalId(event.target.value)}>
          {locals.map(local=><option key={local.id} value={local.id}>{local.name==="Torcuato"?"Don Torcuato":local.name}</option>)}
        </select> : <strong className="msi-readonly">{selectedLocal?.name==="Torcuato"?"Don Torcuato":selectedLocal?.name || "Sin local habilitado"}</strong>}
      </div>
      {!invite && <button type="button" className="msi-generate" onClick={()=>void generate()}
        disabled={busy||!selectedLocal}><Link2 size={18}/>{busy?"Generando…":"Generar enlace de invitación"}</button>}
      {invite && <div className="msi-generated">
        <div className="msi-success"><Check size={18}/><strong>¡Enlace creado para {selectedLocal?.name}!</strong></div>
        <label htmlFor="msi-url">Enlace privado de invitación</label>
        <input id="msi-url" type="text" value={link} readOnly onFocus={event=>event.target.select()}/>
        <div className="msi-actions">
          <button type="button" onClick={()=>void copy()}><ClipboardCopy size={17}/>{copied?"Copiado":"Copiar enlace"}</button>
          {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer"
            className="msi-whatsapp"><MessageCircle size={18}/> Compartir por WhatsApp <ExternalLink size={14}/></a>}
        </div>
        <p className="msi-expiration">El enlace es <strong>individual y de un solo uso</strong>. Vence el {new Date(invite.expires_at).toLocaleDateString("es-AR")}. Si necesitás invitar a otra persona, generá un enlace nuevo.</p>
        <button type="button" className="msi-another" onClick={()=>{setInvite(null);setCopied(false);setMessage("");}}>Generar otra invitación</button>
      </div>}
      <p className="msi-security"><ShieldCheck size={16}/> Después del registro se creará automáticamente un legajo pendiente de completar. No se habilita el rol de gerente ni se muestran recibos de otros colaboradores.</p>
      {message && <p role="status" className="msi-feedback">{message}</p>}
    </section>
  </div>;
}
