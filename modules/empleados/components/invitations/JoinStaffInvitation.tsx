"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LockKeyhole, UserRoundCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { createClient } from "@/lib/supabase/browser";
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
  const [changingAccount,setChangingAccount] = useState(false);
  const alreadyAssigned = message.startsWith("Esta cuenta de Google ya tiene un rol asignado");
  const changeAccount = async () => {
    setChangingAccount(true);
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      // Conservar el vínculo individual para que el usuario elija su propia cuenta.
      router.replace("/unirse/?invitacion=" + encodeURIComponent(token));
      router.refresh();
    } catch {
      setMessage("No se pudo cerrar esta sesión. Salí de GESTLOK y volvé a abrir la invitación con tu cuenta personal.");
    } finally { setChangingAccount(false); }
  };
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
  const valid = validManagerStaffInvite(token);
  return (
    <main className="jsi-page" aria-label="Acceso de colaboradores">
      <section className="jsi-card" aria-labelledby="jsi-title">
        <div className="jsi-card-top">
          <span className="jsi-icon" aria-hidden="true"><UserRoundCheck size={25} strokeWidth={1.8}/></span>
          <span className="jsi-eyebrow">GESTLOK · COLABORADORES</span>
        </div>
        {!valid ? (
          <>
            <h1 id="jsi-title">Enlace no válido</h1>
            <p className="jsi-lead">Solicitá una nueva invitación al responsable de tu local.</p>
          </>
        ) : loading ? (
          <>
            <h1 id="jsi-title">Verificando tu acceso</h1>
            <p className="jsi-lead" role="status">Estamos comprobando tu sesión de forma segura…</p>
          </>
        ) : !user ? (
          <>
            <h1 id="jsi-title">Accedé a tu equipo</h1>
            <p className="jsi-lead">Ingresá con tu cuenta de Google para confirmar la invitación y sumarte al local que te invitó.</p>
            <GoogleSignIn returnTo="/unirse" compact />
            <div className="jsi-divider" />
            <p className="jsi-helper">Una vez registrado, vas a poder consultar tu recibo personal cuando esté publicado y los horarios habilitados en modo lectura.</p>
            <p className="jsi-security"><LockKeyhole size={16} aria-hidden="true"/> Invitación privada y de un solo uso.</p>
          </>
        ) : (
          <>
            <h1 id="jsi-title">{state === "success" ? "Ya sos parte del equipo" : "Confirmando tu invitación"}</h1>
            {state === "checking" && <p className="jsi-lead" role="status">Estamos verificando tu identidad y el local asignado…</p>}
            {state === "success" && (
              <p className="jsi-success" role="status"><CheckCircle2 size={20} aria-hidden="true"/>
                Tu acceso como colaborador{localName ? " de " + localName : ""} fue confirmado. Tu gerente podrá completar el legajo.
              </p>
            )}
            {state === "error" && (
              <>
                <p className="jsi-error" role="alert">{message}</p>
                <div className="jsi-actions">
                  {alreadyAssigned && (
                    <button type="button" className="jsi-retry" disabled={changingAccount} onClick={()=>void changeAccount()}>
                      {changingAccount ? "Cambiando cuenta…" : "Cambiar cuenta de Google"}
                    </button>
                  )}
                  <button type="button" className="jsi-retry jsi-retry--secondary" disabled={changingAccount} onClick={()=>setAttempt(n=>n+1)}>
                    Reintentar incorporación
                  </button>
                </div>
              </>
            )}
            <p className="jsi-security"><LockKeyhole size={16} aria-hidden="true"/> Acceso personal y protegido.</p>
          </>
        )}
      </section>
    </main>
  );
}
