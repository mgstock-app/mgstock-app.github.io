import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { descuentoEfectivoAplica } from "../public/chat/motor.js";

const leer = ruta => readFileSync(new URL("../" + ruta, import.meta.url), "utf8");

test("el precio en efectivo de las promos depende de la configuración del local, no de nombres en el código", () => {
  const chat = leer("public/chat/chat.js");
  assert.doesNotMatch(chat, /LOCALES_PRECIO_EFECTIVO/);
  assert.match(chat, /if \(S\.sucursal\?\.precio_efectivo_en_carta !== true\) return null;/);
  assert.match(chat, /p\?\.reglas\?\.sin_descuento === true\) return null/);
  // «Ver menú» sigue siendo de la micro app general.
  assert.match(chat, /\{id: '__ver_menu', texto: 'Ver menú'\}/);
});

test("descuento por efectivo: porcentaje y forma de entrega de cada local", () => {
  assert.equal(descuentoEfectivoAplica({descuento_efectivo_pct: 0, descuento_efectivo_entrega: "ambas"}, "envio"), false);
  assert.equal(descuentoEfectivoAplica({descuento_efectivo_pct: 10}, "envio"), true, "sin dato: solo envío, como antes");
  assert.equal(descuentoEfectivoAplica({descuento_efectivo_pct: 10}, "retiro"), false);
  assert.equal(descuentoEfectivoAplica({descuento_efectivo_pct: 10, descuento_efectivo_entrega: "retiro"}, "retiro"), true);
  assert.equal(descuentoEfectivoAplica({descuento_efectivo_pct: 10, descuento_efectivo_entrega: "retiro"}, "envio"), false);
  assert.equal(descuentoEfectivoAplica({descuento_efectivo_pct: 5, descuento_efectivo_entrega: "ambas"}, "retiro"), true);
});

test("la app general de GESTLOK Chat no trae personalizaciones de un comercio", () => {
  const archivos = ["public/chat/chat.js", "public/chat/motor.js", "public/chat/panel/panel.js",
    "public/chat/panel/importar-carta.js", "supabase/functions/gestlok-chat/index.ts",
    "supabase/functions/gestlok-chat/ia.js", "supabase/functions/gestlok-chat/motor.js"];
  for (const ruta of archivos) {
    const t = leer(ruta);
    assert.doesNotMatch(t, /mi-gusto|Mi Gusto/i, ruta + " no debe nombrar a Mi Gusto");
    assert.doesNotMatch(t, /On Fire/i, ruta + " no debe nombrar promos de un comercio");
    assert.doesNotMatch(t, /efectivo 10\s?%|10\s?% de descuento/i, ruta + " no debe fijar el 10 %");
  }
  assert.equal(leer("public/chat/motor.js"), leer("supabase/functions/gestlok-chat/motor.js"), "las dos copias del motor iguales");
});

test("Mi Gusto conserva su descuento como dato: 10 %, solo envío y precio en efectivo visible", () => {
  const sql = leer("supabase/migrations/20261123150000_gestlok_chat_descuento_efectivo_por_local.sql");
  assert.match(sql, /set descuento_efectivo_entrega = 'envio', precio_efectivo_en_carta = true\s+where slug in \('mi-gusto-munro', 'mi-gusto-torcuato'\)/);
  assert.match(sql, /s\.descuento_efectivo_entrega in \(''ambas'', v_entrega\)/);
  assert.match(sql, /not between 0 and 50/);
  const panel = leer("public/chat/panel/panel.js");
  assert.match(panel, /Descuento por pago en efectivo/);
  assert.match(panel, /descuento_efectivo_entrega: f\.descuento_efectivo_entrega\.value/);
});
