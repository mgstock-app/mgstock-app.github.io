// Historial horarios: copia por semana del Resumen del Google Sheets del local (lo envía un script del Sheets).
export type HorarioFila = {
  colaborador: string;
  puesto: string;
  cobra_por: string;
  trabajado: string;
  off: string;
  feriado: string;
  ausentes: string;
  vacaciones: string;
  total: string;
  observaciones: string;
};
export type HorarioPago = { pagado: boolean; marcado_at: string };
export type HorarioSemana = {
  desde: string;
  hasta: string;
  filas: HorarioFila[];
  recibido_at: string;
  actualizaciones: number;
  pagos: Record<string, HorarioPago>;
};
export type HorarioLocal = {
  local_id: string;
  local_name: string;
  conectado: boolean;
  ultimo_envio_at: string | null;
  codigo_at: string | null;
  puede_administrar: boolean;
};
export type Pendiente = { semana: HorarioSemana; fila: HorarioFila };

export const COLUMNAS: ReadonlyArray<readonly [keyof HorarioFila, string]> = [
  ["puesto", "Puesto"],
  ["cobra_por", "Cobra por"],
  ["trabajado", "Trabajado"],
  ["off", "OFF"],
  ["feriado", "Feriado"],
  ["ausentes", "Ausentes"],
  ["vacaciones", "Vacaciones"],
  ["total", "Total a liquidar"],
];

// «2026-10-19» → «19/10». Las fechas del servidor se muestran tal cual, sin pasar por la zona del equipo.
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}` : iso || "";
}
export function rangoSemana(s: Pick<HorarioSemana, "desde" | "hasta">): string {
  return `${fechaCorta(s.desde)} al ${fechaCorta(s.hasta)}`;
}
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
// Celdas vacías o con guion se muestran como «–».
export function celda(v: string | undefined): string {
  const t = (v ?? "").trim();
  return t === "" || t === "-" ? "–" : t;
}
export function estaPagado(s: HorarioSemana, colaborador: string): boolean {
  return s.pagos?.[colaborador]?.pagado === true;
}
export function pendientes(semanas: HorarioSemana[]): Pendiente[] {
  return semanas.flatMap((semana) =>
    semana.filas.filter((fila) => !estaPagado(semana, fila.colaborador)).map((fila) => ({ semana, fila })),
  );
}
export function semanaPagada(s: HorarioSemana): boolean {
  return s.filas.length > 0 && s.filas.every((f) => estaPagado(s, f.colaborador));
}

// Script de Apps Script que se pega en el Google Sheets del local. Lee la pestaña «Resumen» (plantilla GESTLOK:
// B2 desde, D2 hasta, colaboradores en A5:J14) y la manda con el código de conexión. En Munro, debajo del bloque
// hay un «HISTORIAL» manual: por eso el rango es fijo y no llega hasta la última fila.
export function scriptParaSheets(codigo: string, url: string, clave: string): string {
  const q = (v: string) => "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  return [
    "// GESTLOK · Historial horarios. Pegalo en Extensiones → Apps Script de la planilla del local.",
    "// Manda el Resumen de la semana a GESTLOK cada vez que cambia algo y una vez por hora.",
    "var GESTLOK_URL = " + q(url.replace(/\/+$/, "")) + ";",
    "var GESTLOK_CLAVE = " + q(clave) + ";",
    "var GESTLOK_CODIGO = " + q(codigo) + ";",
    "",
    "function onOpen() {",
    "  SpreadsheetApp.getUi().createMenu('GESTLOK')",
    "    .addItem('Conectar con GESTLOK (una sola vez)', 'conectarGestlok')",
    "    .addItem('Enviar la semana ahora', 'enviarAhora')",
    "    .addToUi();",
    "}",
    "",
    "function enviarSemana() {",
    "  var hoja = SpreadsheetApp.getActive().getSheetByName('Resumen');",
    "  if (!hoja) throw new Error('No encuentro la pestaña Resumen.');",
    "  var desde = hoja.getRange('B2').getDisplayValue();",
    "  var hasta = hoja.getRange('D2').getDisplayValue();",
    "  // Solo los 10 lugares de colaboradores de la plantilla (filas 5 a 14). Lo que haya más abajo no se envía.",
    "  var datos = hoja.getRange('A5:J14').getDisplayValues();",
    "  var filas = [];",
    "  datos.forEach(function (r) {",
    "    if (String(r[0]).trim()) filas.push({colaborador: r[0], puesto: r[1], cobra_por: r[2], trabajado: r[3], off: r[4],",
    "      feriado: r[5], ausentes: r[6], vacaciones: r[7], total: r[8], observaciones: r[9]});",
    "  });",
    "  var res = UrlFetchApp.fetch(GESTLOK_URL + '/rest/v1/rpc/rm_horarios_recibir', {",
    "    method: 'post', contentType: 'application/json', muteHttpExceptions: true,",
    "    headers: GESTLOK_CLAVE.indexOf('eyJ') === 0 ? {apikey: GESTLOK_CLAVE, Authorization: 'Bearer ' + GESTLOK_CLAVE} : {apikey: GESTLOK_CLAVE},",
    "    payload: JSON.stringify({p_codigo: GESTLOK_CODIGO, p_desde: desde, p_hasta: hasta, p_filas: filas.slice(0, 60)})",
    "  });",
    "  if (res.getResponseCode() >= 300) throw new Error('GESTLOK no recibió la semana: ' + res.getContentText());",
    "  return JSON.parse(res.getContentText());",
    "}",
    "",
    "function alCambiar() {",
    "  try { enviarSemana(); } catch (e) { console.warn(e); }",
    "}",
    "",
    "function enviarAhora() {",
    "  var r = enviarSemana();",
    "  SpreadsheetApp.getUi().alert('Listo: GESTLOK guardó la semana del ' + r.semana + ' (' + r.colaboradores + ' colaboradores).');",
    "}",
    "",
    "function conectarGestlok() {",
    "  ScriptApp.getProjectTriggers().forEach(function (t) {",
    "    if (t.getHandlerFunction() === 'alCambiar') ScriptApp.deleteTrigger(t);",
    "  });",
    "  ScriptApp.newTrigger('alCambiar').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();",
    "  ScriptApp.newTrigger('alCambiar').timeBased().everyHours(1).create();",
    "  enviarAhora();",
    "}",
    "",
  ].join("\n");
}
