const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
function compile(file, overrides={}) {
  const source=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  new Function("exports","require",source)(exports,name=>{
    if(name in overrides)return overrides[name];
    throw Error("Unexpected import "+name);
  });
  return exports;
}
const {employeeSheetPreview}=compile("utils/employee-schedule-preview.ts");
assert.equal(employeeSheetPreview("https://docs.google.com/spreadsheets/d/SAFE_123/edit#gid=34"),
  "https://docs.google.com/spreadsheets/d/SAFE_123/preview?gid=34");
assert.equal(employeeSheetPreview("https://docs.google.com/spreadsheets/d/SAFE_123/edit?gid=0"),
  "https://docs.google.com/spreadsheets/d/SAFE_123/preview?gid=0");
assert.equal(employeeSheetPreview("https://docs.google.com/spreadsheets/d/SAFE_123/preview?gid=0"),
  "https://docs.google.com/spreadsheets/d/SAFE_123/preview?gid=0",
  "El enlace devuelto por el servidor ya es de lectura y el cliente no lo modifica");
for(const bad of [
  "javascript:alert(1)","https://docs.google.com.evil.com/spreadsheets/d/abc/edit",
  "http://docs.google.com/spreadsheets/d/abc/edit",
  "https://docs.google.com/spreadsheets/d/abc/edit#gid=not-a-number",
  "https://docs.google.com/spreadsheets/d/abc/copy",
  "https://drive.google.com/file/d/abc/view",
]) assert.equal(employeeSheetPreview(bad),null,"Unsafe or non-sheet URL must never open: "+bad);
const {searchAssignmentUsers}=compile("utils/search-assignments.ts",{
  "@/utils/assignment-selection":{needsAssignment:item=>item.status==="pending" || !item.local_id}
});
const locals=[
 {id:"munro",name:"Munro",company_id:"c1"},
 {id:"dt",name:"Don Torcuato",company_id:"c1"},
 {id:"p",name:"Perfumería",company_id:"c2"},
];
const companies=[{id:"c1",name:"Mi Gusto"},{id:"c2",name:"Parfum Belisa"}];
const users=[
 {user_id:"u1",display_name:"Sofía Pérez",email:"sofia@test.com",local_id:"munro",status:"approved",role:"employee"},
 {user_id:"u2",display_name:"Lucía Gomez",email:"lucia@test.com",local_id:"dt",status:"approved",role:"employee"},
 {user_id:"u3",display_name:"Nicolás Vega",email:"nico@test.com",local_id:null,status:"pending",role:null},
];
assert.equal(searchAssignmentUsers(users,locals,companies,"sOfIa").length,1);
assert.equal(searchAssignmentUsers(users,locals,companies,"SOFÍA").length,1);
assert.equal(searchAssignmentUsers(users,locals,companies,"mi gusto").length,2);
assert.equal(searchAssignmentUsers(users,locals,companies,"torcuato").length,1);
assert.equal(searchAssignmentUsers(users,locals,companies,"",true).length,1);
assert.equal(searchAssignmentUsers(users,locals,companies,"",false,"munro").length,1);
assert.equal(searchAssignmentUsers(users,locals,companies,"").length,3,"Assignments includes approved users from both locales");
const sql=fs.readFileSync("../../supabase/migrations/20261028173000_colaborador_google_sheets_lectura.sql","utf8");
assert.match(sql,/function public\.rm_app_employee_schedule_view\(\)/);
assert.match(sql,/m\.user_id = rm_test_private\.uid\(\)/);
assert.match(sql,/m\.role = 'employee'/);
assert.match(sql,/rm_test_private\.app_role\(\) = 'employee'/);
assert.match(sql,/l\.id = m\.local_id/);
assert.match(sql,/l\.organization_id = om\.organization_id/);
assert.match(sql,/s\.enabled/);
assert.doesNotMatch(sql,/create policy.*select.*rm_test_documents/i,"Do not weaken private payroll RLS");
const secure = fs.readFileSync("../../supabase/migrations/20261028205500_colaborador_google_sheets_preview_servidor.sql","utf8");
for(const required of [
  "rm_test_private.rm_employee_schedule_view()",
  "m.user_id = rm_test_private.uid()",
  "m.role = 'employee'",
  "rm_test_private.app_role() = 'employee'",
  "d.status = 'approved'",
  "rm_test_private.verified_email(d.email)",
  "l.id = m.local_id",
  "l.organization_id = om.organization_id",
  "'/preview'",
  "'?gid='",
]) assert(secure.includes(required),"Control de acceso faltante: "+required);
assert(!secure.includes("'url', s.url"),"El servidor no puede entregar el enlace editable a colaboradores");
assert(!secure.includes("grant select on rm_test_private.branch_schedule_links"),"No exponer tabla de enlaces");

const portal=fs.readFileSync("components/pages/ReportPortal.tsx","utf8");
assert.match(portal,/<EmployeeReport/);
assert.match(portal,/<EmployeeScheduleLink/);
assert.doesNotMatch(portal,/<WeeklyScheduleDraft/);
console.log("PASS: employee assignment search, local-only Sheets RPC, preview URL, and private receipts");
