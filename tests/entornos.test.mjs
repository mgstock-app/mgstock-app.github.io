// Entornos prueba/testing: el sitio apunta SIEMPRE a la base de pruebas y lleva el aviso del entorno.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const cfg = JSON.parse(readFileSync('entornos/entornos.json', 'utf8'));
for (const entorno of ['prueba', 'testing']) {
  test('entorno ' + entorno + ': base de pruebas, función propia y aviso', () => {
    const out = mkdtempSync(join(tmpdir(), 'entorno-'));
    execFileSync('node', ['entornos/construir.mjs', out], {env: {...process.env, ENTORNO: entorno}});
    const config = readFileSync(join(out, 'chat/config.js'), 'utf8');
    assert.match(config, new RegExp(cfg.pruebas.ref));
    assert.match(config, new RegExp('gestlok-chat-' + entorno));
    assert.doesNotMatch(config, new RegExp(cfg.real.ref));
    for (const f of ['chat/index.html', 'chat/panel/index.html', 'chat/chat.js', 'chat/panel/panel.js', 'chat/cliente-push.js']) {
      assert.doesNotMatch(readFileSync(join(out, f), 'utf8'), new RegExp(cfg.real.ref), f);
    }
    assert.match(readFileSync(join(out, 'chat/index.html'), 'utf8'), /entorno\.js/);
    assert.match(readFileSync(join(out, 'entorno.js'), 'utf8'), new RegExp(cfg.entornos[entorno].boton));
    assert.ok(existsSync(join(out, 'ingresar/index.html')));
    const ingreso = readFileSync(join(out, 'ingresar/index.html'), 'utf8');
    // Un fallo previo ejecutaba signInWithPassword antes de cargar Supabase y config.
    const indices = [
      ingreso.indexOf('id="f"'),
      ingreso.indexOf('<script src="/vendor/supabase.js"></script>'),
      ingreso.indexOf('<script src="/chat/config.js"></script>'),
      ingreso.indexOf('<script>(function(){var m=document.getElementById("m"),C=window.GESTLOK_CHAT_CONFIG'),
    ];
    assert.ok(indices.every(i => i >= 0), 'formulario y dependencias deben existir');
    assert.deepEqual(indices, [...indices].sort((a, b) => a - b),
      'formulario → Supabase → config → inicialización, en este orden');
    assert.ok(ingreso.indexOf('</head>') < indices[0], 'el formulario debe estar en el body');
    assert.match(ingreso, /No se pudo iniciar el acceso de pruebas/);
    assert.match(ingreso, /No se pudo conectar con la base de pruebas/);
    assert.match(ingreso, /typeof window\.supabase\.createClient/);
  });
}
test('demo dividida muestra sucursal elegida sin usar catálogos ni credenciales reales', () => {
  const cliente = readFileSync('public/chat/chat.js', 'utf8');
  const gerente = readFileSync('public/chat/panel/panel.js', 'utf8');
  for (const texto of [cliente, gerente]) {
    assert.match(texto, /SHOWROOM_SUCURSAL/,
      'sólo la simulación debe adaptar los nombres de local');
    assert.match(texto, /mi-gusto-munro/);
    assert.match(texto, /mi-gusto-torcuato/);
    assert.match(texto, /Mi Gusto · DEMOSTRACIÓN/);
  }
  assert.match(cliente, /if \(SHOWROOM_SUCURSAL\)/,
    'la vista pública normal no altera su identidad');
  assert.match(gerente, /if \(SHOWROOM\)/,
    'el gerente normal no altera su lista de sucursales');
});

test('otras ramas no publican GESTLOK', () => {
  const out = mkdtempSync(join(tmpdir(), 'entorno-'));
  execFileSync('node', ['entornos/construir.mjs', out], {env: {...process.env, ENTORNO: 'main', CF_PAGES_BRANCH: ''}});
  assert.ok(!existsSync(join(out, 'chat')));
});

