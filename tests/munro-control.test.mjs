import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const file = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Conteo diario solo se habilita para la creadora y gerentes de Munro', () => {
  const app = file('public/stock/app.js');
  assert.match(app, /const puedeVerDiarioMunro = \(\) => S\.local === 'munro'/);
  assert.match(app, /miRol\(\) === 'creadora'/);
  assert.match(app, /miRol\(\) === 'gerente' && misLocales\(\)\.includes\('munro'\)/);
  assert.match(app, /\$\{puedeVerDiarioMunro\(\) \? \`<button data-go="diario"/);
  assert.match(app, /v === 'diario' && puedeVerDiarioMunro\(\)/);
  assert.doesNotMatch(app, /push\(C\('diario'\)\.onSnapshot/);
});

test('Tablero Munro usa datos iniciales de la captura, historial acumulativo y no modifica stock general', () => {
  const script = file('public/stock/munro-daily.js');
  assert.doesNotThrow(() => new Script(script));
  for (const producto of ['Empanadas', 'Pizza Indi', 'Pizza grande']) assert.ok(script.includes(producto));
  assert.match(script, /tipo:'cierre'/);
  assert.match(script, /tipo:'config'/);
  assert.match(script, /C\('munro_control'\)\.add/);
  assert.match(script, /Comparar turnos/);
  assert.match(script, /Exportar CSV/);
  assert.doesNotMatch(script, /C\('productos'\)\.(add|doc)/);
});

test('Se oculta el pie legal flotante para usuarios dentro de GestLok, manteniendo acceso previo al login', () => {
  const page = file('app/page.tsx');
  assert.match(page, /\.stock-legal-nav \{ display:none/);
  assert.match(page, /html\.auth-on \.stock-legal-nav \{ display:flex/);
});
