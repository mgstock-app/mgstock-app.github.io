import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read = p => readFileSync(p, 'utf8');
const source = read('public/stock/gestlok-nfc-qr.js');
const qrLib = (() => { const ctx = {}; vm.runInNewContext(read('public/vendor/qrcode-generator.js'), ctx); return ctx.qrcode; })();
const LIST = {
  scope: 'nfc_list', generated_at: '2026-10-31T16:00:00Z', destino_sin_activar: 'https://belisaparfum.mitiendanube.com/',
  placas: [
    {code: 'K7MPX2', numero: 1, cliente: 'Café <b>Norte</b>', destino: 'https://g.page/r/abc/review', nota: '', activa: true, escaneos: 12, escaneos_30d: 3, ultimo_escaneo: null},
    {code: 'QW3RTY', numero: 2, cliente: '', destino: null, nota: '', activa: false, escaneos: 0, escaneos_30d: 0, ultimo_escaneo: null}
  ]
};
function setup({creadora = true, rpc} = {}) {
  const listeners = {}, calls = [], toasts = [];
  let renders = 0;
  const window = {qrcode: qrLib, GestLokSupabase: {rpc: async (fn, args) => { calls.push([fn, args]); return rpc ? rpc(fn, args) : {data: fn === 'gestlok_nfc_list' ? structuredClone(LIST) : null, error: null}; }}};
  const document = {addEventListener(n, f) { (listeners[n] ||= []).push(f); }, querySelectorAll: () => [], querySelector: () => null, visibilityState: 'visible'};
  vm.runInNewContext(source, {window, document, queueMicrotask, setTimeout, clearTimeout, Date, URL, Blob, structuredClone});
  const m = window.GestLokNfcQr;
  m.attach({isCreadora: () => creadora, render: () => { renders++; }, toast: t => toasts.push(t)});
  const fire = (name, ev) => (listeners[name] || []).forEach(f => f(ev));
  return {m, calls, toasts, fire, renders: () => renders};
}
const tick = () => new Promise(r => setTimeout(r, 0));
const plain = v => JSON.parse(JSON.stringify(v)); // objetos creados dentro del contexto aislado
const btn = (act, data = {}) => ({preventDefault() {}, target: {closest: sel => sel === '[data-nfc-act]' ? {dataset: {nfcAct: act, ...data}} : null}});

test('Quien no es creadora no ve el panel ni consulta placas', async () => {
  const r = setup({creadora: false});
  assert.equal(r.m.view(), '');
  await tick();
  assert.equal(r.calls.length, 0);
});

test('La creadora carga sus placas, ve los totales y los textos llegan escapados', async () => {
  const r = setup();
  assert.match(r.m.view(), /Cargando placas/);
  await tick(); await tick();
  assert.deepEqual(r.calls.map(c => c[0]), ['gestlok_nfc_list']);
  const html = r.m.view();
  for (const t of ['NFC y QR', 'N° 001', 'K7MPX2', 'N° 002', 'Sin activar', 'Escaneos en 30 días', 'belisaparfum.mitiendanube.com', 'Crear placas', 'Cambiar destino', 'Activar'])
    assert.ok(html.includes(t), t);
  assert.ok(html.includes('Café &lt;b&gt;Norte&lt;/b&gt;') && !html.includes('<b>Norte</b>'));
  assert.equal(r.m.link('K7MPX2'), 'https://gestlok.com.ar/r/?K7MPX2');
});

test('Si el servidor rechaza el acceso, avisa sin mostrar placas', async () => {
  const r = setup({rpc: async () => ({data: null, error: {code: '42501', message: 'Acceso exclusivo de la creadora'}})});
  r.m.view(); await tick(); await tick();
  const html = r.m.view();
  assert.ok(html.includes('Solo la cuenta creadora') && !html.includes('N° 001'));
});

test('Crear placas valida la cantidad y llama al servidor una vez', async () => {
  const r = setup({rpc: async fn => ({data: fn === 'gestlok_nfc_create' ? {creadas: 5, desde: 3, hasta: 7} : structuredClone(LIST), error: null})});
  r.m.view(); await tick(); await tick();
  const form = cantidad => ({preventDefault() {}, target: {closest: () => ({dataset: {nfcForm: 'create'}, elements: {cantidad: {value: cantidad}}})}});
  r.fire('submit', form('0'));
  r.fire('submit', form('500'));
  await tick();
  assert.equal(r.calls.filter(c => c[0] === 'gestlok_nfc_create').length, 0);
  r.fire('submit', form('5'));
  await tick(); await tick();
  assert.deepEqual(plain(r.calls.find(c => c[0] === 'gestlok_nfc_create')[1]), {p_cantidad: 5});
  assert.ok(r.toasts.some(t => t.includes('003 a 007')));
});

