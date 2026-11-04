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
export type HojaArchivada = {
  values: string[][];
  backgrounds: string[][];
  colors: string[][];
  headerRows: number;
  merges: Array<{ row: number; col: number; rows: number; cols: number }>;
};
export type HorarioPago = { pagado: boolean; marcado_at: string };
export type HorarioSemana = {
  archivo_id?: string;
  archivado_at?: string;
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

// Copia exacta de la pestaña «Resumen»: mismas columnas, mismos títulos y en el mismo orden que la planilla.
export const RESUMEN_COLUMNAS: ReadonlyArray<readonly [keyof HorarioFila, string]> = [
  ["colaborador", "Colaborador"],
  ["puesto", "Puesto"],
  ["cobra_por", "Cobra por"],
  ["trabajado", "Trabajado"],
  ["off", "OFF"],
  ["feriado", "Feriado"],
  ["ausentes", "Ausentes"],
  ["vacaciones", "Vacaciones"],
  ["total", "Total a liquidar"],
  ["observaciones", "Observaciones"],
];

// «2026-10-19» → «19/10». Las fechas del servidor se muestran tal cual, sin pasar por la zona del equipo.
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}` : iso || "";
}
export function rangoSemana(s: Pick<HorarioSemana, "desde" | "hasta">): string {
  return `${fechaCorta(s.desde)} al ${fechaCorta(s.hasta)}`;
}
// «2026-10-19» → «19/10/2026», como en la planilla.
export function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "";
}
export function rangoLargo(s: Pick<HorarioSemana, "desde" | "hasta">): string {
  return `${fechaLarga(s.desde)} al ${fechaLarga(s.hasta)}`;
}

// ---------- Búsqueda en el historial ----------
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
// Sin mayúsculas ni tildes: «Martín» se encuentra escribiendo «martin».
export function normalizar(t: string): string {
  return (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
// «2026-10» → «Octubre 2026».
export function nombreMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes || "");
  if (!m) return mes || "";
  const n = MESES[Number(m[2]) - 1] ?? m[2];
  return n.charAt(0).toUpperCase() + n.slice(1) + " " + m[1];
}
// Meses que toca una semana (una semana del 27/10 al 02/11 está en octubre y en noviembre).
export function mesesDe(s: Pick<HorarioSemana, "desde" | "hasta">): string[] {
  const a = (s.desde || "").slice(0, 7), b = (s.hasta || "").slice(0, 7);
  return a === b || !b ? [a] : [a, b];
}
// Meses con semanas guardadas, del más nuevo al más viejo.
export function mesesDisponibles(semanas: HorarioSemana[]): string[] {
  return Array.from(new Set(semanas.flatMap(mesesDe))).filter(Boolean).sort().reverse();
}
// Colaboradores de una semana que coinciden con lo buscado (por nombre).
export function filasQueCoinciden(s: HorarioSemana, texto: string): HorarioFila[] {
  const q = normalizar(texto);
  return q ? s.filas.filter((f) => normalizar(f.colaborador).includes(q)) : [];
}
// Lo buscado puede ser un colaborador («Kati»), una fecha («19/10», «19/10/2026») o un mes («octubre»).
export function semanaCoincide(s: HorarioSemana, texto: string): boolean {
  const q = normalizar(texto);
  if (!q) return true;
  if (filasQueCoinciden(s, q).length) return true;
  const fechas = [fechaLarga(s.desde), fechaLarga(s.hasta), rangoLargo(s), ...mesesDe(s).map((m) => normalizar(nombreMes(m)))];
  return fechas.some((f) => normalizar(f).includes(q));
}
export function buscarSemanas(semanas: HorarioSemana[], texto: string, mes: string): HorarioSemana[] {
  return semanas.filter((s) => (!mes || mesesDe(s).includes(mes)) && semanaCoincide(s, texto));
}
// Todas las semanas de las personas buscadas, para ver de un vistazo lo que se le liquidó a cada una.
export function apariciones(semanas: HorarioSemana[], texto: string): Pendiente[] {
  return semanas.flatMap((semana) => filasQueCoinciden(semana, texto).map((fila) => ({ semana, fila })));
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

// Script de Apps Script que se pega en el Google Sheets del local. Lee la pestaña «Resumen» tal como se ve
// (plantilla GESTLOK: B2 desde, D2 hasta, colaboradores desde la fila 5, columnas A a J) y la manda con el código de
// conexión. Lee los lugares de colaboradores de la plantilla (10, o más si la columna K «Fila en Semana» tiene más) y
// nunca hasta la última fila: lo que se escriba más abajo de la planilla no se envía.
export function scriptParaSheets(codigo: string, url: string, clave: string, tablas = false): string {
  const q = (v: string) => "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  return [
    "// GESTLOK · Historial horarios. Pegalo en Extensiones → Apps Script de la planilla del local.",
    "// Manda el Resumen de la semana a GESTLOK cada vez que cambia algo y una vez por hora.",
    "var GESTLOK_TABLAS = " + (tablas ? "true" : "false") + ";",
    "var GESTLOK_URL = " + q(url.replace(/\/+$/, "")) + ";",
    "var GESTLOK_CLAVE = " + q(clave) + ";",
    "var GESTLOK_CODIGO = " + q(codigo) + ";",
    "",
    "function onOpen() {",
    "  SpreadsheetApp.getUi().createMenu('GESTLOK')",
    "    .addItem('Conectar con GESTLOK (una sola vez)', 'conectarGestlok')",
    "    .addItem('Enviar la semana ahora', 'enviarAhora')",
    "    .addItem('Guardar semana en historial', 'archivarGestlok')",
    "    .addItem('Activar archivo lunes 08:00 Argentina', 'instalarArchivoGestlok')",
    "    .addToUi();",
    "}",
    "",
    "function enviarSemana() {",
    "  var hoja = SpreadsheetApp.getActive().getSheetByName('Resumen');",
    "  if (!hoja) throw new Error('No encuentro la pestaña Resumen.');",
    "  var desde = hoja.getRange('B2').getDisplayValue();",
    "  var hasta = hoja.getRange('D2').getDisplayValue();",
    "  // Lugares de colaboradores de la plantilla: 10 (filas 5 a 14), o más si la columna K los tiene.",
    "  var k = hoja.getRange('K5:K64').getDisplayValues(), lugares = 0;",
    "  while (lugares < k.length && String(k[lugares][0]).trim()) lugares++;",
    "  var datos = hoja.getRange('A5:J' + (4 + Math.max(10, lugares))).getDisplayValues();",
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
    "  if (GESTLOK_TABLAS) try { enviarEnVivoGestlok(); } catch (e) { console.warn(e); }",
    "}",
    "",
    "function enviarAhora() {",
    "  var r = enviarSemana();",
    "  if (GESTLOK_TABLAS) enviarEnVivoGestlok();",
    "  SpreadsheetApp.getUi().alert('Listo: GESTLOK guardó la semana del ' + r.semana + ' (' + r.colaboradores + ' colaboradores).');",
    "}",
    "",
    "function conectarGestlok() {",
    "  ScriptApp.getProjectTriggers().forEach(function (t) {",
    "    if (t.getHandlerFunction() === 'alCambiar') ScriptApp.deleteTrigger(t);",
    "  });",
    "  ScriptApp.newTrigger('alCambiar').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();",
    "  ScriptApp.newTrigger('alCambiar').timeBased().everyMinutes(5).create();",
    "  instalarArchivoGestlok();",
    "  enviarAhora();",
    "}",
    "",
  ].join("\n") + "\n" + ARCHIVO_SCRIPT;
}


// Exportación de ambas hojas originales; nunca borra, limpia ni modifica la planilla.
const ARCHIVO_SCRIPT = String.raw`
function enviarEnVivoGestlok() {
  if (!GESTLOK_TABLAS) return;
  var ss = SpreadsheetApp.getActive();
  var resumen = ss.getSheetByName("Resumen"), semana = ss.getSheetByName("Semana");
  if (!resumen || !semana) throw new Error("Faltan hojas Resumen o Semana.");
  var desde = resumen.getRange("B2").getDisplayValue(), hasta = resumen.getRange("D2").getDisplayValue();
  var response = UrlFetchApp.fetch(GESTLOK_URL + "/rest/v1/rpc/rm_horarios_en_vivo_recibir", {
    method:"post",contentType:"application/json",muteHttpExceptions:true,
    headers: GESTLOK_CLAVE.indexOf("eyJ") === 0 ? {apikey:GESTLOK_CLAVE,Authorization:"Bearer "+GESTLOK_CLAVE} : {apikey:GESTLOK_CLAVE},
    payload:JSON.stringify({p_codigo:GESTLOK_CODIGO,p_desde:desde,p_hasta:hasta,
      p_tablas:{Resumen:tablaGestlok(resumen),Semana:tablaGestlok(semana)}})
  });
  if (response.getResponseCode() >= 300) throw new Error("No se pudo sincronizar Semana y Resumen: "+response.getContentText());
}

