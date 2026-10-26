import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app = readFileSync('public/stock/app.js', 'utf8');
const updates = readFileSync('public/stock/gestlok-updates.js', 'utf8');
test('Avisos queda habilitado para creadora, dueño y gerente, y no para otros roles', () => {
  assert.match(app, /const puedeVerAvisos = \(\) => esTotal\(\) \|\| miRol\(\) === 'gerente';/);
  assert.match(app, /\$\{puedeVerAvisos\(\) \? `<button data-go="avisos">/);
  assert.match(app, /\(v === 'avisos' && puedeVerAvisos\(\)\)/);
  assert.doesNotMatch(app, /\(v === 'avisos' && esTotal\(\)\)/);
});
test('La tarjeta de áreas redibuja el Inicio del local y no solo la lista de locales', () => {
  assert.match(app, /function renderOwnerAreas\(\)\{ if \(!S\.local\) renderHub\(\); else if \(S\.view === 'inicio'\) render\(\); \}/);
  assert.match(app, /GestLokOwnerAreas\?\.attach\(\{S,role:miRol,render:renderOwnerAreas,/);
});
test('El Inicio del gerente incluye avisos del local y la tarjeta de Empleados', () => {
  assert.match(app, /miRol\(\)==='gerente'\?\(window\.GestLokUpdates\?\.homeAlerts\?\.\(\)\|\|''\):''/);
  assert.match(app, /miRol\(\)==='gerente'\?\(window\.GestLokOwnerAreas\?\.gerenteCard\?\.\(\)\|\|''\):''/);
  assert.match(app, /S\.view === 'inicio' && miRol\(\) === 'gerente'\)\) render\(\)/);
});
test('homeAlerts muestra las 3 novedades más recientes, escapadas, y avisa cuando no hay', () => {
  const ctxMk = avisos => ({S: {local: 'munro', avisos}, localNombre: () => 'Munro'});
  const load = c => {
    const window = {}; const document = {addEventListener() {}};
    vm.runInNewContext(updates, {window, document, Intl, Date, setTimeout, crypto: {}});
    window.GestLokUpdates.attach(c); return window.GestLokUpdates;
  };
  const u = load(ctxMk([{fecha: 1, titulo: 'Viejo'}, {fecha: 40, titulo: 'C', detalle: '<img src=x>'}, {fecha: 30, titulo: 'B'}, {fecha: 20, titulo: 'A'}]));
  const html = u.homeAlerts();
  assert.ok(html.includes('Avisos del local') && html.includes('data-go="avisos"'));
  assert.ok(html.includes('&lt;img src=x&gt;') && !html.includes('<img'));
  assert.ok(!html.includes('Viejo'));
  assert.ok(html.indexOf('>C<') < html.indexOf('>B<') && html.indexOf('>B<') < html.indexOf('>A<'));
  assert.ok(load(ctxMk([])).homeAlerts().includes('Sin novedades por ahora'));
  assert.equal(load({S: {local: '', avisos: []}, localNombre: () => ''}).homeAlerts(), '');
});
