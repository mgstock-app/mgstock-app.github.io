"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { readReportCollection } from "@/utils/read-report-collection";
import { resolveOverviewSheetLocal } from "@/utils/overview-sheet-local";
import { summarizeReport } from "@/features/reports/payroll.js";
import { formatHours } from "@/utils/duration.js";
import type { AppLocal } from "@/types/access";
import "./employee-overview.css";

type Concept = { key: string; label: string; type: string; quantity: number | null; rate: number | null; amount: number | null };
type Summary = {
  name: string; role: string; status: "activo" | "refuerzo" | "inactivo";
  mode: string; period: string; payment: string; quantity: string; total: number;
  reportStatus: "enviada" | "cargada" | "vacia"; lastDelivery: string | null; rows: Concept[];
};
type EmployeeRow = { id: string; localId: string; local: AppLocal; summary: Summary };
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const normalize = (s: string) => s.toLocaleLowerCase("es-AR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const statusLabel: Record<Summary["status"], string> = {
  activo: "Activo", refuerzo: "Refuerzo", inactivo: "Inactivo"
};
const reportLabel: Record<Summary["reportStatus"], string> = {
  enviada: "Enviado / recibo listo", cargada: "Pendiente de envío o firma", vacia: "Sin generar"
};
const quantityText = (row: Concept) =>
  row.quantity == null ? "—" :
    row.type === "horas" ? formatHours(row.quantity) + " hs" :
    row.type === "turnos" ? String(row.quantity) + " turnos" :
    row.type === "dias" ? String(row.quantity) + " días" : "—";
