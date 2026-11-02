"use client";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Copy, History, KeyRound, Link2, Search, X } from "lucide-react";
import { horariosHistoryApi } from "@/features/schedules/history-api";
import {
  RESUMEN_COLUMNAS,
  apariciones,
  buscarSemanas,
  celda,
  estaPagado,
  fechaHora,
  fechaLarga,
  filasQueCoinciden,
  mesesDisponibles,
  nombreMes,
  normalizar,
  pendientes,
  rangoLargo,
  scriptParaSheets,
  semanaPagada,
  type HorarioLocal,
  type HorarioSemana,
} from "@/utils/schedule-history";
import styles from "./ScheduleHistory.module.css";

type Tab = "semanas" | "pendientes" | "conexion";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const mensaje = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

// Historial horarios: una copia por semana del Resumen del Google Sheets del local, con Pagado / Pendiente.
export function ScheduleHistory() {
  const [locales, setLocales] = useState<HorarioLocal[] | null>(null);
  const [localId, setLocalId] = useState("");
  const [semanas, setSemanas] = useState<HorarioSemana[] | null>(null);
  const [tab, setTab] = useState<Tab>("semanas");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [codigo, setCodigo] = useState("");
  // Búsqueda del historial: texto (colaborador, fecha o mes), mes y semana elegida.
  const [texto, setTexto] = useState("");
  const [mes, setMes] = useState("");
  const [elegida, setElegida] = useState("");

  useEffect(() => {
    let active = true;
    horariosHistoryApi
      .locales()
      .then((lista) => {
        if (!active) return;
        setLocales(lista);
        setLocalId((actual) => actual || lista[0]?.local_id || "");
      })
      .catch((e: unknown) => {
        if (!active) return;
        setLocales([]);
        setError(mensaje(e, "No se pudo cargar el historial de horarios."));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!localId) return;
    let active = true;
    horariosHistoryApi
      .historial(localId)
      .then((lista) => {
        if (active) setSemanas(lista);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setSemanas([]);
        setError(mensaje(e, "No se pudo cargar el historial de horarios."));
      });
    return () => {
      active = false;
    };
  }, [localId]);

  const local = useMemo(() => locales?.find((l) => l.local_id === localId) ?? null, [locales, localId]);
  const porPagar = useMemo(() => pendientes(semanas ?? []), [semanas]);
  const meses = useMemo(() => mesesDisponibles(semanas ?? []), [semanas]);
  const filtradas = useMemo(() => buscarSemanas(semanas ?? [], texto, mes), [semanas, texto, mes]);
  const persona = useMemo(
    () => (normalizar(texto) ? apariciones(filtradas, texto) : []),
    [filtradas, texto],
  );
  // La semana que se muestra: la elegida si sigue en la búsqueda; si no, la más nueva que coincide.
  const semana = useMemo(() => filtradas.find((s) => s.desde === elegida) ?? filtradas[0] ?? null, [filtradas, elegida]);
  const resaltadas = useMemo(
    () => new Set(semana ? filasQueCoinciden(semana, texto).map((f) => f.colaborador) : []),
    [semana, texto],
  );
  const script = useMemo(() => (codigo ? scriptParaSheets(codigo, SUPABASE_URL, SUPABASE_KEY) : ""), [codigo]);

  async function marcar(semana: HorarioSemana, nombre: string, pagado: boolean) {
    if (!local) return;
    if (!pagado && !window.confirm(`¿Volver a dejar pendiente a ${nombre} en la semana del ${rangoLargo(semana)}?`)) return;
    setOcupado(semana.desde + "|" + nombre);
    setError("");
    try {
      await horariosHistoryApi.marcarPago(local.local_id, semana.desde, nombre, pagado);
      const marcado_at = new Date().toISOString();
      setSemanas((prev) =>
        prev
          ? prev.map((s) => (s.desde === semana.desde ? { ...s, pagos: { ...s.pagos, [nombre]: { pagado, marcado_at } } } : s))
          : prev,
      );
      setAviso(pagado ? `${nombre}: semana del ${rangoLargo(semana)} pagada.` : `${nombre} quedó pendiente.`);
    } catch (e) {
      setError(mensaje(e, "No se pudo guardar el pago."));
    } finally {
      setOcupado("");
    }
  }

  async function generar() {
    if (!local) return;
    if (local.conectado && !window.confirm("Se va a generar un código nuevo y el anterior deja de funcionar. ¿Seguimos?")) return;
    setOcupado("codigo");
    setError("");
    try {
      const r = await horariosHistoryApi.generarCodigo(local.local_id);
      setCodigo(r.codigo);
      setLocales((prev) => (prev ? prev.map((l) => (l.local_id === local.local_id ? { ...l, conectado: true } : l)) : prev));
    } catch (e) {
      setError(mensaje(e, "No se pudo generar el código."));
    } finally {
      setOcupado("");
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(script);
      setAviso("Código copiado. Pegalo en Apps Script de la planilla.");
    } catch {
      setAviso("No se pudo copiar solo: seleccioná el texto y copialo.");
    }
  }

  function pago(semana: HorarioSemana, nombre: string) {
    const pagado = estaPagado(semana, nombre);
    if (!local?.puede_administrar)
      return <span className={pagado ? styles.chipOk : styles.chipPend}>{pagado ? "Pagado" : "Pendiente"}</span>;
    return (
      <button
        type="button"
        className={pagado ? styles.btnPagado : styles.btnPendiente}
        aria-pressed={pagado}
        disabled={ocupado === semana.desde + "|" + nombre}
        onClick={() => void marcar(semana, nombre, !pagado)}
      >
        {pagado ? <CheckCircle2 size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
        {pagado ? "Pagado" : "Marcar pagado"}
      </button>
    );
  }

  if (locales === null) return <p role="status">Cargando historial de horarios…</p>;
  if (!locales.length)
    return (
      <section className={styles.page}>
        <h1 className={styles.title}><History size={26} aria-hidden="true" /> Historial horarios</h1>
        {error ? <p role="alert" className={styles.error}>{error}</p> : <p className={styles.empty}>No hay historial de horarios habilitado para tus locales.</p>}
      </section>
    );

  const tabs: Array<[Tab, string]> = [
    ["semanas", `Semanas${semanas ? ` (${semanas.length})` : ""}`],
    ["pendientes", `Pendientes de pago (${porPagar.length})`],
  ];
  if (local?.puede_administrar) tabs.push(["conexion", "Conexión con Google Sheets"]);

  return (
    <section className={styles.page}>
      <span className="eyebrow">ADMINISTRACIÓN DE EMPLEADOS · HORARIOS</span>
      <h1 className={styles.title}><History size={26} aria-hidden="true" /> Historial horarios</h1>
      <p className={styles.lead}>
        Copia exacta de la pestaña «Resumen» de la planilla de Google Sheets del local, una por semana. Cada lunes podés
        cargar la semana nueva en la planilla: la anterior queda guardada acá. Buscá por colaborador, fecha o mes.
      </p>
      {locales.length > 1 && (
        <label className={styles.localSelect}>
          <span>Local</span>
          <select
            value={localId}
            onChange={(event) => {
              setSemanas(null);
              setCodigo("");
              setLocalId(event.target.value);
            }}
          >
            {locales.map((l) => (
              <option key={l.local_id} value={l.local_id}>{l.local_name}</option>
            ))}
          </select>
        </label>
      )}
      {local && (
        <p className={local.conectado && local.ultimo_envio_at ? styles.estadoOk : styles.estadoPend}>
          <Link2 size={16} aria-hidden="true" />
          {local.local_name} ·{" "}
          {local.conectado && local.ultimo_envio_at
            ? `planilla conectada · último envío ${fechaHora(local.ultimo_envio_at)}`
            : local.conectado
              ? "código generado · falta conectar la planilla"
              : "la planilla todavía no está conectada"}
        </p>
      )}
      <div className={styles.tabs} role="tablist" aria-label="Historial horarios">
        {tabs.map(([id, texto]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {texto}
          </button>
        ))}
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {aviso && <p role="status" className={styles.aviso}>{aviso}</p>}

      {tab === "semanas" &&
        (semanas === null ? (
          <p role="status">Cargando semanas…</p>
        ) : !semanas.length ? (
          <p className={styles.empty}>
            Todavía no llegó ninguna semana. {local?.puede_administrar ? "Conectá la planilla desde la pestaña «Conexión con Google Sheets»." : "La dueña tiene que conectar la planilla."}
          </p>
        ) : (
          <>
            <div className={styles.buscador}>
              <label className={styles.buscar}>
                <Search size={17} aria-hidden="true" />
                <span className={styles.oculto}>Buscar en el historial</span>
                <input
                  type="search"
                  value={texto}
                  placeholder="Buscar colaborador o fecha (ej.: Kati, 19/10, octubre)"
                  onChange={(event) => setTexto(event.target.value)}
                />
                {texto && (
                  <button type="button" className={styles.limpiar} aria-label="Borrar búsqueda" onClick={() => setTexto("")}>
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </label>
              <label className={styles.mes}>
                <span className={styles.oculto}>Mes</span>
                <select value={mes} onChange={(event) => setMes(event.target.value)}>
                  <option value="">Todos los meses</option>
                  {meses.map((m) => (
                    <option key={m} value={m}>{nombreMes(m)}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className={styles.cuenta} role="status">
              {filtradas.length === semanas.length
                ? `${semanas.length} ${semanas.length === 1 ? "semana guardada" : "semanas guardadas"}`
                : `${filtradas.length} de ${semanas.length} semanas`}
            </p>

            {!filtradas.length ? (
              <p className={styles.empty}>No hay semanas que coincidan con la búsqueda.</p>
            ) : (
              <div className={styles.historial}>
                <nav className={styles.indice} aria-label="Semanas guardadas">
                  {filtradas.map((s) => {
                    const faltan = s.filas.filter((f) => !estaPagado(s, f.colaborador)).length;
                    return (
                      <button
                        key={s.desde}
                        type="button"
                        aria-current={semana?.desde === s.desde ? "true" : undefined}
                        onClick={() => setElegida(s.desde)}
                      >
                        <b>{rangoLargo(s)}</b>
                        <small>
                          {s.filas.length} colaboradores ·{" "}
                          <span className={semanaPagada(s) ? styles.okTexto : styles.pendTexto}>
                            {semanaPagada(s) ? "todo pagado" : `${faltan} por pagar`}
                          </span>
                        </small>
                      </button>
                    );
                  })}
                </nav>

                <div className={styles.detalle}>
                  {persona.length > 0 && (
                    <section className={styles.persona} aria-label="Resultados por colaborador">
                      <h2>
                        «{texto.trim()}» en {new Set(persona.map((x) => x.semana.desde)).size}{" "}
                        {new Set(persona.map((x) => x.semana.desde)).size === 1 ? "semana" : "semanas"}
                      </h2>
                      <div className={styles.tabla}>
                        <table>
                          <thead>
                            <tr>
                              <th>Colaborador</th>
                              <th>Semana</th>
                              <th>Trabajado</th>
                              <th>OFF</th>
                              <th>Total a liquidar</th>
                              <th>Pago</th>
                            </tr>
                          </thead>
                          <tbody>
                            {persona.map(({ semana: s, fila }) => (
                              <tr key={s.desde + "|" + fila.colaborador}>
                                <td><b>{fila.colaborador}</b></td>
                                <td>
                                  <button type="button" className={styles.linkSemana} onClick={() => setElegida(s.desde)}>
                                    {rangoLargo(s)}
                                  </button>
                                </td>
                                <td>{celda(fila.trabajado)}</td>
                                <td>{celda(fila.off)}</td>
                                <td className={styles.total}>{celda(fila.total)}</td>
                                <td>{pago(s, fila.colaborador)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {semana && (
                    <article className={styles.resumen} aria-label={`Resumen de la semana del ${rangoLargo(semana)}`}>
                      {/* Copia exacta de la pestaña «Resumen» de la planilla. Los pagos van aparte, debajo. */}
                      <div className={styles.rTitulo}>Resumen de la semana</div>
                      <div className={styles.rSemana}>
                        <span>Semana</span>
                        <b>{fechaLarga(semana.desde)}</b>
                        <span>al</span>
                        <b>{fechaLarga(semana.hasta)}</b>
                      </div>
                      <div className={styles.tabla}>
                        <table className={styles.rTabla}>
                          <thead>
                            <tr>
                              {RESUMEN_COLUMNAS.map(([clave, titulo]) => (
                                <th key={clave}>{titulo}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {semana.filas.map((fila) => (
                              <tr key={fila.colaborador} className={resaltadas.has(fila.colaborador) ? styles.rResaltada : undefined}>
                                {RESUMEN_COLUMNAS.map(([clave]) => (
                                  <td key={clave}>{fila[clave]}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className={styles.rPie}>
                        <span className={styles.deslizar}>Deslizá la tabla para ver todas las columnas · </span>
                        Copia guardada de la planilla · última actualización {fechaHora(semana.recibido_at)}
                        {semana.actualizaciones > 1 ? ` · ${semana.actualizaciones} versiones` : ""}
                      </p>
                    </article>
                  )}

                  {semana && semana.filas.length > 0 && (
                    <section className={styles.pagos} aria-label={`Pagos de la semana del ${rangoLargo(semana)}`}>
                      <h2>Pagos de la semana del {rangoLargo(semana)}</h2>
                      <ul>
                        {semana.filas.map((fila) => (
                          <li key={fila.colaborador} className={resaltadas.has(fila.colaborador) ? styles.pagoResaltado : undefined}>
                            <span>
                              <b>{fila.colaborador}</b>
                              <small>Total a liquidar {celda(fila.total)}</small>
                            </span>
                            {pago(semana, fila.colaborador)}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              </div>
            )}
          </>
        ))}

      {tab === "pendientes" &&
        (!porPagar.length ? (
          <p className={styles.empty}>No hay pagos pendientes.</p>
        ) : (
          <div className={styles.tabla}>
            <table>
              <thead>
                <tr>
                  <th>Semana</th>
                  <th>Colaborador</th>
                  <th>Cobra por</th>
                  <th>Total a liquidar</th>
                  <th>Pago</th>
                </tr>
              </thead>
              <tbody>
                {porPagar.map(({ semana, fila }) => (
                  <tr key={semana.desde + "|" + fila.colaborador}>
                    <td>{rangoLargo(semana)}</td>
                    <td><b>{fila.colaborador}</b></td>
                    <td>{celda(fila.cobra_por)}</td>
                    <td className={styles.total}>{celda(fila.total)}</td>
                    <td>{pago(semana, fila.colaborador)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "conexion" && local?.puede_administrar && (
        <section className={styles.conexion}>
          <h2><Link2 size={19} aria-hidden="true" /> Conexión con Google Sheets</h2>
          <ol>
            <li>Tocá «Generar código». Si ya había uno, el anterior deja de funcionar.</li>
            <li>Abrí la planilla de horarios de {local.local_name} → Extensiones → Apps Script. Borrá lo que haya, pegá el código y guardá.</li>
            <li>Recargá la planilla. En el menú «GESTLOK» elegí «Conectar con GESTLOK (una sola vez)» y aceptá los permisos de Google.</li>
            <li>Listo: cada cambio de la planilla se guarda acá y, además, una vez por hora. También podés usar «Enviar la semana ahora».</li>
          </ol>
          <button type="button" className={styles.btnPrincipal} disabled={ocupado === "codigo"} onClick={() => void generar()}>
            <KeyRound size={17} aria-hidden="true" /> {local.conectado ? "Generar un código nuevo" : "Generar código"}
          </button>
          {script && (
            <>
              <textarea className={styles.script} readOnly value={script} rows={16} aria-label="Código para Apps Script" />
              <button type="button" className={styles.btnPrincipal} onClick={() => void copiar()}>
                <Copy size={17} aria-hidden="true" /> Copiar código
              </button>
              <p className={styles.nota}>Pegalo solo en la planilla del local: con este código se pueden enviar sus horarios a GESTLOK.</p>
            </>
          )}
        </section>
      )}
    </section>
  );
}