function tablaGestlok(hoja) {
  var range = hoja.getDataRange();
  var values = range.getDisplayValues();
  var columns = hoja.getName() === 'Resumen' ? 10 : hoja.getLastColumn();
  var rows = values.length;
  if (hoja.getName() === 'Resumen') {
    var slots = hoja.getRange('K5:K64').getDisplayValues(), count = 0;
    while (count < slots.length && String(slots[count][0]).trim()) count++;
    rows = Math.min(rows, 4 + Math.max(10, count));
  }
  while (rows > 1 && !values[rows - 1].slice(0, columns).some(function(v) { return String(v).trim(); })) rows--;
  if (rows > 1000 || columns > 100) throw new Error('La tabla excede el tamaño admitido. No se archivó nada.');
  var cut = function(matrix) { return matrix.slice(0, rows).map(function(row) { return row.slice(0, columns); }); };
  var headers = Math.min(rows, Math.max(1, hoja.getFrozenRows()));
  values.slice(0, 10).forEach(function(row, i) {
    if (row.some(function(v) { return String(v).trim().toLowerCase() === 'colaborador'; })) headers = Math.max(headers, i + 1);
  });
  return {values:cut(values), backgrounds:cut(range.getBackgrounds()), colors:cut(range.getFontColors()),
    headerRows:headers, merges:range.getMergedRanges().map(function(m) {
      return {row:m.getRow()-1,col:m.getColumn()-1,rows:m.getNumRows(),cols:m.getNumColumns()};
    }).filter(function(m) { return m.row+m.rows<=rows && m.col+m.cols<=columns; })};
}
function pdfGestlok(ss, hoja) {
  var values = hoja.getDataRange().getDisplayValues();
  var columns = hoja.getName() === 'Resumen' ? 10 : hoja.getLastColumn();
  var rows = values.length;
  while (rows > 1 && !values[rows - 1].slice(0, columns).some(function(v) { return String(v).trim(); })) rows--;
  var endpoint = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf&gid=' + hoja.getSheetId()
    + '&size=A3&portrait=false&fitw=true&sheetnames=false&printtitle=false&pagenum=UNDEFINED&gridlines=false&fzr=true'
    + '&r1=0&c1=0&r2=' + rows + '&c2=' + columns;
  var response = UrlFetchApp.fetch(endpoint, {headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}});
  var bytes = response.getBlob().getBytes();
  if (bytes.length > 3000000 || response.getBlob().getContentType().indexOf('pdf') < 0) throw new Error('No se pudo exportar el PDF completo de ' + hoja.getName());
  return Utilities.base64Encode(bytes);
}
function archivarGestlok() {
  var r = guardarArchivoGestlok(SpreadsheetApp.getActive());
  SpreadsheetApp.getUi().alert('Semana y Resumen guardados en GESTLOK del ' + r.semana + '. Verificá ambos PDF en Historial antes de limpiar la planilla.');
}
function guardarArchivoGestlok(ss) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    SpreadsheetApp.flush();
    var resumen = ss.getSheetByName('Resumen'), semana = ss.getSheetByName('Semana');
    if (!resumen || !semana) throw new Error('Se necesitan las hojas Semana y Resumen.');
    var tablas = GESTLOK_TABLAS ? {Resumen: tablaGestlok(resumen), Semana: tablaGestlok(semana)} : null;
    var antes = JSON.stringify([resumen.getDataRange().getDisplayValues(), semana.getDataRange().getDisplayValues(), tablas]);
    var desde = resumen.getRange('B2').getDisplayValue(), hasta = resumen.getRange('D2').getDisplayValue();
    var k = resumen.getRange('K5:K64').getDisplayValues(), lugares = 0;
    while (lugares < k.length && String(k[lugares][0]).trim()) lugares++;
    var filas = resumen.getRange('A5:J' + (4 + Math.max(10, lugares))).getDisplayValues().filter(function(r) { return String(r[0]).trim(); }).map(function(r) {
      return {colaborador:r[0], puesto:r[1], cobra_por:r[2], trabajado:r[3], off:r[4], feriado:r[5], ausentes:r[6], vacaciones:r[7], total:r[8], observaciones:r[9]};
    });
    if (!filas.length) throw new Error('El Resumen está vacío. No se archivó ni se borró nada.');
    var resumenPdf = pdfGestlok(ss, resumen), semanaPdf = pdfGestlok(ss, semana);
    SpreadsheetApp.flush();
    if (antes !== JSON.stringify([resumen.getDataRange().getDisplayValues(), semana.getDataRange().getDisplayValues(), GESTLOK_TABLAS ? {Resumen: tablaGestlok(resumen), Semana: tablaGestlok(semana)} : null])) throw new Error('La planilla cambió durante la exportación. Volvé a guardar sin editar mientras se generan los PDF.');
    var res = UrlFetchApp.fetch(GESTLOK_URL + '/rest/v1/rpc/' + (GESTLOK_TABLAS ? 'rm_horarios_archivar_tablas' : 'rm_horarios_archivar'), {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      headers: GESTLOK_CLAVE.indexOf('eyJ') === 0 ? {apikey:GESTLOK_CLAVE, Authorization:'Bearer ' + GESTLOK_CLAVE} : {apikey:GESTLOK_CLAVE},
      payload:JSON.stringify({p_codigo:GESTLOK_CODIGO,p_desde:desde,p_hasta:hasta,p_filas:filas,p_resumen:resumenPdf,p_semana:semanaPdf, ...(GESTLOK_TABLAS ? {p_tablas:tablas} : {})})
    });
    if (res.getResponseCode() >= 300) throw new Error('No se archivó: ' + res.getContentText());
    var r = JSON.parse(res.getContentText());
    if (!r.ok || !r.archivo_id) throw new Error('No se confirmó el archivo. No limpies la planilla.');
    return r;
  } finally { lock.releaseLock(); }
}
function instalarArchivoGestlok() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('GESTLOK_PLANILLA', SpreadsheetApp.getActive().getId());
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'archivoProgramadoGestlok') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('archivoProgramadoGestlok').timeBased().everyMinutes(1).create();
  props.setProperty('GESTLOK_HORARIO', 'Lunes 08:00 America/Argentina/Buenos_Aires');
}
function archivoProgramadoGestlok() {
  return ejecutarArchivoProgramadoGestlok(new Date());
}
function ejecutarArchivoProgramadoGestlok(ahora) {
  var zona = 'America/Argentina/Buenos_Aires';
  var dia = Utilities.formatDate(ahora, zona, 'u');
  var hora = Number(Utilities.formatDate(ahora, zona, 'HHmm'));
  if (dia !== '1' || hora < 800) return;
  var lunes = Utilities.formatDate(ahora, zona, 'yyyy-MM-dd');
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('GESTLOK_ULTIMO_LUNES') === lunes) return;
  var id = props.getProperty('GESTLOK_PLANILLA');
  if (!id) throw new Error('Falta activar el archivo automático desde el menú GESTLOK.');
  var r = guardarArchivoGestlok(SpreadsheetApp.openById(id));
  props.setProperties({GESTLOK_ULTIMO_LUNES:lunes, GESTLOK_ULTIMO_ARCHIVO:r.archivo_id});
}
`;
