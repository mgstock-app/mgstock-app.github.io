import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('mgstock cache activation leaves ReciboNet and other scopes untouched', async () => {
  const handlers = {}, deleted = [];
  const context = vm.createContext({ URL, self: {
    location: { href: 'https://example.com/mgstock/sw.js', origin: 'https://example.com' },
    addEventListener: (name, fn) => { handlers[name] = fn; },
    clients: { claim: async () => {} },
  }, caches: {
    keys: async () => ['recibonet-v1', 'stock-next-v1', 'mgstock:/:old', 'mgstock:/mgstock:old', 'mgstock:/mgstock:__BUILD_VERSION__'],
    delete: async key => { deleted.push(key); },
  } });
  vm.runInContext(readFileSync('scripts/sw-template.js', 'utf8'), context);
  let completion;
  handlers.activate({ waitUntil: promise => { completion = promise; } });
  await completion;
  assert.deepEqual(deleted, ['mgstock:/mgstock:old']);
});

test('worker does not intercept ReciboNet, Supabase or private routes', () => {
  const handlers = {};
  vm.runInNewContext(readFileSync('scripts/sw-template.js', 'utf8'), { URL, self: {
    location: { href: 'https://example.com/mgstock/sw.js', origin: 'https://example.com' },
    addEventListener: (name, fn) => { handlers[name] = fn; },
  } });
  for (const url of ['https://example.com/recibonet/', 'https://example.com/auth/login', 'https://vgsepaaewbctjsjcpeta.supabase.co/rest/v1/docs']) {
    handlers.fetch({ request: { url, method: 'GET', headers: new Headers() }, respondWith: () => assert.fail(url) });
  }
});
