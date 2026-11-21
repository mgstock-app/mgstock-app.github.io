import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('GESTLOK Chat usa un logo propio, pequeño y no vinculado a una tienda',()=>{
  const logo=read('public/chat/gestlok-monograma.svg');
  const script=read('public/chat/chat.js');
  const css=read('public/chat/chat.css');
  assert.match(logo, /viewBox="0 0 400 440"/);
  assert.match(logo, /fill="#19345c"/g);
  assert.match(script, /src: '\/chat\/gestlok-monograma\.svg'/);
  assert.match(script, /'CHAT DE ' \+ marca/, 'el nombre del comercio se mantiene individual');
  assert.match(script, /S\.sucursal\?\.empresa \|\| S\.sucursal\?\.nombre/);
  assert.doesNotMatch(script, /bienvenida-icono', 'aria-hidden': true, text: '✦'/);
  assert.match(css, /\.chat-bienvenida \.bienvenida-icono img\{/);
  assert.match(css, /width:60px;height:66px/);
});

test('fondo profesional predeterminado sin motivos repetidos y con buen contraste',()=>{
  const css=read('public/chat/chat.css');
  const wallpaper=read('public/chat/wallpaper-gestlok.svg');
  assert.match(wallpaper, /viewBox="0 0 900 1400"/);
  assert.match(wallpaper, /linearGradient/);
  assert.doesNotMatch(wallpaper, /<text|<image|http:|https:|filter=|foreignObject/);
  assert.match(css, /\.mensajes\{[\s\S]*?background-image:url\('\/chat\/wallpaper-gestlok\.svg'\)/);
  assert.match(css, /background-size:cover/);
  assert.match(css, /background-repeat:no-repeat/);
  assert.match(css, /\.burbuja\.asistente:not\(\.chat-bienvenida\)\{background:#f2f5f9\}/);
  assert.match(css, /\.burbuja\.cliente\{[^}]*background:var\(--acento\)/);
  assert.match(css, /@media\(max-width:430px\)/);
});

test('navegadores cargan nueva marca sin alterar pedidos ni acceso a WhatsApp',()=>{
  const page=read('public/chat/index.html');
  const script=read('public/chat/chat.js');
  const css=read('public/chat/chat.css');
  assert.match(page, /chat\/chat\.css\?v=20261121marca1/);
  assert.match(page, /chat\/chat\.js\?v=20261121marca1/);
  assert.match(page, /chat\/gestlok-monograma\.svg" type="image\/svg\+xml"/);
  assert.match(page, /id="whatsapp-local" class="chat-whatsapp"/);
  assert.match(css, /right:max\(12px,calc\(\(100vw - 720px\)\/2 \+ 12px\)\)/);
  assert.match(script, /'https:\/\/wa\.me\/' \+ telefono/);
});
