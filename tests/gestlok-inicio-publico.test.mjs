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
  assert.match(page, /#\(inicio\|como-funciona\|demo\|beneficios\|micro-apps\|contacto\)/);
  // Volver desde /demo/ o /conocer/ lleva al inicio publicitario, no a la app.
  assert.match(page, /conocer\\\\\/\?\|demo\\\\\/\?\|/);
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
  for (const q of ["Quiero ver la demo", "¿Lo puedo probar?", "¿Tienen una demostración?"]) {
    const r = responderEmma(q);
    assert.equal(r.demo, true, q);
    assert.match(r.texto, /local de ejemplo/, q);
  }
  assert.equal(responderEmma("¿Cómo funciona?").demo, true);
  assert.doesNotMatch(responderEmma("¿tienen prueba gratis?").texto, /local de ejemplo/);
});

test("la demo pública usa solo el modo de demostración, sin base real ni precios", () => {
  const demo = read("components/gestlok-demo.tsx");
  assert.match(demo, /URL_CLIENTE = "\/chat\/\?demo=1&showroom=1"/);
  assert.match(demo, /URL_PANEL = "\/chat\/panel\/\?demo=1&showroom=1"/);
  assert.match(demo, /CLAVE_SHOWROOM = "gestlok:chat-showroom:v1"/);
  assert.match(demo, /No se envía nada a ningún comercio/);
  assert.match(demo, /Vista del cliente/);
  assert.match(demo, /Panel del local/);
  assert.match(demo, /Empezar de nuevo/);
  const codigo = demo.replace(/^\s*\/\/.*$/gm, ""); // sin comentarios
  assert.doesNotMatch(codigo, /supabase|rpc\/|apikey|Mi Gusto|Munro|Torcuato|\$ ?\d/i);
  const page = read("app/demo/page.tsx");
  assert.match(page, /<GestlokDemo \/>/);
  assert.match(page, /canonical: "\/demo\/"/);
  // El marco del panel nunca consulta la base en modo demostración.
  assert.match(read("public/chat/panel/panel.js"), /if \(DEMO\) return demoRpc\(fn, args \|\| \{\}\);/);
  assert.match(read("public/chat/chat.js"), /if \(DEMO\) return demoApi\(accion, extra\);/);
  const home = read("components/gestlok-home.tsx");
  assert.match(home, /<a href="\/demo\/">Demo<\/a>/);
  assert.match(home, /id="demo"/);
  assert.match(home, /Probalo antes de contratar/);
  assert.match(home, /href="\/demo\/">Abrir la demo</);
  assert.doesNotMatch(home, /\$ ?70\.000|59\.500|Precios<\/a>/);
  assert.match(read("public/sitemap.xml"), /gestlok\.com\.ar\/demo\//);
});

test("solo se borran las claves del local de demostración", async () => {
  const src = read("components/gestlok-demo.tsx");
  const cuerpo = src.match(/export function esClaveDeDemo\(clave: string\): boolean \{([\s\S]*?)\n\}/)[1]
    .replace(/: string/g, "");
  const esClaveDeDemo = new Function("clave", cuerpo);
  for (const k of ["gestlok-chat:token:demo", "gestlok-chat:cliente:demo", "gestlok-chat:ultimo-pedido:demo",
    "gestlok-chat:cierre:demo:2026-11-24T03:00:00.000Z", "gestlok-chat-panel:sucursal-demo"]) assert.equal(esClaveDeDemo(k), true, k);
  for (const k of ["gestlok-chat:token:mi-gusto-munro", "gestlok-chat:cliente:mi-gusto-torcuato", "gestlok-chat:token:demo-2x",
    "gestlok-chat-panel:sucursal", "sb-vgsepaaewbctjsjcpeta-auth-token", "gestlok-chat:cierre:mi-gusto-munro:x"]) assert.equal(esClaveDeDemo(k), false, k);
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
