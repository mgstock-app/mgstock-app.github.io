"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Building2, Users, ClipboardList, ShieldCheck, Search, ArrowRight, UserRoundPlus, Store, Eye, KeyRound, CircleCheck, LockKeyhole } from "lucide-react";
import { accessApi } from "@/features/access/api";
import { useOrganizationData } from "@/hooks/use-organization-data";
import type { AppLocal, AppUser, AccessRequest } from "@/types/access";

export function AdminHome() {
  const spaces = useOrganizationData();
  const [locals, setLocals] = useState<AppLocal[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [ownerCount, setOwnerCount] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const results = await Promise.allSettled([accessApi.ownerCount(), accessApi.locals(), accessApi.users(), accessApi.requests()]);
      if (!active) return;
      if (results[0].status === "fulfilled") setOwnerCount(results[0].value);
      if (results[1].status === "fulfilled") setLocals(results[1].value);
      if (results[2].status === "fulfilled") setUsers(results[2].value);
      if (results[3].status === "fulfilled") setRequests(results[3].value);
      setNotice(results.some((r) => r.status === "rejected") ? "Algunos indicadores no pudieron actualizarse. Tus datos no se modificaron." : "");
    }
    void load();
    return () => { active = false; };
  }, []);

  const companies = useMemo(() => spaces.companies.filter((c) => spaces.organizations.some((o) => o.id === c.organization_id)), [spaces.companies, spaces.organizations]);
  const pending = users.filter((u) => u.status === "pending").length + requests.filter((r) => Boolean(r.requested_at)).length;
  const selected = spaces.organizations.find((o) => o.id === selectedId);
  function findCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = search.trim().toLowerCase();
    const found = spaces.organizations.find((o) => o.id.toLowerCase() === value || o.owner_public_id?.toLowerCase() === value);
    setSelectedId(found?.id || "");
  }

  return (
    <div className="gi-admin-dashboard">
      {(notice || spaces.error) && <p className="gi-admin-error" role="alert">{notice || spaces.error}</p>}
      <section className="gi-admin-kpis" aria-label="Indicadores de administración">
        <div className="gi-admin-kpi"><span className="gi-admin-icon green"><Users size={24}/></span><div><small>Dueños registrados</small><strong>{ownerCount ?? "—"}</strong><span>Total de la plataforma</span></div></div>
        <div className="gi-admin-kpi"><span className="gi-admin-icon blue"><ShieldCheck size={24}/></span><div><small>Espacios autorizados</small><strong>{spaces.loading ? "—" : spaces.organizations.length}</strong><span>Acceso de Administración General</span></div></div>
        <div className="gi-admin-kpi"><span className="gi-admin-icon purple"><Building2 size={24}/></span><div><small>Empresas consultables</small><strong>{spaces.loading ? "—" : companies.length}</strong><span>De tus espacios autorizados</span></div></div>
        <div className="gi-admin-kpi"><span className="gi-admin-icon orange"><ClipboardList size={24}/></span><div><small>Solicitudes pendientes</small><strong>{pending}</strong><span>Registros y accesos por revisar</span></div></div>
      </section>

      <div className="gi-admin-grid">
        <section className="gi-admin-card gi-admin-organizations">
          <div className="gi-admin-card-heading"><div><h2>Empresas autorizadas</h2><p>Revisá únicamente las empresas a las que tenés acceso.</p></div><Link href="/empresas">Ver todas <ArrowRight size={15}/></Link></div>
          {spaces.loading ? <p role="status">Cargando empresas…</p> : companies.length ? (
            <div className="gi-admin-table-wrap"><table><thead><tr><th>Espacio / dueño</th><th>Empresa</th><th>Locales</th><th>Acción</th></tr></thead><tbody>
              {companies.map((c) => { const o = spaces.organizations.find((entry) => entry.id === c.organization_id); const count = locals.filter((l) => l.company_id === c.id).length; return (
                <tr key={c.id}><td><strong>{o?.owner_name || o?.name || "Espacio autorizado"}</strong><small>{o?.owner_public_id || "Acceso administrativo"}</small></td><td>{c.name}</td><td>{count}</td><td><Link href={"/empresas/" + encodeURIComponent(c.id)}><Eye size={15}/> Administrar</Link></td></tr>
              ); })}
            </tbody></table></div>
          ) : <p className="gi-admin-none">No tenés empresas autorizadas para consultar.</p>}
        </section>

        <section className="gi-admin-card gi-admin-actions">
          <div className="gi-admin-card-heading"><div><h2>Acciones rápidas</h2><p>Accedé a las tareas administrativas.</p></div></div>
          {[
            { label: "Revisar asignaciones", note: "Aprobar o asignar usuarios", href: "/asignaciones", Icon: CircleCheck },
            { label: "Gestionar dueños", note: "Espacios y autorizaciones", href: "/empresas", Icon: UserRoundPlus },
            { label: "Controlar permisos", note: "Usuarios, roles y accesos", href: "/usuarios", Icon: KeyRound },
            { label: "Revisar locales", note: "Ver sucursales autorizadas", href: "/locales", Icon: Store },
          ].map(({label,note,href,Icon}) => <Link className="gi-admin-action" href={href} key={label}><span className="gi-admin-icon blue"><Icon size={19}/></span><span><strong>{label}</strong><small>{note}</small></span><ArrowRight size={16}/></Link>)}
        </section>
      </div>

      <section className="gi-admin-card gi-admin-lookup" id="consultar-id">
        <div><h2><Search size={23}/> Consultar empresa por ID</h2><p>La búsqueda solo muestra espacios para los que tu cuenta tiene autorización.</p>
          <form onSubmit={findCompany}><label htmlFor="gi-admin-search" className="sr-only">ID de empresa o espacio</label><input id="gi-admin-search" value={search} onChange={(event)=>{setSearch(event.target.value);setSelectedId(null)}} placeholder="ID de empresa o espacio" required/><button type="submit">Buscar</button></form>
          {selectedId !== null && (selected ? <div className="gi-admin-lookup-result"><strong>{selected.name}</strong><span>{companies.filter((c) => c.organization_id === selected.id).length} empresas disponibles</span>{companies.filter((c) => c.organization_id === selected.id).map((c) => <Link key={c.id} href={"/empresas/" + encodeURIComponent(c.id)}>Administrar {c.name} <ArrowRight size={15}/></Link>)}</div> : <p role="status" className="gi-admin-no-result">No se encontró una empresa autorizada con ese ID.</p>)}
        </div>
        <div className="gi-admin-privacy"><LockKeyhole size={23}/><div><strong>No tenés empresas propias asociadas</strong><p>Tu cuenta administra la plataforma. Cada modificación conserva tu identidad y queda registrada.</p></div></div>
      </section>

      <div className="gi-admin-grid gi-admin-bottom">
        <section className="gi-admin-card"><div className="gi-admin-card-heading"><div><h2>Usuarios por revisar</h2><p>Solicitudes visibles de tus espacios autorizados.</p></div><Link href="/usuarios">Ver usuarios <ArrowRight size={15}/></Link></div>
          {users.filter((u) => u.status === "pending").slice(0,5).map((u) => <div className="gi-admin-simple-row" key={u.user_id}><span className="gi-admin-icon orange"><Users size={17}/></span><span><strong>{u.display_name || "Usuario pendiente"}</strong><small>Pendiente de asignación</small></span></div>)}
          {!users.some((u) => u.status === "pending") && <p className="gi-admin-none">No hay usuarios pendientes visibles.</p>}
        </section>
        <section className="gi-admin-card"><h2>Personal de los locales</h2><p><Link href="/personal">Colaboradores</Link> · <Link href="/personal?seccion=recibos">Recibos</Link> · <Link href="/personal?seccion=legajos">Legajos</Link></p><p>Consultá la vista de un dueño autorizado para comprobar sus locales y funcionalidades, y administrá sus liquidaciones, colaboradores y horarios.</p>
          <p className="gi-admin-security"><ShieldCheck size={19}/> Los accesos siguen protegidos por los permisos de Supabase.</p>
          <Link href="/empresas" className="gi-admin-subtle-link">Gestionar autorizaciones <ArrowRight size={15}/></Link>
        </section>
      </div>
    </div>
  );
}

