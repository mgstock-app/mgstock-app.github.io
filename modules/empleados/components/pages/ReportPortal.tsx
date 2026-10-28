"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AccessGate } from "@/components/auth/AccessGate";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmployeeReport } from "@/components/reports/EmployeeReport";
import { ReportWorkspace } from "@/components/reports/ReportWorkspace";
import { accessApi } from "@/features/access/api";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { ManagerHome } from "@/components/pages/ManagerHome";
import { SharedOwnerCode } from "@/components/invitations/SharedOwnerCode";
import type { AppLocal, AppUser } from "@/types/access";
function ManagerReports({ user }: { user: AppUser }) {
  const spaces = useOrganizationData();
  const [selected, setSelected] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [locals, setLocals] = useState<AppLocal[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    function load() {
      accessApi
        .locals()
        .then((value) => {
          if (alive) {
            setLocals((previous) =>
              JSON.stringify(previous) === JSON.stringify(value)
                ? previous
                : value,
            );
            setError("");
          }
        })
        .catch((cause) => {
          if (alive) {
            setLocals([]);
            setError(
              cause instanceof Error
                ? cause.message
                : "No se pudieron cargar los locales.",
            );
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
      if (user.role === "admin")
        accessApi
          .ownerCount()
          .then((v) => {
            if (alive) setCount(v);
          })
          .catch(() => {
            if (alive) setCount(null);
          });
    }
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [user.role]);
  const org =
    spaces.organizations.find((o) => o.id === selected) ||
    spaces.organizations[0];
  const organizationId = org?.id;
  const visibleLocals = useMemo(
    () => locals.filter((l) => l.organization_id === organizationId),
    [locals, organizationId],
  );
  if (loading)
    return (
      <p className="empty-state" role="status">
        Cargando tus locales…
      </p>
    );
  if (error)
    return (
      <p className="empty-state" role="alert">
        {error}
      </p>
    );
  return (
    <>
      <section className="organization-home" aria-label="Tu espacio privado">
        {user.role === "admin" && (
          <div className="owner-count">
            <strong>{count ?? "—"}</strong>
            <span>Dueños registrados</span>
          </div>
        )}
        <div>
          <label htmlFor="home-organization">Espacio privado</label>
          {org ? (
            <>
              <select
                id="home-organization"
                value={org.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {spaces.organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.owner_name || o.name} · {o.name}
                  </option>
                ))}
              </select>
              <p>
                {org.owner_id ? "ID de empresa" : "ID del espacio"}:{" "}
                <code>{org.owner_public_id || org.id}</code>
              </p>
            </>
          ) : (
            <p>{spaces.loading ? "Cargando…" : "Sin espacios autorizados"}</p>
          )}
          {spaces.error && <p role="alert">{spaces.error}</p>}
          <Link href="/empresas">Gestionar dueños y empresas</Link>
        </div>
      </section>
      {org?.owner_public_id && <SharedOwnerCode key={org.id} organization={org.id} canRenew />}
      {visibleLocals.length ? (
        <ReportWorkspace key={org!.id} user={user} locals={visibleLocals} />
      ) : (
        <div className="empty-state">
          <h1>Empezá por tus locales</h1>
          <p>
            Creá una carpeta en la pestaña Locales para organizar los reportes.
          </p>
          <Link href="/locales">Ir a Locales</Link>
        </div>
      )}
    </>
  );
}
export function ReportPortal() {
  const { user } = useAuth();
  return (
    <AccessGate>
      {user?.role === "employee" ? (
        <section className="management-page employee-portal" aria-label="Portal del colaborador" style={{maxWidth:1100,margin:"0 auto",padding:"clamp(16px,3vw,32px)"}}>
          <header style={{background:"#073844",color:"white",padding:"24px",borderRadius:18,marginBottom:20}}>
            <span style={{color:"#75e3e7",fontWeight:700}}>GESTLOK · MI ESPACIO</span>
            <h1 style={{color:"white",margin:"8px 0"}}>Portal del colaborador</h1>
            <p style={{color:"#e3f4f5",margin:0}}>Tu información personal y las novedades de tu equipo, en un solo lugar.</p>
          </header>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))",gap:16,marginBottom:20}}>
            <section style={{background:"white",border:"1px solid #dbe6e9",borderRadius:16,padding:20}}>
              <h2>🔒 Mis recibos privados</h2>
              <p>Solo vos podés consultar tus recibos publicados. Tu empresa administra la publicación.</p>
              <Link href="/mi-reporte">Ver mis recibos</Link>
            </section>
            <section style={{background:"white",border:"1px solid #dbe6e9",borderRadius:16,padding:20}}>
              <h2>📅 Mis próximos turnos</h2>
              <p>Planilla visual semanal de turnos futuros y francos. Es independiente del registro de horas trabajadas y de la liquidación de sueldos.</p>
              <div aria-label="Vista de la semana laboral sin turnos publicados" style={{overflowX:"auto",border:"1px solid #dbe6e9",borderRadius:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(56px,1fr))",gap:4,padding:8,minWidth:410}}>
                  {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map((day) => (
                    <div key={day} style={{textAlign:"center",borderRadius:8,background:"#e5f4f3",padding:"12px 4px",color:"#073844",fontWeight:700}}>{day}</div>
                  ))}
                </div>
              </div>
              <p role="status">Todavía no hay turnos futuros publicados para mostrar. No se inventan horarios ni se utilizan las horas trabajadas.</p>
            </section>
          </div>
          <EmployeeReport key={`${user.user_id}:${user.sheet_id}`} />
        </section>
      ) : user?.role === "manager" ? (
        <ManagerHome />
      ) : user ? (
        <ManagerReports
          key={`${user.user_id}:${user.role}:${user.local_id}`}
          user={user}
        />
      ) : null}
    </AccessGate>
  );
}
