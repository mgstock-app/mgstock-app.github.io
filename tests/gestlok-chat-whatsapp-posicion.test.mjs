import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../public/chat/chat.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/chat/index.html',import.meta.url),'utf8');

test('WhatsApp discreto dentro de la esquina inferior derecha del chat',()=>{
  const bloque=css.split('/* Canal externo opcional. En esquina inferior derecha')[1]
    ?.split('/* Cancelación segura y opciones de venta posteriores. */')[0];
  assert.ok(bloque,'debe existir el estilo inferior derecho');
  assert.match(bloque,/right:max\(12px,calc\(\(100vw - 720px\)\/2 \+ 12px\)\)/);
  assert.match(bloque,/bottom:calc\(94px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(bloque,/width:44px;height:44px/);
  assert.match(bloque,/width:34px;height:34px/);
  assert.match(bloque,/@media\(max-width:620px\)/);
  assert.match(bloque,/bottom:calc\(174px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(bloque,/body:has\(\.hoja:not\(\[hidden\]\)\)/);
  assert.match(bloque,/body:has\(\.redactar:focus-within\)/);
  assert.doesNotMatch(bloque,/left:|top:105px|bottom:auto/);
  assert.doesNotMatch(css, /\.cabecera\{padding-left:64px\}/);
  assert.match(html,/chat\.css\?v=20261121bordes1/);
  assert.match(html,/id="whatsapp-local" class="chat-whatsapp"/);
});

test('el contacto externo conserva su vínculo, sin intervenir en los pedidos',()=>{
  const js=readFileSync(new URL('../public/chat/chat.js',import.meta.url),'utf8');
  assert.match(js,/link\.href = 'https:\/\/wa\.me\/' \+ telefono/);
  assert.match(js,/link\.hidden = false/);
  assert.match(js,/link\.hidden = true; link\.removeAttribute\('href'\)/);
});
