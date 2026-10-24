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
  assert.ok(app.includes("S.db.collection(local + '/chat').doc(payload.id).set"));
  assert.match(app, /!S\.local \|\| S\.offline \|\| !canW\(\)/);
});

test("GestLok sigue gratis y exige aprobación de cuentas", () => {
  const auth = read("public/stock/auth.js");
  const markup = JSON.parse(read("lib/stock/markup.json"));
  assert.match(auth, /pedir_acceso/);
  assert.match(markup, /Tu ingreso está pendiente/);
  assert.doesNotMatch(markup, /suscripci[oó]n|pago mensual|tarjeta de cr[eé]dito/i);
});

test("el panel administrativo solo aparece con rol creadora y es gratuito", () => {
  const app = read("public/stock/app.js");
  assert.match(app, /if \(adm && listo && S\.db\)/);
  assert.match(app, /isCreadora = \(\) => !!\(S\.me && S\.me\.isOwner\)/);
  assert.match(app, /Panel administrativo/);
  assert.match(app, /if \(!isCreadora\(\) && mios\.length === 1\)/);
  assert.match(app, /Las nuevas cuentas solo ingresan cuando las autorizás/);
  assert.doesNotMatch(app.slice(app.indexOf('const adminHTML ='), app.indexOf('if (hub._h !== adminHTML)')), /facturaci[oó]n|ingresos del mes|suscripciones|cobros recurrentes/i);
});

test("los mensajes pendientes se recuperan sin duplicar el envío y sin mezclar locales", () => {
  const app = read("public/stock/app.js");
  assert.match(app, /const chatDraftKey =/);
  assert.match(app, /const chatPendingKey =/);
  assert.ok(app.includes('p.autor === S.uid && p.local === S.local'));
  assert.ok(app.includes('localStorage.setItem(pendingKey, JSON.stringify(payload))'));
  assert.ok(app.includes('payload.id).set'));
  assert.match(app, /No pudimos confirmar el envío anterior/);
  assert.ok(app.includes('t.id === \'gestlok-chat-text\''));
});

test("los conteos sin conexión requieren confirmación incluso después de reconectarse", () => {
  const app = read("public/stock/app.js");
  assert.match(app, /const queuedKey =/);
  assert.ok(app.includes('lsSet(queuedKey(), S.queued)'));
  assert.ok(app.includes('S.queued = q && typeof q.view'));
  assert.ok(app.includes('S.offline = false; render();'));
  assert.ok(!app.includes('S.offline = false; S.queued = null'));
});

test("las respuestas viejas de Supabase no sobrescriben las nuevas", () => {
  const auth = read("public/stock/auth.js");
  assert.match(auth, /generation = 0/);
  assert.match(auth, /current === generation/);
});