test('CI bloquea promociones si falta permiso o si Cloudflare no publicó cada etapa', () => {
  const workflow=readFileSync('.github/workflows/entornos.yml','utf8');
  const backend=readFileSync('entornos/backend.mjs','utf8');
  assert.match(workflow,/::error title=Entorno incompleto/);
  assert.doesNotMatch(workflow,/Falta el secreto SUPABASE_ACCESS_TOKEN[^\n]*exit 0/);
  assert.match(workflow,/gestlok-prueba\.vercel\.app/);
  assert.match(workflow,/gestlok-testing\.vercel\.app/);
  assert.match(workflow,/gestlok-chat-testing/);
  assert.match(workflow,/SUPABASE_PROD_READ_TOKEN/);
  assert.match(backend,/const PROD_READ_TOKEN = process\.env\.SUPABASE_PROD_READ_TOKEN/);
  assert.match(backend,/if \(!PROD_READ_TOKEN\)/);
  assert.match(backend,/authorization: 'Bearer ' \+ PROD_READ_TOKEN/);
  assert.match(workflow,/Pedido de publicación testing/);
});

test('base de pruebas: docs no queda expuesto por el Data API', () => {
  const schema=readFileSync('entornos/sql/base-pruebas.sql','utf8');
  assert.match(schema,/alter table public\.docs enable row level security/i);
  assert.match(schema,/revoke all on table public\.docs from anon, authenticated/i);
  assert.match(schema,/grant select, insert, update, delete on table public\.docs to service_role/i);
});

test('Prueba: catálogo ficticio reproducible y restringido a base aislada', () => {
  const indice = readFileSync('entornos/sql.txt', 'utf8');
  const menu = readFileSync('entornos/sql/catalogo-demo.sql', 'utf8');
  assert.match(indice, /entornos\/sql\/semilla\.sql\n(?:[^\n]*\n)*entornos\/sql\/catalogo-demo\.sql/);
  assert.match(menu, /to_regclass\('entorno_control\.sql_aplicado'\)/);
  assert.match(menu, /MIGUSTO-PRUEBA/);
  assert.match(menu, /Pack DEMO/);
  assert.match(menu, /on conflict \(sucursal_id,nombre\) do nothing/);
  assert.doesNotMatch(menu, new RegExp(cfg.real.ref), 'ningún identificador de producción');
});

test('pantalla dividida: cliente y gerente en la misma pantalla, sin aviso repetido', async () => {
  const {execFileSync} = await import('node:child_process');
  const {mkdtempSync, readFileSync: leer} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join: unir} = await import('node:path');
  for (const entorno of ['prueba', 'testing']) {
    const out = mkdtempSync(unir(tmpdir(), 'dividida-'));
    execFileSync('node', ['entornos/construir.mjs', out], {env: {...process.env, ENTORNO: entorno}});
    const html = leer(unir(out, 'dividida/index.html'), 'utf8');
    assert.match(html, /id="cliente"/);
    assert.match(html, /id="gerente"/);
    assert.match(html, /\/chat\/\?demo=1&showroom=1&s=/,
      'la vista cliente abre una simulación sin autenticación ni pedidos reales');
    assert.match(html, /\/chat\/panel\/\?demo=1&showroom=1&s=/,
      'el panel gerente abre automáticamente en modo simulación sin pedir credenciales');
    assert.doesNotMatch(html, /\/ingresar\//,
      'la pantalla dividida no puede enviar al formulario de ingreso');
    assert.match(html, /data-movil="gerente"/,
      'en celular empieza por el panel de gerente');
    assert.match(html, /data-vista-boton="cliente"/,
      'en celular permite alternar al cliente sin scroll horizontal');
    assert.match(html, /@media\(max-width:760px\)/);
    assert.match(html, /padding:48px 8px 8px/,
      'el aviso fijo de Prueba no tapa los controles de la cabecera en celular');
    assert.match(html, /sessionStorage\.removeItem\("gestlok:chat-showroom:v1"\)/,
      'nuevo cliente o nueva sucursal restablece el pedido ficticio');
    assert.match(html, /mi-gusto-munro/);
    assert.match(html, /mi-gusto-torcuato/);
    assert.match(leer(unir(out, 'index.html'), 'utf8'), /href="\/dividida\/"/);
    assert.match(leer(unir(out, 'entorno.js'), 'utf8'), /window\.top !== window\.self/);
  }
});
