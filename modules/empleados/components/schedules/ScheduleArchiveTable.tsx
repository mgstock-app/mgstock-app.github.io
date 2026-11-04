"use client";
/* Scrollable table regions must be focusable for keyboard scrolling. */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { horariosHistoryApi } from "@/features/schedules/history-api";
import { RESUMEN_COLUMNAS, type HorarioFila, type HojaArchivada } from "@/utils/schedule-history";
import styles from "./ScheduleHistory.module.css";

export function Grid({ hoja, nombre }: { hoja: HojaArchivada; nombre: string }) {
  const covered = new Set<string>();
  const spans = new Map<string, { rows: number; cols: number }>();
  for (const m of hoja.merges) {
    spans.set(m.row + ":" + m.col, { rows: m.rows, cols: m.cols });
    for (let r = m.row; r < m.row + m.rows; r++)
      for (let c = m.col; c < m.col + m.cols; c++)
        if (r !== m.row || c !== m.col) covered.add(r + ":" + c);
  }
  const rows = hoja.values.map((row, r) => (
    <tr key={r}>{row.map((value, c) => {
      if (covered.has(r + ":" + c)) return null;
      const span = spans.get(r + ":" + c);
      const Cell = r < hoja.headerRows ? "th" : "td";
      const background = hoja.backgrounds[r]?.[c];
      const color = hoja.colors[r]?.[c];
      return <Cell key={c} rowSpan={span?.rows} colSpan={span?.cols}
        style={r < hoja.headerRows ? undefined : {
          backgroundColor: /^#[0-9a-f]{6}$/i.test(background ?? "") ? background : "#fff",
          color: /^#[0-9a-f]{6}$/i.test(color ?? "") ? color : "#111827",
          whiteSpace: "pre-wrap",
        }}>{value}</Cell>;
    })}</tr>
  ));
  const esSemana = nombre.startsWith("Semana");
  const columnas = Math.max(hoja.values.reduce((max, row) => Math.max(max, row.length), 0), 1);
  return <table className={styles.rTabla} aria-label={nombre}
    style={esSemana ? { width: `${columnas * 96}px`, minWidth: `${columnas * 96}px`, tableLayout: "fixed" } : undefined}>
    <thead>{rows.slice(0, hoja.headerRows)}</thead><tbody>{rows.slice(hoja.headerRows)}</tbody>
  </table>;
}

export function ScheduleArchiveTable({ local, archivo, hoja, desde, filas }: {
  local: string; archivo?: string; hoja: "Resumen" | "Semana"; desde: string; filas: HorarioFila[];
}) {
  const [data, setData] = useState<{ tabla: HojaArchivada | null; filas: HorarioFila[] } | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    if (!archivo) return;
    let active = true;
    horariosHistoryApi.tabla(local, archivo, hoja).then(result => {
      if (active) setData(result);
    }).catch(() => { if (active) setError("No se pudo cargar la tabla guardada. Recargá para reintentar."); });
    return () => { active = false; };
  }, [local, archivo, hoja]);

  async function download() {
    if (!archivo || downloading) return;
    setDownloading(true);
    setError("");
    let url = "";
    try {
      const result = await horariosHistoryApi.archivo(local, archivo, hoja);
      url = URL.createObjectURL(new Blob([Uint8Array.from(atob(result.pdf), c => c.charCodeAt(0))], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = desde + "-" + hoja + ".pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch { setError("No se pudo descargar el PDF. Volvé a intentar."); }
    finally {
      if (url) { const savedUrl = url; window.setTimeout(() => URL.revokeObjectURL(savedUrl), 60000); }
      setDownloading(false);
    }
  }
  const savedRows = data?.filas ?? filas;
  return <section className={styles.resumen} aria-label={`Hoja ${hoja} archivada`}>
    <header className={styles.archiveHeader}>
      <h2 className={styles.rTitulo}>{hoja}</h2>
      {archivo && <button type="button" className={styles.download} disabled={downloading}
        aria-label={`Descargar PDF de ${hoja}`} title={`Descargar PDF de ${hoja}`}
        onClick={() => void download()}><Download size={20} aria-hidden="true" /></button>}
    </header>
    {error && <p role="alert" className={styles.rPie}>{error}</p>}
    {archivo && !data && !error ? <p role="status" className={styles.rPie}>Cargando tabla guardada…</p>
      : data?.tabla ? <div className={hoja === "Semana" ? `${styles.tabla} ${styles.semanaScrollable}` : styles.tabla} tabIndex={0} role="region" aria-label={`Tabla de ${hoja}; desplazamiento vertical y horizontal`}>
          <Grid hoja={data.tabla} nombre={`${hoja} del ${desde}`} />
        </div>
      : hoja === "Resumen" ? <div className={styles.tabla} tabIndex={0} role="region" aria-label="Tabla de Resumen; desplazamiento horizontal">
          <table className={styles.rTabla} aria-label={`Resumen del ${desde}`}>
            <thead><tr>{RESUMEN_COLUMNAS.map(([key, title]) => <th key={key} scope="col">{title}</th>)}</tr></thead>
            <tbody>{savedRows.map((row, i) => <tr key={i}>{RESUMEN_COLUMNAS.map(([key]) => <td key={key}>{row[key]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      : !error && <p className={styles.rPie}>{archivo
          ? "Esta semana se guardó antes de incorporar las tablas. Su información original se conserva en el PDF descargable."
          : "Esta semana todavía no tiene una tabla archivada de Semana."}</p>}
    <p className={styles.rPie}>Datos históricos guardados · {desde}<span className={styles.deslizar}> · Deslizá para ver todas las columnas</span></p>
  </section>;
}
