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
 assert.match(js,/if\(k==='staff'\)\{/);
 assert.match(js,/staff\(\)\?\.click\(\)/);
 assert.match(js,/\['staff','Colaboradores'/);
 assert.match(js,/\['staff','Staff','clock',!!staff\(\)\]/);
 assert.match(js,/esMunro\(\)/);
 assert.match(js,/empleados\/horarios\//);
 assert.match(read("modules/empleados/components/gestlok/GestlokNav.tsx"),/nav\.local === "munro"/);
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
 // Volver: solo con los botones reales de GESTLOK (entrar al local y abrir la sección del menú).
 assert.match(dock,/\[data-act="local"\]\[data-id="'\+p\.local\+'"\]/);
 assert.match(dock,/#snav button\[data-go="'\+p\.view\+'"\]/);
 assert.match(app,/!\['chat','proveedores','vencimientos','avisos'\]\.includes\(p\.view\)/,"Las push siguen limitadas");
 assert.match(dock,/\['business','avisos'\]\.includes\(h\)/);
 // Empleados: barra de abajo y menú lateral con los mismos accesos.
 assert.match(nav,/export function GestlokDock/);
 assert.match(nav,/export function GestlokLocalNav/);
 assert.match(nav,/leerNavGestlok\(raw, uid\)/);
 for(const f of ["modules/empleados/components/pages/GerenteHome.tsx","modules/empleados/components/owner/OwnerSidebar.tsx","modules/empleados/components/admin/AdminShell.tsx"])
  assert.match(read(f),/<GestlokLocalNav labelClassName=/,f);
});

test("Munro: Staff mantiene la barra horizontal en PC y el menú si falta el snapshot",()=>{
 const schedule=read("modules/empleados/components/schedules/SchedulesWorkspace.tsx");
 const dock=read("modules/empleados/components/gestlok/GestlokNav.tsx");
 const css=read("modules/empleados/styles/mobile-navigation.css");
 assert.match(schedule,/localesGerente\.includes\("munro"\)/);
 assert.match(schedule,/nav\.local === "munro" \|\| munroUnico/);
 assert.match(schedule,/className="gl-munro-schedules-route"/);
 assert.match(schedule,/<GestlokDock munroHorarios/);
 assert.match(dock,/asignados\.includes\("munro"\)/);
 assert.match(dock,/guardado\.local === "munro"/);
 for(const name of ["Inicio","Pagos Online","Stock Local","Staff","Más"])
  assert.ok(dock.includes(name),"El gerente pierde "+name);
 assert.match(css,/@media screen and \(min-width:901px\)/);
 assert.match(css,/\.gl-munro-schedules-route > \.gl-module-dock/);
 assert.match(css,/display:flex!important/);
 assert.match(css,/\.gl-munro-schedules-route \.gl-gestlok-sheet/);
 assert.match(css,/padding-bottom:calc\(112px/);
 assert.match(css,/@media\(min-width:901px\),print/,"Otras rutas siguen usando su navegación habitual");
});
