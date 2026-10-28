"use client";
import { useMemo, useState } from "react";
import { UsersRound, UserRoundCheck, UserRoundX, Clock3, Search, Plus, Store, ChevronRight, FileText, X, RotateCw, ArrowLeft, Pencil } from "lucide-react";
import type { AppLocal } from "@/types/access";
import type { EmployeeRow } from "./EmployeeOverview";
import { normalize, statusLabel } from "./EmployeeOverview";

export function EmployeeDirectory({
  rows, locals, loading, ready, onRefresh, onAdd, onOpen,
}: {
  rows: EmployeeRow[];
  locals: AppLocal[];
  loading: boolean;
  ready: boolean;
  onRefresh: () => void;
  onAdd: (localId: string) => void;
  onOpen: (row: EmployeeRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [localFilter, setLocalFilter] = useState("todos");
  const [closed, setClosed] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showChooseLocal, setShowChooseLocal] = useState(false);
  const filtered = useMemo(() => rows.filter(row =>
    (localFilter === "todos" || row.localId === localFilter) &&
    normalize(row.summary.name + " " + row.summary.role + " " + row.local.name).includes(normalize(query.trim()))
  ), [rows, localFilter, query]);
  const selected = rows.find(row => row.id === selectedId);
  const counts = {
    all: rows.length,
    active: rows.filter(r => r.summary.status === "activo").length,
    rest: rows.filter(r => r.summary.status === "descanso").length,
    reinforcement: rows.filter(r => r.summary.status === "refuerzo").length,
    inactive: rows.filter(r => r.summary.status === "inactivo").length,
  };
  const openNew = () => {
    if (localFilter !== "todos") { onAdd(localFilter); return; }
    if (locals.length === 1) { onAdd(locals[0].id); return; }
    setShowChooseLocal(true);
  };
  return <>
    <div className="employee-pages__heading">
      <div>
        <div className="employee-pages__crumb"><span>Inicio</span><ChevronRight size={13}/><span>Administración de empleados</span></div>
        <h1>Administración de empleados</h1>
        <p>Gestioná tu equipo de todos los locales.</p>
      </div>
      <button className="employee-pages__button employee-pages__button--main" type="button" disabled={!ready || loading || !locals.length} onClick={openNew}><Plus size={18}/> Agregar empleado</button>
    </div>
    <div className="employee-pages__stats">
      {[
        { icon: UsersRound, title: "Total colaboradores", value: counts.all, color: "blue" },
        { icon: UserRoundCheck, title: "Activos", value: counts.active, color: "green" },
        { icon: Clock3, title: "En descanso", value: counts.rest, color: "orange" },
        { icon: UserRoundX, title: "Inactivos", value: counts.inactive, color: "red" },
        ...(counts.reinforcement ? [{ icon: UsersRound, title: "Refuerzos", value: counts.reinforcement, color: "blue" }] : []),
      ].map(metric => <div className="employee-pages__stat" key={metric.title}>
        <span className={"employee-pages__stat-icon employee-pages__stat-icon--" + metric.color}><metric.icon size={23}/></span>
        <div><small>{metric.title}</small><strong>{loading ? "—" : metric.value}</strong></div>
      </div>)}
    </div>
    <div className="employee-pages__filters">
      <label className="employee-pages__search"><Search size={19}/><input value={query} type="search" placeholder="Buscar colaborador por nombre..." onChange={e => setQuery(e.target.value)} aria-label="Buscar colaborador por nombre"/></label>
      <label className="employee-pages__select-wrap">
        <span className="sr-only">Filtrar por local</span>
        <select value={localFilter} onChange={e => setLocalFilter(e.target.value)}>
          <option value="todos">Todos los locales</option>
          {locals.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <button type="button" className="employee-pages__icon-button" aria-label="Actualizar empleados" onClick={onRefresh} disabled={loading}><RotateCw size={18}/></button>
    </div>
    {loading ? <div className="employee-pages__empty" role="status">Cargando colaboradores autorizados…</div> :
      locals.filter(l => localFilter === "todos" || l.id === localFilter).map(local => {
        const employees = filtered.filter(row => row.localId === local.id);
        const hidden = closed.includes(local.id);
        return <section className="employee-pages__location" key={local.id} aria-label={"Colaboradores de " + local.name}>
          <div className="employee-pages__location-head">
            <button type="button" className="employee-pages__location-title" aria-expanded={!hidden} onClick={() => setClosed(old => hidden ? old.filter(id => id !== local.id) : [...old, local.id])}>
              {(() => { const candidate = local.photo_url || local.image_url || local.logo_url; const safe = typeof candidate === "string" && (/^https:\/\//i.test(candidate) || /^\/(?!\/)/.test(candidate)) ? candidate : null; return safe ? <img className="employee-pages__store-photo" src={safe} alt={"Foto de " + local.name} width={64} height={46}/> : <span className="employee-pages__store-icon"><Store size={25}/></span>; })()}
              <strong>{local.name}</strong><span className="employee-pages__count">{employees.length} colaboradores</span>
              <ChevronRight size={20} className={hidden ? "" : "employee-pages__chevron-open"}/>
            </button>
            <button type="button" className="employee-pages__button employee-pages__button--light" disabled={!ready} onClick={() => onAdd(local.id)}><Plus size={17}/> Agregar colaborador</button>
          </div>
          {!hidden && (employees.length
            ? <div className="employee-pages__people-grid">{employees.map((row, i) => <article className="employee-pages__person" key={row.id}>
                <span className={"employee-pages__avatar employee-pages__avatar--" + (i % 6)} aria-hidden="true">{(row.summary.name.trim()[0] || "?").toUpperCase()}</span>
                <div className="employee-pages__person-copy"><strong title={row.summary.name}>{row.summary.name}</strong><span className={"employee-pages__pill employee-pages__pill--" + row.summary.status}>{statusLabel[row.summary.status]}</span></div>
                <button type="button" className="employee-pages__small-action" onClick={() => setSelectedId(row.id)}><FileText size={14}/> Ver legajo</button>
              </article>)}</div>
            : <p className="employee-pages__empty-small">{query ? "No se encontraron colaboradores con esa búsqueda." : "Este local aún no tiene legajos cargados."}</p>)}
        </section>;
      })
    }
    {showChooseLocal && <div className="employee-pages__modal-scrim" role="presentation">
      <section className="employee-pages__modal employee-pages__modal--short" role="dialog" aria-modal="true" aria-label="Elegir local para agregar empleado">
        <div className="employee-pages__modal-head"><h2>¿A qué local pertenece?</h2><button type="button" aria-label="Cerrar" onClick={() => setShowChooseLocal(false)}><X/></button></div>
        <p>Seleccioná el local antes de crear el legajo. Cada empleado pertenece únicamente a su empresa y local autorizados.</p>
        <div className="employee-pages__local-options">{locals.map(l => <button type="button" key={l.id} onClick={() => { setShowChooseLocal(false); onAdd(l.id); }}><Store size={19}/>{l.name}<ChevronRight size={18}/></button>)}</div>
      </section>
    </div>}
    {selected && <div className="employee-pages__modal-scrim" role="presentation">
      <section className="employee-pages__modal" role="dialog" aria-modal="true" aria-label={"Legajo de " + selected.summary.name}>
        <div className="employee-pages__modal-head"><div><span>Legajo del colaborador</span><h2>{selected.summary.name}</h2></div><button type="button" aria-label="Cerrar legajo" onClick={() => setSelectedId(null)}><X/></button></div>
        <div className="employee-pages__legajo-top"><span className="employee-pages__avatar employee-pages__avatar--1">{(selected.summary.name.trim()[0] || "?").toUpperCase()}</span><div><strong>{selected.summary.name}</strong><small>{selected.local.name} · {selected.summary.role}</small><span className={"employee-pages__pill employee-pages__pill--" + selected.summary.status}>{statusLabel[selected.summary.status]}</span></div></div>
        <dl className="employee-pages__legajo-fields">
          <div><dt>Local</dt><dd>{selected.local.name}</dd></div>
          <div><dt>Liquidación</dt><dd>{selected.local.cycle === "semanal" ? "Semanal" : "Mensual"}</dd></div>
          <div><dt>Modalidad</dt><dd>{selected.summary.mode}</dd></div>
          <div><dt>Forma de pago</dt><dd>{selected.summary.payment}</dd></div>
          <div><dt>Último período</dt><dd>{selected.summary.period || "Sin completar"}</dd></div>
          <div><dt>Último reporte</dt><dd>{selected.summary.reportStatus === "enviada" ? "Enviado" : selected.summary.reportStatus === "cargada" ? "Pendiente" : "Sin generar"}</dd></div>
        </dl>
        <p className="employee-pages__privacy">La edición, el historial, el teléfono y los permisos se administran en la planilla privada del empleado.</p>
        <div className="employee-pages__modal-actions"><button type="button" className="employee-pages__button employee-pages__button--light" onClick={() => setSelectedId(null)}><ArrowLeft size={16}/> Volver</button><button type="button" className="employee-pages__button employee-pages__button--main" disabled={!ready} onClick={() => { setSelectedId(null); onOpen(selected); }}><Pencil size={16}/> Abrir y editar legajo</button></div>
      </section>
    </div>}
  </>;
}