test('Editar guarda el destino nuevo, completa https:// y no activa sin link', async () => {
  const r = setup({rpc: async (fn, a) => ({data: fn === 'gestlok_nfc_update' ? {...LIST.placas[1], cliente: a.p_cliente, destino: a.p_destino, activa: a.p_activa} : structuredClone(LIST), error: null})});
  r.m.view(); await tick(); await tick();
  r.fire('click', btn('edit', {code: 'QW3RTY'}));
  assert.ok(r.m.view().includes('data-nfc-form="edit"'));
  const input = (name, value, checked) => ({target: {name, value, checked, matches: () => false, closest: sel => sel === 'form[data-nfc-form="edit"]' ? {} : null}});
  const submit = {preventDefault() {}, target: {closest: () => ({dataset: {nfcForm: 'edit'}})}};
  r.fire('change', input('activa', 'on', true));
  r.fire('submit', submit);
  await tick();
  assert.equal(r.calls.filter(c => c[0] === 'gestlok_nfc_update').length, 0, 'sin destino no se activa');
  r.fire('input', input('cliente', 'Heladería Sur'));
  r.fire('input', input('destino', 'instagram.com/heladeriasur'));
  r.fire('submit', submit);
  await tick(); await tick();
  const [, args] = r.calls.find(c => c[0] === 'gestlok_nfc_update');
  assert.deepEqual(plain(args), {p_code: 'QW3RTY', p_cliente: 'Heladería Sur', p_destino: 'https://instagram.com/heladeriasur', p_nota: '', p_activa: true});
  const html = r.m.view();
  assert.ok(html.includes('Heladería Sur') && html.includes('https://instagram.com/heladeriasur') && !html.includes('data-nfc-form="edit"'));
});

test('El QR de cada placa se genera en el equipo con su link fijo', async () => {
  const r = setup();
  r.m.view(); await tick(); await tick();
  r.fire('click', btn('qr', {code: 'K7MPX2'}));
  const html = r.m.view();
  assert.ok(html.includes('https://gestlok.com.ar/r/?K7MPX2'));
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-label="QR de la placa N° 001"><rect[^>]+fill="#fff"\/><path d="M\d/);
});

test('La página pública /r/ solo resuelve el código y valida el link antes de abrirlo', () => {
  const page = read('public/r/index.html');
  assert.ok(page.includes('<script src="../stock/config.js"></script>'));
  assert.ok(page.includes("'/rest/v1/rpc/gestlok_nfc_resolve'"));
  assert.ok(page.includes(".replace(/[^A-Z0-9]/g, '')"));
  assert.ok(page.includes('URL_RE.test(url)') && page.includes('location.replace(url)'));
  assert.ok(page.includes('noindex') && !/innerHTML|eval\(/.test(page));
});

test('La base limita todo a la creadora y el público solo puede resolver códigos', () => {
  const sql = read('supabase/migrations/20261031163500_gestlok_nfc_qr_placas.sql');
  assert.ok(sql.includes("v_mail <> 'kmu15lopez@gmail.com'") && sql.includes('gestlok_platform.require_admin()'));
  assert.match(sql, /grant execute on function public\.gestlok_nfc_resolve\(text\) to anon, authenticated;/);
  assert.ok(!/gestlok_nfc_(list|create|update|set_fallback)[^;]*to anon/.test(sql.split('revoke all on function')[1]));
  const resolve = sql.slice(sql.indexOf('create or replace function public.gestlok_nfc_resolve'));
  assert.ok(!/cliente|nota/.test(resolve.slice(0, resolve.indexOf('end $$'))), 'resolve no devuelve datos del cliente');
});

test('La pestaña está en el panel de la creadora y los archivos se cargan en orden', () => {
  const home = read('public/stock/gestlok-creator-home.js');
  assert.ok(home.includes("['nfc', 'NFC y QR'") && home.includes("cur === 'nfc'") && home.includes('window.GestLokNfcQr?.attach?.(ctx)'));
  const rt = read('components/stock-runtime.tsx');
  const a = rt.indexOf('/vendor/qrcode-generator.js'), b = rt.indexOf('/stock/gestlok-nfc-qr.js'), c = rt.indexOf('/stock/gestlok-creator-home.js');
  assert.ok(a > 0 && a < b && b < c);
  const sw = read('scripts/sw-template.js');
  assert.ok(sw.includes("'/stock/gestlok-nfc-qr.js'") && sw.includes("'/vendor/qrcode-generator.js'"));
});
