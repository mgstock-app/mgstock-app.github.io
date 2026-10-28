"use client";
import { useEffect, useState, type ReactNode } from "react";
import { House, ReceiptText, CalendarDays, UserRound, LifeBuoy, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGestlokCompany } from "@/components/gestlok/GestlokContext";
import { EmployeeReport } from "@/components/reports/EmployeeReport";
import { EmployeeScheduleLink } from "@/components/schedules/EmployeeScheduleLink";

type Section = "inicio-colaborador" | "mi-recibo" | "mis-horarios";

function Row({title, Icon, children, onClick, active=false}: {
  title:string; Icon:typeof House; children:ReactNode; onClick:()=>void; active?:boolean;
}) {
  return <button type="button" title={title} aria-label={title} aria-current={active?"page":undefined} onClick={onClick}>
    <Icon size={19} aria-hidden="true"/><span className="gl-employee-nav__label">{children}</span>
  </button>;
}

/** Visual-only navigation; the existing per-user receipt and Google link RPCs
 * retain full control of access. No other employee's data is ever requested. */
export function EmployeePortalShell(){
  const {user,signOut}=useAuth();
  const company=useGestlokCompany();
  const [open,setOpen]=useState(false);
  const [collapsed,setCollapsed]=useState(false);
  const [section,setSection]=useState<Section>("inicio-colaborador");
  useEffect(()=>{
    let active=true;
    queueMicrotask(()=>{
      if(!active)return;
      try{setCollapsed(localStorage.getItem("gestlok:employee-menu-collapsed")==="yes");}catch{}
    });
    return()=>{active=false;};
  },[]);
  if(!user || user.role!=="employee")return null;
  const toggle=()=>{
    const next=!collapsed;
    setCollapsed(next);
    try{localStorage.setItem("gestlok:employee-menu-collapsed",next?"yes":"no");}catch{}
  };
  const go=(id:Section)=>{
    setSection(id);setOpen(false);
    document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});
  };
  const openProfile=()=>{setOpen(false);document.querySelector<HTMLButtonElement>(".module-profile-button")?.click();};
  const openSupport=()=>{
    setOpen(false);
    const link=document.querySelector<HTMLAnchorElement>(".gestlok-help");
    if(link)link.click();
  };
  const companyName=company?.company_name||"Mi empresa";
  const local=user.local_name||"Local asignado";
  const home=process.env.NEXT_PUBLIC_GESTLOK_HOME||"/";
  return <div className={"gl-employee-shell"+(collapsed?" is-collapsed":"")}>
    {open&&<button type="button" className="gl-employee-scrim" aria-label="Cerrar menú" onClick={()=>setOpen(false)}/>}
    <aside className={"gl-employee-sidebar"+(open?" is-open":"")} aria-label="Menú del colaborador">
      <div className="gl-employee-brand">
        <img src={home+"icons/gestlok.svg"} alt="" width={43} height={43}/>
        <div><strong>GESTLOK</strong><small>Todo tu negocio, en orden</small></div>
      </div>
      <button type="button" className="gl-employee-collapse" title={collapsed?"Expandir menú":"Contraer menú"}
        aria-label={collapsed?"Expandir menú lateral":"Contraer menú lateral"} aria-expanded={!collapsed} onClick={toggle}>
        {collapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}
        <span className="gl-employee-nav__label">{collapsed?"Expandir":"Contraer menú"}</span>
      </button>
      <div className="gl-employee-company">
        {company?.logo_id==="mi-gusto"
          ? <img src={home+"img/mi-gusto-blanco.png"} width={100} height={54} alt="Mi Gusto"/>
          : <span className="gl-employee-company__initial">{companyName.charAt(0).toUpperCase()}</span>}
        <div><strong>{companyName}</strong><small>{local} · Colaborador</small></div>
      </div>
      <nav aria-label="Navegación del colaborador">
        <Row title="Inicio" Icon={House} active={section==="inicio-colaborador"} onClick={()=>go("inicio-colaborador")}>Inicio</Row>
        <Row title="Mi recibo personal" Icon={ReceiptText} active={section==="mi-recibo"} onClick={()=>go("mi-recibo")}>Mi recibo</Row>
        <Row title="Horarios de mi local" Icon={CalendarDays} active={section==="mis-horarios"} onClick={()=>go("mis-horarios")}>Horarios</Row>
      </nav>
      <div className="gl-employee-sidebar__bottom">
        <Row title="Mi perfil y empresas" Icon={UserRound} onClick={openProfile}>Mi perfil</Row>
        <Row title="Soporte de GESTLOK" Icon={LifeBuoy} onClick={openSupport}>Soporte</Row>
        <Row title="Cerrar sesión" Icon={LogOut} onClick={()=>void signOut()}>Cerrar sesión</Row>
        <p><ShieldCheck size={16}/> Tu recibo es personal y privado.</p>
      </div>
    </aside>
    <main className="gl-employee-main" id="inicio-colaborador">
      <header className="gl-employee-top">
        <button type="button" className="gl-employee-menu" aria-label="Abrir menú" aria-expanded={open}
          onClick={()=>setOpen(!open)}>{open?<X size={22}/>:<Menu size={22}/>}</button>
        <span>GEST<span>LOK</span></span>
        <small>MI ESPACIO · SOLO LECTURA</small>
      </header>
      <section className="employee-private-portal" aria-label="Mi espacio privado del colaborador">
        <header className="employee-private-portal__hero">
          <span>GESTLOK · MI ESPACIO PERSONAL</span>
          <h1>Hola, {user.display_name?.split(" ")[0]||"colaborador"}</h1>
          <p>Tu recibo de sueldo y los horarios del local que tenés asignado.</p>
          <small>Local: {local}</small>
        </header>
        <div className="employee-private-portal__cards">
          <div id="mi-recibo"><EmployeeReport key={user.user_id+":"+user.sheet_id}/></div>
          <div id="mis-horarios"><EmployeeScheduleLink key={user.user_id+":"+user.local_id}/></div>
        </div>
        <p className="employee-private-portal__privacy">
          <span aria-hidden="true">🔒</span>
          Tu recibo es personal y privado. Solo podés consultar el que publica tu empresa para tu cuenta.
          Los horarios de Google Sheets se abren en vista de lectura.
        </p>
      </section>
    </main>
  </div>;
}
