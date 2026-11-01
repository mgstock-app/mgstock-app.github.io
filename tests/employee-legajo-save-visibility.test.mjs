import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("El colaborador tiene un botón Guardar mi legajo que persiste datos desde el formulario",()=>{
 const src=read("modules/empleados/components/legajos/EmployeeSelfLegajo.tsx");
 assert.match(src,/<form className="esl-form" onSubmit=\{e=>void save\(e\)\}/);
 assert.match(src,/<button className="esl-save" type="submit" disabled=\{saving\}>/);
 assert.match(src,/Guardar mi legajo/);
 assert.match(src,/rm_app_staff_self_profile_save/);
 assert.match(src,/p_started_on:values\.started_on\|\|null/);
 assert.match(src,/Legajo guardado correctamente/);
 assert.match(src,/role="alert"/);
});
test("En móvil Guardar queda visible por encima del dock y los campos siguen desplazándose",()=>{
 const css=read("modules/empleados/components/legajos/employee-self-legajo.css");
 const nav=read("modules/empleados/styles/mobile-navigation.css");
 assert.match(css,/@media screen and \(max-width:900px\)/);
 assert.match(css,/\.app-shell \.esl-actions\s*\{\s*position:fixed;/);
 assert.match(css,/bottom:calc\(83px \+ env\(safe-area-inset-bottom,0px\)\)/);
 assert.match(css,/z-index:1001/);
 assert.match(css,/\.app-shell \.esl-form\{padding-bottom:calc\(95px/);
 assert.match(css,/\.app-shell \.esl-actions \.esl-save\{/);
 assert.match(nav,/\.app-shell \.gl-module-dock\{\s*display:flex;position:fixed;z-index:1000;/);
 assert.match(nav,/min-height:calc\(65px \+ env\(safe-area-inset-bottom,0px\)\)/);
});
