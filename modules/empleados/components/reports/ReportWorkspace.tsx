"use client";
import { useState } from "react";
import { useReportWorkspace } from "@/hooks/use-report-workspace";
import { ReportMarkup } from "./ReportMarkup";
import { EmployeeOverview } from "./EmployeeOverview";
import type { AppLocal, AppUser } from "@/types/access";

export function ReportWorkspace({
  user,
  locals,
  scheduleInFolderOnly = false,
}: {
  user: AppUser;
  locals: AppLocal[];
  scheduleInFolderOnly?: boolean;
}) {
  const { root, error, ready, openSheet, addSheet } = useReportWorkspace(user, locals);
  const [view, setView] = useState<"resumen" | "planillas">("resumen");
  const [refreshKey, setRefreshKey] = useState(0);
  const showSheet = (localId: string, id: string) => {
    const opened = openSheet(localId, id);
    if (opened) setView("planillas");
    return opened;
  };
  const createSheet = (localId: string) => {
    const opened = addSheet(localId);
    if (opened) setView("planillas");
    return opened;
  };
  return (
    <div ref={root} className="report-workspace">
      {error && <p role="alert">{error}</p>}
      <nav aria-label="Administración de empleados" style={{display:"flex",flexWrap:"wrap",gap:8,margin:"12px 0"}}>
        <button type="button" aria-current={view === "resumen" ? "page" : undefined}
          onClick={() => { setView("resumen"); setRefreshKey(k => k + 1); }}
          style={{padding:"11px 16px",borderRadius:10,border:"1px solid #cce0e8",fontWeight:700,
            background:view === "resumen" ? "#0b6077" : "white",color:view === "resumen" ? "white" : "#0b6077"}}>
          Empleados y recibos
        </button>
        <button type="button" aria-current={view === "planillas" ? "page" : undefined}
          onClick={() => setView("planillas")}
          style={{padding:"11px 16px",borderRadius:10,border:"1px solid #cce0e8",fontWeight:700,
            background:view === "planillas" ? "#0b6077" : "white",color:view === "planillas" ? "white" : "#0b6077"}}>
          Planillas, PDF e historial
        </button>
      </nav>
      <div hidden={view !== "resumen"}>
        <EmployeeOverview key={locals.map(l => l.id).join("|") + ":" + refreshKey}
          locals={locals} ready={ready} onOpenSheet={showSheet} onAddSheet={createSheet} />
      </div>
      {/* The legacy engine remains mounted so changes are never lost on tab switch. */}
      <div style={{display:view === "planillas" ? "block" : "none"}}>
        <ReportMarkup scheduleInFolderOnly={scheduleInFolderOnly} />
      </div>
    </div>
  );
}
