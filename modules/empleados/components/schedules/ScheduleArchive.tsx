"use client";
import { useEffect, useState } from "react";
import { horariosHistoryApi } from "@/features/schedules/history-api";
import { ScheduleArchiveTable } from "./ScheduleArchiveTable";
import type { HorarioFila } from "@/utils/schedule-history";
import styles from "./ScheduleHistory.module.css";

export function ScheduleArchive(props: { local: string; archivo?: string; hoja: "Resumen" | "Semana"; desde: string; filas?: HorarioFila[] }) {
  return props.local === "munro" ? <ScheduleArchiveTable {...props} filas={props.filas ?? []} /> : <LegacyArchive {...props} />;
}

function LegacyArchive({ local, archivo, hoja, desde }: {
  local: string; archivo?: string; hoja: "Resumen" | "Semana"; desde: string;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!archivo) return;
    let active = true;
    let objectUrl = "";
    horariosHistoryApi.archivo(local, archivo, hoja).then((data) => {
      if (!active) return;
      const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0));
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setUrl(objectUrl);
    }).catch(() => { if (active) setError("No se pudo abrir el PDF guardado. Volvé a intentar al recargar."); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [local, archivo, hoja]);
  return (
    <section className={styles.resumen} aria-label={`Hoja ${hoja} archivada`}>
      <h2 className={styles.rTitulo}>Hoja {hoja}</h2>
      {!archivo ? <p className={styles.rPie}>Esta semana todavía no tiene una copia PDF de {hoja}. Para conservarla, usá «Guardar semana en historial» desde la planilla antes de limpiarla.</p>
        : error ? <p role="alert" className={styles.rPie}>{error}</p>
        : !url ? <p role="status" className={styles.rPie}>Cargando PDF guardado…</p>
        : <>
          <p className={styles.rPie}><a href={url} target="_blank" rel="noreferrer">Abrir {hoja} completa</a>{" · "}<a href={url} download={`${desde}-${hoja}.pdf`}>Descargar PDF</a></p>
          <iframe className={styles.pdf} src={url} title={`${hoja} completa del ${desde}`} />
          <p className={styles.rPie}>Copia permanente guardada en GESTLOK. Se conserva aunque se limpie Google Sheets.</p>
        </>}
    </section>
  );
}
