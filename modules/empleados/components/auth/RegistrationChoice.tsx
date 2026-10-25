"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { onboardingApi } from "@/features/onboarding/api";
import { useAuth } from "./AuthProvider";
export function RegistrationChoice() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [kind, setKind] = useState<"owner" | "collaborator">("owner");
  const [name, setName] = useState("");
  const [existing, setExisting] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [code, setCode] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  async function register(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (kind === "owner" && existing) await onboardingApi.joinOwner(companyId.trim(), code.trim(), accepted);
      else await onboardingApi.register(kind, name.trim(), accepted);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo crear la cuenta.",
      );
    } finally {
      setBusy(false);
    }
  }
  function openInvitation(event: React.FormEvent) {
    event.preventDefault();
    try {
      const url = new URL(link, window.location.origin);
      if (
        url.origin !== window.location.origin ||
        url.pathname.replace(/\/$/, "") !== `${process.env.NEXT_PUBLIC_MODULE_BASE}/unirse` ||
        !/^[a-f0-9]{64}$/.test(url.searchParams.get("codigo") || "")
      )
        throw new Error();
      router.push("/unirse/" + url.search);
    } catch {
      setError("Pegá un enlace de invitación válido de GESTLOK · Empleados.");
    }
  }
  if (user?.organization_id || user?.account_kind === "collaborator")
    return (
      <section className="login-card">
        <h1>Tu cuenta de colaborador</h1>
        <p>
          {user.organization_id
            ? "Tu solicitud está en el espacio de tu dueño. Esperá a que te asigne un local y el rol de colaborador o gerente."
            : "Pedile al dueño el enlace de su empresa para solicitar tu incorporación."}
        </p>
        {!user.organization_id && (
          <form onSubmit={openInvitation}>
            <label htmlFor="join-paste">Enlace de invitación</label>
            <input
              id="join-paste"
              type="url"
              required
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <button className="primary-button">Abrir invitación</button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        <button onClick={() => void refresh()}>Revisar mi estado</button>
      </section>
    );
  return (
    <section className="login-card">
      <span className="eyebrow">BIENVENIDO A GESTION INTERNA</span>
      <h1>¿Cómo querés usar tu cuenta?</h1>
      <form onSubmit={register}>
        <label htmlFor="registration-kind">Tipo de cuenta</label>
        <select
          id="registration-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          disabled={busy}
        >
          <option value="owner">Dueño · crear o unirme a una empresa</option>
          <option value="collaborator">
            Colaborador · ingresar a una empresa
          </option>
        </select>
        {kind === "owner" ? (
          <>
            <label className="consent-label"><input type="checkbox" checked={existing} disabled={busy} onChange={(e) => setExisting(e.target.checked)} /><span>La empresa ya está creada: quiero unirme como dueño</span></label>
            {existing ? <>
              <label htmlFor="existing-company-id">ID de empresa</label>
              <input id="existing-company-id" required inputMode="numeric" pattern="[0-9]{7}" maxLength={7} placeholder="2026001" value={companyId} disabled={busy} onChange={(e) => setCompanyId(e.target.value)} />
              <label htmlFor="existing-company-code">Código privado de invitación</label>
              <input id="existing-company-code" required type="password" autoComplete="off" maxLength={64} value={code} disabled={busy} onChange={(e) => setCode(e.target.value)} />
              <p>Pedile ambos datos a un dueño, gerente o administrador autorizado. Ingresarás con los mismos permisos de dueño, sin esperar aprobación.</p>
            </> : <>
            <label htmlFor="registration-space">Nombre de tu empresa</label>
            <input
              id="registration-space"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            <p>
              Podrás crear tus empresas y sucursales en tu espacio privado. Esta
              versión personal no tiene suscripciones ni vencimientos de cuenta.
            </p>
            </>}
          </>
        ) : (
          <p>
            Ingresarás con el enlace que te comparta tu dueño. Solo él o una
            administración autorizada podrán asignarte permisos de gerente.
          </p>
        )}
        <label className="consent-label">
          <input
            type="checkbox"
            required
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            disabled={busy}
          />
          <span>
            Confirmo que quiero crear esta cuenta. Los datos de cada dueño
            permanecen privados.
          </span>
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>
          {busy ? "Creando…" : "Continuar"}
        </button>
      </form>
    </section>
  );
}
