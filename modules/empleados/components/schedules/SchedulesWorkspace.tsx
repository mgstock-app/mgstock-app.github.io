"use client";
import { Suspense, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { OwnerSidebar } from "@/components/owner/OwnerSidebar";
import { AdminShell } from "@/components/admin/AdminShell";
import "@/components/owner/owner.css";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { selectVisibleCompany } from "@/utils/owner-company";
import { schedulesApi } from "@/features/schedules/api";
import { useDisplayName } from "@/components/gestlok/GestlokContext";
import { BranchScheduleLink } from "./BranchScheduleLink";
import { isGestlokGerente } from "@/utils/permissions";
import type { Company } from "@/types/access";

// Gerente de GESTLOK: solo las planillas de sus propios locales (el servidor vuelve a comprobarlo).
function GerenteSchedules() {
  const { user } = useAuth();
  const locals = user?.gestlok_gerente?.local_ids ?? [];
  return (
    <section className="management-page schedules-page">
      <span className="eyebrow">ADMINISTRACIÓN DE EMPLEADOS</span>
      <h1>📁 Horarios</h1>
      <p>Planilla de turnos de tu local en Google Sheets.</p>
      {locals.map((id) => <BranchScheduleLink key={id} local={id} />)}
    </section>
  );
}

function SchedulesContent() {
  const { user: current } = useAuth();
  if (isGestlokGerente(current)) return <GerenteSchedules />;
  return <SchedulesForStaff />;
}

function SchedulesForStaff() {
  const params = useSearchParams();
  const { user } = useAuth();
  const organizations = useOrganizationData();
  const shown = useDisplayName();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState(params.get("empresa") || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const selected = selectVisibleCompany(
    companies, company, user?.organization_id, user?.role === "owner",
  );

  useEffect(() => {
    let active = true;
    schedulesApi
      .companies()
      .then((value) => { if (active) setCompanies(value); })
      .catch((cause) => {
        if (active) setError(
          cause instanceof Error ? cause.message : "No se pudieron cargar las empresas.",
        );
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="management-page schedules-page">
      <span className="eyebrow">EMPRESA · SUCURSALES</span>
      <h1>📁 Horarios</h1>
      <p>Accedé a las planillas de cada sucursal en Google Sheets.</p>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Cargando empresas…</p>
      ) : !selected ? (
        <p>Primero creá una empresa o solicitá su asignación.</p>
      ) : (
        <>
          {companies.length > 1 && (
            <div className="schedule-filters">
              <div>
                <label htmlFor="schedule-company">Empresa</label>
                <select
                  id="schedule-company"
                  value={selected.id}
                  onChange={(event) => setCompany(event.target.value)}
                >
                  {companies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {shown(organizations.organizations.find((org) => org.id === item.organization_id)?.name) || "Empresa"} · {shown(item.name)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <BranchScheduleLink key={selected.id} company={selected.id} />
        </>
      )}
    </section>
  );
}

export function SchedulesWorkspace() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const content = (
    <Suspense fallback={<p className="empty-state">Cargando Horarios…</p>}>
      <SchedulesContent />
    </Suspense>
  );
  if (user?.role === "admin") return <AdminShell>{content}</AdminShell>;
  if (user?.role !== "owner") return content;
  return (
    <div className="owner-home">
      <OwnerSidebar open={open} onClose={() => setOpen(false)} currentPath="/horarios" />
      <main className="owner-main">
        <header className="owner-header">
          <button className="owner-mobile" aria-label="Abrir menú" aria-controls="owner-navigation" aria-expanded={open} onClick={() => setOpen(!open)}><Menu /></button>
          <div><p className="owner-caption">TU ESPACIO DE TRABAJO</p></div>
        </header>
        {content}
      </main>
    </div>
  );
}
