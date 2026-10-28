"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LockKeyhole, UserRoundCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { managerStaffInviteApi } from "@/features/onboarding/api";
import { validManagerStaffInvite } from "@/utils/manager-staff-invite";
import "./join-staff-invitation.css";

export function JoinStaffInvitation({token}:{token:string}) {
  const {user,loading,refresh} = useAuth();
  const router = useRouter();
  const [state,setState] = useState<"checking"|"success"|"error">("checking");
  const [message,setMessage] = useState("");
  const [localName,setLocalName] = useState("");
  const [attempt,setAttempt] = useState(0);
  const tried = useRef("");
  useEffect(()=>{
    if (loading || !user || !validManagerStaffInvite(token)) return;
    const key = token + ":" + user.user_id + ":" + attempt;
    if (tried.current === key) return;
    tried.current = key;
    let active = true;
    queueMicrotask(()=>{
      if (active) {setState("checking");setMessage("");}
    });
    (async()=>{
      try {
        const preview = await managerStaffInviteApi.preview(token);
        if (!active) return;
        setLocalName(preview.local_name);
        const result = await managerStaffInviteApi.accept(token);
        if (!active) return;
        if (!result.joined) throw new Error("No pudimos completar tu incorporación.");
        setState("success");
        try {
          sessionStorage.removeItem("recibonet_staff_invitation");
          sessionStorage.removeItem("recibonet_return_to");
        } catch {}
        await refresh();
        if (active) router.replace("/");
      } catch (cause) {
        if (active) {
          setState("error");
          setMessage(cause instanceof Error ? cause.message : "No se pudo completar la invitación.");
        }
      }
    })();
    return ()=>{active=false;};
  },[token,user?.user_id,loading,attempt,refresh,router]);
  if (!validManagerStaffInvite(token)) return <section className="jsi-card" role="alert"><h1>Enlace inválido</h1><p>Pedile a tu gerente una invitación nueva.</p></section>;
  if (loading) return <div className="jsi-card" role="status">Comprobando tu acceso…</div>;
  if (!user) return <div className="jsi-join">
    <section className="jsi-card">
      <span className="jsi-eyebrow">GESTLOK · INVITACIÓN PERSONAL</span>
      <h1>¡Te invitaron a un equipo!</h1>
      <p>Ingresá con tu cuenta de Google. Cuando se verifique tu identidad, GESTLOK te registrará automáticamente como <strong>colaborador</strong> del local indicado en la invitación.</p>
      <p>Vas a poder consultar tu recibo personal cuando el dueño lo publique y el Google Sheets asignado en modo de lectura. No necesitás esperar una aprobación manual.</p>
      <p className="jsi-security"><LockKeyhole size={16}/> Este enlace es individual y se utiliza una sola vez.</p>
    </section>
    <GoogleSignIn returnTo="/unirse"/>
  </div>;
  return <section className="jsi-card">
    <span className="jsi-eyebrow">GESTLOK · INVITACIÓN DE COLABORADOR</span>
    <h1>{state==="success"?"¡Ya formás parte del equipo!":"Incorporación automática"}</h1>
    {state==="checking"&&<p role="status">Verificando tu invitación y asignando el local de forma segura…</p>}
    {state==="success"&&<p role="status" className="jsi-success"><CheckCircle2 size={20}/> Tu cuenta ya tiene el rol de colaborador{localName ? " en " + localName : ""}. El gerente podrá completar tu legajo.</p>}
    {state==="error"&&<><p role="alert">{message}</p>
      <button type="button" className="jsi-retry" onClick={()=>setAttempt(n=>n+1)}>Reintentar incorporación</button>
    </>}
    <p className="jsi-security"><UserRoundCheck size={16}/> El enlace nunca permite obtener permisos de dueño o gerente.</p>
  </section>;
}
