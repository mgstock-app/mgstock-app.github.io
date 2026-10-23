import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function draftRuntime(entries = []) {
  const store = new Map(entries), notices = [];
  const S = { local: 'munro', uid: 'account-a', me: { storageId: 'uuid-a' }, draft: {}, notas: {}, editing: null, fdraft: {} };
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const context = vm.createContext({ S, localStorage: storage, encodeURIComponent,
    rid: () => 'unique-backup', toast: message => notices.push(message),
    lsGet: (k, fallback) => { try { return JSON.parse(storage.getItem(k)) ?? fallback; } catch { return fallback; } },
    lsSet: (k, v) => storage.setItem(k, JSON.stringify(v)),
  });
  const source = readFileSync('public/stock/app.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('const draftKey ='), source.indexOf('/* ---------- Locales y permisos')), context);
  return { S, store, storage, notices, run: code => vm.runInContext(code, context) };
}
for (const local of ['munro', 'torcuato']) {
  test(`${local}: two accounts never restore each other's quantities or notes`, () => {
    const h = draftRuntime(); h.S.local = local;
    h.S.draft = { product: 17 }; h.S.notas = { product: 'Private A' }; h.run('saveDraft()');
    h.S.me.storageId = 'uuid-b'; h.run('restoreDraft()');
    assert.equal(Object.keys(h.S.draft).length, 0);
    assert.equal(Object.keys(h.S.notas).length, 0);
    h.S.draft = { product: 22 }; h.run('saveDraft()');
    h.S.me.storageId = 'uuid-a'; h.run('restoreDraft()');
    assert.equal(h.S.draft.product, 17); assert.equal(h.S.notas.product, 'Private A');
    h.S.local = local === 'munro' ? 'torcuato' : 'munro'; h.run('restoreDraft()');
    assert.equal(Object.keys(h.S.draft).length, 0);
  });
  test(`${local}: preserve unknown legacy bytes without assigning them to the next user`, () => {
    const original = '{ "draft": {"p": 99}, "notas":{"p":"legacy"} }';
    const h = draftRuntime([['spm-draft-' + local, original]]); h.S.local = local;
    h.run('restoreDraft()');
    assert.equal(Object.keys(h.S.draft).length, 0);
    assert.equal(h.store.get('spm-draft-unclaimed:' + local), original);
    assert.equal(h.store.has('spm-draft-' + local), false);
    h.run('restoreDraft()'); assert.equal(h.notices.length, 1);
  });
}
test('quota failure preserves the original and never renders it', () => {
  const h = draftRuntime([['spm-draft-munro', '{"draft":{"p":77}}']]);
  h.storage.setItem = () => { throw new Error('Quota exceeded'); };
  h.run('restoreDraft()');
  assert.equal(h.store.has('spm-draft-munro'), true);
  assert.equal(Object.keys(h.S.draft).length, 0);
});
test('migration never overwrites a different preserved legacy draft', () => {
  const h = draftRuntime([['spm-draft-munro', 'new legacy'], ['spm-draft-unclaimed:munro', 'older legacy']]);
  h.run('restoreDraft()');
  assert.equal(h.store.get('spm-draft-unclaimed:munro'), 'older legacy');
  assert.equal(h.store.get('spm-draft-unclaimed:munro:unique-backup'), 'new legacy');
});
test('no authenticated identity means no shared fallback draft can be saved', () => {
  const h = draftRuntime(); h.S.me = null; h.S.uid = null;
  h.run('saveDraft()'); assert.equal(h.store.size, 0);
});
