"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, ClipboardList, Eye, Store, ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { useOrganizationData } from "@/hooks/use-organization-data";
import { accessApi } from "@/features/access/api";
import { createClient } from "@/lib/supabase/browser";
import { resolveOverviewSheetLocal } from "@/utils/overview-sheet-local";
import type { AppLocal } from "@/types/access";

export function AdminOwnerReview() {
  const params = useSearchParams();
  const companyId = params.get("empresa");
  const spaces = useOrganizationData();
  const company = spaces.companies.find((c) => c.id === companyId);
  const org = spaces.organizations.find((o) => o.id === company?.organization_id);
  const [locals, setLocals] = useState<AppLocal[]>([]);
  const [sheetCount, setSheetCount] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const companyLocals = useMemo(() => locals.filter((l) => l.company_id === company?.id && l.organization_id === company?.organization_id), [locals, company]);
  useEffect(() => {
    let active = true;
    if (!company) return;
    accessApi.locals().then((rows) => {
      if (!active) return;
      setLocals(rows.filter((l) => l.organization_id === company.organization_id));
      return createClient().from("rm_test_documents")
        .select("path,data")
        .eq("organization_id", company.organization_id)
        .eq("collection", "hojas")
        .then(({data,error}) => {
          if (!active) return;
          if (error) { setError("No se pudo comprobar el contenido de las planillas."); return; }
          const counts: Record<string,number> = {};
          for (const row of data || []) {
            const local = resolveOverviewSheetLocal(row, rows.filter((l) => l.company_id === company.id && l.organization_id === company.organization_id).map((l) => l.id));
            if (local) counts[local] = (counts[local] || 0) + 1;
          }
          setSheetCount(counts);
        });
    }).catch(() => { if (active) setError("No se pudo cargar la revisión de esta empresa."); });
    return () => { active = false; };
  }, [company]);
  if (spaces.loading) return <p role="status">Comprobando autorización…</p>;
  if (!company || !org) return <div className="gi-admin-card"><h2>Sin acceso</h2><p>La empresa no está disponible o no tenés permiso para revisarla.</p><Link href="/">Volver a Administración General</Link></div>;
  return (
    <section className="gi-admin-review">
      <div className="gi-admin-review-toolbar"><strong><Eye size={19}/> Modo supervisión · Solo lectura</strong><Link href="/"><ArrowLeft size={15}/> Volver a Administración General</Link></div>
      {error && <p role="alert" className="gi-admin-error">{error}</p>}
      <div className="gi-admin-card"><span className="gi-admin-eyebrow">VISTA DE LA EMPRESA AUTORIZADA</span><h2>{company.name}</h2><Link href={`/empresas/empresa/?id=${company.id}`}>Abrir administración completa</Link><p>Espacio: {org.name}. Esta revisión muestra las funciones y datos generales que deberían estar disponibles para el dueño. No reproduce su sesión personal ni permite editar liquidaciones.</p></div>
      <div className="gi-admin-kpis">
        <div className="gi-admin-kpi"><span className="gi-admin-icon green"><Store size={23}/></span><div><small>Locales</small><strong>{companyLocals.length}</strong><span>De esta empresa</span></div></div>
        <div className="gi-admin-kpi"><span className="gi-admin-icon purple"><ClipboardList size={23}/></span><div><small>Planillas existentes</small><strong>{companyLocals.reduce((n,l)=>n+(sheetCount[l.id]||0),0)}</strong><span>Sin mostrar importes</span></div></div>
      </div>
      <div className="gi-admin-grid">
        <section className="gi-admin-card"><h2>Mis locales · Vista de supervisión</h2><p>Verificá los períodos y la existencia de planillas originales.</p>
          <div className="gi-admin-review-details">{companyLocals.map((l) => <article key={l.id}><span className="gi-admin-eyebrow">LOCAL</span><h2>{l.name}</h2><p>Liquidación {l.cycle}</p><strong>{sheetCount[l.id] ?? "—"} planillas</strong><small>ID interno: {l.id}</small></article>)}</div>
          {companyLocals.length === 0 && <p>No hay sucursales visibles con tus permisos actuales.</p>}
        </section>
        <aside className="gi-admin-card"><h2>Accesos del panel de dueño</h2><p>Acciones para comprobar que la navegación esté configurada. No se ejecutarán acciones del dueño.</p>
          {[["Mis empresas","/empresas"],["Locales","/locales"],["Colaboradores","/usuarios"],["Liquidaciones y reportes","#"],["Horarios","/horarios"],["Solicitudes","/solicitudes"]].map(([label,href]) => <div className="gi-admin-simple-row" key={label}><span className="gi-admin-icon blue">{href==="#"?<LockKeyhole size={18}/>:<Building2 size={18}/>}</span><span><strong>{label}</strong><small>Función disponible para el dueño, sujeta a permisos de su cuenta</small></span></div>)}
          <p className="gi-admin-security"><ShieldCheck size={18}/> Para probar edición y envío, utilizá una empresa de pruebas.</p>
        </aside>
      </div>
    </section>
  );
}

