const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (...segments) => fs.readFileSync(path.join(root,...segments),"utf8");

test("privacy, terms and browser storage notices have public routes", () => {
  for (const route of ["privacidad", "terminos", "almacenamiento"]) {
    const source = read("app",route,"page.tsx");
    assert.match(source, /LegalPage/);
    assert.doesNotMatch(source, /AccessGate/);
    assert.ok(source.includes(`kind="${route}"`));
  }
});
test("links to the three documents appear in the global layout", () => {
  const layout = read("app","layout.tsx");
  for (const route of ["privacidad","terminos","almacenamiento"]) {
    assert.ok(layout.includes(`href="/${route}"`));
  }
  assert.match(layout, /aria-label="Documentos legales de GESTLOK Empleados"/);
});
test("documents explain authentication cookies, labour privacy, and external providers", () => {
  const legal = read("components","legal","LegalPage.tsx");
  for (const text of ["Supabase","Google","Vercel","Ley argentina 25.326","cookies técnicas","reportes de liquidación"]) {
    assert.ok(legal.includes(text),`Missing relevant notice: ${text}`);
  }
});
