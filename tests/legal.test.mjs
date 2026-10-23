import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("privacy, terms and browser storage notices are static public pages", () => {
  for (const path of ["privacidad", "terminos", "almacenamiento"]) {
    const doc = read(`public/${path}.html`);
    assert.match(doc, /<html lang="es-AR">/);
    assert.match(doc, /Cookies y almacenamiento/);
    assert.match(doc, /privacidad\.html/);
    assert.match(doc, /terminos\.html/);
  }
});

test("legal links are available from the React app", () => {
  const page = read("app/page.tsx");
  for (const path of ["privacidad", "terminos", "almacenamiento"]) {
    assert.ok(page.includes(`/${path}.html`));
  }
  assert.match(page, /aria-label="Información legal de MG Stock"/);
});

test("public client does not grant owner status from an embedded personal email", () => {
  const auth = read("public/stock/auth.js");
  const app = read("public/stock/app.js");
  assert.doesNotMatch(auth, /const CREADORA\s*=/);
  assert.doesNotMatch(app, /const CREADORA\s*=/);
  assert.match(auth, /isOwner: rol === 'creadora'/);
  assert.match(app, /function equipoList\(\)/);
});
