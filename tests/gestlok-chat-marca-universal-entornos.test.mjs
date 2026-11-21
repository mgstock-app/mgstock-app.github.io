import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('todas las sucursales reutilizan el monograma y fondo aprobado',()=>{
  const js=read('public/chat/chat.js'),css=read('public/chat/chat.css');
  const html=read('public/chat/index.html');
  assert.match(js,/src: '\/chat\/gestlok-monograma\.svg'/);
  assert.match(js,/'CHAT DE ' \+ marca/);
  assert.match(js,/S\.sucursal\?\.empresa \|\| S\.sucursal\?\.nombre/);
  assert.doesNotMatch(js,/bienvenida-icono', 'aria-hidden': true, text: '✦'/);
  assert.match(css,/background-image:url\('\/chat\/wallpaper-gestlok\.svg\?v=20261121contraste1'\)/);
  assert.match(css,/background-repeat:no-repeat/);
  assert.match(html,/chat\.css\?v=20261121bordes1/);
  assert.match(html,/chat\.js\?v=20261121marca1/);
  assert.match(html,/chat\/gestlok-monograma\.svg" type="image\/svg\+xml"/);
  assert.doesNotMatch(js,/slug\s*===?\s*['"]mi-gusto-/);
});
test('demo y Testing copian los mismos archivos estáticos para cualquier local',()=>{
  const build=read('entornos/construir.mjs');
  assert.match(build,/carpetas: \['chat'\]/);
  assert.match(build,/for \(const app of MICROAPPS\)/);
  assert.match(build,/cpSync\(origen, destino\)/);
  for(const name of ['gestlok-monograma.svg','wallpaper-gestlok.svg']){
    const file=read('public/chat/'+name);
    assert.match(file,/<svg\b/);
    assert.doesNotMatch(file,/<script\b|<foreignObject\b|xlink:href/);
  }
});
test('gerente, PWA y Central comparten el logo, sin afectar panel operativo',()=>{
  const p=read('public/chat/panel/panel.js');
  const css=read('public/chat/panel/panel.css');
  const page=read('public/chat/panel/index.html');
  const m=JSON.parse(read('public/chat/manifest.webmanifest'));
  const central=read('public/stock/gestlok-chat-central.js');
  const runtime=read('components/stock-runtime.tsx');
  assert.match(p,/tope-marca/);
  assert.match(p,/gestlok-monograma\.svg/);
  assert.match(css,/\.hilo\{[\s\S]*?background-image:url\('\/chat\/wallpaper-gestlok\.svg\?v=20261121contraste1'\)/);
  assert.match(page,/panel\.js\?v=20261121marca2/);
  assert.match(central,/VERSION_PANEL='20261121marca2'/);
  assert.match(runtime,/chat-marca-20261121/);
  assert.ok(m.icons.some(i=>i.src==='/chat/gestlok-monograma.svg' && i.type==='image/svg+xml'));
  assert.ok(m.icons.some(i=>i.sizes==='192x192'));
});

test('fondo legible y líneas laterales visibles en ventanas de escritorio compactas',()=>{
  const css=read('public/chat/chat.css');
  const wallpaper=read('public/chat/wallpaper-gestlok.svg');
  const panel=read('public/chat/panel/index.html');
  const panelCss=read('public/chat/panel/panel.css');
  const panelJs=read('public/chat/panel/panel.js');
  assert.match(css,/background:#e7edf3/);
  assert.match(css,/@media\(min-width:620px\)/);
  assert.match(css,/border-left:2px solid #9eafc2/);
  assert.match(css,/border-right:2px solid #9eafc2/);
  assert.match(css,/background-color:#eaf0f6/);
  assert.match(wallpaper,/#cddce9/);
  assert.match(wallpaper,/#dce6f0/);
  assert.match(panelCss,/wallpaper-gestlok\.svg\?v=20261121contraste1/);
  assert.match(panel,/panel\.css\?v=20261121bordes1/);
  assert.match(panelJs,/VERSION_CSS = '20261121bordes1'/);
});
