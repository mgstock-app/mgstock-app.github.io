import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('gestlok.com.ar/wai es la app única e instalable de GESTLOK WAI',()=>{
  const html=read('public/wai/index.html'),m=JSON.parse(read('public/wai/manifest.webmanifest')),sw=read('public/wai/sw.js'),inst=read('public/wai/instalar.js'),js=read('public/chat/wai/wai.js');
  assert.match(html,/rel="manifest" href="\/wai\/manifest\.webmanifest"/);assert.match(html,/\/chat\/config\.js/);assert.doesNotMatch(html,/prueba\/config\.js/);
  assert.match(html,/\/chat\/wai\/wai\.js/);assert.match(html,/\/wai\/instalar\.js/);assert.match(html,/apple-touch-icon/);
  assert.equal(m.start_url,'/wai/');assert.equal(m.scope,'/wai/');assert.equal(m.display,'standalone');assert.ok(m.icons.some(i=>i.sizes==='512x512'));assert.ok(m.icons.some(i=>i.sizes==='192x192'));
  assert.match(inst,/register\('\/wai\/sw\.js',\{scope:'\/wai\/'\}\)/);assert.match(inst,/beforeinstallprompt/);assert.match(inst,/Agregar a inicio/);
  assert.doesNotMatch(sw,/caches\.open|cache\.put/,'no guarda conversaciones ni pedidos en el equipo');
  assert.match(js,/appRoute\?'\/wai\/'/);
  assert.match(js,/propios\.length===1/,'con un solo local autorizado entra directo');
  assert.match(js,/'Mis locales'/,'con varios locales puede cambiar de local');
  assert.match(js,/Vas a ver solo los locales que tenés autorizados/);
});
test('la demo pública quedó en /wai/demo/',()=>{
  const h=read('public/wai/demo/index.html');
  assert.match(h,/\/wai\/demo\/wai-demo\.js/);assert.match(h,/href="\/wai\/"/);
});
