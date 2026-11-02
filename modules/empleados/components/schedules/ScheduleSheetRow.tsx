"use client";
import { useState } from "react";
import { Check, ExternalLink, Link2, Settings2 } from "lucide-react";
import { copyBranchScheduleLink } from "@/utils/branch-schedule-links";
import { ScheduleSheetCard, SheetsIcon } from "./ScheduleSheetCard";
import styles from "./ScheduleSheetCard.module.css";

// Una fila por local: abrir la planilla de Google Sheets de un toque. Quien puede configurarla despliega la tarjeta completa.
export function ScheduleSheetRow({ url, branch, localId, canConfigure = false, onUpdated }: { url: string | null; branch: string; localId: string; canConfigure?: boolean; onUpdated?: () => void }) {
  const pending = url === null;
  const label = branch === "Torcuato" ? "Don Torcuato" : branch;
  const [copy, setCopy] = useState<"idle" | "success" | "error">("idle");
  const [config, setConfig] = useState(false);
  async function copyLink() {
    if (pending) return;
    try {
      await copyBranchScheduleLink(url, navigator.clipboard);
      setCopy("success");
    } catch {
      setCopy("error");
    }
  }
  return <div className={styles.rowWrap}>
    <div className={styles.row}>
      <SheetsIcon/>
      <div className={styles.rowText}>
        <strong>Planilla de horarios · {label}</strong>
        <small>{pending ? "Todavía no tiene un enlace de Google Sheets." : "Google Sheets · se abre en otra pestaña"}</small>
      </div>
      <div className={styles.rowActions}>
        {!pending && <a className={styles.rowOpen} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} aria-hidden="true"/>Abrir planilla</a>}
        {!pending && <button className={styles.rowButton} type="button" onClick={() => void copyLink()}>{copy === "success" ? <Check size={17} aria-hidden="true"/> : <Link2 size={17} aria-hidden="true"/>}{copy === "success" ? "Copiado" : "Copiar enlace"}</button>}
        {canConfigure && <button className={styles.rowButton} type="button" aria-expanded={config} onClick={() => setConfig(!config)}><Settings2 size={17} aria-hidden="true"/>{pending ? "Configurar enlace" : "Cambiar enlace"}</button>}
      </div>
    </div>
    <p className={styles.rowStatus} role="status" aria-live="polite">{copy === "success" ? "Enlace copiado al portapapeles." : copy === "error" ? "No pudimos copiar el enlace. Abrí la planilla y copiá la dirección." : ""}</p>
    {config && <ScheduleSheetCard url={url} branch={branch} localId={localId} canConfigure onUpdated={onUpdated}/>}
  </div>;
}
