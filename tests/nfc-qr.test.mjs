import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read = p => readFileSync(p, 'utf8');
const source = read('public/stock/gestlok-nfc-qr.js');
const qrLib = (() => { const ctx = {}; vm.runInNewContext(read('public/vendor/qrcode-generator.js'), ctx); return ctx.qrcode; })();
const A = 'com-a', B = 'com-b', A1 = 'suc-a1', A2 = 'suc-a2';
const LIST = {
  scope: 'nfc_list', version: 2, generated_at: '2026-11-02T16:00:00Z', destino_sin_activar: 'https://belisaparfum.mitiendanube.com/',
  comercios: [
    {id: A, nombre: 'Café <i>Norte</i>', destino: 'https://example.com/cafe', nota: '', sucursales: [
      {id: A1, nombre: 'Centro', destino: 'https://example.com/cafe-centro'}, {id: A2, nombre: 'Norte', destino: null}]},
    {id: B, nombre: 'Heladería Sur', destino: null, nota: '', sucursales: []}
  ],
  placas: [
    {code: 'K7MPX2', numero: 1, cliente: 'Mesa 4', etiqueta: 'Mesa 4', destino: null, nota: '', activa: true, escaneos: 12, escaneos_30d: 3, ultimo_escaneo: null,
      comercio_id: A, sucursal_id: A1, destino_efectivo: 'https://example.com/cafe-centro', origen: 'sucursal'},
    {code: 'QW3RTY', numero: 2, cliente: '', etiqueta: '', destino: null, nota: '', activa: false, escaneos: 0, escaneos_30d: 0, ultimo_escaneo: null,
      comercio_id: B, sucursal_id: null, destino_efectivo: null, origen: null},
    {code: 'ZX9CVB', numero: 3, cliente: '', etiqueta: '', destino: null, nota: '', activa: false, escaneos: 0, escaneos_30d: 0, ultimo_escaneo: null,
      comercio_id: null, sucursal_id: null, destino_efectivo: null, origen: null},
    {code: 'MN4BV8', numero: 4, cliente: '', etiqueta: '', destino: 'https://example.com/propio', nota: '', activa: true, escaneos: 1, escaneos_30d: 1, ultimo_escaneo: null,
      comercio_id: A, sucursal_id: A2, destino_efectivo: 'https://example.com/propio', origen: 'placa'}
  ]
};
function setup({creadora = true, rpc, confirm = () => true} = {}) {
  const listeners = {}, calls = [], toasts = [];
  const window = {qrcode: qrLib, confirm, GestLokSupabase: {rpc: async (fn, args) => {
    calls.push([fn, JSON.parse(JSON.stringify(args ?? null))]);
    if (rpc) { const r = await rpc(fn, args); if (r) return r; }
    return {data: fn === 'gestlok_nfc_list' ? structuredClone(LIST) : fn === 'gestlok_nfc_historial' ? [{at: '2026-11-02T15:00:00Z', accion: 'placa_creada', detalle: 'Placa N° 001 creada en Café', code: 'K7MPX2', numero: 1}] : {}, error: null};
  }}};
  const document = {addEventListener(n, f) { (listeners[n] ||= []).push(f); }, querySelectorAll: () => [], querySelector: () => null, visibilityState: 'visible'};
  vm.runInNewContext(source, {window, document, queueMicrotask, setTimeout, clearTimeout, Date, URL, Blob, structuredClone});
  const m = window.GestLokNfcQr;
  m.attach({isCreadora: () => creadora, render() {}, toast: t => toasts.push(t)});
  const fire = (name, ev) => (listeners[name] || []).forEach(f => f(ev));
  const ready = async () => { m.view(); await tick(); await tick(); };
  return {m, calls, toasts, fire, ready, fn: name => calls.filter(c => c[0] === name)};
}
const tick = () => new Promise(r => setTimeout(r, 0));
const btn = (act, data = {}) => ({preventDefault() {}, target: {closest: sel => sel === '[data-nfc-act]' ? {dataset: {nfcAct: act, ...data}} : null}});
const sel = (name, value) => ({type: 'change', target: {value, dataset: {nfcSel: name}, matches: () => false, closest: () => null}});
const field = (form, name, value, checked) => ({type: 'input', target: {name, value, checked, dataset: {}, matches: () => false,
  closest: s => s === 'form[data-nfc-form]' ? {dataset: {nfcForm: form}} : null}});
const submit = (form, elements = {}) => ({preventDefault() {}, target: {closest: () => ({dataset: {nfcForm: form}, elements})}});

test('Quien no es creadora no ve el panel ni consulta placas', async () => {
  const r = setup({creadora: false});
  assert.equal(r.m.view(), '');
  await tick();
  assert.equal(r.calls.length, 0);
});

