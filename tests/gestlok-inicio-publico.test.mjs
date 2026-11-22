import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("la raíz es el inicio publicitario y los enlaces de la app siguen yendo a /login/", () => {
  const page = read("app/page.tsx");
  assert.match(page, /<GestlokHome \/>/);
  assert.doesNotMatch(page, /<StockRuntime \/>/);
  assert.match(page, /location\.replace\('\/login\/'\+location\.search\+h\)/);
  assert.match(page, /display-mode: standalone/);
  assert.match(page, /#\(inicio\|micro-apps\|contacto\)/);
  const login = read("app/login/page.tsx");
  assert.match(login, /<StockRuntime \/>/);
  assert.match(login, /#registrarme/);
  assert.match(login, /\[data-au=\\"up\\"\]/);
});

test("el inicio tiene acceso, carrusel, contacto sin número personal y Emma", () => {
  const home = read("components/gestlok-home.tsx");
  assert.match(home, /href="\/login\/">Ingresar</);
  assert.match(home, /href="\/login\/#registrarme">Registrarme</);
  for (const app of ["GESTLOK Chat", "GESTLOK Caja", "Plan Scanner", "Stock y proveedores", "Precios", "Empleados",
    "Horarios", "Reseñas con cupón", "NFC y QR", "Vínculo entre sucursales"]) assert.ok(home.includes(`nombre: "${app}"`), app);
  for (const id of ["glh-nombre", "glh-telefono", "glh-email", "glh-mensaje"]) assert.ok(home.includes(`id="${id}"`), id);
  assert.match(home, /\(opcional\)/);
  assert.match(home, /rpc\/gestlok_contacto_enviar/);
  assert.match(home, /cm9sZSI6ImFub24i/);
  assert.doesNotMatch(home, /wa\.me|4471|5491144715168|Sobre mí/);
  assert.match(home, /Hablá con Emma/);
});

test("Emma responde los temas principales y deriva lo demás a Contacto", { skip: !process.features?.typescript }, async () => {
  const { responderEmma } = await import("../lib/gestlok-emma.ts");
  assert.match(responderEmma("¿Qué micro apps hay?").texto, /Plan Scanner/);
  assert.match(responderEmma("¿Cómo me registro?").texto, /Registrarme/);
  assert.equal(responderEmma("¿Cuánto cuesta?").contacto, true);
  assert.equal(responderEmma("Hablar con una persona").contacto, true);
  assert.match(responderEmma("pedidos a mis proveedores").texto, /Stock y proveedores/);
  assert.match(responderEmma("mis clientes me escriben pedidos").texto, /GESTLOK Chat/);
  assert.equal(responderEmma("¿Qué opinás del clima?").contacto, true);
});

test("solo la creadora lee los mensajes; cualquiera puede enviarlos", () => {
  const sql = read("supabase/migrations/20261122220000_gestlok_contacto_web.sql");
  assert.match(sql, /grant execute on function public\.gestlok_contacto_enviar\(text, text, text, text, boolean\) to anon, authenticated/);
  for (const f of ["gestlok_contacto_listar\\(integer\\)", "gestlok_contacto_marcar\\(uuid, boolean\\)", "gestlok_contacto_borrar\\(uuid\\)"]) {
    assert.match(sql, new RegExp("revoke all on function public\\." + f + " from public, anon"));
    assert.doesNotMatch(sql, new RegExp("grant execute on function public\\." + f + " to anon"));
  }
  assert.equal((sql.match(/perform gestlok_contacto_private\.require_creator\(\)/g) || []).length, 3);
  assert.match(sql, /kmu15lopez@gmail\.com/);
  assert.match(sql, /revoke all on gestlok_contacto_private\.mensajes from public, anon, authenticated/);
  assert.match(sql, /md5\('gestlok-contacto:'/);
});

test("el panel de la creadora tiene la bandeja de mensajes de la web", () => {
  const home = read("public/stock/gestlok-creator-home.js");
  assert.match(home, /\['contacto', 'Mensajes web'/);
  assert.match(home, /GestLokContactoWeb/);
  const mod = read("public/stock/gestlok-contacto-web.js");
  for (const rpc of ["gestlok_contacto_listar", "gestlok_contacto_marcar", "gestlok_contacto_borrar"]) assert.ok(mod.includes(rpc), rpc);
  assert.match(mod, /isCreadora/);
  assert.match(mod, /mailto:/);
  assert.match(read("components/stock-runtime.tsx"), /gestlok-contacto-web\.js/);
});
