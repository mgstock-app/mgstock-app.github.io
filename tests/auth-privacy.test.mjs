import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function harness() {
  const elements = new Map(); let event; let reloads = 0;
  const el = selector => {
    if (!elements.has(selector)) elements.set(selector, { hidden: false, dataset: {}, textContent: '', className: '', querySelectorAll: () => [], querySelector: () => null, appendChild(child) { this.child = child; } });
    return elements.get(selector);
  };
  const client = { rpc: async () => ({ data: { rol: 'gerente', locales: ['munro'] }, error: null }),
    auth: { signOut: async () => ({ error: null }), onAuthStateChange(fn) { event = fn; }, getSession: async () => ({ data: { session: null } }) } };
  const window = { supabase: { createClient: () => client }, dispatchEvent() {} };
  const context = vm.createContext({ window, console, URLSearchParams, Event,
    location: { origin: 'https://example.invalid', pathname: '/', hash: '', search: '', reload() { reloads++; } },
    document: { readyState: 'complete', querySelector: el, addEventListener() {}, createElement: () => ({ dataset: {} }), documentElement: { classList: { add() {}, remove() {} } } },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  });
  let source = readFileSync('public/stock/auth.js', 'utf8');
  source = source.replace(/\}\)\(\);\s*$/, 'window.testAuth = { entered, signOut }; })();');
  vm.runInContext(source, context);
  return { client, el, window, reloads: () => reloads, event: (...args) => event(...args), ...window.testAuth };
}
test('late authorization cannot reopen private UI after logout', async () => {
  const h = harness(); let resolve;
  h.client.rpc = () => new Promise(done => { resolve = done; });
  const entering = h.entered({ user: { id: 'uuid-a', email: 'a@example.invalid' } });
  await h.signOut();
  resolve({ data: { rol: 'gerente', locales: ['munro'] }, error: null });
  await entering;
  assert.equal(h.el('#auth').hidden, false);
  assert.equal(h.el('#app').hidden, true);
});
test('changing account conceals private screens before reloading', async () => {
  const h = harness();
  await h.entered({ user: { id: 'uuid-a', email: 'a@example.invalid' } });
  h.event('SIGNED_IN', { user: { id: 'uuid-b', email: 'b@example.invalid' } });
  assert.equal(h.el('#app').hidden, true);
  assert.equal(h.el('#hub').hidden, true);
  assert.equal(h.reloads(), 1);
});
test('logout errors remain visible and allow retry instead of reporting success', async () => {
  const h = harness();
  h.client.auth.signOut = async () => ({ error: new Error('offline') });
  await h.signOut();
  assert.equal(h.reloads(), 0);
  assert.match(h.el('#au-msg').textContent, /No se pudo cerrar/);
  assert.equal(h.el('#au-msg').child.dataset.au, 'out');
});
