"use client";
import { useState } from "react";
import { useReportWorkspace } from "@/hooks/use-report-workspace";
import { ReportMarkup } from "./ReportMarkup";
import { EmployeeOverview } from "./EmployeeOverview";
import type { AppLocal, AppUser } from "@/types/access";

export type WorkspaceScreen = "empleados" | "recibos" | "planillas";
export function ReportWorkspace({
  user, locals, scheduleInFolderOnly = false, screen, onScreenChange,
}: {
  user: AppUser;
  locals: AppLocal[];
  scheduleInFolderOnly?: boolean;
  screen?: WorkspaceScreen;
  onScreenChange?: (screen: WorkspaceScreen) => void;
}) {
  const { root, error, ready, openSheet, addSheet, downloadPdf, shareWhatsapp } = useReportWorkspace(user, locals);
  const [internalScreen, setInternalScreen] = useState<WorkspaceScreen>("empleados");
  const activeScreen = screen ?? internalScreen;
  const changeScreen = (next: WorkspaceScreen) => {
    setInternalScreen(next);
    onScreenChange?.(next);
  };
  const showSheet = (localId: string, id: string) => {
    const opened = openSheet(localId, id);
    if (opened) changeScreen("planillas");
    return opened;
  };
  const createSheet = (localId: string) => {
    const opened = addSheet(localId);
    if (opened) changeScreen("planillas");
    return opened;
  };
  const startShare = (localId: string, id: string) => {
    const opened = shareWhatsapp(localId, id);
    if (opened) changeScreen("planillas");
    return opened;
  };
  return <div ref={root} className="report-workspace">
    {error && <p role="alert">{error}</p>}
    {!screen && <nav className="employee-pages__nav" aria-label="Administración de empleados">
      <button type="button" aria-current={activeScreen === "empleados" ? "page" : undefined} onClick={() => changeScreen("empleados")}>Administrar empleados</button>
      <button type="button" aria-current={activeScreen === "recibos" ? "page" : undefined} onClick={() => changeScreen("recibos")}>Recibos de sueldo</button>
      <button type="button" aria-current={activeScreen === "planillas" ? "page" : undefined} onClick={() => changeScreen("planillas")}>Carga individual de recibos</button>
    </nav>}
    <div style={{display: activeScreen === "planillas" ? "none" : "block"}}>
      <EmployeeOverview locals={locals} ready={ready} ownerRostering={user.role === "owner" || user.role === "admin"}
        screen={activeScreen === "recibos" ? "recibos" : "empleados"}
        onOpenSheet={showSheet} onAddSheet={createSheet}
        onDownloadPdf={downloadPdf} onShareWhatsapp={startShare}/>
    </div>
    {/* Don't unmount the existing editor: unsaved changes, PDF, private history and offline queue live here. */}
    <div style={{display:activeScreen === "planillas" ? "block" : "none"}}>
      <div className="employee-pages__editor-back"><button type="button" onClick={() => changeScreen("empleados")}>← Volver a empleados</button><button type="button" onClick={() => changeScreen("recibos")}>Ver recibos de sueldo</button></div>
      <ReportMarkup scheduleInFolderOnly={scheduleInFolderOnly} />
    </div>
  </div>;
}
