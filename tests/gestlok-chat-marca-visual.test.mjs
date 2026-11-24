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
  assert.doesNotMatch(wallpaper, /<text\\b|<image\\b|<foreignObject\\b|<filter\\b|<script\\b|xlink:href/);
  assert.match(css, /\.mensajes\{[\s\S]*?background-image:url\('\/chat\/wallpaper-gestlok\.svg\?v=20261121contraste1'\)/);
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
  assert.match(page, /chat\/chat\.css\?v=20261122vermenu2/);
  assert.match(page, /chat\/chat\.js\?v=20261124promos1/);
  assert.match(page, /chat\/gestlok-monograma\.svg" type="image\/svg\+xml"/);
  assert.match(page, /id="whatsapp-local" class="chat-whatsapp"/);
  assert.match(css, /\.chat-whatsapp\{[\s\S]*?position:static/);
  assert.match(script, /'https:\/\/wa\.me\/' \+ telefono/);
});

test('panel del gerente conserva su interfaz de trabajo y adopta la identidad de GESTLOK Chat',()=>{
  const panel=read('public/chat/panel/panel.js');
  const styles=read('public/chat/panel/panel.css');
  const page=read('public/chat/panel/index.html');
  const manifest=JSON.parse(read('public/chat/manifest.webmanifest'));
  assert.match(panel, /class: 'tope-marca', src: '\/chat\/gestlok-monograma\.svg'/);
  assert.match(styles, /\.hilo\{[\s\S]*?background-image:url\('\/chat\/wallpaper-gestlok\.svg\?v=20261121contraste1'\)/);
  assert.match(styles, /\.embebido \.tope-marca\{display:none\}/);
  assert.match(page, /chat\/gestlok-monograma\.svg/);
  assert.ok(manifest.icons.some(i=>i.src==='/chat/gestlok-monograma.svg' && i.type==='image/svg+xml'));
  assert.ok(manifest.icons.some(i=>i.sizes==='192x192'), 'mantener el respaldo PNG compatible');
});

test('el fondo y los bordes laterales se distinguen en escritorio sin afectar la vista móvil',()=>{
  const css=read('public/chat/chat.css');
  const wallpaper=read('public/chat/wallpaper-gestlok.svg');
  const page=read('public/chat/index.html');
  const panel=read('public/chat/panel/panel.css');
  const panelPage=read('public/chat/panel/index.html');
  const panelScript=read('public/chat/panel/panel.js');

  assert.match(css, /html,body\{[^}]*background:#e7edf3/);
  assert.match(css, /@media\(min-width:620px\)\{\s*\.app\{/);
  assert.match(css, /border-left:2px solid #9eafc2/);
  assert.match(css, /border-right:2px solid #9eafc2/);
  assert.match(css, /box-shadow:-9px 0 22px/);
  assert.match(css, /@media\(max-width:619px\)\{html,body\{background:#f3f5f8\}\}/);
  assert.match(css, /background-color:#eaf0f6/);
  assert.match(css, /wallpaper-gestlok\.svg\?v=20261121contraste1/);
  assert.match(panel, /wallpaper-gestlok\.svg\?v=20261121contraste1/);
  assert.match(page, /chat\.css\?v=20261122vermenu2/);
  assert.match(panelPage, /panel\.css\?v=20261123gerentes1/);
  assert.match(panelScript, /VERSION_CSS = '20261123gerentes1'/);
  assert.match(wallpaper, /stop-color="#cddce9"/);
  assert.match(wallpaper, /stop-color="#dce6f0"/);
  assert.doesNotMatch(wallpaper, /<script\b|<image\b|<foreignObject\b/);
});
