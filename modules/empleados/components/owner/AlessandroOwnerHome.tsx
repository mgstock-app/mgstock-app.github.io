"use client";
import { useEffect, useMemo, useState } from "react";
import { Menu, ShieldCheck, UsersRound, Wallet, FileSpreadsheet } from "lucide-react";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { accessApi } from "@/features/access/api";
import { ReportWorkspace } from "@/components/reports/ReportWorkspace";
import type { WorkspaceScreen } from "@/components/reports/ReportWorkspace";
import { OwnerSidebar } from "./OwnerSidebar";
import type { AppLocal, AppUser } from "@/types/access";
import { useDisplayName } from "@/components/gestlok/GestlokContext";
import "./owner.css";

const ALESSANDRO_ID = "2026002";
const REQUIRED_LOCALS = ["munro", "torcuato"] as const;
const clean = (s: string) => s.trim().toLocaleLowerCase("es-AR");
const recognized = (name: string) => ["alessandro", "mi gusto"].includes(clean(name));

/** Legacy Mi Gusto / Alessandro keeps its local permissions and existing schedules. */
export function AlessandroOwnerHome({ user, initialLocal = "", initialArea = "empleados" }: { user: AppUser; initialLocal?: string; initialArea?: WorkspaceScreen }) {
  const spaces = useOrganizationData();
  const displayName = useDisplayName()("Alessandro");
  const shown = displayName === "Alessandro" ? "Mi Gusto" : displayName;
  const [locals, setLocals] = useState<AppLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<"inicio" | WorkspaceScreen>(initialArea);
  const [selectedLocal, setSelectedLocal] = useState(initialLocal);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await accessApi.locals();
        if (active) {
          setLocals(previous => JSON.stringify(previous) === JSON.stringify(result) ? previous : result);
          setError("");
        }
      } catch {
        if (active) setError("No se pudieron cargar los locales autorizados.");
      } finally { if (active) setLoading(false); }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);
  const organization = spaces.organizations.find(item =>
    item.owner_public_id === ALESSANDRO_ID && recognized(item.name)
  ) ?? spaces.organizations.find(item => item.owner_public_id === ALESSANDRO_ID);
  const company = spaces.companies.find(item =>
    item.organization_id === organization?.id && recognized(item.name)
  );
  const companyLocals = useMemo(() => REQUIRED_LOCALS.map(name => locals.find(local =>
    local.company_id === company?.id &&
    (name === "torcuato" ? ["torcuato", "don torcuato"].includes(clean(local.name)) : clean(local.name) === name)
  )).filter((local): local is AppLocal => Boolean(local)), [locals, company?.id]);

  const workspaceLocals = useMemo(() => !selectedLocal ? companyLocals : companyLocals.filter(local =>
    local.id === selectedLocal || (selectedLocal === "torcuato" && ["torcuato", "don torcuato"].includes(clean(local.name)))
  ), [companyLocals, selectedLocal]);

  if (loading || spaces.loading) return (
    <main className="alessandro-home"><p className="alessandro-notice" role="status">Cargando los locales de {shown}…</p></main>
  );
  if (!organization || !company || companyLocals.length === 0) return (
    <main className="alessandro-home"><p className="alessandro-notice" role="alert">
      {error || spaces.error || `No encontramos Munro y Don Torcuato en ${shown} (2026002) con los permisos actuales. No se modificó ninguna planilla.`}
    </p></main>
  );
  return <div className="owner-home owner-home--legacy">
    <OwnerSidebar open={open} onClose={() => setOpen(false)} onOpen={() => setOpen(true)} currentPath="/"
      onLocals={() => { setArea("planillas"); setOpen(false); }} activeSection={area}
      onSectionChange={next => { setArea(next); setOpen(false); }} companyName={shown}/>
    <main className="owner-main">
      <header className={"owner-header" + (area === "inicio" ? "" : " owner-header--management")}>
        <button type="button" className="owner-mobile" aria-label="Abrir menú" onClick={() => setOpen(!open)}><Menu size={21}/></button>
        <div>{area === "inicio" ? <><p className="owner-caption">TU EMPRESA</p><h1>{shown}</h1><p>Administración de empleados de tus locales.</p></>
          : <div className="owner-header-brand"><strong>GEST<span>LOK</span></strong><small>ORGANIZÁ · CONTROLÁ · HACÉ CRECER</small></div>}</div>
        <div className="owner-user"><span>{(user.display_name || "G").charAt(0).toUpperCase()}</span><div>{user.display_name}<small>{user.role === "admin" ? "Administradora General" : "Dueña/o"}</small></div></div>
      </header>
      {(error || spaces.error || companyLocals.length !== REQUIRED_LOCALS.length) && <p role="alert" className="owner-error">
        {error || spaces.error || "Falta acceso a uno de los locales. Revisá los permisos de Munro y Don Torcuato."}
      </p>}
      <nav className="employee-pages__nav" aria-label="Recibos por local">
        {companyLocals.map(local => <button key={local.id} type="button" aria-current={area === "recibos" && selectedLocal === local.id ? "page" : undefined} onClick={() => {setSelectedLocal(local.id);setArea("recibos");}}>Recibos · {local.name}</button>)}
        <button type="button" onClick={() => setSelectedLocal("")}>Todos los locales</button>
      </nav>
      <section className="owner-management" hidden={area === "inicio"}>
        <ReportWorkspace key={selectedLocal} user={user} locals={workspaceLocals} scheduleInFolderOnly
          screen={area === "inicio" ? "empleados" : area} onScreenChange={setArea}/>
      </section>
      <section className="owner-panel owner-legacy-home" hidden={area !== "inicio"}>
        <h2>Administración de {shown}</h2>
        <p>Elegí qué necesitás gestionar. Todas las planillas anteriores siguen disponibles, con su historial y sus permisos.</p>
        <div className="owner-legacy-actions">
          <button type="button" onClick={() => setArea("empleados")}><UsersRound size={20}/> Administrar empleados</button>
          <button type="button" onClick={() => setArea("recibos")}><Wallet size={20}/> Recibos de sueldo</button>
          <button type="button" onClick={() => setArea("planillas")}><FileSpreadsheet size={20}/> Enlaces y planillas</button>
        </div>
        <p className="owner-security"><ShieldCheck size={18}/>Solo se muestran los locales y recibos autorizados.</p>
      </section>
    </main>
  </div>;
}
