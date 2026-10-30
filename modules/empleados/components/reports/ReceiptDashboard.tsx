"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock3, Download, Eye, FileText, MessageCircle, Search, XCircle, RotateCw } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { readReportCollection } from "@/utils/read-report-collection";
import { summarizeReport } from "@/features/reports/payroll.js";
import { formatHours } from "@/utils/duration.js";
import type { AppLocal } from "@/types/access";
import type { Concept, EmployeeRow, Summary } from "./EmployeeOverview";
import { currency, normalize, reportLabel } from "./EmployeeOverview";
import { ReceiptVisibilityControls } from "./ReceiptVisibilityControls";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const PAGE_SIZE = 8;
const isoMonth = (date: string) => /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : null;
export function receiptMonth(data: Record<string, unknown>): string | null {
  if (typeof data.semDesde === "string" && isoMonth(data.semDesde)) return isoMonth(data.semDesde);
  const m = typeof data.mes === "string" ? MONTHS.indexOf(data.mes) : -1;
  if (m >= 0 && /^\d{4}$/.test(String(data.anio ?? ""))) return String(data.anio) + "-" + String(m + 1).padStart(2, "0");
  if (typeof data.fecha === "string" && isoMonth(data.fecha)) return isoMonth(data.fecha);
  return null;
}
const monthName = (value: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return match ? MONTHS[Number(match[2]) - 1] + " " + match[1] : "Todos los períodos";
};
const conceptLabel = (concept: Concept, rows: Concept[]) => {
  const base = rows.find(row => row.key === "trab")?.rate;
  if (!base || concept.rate == null) return concept.label;
  const ratio = concept.rate / base;
  if (concept.key === "extra" && Math.abs(ratio - 1.5) < 0.000001) return concept.label + " (50%)";
  if (concept.key === "fer" && Math.abs(ratio - 2) < 0.000001) return concept.label + " (100%)";
  return concept.label;
};
const quantity = (concept: Concept) => concept.quantity == null ? "—" :
  concept.type === "horas" ? formatHours(concept.quantity) + " hs" :
  concept.type === "turnos" ? concept.quantity + (concept.quantity === 1 ? " turno" : " turnos") :
  concept.type === "dias" ? concept.quantity + (concept.quantity === 1 ? " día" : " días") : "—";
