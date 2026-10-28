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
  assert.equal(result.projectRows(records, [local("munro")]).length, 1, "Single-store managers must never see other stores");
  assert.equal(result.projectRows(records, [local("otro", "org-b")]).length, 0, "Other-company sheets are excluded");
  console.log("PASS: employee dashboard filters local and organization, recognizes legacy sheets and uses payroll totals");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
