import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");

test("la identidad pública es GestLok y no pertenece a ningún comercio", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  const markup = JSON.parse(read("lib/stock/markup.json"));
  const layout = read("app/layout.tsx");
  const app = read("public/stock/app.js");
  assert.equal(manifest.name, "GestLok");
  assert.equal(manifest.short_name, "GestLok");
  assert.match(layout, /title: "GestLok"/);
  assert.match(markup, /gestlok-wordmark\.svg/);
  assert.doesNotMatch(markup, /src="img\/mi-gusto/);
  assert.match(app, /perfil\.logoId === 'mi-gusto'/);
  assert.match(app, /img\/mi-gusto-negro\.png/);
  assert.match(app, /Chat del local/);
});

test("el chat queda asociado al local autenticado con control de permisos", () => {
  const app = read("public/stock/app.js");
  assert.match(app, /LOCAL_COLS = \[[^\]]*'chat'/);
  assert.match(app, /C\('chat'\)\.orderBy\('fecha'/);
  assert.match(app, /C\('chat'\)\.add\(\{texto:txt/);
  assert.match(app, /!S\.local \|\| S\.offline \|\| !canW\(\)/);
});

test("GestLok sigue gratis y exige aprobación de cuentas", () => {
  const auth = read("public/stock/auth.js");
  const markup = JSON.parse(read("lib/stock/markup.json"));
  assert.match(auth, /pedir_acceso/);
  assert.match(markup, /Tu ingreso está pendiente/);
  assert.doesNotMatch(markup, /suscripci[oó]n|pago mensual|tarjeta de cr[eé]dito/i);
});