test('La creadora ve comercios, sucursales, placas y de dónde sale cada link; los textos llegan escapados', async () => {
  const r = setup();
  assert.match(r.m.view(), /Cargando placas/);
  await r.ready();
  assert.deepEqual(r.calls.map(c => c[0]), ['gestlok_nfc_list']);
  const html = r.m.view();
  for (const t of ['NFC y QR', 'Comercios y sucursales', 'Nuevo comercio', 'Nueva sucursal', 'Heladería Sur', 'Centro', 'N° 001', 'K7MPX2',
    'link de la sucursal', 'link propio', 'Mesa 4', 'Crear placas', 'Todos los comercios', 'Sin comercio', 'Reasignar', 'Desactivar', 'Activar',
    'Historial', 'Descargar QR', 'Imprimir QR', 'Descargar lista'])
    assert.ok(html.includes(t), t);
  assert.ok(html.includes('Café &lt;i&gt;Norte&lt;/i&gt;') && !html.includes('<i>Norte</i>'), 'nombre escapado');
  assert.equal(r.m.link('K7MPX2'), 'https://gestlok.com.ar/r/?K7MPX2');
  assert.deepEqual({...r.m.state()}, {status: 'ready', placas: 4, comercios: 2});
});

test('Las placas de un comercio nunca muestran el link de Belisa; solo las que no tienen comercio', async () => {
  const r = setup();
  await r.ready();
  const html = r.m.view();
  const card = code => html.slice(html.indexOf('<code>' + code + '</code>'), html.indexOf('</article>', html.indexOf('<code>' + code + '</code>')));
  assert.ok(card('QW3RTY').includes('placa no activa') && !card('QW3RTY').includes('belisaparfum'));
  assert.ok(card('ZX9CVB').includes('belisaparfum'));
  assert.ok(html.includes('Placas sin comercio') && html.includes('Quitar'));
});

test('El filtro por comercio y sucursal arma la lista y las acciones en grupo usan solo esas placas', async () => {
  const r = setup();
  await r.ready();
  r.fire('change', sel('fcom', A));
  let html = r.m.view();
  assert.ok(html.includes('K7MPX2') && html.includes('MN4BV8') && !html.includes('<code>QW3RTY</code>'));
  r.fire('change', sel('fsuc', A1));
  html = r.m.view();
  assert.ok(html.includes('K7MPX2') && !html.includes('<code>MN4BV8</code>'));
  r.fire('click', btn('bulk-off'));
  await tick(); await tick();
  assert.deepEqual(r.fn('gestlok_nfc_activar')[0][1], {p_codes: ['K7MPX2'], p_activa: false});
});

test('Si la creadora no confirma, no se desactiva un grupo', async () => {
  const r = setup({confirm: () => false});
  await r.ready();
  r.fire('change', sel('fcom', A));
  r.fire('click', btn('bulk-off'));
  await tick();
  assert.equal(r.fn('gestlok_nfc_activar').length, 0);
});

test('Activar una placa sin ningún link abre el formulario en vez de llamar al servidor', async () => {
  const r = setup();
  await r.ready();
  r.fire('click', btn('on', {code: 'QW3RTY'}));
  assert.equal(r.fn('gestlok_nfc_activar').length, 0);
  const html = r.m.view();
  assert.ok(html.includes('data-nfc-form="edit"') && /name="activa" checked/.test(html));
  assert.ok(r.toasts.some(t => t.includes('Cargá el link')));
});

test('Crear placas valida la cantidad y manda comercio, sucursal y si van activas', async () => {
  const r = setup({rpc: async fn => fn === 'gestlok_nfc_crear_placas' ? {data: {creadas: 5, desde: 5, hasta: 9}, error: null} : null});
  await r.ready();
  r.fire('submit', submit('create', {cantidad: {value: '0'}}));
  r.fire('submit', submit('create', {cantidad: {value: '500'}}));
  await tick();
  assert.equal(r.fn('gestlok_nfc_crear_placas').length, 0);
  r.fire('change', sel('mkcom', A));
  r.fire('change', sel('mksuc', A1));
  r.fire('change', {type: 'change', target: {checked: true, value: 'on', dataset: {nfcSel: 'mkact'}, matches: () => false, closest: () => null}});
  r.fire('submit', submit('create', {cantidad: {value: '5'}}));
  await tick(); await tick();
  assert.deepEqual(r.fn('gestlok_nfc_crear_placas')[0][1], {p_cantidad: 5, p_comercio: A, p_sucursal: A1, p_activar: true});
  assert.ok(r.toasts.some(t => t.includes('005 a 009') && t.includes('Café')));
});

