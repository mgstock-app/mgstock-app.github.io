"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { onboardingApi } from "@/features/onboarding/api";

export function CollaboratorPreauthorizations() {
  const { user } = useAuth();
  const data = useOrganizationData();
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof onboardingApi.collaboratorPreauthorizations>>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    if (user?.role === "admin") onboardingApi.collaboratorPreauthorizations().then(value => { if (alive) setRows(value); }).catch(() => { if (alive) setMessage("No se pudieron consultar las preautorizaciones. Recargá la página."); });
    return () => { alive = false; };
  }, [user?.role]);
  if (user?.role !== "admin") return <p className="empty-state">Sección exclusiva de la administración.</p>;
  const selected = company || (data.companies.length === 1 ? data.companies[0].id : "");
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await onboardingApi.preauthorizeCollaborator(selected, email.trim());
      setEmail("");
      setMessage("Correo autorizado. Al registrarse con Google aparecerá en Usuarios del dueño, pendiente únicamente de rol y local. No se envió ningún correo.");
      try { setRows(await onboardingApi.collaboratorPreauthorizations()); }
      catch { setMessage("Autorización guardada. Recargá la página para actualizar la lista."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo autorizar."); }
    finally { setBusy(false); }
  }
  return <section className="management-page">
    <span className="eyebrow">ADMINISTRACIÓN</span><h1>Preautorizar colaboradores</h1>
    <p>Vinculá futuros registros con su empresa. No necesitan otra aprobación para registrarse; el dueño les asignará después el rol, local y reporte. Hasta entonces no acceden a datos privados.</p>
    <form className="create-local-form" onSubmit={save}>
      <label htmlFor="preauth-email">Correo de la cuenta Google</label>
      <input id="preauth-email" type="email" required maxLength={254} value={email} disabled={busy} onChange={e => setEmail(e.target.value)} />
      <label htmlFor="preauth-company">Empresa de destino</label>
      <select id="preauth-company" required value={selected} disabled={busy || data.loading} onChange={e => setCompany(e.target.value)}>
        <option value="">Elegí una empresa</option>
        {data.companies.map(c => <option key={c.id} value={c.id}>{c.name} · {data.organizations.find(o => o.id === c.organization_id)?.owner_public_id || "Espacio administrativo"}</option>)}
      </select>
      <button className="primary-button" disabled={busy || !selected}>{busy ? "Guardando…" : "Autorizar correo"}</button>
    </form>
    {data.error && <p role="alert">{data.error}</p>}{message && <p role="status">{message}</p>}
    <h2>Correos preautorizados</h2>
    {rows.length ? <div className="table-scroll"><table className="users-table"><thead><tr><th>Correo</th><th>Empresa</th><th>Registro</th></tr></thead><tbody>{rows.map(row => <tr key={row.email}><td>{row.email}</td><td>{row.company_name}</td><td>{row.registered ? "Ya se registró" : "Pendiente de primer ingreso"}</td></tr>)}</tbody></table></div> : <p>Todavía no hay correos preautorizados en tus empresas autorizadas.</p>}
  </section>;
}
