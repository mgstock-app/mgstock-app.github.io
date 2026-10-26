import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const { detect, plan, body } = require('../public/stock/gestlok-install.js');

const UA = {
  pixelChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 Instagram 400.0.0.0.0 Android',
  iphone18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphone26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1',
  instagramIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0.0 (iPhone15,2; iOS 18_6)',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
};
const kind = (ua, extra = {}) => plan(detect({ ua, ...extra }));

test('Android: con el permiso del navegador el botón instala con un toque', () => {
  assert.equal(kind(UA.pixelChrome, { prompt: true }), 'prompt');
  assert.equal(kind(UA.samsung, { prompt: true }), 'prompt');
  // Todavía sin permiso: espera unos segundos y muestra el botón apenas llega (o los pasos del menú).
  assert.equal(kind(UA.pixelChrome), 'android-wait');
  assert.equal(kind(UA.samsung), 'android-wait');
  assert.equal(kind(UA.firefoxAndroid), 'android-manual');
  assert.equal(kind(UA.instagramAndroid), 'inapp');
  assert.equal(kind(UA.instagramAndroid, { prompt: true }), 'inapp');
});

test('iPhone y iPad: pasos de Safari según la versión, y otros navegadores o apps', () => {
  assert.equal(kind(UA.iphone18), 'ios-safari');
  assert.equal(detect({ ua: UA.iphone18 }).ios26, false);
  assert.equal(detect({ ua: UA.iphone26 }).ios26, true);
  assert.equal(kind(UA.ipadDesktop, { platform: 'MacIntel', touch: 5 }), 'ios-safari');
  assert.equal(detect({ ua: UA.ipadDesktop, platform: 'MacIntel', touch: 5 }).ipad, true);
  assert.equal(kind(UA.chromeIos), 'ios-browser');
  assert.equal(kind(UA.instagramIos), 'inapp');
  const s26 = body('ios-safari', detect({ ua: UA.iphone26 }));
  assert.match(s26, /⋯/); assert.match(s26, /Compartir/); assert.match(s26, /Agregar a pantalla de inicio/); assert.match(s26, /Abrir como app web/);
  const s18 = body('ios-safari', detect({ ua: UA.iphone18 }));
  assert.match(s18, /en la barra de abajo/); assert.doesNotMatch(s18, /Abrir como app web/);
  assert.match(body('inapp', detect({ ua: UA.instagramIos })), /Safari/);
  assert.match(body('inapp', detect({ ua: UA.instagramAndroid })), /intent:\/\/.*package=com\.android\.chrome/);
});

test('Computadora: no instala en la PC al tocar «en el celular»; ofrece las dos cosas', () => {
  assert.equal(kind(UA.desktopChrome, { prompt: true }), 'desktop');
  assert.equal(kind(UA.macSafari), 'desktop');
  assert.match(body('desktop', detect({ ua: UA.macSafari })), /Agregar al Dock/);
  assert.equal(kind(UA.pixelChrome, { prompt: true, standalone: true }), 'standalone');
});

function fakeWindow(ua) {
  const w = new EventTarget();
  Object.assign(w, {
    navigator: { userAgent: ua, platform: 'Linux armv8l', maxTouchPoints: 5 },
    location: { origin: 'https://mgstock-app.github.io', pathname: '/' },
    matchMedia: () => ({ matches: false }),
    setTimeout, clearTimeout, Event, Promise,
    document: { addEventListener() {}, querySelector: () => null },
  });
  w.window = w;
  return vm.createContext(w);
}

test('El aviso del navegador se guarda apenas abre la página y el botón abre la ventana nativa', async () => {
  const layout = read('app/layout.tsx');
  assert.ok(layout.includes('import { INSTALL_CAPTURE } from "@/lib/install-capture"'));
  assert.ok(layout.includes('<head><script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE }} />'), 'la captura va primera en <head>');
  const capture = JSON.parse('"' + /INSTALL_CAPTURE =\s*([\s\S]*?);\n/.exec(read('lib/install-capture.ts'))[1].replace(/"\s*\+\s*"/g, '').replace(/^"|"$/g, '') + '"');
  const w = fakeWindow(UA.pixelChrome);
  vm.runInContext(capture, w);
  let prompted = 0, prevented = 0;
  const evt = new Event('beforeinstallprompt');
  evt.preventDefault = () => { prevented++; };
  evt.prompt = () => { prompted++; return Promise.resolve(); };
  evt.userChoice = Promise.resolve({ outcome: 'accepted' });
  let ready = 0; w.addEventListener('gestlok-install-ready', () => ready++);
  w.dispatchEvent(evt); // llega antes de que carguen los demás archivos
  assert.equal(prevented, 1); assert.equal(ready, 1); assert.equal(w.__glInstall.evt, evt);
  vm.runInContext(read('public/stock/gestlok-install.js'), w);
  assert.equal(w.GestLokInstall.available(), true);
  const toasts = []; let panels = 0;
  const r = w.GestLokInstall.open({ openPanel: () => panels++, closePanel() {}, toast: m => toasts.push(m), isOpen: () => false });
  assert.equal(r, 'prompt'); assert.equal(prompted, 1, 'ventana del sistema abierta en el mismo toque'); assert.equal(panels, 0);
  await new Promise(res => setTimeout(res, 10));
  assert.match(toasts[0], /Instalando GestLok/);
  assert.equal(w.GestLokInstall.available(), false, 'el permiso se usa una sola vez');
  w.dispatchEvent(new Event('appinstalled'));
  assert.equal(w.__glInstall.installed, true);
  // Sin permiso: muestra el panel con espera y los pasos del menú.
  const r2 = w.GestLokInstall.open({ openPanel: h => { panels++; assert.match(h, /Preparando la instalación/); assert.match(h, /Instalar app/); }, closePanel() {}, toast() {}, isOpen: () => false });
  assert.equal(r2, 'panel'); assert.equal(panels, 1);
});

test('Cableado: app.js, carga, service worker y demo', () => {
  const app = read('public/stock/app.js');
  assert.ok(app.includes('window.GestLokInstall'));
  assert.ok(!app.includes("addEventListener('beforeinstallprompt'"), 'un solo lugar escucha el aviso');
  const runtime = read('components/stock-runtime.tsx');
  assert.ok(runtime.indexOf('/stock/gestlok-install.js') > 0 && runtime.indexOf('/stock/gestlok-install.js') < runtime.indexOf('/stock/app.js'));
  assert.ok(read('scripts/sw-template.js').includes("'/stock/gestlok-install.js'"));
  assert.ok(!read('public/stock/gestlok-visitor-demo.js').includes("'install','backup'"), 'en la demo el botón funciona igual');
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(i => i.sizes === '192x192') && manifest.icons.some(i => i.sizes === '512x512'));
  assert.equal(manifest.prefer_related_applications, false);
  assert.ok(manifest.related_applications.some(a => a.platform === 'webapp'));
});
