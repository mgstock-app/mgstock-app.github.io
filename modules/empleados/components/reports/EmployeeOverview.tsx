"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { readReportCollection } from "@/utils/read-report-collection";
import { resolveOverviewSheetLocal } from "@/utils/overview-sheet-local";
import { summarizeReport } from "@/features/reports/payroll.js";
import type { AppLocal } from "@/types/access";
import { EmployeeDirectory } from "./EmployeeDirectory";
import { ReceiptDashboard } from "./ReceiptDashboard";
import "./employee-pages.css";

export type Concept = {
  key: string; label: string; type: string;
  quantity: number | null; rate: number | null; amount: number | null;
};
export type Summary = {
  name: string; role: string; status: "activo" | "refuerzo" | "inactivo";
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
  activo: "Activo", refuerzo: "Refuerzo", inactivo: "Inactivo",
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
  locals, ready, screen, onOpenSheet, onAddSheet, onDownloadPdf, onShareWhatsapp,
}: {
  locals: AppLocal[];
  ready: boolean;
  screen: "empleados" | "recibos";
  onOpenSheet: (localId: string, id: string) => boolean;
  onAddSheet: (localId: string) => boolean;
  onDownloadPdf: (localId: string, id: string) => Promise<void>;
  onShareWhatsapp: (localId: string, id: string) => boolean;
}) {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
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
    readReportCollection(createClient(), "hojas", organizationId)
      .then(data => {
        if (active) {
          setRows(projectRows(data, safeLocals));
          setError("");
        }
      })
      .catch(() => {
        if (active) {
          setRows([]);
          setError("No pudimos cargar los legajos privados. Revisá tu conexión e intentá nuevamente.");
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, safeLocals, reload]);

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
      ? <EmployeeDirectory rows={rows} locals={safeLocals} loading={loading} ready={ready}
          onRefresh={refresh} onAdd={add} onOpen={open} />
      : <ReceiptDashboard rows={rows} locals={safeLocals} loading={loading} ready={ready}
          onRefresh={refresh} onOpen={open} onDownload={download} onShare={share} />}
  </section>;
}
