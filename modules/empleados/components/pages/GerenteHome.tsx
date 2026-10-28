"use client";
import { useState } from "react";
import Link from "next/link";
import { ClipboardList, FileSpreadsheet, House, Menu, ShieldCheck, Wallet, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ManagerLegajos } from "@/components/legajos/ManagerLegajos";
import { ManagerPersonalReceipt } from "@/components/reports/ManagerPersonalReceipt";
import { EmployeeReport } from "@/components/reports/EmployeeReport";
import { useGestlokCompany } from "@/components/gestlok/GestlokContext";
import "./gerente-home.css";
import "./gerente-visual-fix.css";

export function GerenteHome() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [section, setSection] = useState<"legajos" | "horarios" | "recibo">("legajos");
  const firstName = user?.display_name?.split(" ")[0] || "Gerente";
  const company = useGestlokCompany();
  const companyName = company?.company_name || "Mi empresa";
  const isMiGusto = company?.logo_id === "mi-gusto";
  const localId = user?.gestlok_gerente?.local_ids?.length === 1 ? user.gestlok_gerente.local_ids[0] : null;
  const localName = user?.local_name || (localId === "dt" ? "Don Torcuato" : localId === "munro" ? "Munro" : null);
  const home = process.env.NEXT_PUBLIC_GESTLOK_HOME || "/";
  return <div className="gl-gerente">
    <aside className={"gl-gerente__sidebar" + (menuOpen?" is-open":"") + (collapsed?" is-collapsed":"")} aria-label="Menú del gerente">
      <div className="gl-gerente__brand">
        {isMiGusto
          ? <img className="gl-gerente__company-image" src={home + "img/mi-gusto-blanco.png"} alt="Mi Gusto" width={105} height={66}/>
          : <span className="gl-gerente__company-letter" aria-hidden="true">{companyName.slice(0,1).toUpperCase()}</span>}
        <div>{!isMiGusto && <strong>{companyName}</strong>}<small>{isMiGusto ? "Empanadas de Verdad" : "Administración de empleados"}</small></div>
      </div>
      <button type="button" className="gl-gerente__collapse" aria-expanded={!collapsed} aria-label={collapsed ? "Expandir menú del gerente" : "Contraer menú del gerente"} onClick={() => setCollapsed(v => !v)}>{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}<span>{collapsed ? "Expandir" : "Contraer menú"}</span></button>
      <div className="gl-gerente__local-label">TU LOCAL{localName ? <strong>{localName}</strong> : <strong>Administración de empleados</strong>}</div>
      <nav>
        <button type="button" title="Administrar empleados" className={section==="legajos"?"active":""} onClick={()=>{setSection("legajos");setMenuOpen(false)}}><House size={19}/><span className="gl-gerente__nav-label">Administrar empleados</span></button>
        <button type="button" title="Sector de Google" className={section==="horarios"?"active":""} onClick={()=>{setSection("horarios");setMenuOpen(false)}}><FileSpreadsheet size={19}/><span className="gl-gerente__nav-label">Sector de Google</span></button>
        <button type="button" title="Mi recibo personal" className={section==="recibo"?"active":""} onClick={()=>{setSection("recibo");setMenuOpen(false)}}><Wallet size={19}/><span className="gl-gerente__nav-label">Mi recibo personal</span></button>
      </nav>
      <p className="gl-gerente__security"><ShieldCheck size={16}/> Solo colaboradores de tus locales autorizados.</p>
    </aside>
    {menuOpen&&<button type="button" className="gl-gerente__scrim" aria-label="Cerrar menú" onClick={()=>setMenuOpen(false)}/>}
    <main className="gl-gerente__main">
      <header className="gl-gerente__header">
        <button type="button" className="gl-gerente__menu" aria-label={menuOpen?"Cerrar menú":"Abrir menú"} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X size={22}/>:<Menu size={22}/>}</button>
        <div className="gl-gerente__header-brand"><strong>GEST<span>LOK</span></strong><small>ORGANIZÁ · CONTROLÁ · HACÉ CRECER</small></div>
        <span className="gl-gerente__user">Hola, {firstName}<small>Gerente</small></span>
      </header>
      <div className="gl-gerente__content">
        {section==="legajos" ? <ManagerLegajos/> : section==="recibo" ?
          (user?.role==="manager" && !user.gestlok_gerente?.local_ids?.length ? <EmployeeReport/> : <ManagerPersonalReceipt/>) :
          <section className="gl-gerente__google">
            <h1><FileSpreadsheet size={25}/> Sector de Google</h1>
            <p>Las planillas de Google Sheets se encuentran dentro de cada local, bajo su lista de colaboradores. También podés abrir la carpeta de Horarios.</p>
            <Link href="/horarios" className="gl-gerente__google-link"><ClipboardList size={19}/> Abrir Google Sheets y horarios</Link>
            <button type="button" onClick={()=>setSection("legajos")}>Volver a los legajos</button>
          </section>}
      </div>
    </main>
  </div>;
}
