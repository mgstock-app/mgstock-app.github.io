import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../public/chat/chat.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/chat/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/chat/chat.js',import.meta.url),'utf8');

test('WhatsApp queda a la izquierda de Enviar pedido y nunca flota sobre el chat',()=>{
  const barra=html.match(/<div class="barra-pedido"[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(barra,/id="whatsapp-local" class="chat-whatsapp"/);
  assert.ok(barra.indexOf('id="whatsapp-local"') < barra.indexOf('id="btn-finalizar"'));
  assert.match(barra,/>WhatsApp<\/span>/);
  const bloque=css.split('/* Contacto externo en la barra del pedido')[1]
    ?.split('/* Cancelación segura y opciones de venta posteriores. */')[0];
  assert.ok(bloque);
  assert.match(bloque,/position:static/);
  assert.doesNotMatch(bloque,/position:fixed|right:max|bottom:calc/);
  assert.match(bloque,/@media\(max-width:620px\)/);
  assert.match(bloque,/@media\(max-width:350px\)/);
  assert.match(html,/chat\.css\?v=20261122vermenu1/);
  assert.match(html,/class="chat-inferior"/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto auto/);
  assert.match(css, /\.chat-inferior \.redactar\{grid-column:1;grid-row:2/);
});

test('WhatsApp conserva su vínculo y no modifica la lógica del pedido',()=>{
  assert.match(js,/link\.href = 'https:\/\/wa\.me\/' \+ telefono/);
  assert.match(js,/link\.hidden = false/);
  assert.match(js,/link\.removeAttribute\('href'\)/);
  assert.match(js,/const hayPedido = cantidad > 0 && !S\.cerrada/);
  assert.match(js,/\$\('btn-finalizar'\)\.hidden = !hayPedido/);
  assert.match(js,/\$\('barra-pedido'\)\.hidden = !hayPedido && \$\('whatsapp-local'\)\.hidden/);
});
