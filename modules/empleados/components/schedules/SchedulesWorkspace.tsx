"use client";
import { Suspense, useEffect, useState } from "react";
import { CalendarDays, Menu, UsersRound } from "lucide-react";
import { GestlokDock, useNavGestlok } from "@/components/gestlok/GestlokNav";
import { OwnerSidebar } from "@/components/owner/OwnerSidebar";
import { AdminShell } from "@/components/admin/AdminShell";
import "@/components/owner/owner.css";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { selectVisibleCompany } from "@/utils/owner-company";
import { schedulesApi } from "@/features/schedules/api";
import { useDisplayName } from "@/components/gestlok/GestlokContext";
import { HorariosHub } from "./HorariosHub";
import { isGestlokGerente } from "@/utils/permissions";
import type { Company } from "@/types/access";

// Gerente de GESTLOK: solo las planillas de sus propios locales (el servidor vuelve a comprobarlo).
function GerenteSchedules() {
  const { user } = useAuth();
  return <HorariosHub locales={user?.gestlok_gerente?.local_ids ?? []} />;
}

// Horarios en un solo lugar (planilla e historial). Lo usan /horarios y la portada del gerente.
export function SchedulesContent() {
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
    <HorariosHub company={loading ? undefined : selected?.id} lead="Accedé a las planillas de cada sucursal en Google Sheets. Debajo, el historial de semanas.">
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
        </>
      )}
    </HorariosHub>
  );
}

export function SchedulesWorkspace() {
  const { user } = useAuth();
  const nav = useNavGestlok();
  const [open, setOpen] = useState(false);
  const content = (
    <Suspense fallback={<p className="empty-state">Cargando Horarios…</p>}>
      <SchedulesContent />
    </Suspense>
  );
  if (user?.role === "admin") return <AdminShell>{content}</AdminShell>;
  // Staff de Mi Gusto Munro abre esta ruta independiente. Mantener el dock de la
  // portada del gerente mientras cambia de semanas/pestañas, sin mostrarlo
  // a otro local ni duplicar el dock de dueño/administradora.
  // El menú guardado es visual: los accesos a GESTLOK vuelven a validar permisos.
  if (isGestlokGerente(user) && nav.local === "munro" && user?.gestlok_gerente?.local_ids?.includes("munro")) {
    return (
      <>
        <main className="gl-munro-schedules-persistent">{content}</main>
        <GestlokDock secciones={[
          { id: "colaboradores", label: "Colaboradores", href: "/empleados/", icon: <UsersRound size={18} /> },
          { id: "horarios", label: "Horarios", actual: true, href: "/empleados/horarios/", icon: <CalendarDays size={18} /> },
        ]} />
      </>
    );
  }
  if (user?.role !== "owner") return content;
  return (
    <div className="owner-home">
      <OwnerSidebar open={open} onClose={() => setOpen(false)} onOpen={() => setOpen(true)} currentPath="/horarios" />
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
