// Menú de GESTLOK dentro de Administración de empleados: solo el menú de la misma cuenta, enlaces seguros de vuelta.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const out = ts.transpileModule(fs.readFileSync("utils/gestlok-nav.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", out)(mod, mod.exports);
const { leerNavGestlok, navPorDefecto, enlaceVista, enlaceDock, seccionesLocal } = mod.exports;

const guardado = { v: 1, uid: "u1", local: "munro", localName: "Munro", at: 1,
  dock: [["home", "Inicio"], ["pagos", "Pagos Online"], ["stock", "Stock Local"], ["staff", "Colaboradores"], ["more", "Más"]],
  side: [{ go: "inicio", label: "Inicio", folder: false }, { go: "cierre-online", label: "Pagos Online", folder: false },
    { go: "stock", label: "Stock Local", folder: false }, { go: "proveedores", label: "Proveedores", folder: false },
    { go: "motos", label: "Motos Agencia", folder: true }, { go: "<script>", label: "x", folder: false }] };
const raw = JSON.stringify(guardado);
const nav = leerNavGestlok(raw, "u1");
assert.equal(nav.local, "munro");
assert.deepEqual(nav.dock.map((d) => d[0]), ["home", "pagos", "stock", "staff", "more"]);
assert.deepEqual(nav.side.map((s) => s.go), ["inicio", "cierre-online", "stock", "proveedores", "motos"], "Descarta secciones con nombres raros");
assert.equal(leerNavGestlok(raw, "otra-cuenta"), null, "El menú de otra cuenta no se usa");
assert.equal(leerNavGestlok("{no es json", "u1"), null);
assert.equal(leerNavGestlok(null, "u1"), null);
assert.equal(leerNavGestlok(JSON.stringify({ ...guardado, dock: [["hackear", "x"]] }), "u1"), null);
const sinStaff = leerNavGestlok(JSON.stringify({ ...guardado, dock: [["home", "Inicio"], ["more", "Más"]] }), "u1");
assert.deepEqual(sinStaff.dock.map((d) => d[0]), ["home", "staff", "more"], "Colaboradores siempre figura (es donde está)");

const home = "/";
assert.equal(enlaceDock(home, nav, "home"), "/?gl_ir_local=munro&gl_ir=inicio");
assert.equal(enlaceDock(home, nav, "pagos"), "/?gl_ir_local=munro&gl_ir=cierre-online");
assert.equal(enlaceDock(home, nav, "stock"), "/?gl_ir_local=munro&gl_ir=stock");
assert.equal(enlaceDock(home, nav, "staff"), null);
assert.equal(enlaceDock(home, nav, "more"), null);
assert.equal(enlaceVista(home, nav, "motos"), "/?gl_ir_local=munro&gl_ir=motos");
assert.equal(enlaceVista(home, nav, "a b"), "/", "Sección inválida: al inicio");
const hub = leerNavGestlok(JSON.stringify({ ...guardado, local: null, dock: [["home", "Inicio"], ["business", "Empresa"], ["staff", "Colaboradores"], ["avisos", "Avisos"], ["more", "Más"]] }), "u1");
assert.equal(hub.side.length, 0, "Sin local no hay secciones de local");
assert.equal(enlaceDock(home, hub, "home"), "/");
assert.equal(enlaceDock(home, hub, "business"), "/?gl_hub=business");
assert.equal(enlaceDock(home, hub, "avisos"), "/?gl_hub=avisos");
assert.deepEqual(seccionesLocal(nav, true).map((s) => s.go), ["proveedores", "motos"], "La hoja «Más» no repite lo de la barra");
assert.deepEqual(navPorDefecto().dock.map((d) => d[0]), ["home", "staff", "more"]);
console.log("gestlok-nav: ok");
