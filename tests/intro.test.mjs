import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("la introducción GestLok aparece antes del login sin cambiar los accesos", () => {
  const page = read("app/page.tsx");
  const splash = read("components/gestlok-intro.tsx");
  const css = read("app/gestlok-intro.css");
  assert.match(page, /<GestLokIntro \/>/);
  assert.match(page, /<StockRuntime \/>/);
  assert.ok(page.indexOf("<GestLokIntro />") < page.indexOf("<StockRuntime />"));
  assert.match(splash, />GESTLOK<\/div>/);
  assert.match(splash, /Todo tu negocio, en orden\./);
  assert.match(css, /gl-intro-dismiss \.62s ease-in-out 3\.1s forwards/);
  assert.match(css, /visibility:hidden;pointer-events:none/);
});

test("la introducción respeta movimiento reducido y reaparece al volver a la PWA", () => {
  const splash = read("components/gestlok-intro.tsx");
  const css = read("app/gestlok-intro.css");
  assert.match(splash, /REPLAY_AFTER_BACKGROUND_MS = 45_000/);
  assert.match(splash, /visibilitychange/);
  assert.match(splash, /setOpening\(\(current\) => current \+ 1\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(splash, /supabase|localStorage|sessionStorage|fetch\(/i);
});