test('Sin comercio, las placas nuevas nunca se crean activas', async () => {
  const r = setup({rpc: async fn => fn === 'gestlok_nfc_crear_placas' ? {data: {creadas: 1, desde: 5, hasta: 5}, error: null} : null});
  await r.ready();
  r.fire('change', sel('mkcom', A));
  r.fire('change', {type: 'change', target: {checked: true, value: 'on', dataset: {nfcSel: 'mkact'}, matches: () => false, closest: () => null}});
  r.fire('change', sel('mkcom', ''));
  r.fire('submit', submit('create', {cantidad: {value: '1'}}));
  await tick(); await tick();
  assert.deepEqual(r.fn('gestlok_nfc_crear_placas')[0][1], {p_cantidad: 1, p_comercio: null, p_sucursal: null, p_activar: false});
});

test('Editar guarda el link propio (o lo deja vacío para usar el de la sucursal) sin cambiar el código', async () => {
  const r = setup({rpc: async (fn, a) => fn === 'gestlok_nfc_update' ? {data: {...LIST.placas[0], cliente: a.p_cliente, etiqueta: a.p_cliente, destino: a.p_destino, activa: a.p_activa}, error: null} : null});
  await r.ready();
  r.fire('click', btn('edit', {code: 'K7MPX2'}));
  assert.ok(r.m.view().includes('usa el link de su sucursal'));
  r.fire('input', field('edit', 'destino', 'instagram.com/cafe'));
  r.fire('input', field('edit', 'etiqueta', 'Mesa 5'));
  r.fire('submit', submit('edit'));
  await tick();
  assert.deepEqual(r.fn('gestlok_nfc_update')[0][1], {p_code: 'K7MPX2', p_cliente: 'Mesa 5', p_destino: 'https://instagram.com/cafe', p_nota: '', p_activa: true});
  r.fire('click', btn('edit', {code: 'K7MPX2'}));
  r.fire('input', field('edit', 'destino', 'javascript:alert(1)'));
  r.fire('submit', submit('edit'));
  await tick();
  assert.equal(r.fn('gestlok_nfc_update').length, 1, 'un link inválido no llega al servidor');
});

test('Reasignar manda las placas al comercio y sucursal elegidos', async () => {
  const r = setup({rpc: async fn => fn === 'gestlok_nfc_reasignar' ? {data: {movidas: 1, desactivadas: 1}, error: null} : null});
  await r.ready();
  r.fire('click', btn('reasign', {code: 'K7MPX2'}));
  assert.ok(r.m.view().includes('data-nfc-form="reasign"'));
  r.fire('change', sel('rcom', B));
  r.fire('submit', submit('reasign'));
  await tick(); await tick();
  assert.deepEqual(r.fn('gestlok_nfc_reasignar')[0][1], {p_codes: ['K7MPX2'], p_comercio: B, p_sucursal: null});
  assert.ok(r.toasts.some(t => t.includes('Heladería Sur') && t.includes('desactivada')));
});

test('Comercios y sucursales se crean y editan con su propio link', async () => {
  const r = setup({rpc: async (fn, a) => fn === 'gestlok_nfc_comercio_guardar' ? {data: {id: 'com-c', nombre: a.p_nombre}, error: null}
    : fn === 'gestlok_nfc_sucursal_guardar' ? {data: {id: 'suc-x', nombre: a.p_nombre}, error: null} : null});
  await r.ready();
  r.fire('click', btn('com-new'));
  r.fire('input', field('com', 'nombre', 'Panadería Este'));
  r.fire('input', field('com', 'destino', 'g.page/r/panaderia/review'));
  r.fire('submit', submit('com'));
  await tick(); await tick();
  assert.deepEqual(r.fn('gestlok_nfc_comercio_guardar')[0][1], {p_id: null, p_nombre: 'Panadería Este', p_destino: 'https://g.page/r/panaderia/review', p_nota: ''});
  r.fire('click', btn('suc-edit', {id: A1, com: A}));
  r.fire('input', field('suc', 'destino', ''));
  r.fire('submit', submit('suc'));
  await tick(); await tick();
  assert.deepEqual(r.fn('gestlok_nfc_sucursal_guardar')[0][1], {p_id: A1, p_comercio: A, p_nombre: 'Centro', p_destino: null});
});

test('El historial se pide por placa y por comercio', async () => {
  const r = setup();
  await r.ready();
  r.fire('click', btn('hist', {code: 'K7MPX2'}));
  await tick(); await tick();
  assert.deepEqual(r.fn('gestlok_nfc_historial')[0][1], {p_code: 'K7MPX2', p_comercio: null, p_limit: 100});
  assert.ok(r.m.view().includes('Placa N° 001 creada en Café'));
  r.fire('click', btn('com-hist', {id: A}));
  await tick();
  assert.deepEqual(r.fn('gestlok_nfc_historial')[1][1], {p_code: null, p_comercio: A, p_limit: 200});
});

