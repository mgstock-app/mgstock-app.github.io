"use client";
/* Scrollable table regions must be focusable for keyboard scrolling. */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
import { useEffect, useState } from "react";
import { horariosHistoryApi } from "@/features/schedules/history-api";
import { Grid } from "./ScheduleArchiveTable";
import type { HojaArchivada } from "@/utils/schedule-history";
import styles from "./ScheduleHistory.module.css";

type Live = { desde: string; hasta: string; tablas: Record<"Resumen" | "Semana", HojaArchivada>; actualizado_at: string };
function mondayArgentina(): string {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const part = (name: string) => parts.find(p => p.type === name)?.value ?? "";
  const d = new Date(Date.UTC(Number(part("year")),Number(part("month"))-1,Number(part("day"))));
  const weekday = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((weekday + 6) % 7));
  return d.toISOString().slice(0,10);
}

export function ScheduleLive({local}: {local:string}) {
  const [live,setLive] = useState<Live | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  useEffect(() => {
    if (local !== "munro") return;
    let active = true;
    const refresh = () => {
      horariosHistoryApi.enVivo(local).then(data => {
        if (active) { setLive(data); setLoading(false); setError(""); }
      }).catch(() => { if (active) { setLoading(false); setError("No se pudo actualizar la vista en vivo."); } });
    };
    refresh();
    const id = window.setInterval(refresh,30000);
    return () => { active=false;window.clearInterval(id); };
  },[local]);
  if (local !== "munro") return null;
  const actual = live?.desde === mondayArgentina();
  return <section className={styles.resumen} aria-label="Horarios en vivo de Munro">
    <h2 className={styles.rTitulo}>Horarios de esta semana · En vivo</h2>
    <p className={styles.rPie}>Resumen y Semana se sincronizan desde Google Sheets automáticamente. Esta vista no modifica el historial archivado.</p>
    {loading && <p role="status">Cargando horarios actuales…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !actual && <p role="status">Esperando los horarios de la semana actual desde Google Sheets. La semana anterior permanece en Historial.</p>}
    {actual && live && <>
      <p className={styles.rPie}>Semana {live.desde} al {live.hasta} · Última sincronización: {new Date(live.actualizado_at).toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"})}</p>
      {(["Resumen","Semana"] as const).map(hoja => <section key={hoja} aria-label={hoja+" en vivo"}>
        <h3 className={styles.rTitulo}>{hoja}</h3>
        <div className={styles.tabla} role="region" tabIndex={0} aria-label={"Tabla "+hoja+" en vivo, desplazamiento horizontal"}>
          <Grid hoja={live.tablas[hoja]} nombre={hoja+" en vivo"} />
        </div>
      </section>)}
    </>}
  </section>;
}
