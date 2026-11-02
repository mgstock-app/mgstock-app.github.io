// Liquidación semanal de Munro (pedido 02/11/2026): Premio, categorías propias del local y orden común.
// Torcuato no cambia. Datos ficticios; no toca la base.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
const { jsPDF } = require("jspdf");
function load(file) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", output)(exports, (specifier) => specifier.startsWith("@/")
    ? load(path.resolve(specifier.slice(2)) + (specifier.endsWith(".js") ? "" : ".ts"))
    : load(path.resolve(path.dirname(file), specifier)));
  return exports;
}
async function main() {
  const ctx = {};
  const scope = { window: { jspdf: { jsPDF }, REPORT_LOCALS: [
    { id: "dt", name: "Torcuato", cycle: "mensual" },
    { id: "munro", name: "Munro", cycle: "semanal" },
  ] }, document: {}, setTimeout, clearTimeout };
  for (const file of fs.readdirSync("features/reports").filter((f) => f.endsWith(".js") && f !== "runtime.js")) {
    const initialize = Object.values(load(path.join("features/reports", file)))[0](scope, ctx);
    if (file === "payroll.js") initialize();
  }
  ctx.S = { tema: { tono: "marino", modo: "claro" }, cfgLiq: {} };

  // Solo Munro tiene liquidación propia; Torcuato queda igual.
  assert(ctx.liqPropia({ local: "munro" }));
  assert(!ctx.liqPropia({ local: "dt" }));
  assert(!ctx.liqPropia({}), "Hojas viejas de Torcuato sin local");
  const premio = ctx.ITEMS.find((it) => it.k === "premio");
  assert(premio && premio.tipo === "monto", "Premio es solo un importe");
  assert.deepEqual(ctx.ITEMS.map((it) => it.k).slice(0, 4), ["trab", "extra", "off", "premio"], "Premio va debajo de Horas de OFF");
  assert(!("premio" in ctx.normItems(null)), "Las hojas nuevas o limpias no agregan Premio a Torcuato");
  const torcuato = { local: "dt", nombre: "Persona Torcuato", items: { trab: { c: 10, i: 50000 } } };
  const camposDt = ctx.camposDe(torcuato);
  for (const key of ["premio", "cats", "ordenFilas"]) assert(!(key in camposDt), "Torcuato no guarda " + key);
  assert(!("premio" in camposDt.items));
  assert.equal(ctx.totalDe(torcuato), 50000);
  assert(!ctx.textoDetalle(torcuato, "Persona").includes("Premio"));

  // Premio: lo carga el dueño, suma al total y se puede desactivar.
  const munro = {
    local: "munro", nombre: "Persona Munro", porTurno: false, semDesde: "2026-10-26", semHasta: "2026-11-01",
    items: { trab: { c: 40, i: 200000 }, off: { c: 8, i: 40000 }, premio: { c: null, i: 15000 } },
    tarifas: { trab: 5000 },
  };
  assert.equal(ctx.totalDe(munro), 255000, "Premio suma");
  assert.deepEqual(ctx.filasDe(munro).map((f) => f.k), ["trab", "off", "premio", "fer"]);
  munro.premio = false;
  assert.equal(ctx.totalDe(munro), 240000, "Premio desactivado no suma");
  assert(!ctx.filasDe(munro).some((f) => f.k === "premio"));
  munro.premio = true;
  munro.items.premio.i = null;
  assert(!ctx.filasDe(munro).some((f) => f.k === "premio"), "Sin importe no figura en el recibo");
  munro.items.premio.i = 15000;

  // Categorías del local: suman o restan; el importe va por persona.
  munro.cats = [
    { id: "c1", txt: "Adelanto", signo: "resta", i: 20000 },
    { id: "c2", txt: "Bono presentismo", signo: "suma", i: 5000 },
    { id: "c3", txt: "Sin cargar", signo: "suma", i: null },
    { id: "../malo", txt: "Inválida", signo: "suma", i: 999 },
  ];
  assert.equal(ctx.totalDe(munro), 255000 - 20000 + 5000, "Las categorías suman o restan; las inválidas o vacías no cuentan");
  const filas = ctx.filasDe(munro).map((f) => f.k);
  assert.deepEqual(filas, ["trab", "off", "premio", "fer", "cat:c1", "cat:c2"]);

  // Orden común: el del local manda en la planilla; fuera de ella, el guardado en la hoja.
  assert.deepEqual(ctx.ordenCompleto(["premio", "trab"], ["trab", "off", "premio", "fer"]), ["premio", "trab", "off", "fer"]);
  assert.deepEqual(ctx.ordenCompleto(["cat:c2", "trab"], ["trab", "extra", "off", "cat:c2"]), ["cat:c2", "trab", "extra", "off"], "Lo que falta va al final, en el orden de siempre");
  ctx.S.cfgLiq.munro = ctx.normCfgLiq({ cats: [{ id: "c1", txt: "Adelanto", signo: "resta" }, { id: "c2", txt: "Bono presentismo", signo: "suma" }], orden: ["premio", "cat:c2", "trab", "off", "fer", "cat:c1"] });
  assert.deepEqual(ctx.filasDe(munro).map((f) => f.k), ["premio", "cat:c2", "trab", "off", "fer", "cat:c1"]);
  const guardado = ctx.camposDe(munro);
  assert.equal(guardado.premio, true);
  assert.deepEqual(guardado.cats.map((c) => c.id), ["c1", "c2"], "Se guardan solo las categorías con importe");
  assert.deepEqual(guardado.ordenFilas, ["premio", "cat:c2", "trab", "off", "fer", "cat:c1"], "El recibo guarda el orden vigente");
  assert.deepEqual(guardado.items.premio, { c: null, i: 15000 });
  assert.deepEqual(ctx.filasDe({ ...munro, local: "dt" }).map((f) => f.k)[0], "trab", "El orden de Munro no se aplica a Torcuato");

  // El recibo del colaborador y el historial usan lo guardado en la hoja (sin la configuración del local).
  const hoja = { ...munro, ...guardado };
  const { summarizeReport } = load("features/reports/payroll.js");
  const resumen = summarizeReport(hoja, { id: "munro", name: "Munro", cycle: "semanal" });
  assert.deepEqual(resumen.rows.map((r) => r.key), ["premio", "cat:c2", "trab", "off", "fer", "cat:c1"]);
  assert.equal(resumen.rows.find((r) => r.key === "cat:c1").amount, -20000);
  assert.equal(resumen.rows.find((r) => r.key === "cat:c1").label, "Adelanto");
  assert.equal(resumen.total, 240000);
  assert.equal(resumen.rows.reduce((s, r) => s + (r.amount ?? 0), 0), resumen.total, "Las filas suman el total");
  const { privateReceiptView } = load("utils/private-receipt.ts");
  const privado = privateReceiptView({ sheet: hoja, show_holidays: true, show_vacations: true });
  assert(privado.matches, "El recibo privado cierra con el total");
  assert(privado.rows.some((r) => r.label === "Premio"));

  // WhatsApp e imagen/PDF muestran Premio y categorías.
  const texto = ctx.textoDetalle(hoja, hoja.nombre);
  assert(texto.indexOf("Premio") < texto.indexOf("Bono presentismo") && texto.indexOf("Bono presentismo") < texto.indexOf("Horas trabajadas"), "WhatsApp respeta el orden");
  assert(texto.includes("Adelanto (descuento)"));
  assert(texto.includes("*Total: " + ctx.pesos(240000) + "*"));
  const captured = [];
  function CapturedPdf(options) {
    const doc = new jsPDF(options);
    const originalText = doc.text.bind(doc);
    doc.text = (value, x, y, opts = {}) => { captured.push(String(value)); return originalText(value, x, y, opts); };
    return doc;
  }
  scope.window.jspdf.jsPDF = CapturedPdf;
  ctx.crearPdf(hoja, hoja.nombre);
  scope.window.jspdf.jsPDF = jsPDF;
  assert(captured.includes("Premio"));
  assert(captured.includes("Bono presentismo"));
  assert(captured.includes("Adelanto (descuento)"));
  assert(captured.includes(ctx.pesos(240000)));

  // Al cerrar la semana se vacían los importes; el Premio sigue activo.
  const vacio = ctx.camposPeriodoVacio(hoja);
  assert.deepEqual(vacio.cats, []);
  assert(!("premio" in vacio), "La elección de pagar Premio se mantiene");
  assert(!("cats" in ctx.camposPeriodoVacio(torcuato)), "Torcuato no recibe campos nuevos");

  // Configuración del local: se limpia lo que no corresponde.
  const cfg = ctx.normCfgLiq({ cats: [{ id: "ok1", txt: "  Bono  ", signo: "x", i: 5 }, { id: "ok1", txt: "Repetida" }, { id: "a b", txt: "Mal" }], orden: ["trab", 5, "cat:ok1"] });
  assert.deepEqual(cfg, { cats: [{ id: "ok1", txt: "Bono", signo: "suma" }], orden: ["trab", "cat:ok1"] });
  console.log("PASS: liquidación propia de Munro (Premio, categorías y orden) sin cambios en Torcuato");
}
main().catch((error) => { console.error(error); process.exit(1); });
