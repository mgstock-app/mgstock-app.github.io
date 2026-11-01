"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { accessApi } from "@/features/access/api";
import { ReportWorkspace, type WorkspaceScreen } from "@/components/reports/ReportWorkspace";
import { ManagerLegajos } from "@/components/legajos/ManagerLegajos";
import type { AppLocal, AppUser } from "@/types/access";

export function AdminPersonnel() {
 const {user}=useAuth();
 const spaces=useOrganizationData();
 const params=useSearchParams();
 const [locals,setLocals]=useState<AppLocal[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [companyId,setCompanyId]=useState("");
 const [localId,setLocalId]=useState<string|null>(null);
 const [tab,setTab]=useState(params.get("seccion")==="recibos"?"recibos":params.get("seccion")==="legajos"?"legajos":"empleados");
 const [screen,setScreen]=useState<WorkspaceScreen>(tab==="recibos"?"recibos":"empleados");
 const requestedSection=params.get("seccion");
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(!active)return;const next=requestedSection==="recibos"?"recibos":requestedSection==="legajos"?"legajos":"empleados";setTab(next);if(next!=="legajos")setScreen(next);});return()=>{active=false;};},[requestedSection]);
 useEffect(()=>{let active=true;accessApi.locals().then(rows=>{if(active)setLocals(rows);}).catch(()=>{if(active)setError("No pudimos cargar los locales autorizados.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const companies=spaces.companies.filter(c=>spaces.organizations.some(o=>o.id===c.organization_id));
 const requestedOrg=spaces.organizations.find(o=>o.owner_public_id===params.get("espacio"));
 const company=companies.find(c=>c.id===companyId)||companies.find(c=>c.organization_id===requestedOrg?.id)||companies.find(c=>locals.some(l=>l.company_id===c.id))||companies[0];
 const activeCompanyId=company?.id;
 const organizationId=company?.organization_id;
 const companyLocals=locals.filter(l=>l.company_id===activeCompanyId&&l.organization_id===organizationId);
 const requestedLocal=params.get("local");
 const initialLocal=companyLocals.find(l=>l.id===requestedLocal||l.name.toLowerCase().includes(requestedLocal==="torcuato"?"torcuato":requestedLocal||"__none__"));
 const selectedLocal=localId??initialLocal?.id??"";
 if(user?.role!=="admin"||user.status!=="approved")return <p role="alert">Acceso exclusivo de Administración General.</p>;
 if(loading||spaces.loading)return <p role="status">Cargando colaboradores y recibos…</p>;
 if(error||spaces.error)return <p role="alert">{error||spaces.error}</p>;
 return <section className="management-page">
  <h1>Colaboradores, recibos y legajos</h1>
  <p>Administrá el personal del local seleccionado con tu cuenta de Administradora General.</p>
  <div className="locals-grid">
   <label>Empresa<select value={company?.id||""} onChange={e=>{setCompanyId(e.target.value);setLocalId("");}}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>Local<select value={selectedLocal} onChange={e=>setLocalId(e.target.value)}><option value="">Todos los locales de esta empresa</option>{companyLocals.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
  </div>
  <nav className="employee-pages__nav" aria-label="Gestión del personal">{[["empleados","Colaboradores"],["recibos","Recibos"],["legajos","Legajos"]].map(([id,label])=><button key={id} type="button" aria-current={tab===id?"page":undefined} onClick={()=>{setTab(id);if(id!=="legajos")setScreen(id as WorkspaceScreen);}}>{label}</button>)}</nav>
  <PersonnelReports user={user} locals={locals} companyId={activeCompanyId} organizationId={organizationId} localId={selectedLocal} tab={tab} screen={screen} onScreenChange={setScreen}/>

 </section>;
}

function PersonnelReports({user,locals,companyId,organizationId,localId,tab,screen,onScreenChange}:{user:AppUser;locals:AppLocal[];companyId?:string;organizationId?:string;localId:string;tab:string;screen:WorkspaceScreen;onScreenChange:(screen:WorkspaceScreen)=>void}){
 const scoped=useMemo(()=>locals.filter(l=>l.company_id===companyId&&l.organization_id===organizationId&&(!localId||l.id===localId)),[locals,companyId,organizationId,localId]);
 if(!scoped.length)return <p>Esta empresa todavía no tiene locales habilitados.</p>;
 return <>
  <div style={{display:tab==="legajos"?"none":"block"}}><ReportWorkspace key={companyId+":"+localId} user={user} locals={scoped} screen={screen} onScreenChange={onScreenChange}/></div>
  {tab==="legajos"&&<ManagerLegajos ownerView localScope={scoped}/>}
 </>;
}
