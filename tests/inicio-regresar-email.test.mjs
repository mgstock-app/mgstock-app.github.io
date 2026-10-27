import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Inicio compacto: tamaños según la altura de pantalla y cargado después de los demás estilos', () => {
  const css = file('app/inicio-compacto.css');
  assert.match(css, /\.gl-owner-welcome h1\{[^}]*font-size:clamp\(36px,min\(5\.4vw,7\.6vh\),72px\)/);
  assert.match(css, /\.gl-owner-tile\{min-height:clamp\(64px,9vh,88px\)/);
  const layout = file('app/layout.tsx');
  assert.ok(layout.indexOf('./inicio-compacto.css') > layout.indexOf('./owner-mobile-refinements.css'));
});

test('«Regresar» siempre visible en el menú lateral y en la barra superior', () => {
  const app = file('public/stock/app.js');
  assert.match(app, /<button class="snav-loc snav-back" data-act="locales" aria-label="Regresar al inicio">\$\{ic\('back'\)\}<span class="nl">Regresar<\/span>/);
  assert.doesNotMatch(app, /\$\{varios \? `<button class="snav-loc"/);
  assert.match(app, /b\.id = 'btn-regresar'[\s\S]*b\.dataset\.act = 'locales'/);
  assert.match(app, /case 'locales': mostrarHub\(\); break;/);
});

test('Se recuerda el email de la última sesión, nunca la contraseña', () => {
  const auth = file('public/stock/auth.js');
  assert.match(auth, /localStorage\.setItem\(LAST_EMAIL, email\)/);
  assert.match(auth, /mail\.value = last/);
  assert.doesNotMatch(auth, /localStorage\.setItem\([^)]*pass/i);
});

test('«Salir» cierra solo este equipo: la misma cuenta sigue abierta en los demás', () => {
  for (const path of ['public/stock/auth.js', 'modules/empleados/components/auth/AuthProvider.tsx', 'components/logout-button.tsx']) {
    const src = file(path);
    assert.match(src, /auth\.signOut\(\{ scope: ['"]local['"] \}\)/, path);
    assert.doesNotMatch(src, /auth\.signOut\(\)/, path);
  }
});
