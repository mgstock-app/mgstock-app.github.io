const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(file, mocks={}) {
  const filename = path.resolve(file);
  const output = ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const exports = {};
  new Function("exports","require",output)(exports,specifier=>{
    if(specifier in mocks)return mocks[specifier];
    if(specifier.startsWith("."))return load(path.resolve(path.dirname(filename),specifier));
    throw Error("Unexpected import "+specifier);
  });
  return exports;
}
const payroll = load("features/reports/payroll.js");
const { privateReceiptView } = load("utils/private-receipt.ts",{
  "@/features/reports/payroll.js": payroll
});
const base={nombre:"Lucía Prueba",porTurno:false,extras:true,ferTarifaPropia:true,vac:true,
  semDesde:"2026-10-12",semHasta:"2026-10-18",
  items:{
    trab:{c:32,i:112000},extra:{c:4,i:21000},
    fer:{c:2,i:14000},vac:{c:2,i:16000},
    off:{c:null,i:null},aus:{c:null,i:null},agu:{c:null,i:null}
  },tarifas:{trab:3500,extra:5250,fer:7000,vac:8000}};
const payload={sheet:base,show_holidays:true,show_vacations:true,
  server_now:"2026-10-28T15:00:00Z",expires_at:"2026-10-29T15:00:00Z"};
let result=privateReceiptView(payload);
assert.equal(result.summary.total,163000);
assert.equal(result.summary.quantity,"38:00 hs");
assert.equal(result.summary.period,"Semana del 12/10/2026 al 18/10/2026");
assert(result.rows.some(row=>row.key==="fer" && row.amount===14000));
assert(result.rows.some(row=>row.key==="vac" && row.amount===16000));
assert(result.matches,"All amounts reconcile to published total");
let hidden=privateReceiptView({...payload,show_holidays:false,show_vacations:false});
assert(hidden.matches);
assert(hidden.rows.some(row=>row.key==="fer"),"Amounts must not be silently hidden");
assert(hidden.rows.some(row=>row.key==="vac"),"Vacation pay remains visible if already liquidated");
const noHolidays={...base,vac:false,items:{...base.items,fer:{c:null,i:null},vac:{c:null,i:null}}};
let clean=privateReceiptView({...payload,sheet:noHolidays,show_holidays:false,show_vacations:false});
assert.equal(clean.rows.some(row=>row.key==="fer"),false,"Unused holiday line can be hidden");
assert.equal(clean.rows.some(row=>row.key==="vac"),false);
assert.equal(clean.summary.total,133000);
assert(clean.matches);
const shift={...noHolidays,porTurno:true,items:{...noHolidays.items,trab:{c:10,i:100000}},tarifas:{...base.tarifas,trab:10000}};
const shiftView=privateReceiptView({...payload,sheet:shift});
assert.equal(shiftView.summary.quantity,"10 turnos · 4:00 hs extra");
assert.equal(shiftView.summary.total,121000);
assert(shiftView.matches);
const sql=fs.readFileSync("../../supabase/migrations/20261028175500_recibos_informales_privados_detallados.sql","utf8");
for(const phrase of [
  "rm_test_private.app_role() <> 'employee'","a.user_id=rm_test_private.uid()",
  "a.sheet_id=rm_test_private.app_sheet()",
  "a.report_version=i.published_at",
  "d.updated_at=i.report_version",
  "a.opened_at is not null and a.expires_at>clock_timestamp()",
  "rm_test_private.app_role() <> 'owner'",
  "rm_receipt_visibility_options enable row level security",
  "revoke all on public.rm_receipt_visibility_options",
]) assert(sql.includes(phrase),"Missing backend safeguard: "+phrase);
const detail=sql.slice(sql.indexOf("create or replace function rm_test_private.rm_app_private_receipt_detail()"));
for (const field of ["local","empresa","organization_id","alias","pago","observaciones","telefono","phone","contacto","obs","sheet_id"]) {
  assert(!/['"]/.test(field),"unused");
  assert(!detail.includes("'"+field+"'"),"Data field must never be sent: "+field);
}
const view=fs.readFileSync("components/reports/PrivateReceiptDetail.tsx","utf8");
assert(!view.includes("row.local.name"));
assert(!view.includes("company.name"));
assert(view.includes("TOTAL A COBRAR"));
const employee=fs.readFileSync("components/reports/EmployeeReport.tsx","utf8");
assert(employee.includes("accessApi.privateReceipt()"));
assert(!employee.includes("accessApi.image()"),"Legacy branded PNG must no longer show in collaborator portal");
console.log("PASS: detailed informal receipts (hours/shifts), options, totals and private per-user RPC");
