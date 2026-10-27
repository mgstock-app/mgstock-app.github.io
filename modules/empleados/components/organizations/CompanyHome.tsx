"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { ReportWorkspace } from "@/components/reports/ReportWorkspace";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { accessApi } from "@/features/access/api";
import { useDisplayName } from "@/components/gestlok/GestlokContext";
import { CompanyCollaborators } from "./CompanyCollaborators";
import type { AppLocal } from "@/types/access";
import { USERS_CHANGED_EVENT } from "@/hooks/use-pending-users-count";

export function CompanyHome({ companyId }: { companyId: string }) {
  const shown = useDisplayName();
  const { user } = useAuth();
  const data = useOrganizationData();
  const company = data.companies.find((item) => item.id === companyId);
  const [error, setError] = useState("");
  const [locals, setLocals] = useState<AppLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const companyLocals = useMemo(
    () => locals.filter((local) => local.company_id === companyId),
    [locals, companyId],
  );
  const refreshLocals = useCallback(async () => {
    setLocals(await accessApi.locals());
  }, []);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const value = await accessApi.locals();
        if (active) setLocals((previous) =>
          JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
      } catch {
        if (active) setError("No se pudieron actualizar los locales de tu empresa. Volvé a esta pestaña para reintentar.");
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(USERS_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(USERS_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  async function createLocal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await accessApi.createBranch(companyId, String(values.get("name")).trim(), values.get("cycle") as AppLocal["cycle"]);
      form.reset();
      await refreshLocals();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el local.");
    } finally { setBusy(false); }
  }
  if (data.loading || loading) return <p className="empty-state" role="status">Cargando empresa…</p>;
  if (!company || !user) return (
    <section className="empty-state">
      <h1>Empresa no disponible</h1>
      <p>{data.error || "No tenés acceso a esta empresa o ya no está disponible."}</p>
      <Link href="/empresas">Volver a mis empresas</Link>
    </section>
  );
  return (
    <>
      <section className="management-page">
        <Link href="/empresas">← Mis empresas</Link>
        <h1>{shown(company.name)}</h1>
        <p>Administrá los locales, colaboradores y reportes de esta empresa.</p>
        {error && <p role="alert">{error}</p>}
        <div className="locals-grid" aria-label="Estructura de la empresa">
          <article className="local-folder">
            <h2>Encargados</h2>
            <p>Carpeta preparada. Las planillas pueden cargarse sin una cuenta vinculada.</p>
            {!companyLocals.length && <p>Sin nombre asignado.</p>}
          </article>
          <article className="local-folder">
            <h2>Colaboradores</h2>
            <p>Carpeta preparada. Completá nombres, horarios y montos cuando lo necesites.</p>
            {!companyLocals.length && <p>Sin nombre asignado.</p>}
          </article>
          <article className="local-folder">
            <h2>Horarios</h2>
            <p>Accedé a los archivos de Google Sheets correspondientes a cada sucursal.</p>
            <Link href={`/horarios?empresa=${companyId}`}>Abrir horarios</Link>
          </article>
        </div>
        <details className="create-local-form" open={!companyLocals.length}>
          <summary>{companyLocals.length ? "Agregar otro local o sucursal" : "Organizar los reportes por local"}</summary>
          <p>Elegí el nombre y período del local. Sus carpetas de encargados y colaboradores estarán disponibles aunque nadie tenga una cuenta vinculada.</p>
          <form onSubmit={createLocal}>
            <label htmlFor="company-local-name">Nombre del local o sucursal</label>
            <input id="company-local-name" name="name" required maxLength={80} disabled={busy} />
            <label htmlFor="company-local-cycle">Período de los reportes</label>
            <select id="company-local-cycle" name="cycle" disabled={busy}>
              <option value="mensual">Mensual</option>
              <option value="semanal">Semanal</option>
            </select>
            <button className="primary-button" disabled={busy}>{busy ? "Creando…" : "Crear local"}</button>
          </form>
        </details>
        <CompanyCollaborators key={companyId} companyId={companyId} organizationId={company.organization_id} />
      </section>
      {!!companyLocals.length && <ReportWorkspace key={companyId} user={user} locals={companyLocals} />}
    </>
  );
}


