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
  });
}
test('otras ramas no publican GESTLOK', () => {
  const out = mkdtempSync(join(tmpdir(), 'entorno-'));
  execFileSync('node', ['entornos/construir.mjs', out], {env: {...process.env, ENTORNO: 'main', CF_PAGES_BRANCH: ''}});
  assert.ok(!existsSync(join(out, 'chat')));
});
