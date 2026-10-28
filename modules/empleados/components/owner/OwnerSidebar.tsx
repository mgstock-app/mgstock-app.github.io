"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { House, Building2, Store, UsersRound, Wallet, CalendarDays, Inbox, Settings, LogOut, ShieldCheck, FileSpreadsheet, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGestlokCompany } from "@/components/gestlok/GestlokContext";

type Area = "inicio" | "empleados" | "recibos" | "planillas";
export function OwnerSidebar({ open, onClose, currentPath, onLocals, pendingCount = 0, activeSection = "inicio", onSectionChange, companyName = "" }: {
  open: boolean;
  onClose: () => void;
  currentPath: string;
  onLocals?: () => void;
  pendingCount?: number;
  activeSection?: Area;
  onSectionChange?: (next: Area) => void;
  companyName?: string;
}) {
  const { signOut } = useAuth();
  const [collapsed,setCollapsed] = useState(false);
  useEffect(()=>{
    let active=true;
    queueMicrotask(()=>{
      if(!active)return;
      try{setCollapsed(window.localStorage.getItem("gestlok:owner-menu-collapsed")==="yes");}catch{}
    });
    return()=>{active=false;};
  },[]);
  const toggleCollapsed=()=>{
    setCollapsed(v=>{
      try{window.localStorage.setItem("gestlok:owner-menu-collapsed",v?"no":"yes");}catch{}
      return !v;
    });
  };
  const contextCompany = useGestlokCompany();
  const internalName = contextCompany?.recibonet?.internal_name?.trim().toLocaleLowerCase("es-AR");
  const shownCompany = internalName && internalName === companyName.trim().toLocaleLowerCase("es-AR") ? contextCompany!.company_name : companyName;
  const logoHome = process.env.NEXT_PUBLIC_GESTLOK_HOME || "/";
  const change = (section: Area) => { onSectionChange?.(section); onClose(); };
  const sectionButton = (section: Area, label: string, Icon: typeof House) =>
    <button type="button" key={section} className={activeSection === section ? "active" : ""} title={label}
      aria-current={activeSection === section ? "page" : undefined} onClick={() => change(section)}>
      <Icon size={19} aria-hidden="true"/><span className="owner-sidebar__label">{label}</span>
    </button>;
  const isMiGusto = shownCompany.trim().toLocaleLowerCase("es-AR") === "mi gusto";
  return <>
    {open && <button className="owner-scrim" aria-label="Cerrar menú" onClick={onClose}/>}
    <aside id="owner-navigation" aria-label="Menú del dueño" className={"owner-sidebar " + (open ? "is-open" : "") + (collapsed ? " is-collapsed" : "")}>
      <a className="owner-brand" href={logoHome} onClick={onClose}>
        <b>G</b><span>GESTLOK<small>Organizá · Controlá · Hacé crecer</small></span>
      </a>
      <button className="owner-sidebar__collapse" type="button"
        title={collapsed ? "Expandir menú" : "Contraer menú"}
        aria-label={collapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
        aria-expanded={!collapsed} onClick={toggleCollapsed}>
        {collapsed ? <PanelLeftOpen size={19} aria-hidden="true"/> : <PanelLeftClose size={19} aria-hidden="true"/>}
        <span className="owner-sidebar__label">{collapsed ? "Expandir menú" : "Contraer menú"}</span>
      </button>
      {shownCompany && <div className="owner-company-brand">
        {isMiGusto ? <img className="owner-company-image" src={logoHome + "img/mi-gusto-blanco.png"} alt="Mi Gusto" width={100} height={60}/> : <span className="owner-company-logo" aria-hidden="true">{shownCompany.slice(0,2).toUpperCase()}</span>}
        <strong>{shownCompany}<small>{isMiGusto ? "Empanadas de verdad" : "Tu empresa"}</small></strong>
      </div>}
      <p className="owner-caption">TU EMPRESA</p>
      <nav aria-label="Menú del dueño">
        {sectionButton("inicio", "Inicio", House)}
        <Link href="/empresas" onClick={onClose} className={currentPath === "/empresas" ? "active" : ""}><Building2 size={19}/><span className="owner-sidebar__label">Mis empresas</span></Link>
        {onLocals ? <button type="button" onClick={() => { onLocals(); onClose(); }}><Store size={19}/><span className="owner-sidebar__label">Locales</span></button> : <Link href="/locales" onClick={onClose}><Store size={19}/><span className="owner-sidebar__label">Locales</span></Link>}
        <Link href="/horarios" onClick={onClose}><CalendarDays size={19}/><span className="owner-sidebar__label">Horarios</span></Link>
        <p className="owner-caption owner-sidebar__group">EMPLEADOS</p>
        {sectionButton("empleados", "Administrar empleados", UsersRound)}
        {sectionButton("recibos", "Recibos de sueldo", Wallet)}
        {sectionButton("planillas", "Enlaces y planillas", FileSpreadsheet)}
        <Link href="/usuarios" onClick={onClose}><UsersRound size={19}/><span className="owner-sidebar__label">Cuentas y permisos</span></Link>
        <Link href="/solicitudes" onClick={onClose}><Inbox size={19}/><span className="owner-sidebar__label">Solicitudes</span> {pendingCount>0 && <b className="owner-badge">{pendingCount}</b>}</Link>
      </nav>
      <div className="owner-bottom">
        <Link href="/#owner-settings" onClick={onClose}><Settings size={19}/><span className="owner-sidebar__label">Configuración</span></Link>
        <button type="button" onClick={() => void signOut()}><LogOut size={19}/><span className="owner-sidebar__label">Salir</span></button>
        <p><ShieldCheck size={17}/>Tu información es privada.</p>
      </div>
    </aside>
  </>;
}
