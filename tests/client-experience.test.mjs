import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("proveedores se guardan por local y se bloquean sin permisos", () => {
  const app = read("public/stock/app.js");
  assert.match(app, /LOCAL_COLS = \[[^\]]*'proveedores'/);
  assert.match(app, /C\('proveedores'\)\.onSnapshot/);
  assert.match(app, /C\('proveedores'\)\.doc\(proveedorId\(nombre\)\)/);
  assert.match(app, /snap\.exists \? ref\.update\(payload\) : ref\.set\(payload\)/);
  assert.match(app, /const proveedorDraftKey/);
  assert.match(app, /!S\.db \|\| !S\.local \|\| !canW\(\) \|\| S\.offline/);
  assert.match(app, /S\.provInfo = \[\]/);
});

test("el envío de pedidos requiere intervención humana y nunca envía WhatsApp por código", () => {
  const app = read("public/stock/app.js");
  assert.match(app, /https:\/\/wa\.me\//);
  assert.match(app, /target="_blank" rel="noopener noreferrer"/);
  assert.match(app, /copyText\(proveedorSeleccionados\(t\.dataset\.name\)\.length/);
  assert.match(read('public/stock/gestlok-provider-pdf.js'), /new File\(\[blob\]/);
  assert.match(app, /navigator\.canShare/);
  assert.match(app, /task=navigator\.share\(\{files:\[p\.archivo\]\}\)/);
  assert.match(app, /data-act="prov-share-ready"/);
  assert.match(app, /if\(!esTotal\(\)\|\|!S\.provOpen\)return/);
  assert.doesNotMatch(app, /whatsapp\.sendMessage\(/);
});

test("el inicio es práctico y la identidad pública es neutral", () => {
  const app = read("public/stock/app.js");
  assert.match(app, /Acciones para hoy/);
  assert.match(app, /gl-today-action/);
  assert.match(app, /Configuración inicial · 1 de 3/);
  for (const page of ["privacidad","terminos","almacenamiento"]) {
    assert.doesNotMatch(read("public/" + page + ".html"), /Stock Productos Mi Gusto/);
  }
});
