"use client";
import { useState } from "react";
import { onboardingApi } from "@/features/onboarding/api";
import { displayDate } from "@/utils/permissions";

export function SharedOwnerCode({ organization, canRenew = false }: { organization: string; canRenew?: boolean }) {
  const [value, setValue] = useState<Awaited<ReturnType<typeof onboardingApi.ownerCode>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function show(rotate = false) {
    setBusy(true); setMessage(""); setValue(null);
    try { setValue(await onboardingApi.ownerCode(organization, rotate)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo consultar el código."); }
    finally { setBusy(false); }
  }
  return <section className="organization-card">
    <h2>Invitar a otro dueño</h2>
    <p>El ID y el código permiten ingresar como dueño con acceso completo a las empresas y locales de este espacio. Compartilos únicamente con quien deba tener esos permisos.</p>
    <button disabled={busy} onClick={() => value ? setValue(null) : void show()}>{value ? "Ocultar código" : "Ver ID y código privado"}</button>
    {value && <>
      <p>ID de empresa: <strong>{value.company_id}</strong></p>
      <label>Código privado<input readOnly value={value.code} onFocus={(e) => e.target.select()} /></label>
      <p>Vence: {displayDate(value.expires_at)}</p>
      <button onClick={async () => {
        try { await navigator.clipboard.writeText(`ID de empresa: ${value.company_id}\nCódigo privado: ${value.code}`); setMessage("ID y código copiados."); }
        catch { setMessage("Seleccioná el código para copiarlo manualmente."); }
      }}>Copiar ID y código</button>
      {canRenew && <button disabled={busy} onClick={() => {
        if (window.confirm("El código anterior dejará de servir para nuevos ingresos. Los dueños ya incorporados conservarán su acceso. ¿Renovar?")) void show(true);
      }}>Renovar código</button>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
