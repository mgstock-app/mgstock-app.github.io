const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
async function main() {
  const { visibleBranchScheduleLinks, visibleBranchScheduleCards, copyBranchScheduleLink } = await import("../utils/branch-schedule-links.js");
  const sheets = [{local_id:"dt",local_name:"Torcuato",url:"https://docs.google.com/spreadsheets/d/13e8pZPG5DO3jzEAHXKz1JP6G_lhhkqOWj8NN2rqrJak/edit?gid=0#gid=0"}];
  assert.equal(visibleBranchScheduleLinks(sheets).length,1);
  assert.equal(visibleBranchScheduleLinks([{url:"https://evil.example/link"}]).length,0);
  assert.equal(visibleBranchScheduleLinks(null).length,0);
  assert.equal(visibleBranchScheduleLinks([{url:"javascript:alert(1)"}]).length,0);
  let copied;
  await copyBranchScheduleLink(sheets[0].url, { writeText: async value => { copied = value; } });
  assert.equal(copied, sheets[0].url, "Copy keeps the complete existing URL including the sheet tab");
  await assert.rejects(() => copyBranchScheduleLink(sheets[0].url, undefined), /Portapapeles/);
  await assert.rejects(() => copyBranchScheduleLink(sheets[0].url, { writeText: async () => { throw new Error("Permission denied"); } }), /Permission denied/);
  await assert.rejects(() => copyBranchScheduleLink("javascript:alert(1)", { writeText: async () => assert.fail("Unsafe URL copied") }), /inválido/);
  const ts = require("typescript");
  const Module = require("node:module");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const filename = path.resolve("components/schedules/ScheduleSheetCard.tsx");
  const compiled = ts.transpileModule(fs.readFileSync(filename,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = new Module(filename,module);
  mod.filename = filename;
  mod.paths = module.paths;
  const nativeRequire = mod.require.bind(mod);
  mod.require = name => name === "@/utils/branch-schedule-links" ? {copyBranchScheduleLink,visibleBranchScheduleLinks} : name === "@/features/access/api" ? {rpc:async()=>{throw new Error("No server calls during server rendering");}} : name.endsWith(".module.css") ? new Proxy({}, {get: (_target,key) => key === "__esModule" ? false : String(key)}) : nativeRequire(name);
  mod._compile(compiled,filename);
  const html = renderToStaticMarkup(React.createElement(mod.exports.ScheduleSheetCard,{url:sheets[0].url}));
  for (const label of ["Don Torcuato", "Planilla de turnos de la sucursal", "Google Sheets", "Abrir planilla", "Ayuda", "Copiar enlace", "Origen: Google Sheets", "Información", "Archivo", "Planilla de Don Torcuato", "Tipo", "Acceso", "Usuarios autorizados", "Responsable", "Administración"]) assert(html.includes(label),label);
  assert(!html.includes("Abrir planilla de horarios") && !html.includes(">Horarios<"),"Schedule cards must not repeat the page title");
  assert(html.includes('target="_blank"') && html.includes('rel="noopener noreferrer"'));
  assert(html.includes('aria-expanded="false"'),"Help starts collapsed");
  assert(html.includes('aria-label="Copiar URL de Google Sheets"'));
  assert(html.includes('role="status"'),"Clipboard feedback is announced to assistive technology");
  assert(/<h2[^>]*>Don Torcuato<\/h2>/.test(html),"Don Torcuato is the main card heading");
  const pending = {local_id:"munro",local_name:"Munro",url:null};
  assert.equal(visibleBranchScheduleCards([...sheets,pending]).length,2);
  assert.equal(visibleBranchScheduleLinks([pending]).length,0);
  assert.equal(visibleBranchScheduleCards([{local_id:"dt",local_name:"Don Torcuato",url:null},{local_id:"munro",local_name:"Munro",url:"javascript:alert(1)"}]).length,1);
  assert.equal(visibleBranchScheduleCards([{local_id:"new-branch",local_name:"Nueva sucursal",url:null}]).length,1,"New owner-created locals display an unconfigured card");
  assert.equal(visibleBranchScheduleCards([{local_id:"bad",local_name:"",url:"https://evil.example/"}]).length,0,"Invalid URLs are never rendered");
  await assert.rejects(() => copyBranchScheduleLink(null,{writeText:async()=>assert.fail("Pending URL copied")}),/inválido/);
  const munro = renderToStaticMarkup(React.createElement(mod.exports.ScheduleSheetCard,{url:null,branch:"Munro"}));
  for(const label of ["<h2",">Munro</h2>","Enlace pendiente","todavía no tiene un enlace"]) assert(munro.includes(label),label);
  assert.equal((munro.match(/disabled=""/g)||[]).length,3,"Opening and both copy buttons disabled");
  assert(!munro.includes("href=") && !munro.includes("Torcuato") && !munro.includes(sheets[0].url));
  const configuredMunro = renderToStaticMarkup(React.createElement(mod.exports.ScheduleSheetCard,{url:sheets[0].url,branch:"Munro"}));
  assert(configuredMunro.includes('target="_blank"') && !configuredMunro.includes('disabled=""'),"Future URL enables normal actions");
  assert(/<h2[^>]*>Munro<\/h2>/.test(configuredMunro),"Munro is the main card heading");
  assert(configuredMunro.includes(sheets[0].url) && html.includes(sheets[0].url),"Styling does not alter Google Sheets links");
  const editable = renderToStaticMarkup(React.createElement(mod.exports.ScheduleSheetCard,{url:null,branch:"Nuevo local",localId:"future",canConfigure:true,onUpdated:()=>{}}));
  assert(editable.includes("Configurar enlace"),"Owner can configure a brand-new local");
  for (const label of ["Plantilla GESTLOK (predeterminada)", "Tu propia planilla", "Descargar plantilla GESTLOK (.xlsx)", "plantillas/GESTLOK-plantilla-horarios.xlsx"])
    assert(editable.includes(label), "Whoever configures Horarios can choose the GESTLOK template or their own: " + label);
  assert(!munro.includes("Plantilla GESTLOK") && !html.includes("Tu propia planilla"), "Read-only cards do not offer the configuration choice");
  assert(!munro.includes("Configurar enlace"),"Non-owners cannot see link configuration");
  assert(!html.includes("Configurar enlace"),"Default cards remain read-only");
  const currentOwner = renderToStaticMarkup(React.createElement(mod.exports.ScheduleSheetCard,{url:sheets[0].url,branch:"Torcuato",localId:"dt",canConfigure:true,onUpdated:()=>{}}));
  assert(currentOwner.includes("Cambiar enlace"),"Owner can change an existing link without creating another local");
  const branchCards = fs.readFileSync(path.join("components","schedules","BranchScheduleLink.tsx"),"utf8");
  assert(branchCards.includes('index > 0 && <hr className={styles.separator} aria-hidden="true" />'),"Cards have one fine divider between them only");
  const company = fs.readFileSync(path.join("components","organizations","CompanyHome.tsx"),"utf8");
  assert(!company.includes("<BranchScheduleLink"),"Schedule cards must not render directly on the company screen");
  assert(company.includes('href={`/horarios?empresa=${companyId}`}'),"Company Horarios folder must remain linked");
  const schedules = fs.readFileSync(path.join("components","schedules","SchedulesWorkspace.tsx"),"utf8");
  assert(schedules.includes("<BranchScheduleLink key={selected.id} company={selected.id} />"),"Horarios route should contain the Sheets shortcut");
  assert(!schedules.includes("ScheduleEditor") && !schedules.includes("useSchedule"),
    "Horarios must not render the internal schedule editor or load its saved sessions");
  for (const obsolete of ["Actualizar planilla", "schedule-period", "schedule-start", "schedule-history",
                           "Publicar horarios para el dueño", "Guardar borrador"])
    assert(!schedules.includes(obsolete), "Internal schedules interface removed: " + obsolete);
  assert(schedules.includes('htmlFor="schedule-company"') && schedules.includes("companies.length > 1"),
    "Owners with multiple companies can still choose which company's Google Sheets cards to view");
  assert(schedules.includes("Accedé a las planillas de cada sucursal en Google Sheets."),
    "Horarios explains Google Sheets is the sole schedule interface");
  assert(company.includes("Accedé a los archivos de Google Sheets correspondientes a cada sucursal."),
    "Company folder no longer advertises the removed internal ten-row schedule editor");
  const report = fs.readFileSync(path.join("components","reports","LocalScreen.tsx"),"utf8");
  assert(!report.includes("<CurrentBranchScheduleLink"),"Local reporting screens must not show schedule cards");
  assert(report.includes('href="/horarios"'),"Alessandro can navigate to the Horarios folder without embedded cards");
  console.log("PASS: authorized Sheets shortcut, complete card markup, safe new-tab link and clipboard success/error cases");
}
main().catch(e=>{console.error(e);process.exitCode=1;});

