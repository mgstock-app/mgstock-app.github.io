const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
// Keep this test pure: NEVER read or write live collaborator data.
const source = fs.readFileSync("features/legajos/api.ts","utf8");
const compiled = ts.transpileModule(source,{
  compilerOptions: { module: ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 }
}).outputText;
const moduleExports = {};
new Function("exports","require",compiled)(moduleExports,(name)=>{
  if (name === "@/lib/supabase/browser") return { createClient: ()=>{ throw Error("No database access in unit tests"); } };
  throw new Error("Unexpected import "+name);
});
const { dateToDisplay, dateToIso, cleanLegajo } = moduleExports;
assert.equal(dateToIso("28/10/2026"),"2026-10-28");
assert.equal(dateToDisplay("2026-10-28"),"28/10/2026");
assert.equal(dateToIso("31/02/2026"),null);
assert.equal(dateToIso("1/10/2026"),null);
assert.equal(dateToIso("10/13/2026"),null);
const base = { organization_id:"org-A", local_id:"munro", first_name:" Sofía ",last_name:" López ",
  phone:"11 2345-6789",payment_alias:"sofi.100",notes:"",status:"activo",
  reinforcement_dates:[],last_worked_on:null,started_on:null };
const active = cleanLegajo(base);
assert.equal(active.first_name,"Sofía");
assert.equal(active.last_name,"López");
assert.equal(active.status,"activo");
assert.throws(()=>cleanLegajo({...base,status:"refuerzo"}),/fecha trabajada/);
assert.deepEqual(cleanLegajo({...base,status:"refuerzo",reinforcement_dates:["2026-10-21","2026-10-21","2026-10-20"]}).reinforcement_dates,
  ["2026-10-20","2026-10-21"]);
assert.throws(()=>cleanLegajo({...base,status:"inactivo"}),/último día/i);
assert.equal(cleanLegajo({...base,status:"inactivo",last_worked_on:"2026-10-25"}).last_worked_on,"2026-10-25");
assert.equal(cleanLegajo({...base,status:"activo",last_worked_on:"2026-10-25"}).last_worked_on,null);
assert.throws(()=>cleanLegajo({...base,phone:"contraseña<script>"}),/teléfono/);
const migration = fs.readFileSync("../../supabase/migrations/20261028163000_gerentes_legajos_por_local.sql","utf8");
assert(migration.includes("enable row level security"));
assert(migration.includes("rm_employee_profile_history_read"));
assert(migration.includes("rm_employee_profile_scope"));
assert(migration.includes("rm_employee_profile_audit"));
console.log("PASS: legajos de gerentes, fechas dd/mm/aaaa, estados y políticas privadas");
