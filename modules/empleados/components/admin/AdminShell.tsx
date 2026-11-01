"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, Users, ShieldCheck, Store, CalendarDays, ClipboardList, UserCheck, Search, LogOut, Menu, X, Bell, LockKeyhole, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import "./admin.css";

const sections = [
  { href: "/", label: "Inicio", Icon: LayoutDashboard },
  { href: "/vista-dueno", label: "Panel Mi Gusto", Icon: Store },
  { href: "/empresas", label: "Dueños y empresas", Icon: Building2 },
  { href: "/personal", label: "Colaboradores", Icon: Users },
  { href: "/personal?seccion=legajos", label: "Legajos", Icon: UserCheck },
  { href: "/horarios", label: "Horarios", Icon: CalendarDays },
  { href: "/personal?seccion=recibos", label: "Recibos", Icon: ClipboardList },
  { href: "/usuarios", label: "Cuentas y permisos", Icon: Users },
  { href: "/asignaciones", label: "Roles y asignaciones", Icon: ShieldCheck },
  { href: "/locales", label: "Locales", Icon: Store },
  { href: "/solicitudes", label: "Solicitudes de acceso", Icon: ClipboardList },
  { href: "/preautorizaciones", label: "Preautorizar usuarios", Icon: UserCheck },
  { href: "/#consultar-id", label: "Consultar por ID", Icon: Search },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(()=>{
    let active=true;
    queueMicrotask(()=>{
      if(!active)return;
      try{setCollapsed(localStorage.getItem("gestlok:admin-menu-collapsed")==="yes");}catch{}
    });
    return()=>{active=false;};
  },[]);
  const toggleCollapsed=()=>{
    const next=!collapsed;
    setCollapsed(next);
    try{localStorage.setItem("gestlok:admin-menu-collapsed",next?"yes":"no");}catch{}
  };
  if (user?.role !== "admin" || user.status !== "approved") return <>{children}</>;
  const firstName = user.display_name?.trim().split(" ")[0] || "Administradora";
  const section = sections.find((item) => item.href === pathname)?.label || "GESTLOK · Empleados";
  return (
    <div className={"gi-admin-shell" + (collapsed ? " is-collapsed" : "")}>
      {menuOpen && <button type="button" aria-label="Cerrar menú" className="gi-admin-scrim" onClick={() => setMenuOpen(false)} />}
      <aside className={menuOpen ? "gi-admin-sidebar is-open" : "gi-admin-sidebar"}>
        <Link href="/" className="gi-admin-brand" onClick={() => setMenuOpen(false)}>
          <span className="gi-admin-logo">GL</span><span className="gi-admin-brand-text">GESTLOK · Empleados<small>Administradora general</small></span>
        </Link>
        <button type="button" className="gi-admin-collapse" aria-label={collapsed ? "Expandir menú lateral" : "Contraer menú lateral"} aria-expanded={!collapsed} onClick={toggleCollapsed}>{collapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}<span>{collapsed ? "Expandir menú" : "Contraer menú"}</span></button>
        <nav aria-label="Navegación de administración">
          {sections.map(({ href, label, Icon }) => (
            <Link key={label} href={href} title={label} aria-current={pathname === href ? "page" : undefined} onClick={() => setMenuOpen(false)}>
              <Icon size={18} aria-hidden="true" /><span className="gi-admin-nav-label">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="gi-admin-sidebar-bottom">
          <p><LockKeyhole size={16} aria-hidden="true" /> Solo espacios autorizados</p>
          <button type="button" onClick={() => void signOut()} title="Salir"><LogOut size={18} /><span className="gi-admin-nav-label">Salir</span></button>
        </div>
      </aside>
      <div className="gi-admin-content">
        <header className="gi-admin-header">
          <button type="button" className="gi-admin-menu-button" aria-label={menuOpen ? "Cerrar navegación" : "Abrir navegación"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <div><span className="gi-admin-eyebrow">ADMINISTRACIÓN GENERAL</span>
            <h1>{pathname === "/" ? "Hola, " + firstName : section}</h1>
            <p>{pathname === "/" ? "Control de usuarios, accesos y empresas autorizadas." : "Herramientas de administración de la plataforma."}</p>
          </div>
          <div className="gi-admin-account">
            <Link href="/asignaciones" title="Asignaciones pendientes" aria-label="Ver asignaciones"><Bell size={20} /></Link>
            <span className="gi-admin-avatar">{user.display_name?.split(" ").map((part) => part[0]).slice(0,2).join("").toUpperCase() || "AD"}</span>
            <span className="gi-admin-account-name">{user.display_name}<small>Administradora general</small></span>
          </div>
        </header>
        <main className="gi-admin-main">{children}</main>
      </div>
      <nav className="gl-module-dock" aria-label="Navegación móvil de administración general">
        <Link href="/" aria-current={pathname==="/"?"page":undefined} onClick={()=>setMenuOpen(false)}><LayoutDashboard size={20}/>Inicio</Link>
        <Link href="/empresas" aria-current={pathname==="/empresas"?"page":undefined} onClick={()=>setMenuOpen(false)}><Building2 size={20}/>Empresas</Link>
        <Link href="/personal" onClick={()=>setMenuOpen(false)}><Users size={20}/>Personal</Link>
        <Link href="/asignaciones" aria-current={pathname==="/asignaciones"?"page":undefined} onClick={()=>setMenuOpen(false)}><ShieldCheck size={20}/>Roles</Link>
        <button type="button" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}><Menu size={20}/>Más</button>
      </nav>
    </div>
  );
}
