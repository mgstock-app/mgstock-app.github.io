import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("la identidad de instalación de GestLok usa íconos nuevos y válidos", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  const layout = read("app/layout.tsx");
  assert.equal(manifest.name, "GestLok");
  assert.equal(manifest.short_name, "GestLok");
  assert.ok(layout.includes('manifest: `${basePath}/manifest.webmanifest`'));
  assert.ok(!layout.includes('manifest.webmanifest?brand='));
  assert.equal(manifest.id,"./");
  const icons = [
    ["icons/gestlok-app-v2-192.png", 192],
    ["icons/gestlok-app-v2-512.png", 512],
    ["icons/gestlok-maskable-v2-512.png", 512],
  ];
  for (const [src, size] of icons) {
    assert.ok(manifest.icons.some(icon => icon.src.split("?")[0] === src && icon.src.includes("?rev=")));
    const png = readFileSync(new URL("../public/" + src, import.meta.url));
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  assert.match(layout, /gestlok-favicon-v2-32\.png/);
  assert.match(layout, /gestlok-apple-v2-180\.png/);
});

test("pantalla de ingreso y caché públicos no muestran la marca privada", () => {
  const markup = JSON.parse(read("lib/stock/markup.json"));
  const auth = read("public/stock/auth.js");
  const sw = read("scripts/sw-template.js");
  const builtSw = read("public/sw.js");
  const page = read("app/page.tsx");
  assert.match(markup, /gestlok-wordmark\.svg/);
  assert.doesNotMatch(markup, /img\/mi-gusto|alt="Mi Gusto"/i);
  assert.doesNotMatch(auth, /Mi Gusto/);
  assert.doesNotMatch(sw, /img\/mi-gusto/);
  assert.doesNotMatch(builtSw, /img\/mi-gusto/);
  assert.match(sw, /gestlok-app-v2-192\.png/);
  assert.match(page, /<GestLokIntro \/>/);
});

test("Mi Gusto solo se renderiza a integrantes autorizados de la empresa, no por defecto", () => {
  const app = read("public/stock/app.js");
  assert.match(app, /S\\.me\\?\\.tenant_id === MI_GUSTO_TENANT/);
  assert.match(app, /!!miEquipo\\(\\)/);
  assert.match(app, /gestlok-company-identity/);
  assert.match(app, /Empanadas de Verdad/);
  assert.match(app, /img\/mi-gusto-blanco\.png/);
  assert.doesNotMatch(JSON.parse(read("lib/stock/markup.json")), /mi-gusto/);
});
