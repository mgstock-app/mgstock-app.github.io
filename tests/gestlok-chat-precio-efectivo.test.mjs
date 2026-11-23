import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("el precio en efectivo de las promos es exclusivo de Mi Gusto Munro y Don Torcuato", () => {
  const chat = readFileSync(new URL("../public/chat/chat.js", import.meta.url), "utf8");
  assert.match(chat, /const LOCALES_PRECIO_EFECTIVO = \['mi-gusto-munro', 'mi-gusto-torcuato'\];/);
  assert.match(chat, /if \(!LOCALES_PRECIO_EFECTIVO\.includes\(S\.sucursal\?\.slug \|\| SLUG\)\) return null;/);
  assert.match(chat, /p\?\.reglas\?\.sin_descuento === true\) return null/);
  // «Ver menú» sigue siendo de la micro app general.
  assert.match(chat, /\{id: '__ver_menu', texto: 'Ver menú'\}/);
});
