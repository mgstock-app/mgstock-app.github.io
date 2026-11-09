"use client";
/* Scrollable table regions must be focusable for keyboard scrolling. */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
import { useCallback, useEffect, useState } from "react";
import { Archive, RefreshCw } from "lucide-react";
import { horariosHistoryApi } from "@/features/schedules/history-api";
import { Grid } from "./ScheduleArchiveTable";
import type { HojaArchivada } from "@/utils/schedule-history";
import styles from "./ScheduleHistory.module.css";

type Live = { desde: string; hasta: string; tablas: Record<"Resumen" | "Semana", HojaArchivada>; actualizado_at: string };
type Props = {local:string; puedeArchivar:boolean; archivadas:string[]; onArchivada:()=>void};

function mondayArgentina(): string {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const part = (name: string) => parts.find(p => p.type === name)?.value ?? "";
  const d = new Date(Date.UTC(Number(part("year")),Number(part("month"))-1,Number(part("day"))));
  d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  return d.toISOString().slice(0,10);
}
const fecha = (date:string) => {
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? m[3]+"/"+m[2]+"/"+m[1] : date;
};
const hora = (iso:string) => new Date(iso).toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires",dateStyle:"short",timeStyle:"short"});

export function ScheduleLive({local,puedeArchivar,archivadas,onArchivada}:Props) {
  const [live,setLive] = useState<Live|null>(null);
  const [sincronizada,setSincronizada] = useState(false);
  const [lunesActual,setLunesActual] = useState("");
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [guardando,setGuardando] = useState(false);
  const [guardada,setGuardada] = useState("");
  const [error,setError] = useState("");
  const [aviso,setAviso] = useState("");

  const refresh=useCallback(async()=>{
    if(local!=="munro")return;
    setRefreshing(true);
    try {
      const data=await horariosHistoryApi.enVivo(local);
      const valid=!!data&&!Array.isArray(data)&&typeof data.desde==="string"&&
        typeof data.actualizado_at==="string"&&!!data.tablas?.Resumen&&!!data.tablas?.Semana;
      const snapshot=valid?data:null;
      setLive(snapshot);
      setLunesActual(mondayArgentina());
      setSincronizada(!!snapshot&&Number.isFinite(Date.parse(snapshot.actualizado_at))&&
        (Date.now()-Date.parse(snapshot.actualizado_at))<30*60*1000);
      setError("");
    } catch {
      setError("No se pudieron consultar los horarios en vivo. Revisá la conexión.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  },[local]);

  useEffect(()=>{
    if(local!=="munro")return;
    const start=window.setTimeout(()=>{void refresh();},0);
    const id=window.setInterval(()=>{ if(document.visibilityState==="visible")void refresh(); },30000);
    return ()=>{window.clearTimeout(start);window.clearInterval(id);};
  },[local,refresh]);

  if(local!=="munro")return null;
  const actual=!!live&&live.desde===lunesActual;
  const archivada=!!live&&(archivadas.includes(live.desde)||guardada===live.desde);

  async function archivar() {
    if(!live||!puedeArchivar||guardando||archivada||!sincronizada)return;
    const snapshot=live;
    if(!window.confirm("¿Enviar al historial la semana del "+fecha(snapshot.desde)+" al "+fecha(snapshot.hasta)+"?\n\nSe guardarán Resumen y Semana tal como llegaron desde Google Sheets. No se modifica ni se limpia la planilla. La copia histórica quedará cerrada para evitar cambios accidentales."))return;
    setGuardando(true);setError("");setAviso("");
    try {
      const result=await horariosHistoryApi.archivarManual("munro",snapshot.desde,snapshot.actualizado_at);
      if(!result?.ok)throw Error("No se confirmó el guardado.");
      setGuardada(snapshot.desde);
      setAviso(result.archivada?"Esa semana ya estaba guardada en el historial.":"Semana y Resumen guardados correctamente en el historial.");
      onArchivada();
    } catch(e) {
      setError(e instanceof Error?e.message:"No se pudo enviar al historial.");
      await refresh();
    } finally {setGuardando(false);}
  }

  return <section className={styles.resumen} aria-label="Horarios en vivo de Munro">
    <header className={styles.liveHeader}>
      <div><h2>Semana actual · Google Sheets</h2><p>Se actualiza al recibir cambios de la planilla de Munro.</p></div>
      <button type="button" className={styles.liveRefresh} onClick={()=>void refresh()} disabled={refreshing} aria-label="Actualizar vista de horarios"><RefreshCw size={16} aria-hidden="true" /> {refreshing?"Actualizando…":"Actualizar"}</button>
    </header>
    {puedeArchivar&&<div className={styles.liveActions}>
      <div>
        <strong>Archivo manual de horarios</strong>
        <p>{archivada?"Esta semana ya está guardada. Elegí «Historial» para verla.":!live?"Esperando los datos de Google Sheets para habilitar el guardado.":!sincronizada?"Sincronizá primero los últimos cambios desde Google Sheets.":"Guardá una copia de Resumen y Semana cuando estén completos. La planilla original no se modifica."}</p>
      </div>
      <button className={styles.btnPrincipal} type="button" disabled={guardando||archivada||!sincronizada||loading||!live} onClick={()=>void archivar()} title={archivada?"Semana ya guardada":!sincronizada?"Actualizá primero Google Sheets":"Enviar una copia de Resumen y Semana al historial"}>
        <Archive size={18} aria-hidden="true" /> {guardando?"Guardando…":archivada?"Ya enviada al historial":"Enviar a historial"}
      </button>
    </div>}
    {loading&&<p role="status" className={styles.rPie}>Cargando horarios actuales…</p>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {aviso&&<p role="status" className={styles.aviso}>{aviso}</p>}
    {!loading&&!live&&<p role="status" className={styles.rPie}>Todavía no llegó una planilla en vivo. Desde Google Sheets elegí GESTLOK → Enviar la semana ahora.</p>}
    {live&&<>
      <div className={styles.liveStatus}>
        <p><b>Semana {fecha(live.desde)} al {fecha(live.hasta)}</b> · Último envío {hora(live.actualizado_at)}</p>
        <span className={sincronizada?styles.liveOk:styles.liveWarning}>{sincronizada?"Sincronizada":"Sin actualización reciente"}</span>
      </div>
      {!actual&&<p role="alert" className={styles.liveAttention}>Google Sheets sigue mostrando la semana del {fecha(live.desde)}. La semana actual comienza el {fecha(lunesActual)}. Actualizá las fechas en la planilla y elegí «Enviar la semana ahora» para mostrarla acá.</p>}
      {!sincronizada&&<p role="status" className={styles.rPie}>La última sincronización tiene más de 30 minutos. Antes de archivar, abrí Google Sheets y ejecutá «Enviar la semana ahora».</p>}
      {(["Resumen","Semana"] as const).map(hoja=><section key={hoja} aria-label={hoja+" en vivo"}>
        <h3 className={styles.rTitulo}>{hoja}</h3>
        <div className={hoja==="Semana"?[styles.tabla,styles.semanaScrollable].join(" "):styles.tabla} role="region" tabIndex={0} aria-label={"Tabla "+hoja+" en vivo, desplazamiento vertical y horizontal"}>
          <Grid hoja={live.tablas[hoja]} nombre={hoja+" en vivo"} />
        </div>
      </section>)}

    </>}
  </section>;
}