export function projectRows(
  rows: { path: string; data: Record<string, unknown>; organization_id?: string }[],
  locals: AppLocal[],
): EmployeeRow[] {
  const ids = locals.map(l => l.id);
  const localById = new Map(locals.map(l => [l.id, l]));
  return rows.flatMap(row => {
    if (!/^hojas\/[^/]+$/.test(row.path)) return [];
    const localId = resolveOverviewSheetLocal(row, ids);
    const local = localId ? localById.get(localId) : undefined;
    if (!local || (row.organization_id && row.organization_id !== local.organization_id)) return []; // Aislamiento empresa/local incluso si el servidor devuelve datos inesperados.
    return [{ id: row.path.slice("hojas/".length), localId: local.id, local, summary: summarizeReport(row.data, local) as Summary }];
  }).sort((a, b) => a.summary.name.localeCompare(b.summary.name, "es-AR"));
}
export function EmployeeOverview({
  locals, ready, onOpenSheet, onAddSheet,
}: {
  locals: AppLocal[];
  ready: boolean;
  onOpenSheet: (localId: string, id: string) => boolean;
  onAddSheet: (localId: string) => boolean;
}) {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [section, setSection] = useState<"legajos" | "recibos">("legajos");
  const [localId, setLocalId] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const organizationId = locals[0]?.organization_id;
  useEffect(() => {
    let active = true;
    if (!organizationId || !locals.length) {
      queueMicrotask(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    readReportCollection(createClient(), "hojas", organizationId)
      .then(data => { if (active) { setRows(projectRows(data, locals)); setError(""); } })
      .catch(() => {
        if (active) {
          setRows([]);
          setError("No se pudieron consultar los legajos autorizados. Revisá la conexión y reintentá.");
        }
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, locals, refreshKey]);
  const visibleLocals = useMemo(() => locals.filter(l => l.organization_id === organizationId), [locals, organizationId]);
  const byLocal = useMemo(() => rows.filter(row => localId === "todos" || row.localId === localId), [rows, localId]);
  const filtered = useMemo(() => byLocal.filter(row =>
    (status === "todos" || row.summary.status === status) &&
    normalize(row.summary.name + " " + row.summary.role + " " + row.local.name).includes(normalize(search.trim()))
  ), [byLocal, search, status]);
  const selectedRow = filtered.find(row => row.id === selected) ?? null;
  const totals = {
    all: byLocal.length,
    active: byLocal.filter(r => r.summary.status === "activo").length,
    reinforcement: byLocal.filter(r => r.summary.status === "refuerzo").length,
    inactive: byLocal.filter(r => r.summary.status === "inactivo").length,
  };
  const openSheet = (row: EmployeeRow) => {
    if (!onOpenSheet(row.localId, row.id)) setError("La planilla todavía no terminó de cargar. Intentá nuevamente.");
  };
  const addSheet = () => {
    const destination = localId !== "todos" ? localId : visibleLocals.length === 1 ? visibleLocals[0].id : "";
    if (!destination) { setError("Elegí un local antes de crear un legajo."); return; }
    if (!onAddSheet(destination)) setError("No se pudo abrir el formulario. Verificá que la planilla esté cargada y tengas permiso de edición.");
  };
  return <section className="employee-overview" aria-label="Administración de empleados y recibos">
    <div className="employee-overview__header">
      <div>
        <span className="employee-overview__eyebrow">GESTLOK · ADMINISTRACIÓN DE EMPLEADOS</span>
        <h2>Tu equipo, en orden.</h2>
        <p>Legajos y recibos de los locales que tenés autorizados.</p>
      </div>
      <button type="button" className="employee-overview__refresh" onClick={() => { setRows([]); setError(""); setLoading(true); setRefreshKey(k => k + 1); }} disabled={loading}>Actualizar datos</button>
    </div>
    <div className="employee-overview__stats" aria-label="Resumen de empleados">
      <div><span>Total de legajos</span><strong>{totals.all}</strong></div>
      <div><span>Activos</span><strong>{totals.active}</strong></div>
      <div><span>Refuerzos</span><strong>{totals.reinforcement}</strong></div>
      <div><span>Inactivos</span><strong>{totals.inactive}</strong></div>
    </div>
    <div className="employee-overview__tabs" role="tablist" aria-label="Administración">
      <button type="button" role="tab" aria-selected={section === "legajos"} onClick={() => { setSection("legajos"); setSelected(null); }}>Empleados y legajos</button>
      <button type="button" role="tab" aria-selected={section === "recibos"} onClick={() => { setSection("recibos"); setSelected(null); }}>Recibos de sueldo</button>
    </div>
    <div className="employee-overview__filters">
      <label>Buscar empleado
        <input type="search" value={search} placeholder="Nombre o puesto" onChange={e => { setSearch(e.target.value); setSelected(null); }} />
      </label>
      <label>Local
        <select value={localId} onChange={e => { setLocalId(e.target.value); setSelected(null); }}>
          <option value="todos">Todos mis locales</option>
          {visibleLocals.map(local => <option value={local.id} key={local.id}>{local.name} · {local.cycle === "semanal" ? "Semanal" : "Mensual"}</option>)}
        </select>
      </label>
      <label>Estado del empleado
        <select value={status} onChange={e => { setStatus(e.target.value); setSelected(null); }}>
          <option value="todos">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="refuerzo">Refuerzos</option>
          <option value="inactivo">Inactivos</option>
        </select>
      </label>
      {section === "legajos" && <button className="employee-overview__primary" type="button" disabled={!ready || loading} onClick={addSheet}>+ Agregar empleado</button>}
    </div>
    {error && <p className="employee-overview__error" role="alert">{error}</p>}
    {loading ? <p role="status" className="employee-overview__notice">Consultando legajos privados…</p> :
      !filtered.length ? <p className="employee-overview__notice">No hay empleados con estos filtros. Podés crear una hoja desde el local correspondiente.</p> :
        <div className="employee-overview__layout">
          <div className="employee-overview__table-wrap">
            <table className="employee-overview__table">
              <thead><tr>
                <th scope="col">Colaborador</th>
                <th scope="col">Local / período</th>
                <th scope="col">{section === "legajos" ? "Estado" : "Recibo"}</th>
                <th scope="col">{section === "legajos" ? "Modalidad" : "Cantidad"}</th>
                <th scope="col" className="employee-overview__amount">Total</th>
                <th scope="col"><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody>{filtered.map(row => <tr key={row.id}>
                <td><strong>{row.summary.name}</strong><small>{row.summary.role}</small></td>
                <td>{row.local.name}<small>{row.summary.period || (row.local.cycle === "semanal" ? "Semanal" : "Mensual")}</small></td>
                <td><span className={"employee-overview__pill employee-overview__pill--" + (section === "legajos" ? row.summary.status : row.summary.reportStatus)}>
                  {section === "legajos" ? statusLabel[row.summary.status] : reportLabel[row.summary.reportStatus]}
                </span></td>
                <td>{section === "legajos" ? row.summary.mode : row.summary.quantity}</td>
                <td className="employee-overview__amount">{currency.format(row.summary.total)}</td>
                <td><div className="employee-overview__actions">
                  <button type="button" aria-label={"Ver detalle de " + row.summary.name} onClick={() => setSelected(row.id === selected ? null : row.id)}>Detalle</button>
                  <button type="button" disabled={!ready} aria-label={"Abrir planilla de " + row.summary.name} onClick={() => openSheet(row)}>Abrir planilla</button>
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>
          {selectedRow && <aside className="employee-overview__detail" aria-label={"Detalle de " + selectedRow.summary.name}>
            <div className="employee-overview__detail-title">
              <div><span>{section === "recibos" ? "Recibo actual" : "Legajo"}</span><h3>{selectedRow.summary.name}</h3></div>
              <button type="button" aria-label="Cerrar detalle" onClick={() => setSelected(null)}>×</button>
            </div>
            <dl className="employee-overview__info">
              <div><dt>Local</dt><dd>{selectedRow.local.name}</dd></div>
              <div><dt>Liquidación</dt><dd>{selectedRow.local.cycle === "semanal" ? "Semanal" : "Mensual"}</dd></div>
              <div><dt>Puesto</dt><dd>{selectedRow.summary.role}</dd></div>
              <div><dt>Estado</dt><dd>{statusLabel[selectedRow.summary.status]}</dd></div>
              <div><dt>Modalidad</dt><dd>{selectedRow.summary.mode}</dd></div>
              <div><dt>Pago</dt><dd>{selectedRow.summary.payment}</dd></div>
              <div><dt>Período</dt><dd>{selectedRow.summary.period || "Sin completar"}</dd></div>
            </dl>
            <h4>Detalle de liquidación</h4>
            <div className="employee-overview__concepts">
              {selectedRow.summary.rows.map(concept => <div key={concept.key}>
                <span>{concept.label}<small>{quantityText(concept)}{concept.rate != null ? " × " + currency.format(concept.rate) : ""}</small></span>
                <strong>{concept.amount == null ? "—" : currency.format(concept.amount)}</strong>
              </div>)}
            </div>
            <div className="employee-overview__total"><span>{selectedRow.summary.quantity}<small>Total de horas o turnos</small></span><strong>{currency.format(selectedRow.summary.total)}</strong></div>
            <p className="employee-overview__footnote">El PDF, el historial y WhatsApp se gestionan en la planilla privada existente. “Enviado” no significa necesariamente “pagado”.</p>
            <button type="button" className="employee-overview__primary" disabled={!ready} onClick={() => openSheet(selectedRow)}>Abrir recibo, historial y edición</button>
          </aside>}
        </div>}
    <p className="employee-overview__footnote">Los datos provienen de las planillas autorizadas. La creación y edición se realizan mediante los controles y permisos existentes.</p>
  </section>;
}
