"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { rpc } from "@/features/access/api";
import { readReportCollection } from "@/utils/read-report-collection";
import { resolveOverviewSheetLocal } from "@/utils/overview-sheet-local";
import { summarizeReport } from "@/features/reports/payroll.js";
import type { AppLocal } from "@/types/access";
import { EmployeeDirectory } from "./EmployeeDirectory";
import { ManagerLegajos } from "@/components/legajos/ManagerLegajos";
import { ReceiptDashboard } from "./ReceiptDashboard";
import { Archive, ChevronDown } from "lucide-react";
import "./employee-pages.css";

export type Concept = {
  key: string; label: string; type: string;
  quantity: number | null; rate: number | null; amount: number | null;
};
export type Summary = {
  name: string; role: string; status: "activo" | "refuerzo" | "descanso" | "inactivo";
  mode: string; period: string; payment: string; quantity: string; total: number;
  reportStatus: "enviada" | "cargada" | "vacia";
  lastDelivery: string | null; rows: Concept[];
};
export type EmployeeRow = {
  id: string; localId: string; local: AppLocal; summary: Summary;
  data: Record<string, unknown>;
};
export const currency = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", minimumFractionDigits: 2,
});
export const normalize = (s: string) =>
  s.toLocaleLowerCase("es-AR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const statusLabel: Record<Summary["status"], string> = {
  activo: "Activo", refuerzo: "Refuerzo", descanso: "En descanso", inactivo: "Inactivo",
};
export const reportLabel: Record<Summary["reportStatus"], string> = {
  enviada: "Enviado", cargada: "Pendiente", vacia: "Sin generar",
};
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
    if (!local || (row.organization_id && row.organization_id !== local.organization_id)) return [];
    return [{
      id: row.path.slice("hojas/".length),
      localId: local.id, local, data: row.data,
      summary: summarizeReport(row.data, local) as Summary,
    }];
  }).sort((a, b) => a.summary.name.localeCompare(b.summary.name, "es-AR"));
}
export function EmployeeOverview({
  locals, ready, screen, onOpenSheet, onAddSheet, onDownloadPdf, onShareWhatsapp, ownerRostering = false,
}: {
  locals: AppLocal[];
  ownerRostering?: boolean;
  ready: boolean;
  screen: "empleados" | "recibos";
  onOpenSheet: (localId: string, id: string) => boolean;
  onAddSheet: (localId: string) => boolean;
  onDownloadPdf: (localId: string, id: string) => Promise<void>;
  onShareWhatsapp: (localId: string, id: string) => boolean;
}) {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [roster, setRoster] = useState<{enabled:boolean;active_sheet_ids:string[]} | null>(null);
  const [showArchive,setShowArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const organizationId = locals[0]?.organization_id;
  const safeLocals = useMemo(
    () => locals.filter(l => l.organization_id === organizationId),
    [locals, organizationId],
  );
  useEffect(() => {
    let active = true;
    if (!organizationId || safeLocals.length === 0) {
      queueMicrotask(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    Promise.all([
      readReportCollection(createClient(), "hojas", organizationId),
      ownerRostering
        ? rpc<{enabled:boolean;active_sheet_ids:string[]}>("rm_app_owner_roster_state", {p_organization:organizationId})
        : Promise.resolve({enabled:false,active_sheet_ids:[] as string[]}),
    ])
      .then(([data, visibility]) => {
        if (!active) return;
        setRows(projectRows(data, safeLocals));
        setRoster(visibility);
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setRoster(null);
        // No mostrar el archivo de recibos si falla la comprobación privada.
        setError("No pudimos comprobar la nómina privada de esta empresa. Revisá la conexión e intentá nuevamente.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, safeLocals, ownerRostering, reload]);

  const hasProtectedRoster = ownerRostering && roster?.enabled === true;
  const activeIds = useMemo(() => new Set(roster?.active_sheet_ids ?? []), [roster]);
  const currentRows = hasProtectedRoster ? rows.filter(row => activeIds.has(row.id)) : rows;
  const historicalRows = hasProtectedRoster ? rows.filter(row => !activeIds.has(row.id)) : [];
    const refresh = () => {
    setLoading(true); setError(""); setReload(k => k + 1);
  };
  const open = (row: EmployeeRow) => {
    if (!onOpenSheet(row.localId, row.id))
      setError("No se pudo abrir la planilla. Revisá la conexión o guardá los cambios pendientes.");
  };
  const add = (localId: string) => {
    if (!onAddSheet(localId))
      setError("No se pudo abrir el legajo nuevo. Esperá a que termine de cargar la planilla.");
  };
  const share = (row: EmployeeRow) => {
    if (!onShareWhatsapp(row.localId, row.id))
      setError("No se pudo iniciar WhatsApp. Guardá los cambios pendientes y revisá tus permisos.");
  };
  const download = async (row: EmployeeRow) => {
    try { await onDownloadPdf(row.localId, row.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo descargar el PDF."); }
  };
  return <section className="employee-pages" aria-label={screen === "empleados" ? "Administración de empleados" : "Recibos de sueldo"}>
    {error && <p role="alert" className="employee-pages__error">{error} <button type="button" onClick={refresh}>Reintentar</button></p>}
    {screen === "empleados"
      ? <>
          <EmployeeDirectory rows={currentRows} locals={safeLocals} loading={loading} ready={ready}
            autoGeneratedOnly={hasProtectedRoster}
            onRefresh={refresh} onAdd={add} onOpen={open} />
          <ManagerLegajos ownerView localScope={safeLocals}/>
        </>
      : <ReceiptDashboard rows={currentRows} locals={safeLocals} loading={loading} ready={ready}
          onRefresh={refresh} onOpen={open} onDownload={download} onShare={share} />}
    {hasProtectedRoster && <section className="employee-pages__private-archive" aria-label="Archivo histórico de recibos" style={{marginTop:24,padding:16,border:"1px solid #dce7ee",borderRadius:14}}>
      <button type="button" aria-expanded={showArchive} onClick={()=>setShowArchive(value=>!value)}
        style={{display:"flex",alignItems:"center",gap:10,fontWeight:750,color:"#174264",background:"transparent",border:0,minHeight:46,width:"100%",textAlign:"left",cursor:"pointer"}}>
        <Archive size={19}/> Archivo histórico privado ({historicalRows.length} planillas)
        <ChevronDown size={18} style={{marginLeft:"auto",transform:showArchive?"rotate(180deg)":undefined}}/>
      </button>
      <p style={{fontSize:13,color:"#5e7586",margin:"4px 0"}}>
        Los registros anteriores se conservan intactos, con sus fórmulas y recibos.
        La nómina principal muestra solo las planillas habilitadas por el legajo personal.
      </p>
      {showArchive && <ReceiptDashboard rows={historicalRows} locals={safeLocals} loading={loading} ready={ready}
          onRefresh={refresh} onOpen={open} onDownload={download} onShare={share} />}
    </section>}
  </section>;
}
