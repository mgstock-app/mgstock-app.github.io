"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Store, Users, Wallet, ChartNoAxesCombined, CalendarDays, Bell, Plus, ArrowRight, Menu, ShieldCheck, Clock3 } from "lucide-react";
import { OwnerSidebar } from "./OwnerSidebar";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { accessApi } from "@/features/access/api";
import { ReportWorkspace } from "@/components/reports/ReportWorkspace";
import type { WorkspaceScreen } from "@/components/reports/ReportWorkspace";
import { SharedOwnerCode } from "@/components/invitations/SharedOwnerCode";
import type { AppLocal, AppUser, AccessRequest } from "@/types/access";
import { createClient } from "@/lib/supabase/browser";
import { selectVisibleCompany } from "@/utils/owner-company";
import "./owner.css";

type Metrics = { id: string; total: number; sent: number; activity: { title: string; date: string; local: string }[] };
export function OwnerHome({user}:{user:AppUser}) {
  const spaces=useOrganizationData();
  const [locals,setLocals]=useState<AppLocal[]>([]);
  const [requests,setRequests]=useState<AccessRequest[]>([]);
  const [people,setPeople]=useState<AppUser[]>([]);
  const [selected,setSelected]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [retryKey,setRetryKey]=useState(0);
  const [open,setOpen]=useState(false);
  const [metrics,setMetrics]=useState<Metrics[]>([]);
  const [scheduleEvents,setScheduleEvents]=useState<{title:string;date:string;local:string}[]>([]);
  const [activeArea,setActiveArea]=useState<"inicio" | WorkspaceScreen>("empleados");
  const root=useRef<HTMLDivElement>(null);
  const company=selectVisibleCompany(spaces.companies, selected, user.organization_id, true);
  const org=spaces.organizations.find(o=>o.id===company?.organization_id);
  const orgLocals=useMemo(()=>locals.filter(l=>l.organization_id===company?.organization_id),[locals,company?.organization_id]);
  const companyLocals=useMemo(()=>orgLocals.filter(l=>l.company_id===company?.id),[orgLocals,company?.id]);
  const ids=companyLocals.map(l=>l.id);
  useEffect(()=>{
    let alive=true;
    async function load(){try{const [l,r,p]=await Promise.race([Promise.all([accessApi.locals(),accessApi.requests(),accessApi.users()]),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("La carga tardó demasiado.")),12000))]);if(alive){setLocals(previous=>JSON.stringify(previous)===JSON.stringify(l)?previous:l);setRequests(r);setPeople(p);setError("");}}catch{if(alive){setError("No se pudieron cargar los locales. Comprobá la conexión y reintentá.");}}finally{if(alive)setLoading(false)}}
    void load();const timer=setInterval(load,15000);return()=>{alive=false;clearInterval(timer)};
  },[retryKey]);
  useEffect(()=>{const el=root.current;const receive=(e:Event)=>setMetrics((e as CustomEvent<Metrics[]>).detail);el?.addEventListener("owner-overview",receive);return()=>el?.removeEventListener("owner-overview",receive)},[]);
  useEffect(()=>{let alive=true;if(!company)return;createClient().from("rm_schedules").select("updated_at").eq("company_id",company.id).order("updated_at",{ascending:false}).limit(4).then(({data,error})=>{if(alive)setScheduleEvents(error?[]:(data||[]).map(s=>({title:"Horarios actualizados",date:s.updated_at,local:company.name})))});return()=>{alive=false}},[company]);
  const scoped=metrics.filter(m=>ids.includes(m.id));
  const total=scoped.reduce((n,m)=>n+m.total,0), sent=scoped.reduce((n,m)=>n+m.sent,0);
  const pending=requests.filter(r=>r.requested_at&&people.some(p=>p.user_id===r.user_id&&p.local_id&&ids.includes(p.local_id)));
  const unassigned=people.filter(p=>p.invited_company_id===company?.id&&p.status==='pending');
  const activity=[...scoped.flatMap(m=>m.activity),...scheduleEvents,...people.filter(p=>p.local_id&&ids.includes(p.local_id)).map(p=>({title:"Colaborador registrado",date:p.created_at,local:p.display_name}))].filter(e=>e.date&&Number.isFinite(Date.parse(e.date))).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,5);
  const pendingCount=pending.length+unassigned.length;
  const goLocals=()=>{root.current?.querySelector<HTMLButtonElement>('#bInicio')?.click();setActiveArea('planillas');setOpen(false)};
  return <div ref={root} className="owner-home" data-owner-locals={ids.join(',')}>
    <OwnerSidebar open={open} onClose={()=>setOpen(false)} currentPath="/" onLocals={goLocals} pendingCount={pendingCount} activeSection={activeArea} companyName={company?.name||org?.name||""} onSectionChange={next=>{setActiveArea(next);setOpen(false);}}/>
    <main className="owner-main"><header className={"owner-header" + (activeArea === "inicio" ? "" : " owner-header--management")}><button className="owner-mobile" aria-label="Abrir menú" aria-expanded={open} onClick={()=>setOpen(!open)}><Menu/></button><div>{activeArea === "inicio" ? <><p className="owner-caption">TU EMPRESA, EN UN VISTAZO</p><h1>Hola, {user.display_name?.split(' ')[0]||'dueño'}<span>.</span></h1><p>Un resumen de {company?.name||'tu empresa'} y sus locales.</p></> : <div className="owner-header-brand"><strong>GEST<span>LOK</span></strong><small>ORGANIZÁ · CONTROLÁ · HACÉ CRECER</small></div>}</div><div className="owner-header-tools"><label>Empresa actual<select aria-label="Empresa actual" value={company?.id||''} onChange={e=>{if(window.confirm('¿Cambiar de empresa? Guardá primero cualquier cambio de la planilla.')){setSelected(e.target.value);setMetrics([]);setScheduleEvents([])}}}>{spaces.companies.map(c=><option key={c.id} value={c.id}>{spaces.organizations.find(o=>o.id===c.organization_id)?.name || 'Empresa'} · {c.name}</option>)}</select></label><Link className="owner-bell" href="/solicitudes" aria-label={`${pendingCount} solicitudes pendientes`}><Bell size={22}/>{pendingCount>0&&<b>{pendingCount}</b>}</Link><div className="owner-user"><span>{user.display_name?.split(' ').map(n=>n[0]).slice(0,2).join('')||'D'}</span><div>{user.display_name}<small>Dueño/a</small></div></div></div></header>
    {(error||spaces.error)&&<div role="alert" className="owner-error">{error||spaces.error} <button type="button" onClick={()=>{setLoading(true);setError("");setRetryKey(k=>k+1);void spaces.refresh();}}>Reintentar</button></div>}
    <section className="owner-management" hidden={activeArea === "inicio"} aria-label="Gestión de empleados y recibos">{companyLocals.length ? <ReportWorkspace key={company?.id} user={user} locals={companyLocals} screen={activeArea === "inicio" ? "empleados" : activeArea} onScreenChange={setActiveArea}/> : loading || spaces.loading ? <p role="status">Cargando locales autorizados…</p> : <p>Esta empresa todavía no tiene locales cargados. <Link href="/locales">Agregar local</Link></p>}</section>
    <div hidden={activeArea !== "inicio"}>
    <section className="owner-summary" aria-label="Resumen general">{[[Store,'Locales',companyLocals.length,'Locales de esta empresa','green'],[Users,'Colaboradores',total,'Planillas individuales','blue'],[ChartNoAxesCombined,'Reportes enviados',sent,`de ${total} planillas actuales`,'purple'],[Clock3,'Solicitudes pendientes',pendingCount,'Requieren tu atención','orange']].map(([Icon,title,value,subtitle,tone])=>{const I=Icon as typeof Store;return <div key={String(title)} className="owner-stat"><span className={`owner-icon ${tone}`}><I size={24}/></span><div><small>{String(title)}</small><strong>{loading?'—':String(value)}</strong><p>{String(subtitle)}</p></div></div>})}</section>
    <div className="owner-grid"><div className="owner-primary"><section className="owner-panel owner-locals" id="owner-locals"><div className="owner-section-heading"><div><h2>Mis locales</h2><p>Elegí dónde querés trabajar hoy.</p></div><Link className="owner-button" href="/locales"><Plus size={16}/>Agregar local</Link></div>{loading||spaces.loading?<p role="status">Cargando tus locales…</p>:(error||spaces.error)?<p role="status">No se pudieron cargar los locales. Usá Reintentar para volver a consultar.</p>:companyLocals.length?<p>Tenés {companyLocals.length} locales disponibles. <button type="button" className="owner-button" onClick={goLocals}>Abrir planillas y horarios</button></p>:<p>Todavía no hay locales en esta empresa. Podés crear el primero desde Agregar local.</p>}</section><section className="owner-panel owner-activity"><h2>Actividad reciente</h2><p>Últimos movimientos registrados de esta empresa.</p>{activity.length?activity.map((a,i)=><div className="owner-activity-row" key={`${a.title}:${a.date}:${i}`}><span className="owner-icon blue"><Clock3 size={17}/></span><div><strong>{a.title}</strong><small>{a.local}</small></div><time>{new Date(a.date).toLocaleString('es-AR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Argentina/Buenos_Aires'})}</time></div>):<p className="owner-empty">No hay actividad registrada para mostrar.</p>}</section></div><aside className="owner-right"><section className="owner-panel"><h2>Acciones rápidas</h2><p>Todo a mano para tu día a día.</p>{[[Wallet,'Cargar liquidación','Prepará los recibos del período','#owner-locals'],[ChartNoAxesCombined,'Ver reportes','Consultá envíos e historial','#owner-locals'],[CalendarDays,'Abrir horarios','Organizá horas y turnos',`/horarios?empresa=${company?.id||''}`],[Users,'Gestionar colaboradores','Cuentas, roles y asignaciones','/usuarios']].map(([Icon,label,sub,href])=>{const I=Icon as typeof Store;const content=<><span className="owner-icon blue"><I size={21}/></span><span><strong>{String(label)}</strong><small>{String(sub)}</small></span><ArrowRight size={16}/></>;return String(href).startsWith('#')?<button key={String(label)} className="owner-action" onClick={goLocals}>{content}</button>:<Link key={String(label)} className="owner-action" href={String(href)}>{content}</Link>})}</section><section className="owner-panel"><h2>Solicitudes pendientes</h2><p>Consultas que requieren tu revisión.</p>{pending.length?pending.slice(0,3).map(r=><div className="owner-request" key={r.user_id}><strong>{r.display_name}</strong><small>Solicita volver a consultar su reporte</small></div>):<p className="owner-empty">No hay solicitudes de reportes pendientes.</p>}{unassigned.length>0&&<Link href="/usuarios">{unassigned.length} registros pendientes de asignación</Link>}<Link className="owner-button secondary" href="/solicitudes">Ver todas <ArrowRight size={15}/></Link></section><p className="owner-security"><ShieldCheck size={18}/>Cada empresa conserva su espacio privado.</p></aside></div>
    <section className="owner-panel owner-settings" id="owner-settings"><details><summary>Configuración y acceso de otros dueños</summary>{org&&<><p>ID de empresa: <strong>{org.owner_public_id||org.id}</strong></p><SharedOwnerCode organization={org.id} canRenew/></>}<Link href="/empresas">Gestionar mis empresas</Link></details></section></div>
    </main></div>;
}
