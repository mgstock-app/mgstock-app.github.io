"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, FileSpreadsheet, House, UsersRound, Menu, ShieldCheck, Wallet, X, PanelLeftClose, PanelLeftOpen, LogOut, ArrowLeft } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ManagerLegajos } from "@/components/legajos/ManagerLegajos";
import { ManagerPersonalReceipt } from "@/components/reports/ManagerPersonalReceipt";
import { EmployeeReport } from "@/components/reports/EmployeeReport";
import { useGestlokCompany } from "@/components/gestlok/GestlokContext";
import "./gerente-home.css";
import "./gerente-visual-fix.css";

export function GerenteHome() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(()=>{
    let active=true;
    queueMicrotask(()=>{
      if(!active)return;
      try{setCollapsed(localStorage.getItem("gestlok:manager-menu-collapsed")==="yes");}catch{}
    });
    return()=>{active=false;};
  },[]);
  const toggleCollapsed=()=>{
    const next=!collapsed;
    setCollapsed(next);
    try{localStorage.setItem("gestlok:manager-menu-collapsed",next?"yes":"no");}catch{}
  };
  const [section, setSection] = useState<"legajos" | "horarios" | "recibo">("legajos");
  const [hasDraft, setHasDraft] = useState(false);
  const navigateTo = (next: "legajos"|"horarios"|"recibo") => {
    if(hasDraft && section==="legajos" && next!==section &&
      !window.confirm("Hay cambios sin guardar en un legajo. ¿Salir y descartarlos?")) return;
    setSection(next);
    setMenuOpen(false);
  };
  useEffect(() => { if (new URLSearchParams(window.location.search).get("seccion") !== "horarios") return; let active=true; queueMicrotask(()=>{if(active)setSection("horarios");}); return ()=>{active=false;}; }, []);
  const firstName = user?.display_name?.split(" ")[0] || "Gerente";
  const company = useGestlokCompany();
  const companyName = company?.company_name || "Mi empresa";
  const isMiGusto = company?.logo_id === "mi-gusto";
  const localId = user?.gestlok_gerente?.local_ids?.length === 1 ? user.gestlok_gerente.local_ids[0] : null;
  const localName = user?.local_name || (localId === "dt" ? "Don Torcuato" : localId === "munro" ? "Munro" : null);
  const home = process.env.NEXT_PUBLIC_GESTLOK_HOME || "/";
  return <div className="gl-gerente">
    <aside className={"gl-gerente__sidebar" + (menuOpen?" is-open":"") + (collapsed?" is-collapsed":"")} aria-label="Menú del gerente">
      <div className={"gl-gerente__brand" + (isMiGusto ? " gl-gerente__brand--mi-gusto" : "")}>
        {isMiGusto
          ? <img className="gl-gerente__company-image" src={home + "img/mi-gusto-blanco.png"} alt="Mi Gusto" width={105} height={66}/>
          : <span className="gl-gerente__company-letter" aria-hidden="true">{companyName.slice(0,1).toUpperCase()}</span>}
        <div>{!isMiGusto && <strong>{companyName}</strong>}<small>{isMiGusto ? "Empanadas de Verdad" : "Administración de empleados"}</small></div>
      </div>
      <button type="button" className="gl-gerente__collapse" aria-expanded={!collapsed} aria-label={collapsed ? "Expandir menú del gerente" : "Contraer menú del gerente"} onClick={toggleCollapsed}>{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}<span>{collapsed ? "Expandir" : "Contraer menú"}</span></button>
      <div className="gl-gerente__local-label">TU LOCAL{localName ? <strong>{localName}</strong> : <strong>Administración de empleados</strong>}</div>
      <nav>
        <button type="button" title="Administrar empleados" className={section==="legajos"?"active":""} onClick={()=>navigateTo("legajos")}><UsersRound size={19}/><span className="gl-gerente__nav-label">Colaboradores</span></button>
        <button type="button" title="Sector de Google" className={section==="horarios"?"active":""} onClick={()=>navigateTo("horarios")}><FileSpreadsheet size={19}/><span className="gl-gerente__nav-label">Sector de Google</span></button>
        <button type="button" title="Mi recibo personal" className={section==="recibo"?"active":""} onClick={()=>navigateTo("recibo")}><Wallet size={19}/><span className="gl-gerente__nav-label">Mi recibo personal</span></button>
      </nav>
      <div className="gl-gerente__module-actions"><a href={home}><ArrowLeft size={18}/> Volver a GESTLOK</a><button type="button" onClick={()=>void signOut()}><LogOut size={18}/> Cerrar sesión</button></div><p className="gl-gerente__security"><ShieldCheck size={16}/> Solo colaboradores de tus locales autorizados.</p>
    </aside>
    {menuOpen&&<button type="button" className="gl-gerente__scrim" aria-label="Cerrar menú" onClick={()=>setMenuOpen(false)}/>}
    <main className="gl-gerente__main">
      <header className="gl-gerente__header">
        <button type="button" className="gl-gerente__menu" aria-label={menuOpen?"Cerrar menú":"Abrir menú"} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X size={22}/>:<Menu size={22}/>}</button>
        <div className="gl-gerente__header-brand" aria-label="GESTLOK"><strong><span className="gl-gerente__header-gest">GEST</span><span className="gl-gerente__header-lok">LOK</span></strong><small>ORGANIZÁ · CONTROLÁ · HACÉ CRECER</small></div>
        <a className="gl-gerente__back-home" href={home}><ArrowLeft size={17}/> Volver a GESTLOK</a><span className="gl-gerente__user">Hola, {firstName}<small>Gerente</small></span>
      </header>
      <div className="gl-gerente__content">
        {section==="legajos" ? <ManagerLegajos onDirtyChange={setHasDraft}/> : section==="recibo" ?
          (user?.role==="manager" && !user.gestlok_gerente?.local_ids?.length ? <EmployeeReport/> : <ManagerPersonalReceipt/>) :
          <section className="gl-gerente__google">
            <h1><FileSpreadsheet size={25}/> Sector de Google</h1>
            <p>Las planillas de Google Sheets se encuentran dentro de cada local, bajo su lista de colaboradores. También podés abrir la carpeta de Horarios.</p>
            <Link href="/horarios" className="gl-gerente__google-link"><ClipboardList size={19}/> Abrir Google Sheets y horarios</Link>
            <button type="button" onClick={()=>navigateTo("legajos")}>Volver a los legajos</button>
          </section>}
      </div>
    </main>
    <nav className="gl-module-dock" aria-label="Navegación móvil del gerente">
      <a href={home}><House size={20}/>Inicio</a>
      <button type="button" aria-current={section==="legajos"?"page":undefined} onClick={()=>navigateTo("legajos")}><UsersRound size={20}/>Colaboradores</button>
      <button type="button" aria-current={section==="horarios"?"page":undefined} onClick={()=>navigateTo("horarios")}><FileSpreadsheet size={20}/>Horarios</button>
      <button type="button" aria-current={section==="recibo"?"page":undefined} onClick={()=>navigateTo("recibo")}><Wallet size={20}/>Mi recibo</button>
      <button type="button" aria-expanded={menuOpen} aria-label="Más opciones" onClick={()=>setMenuOpen(true)}><Menu size={20}/>Más</button>
    </nav>
  </div>;
}