const dateText = (value: unknown) => {
  if (typeof value !== "string" || !value) return "";
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? value : time.toLocaleString("es-AR", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
};
function ReceiptPaper({ row, summary, historical = false }: {
  row: EmployeeRow; summary: Summary; historical?: boolean;
}) {
  const original = row.data;
  const hasVerifiedPayment = original.pagado === true || original.estadoPago === "pagado";
  const fixedRows = summary.rows;
  const isHours = summary.mode.toLowerCase().includes("hora");
  return <article className="employee-pages__paper" aria-label="Detalle del recibo">
    <div className="employee-pages__paper-heading">
      <h3>Recibo de sueldo</h3>
      <div><strong>Liquidación {row.local.cycle === "semanal" ? "semanal" : "mensual"}</strong><span>Período: {summary.period || "Sin completar"}</span><span>{historical ? "Registro histórico" : "Recibo actual"}</span></div>
    </div>
    <h4>DATOS DEL COLABORADOR</h4>
    <div className="employee-pages__paper-fields">
      <div className="employee-pages__paper-field employee-pages__paper-field--full"><small>Nombre y apellido</small><strong>{summary.name}</strong></div>
      <div className="employee-pages__paper-field"><small>Puesto y modalidad</small><span>{summary.role} · {summary.mode.toLowerCase()}</span></div>
      <div className="employee-pages__paper-field"><small>Período</small><span>{summary.period || "Sin completar"}</span></div>
    </div>
    <h4>DETALLE {isHours ? "DE HORAS" : "DE TURNOS"}</h4>
    <div className="employee-pages__paper-table-scroll"><table className="employee-pages__paper-table">
      <thead><tr><th scope="col">Concepto</th><th scope="col">Cantidad</th><th scope="col">Valor unit.</th><th scope="col">Importe</th></tr></thead>
      <tbody>{fixedRows.map(concept => <tr key={concept.key}>
        <td>{conceptLabel(concept, fixedRows)}</td>
        <td>{quantity(concept)}</td>
        <td>{concept.rate == null ? "—" : currency.format(concept.rate)}</td>
        <td>{concept.amount == null ? "—" : currency.format(concept.amount)}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="employee-pages__paper-totals">
      <span className="employee-pages__quantity"><strong>{isHours ? "TOTAL HORAS" : "TOTAL TURNOS / HORAS EXTRA"}</strong><b>{summary.quantity}</b></span>
      <span><strong>TOTAL A COBRAR</strong><b>{currency.format(summary.total)}</b></span>
    </div>
    <p className="employee-pages__paper-note">{hasVerifiedPayment ? "Pago marcado como realizado." : "Este recibo no equivale a una confirmación de pago."} {historical ? "Copia del historial privado." : "Para editar cantidades y tarifas, abrí la planilla del colaborador."}</p>
  </article>;
}
function ReceiptHistory({ row, onOpen }: { row: EmployeeRow; onOpen: (row: EmployeeRow) => void }) {
  const [entries, setEntries] = useState<{id:string;data:Record<string,unknown>}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    readReportCollection(createClient(), "hojas/" + row.id + "/historial", row.local.organization_id)
      .then(items => {
        if (active) {
          setEntries(items.filter(item => item.path.startsWith("hojas/" + row.id + "/historial/"))
            .map(item => ({ id: item.path, data: item.data }))
            .sort((a,b) => String(b.data.registrado || "").localeCompare(String(a.data.registrado || ""))));
        }
      }).catch(() => { if (active) setError("No se pudo consultar el historial privado."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [row.id, row.local.organization_id]);
  const historyEntry = entries.find(x => x.id === selected);
  if (loading) return <p className="employee-pages__empty" role="status">Cargando historial privado…</p>;
  if (error) return <p className="employee-pages__empty" role="alert">{error}</p>;
  if (!entries.length) return <div className="employee-pages__empty">Todavía no hay recibos anteriores guardados para este colaborador. <button type="button" onClick={() => onOpen(row)}>Abrir planilla e historial</button></div>;
  return <div className="employee-pages__history">
    {historyEntry ? <>
      <button type="button" className="employee-pages__back-link" onClick={() => setSelected(null)}><ChevronLeft size={16}/> Volver al historial</button>
      <ReceiptPaper row={{...row,data:historyEntry.data}} summary={summarizeReport(historyEntry.data, row.local) as Summary} historical />
    </> : <>
      <h3>Historial de {row.summary.name}</h3>
      {entries.map(item => <button type="button" key={item.id} className="employee-pages__history-row" onClick={() => setSelected(item.id)}>
        <span><FileText size={18}/><span><strong>{String(item.data.periodo || "Período sin especificar")}</strong><small>{dateText(item.data.registrado)}</small></span></span>
        <strong>{currency.format(typeof item.data.total === "number" ? item.data.total : 0)}</strong>
        <Eye size={18}/>
      </button>)}
      <p className="employee-pages__paper-note">Los datos históricos son de solo lectura. Para consultar el registro completo y las firmas, abrí la planilla.</p>
    </>}
  </div>;
}
export function ReceiptDashboard({
  rows, locals, loading, ready, onRefresh, onOpen, onDownload, onShare,
}: {
  rows: EmployeeRow[]; locals: AppLocal[]; loading: boolean; ready: boolean;
  onRefresh: () => void; onOpen: (row: EmployeeRow) => void;
  onDownload: (row: EmployeeRow) => Promise<void>;
  onShare: (row: EmployeeRow) => void;
}) {
  const [todayMonth] = useState(() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); });
  // Mostrar la nómina completa: el filtro automático ocultaba recibos anteriores.
  const [month, setMonth] = useState("todos");
  const [localFilter, setLocalFilter] = useState("todos");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"actual"|"historial">("actual");
  const [downloading, setDownloading] = useState(false);
  const availableMonths = useMemo(() => rows.map(row => receiptMonth(row.data)).filter((value): value is string => !!value), [rows]);
  const months = useMemo(() => [...new Set([...availableMonths, todayMonth])].sort().reverse(), [availableMonths, todayMonth]);
  const effectiveMonth = month === "auto" ? (availableMonths.includes(todayMonth) ? todayMonth : "todos") : month;
  const filtered = useMemo(() => rows.filter(row =>
    (localFilter === "todos" || row.localId === localFilter) &&
    (effectiveMonth === "todos" || receiptMonth(row.data) === effectiveMonth) &&
    normalize(row.summary.name + " " + row.local.name).includes(normalize(query.trim()))
  ), [rows, effectiveMonth, localFilter, query]);
  const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, maxPage);
  const current = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const active = filtered.find(r => r.id === selectedId) ?? filtered[0] ?? null;
  const sent = filtered.filter(r => r.summary.reportStatus === "enviada").length;
  const pending = filtered.filter(r => r.summary.reportStatus === "cargada").length;
  const empty = filtered.filter(r => r.summary.reportStatus === "vacia").length;
  const show = (id: string) => { setSelectedId(id); setTab("actual"); };
  const changeMonth = (value: string) => { setMonth(value); setPage(1); setSelectedId(null); setTab("actual"); };
  const changeLocal = (value: string) => { setLocalFilter(value); setPage(1); setSelectedId(null); setTab("actual"); };
  const download = async () => {
    if (!active || downloading) return;
    setDownloading(true);
    try { await onDownload(active); } finally { setDownloading(false); }
  };
  return <>
    <div className="employee-pages__heading employee-pages__heading--receipts">
      <div><div className="employee-pages__crumb"><span>Inicio</span><ChevronRight size={13}/><span>Recibos de sueldo</span></div>
        <h1>Recibos de sueldo</h1><p>Gestioná las liquidaciones de tu equipo.</p>
      </div>
      <div className="employee-pages__period-filters">
        <label><CalendarDays size={18}/><span className="sr-only">Período</span>
          <select value={effectiveMonth} onChange={e => changeMonth(e.target.value)}>
            <option value="todos">Todos los períodos</option>
            {months.map(m => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Local</span><select value={localFilter} onChange={e => changeLocal(e.target.value)}>
          <option value="todos">Todos los locales</option>
          {locals.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select></label>
      </div>
    </div>
    {locals[0]?.organization_id && <ReceiptVisibilityControls organizationId={locals[0].organization_id}/>}
    <div className="employee-pages__stats">
      {[
        {icon: FileText,title:"Total de recibos", value:filtered.length,color:"blue"},
        {icon: CircleCheck,title:"Enviados",value:sent,color:"green"},
        {icon: Clock3,title:"Pendientes",value:pending,color:"orange"},
        {icon: XCircle,title:"Sin generar",value:empty,color:"red"},
      ].map(stat => <div className="employee-pages__stat" key={stat.title}>
        <span className={"employee-pages__stat-icon employee-pages__stat-icon--" + stat.color}><stat.icon size={23}/></span>
        <div><small>{stat.title}</small><strong>{loading ? "—" : stat.value}</strong>{!loading && filtered.length > 0 && stat.title !== "Total de recibos" && <span>{Math.round(stat.value * 100 / filtered.length)}% del total</span>}</div>
      </div>)}
    </div>
    <div className="employee-pages__receipt-layout">
      <div className="employee-pages__receipt-list">
        <div className="employee-pages__receipt-search"><Search size={19}/><input type="search" value={query} placeholder="Buscar colaborador..." aria-label="Buscar colaborador" onChange={e=>{setQuery(e.target.value);setPage(1);setSelectedId(null);setTab("actual");}}/><button type="button" aria-label="Actualizar recibos" onClick={onRefresh} disabled={loading}><RotateCw size={17}/></button></div>
        {loading ? <p className="employee-pages__empty" role="status">Cargando recibos privados…</p> : current.length ?
          current.map((row,i) => <button type="button" key={row.id} onClick={() => show(row.id)} className={"employee-pages__receipt-person" + (active?.id === row.id ? " is-selected" : "")} aria-pressed={active?.id === row.id}>
            <span className={"employee-pages__avatar employee-pages__avatar--" + (i%6)} aria-hidden="true">{(row.summary.name.trim()[0]||"?").toUpperCase()}</span>
            <strong title={row.summary.name}>{row.summary.name}</strong>
            <small>{row.summary.period || (receiptMonth(row.data) ? monthName(receiptMonth(row.data)!) : "Sin período")}</small>
            <span className={"employee-pages__pill employee-pages__pill--" + row.summary.reportStatus}>{reportLabel[row.summary.reportStatus]}</span>
            <span className="employee-pages__receipt-view"><Eye size={16}/> Ver</span>
          </button>) : <div className="employee-pages__empty">No hay recibos para los filtros elegidos. Probá «Todos los períodos».</div>}
        <div className="employee-pages__pager"><small>Mostrando {current.length} de {filtered.length} empleados</small>
          {maxPage > 1 && <div><button type="button" aria-label="Página anterior" disabled={currentPage===1} onClick={()=>setPage(k=>Math.max(1,k-1))}><ChevronLeft size={17}/></button>{Array.from({length:maxPage},(_,i)=>i+1).map(p=><button type="button" key={p} className={currentPage===p?"is-current":""} aria-current={currentPage===p?"page":undefined} onClick={()=>setPage(p)}>{p}</button>)}<button type="button" aria-label="Página siguiente" disabled={currentPage===maxPage} onClick={()=>setPage(k=>Math.min(maxPage,k+1))}><ChevronRight size={17}/></button></div>}
        </div>
      </div>
      <div className="employee-pages__receipt-detail">
        {!loading && active ? <>
          <div className="employee-pages__receipt-detail-header">
            <div className="employee-pages__receipt-identity"><span className="employee-pages__avatar employee-pages__avatar--0">{(active.summary.name.trim()[0]||"?").toUpperCase()}</span><div><strong>{active.summary.name}</strong><small>Recibo de sueldo · {receiptMonth(active.data) ? monthName(receiptMonth(active.data)!) : "Sin período"}</small></div><span className={"employee-pages__pill employee-pages__pill--"+active.summary.reportStatus}>{reportLabel[active.summary.reportStatus]}</span></div>
            <div className="employee-pages__receipt-actions"><button type="button" disabled={!ready || downloading || tab !== "actual"} onClick={() => void download()}><Download size={17}/>{downloading?"Preparando…":"Descargar PDF"}</button><button type="button" disabled={!ready || tab !== "actual"} onClick={() => onShare(active)}><MessageCircle size={17}/> Enviar por WhatsApp</button></div>
          </div>
          <div className="employee-pages__receipt-tabs" role="tablist" aria-label="Ver recibo o historial"><button type="button" role="tab" aria-selected={tab==="actual"} onClick={()=>setTab("actual")}>Recibo actual</button><button type="button" role="tab" aria-selected={tab==="historial"} onClick={()=>setTab("historial")}>Historial</button></div>
          {tab === "actual" ? <><ReceiptPaper row={active} summary={active.summary}/><div className="employee-pages__receipt-bottom"><button type="button" className="employee-pages__button employee-pages__button--light" disabled={!ready} onClick={()=>onOpen(active)}>Abrir planilla y editar</button></div></> : <ReceiptHistory key={active.id} row={active} onOpen={onOpen}/>}
        </> : <div className="employee-pages__empty">Elegí un colaborador de la lista para visualizar su recibo.</div>}
      </div>
    </div>
    <p className="employee-pages__privacy"><strong>Privacidad:</strong> solo el Dueño y los usuarios autorizados administran los recibos. Cada colaborador ve únicamente el suyo. Antes de compartir por WhatsApp, comprobá el nombre y teléfono del destinatario; nunca envíes un recibo a un grupo. Los estados «Enviado» y «Pendiente» corresponden a la entrega del recibo. No implican que el sueldo haya sido pagado. El acceso al historial y a las descargas está limitado a los usuarios autorizados.</p>
  </>;
}
