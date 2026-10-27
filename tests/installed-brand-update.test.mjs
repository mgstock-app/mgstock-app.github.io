import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const read = path => readFileSync(path,"utf8");
const layout=read("app/layout.tsx");
const manifest=JSON.parse(read("public/manifest.webmanifest"));
const app=read("public/stock/app.js");
const sw=read("scripts/sw-template.js");

test("La URL del manifest es la original; actualizar NO crea una instalación distinta",()=>{
  assert.match(layout,/manifest:\s*\x60\$\{basePath\}\/manifest\.webmanifest\x60/);
  assert.doesNotMatch(layout,/manifest\.webmanifest\?brand=/);
  assert.equal(manifest.id,"./");
  assert.equal(manifest.start_url,"./");
  assert.equal(manifest.scope,"./");
  assert.equal(manifest.display,"standalone");
});
test("GestLok es el nombre de Android e iOS y los iconos tienen URLs versionadas",()=>{
  assert.equal(manifest.name,"GestLok");
  assert.equal(manifest.short_name,"GestLok");
  assert.match(layout,/title:\s*"GestLok"/);
  assert.match(layout,/appleWebApp:\s*\{\s*capable:\s*true,\s*title:\s*"GestLok"/);
  assert.ok(manifest.icons.length>=3);
  for(const icon of manifest.icons){
    assert.match(icon.src,/\?rev=gestlok-installed-brand-20261024-r3$/);
    assert.ok(/gestlok/.test(icon.src));
  }
  const sizes=manifest.icons.map(i=>i.sizes);
  for(const s of ["192x192","512x512"])assert.ok(sizes.includes(s));
});
test("La PWA verifica actualizaciones al abrirla y al regresar, sin forzar recargas",()=>{
  assert.match(app,/serviceWorker\.register\('sw\.js', \{updateViaCache:'none'\}\)/);
  assert.match(app,/reg\.update\(\)\.catch/);
  assert.match(app,/document\.addEventListener\('visibilitychange', refresh\)/);
  assert.match(app,/window\.addEventListener\('online', refresh\)/);
  assert.doesNotMatch(app,/window\.location\.reload\(\)/);
  assert.doesNotMatch(app,/caches\.keys\(\)/);
});
test("Service worker mantiene cachés separados y conserva el manifiesto y sus iconos",()=>{
  assert.match(sw,/const PREFIX = \x60mgstock:/);
  assert.match(sw,/\/manifest\.webmanifest/);
  assert.match(sw,/\/icons\/gestlok-app-v2-192\.png/);
  assert.match(sw,/\/icons\/gestlok-maskable-v2-512\.png/);
  assert.match(sw,/self\.skipWaiting\(\)/);
  assert.match(sw,/self\.clients\.claim\(\)/);
});
