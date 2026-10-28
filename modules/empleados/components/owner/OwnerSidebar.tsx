"use client";
import Link from "next/link";
import { House, Building2, Store, UsersRound, Wallet, CalendarDays, Inbox, Settings, LogOut, ShieldCheck, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

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
  const change = (section: Area) => { onSectionChange?.(section); onClose(); };
  const sectionButton = (section: Area, label: string, Icon: typeof House) =>
    <button type="button" key={section} className={activeSection === section ? "active" : ""}
      aria-current={activeSection === section ? "page" : undefined} onClick={() => change(section)}>
      <Icon size={19}/>{label}
    </button>;
  const isMiGusto = companyName.trim().toLocaleLowerCase("es-AR") === "mi gusto";
  return <>
    {open && <button className="owner-scrim" aria-label="Cerrar menú" onClick={onClose}/>}
    <aside id="owner-navigation" className={"owner-sidebar " + (open ? "is-open" : "")}>
      <Link className="owner-brand" href="/" onClick={onClose}>
        <b>G</b><span>GESTLOK<small>Organizá · Controlá · Hacé crecer</small></span>
      </Link>
      {companyName && <div className="owner-company-brand">
        <span className="owner-company-logo" aria-hidden="true">{companyName.slice(0,2).toUpperCase()}</span>
        <strong>{companyName}<small>{isMiGusto ? "Empanadas de verdad" : "Tu empresa"}</small></strong>
      </div>}
      <p className="owner-caption">TU EMPRESA</p>
      <nav aria-label="Menú del dueño">
        {sectionButton("inicio", "Inicio", House)}
        <Link href="/empresas" onClick={onClose} className={currentPath === "/empresas" ? "active" : ""}><Building2 size={19}/>Mis empresas</Link>
        {onLocals ? <button type="button" onClick={() => { onLocals(); onClose(); }}><Store size={19}/>Locales</button> : <Link href="/locales" onClick={onClose}><Store size={19}/>Locales</Link>}
        <Link href="/horarios" onClick={onClose}><CalendarDays size={19}/>Horarios</Link>
        <p className="owner-caption owner-sidebar__group">EMPLEADOS</p>
        {sectionButton("empleados", "Administrar empleados", UsersRound)}
        {sectionButton("recibos", "Recibos de sueldo", Wallet)}
        {sectionButton("planillas", "Enlaces y planillas", FileSpreadsheet)}
        <Link href="/usuarios" onClick={onClose}><UsersRound size={19}/>Cuentas y permisos</Link>
        <Link href="/solicitudes" onClick={onClose}><Inbox size={19}/>Solicitudes {pendingCount>0 && <b className="owner-badge">{pendingCount}</b>}</Link>
      </nav>
      <div className="owner-bottom">
        <Link href="/#owner-settings" onClick={onClose}><Settings size={19}/>Configuración</Link>
        <button type="button" onClick={() => void signOut()}><LogOut size={19}/>Salir</button>
        <p><ShieldCheck size={17}/>Tu información es privada.</p>
      </div>
    </aside>
  </>;
}
