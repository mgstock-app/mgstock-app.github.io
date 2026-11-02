// Historial horarios (Munro): pendientes de pago, fechas sin corrimiento y script del Google Sheets.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const out = ts.transpileModule(fs.readFileSync("utils/schedule-history.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", out)(mod, mod.exports);
const { fechaCorta, rangoSemana, celda, estaPagado, pendientes, semanaPagada, scriptParaSheets, COLUMNAS } = mod.exports;

const fila = (colaborador, total) => ({ colaborador, puesto: "", cobra_por: "", trabajado: "", off: "", feriado: "", ausentes: "", vacaciones: "", total, observaciones: "" });
const s1 = { desde: "2026-10-19", hasta: "2026-10-25", filas: [fila("Juli", "6"), fila("Kati", "43:30")], recibido_at: "2026-10-26T10:00:00Z", actualizaciones: 2, pagos: { Kati: { pagado: true, marcado_at: "x" } } };
const s2 = { desde: "2026-10-26", hasta: "2026-11-01", filas: [fila("Juli", "7")], recibido_at: "2026-11-02T10:00:00Z", actualizaciones: 1, pagos: {} };

assert.equal(fechaCorta("2026-10-19"), "19/10");
assert.equal(rangoSemana(s1), "19/10 al 25/10");
assert.equal(celda(""), "–");
assert.equal(celda(" - "), "–");
assert.equal(celda("39:00"), "39:00");
assert.equal(estaPagado(s1, "Kati"), true);
assert.equal(estaPagado(s1, "Juli"), false);
assert.deepEqual(pendientes([s2, s1]).map((p) => p.semana.desde + " " + p.fila.colaborador), ["2026-10-26 Juli", "2026-10-19 Juli"]);
assert.equal(semanaPagada(s1), false);
assert.equal(semanaPagada({ ...s1, pagos: { Juli: { pagado: true }, Kati: { pagado: true } } }), true);
assert.equal(semanaPagada({ ...s1, filas: [] }), false, "Una semana vacía no figura como pagada");
assert.equal(COLUMNAS.at(-1)[0], "total");

const script = scriptParaSheets("abc123", "https://x.supabase.co/", "sb_publishable_k'y");
assert.match(script, /var GESTLOK_URL = 'https:\/\/x\.supabase\.co';/, "Sin barra final");
assert.match(script, /var GESTLOK_CODIGO = 'abc123';/);
assert.match(script, /var GESTLOK_CLAVE = 'sb_publishable_k\\'y';/, "Comillas escapadas");
assert.match(script, /getSheetByName\('Resumen'\)/);
assert.match(script, /getRange\('B2'\)[\s\S]*getRange\('D2'\)/, "Semana desde y hasta del Resumen");
assert.match(script, /getRange\('A5:J14'\)/, "Solo los 10 lugares de colaboradores (debajo hay un HISTORIAL manual)");
assert.doesNotMatch(script, /getLastRow/, "No lee hasta la última fila");
assert.match(script, /\/rest\/v1\/rpc\/rm_horarios_recibir/);
assert.match(script, /onEdit\(\)\.create\(\)/);
assert.match(script, /everyHours\(1\)/);
assert.doesNotMatch(script, /service_role|secret/i, "Sin claves privadas");
// El script tiene que ser JavaScript válido para Apps Script.
new Function(script);
console.log("historial-horarios: ok");
