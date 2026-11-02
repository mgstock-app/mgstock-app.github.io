import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("El dock principal aparece solo en teléfonos y reutiliza controles con permisos",()=>{
 const js=read("public/stock/gestlok-mobile-dock.js");
 const css=read("app/mobile-navigation.css");
 assert.match(js,/max-width:899px/);
 for(const action of ["data-gerente-empleados","data-owner-area-staff","data-go","vencimientos","Colaboradores"])
   assert.ok(js.includes(action),"Falta acción existente: "+action);
 assert.match(js,/if\(k==='staff'\)\{staff\(\)\?\.click\(\)/);
 assert.match(js,/\['staff','Colaboradores'/);
 assert.match(css,/@media\(max-width:899px\)/);
 assert.match(css,/@media print/);
 assert.match(read("components/stock-runtime.tsx"),/gestlok-mobile-dock\.js/);
});
test("Gerentes ven Colaboradores sin horarios individuales nuevos ni permisos ampliados",()=>{
 const owner=read("public/stock/gestlok-owner-areas.js");
 const manager=read("modules/empleados/components/pages/GerenteHome.tsx");
 assert.match(owner,/data-gerente-empleados aria-label="Abrir colaboradores/);
 assert.match(owner,/gerente\.status==='ready'&&gerente\.locals\.includes\(api\.S\.local\)/);
 assert.match(owner,/data-gerente-quick/);
 assert.match(manager,/ManagerLegajos/);
 assert.match(manager,/Colaboradores/);
 assert.doesNotMatch(owner,/tabla-horarios-colaboradores/);
});
test("Todas las vistas de empleados cuentan con dock y mantienen logos de Mi Gusto",()=>{
 const components=[
  "modules/empleados/components/owner/OwnerSidebar.tsx",
  "modules/empleados/components/pages/GerenteHome.tsx",
  "modules/empleados/components/pages/EmployeePortalShell.tsx",
  "modules/empleados/components/admin/AdminShell.tsx"
 ];
 // Gerente, dueño y creadora: la misma barra de GESTLOK (GestlokDock usa la clase gl-module-dock).
 for(const file of components)assert.match(read(file),/className="gl-module-dock"|<GestlokDock\b/,file);
 for(const file of [components[0],components[1],components[3]])assert.match(read(file),/<GestlokDock\b/,file);
 assert.match(read("modules/empleados/components/gestlok/GestlokNav.tsx"),/className="gl-module-dock gl-gestlok-dock"/);
 const layout=read("modules/empleados/app/layout.tsx");
 assert.match(layout,/mobile-navigation\.css/);
 assert.match(read("modules/empleados/styles/mobile-navigation.css"),/@media\(min-width:901px\),print/);
 for(const file of components.slice(0,3))assert.match(read(file),/mi-gusto-blanco\.png/,file);
});
test("El menú de GESTLOK sigue dentro de Administración de empleados (celular y PC)",()=>{
 const dock=read("public/stock/gestlok-mobile-dock.js");
 const app=read("public/stock/app.js");
 const nav=read("modules/empleados/components/gestlok/GestlokNav.tsx");
 // GESTLOK guarda solo nombres y secciones visibles de esa cuenta.
 assert.match(dock,/localStorage\.setItem\('gestlok:nav'/);
 assert.match(dock,/uid:String\(ctx\.uid\)/);
 assert.match(dock,/#snav button\[data-go\]/);
 assert.match(app,/window\.GestLokNavContext=\(\)=>\(\{[^}]*uid:S\.uid\|\|null/);
 // Volver: el local tiene que ser de la persona y go() vuelve a comprobar cada sección.
 assert.match(app,/if\(!localesMios\(\)\.some\(x=>x\.id===p\.local\)\)return;/);
 assert.match(app,/const ok = \(v === 'cierre-online' && puedeVerPagosOnline\(\)\)/);
 assert.match(dock,/\['business','avisos'\]\.includes\(h\)/);
 // Empleados: barra de abajo y menú lateral con los mismos accesos.
 assert.match(nav,/export function GestlokDock/);
 assert.match(nav,/export function GestlokLocalNav/);
 assert.match(nav,/leerNavGestlok\(raw, uid\)/);
 for(const f of ["modules/empleados/components/pages/GerenteHome.tsx","modules/empleados/components/owner/OwnerSidebar.tsx","modules/empleados/components/admin/AdminShell.tsx"])
  assert.match(read(f),/<GestlokLocalNav labelClassName=/,f);
});