test('El link general de placas sin comercio se puede quitar', async () => {
  const r = setup({rpc: async fn => fn === 'gestlok_nfc_set_fallback' ? {data: null, error: null} : null});
  await r.ready();
  r.fire('click', btn('fb-clear'));
  await tick();
  assert.deepEqual(r.fn('gestlok_nfc_set_fallback')[0][1], {p_destino: null});
  assert.ok(r.m.view().includes('Ningún link'));
});

test('Si el servidor rechaza el acceso, avisa sin mostrar placas', async () => {
  const r = setup({rpc: async () => ({data: null, error: {code: '42501', message: 'Acceso exclusivo de la creadora'}})});
  await r.ready();
  const html = r.m.view();
  assert.ok(html.includes('Solo la cuenta creadora') && !html.includes('N° 001'));
});

test('El QR es un SVG con el link fijo de la placa', async () => {
  const r = setup();
  await r.ready();
  r.fire('click', btn('qr', {code: 'K7MPX2'}));
  const html = r.m.view();
  assert.ok(html.includes('https://gestlok.com.ar/r/?K7MPX2') && html.includes('Descargar SVG') && html.includes('Descargar PNG'));
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-label="QR de la placa N° 001"><rect[^>]+fill="#fff"\/><path transform="translate\(4 4\)" d="M\d/);
});

test('La página pública /r/ usa la función nueva, valida el link y avisa si la placa no está activa', () => {
  const page = read('public/r/index.html');
  assert.ok(page.includes('<script src="../stock/config.js"></script>'));
  assert.ok(page.includes("rpc('gestlok_nfc_abrir')") && page.includes("rpc('gestlok_nfc_resolve')"));
  assert.ok(page.includes(".replace(/[^A-Z0-9]/g, '')"));
  assert.ok(page.includes('URL_RE.test(url)') && page.includes('location.replace(url)'));
  assert.ok(page.includes('Esta placa no está activa') && page.includes('no corresponde a ninguna placa'));
  assert.ok(page.includes('noindex') && !/innerHTML|eval\(/.test(page) && !/belisa/i.test(page));
});

test('La base limita todo a la creadora, el público solo abre códigos y Belisa deja de ser el valor por defecto', () => {
  const sql = read('supabase/migrations/20261102213000_gestlok_nfc_comercios_sucursales.sql');
  const grants = sql.slice(sql.indexOf('-- 7. Permisos'));
  assert.match(grants, /grant execute on function public\.gestlok_nfc_resolve\(text\), public\.gestlok_nfc_abrir\(text\) to anon, authenticated;/);
  assert.ok(!/(list|guardar|crear_placas|activar|reasignar|historial|set_fallback|update)\([^)]*\)[^;]*to anon/.test(grants.replace(/grant execute on function public\.gestlok_nfc_resolve[^;]*;/, '')));
  assert.ok(sql.includes('alter column destino_sin_activar drop default') && !/insert into gestlok_nfc_private\.ajustes/.test(sql));
  assert.ok(!/delete from|drop table|truncate/i.test(sql), 'la migración no borra datos');
  const abrir = sql.slice(sql.indexOf('create or replace function gestlok_nfc_private.abrir'), sql.indexOf('-- 6. Funciones públicas'));
  assert.ok(/'estado', 'inactiva'/.test(abrir) && /v_row\.comercio_id is null/.test(abrir) && !/'(nombre|cliente|nota|comercio)'/.test(abrir));
  const old = read('supabase/migrations/20261031163500_gestlok_nfc_qr_placas.sql');
  assert.ok(old.includes("v_mail <> 'kmu15lopez@gmail.com'") && old.includes('gestlok_platform.require_admin()'));
});

test('La pestaña está en el panel de la creadora y los archivos se cargan en orden', () => {
  const home = read('public/stock/gestlok-creator-home.js');
  assert.ok(home.includes("['nfc', 'NFC y QR'") && home.includes("cur === 'nfc'") && home.includes('window.GestLokNfcQr?.attach?.(ctx)'));
  const rt = read('components/stock-runtime.tsx');
  const a = rt.indexOf('/vendor/qrcode-generator.js'), b = rt.indexOf('/stock/gestlok-nfc-qr.js'), c = rt.indexOf('/stock/gestlok-creator-home.js');
  assert.ok(a > 0 && a < b && b < c);
  assert.ok(rt.includes('/stock/gestlok-nfc-qr.js?rev=nfc-comercios-20261102'));
  const sw = read('scripts/sw-template.js');
  assert.ok(sw.includes("'/stock/gestlok-nfc-qr.js'") && sw.includes("'/vendor/qrcode-generator.js'"));
});
