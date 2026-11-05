"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Building2, Store, ArrowRight, Plus, Package, Tags, ScanBarcode, CalendarDays, Users, Settings2, ShieldCheck, CreditCard, Search } from "lucide-react";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { useEffect, useState } from "react";
import { accessApi } from "@/features/access/api";
import type { AppLocal } from "@/types/access";
import "./admin-home-overview.css";

const apps = [
 {label:"Caja",detail:"Cobros y movimientos",Icon:CreditCard},
 {label:"Stock local",detail:"Productos y existencias",Icon:Package},
 {label:"Precios",detail:"Costos y márgenes",Icon:Tags},
 {label:"Sistema de ventas",detail:"Escáner y carrito",Icon:ScanBarcode},
 {label:"Horarios",detail:"Turnos y planillas",Icon:CalendarDays},
 {label:"Empleados",detail:"Colaboradores y recibos",Icon:Users}
];
export function AdminHomeOverview(){
 const spaces=useOrganizationData();
 const [locals,setLocals]=useState<AppLocal[]>([]);
 const [localError,setLocalError]=useState(false);
 useEffect(()=>{let active=true;accessApi.locals().then(data=>{if(active)setLocals(data);}).catch(()=>{if(active)setLocalError(true);});return()=>{active=false;};},[]);
 const companies=useMemo(()=>spaces.companies.filter(c=>spaces.organizations.some(o=>o.id===c.organization_id)),[spaces.companies,spaces.organizations]);
 return <div className="gi-overview">
  <section className="gi-overview-hero"><div><span>GESTLOK · ADMINISTRACIÓN GENERAL</span><h2>Todo tu negocio, en orden</h2><p>Tus empresas, sus locales y las herramientas de cada negocio en un solo lugar.</p></div><ShieldCheck size={36} aria-hidden="true"/></section>
  <section className="gi-overview-section" aria-labelledby="gi-my-companies"><div className="gi-overview-title"><h2 id="gi-my-companies"><Building2 size={24}/> Mis empresas</h2><Link href="/empresas">Ver todas <ArrowRight size={17}/></Link></div>
   {spaces.error&&<p role="alert" className="gi-admin-error">{spaces.error}</p>}
   {spaces.loading?<p role="status">Cargando empresas autorizadas…</p>:companies.length===0?<p>No hay empresas autorizadas disponibles.</p>:
   <div className="gi-overview-companies">{companies.map(company=>{
    const companyLocals=locals.filter(local=>local.company_id===company.id);
    return <article className="gi-overview-company" key={company.id}>
      <div className="gi-overview-company-top"><span className="gi-overview-company-icon"><Store size={26}/></span><div><h3>{company.name}</h3><small>{companyLocals.length} {companyLocals.length===1?"local":"locales"}</small></div><Link href={"/empresas/"+encodeURIComponent(company.id)} aria-label={"Administrar "+company.name}><ArrowRight size={23}/></Link></div>
      {companyLocals.length>0?<div className="gi-overview-locals">{companyLocals.map(local=><Link key={local.id} href={"/empresas/"+encodeURIComponent(company.id)} className="gi-overview-local"><Store size={19}/><span><strong>{local.name}</strong><small>Liquidación {local.cycle}</small></span><ArrowRight size={16}/></Link>)}</div>:<p className="gi-overview-empty">{localError?"No se pudieron consultar los locales.":"No hay locales disponibles para esta empresa."}</p>}
    </article>;
   })}</div>}
  </section>
  <section className="gi-overview-section" aria-labelledby="gi-microapps"><div className="gi-overview-title"><h2 id="gi-microapps"><Settings2 size={24}/> Mis micro apps</h2></div><p className="gi-overview-note">Elegí una empresa y su local para usar las herramientas habilitadas. Los accesos dependen del plan y los permisos de cada negocio.</p>
   <div className="gi-overview-apps">{apps.map(({label,detail,Icon},index)=><Link href="/empresas" key={label} className={"gi-overview-app gi-overview-app-"+index}><Icon size={28}/><strong>{label}</strong><small>{detail}</small></Link>)}</div>
  </section>
  <section className="gi-overview-section"><div className="gi-overview-title"><h2><Settings2 size={24}/> Administración de GESTLOK</h2></div>
   <div className="gi-overview-adminlinks"><Link href="/usuarios"><Users size={19}/> Usuarios y permisos</Link><Link href="/asignaciones"><ShieldCheck size={19}/> Roles y asignaciones</Link><Link href="/solicitudes"><Search size={19}/> Solicitudes</Link><Link href="/empresas"><Plus size={19}/> Empresas y locales</Link></div>
  </section>
 </div>;
}
