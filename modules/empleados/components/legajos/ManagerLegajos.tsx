"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronRight, Clock3, ExternalLink, FileText, History, MoreVertical, Plus, UserRoundPlus, RotateCw, Save, Search, Store, UserRoundCheck, UserRoundX, UsersRound, X } from "lucide-react";
import type { AppLocal } from "@/types/access";
import { BranchScheduleLink } from "@/components/schedules/BranchScheduleLink";
import { ManagerStaffInvite } from "@/components/invitations/ManagerStaffInvite";
import {
  type Legajo, type LegajoInput, type LegajoHistory, type PreviousEmployee, type LegajoStatus,
  loadLegajoLocals, loadLegajos, loadPreviousEmployees, createLegajo, updateLegajo,
  loadLegajoHistory, dateToDisplay, dateToIso, stateNames,
} from "@/features/legajos/api";
import "./manager-legajos.css";

type StaffCard = {
  key: string;
  local: AppLocal;
  fullName: string;
  status: LegajoStatus;
  profile: Legajo | null;
  previous: PreviousEmployee | null;
  pending: boolean;
};
const normalized = (s: string) => s.trim().toLocaleLowerCase("es-AR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const fullName = (p: Legajo) => p.first_name + " " + p.last_name;
const localTitle = (local: AppLocal): string =>
  local.id === "dt" && /^torcuato$/i.test(local.name.trim())
    ? "Don Torcuato" : local.name;
const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return { first_name: parts.shift() || "", last_name: parts.join(" ") };
};
const freshDraft = (l: AppLocal): LegajoInput => ({
  organization_id: l.organization_id, local_id: l.id, first_name: "", last_name: "",
  phone: "", payment_alias: "", notes: "", status: "activo", reinforcement_dates: [],
  last_worked_on: null, started_on: null,
});
const editDraft = (p: Legajo): LegajoInput => ({
  organization_id: p.organization_id, local_id: p.local_id,
  first_name: p.first_name, last_name: p.last_name, phone: p.phone,
  payment_alias: p.payment_alias, notes: p.notes, status: p.status,
  reinforcement_dates: [...p.reinforcement_dates], last_worked_on: p.last_worked_on,
  started_on: p.started_on,
});
const dateWithTime = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("es-AR", {timeZone:"America/Argentina/Buenos_Aires",dateStyle:"short",timeStyle:"short"}) : "";
};
function LocalPortrait({ local }: { local: AppLocal }) {
  const image = local.photo_url || local.image_url || local.logo_url;
  const safe = typeof image === "string" &&
    (/^https:\/\//i.test(image) || /^\/(?!\/)/.test(image)) ? image : "";
  return safe ? <img className="mlg-local-photo" src={safe} alt={"Foto de " + localTitle(local)}/> :
    <span className="mlg-local-photo mlg-local-photo--fallback" aria-hidden="true"><Store size={27}/></span>;
}
export function ManagerLegajos({ ownerView = false, localScope }: {
  ownerView?: boolean;
  localScope?: AppLocal[];
}) {
  const [locals, setLocals] = useState<AppLocal[]>([]);
  const [profiles, setProfiles] = useState<Legajo[]>([]);
  const [previous, setPrevious] = useState<PreviousEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState("");
  const [localFilter, setLocalFilter] = useState("todos");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [chosenLocal, setChosenLocal] = useState<AppLocal | null>(null);
  const [editing, setEditing] = useState<Legajo | null>(null);
  const [draft, setDraft] = useState<LegajoInput | null>(null);
  const [newDate, setNewDate] = useState("");
  const [lastDate, setLastDate] = useState("");
  const [startedDate, setStartedDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<LegajoHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const scopedKey = localScope?.map(l=>l.organization_id+":"+l.id).join("|") || "";
  const updateView = useCallback(() => setReload(k=>k+1), []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const permitted = await loadLegajoLocals();
        if (!alive) return;
        const selected = localScope ? new Set(localScope.map(l=>l.organization_id+":"+l.id)) : null;
        const visible = selected ? permitted.filter(l=>selected.has(l.organization_id+":"+l.id)) : permitted;
        const [people, legacy] = await Promise.all([
          loadLegajos(visible),
          ownerView ? Promise.resolve([] as PreviousEmployee[]) : loadPreviousEmployees(visible),
        ]);
        if (!alive) return;
        setLocals(visible);
        setProfiles(people);
        setPrevious(legacy);
        setError("");
      } catch(cause) {
        if (alive) {
          setLocals([]); setProfiles([]); setPrevious([]);
          setError(cause instanceof Error ? cause.message : "No se pudieron cargar los legajos.");
        }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [reload, ownerView, scopedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    window.addEventListener("focus", updateView);
    return () => window.removeEventListener("focus", updateView);
  }, [updateView]);
  useEffect(() => {
    if (ownerView) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) updateView();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [ownerView,updateView]);
  const rows = useMemo<StaffCard[]>(() => {
    const byLocal = new Map(locals.map(l => [l.id, l]));
    const actual = profiles.flatMap(p => {
      const local = byLocal.get(p.local_id);
      return local && local.organization_id === p.organization_id
        ? [{ key: p.id, local, fullName: fullName(p), status: p.status, profile: p, previous: null, pending: !!p.needs_completion }] : [];
    });
    const known = new Set(actual.map(p => p.local.id + ":" + normalized(p.fullName)));
    const fromOld = previous.flatMap(p => {
      const local = byLocal.get(p.local_id);
      if (!local || local.organization_id !== p.organization_id ||
          known.has(local.id + ":" + normalized(p.full_name))) return [];
      return [{ key: p.source_id, local, fullName: p.full_name, status: p.status,
        profile: null, previous: p, pending: false }];
    });
    return [...actual, ...fromOld].sort((a,b)=>Number(b.pending)-Number(a.pending)||a.fullName.localeCompare(b.fullName, "es-AR"));
  }, [locals,profiles,previous]);
  const filtered = rows.filter(r =>
    (localFilter === "todos" || r.local.id === localFilter)
    && normalized(r.fullName).includes(normalized(search))
  );
  const totals = {
    all: filtered.length,
    active: filtered.filter(r=>r.status==="activo").length,
    reinforcement: filtered.filter(r=>r.status==="refuerzo").length,
    inactive: filtered.filter(r=>r.status==="inactivo").length,
  };
  const close = () => {
    if (saving) return;
    setDraft(null); setEditing(null); setChosenLocal(null);
    setShowHistory(false); setHistory([]); setNewDate("");
  };
  const open = (local: AppLocal, record?: StaffCard) => {
    const existing = record?.profile || null;
    const next = existing ? editDraft(existing) : freshDraft(local);
    if (record && !existing) {
      const name = splitName(record.fullName);
      next.first_name = name.first_name;
      next.last_name = name.last_name;
      next.status = record.status === "refuerzo" || record.status === "inactivo" ? "activo" : record.status;
    }
    setChosenLocal(local); setEditing(existing); setDraft(next);
    setNewDate(""); setLastDate(dateToDisplay(next.last_worked_on));
    setStartedDate(dateToDisplay(next.started_on));
    setShowHistory(false); setHistory([]); setError(""); setInfo("");
  };
  const update = <K extends keyof LegajoInput>(key: K, value: LegajoInput[K]) =>
    setDraft(current => current ? { ...current, [key]: value } : current);
  const addDate = () => {
    if (!draft) return;
    const date = dateToIso(newDate);
    if (!date) { setError("Escribí una fecha válida en formato dd/mm/aaaa."); return; }
    update("reinforcement_dates", [...new Set([...draft.reinforcement_dates,date])].sort());
    setNewDate(""); setError("");
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !chosenLocal || ownerView || saving) return;
    if (draft.organization_id !== chosenLocal.organization_id || draft.local_id !== chosenLocal.id) return;
    if (lastDate && !dateToIso(lastDate)) { setError("Ingresá una fecha de baja válida (dd/mm/aaaa)."); return; }
    if (startedDate && !dateToIso(startedDate)) { setError("Ingresá una fecha de ingreso válida (dd/mm/aaaa)."); return; }
    const input: LegajoInput = {
      ...draft, last_worked_on: draft.status === "inactivo" ? dateToIso(lastDate) : null,
      started_on: startedDate ? dateToIso(startedDate) : null,
    };
    setSaving(true); setError("");
    try {
      const saved = editing ? await updateLegajo(editing, input) : await createLegajo(input);
      setProfiles(list => [...list.filter(p=>p.id!==saved.id),saved]);
      setInfo("Legajo guardado. Ya puede consultarlo la administración de esta empresa.");
      closeAfterSave();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el legajo.");
    } finally { setSaving(false); }
  };
  const closeAfterSave = () => {
    setDraft(null); setEditing(null); setChosenLocal(null);
    setShowHistory(false); setHistory([]); setNewDate("");
  };
  const viewHistory = async () => {
    if (!editing) return;
    setShowHistory(true); setHistoryLoading(true); setError("");
    try { setHistory(await loadLegajoHistory(editing)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo abrir el historial."); }
    finally { setHistoryLoading(false); }
  };
  return <section className={"mlg-board" + (ownerView ? " mlg-board--owner" : "")} aria-label={ownerView ? "Legajos registrados por gerentes" : "Administración de empleados del gerente"}>
    {ownerView ? <div className="mlg-intro mlg-intro--owner"><div><h2>Legajos informados por gerentes</h2><p>Estados, refuerzos y bajas registrados en los locales de tu empresa.</p></div><button type="button" onClick={updateView} aria-label="Actualizar legajos de gerentes"><RotateCw size={17}/> Actualizar</button></div> :
      <div className="mlg-intro"><div><small>GESTLOK · {locals.length === 1 ? localTitle(locals[0]).toUpperCase() : "ADMINISTRACIÓN DE EMPLEADOS"}</small><h1>Administración de empleados</h1><p>{locals.length === 1 ? "Legajos y estados del equipo de " + localTitle(locals[0]) + "." : "Gestioná los legajos de tus locales autorizados."}</p></div>
        <div className="mlg-intro-actions">
          <button type="button" className="mlg-invite" disabled={loading || !locals.length} onClick={()=>setShowInvite(true)}><UserRoundPlus size={18}/> Invitar Colaborador</button>
          <button type="button" className="mlg-primary" disabled={loading || !locals.length} onClick={()=>open(locals.find(l=>l.id===localFilter) || locals[0])}><Plus size={18}/> Agregar colaborador</button>
        </div>
      </div>}
    {!ownerView && <div className="mlg-stats">
      <div><UsersRound color="#2574d4"/><span>Total colaboradores</span><strong>{loading?"—":totals.all}</strong></div>
      <div><UserRoundCheck color="#168855"/><span>Activos</span><strong>{loading?"—":totals.active}</strong></div>
      <div><Clock3 color="#db840f"/><span>Refuerzos</span><strong>{loading?"—":totals.reinforcement}</strong></div>
      <div><UserRoundX color="#c73b51"/><span>Inactivos</span><strong>{loading?"—":totals.inactive}</strong></div>
    </div>}
    <div className="mlg-filters"><label><Search size={18}/><input type="search" placeholder="Buscar colaborador por nombre…" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Buscar colaborador"/></label>
      {locals.length === 1
        ? <span className="mlg-current-local"><Store size={16}/>{localTitle(locals[0])}</span>
        : <select aria-label="Filtrar por local" value={localFilter} onChange={e=>setLocalFilter(e.target.value)}>
            <option value="todos">Todos los locales</option>{locals.map(l=><option key={l.id} value={l.id}>{localTitle(l)}</option>)}
          </select>}
      <button type="button" onClick={updateView} aria-label="Actualizar" disabled={loading}><RotateCw size={18}/></button>
    </div>
    {error && <p className="mlg-error" role="alert">{error}</p>}
    {info && <p className="mlg-success" role="status">{info}</p>}
    {loading ? <p className="mlg-empty" role="status">Cargando legajos autorizados…</p> : !locals.length ? <p className="mlg-empty">No hay locales de empleados habilitados para esta cuenta.</p> :
      locals.filter(l=>localFilter==="todos"||l.id===localFilter).map(local=>{
        const staff = filtered.filter(r=>r.local.id===local.id);
        const closed = collapsed.includes(local.id);
        return <section key={local.id} className="mlg-local" aria-label={"Colaboradores de "+localTitle(local)}>
          <div className="mlg-local-head"><button type="button" aria-expanded={!closed} onClick={()=>setCollapsed(a=>closed?a.filter(v=>v!==local.id):[...a,local.id])}>
            <LocalPortrait local={local}/><strong>{localTitle(local)}</strong><span>{staff.length} colaboradores</span><ChevronRight className={closed?"":"mlg-chevron"} size={19}/>
          </button>{!ownerView&&<button type="button" className="mlg-add" onClick={()=>open(local)}><Plus size={17}/> Agregar colaborador</button>}</div>
          {!closed && (staff.length ? <div className="mlg-cards">{staff.map((person,i)=><article className="mlg-person" key={person.key}>
            <span className={"mlg-avatar mlg-avatar--"+i%5} aria-hidden="true">{(person.fullName[0]||"?").toUpperCase()}</span>
            <div className="mlg-person-name"><strong>{person.fullName}</strong><span className={"mlg-status mlg-status--"+person.status}>{stateNames[person.status]}</span>{person.pending&&<span className="mlg-pending">Pendiente de completar</span>}</div>
            <button type="button" className="mlg-view" onClick={()=>open(local,person)}><FileText size={15}/> Ver legajo</button>
            <button type="button" className="mlg-more" aria-label={"Detalle de "+person.fullName} onClick={()=>open(local,person)}><MoreVertical size={17}/></button>
          </article>)}</div> : <p className="mlg-empty">{search?"Sin resultados con ese nombre.":"Todavía no hay colaboradores registrados en este local."}</p>)}
          {!ownerView && !closed && <div className="mlg-google"><div><ExternalLink size={19}/><strong>Google Sheets · {localTitle(local)}</strong><span>Horarios y planillas del local</span></div><BranchScheduleLink local={local.id}/></div>}
        </section>;
      })}
    {showInvite && !ownerView && locals.length>0 && <ManagerStaffInvite
      locals={locals} initialLocal={localFilter==="todos"?"":localFilter}
      onClose={()=>{setShowInvite(false);updateView();}}/>}
    {draft && chosenLocal && <div className="mlg-overlay">
      <section className="mlg-modal" role="dialog" aria-modal="true" aria-label={"Legajo en "+localTitle(chosenLocal)}>
        <div className="mlg-modal-head"><div><small>LEGAJO · {localTitle(chosenLocal).toUpperCase()}</small><h2>{editing?fullName(editing):"Datos del colaborador"}</h2></div><button type="button" aria-label="Cerrar legajo" onClick={close} disabled={saving}><X size={20}/></button></div>
        <div className="mlg-tabs" role="tablist" aria-label="Datos e historial del legajo"><button type="button" role="tab" aria-selected={!showHistory} onClick={()=>setShowHistory(false)}>Datos personales</button><button type="button" role="tab" aria-selected={showHistory} disabled={!editing} onClick={()=>void viewHistory()}><History size={16}/> Historial de cambios</button></div>
        {showHistory && editing ? <div className="mlg-history">
          {historyLoading ? <p role="status">Cargando historial…</p> : history.length ? history.map(e=><article key={e.id}><div><strong>{e.action==="alta"?"Alta de colaborador":"Actualización de legajo"}</strong><span>{dateWithTime(e.recorded_at)}</span></div>
            <p>{e.previous_status && e.previous_status!==e.status?stateNames[e.previous_status]+" → ":""}<b>{stateNames[e.status]}</b></p>
            {e.reinforcement_dates.length>0&&<small>Refuerzos: {e.reinforcement_dates.map(dateToDisplay).join(", ")}</small>}
            {e.last_worked_on&&<small>Último día trabajado: {dateToDisplay(e.last_worked_on)}</small>}
          </article>) : <p>Sin cambios registrados todavía.</p>}
          <button type="button" className="mlg-secondary" onClick={()=>setShowHistory(false)}><ArrowLeft size={16}/> Volver al legajo</button>
        </div> : <form className="mlg-form" onSubmit={e=>void save(e)}>
          {!editing && ownerView && <p>Este colaborador figura en una planilla anterior, pero todavía no tiene un legajo creado por el gerente.</p>}
          {editing?.needs_completion && <p className="mlg-pending-notice">Este legajo fue creado automáticamente al aceptar la invitación. Completá los datos del nuevo colaborador y guardá para finalizarlo.</p>}
          <div className="mlg-form-grid">
            <label>Nombre *<input required maxLength={100} value={draft.first_name} onChange={e=>update("first_name",e.target.value)} disabled={ownerView||saving} placeholder="Nombre"/></label>
            <label>Apellido *<input required maxLength={100} value={draft.last_name} onChange={e=>update("last_name",e.target.value)} disabled={ownerView||saving} placeholder="Apellido"/></label>
            <label>Teléfono<input type="tel" maxLength={35} value={draft.phone} onChange={e=>update("phone",e.target.value)} disabled={ownerView||saving} placeholder="11 2345-6789"/></label>
            <label>Alias para transferencias<input maxLength={120} value={draft.payment_alias} onChange={e=>update("payment_alias",e.target.value)} disabled={ownerView||saving} placeholder="Alias bancario"/></label>
            <label>Fecha de ingreso (dd/mm/aaaa)<div className="mlg-date"><CalendarDays size={17}/><input inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} value={startedDate} onChange={e=>setStartedDate(e.target.value)} disabled={ownerView||saving}/></div></label>
            <label>Local<input value={localTitle(chosenLocal)} disabled/></label>
          </div>
          <label className="mlg-note-label">Notas (opcional)<textarea rows={2} maxLength={1500} placeholder="Observaciones del colaborador…" value={draft.notes} onChange={e=>update("notes",e.target.value)} disabled={ownerView||saving}/></label>
          <fieldset className="mlg-state"><legend>Estado del colaborador</legend>
            {(["activo","refuerzo","inactivo"] as const).map(st=><button type="button" aria-pressed={draft.status===st} className={"mlg-state-button mlg-state-button--"+st} key={st} onClick={()=>update("status",st)} disabled={ownerView||saving}>
              {draft.status===st?<Check size={17}/>:st==="activo"?<UserRoundCheck size={17}/>:st==="refuerzo"?<UsersRound size={17}/>:<UserRoundX size={17}/>}
              {stateNames[st]}</button>)}
          </fieldset>
          {draft.status==="refuerzo"&&<div className="mlg-conditional"><strong>Fechas de refuerzo</strong><p>Registrá cada día que trabajó como refuerzo (dd/mm/aaaa).</p>
            <div className="mlg-new-date"><label className="mlg-date"><CalendarDays size={17}/><input placeholder="dd/mm/aaaa" aria-label="Fecha de refuerzo" inputMode="numeric" maxLength={10} value={newDate} onChange={e=>setNewDate(e.target.value)} disabled={ownerView||saving}/></label>
              {!ownerView&&<button type="button" onClick={addDate} disabled={saving}><Plus size={17}/> Agregar fecha</button>}</div>
            <div className="mlg-date-tags">{draft.reinforcement_dates.map(date=><span key={date}>{dateToDisplay(date)} {!ownerView&&<button type="button" aria-label={"Quitar "+dateToDisplay(date)} onClick={()=>update("reinforcement_dates",draft.reinforcement_dates.filter(v=>v!==date))} disabled={saving}><X size={14}/></button>}</span>)}</div>
          </div>}
          {draft.status==="inactivo"&&<div className="mlg-conditional"><strong>Último día trabajado *</strong><p>Indicá hasta qué fecha trabajó en este local (dd/mm/aaaa).</p>
            <label className="mlg-date"><CalendarDays size={17}/><input placeholder="dd/mm/aaaa" inputMode="numeric" maxLength={10} value={lastDate} onChange={e=>setLastDate(e.target.value)} disabled={ownerView||saving} aria-label="Último día trabajado" required/></label>
          </div>}
          {draft.status!=="refuerzo"&&draft.reinforcement_dates.length>0&&<p className="mlg-previous">Refuerzos registrados anteriormente: {draft.reinforcement_dates.map(dateToDisplay).join(", ")}</p>}
          <p className="mlg-small-notice">Los cambios quedan registrados en el historial privado y pueden ser consultados por los dueños autorizados.</p>
          <div className="mlg-form-actions"><button type="button" className="mlg-secondary" disabled={saving} onClick={close}>Volver</button>{!ownerView&&<button type="submit" className="mlg-primary" disabled={saving}><Save size={17}/>{saving?"Guardando…":"Guardar legajo"}</button>}</div>
        </form>}
      </section>
    </div>}
  </section>;
}
