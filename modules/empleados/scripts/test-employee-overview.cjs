const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function loadJs(file) {
  const content = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const output = {};
  new Function("exports", "require", content)(output, name => loadJs(path.resolve(path.dirname(file), name)));
  return output;
}
async function main() {
  const resolve = (await import("../utils/overview-sheet-local.js")).resolveOverviewSheetLocal;
  const moduleSource = ts.transpileModule(fs.readFileSync("components/reports/EmployeeOverview.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const result = {};
  new Function("exports", "require", moduleSource)(result, name => {
    if (name === "react" || name === "react/jsx-runtime") return {};
    if (name === "@/utils/overview-sheet-local") return { resolveOverviewSheetLocal: resolve };
    if (name === "@/features/reports/payroll.js") return loadJs("features/reports/payroll.js");
    if (name === "@/utils/duration.js") return loadJs("utils/duration.js");
    if (name === "./EmployeeDirectory") return { EmployeeDirectory: () => null };
    if (name === "./ReceiptDashboard") return { ReceiptDashboard: () => null };
    if (name === "@/utils/read-report-collection" || name === "@/lib/supabase/browser") return {};
    if (name.endsWith(".css")) return {};
    throw new Error("Unexpected test import: " + name);
  });
  const local = (id, org = "org-a", cycle = "semanal") =>
    ({ id, name: id, company_id: "company-" + org, organization_id: org, cycle });
  const authorized = [local("munro"), local("dt", "org-a", "mensual")];
  const sheet = (path, data = {}, org = "org-a") =>
    ({ path, data, organization_id: org });
  const records = [
    sheet("hojas/munro-juan", { local: "munro", nombre: "Juan", puesto: "staff", extras: true, items: { trab: { c: 32, i: 112000 }, extra: { c: 4, i: 21000 } } }),
    sheet("hojas/enc1", { nombre: "Torcuato histórico", items: { trab: { c: 10, i: 100000 } } }),
    sheet("hojas/foreign", { local: "otro", nombre: "No autorizado" }),
    sheet("hojas/forged", { local: "munro", nombre: "Otra empresa" }, "org-b"),
    sheet("hojas/unknown", { nombre: "Sin local verificable" }),
    sheet("hojas/munro-juan/historial/report1", { local: "munro", nombre: "Historial no es legajo" }),
  ];
  const visible = result.projectRows(records, authorized);
  assert.equal(visible.length, 2, "Only two authorized sheets are visible");
  assert.deepEqual(visible.map(row => row.summary.name), ["Juan", "Torcuato histórico"]);
  assert.equal(visible[0].summary.total, 133000);
  assert.equal(visible[0].summary.quantity, "36:00 hs");
  assert.equal(visible[1].localId, "dt");
  const payrollCtx = {};
  loadJs("features/reports/payroll.js").registerPayroll({ window: { REPORT_LOCALS: authorized } }, payrollCtx)();
  assert.equal(payrollCtx.estadoColab({ estadoColab: "descanso" }), "descanso");
  assert.equal(payrollCtx.estadoColab({ estadoColab: "refuerzo" }), "refuerzo");
  assert.equal(payrollCtx.estadoColab({ estadoColab: "inactivo" }), "inactivo");
  assert.equal(payrollCtx.ESTADOS_COLAB.descanso, "En descanso");
  assert.equal(result.projectRows(records, [local("munro")]).length, 1, "Single-store managers must never see other stores");
  assert.equal(result.projectRows(records, [local("otro", "org-b")]).length, 0, "Other-company sheets are excluded");
  const receiptModule = {};
  const receiptSource = ts.transpileModule(fs.readFileSync("components/reports/ReceiptDashboard.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("exports", "require", receiptSource)(receiptModule, name => {
    if (name === "react" || name === "react/jsx-runtime" || name === "lucide-react") return {};
    if (name === "@/features/reports/payroll.js") return loadJs("features/reports/payroll.js");
    if (name === "@/utils/duration.js") return loadJs("utils/duration.js");
    if (name === "./EmployeeOverview") return result;
    if (name === "@/lib/supabase/browser" || name === "@/utils/read-report-collection") return {};
    throw new Error("Unexpected receipt import " + name);
  });
  assert.equal(receiptModule.receiptMonth({semDesde:"2026-10-12",semHasta:"2026-10-18"}), "2026-10");
  assert.equal(receiptModule.receiptMonth({mes:"Octubre",anio:"2026"}), "2026-10");
  assert.equal(receiptModule.receiptMonth({mes:"Noviembre",anio:"2026"}), "2026-11");
  assert.equal(receiptModule.receiptMonth({}), null);
  assert.equal(receiptModule.receiptMonth({mes:"Mes inválido",anio:"2026"}), null);
  console.log("PASS: employee directory and receipt dashboard preserve local, organization, pay totals and periods");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
