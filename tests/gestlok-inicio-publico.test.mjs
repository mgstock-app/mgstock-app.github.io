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
  assert.match(page, /#\(inicio\|como-funciona\|beneficios\|micro-apps\|contacto\)/);
  const login = read("app/login/page.tsx");
  assert.match(login, /<StockRuntime \/>/);
  assert.match(login, /#registrarme/);
  assert.match(login, /\[data-au=\\"up\\"\]/);
});

test("el inicio publicita GESTLOK Chat con cuadros reales, contacto sin número personal y Emma", () => {
  const home = read("components/gestlok-home.tsx");
  assert.match(home, /href="\/login\/">Ingresar</);
  assert.match(home, /href="\/login\/#registrarme">Registrarme</);
  assert.match(home, /Así funciona GESTLOK Chat/);
  assert.match(home, /Local, productos y precios de ejemplo/);
  assert.doesNotMatch(home, /Mi Gusto|Munro/);
  for (const img of ["1-bienvenida", "2-carta", "3-promo", "4-sugerencia", "5-gerente", "6-seguimiento"]) {
    assert.ok(home.includes(`img: "${img}"`), img);
    assert.ok(readFileSync(new URL(`../public/img/gestlok-chat/${img}.webp`, import.meta.url)).length > 5000, img);
  }
  for (const id of ["glh-nombre", "glh-telefono", "glh-email", "glh-mensaje"]) assert.ok(home.includes(`id="${id}"`), id);
  assert.match(home, /\(opcional\)/);
  assert.match(home, /rpc\/gestlok_contacto_enviar/);
  assert.match(home, /cm9sZSI6ImFub24i/);
  assert.doesNotMatch(home, /wa\.me|4471|5491144715168|Sobre mí|Plan Scanner|Vínculo entre sucursales/);
  assert.match(home, /Hablá con Emma/);
});

test("Emma responde los temas principales y deriva lo demás a Contacto", { skip: !process.features?.typescript }, async () => {
  const { responderEmma } = await import("../lib/gestlok-emma.ts");
  assert.match(responderEmma("¿Cómo funciona?").texto, /Hacer un pedido/);
  assert.equal(responderEmma("¿Tienen caja?").contacto, true);
  assert.match(responderEmma("¿Y las reseñas?").texto, /Google/);
  assert.match(responderEmma("¿Cómo me registro?").texto, /Registrarme/);
  const precio = responderEmma("CUANTO SALE?");
  assert.match(precio.texto, /\$ 70\.000 por mes por local, con soporte incluido/);
  assert.match(precio.texto, /15% de descuento: \$ 59\.500/);
  assert.match(precio.texto, /\$ 50\.000, opcional/);
  assert.equal(precio.registrarme, true);
  assert.match(responderEmma("¿tienen alguna promo?").texto, /primer mes/);
  assert.match(responderEmma("¿me dan un QR?").texto, /QR/);
  assert.doesNotMatch(responderEmma("¿me dan un QR?").texto, /Estamos preparando/);
  assert.equal(responderEmma("Hablar con una persona").contacto, true);
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
