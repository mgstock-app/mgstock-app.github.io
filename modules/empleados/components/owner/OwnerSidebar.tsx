"use client";
import Link from "next/link";
import { House, Building2, Store, Users, Wallet, ChartNoAxesCombined, CalendarDays, Inbox, Settings, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

const menu = [[House,"Inicio","/"],[Building2,"Mis empresas","/empresas"],[Store,"Locales","/#owner-locals"],[Users,"Colaboradores","/usuarios"],[Wallet,"Liquidaciones","/#owner-locals"],[ChartNoAxesCombined,"Reportes","/#owner-locals"],[CalendarDays,"Horarios","/horarios"],[Inbox,"Solicitudes","/solicitudes"]] as const;

export function OwnerSidebar({ open, onClose, currentPath, onLocals, pendingCount = 0 }: {
  open: boolean;
  onClose: () => void;
  currentPath: string;
  onLocals?: () => void;
  pendingCount?: number;
}) {
  const { signOut } = useAuth();
  return <>
    {open && <button className="owner-scrim" aria-label="Cerrar menú" onClick={onClose}/>}
    <aside id="owner-navigation" className={`owner-sidebar ${open ? "is-open" : ""}`}>
      <Link className="owner-brand" href="/" onClick={onClose}><b>GL</b><span>GESTLOK<small>Administrar a los empleados</small></span></Link>
      <p className="owner-caption">TU ESPACIO DE TRABAJO</p>
      <nav aria-label="Menú del dueño">
        {menu.map(([Icon, label, href]) => onLocals && href === "/#owner-locals" ?
          <button key={label} onClick={onLocals}><Icon size={19}/>{label}</button> :
          <Link key={label} href={href} onClick={onClose} className={href === currentPath ? "active" : ""} aria-current={href === currentPath ? "page" : undefined}>
            <Icon size={19}/>{label}{label === "Solicitudes" && pendingCount > 0 && <b className="owner-badge">{pendingCount}</b>}
          </Link>
        )}
      </nav>
      <div className="owner-bottom">
        <Link href="/#owner-settings" onClick={onClose}><Settings size={19}/>Configuración</Link>
        <button onClick={() => void signOut()}><LogOut size={19}/>Salir</button>
        <p><ShieldCheck size={17}/>Tu información, privada.</p>
      </div>
    </aside>
  </>;
}
