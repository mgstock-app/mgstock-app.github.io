import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("tema blanco global para todos los perfiles y empresas sin claves por email",()=>{
 const root=read("app/white-unified.css");
 const module=read("modules/empleados/styles/white-dashboard.css");
 for(const selector of [".hub.gl-oh-hub",".gl-ch-side",".gl-admin-sidebar",".gl-owner-area","#app"]){
   assert(root.includes(selector), "Falta estilo blanco para "+selector);
 }
 for(const selector of [".owner-sidebar",".gl-gerente__sidebar",".gi-admin-sidebar",".gl-employee-sidebar"]){
   assert(module.includes(selector),"Falta estilo blanco para "+selector);
 }
 assert.match(read("app/layout.tsx"),/import "\.\/white-unified\.css"/);
 assert.match(read("modules/empleados/app/layout.tsx"),/import "@\/styles\/white-dashboard\.css"/);
 assert.doesNotMatch(root+"\n"+module,/kmu15lopez@gmail\.com/,"Los estilos se aplican por rol, no por correo");
});
test("menús plegables reales, persistentes, con navegación privada preservada",()=>{
 const stock=read("public/stock/gestlok-sidebar-polish.js");
 const owner=read("modules/empleados/components/owner/OwnerSidebar.tsx");
 const manager=read("modules/empleados/components/pages/GerenteHome.tsx");
 const admin=read("modules/empleados/components/admin/AdminShell.tsx");
 const creator=read("public/stock/gestlok-creator-home.js");
 const employee=read("modules/empleados/components/pages/EmployeePortalShell.tsx");
 for(const [name,source] of [["comercial",stock],["dueño",owner],["gerente",manager],["administradora",admin],["creadora",creator],["colaborador",employee]]){
   assert(/collapsed|Collapsed/.test(source),name+" no tiene estado plegable");
   assert(/localStorage/.test(source),name+" no recuerda la preferencia visual");
 }
 assert.match(employee,/<EmployeeReport/,"El colaborador conserva recibo personal");
 assert.match(employee,/<EmployeeScheduleLink/,"Conserva Google Sheets solo de su local");
 assert.match(employee,/user\.role!=="employee"/,"No exponer navegación de empleado a otro rol");
 assert.match(read("modules/empleados/components/pages/ReportPortal.tsx"),/<EmployeePortalShell/);
 assert.match(read("modules/empleados/components/layout/AppNavbar.tsx"),/user\?\.role === "employee" && path === "\/"/);
});

test("la interfaz blanca conserva el logo original de Mi Gusto con fondo negro",()=>{
 const root=read("app/white-unified.css");
 const module=read("modules/empleados/styles/white-dashboard.css");
 const side=read("public/stock/gestlok-sidebar-polish.css");
 const brand=read("modules/empleados/components/owner/OwnerSidebar.tsx");
 const employee=read("modules/empleados/components/pages/EmployeePortalShell.tsx");
 for(const source of [brand,employee]){
   assert(source.includes("img/mi-gusto-blanco.png"),"Debe conservarse el asset original");
 }
 for(const [where,source] of [["local",root],["empleados",module],["menú",side]]){
   assert(source.includes("#080808"),where+" no preserva el soporte negro de Mi Gusto");
 }
 assert.match(root,/mix-blend-mode:normal!important/,"No se debe mezclar el color original del logo");
 assert.match(root,/filter:none!important/,"No se debe recolorear el logo subido");
});
