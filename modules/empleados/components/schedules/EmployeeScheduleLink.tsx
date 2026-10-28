"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ExternalLink, LockKeyhole, RefreshCcw, Sheet } from "lucide-react";
import { rpc } from "@/features/access/api";
import { employeeSheetPreview } from "@/utils/employee-schedule-preview";
import { useAuth } from "@/components/auth/AuthProvider";
import "./employee-schedule-link.css";

type PrivateLink = { local_id: string; local_name: string; url: string };

/** Never requests company-wide links; the server derives the local from auth.uid(). */
export function EmployeeScheduleLink() {
  const { user } = useAuth();
  const [info, setInfo] = useState<PrivateLink | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const load = useCallback(() => setReload(n => n + 1), []);
  useEffect(() => {
    if (user?.role !== "employee" || user.status !== "approved") return;
    let alive = true;
    rpc<Partial<PrivateLink>>("rm_app_employee_schedule_view")
      .then(value => {
        if (!alive) return;
        if (value && value.local_id === user.local_id
          && typeof value.local_name === "string"
          && typeof value.url === "string"
          && employeeSheetPreview(value.url)) {
          setInfo(value as PrivateLink);
        } else setInfo(null);
        setError("");
      })
      .catch(() => {
        if (alive) {
          setInfo(null);
          setError("No pudimos comprobar el enlace privado de tu local. Actualizá para reintentar.");
        }
      })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [user?.role, user?.status, user?.local_id, reload]);
  if (user?.role !== "employee" || user.status !== "approved" || !user.local_id) return null;
  const preview = info ? employeeSheetPreview(info.url) : null;
  return <section className="employee-sheets" aria-label="Horarios de mi local">
    <div className="employee-sheets__header">
      <span className="employee-sheets__icon"><CalendarDays size={22}/></span>
      <div><h2>Horarios de mi local</h2><p>{user.local_name || info?.local_name || "Mi local asignado"} · Google Sheets</p></div>
    </div>
    <div className="employee-sheets__intro">
      <Sheet size={22} aria-hidden="true"/>
      <div>
        <strong>Planilla de Google Sheets</strong>
        <p>Consultá los horarios del local al que te asignaron. El acceso es para lectura; no podés cargar ni modificar información desde GESTLOK.</p>
      </div>
    </div>
    {busy ? <p role="status">Comprobando el enlace autorizado…</p>
      : error ? <p role="alert" className="employee-sheets__error">{error}</p>
      : preview ? <a className="employee-sheets__open" href={preview} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={17}/> Ver planilla (solo lectura)
        </a>
      : <p className="employee-sheets__pending">Tu empresa todavía no configuró un Google Sheets para este local.</p>}
    <p className="employee-sheets__note"><LockKeyhole size={15}/> El dueño debe compartir el archivo con tu cuenta de Google como <strong>Lector</strong>. Si Google te permite editar, solicitá que corrijan el permiso en Drive.</p>
    <button type="button" className="employee-sheets__refresh" disabled={busy} onClick={() => { setBusy(true); load(); }}><RefreshCcw size={15}/> Actualizar enlace</button>
  </section>;
}
