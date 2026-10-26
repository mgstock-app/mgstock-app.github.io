"use client";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { rpc } from "@/features/access/api";
import { visibleBranchScheduleLinks } from "@/utils/branch-schedule-links";
import { Clock3, CircleHelp, ExternalLink, Link2, Copy, Check, Info, FileText, LockKeyhole, UserRound } from "lucide-react";
import { copyBranchScheduleLink } from "@/utils/branch-schedule-links";
import styles from "./ScheduleSheetCard.module.css";

function SheetsIcon() {
  return <svg viewBox="0 0 64 80" aria-hidden="true" className={styles.sheetsIcon}>
    <path fill="#0f9d58" d="M8 0h33l23 23v49a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8Z"/>
    <path fill="#87ceac" d="M41 0v23h23Z"/>
    <path fill="none" stroke="#fff" strokeWidth="3" d="M15 35h34v28H15zM15 44h34M15 53h34M27 35v28"/>
  </svg>;
}

// Plantilla predeterminada de GESTLOK (la misma estructura semanal que usa la app: turnos, OFF, feriados y totales).
const TEMPLATE_URL = `${process.env.NEXT_PUBLIC_GESTLOK_HOME || "/"}plantillas/GESTLOK-plantilla-horarios.xlsx`;

export function ScheduleSheetCard({ url, branch = "Torcuato", localId, canConfigure = false, onUpdated }: { url: string | null; branch?: string; localId?: string; canConfigure?: boolean; onUpdated?: () => void }) {
  const pending = url === null;
  const branchLabel = branch === "Torcuato" ? "Don Torcuato" : branch;
  const titleId = useId();
  const helpId = useId();
  const [help, setHelp] = useState(false);
  const [copy, setCopy] = useState<"idle" | "success" | "error">("idle");
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState(url || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  async function copyLink() {
    if (pending) return;
    try {
      await copyBranchScheduleLink(url, navigator.clipboard);
      setCopy("success");
    } catch { setCopy("error"); }
  }
  async function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canConfigure || !localId || saving) return;
    const next = draftUrl.trim();
    if (next && visibleBranchScheduleLinks([{url: next}]).length !== 1) {
      setSaveError("Ingresá una URL válida de Google Sheets.");
      return;
    }
    if (!next && url && !window.confirm("¿Quitar el enlace actual? La tarjeta quedará pendiente hasta que configures uno nuevo.")) return;
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const result = await rpc<unknown>("rm_app_set_branch_schedule_link", {p_local: localId, p_url: next || null});
      const queued = !!result && typeof result === "object" && "gl_pending" in result;
      setEditing(false);
      setSaveSuccess(queued
        ? "Sin conexión: el cambio quedó guardado en este equipo y se envía solo al volver internet."
        : next ? "Enlace guardado correctamente." : "Enlace quitado. Podés agregar otro cuando quieras.");
      onUpdated?.();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "No se pudo guardar el enlace.");
    } finally {
      setSaving(false);
    }
  }
  return <section className={styles.card} aria-labelledby={titleId}>
    <header className={styles.header}>
      <Clock3 className={styles.clock} aria-hidden="true"/>
      <div className={styles.heading}>
        <h2 id={titleId}>{branchLabel}</h2>
        <p>Planilla de turnos de la sucursal</p>
      </div>
      <button className={styles.helpButton} type="button" aria-expanded={help} aria-controls={helpId} onClick={() => setHelp(!help)}><CircleHelp size={17} aria-hidden="true"/>Ayuda</button>
    </header>
    <div id={helpId} className={styles.help} hidden={!help}>
      {pending ? "Todavía no hay un enlace configurado para este local. El dueño puede agregar su Google Sheets cuando esté disponible." : "Abrí la planilla e ingresá con tu cuenta de Google autorizada. Si Google indica que no tenés acceso o el archivo no abre, contactá a Administración. También podés copiar el enlace y pegarlo en tu navegador."}
    </div>
    <div className={styles.feature}>
      <div className={styles.featureHeading}><SheetsIcon/><div><h3>Google Sheets</h3><p>Consultá el archivo de esta sucursal.</p></div></div>
      <div className={styles.actions}>
        {pending ? <button className={styles.openButton} type="button" disabled><ExternalLink size={22} aria-hidden="true"/>Abrir planilla</button> : <a className={styles.openButton} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={22} aria-hidden="true"/>Abrir planilla</a>}
        <button className={styles.copyButton} type="button" disabled={pending} onClick={() => void copyLink()}>{copy === "success" ? <Check size={21} aria-hidden="true"/> : <Link2 size={21} aria-hidden="true"/>}{copy === "success" ? "Enlace copiado" : "Copiar enlace"}</button>
      </div>
      <div className={styles.source}>
        <span className={styles.sourceIcon}><Link2 size={26} aria-hidden="true"/></span>
        <div className={styles.sourceBody}><h4>Origen: Google Sheets</h4>
          <div className={styles.urlBox}><span className={styles.url} title={url || undefined}>{url || "Enlace pendiente"}</span><button className={styles.iconButton} type="button" disabled={pending} onClick={() => void copyLink()} aria-label="Copiar URL de Google Sheets">{copy === "success" ? <Check size={20}/> : <Copy size={20}/>}</button></div>
          <p className={styles.newTab}><ExternalLink size={15} aria-hidden="true"/>{pending ? "Se habilitará cuando Administración asigne la URL." : "Se abre en una nueva pestaña."}</p>
        </div>
      </div>
      <p className={styles.copyStatus} role="status" aria-live="polite">{copy === "success" ? "Enlace copiado al portapapeles." : copy === "error" ? "No pudimos copiar el enlace. Podés seleccionar la URL y copiarla manualmente." : ""}</p>
    </div>
    {canConfigure && localId && <div className={styles.configuration}>
      <div className={styles.configurationHead}>
        <div><strong>Enlace de esta sucursal</strong><p>Solo los dueños de esta empresa pueden configurar su Google Sheets.</p></div>
        {!editing && <button className={styles.configureButton} type="button" onClick={() => { setDraftUrl(url || ""); setSaveError(""); setSaveSuccess(""); setEditing(true); }}>{pending ? "Configurar enlace" : "Cambiar enlace"}</button>}
      </div>
      <div className={styles.templates} role="group" aria-label="Elegí la planilla de horarios">
        <div className={styles.templateOption}>
          <strong>Plantilla GESTLOK (predeterminada)</strong>
          <p>Planilla semanal lista para usar: entradas y salidas de mañana y noche, turnos, OFF, feriados, ausentes y totales automáticos. Descargala, subila a tu Google Drive, abrila con Google Sheets y pegá acá su enlace.</p>
          <a className={styles.templateButton} href={TEMPLATE_URL} download="GESTLOK-plantilla-horarios.xlsx">Descargar plantilla GESTLOK (.xlsx)</a>
        </div>
        <div className={styles.templateOption}>
          <strong>Tu propia planilla</strong>
          <p>¿Ya usás tu propio Excel o Google Sheets? Subilo a Google Drive y pegá su enlace con «{pending ? "Configurar enlace" : "Cambiar enlace"}». Cada local puede usar la plantilla GESTLOK o la suya.</p>
        </div>
      </div>
      {editing && <form onSubmit={event => void saveLink(event)} className={styles.configurationForm}>
        <label htmlFor={titleId + "-link"}>URL de Google Sheets</label>
        <input id={titleId + "-link"} value={draftUrl} onChange={event => setDraftUrl(event.target.value)} type="url" maxLength={2048} placeholder="https://docs.google.com/spreadsheets/d/…/edit?gid=…" disabled={saving} autoComplete="off" />
        <p>Pegá el enlace de la pestaña que querés abrir. Si dejás el campo vacío, se quitará el enlace actual.</p>
        <div className={styles.configurationActions}><button className={styles.configureButton} type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar enlace"}</button><button className={styles.configureCancel} type="button" disabled={saving} onClick={() => { setEditing(false); setSaveError(""); }}>Cancelar</button></div>
      </form>}
      {saveError && <p role="alert" className={styles.configureError}>{saveError}</p>}
      {saveSuccess && <p role="status" className={styles.configureSuccess}>{saveSuccess}</p>}
    </div>}
    <aside className={styles.information}><Info size={24} aria-hidden="true"/><div><h3>Información</h3><p>{pending ? "Esta sucursal todavía no tiene un enlace de Google Sheets asignado." : "El archivo se gestiona en Google Sheets. Solo usuarios autorizados pueden editar su contenido."}</p></div></aside>
    <dl className={styles.metadata}>
      <div><FileText aria-hidden="true"/><div><dt>Archivo</dt><dd>Planilla de {branchLabel}</dd></div></div>
      <div><FileText aria-hidden="true"/><div><dt>Tipo</dt><dd>Google Sheets</dd></div></div>
      <div><LockKeyhole aria-hidden="true"/><div><dt>Acceso</dt><dd>Usuarios autorizados</dd></div></div>
      <div><UserRound aria-hidden="true"/><div><dt>Responsable</dt><dd>Administración</dd></div></div>
    </dl>
  </section>;
}
