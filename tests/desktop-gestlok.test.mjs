import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("El tema de PC se carga luego del tema móvil en ambas tarjetas",()=>{
 const root=read("app/layout.tsx");
 const module=read("modules/empleados/app/layout.tsx");
 assert.match(root,/import "\.\/desktop-gestlok\.css"/);
 assert.match(module,/import "@\/styles\/desktop-gestlok\.css"/);
 assert(root.indexOf("mobile-navigation.css")<root.indexOf("desktop-gestlok.css"));
 assert(module.indexOf("mobile-navigation.css")<module.indexOf("desktop-gestlok.css"));
});
test("PC blanco + navy GESTLOK en empresa y empleados para todos los roles",()=>{
 const company=read("app/desktop-gestlok.css");
 const staff=read("modules/empleados/styles/desktop-gestlok.css");
 for(const [label,css] of [["Empresa",company],["Empleados",staff]]){
   assert.match(css,/@media screen and \(min-width:901px\)/,label+" no debe cambiar teléfonos");
   assert.match(css,/#142f46/,label+" sin azul oscuro");
   assert.match(css,/#fff/,label+" sin fondo blanco");
   assert(!/@media\s*\(max-width:/i.test(css),label+" no puede reescribir móvil");
   assert.doesNotMatch(css,/kmu15lopez@gmail\.com|@gmail\.com|@hotmail\.com/i);
   assert.match(css,/filter:none!important/,"logos originales sin filtros");
 }
 for(const key of ["#app",".gl-owner-area",".gl-oh-top",".gl-ch",".gl-admin"]){
   assert(company.includes(key),"El tema de Empresa no cubre "+key);
 }
 for(const key of [".owner-sidebar",".gl-gerente",".gl-employee-sidebar",".gi-admin-sidebar",".mlg-cards"]){
   assert(staff.includes(key),"El tema de Empleados no cubre "+key);
 }
 assert.match(staff,/\.mlg-person:hover/,"Falta lista de empleados legible");
});
test("Listado desktop conserva datos reales, estados y botones, sin tabla de horarios adicional",()=>{
 const staff=read("modules/empleados/components/legajos/ManagerLegajos.tsx");
 assert.match(staff,/className="mlg-directory-head"/);
 assert.match(staff,/Colaborador<\/span>/);
 assert.match(staff,/Estado<\/span>/);
 assert.match(staff,/Acciones<\/span>/);
 assert.match(staff,/Ver legajo/);
 assert.match(staff,/loadLegajoLocals\(\)/);
 assert.match(staff,/loadLegajos\(visible\)/);
 assert.match(read("modules/empleados/components/legajos/manager-legajos.css"),/\.mlg-directory-head\{display:none\}/,"móvil sin tabla nueva");
 assert.doesNotMatch(staff,/tabla-horarios-colaboradores/);
});
