"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { joinApi } from "@/features/onboarding/api";
import { isInvitationCode, resolveInvitationCode } from "@/utils/invitations";
import { validManagerStaffInvite } from "@/utils/manager-staff-invite";
import { JoinStaffInvitation } from "./JoinStaffInvitation";
function JoinContent() {
  const params = useSearchParams();
  const { user, loading, refresh } = useAuth();
  const [savedToken, setToken] = useState(params.get("codigo") || "");
  const token = params.get("codigo") ?? savedToken;
  const [previewResult, setPreview] = useState<{
    token: string;
    data: Awaited<ReturnType<typeof joinApi.preview>>;
  } | null>(null);
  const [failure, setFailure] = useState<{
    token: string;
    message: string;
  } | null>(null);
  const preview = previewResult?.token === token ? previewResult.data : null;
  const error = failure?.token === token ? failure.message : "";
  const [busy, setBusy] = useState(false);
  const [joinedToken, setJoined] = useState("");
  useEffect(() => {
    try {
      const value = resolveInvitationCode(
        params.get("codigo"),
        params.has("codigo") ? null : sessionStorage.getItem("recibonet_invitation"),
      );
      queueMicrotask(() => setToken(value));
      if (isInvitationCode(value)) {
        sessionStorage.setItem("recibonet_invitation", value);
      } else if (params.has("codigo"))
        sessionStorage.removeItem("recibonet_invitation");
    } catch {
      /* The token in the URL still works when storage is unavailable. */
    }
  }, [params]);
  useEffect(() => {
    let alive = true;
    if (user && isInvitationCode(token))
      joinApi
        .preview(token)
        .then((value) => {
          if (alive) setPreview({ token, data: value });
        })
        .catch((cause) => {
          if (alive)
            setFailure({
              token,
              message:
                cause instanceof Error ? cause.message : "Invitación inválida.",
            });
        });
    return () => {
      alive = false;
    };
  }, [user, token]);
  async function join() {
    setBusy(true);
    setFailure(null);
    try {
      await joinApi.join(token);
      await refresh();
      setJoined(token);
      try {
        sessionStorage.removeItem("recibonet_invitation");
      } catch {}
    } catch (cause) {
      setFailure({
        token,
        message:
          cause instanceof Error
            ? cause.message
            : "No se pudo solicitar el acceso.",
      });
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <p className="empty-state" role="status">
        Comprobando tu cuenta…
      </p>
    );
  if (!user)
    return (
      <>
        <p className="empty-state">
          Ingresá con Google para aceptar la invitación como colaborador.
        </p>
        <GoogleSignIn returnTo="/unirse" />
      </>
    );
  return (
    <section className="login-card">
      <h1>Invitación a una empresa</h1>
      {joinedToken === token && !!token ? (
        <>
          <p>
            Solicitud registrada. El dueño debe asignarte un local y el rol de
            colaborador o gerente antes de que puedas acceder.
          </p>
          <Link href="/">Ver mi cuenta</Link>
        </>
      ) : (
        <>
          {preview ? (
            <>
              <p>
                <strong>{preview.company_name}</strong> · {preview.space_name}
                {preview.local_name ? ` · ${preview.local_name}` : ""}
              </p>
              <p>
                Esta invitación no permite ver datos ni asignarse permisos. Tu
                dueño revisará la solicitud.
              </p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void join()}
              >
                {busy ? "Registrando…" : "Solicitar ingreso como colaborador"}
              </button>
            </>
          ) : (
            !error && isInvitationCode(token) && <p>Comprobando invitación…</p>
          )}
          {!token && <p>Volvé a abrir el enlace que te compartió tu dueño.</p>}
          {token && !isInvitationCode(token) && (
            <p role="alert">
              El enlace de invitación no es válido. Pedile uno nuevo a tu dueño.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
/** Routes the new auto-assignment flow without changing legacy owner invitations.
 * Explicit invalid URLs never fall back to a cached, potentially unrelated link.
 */
function JoinRouter() {
  const params = useSearchParams();
  const [cached, setCached] = useState("");
  useEffect(() => {
    try {
      if (params.has("invitacion")) {
        const incoming = params.get("invitacion") || "";
        if (validManagerStaffInvite(incoming)) sessionStorage.setItem("recibonet_staff_invitation",incoming);
        else sessionStorage.removeItem("recibonet_staff_invitation");
        queueMicrotask(() => setCached(incoming));
      } else if (!params.has("codigo")) {
        const old = sessionStorage.getItem("recibonet_staff_invitation") || "";
        queueMicrotask(() => setCached(old));
      } else queueMicrotask(() => setCached(""));
    } catch {
      queueMicrotask(() => setCached(""));
    }
  },[params]);
  const explicit = params.get("invitacion");
  const token = explicit !== null ? explicit : params.has("codigo") ? "" : cached;
  return explicit !== null || !!token ? <JoinStaffInvitation token={token}/> : <JoinContent/>;
}
export function JoinCompany() {
  return (
    <Suspense fallback={<p className="empty-state">Cargando invitación…</p>}>
      <JoinRouter />
    </Suspense>
  );
}
