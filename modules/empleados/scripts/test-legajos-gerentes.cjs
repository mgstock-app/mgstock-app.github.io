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
assert.throws(()=>cleanLegajo({...base,status:"inactivo"}),/hasta qué día trabajó/i);
assert.equal(cleanLegajo({...base,status:"inactivo",last_worked_on:"2026-10-25"}).last_worked_on,"2026-10-25");
assert.equal(cleanLegajo({...base,status:"activo",last_worked_on:"2026-10-25"}).last_worked_on,null);
assert.throws(()=>cleanLegajo({...base,phone:"contraseña<script>"}),/teléfono/);
const migration = fs.readFileSync("../../supabase/migrations/20261028163000_gerentes_legajos_por_local.sql","utf8");
assert(migration.includes("enable row level security"));
assert(migration.includes("rm_employee_profile_history_read"));
assert(migration.includes("rm_employee_profile_scope"));
assert(migration.includes("rm_employee_profile_audit"));

const patch = fs.readFileSync("../../supabase/migrations/20261030023000_gerentes_legajos_local_trigger_scope.sql","utf8");
assert.match(patch,/create or replace function rm_test_private\.rm_employee_profile_touch\(\)/);
assert.match(patch,/security definer/i);
assert.match(patch,/auth\.uid\(\) is null/);
assert.match(patch,/rm_test_private\.rm_employee_profile_scope\(new\.organization_id,new\.local_id\)/);
assert.match(patch,/l\.id=new\.local_id and l\.organization_id=new\.organization_id/);
assert.match(patch,/new\.created_by is distinct from auth\.uid\(\)/);
assert.match(patch,/v_invited_staff/);
assert.match(patch,/rm_test_private\.manager_staff_invites/);
assert.match(patch,/new\.needs_completion is true/);
assert.match(patch,/i\.created_by=new\.created_by/);
assert.match(patch,/i\.redeemed_by is null/);
assert.match(patch,/i\.expires_at>clock_timestamp\(\)/);
assert.match(patch,/m\.role='employee'/);
assert.match(patch,/om\.user_id=auth\.uid\(\)/);
assert.match(patch,/not v_invited_staff/);

assert.match(patch,/new\.organization_id<>old\.organization_id/);
assert.match(patch,/new\.local_id<>old\.local_id/);
assert.match(patch,/revoke all on function rm_test_private\.rm_employee_profile_touch\(\) from public, anon, authenticated/);
assert(!/disable row level security|grant all|drop table|truncate table/i.test(patch),"No debilitar RLS ni borrar legajos");

const legajosUI=fs.readFileSync("components/legajos/ManagerLegajos.tsx","utf8");
assert(legajosUI.includes("await Promise.allSettled(["));
assert(legajosUI.includes("setLocals(visible);"),"La lista de locales autorizados no depende del historial");
assert(legajosUI.includes('loadPreviousEmployees(visible)'));
assert(legajosUI.includes('loadLegajos(visible)'));
assert(legajosUI.includes("Agregar colaborador"));
assert(legajosUI.includes("Invitar Colaborador"));
assert(legajosUI.includes("needs_completion"));
assert(legajosUI.includes("Volver a comprobar el acceso"));
assert(legajosUI.includes("createLegajo(input)"));
assert(legajosUI.includes("updateLegajo(editing, input)"));
assert(!legajosUI.includes("salary_amount"),"El gerente no administra montos salariales desde los legajos");

console.log("PASS: alta y edición de legajos por gerente, autorización RLS estricta y UI resiliente");
