import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('markup, styles, authentication and business logic match original SHA-256 fingerprints', () => {
  const hashes = JSON.parse(read('tests/source-hashes.json'));
  for (const [path, hash] of Object.entries(hashes)) {
    const content = path === 'markup' ? JSON.parse(read('lib/stock/markup.json')) : read(path);
    assert.equal(createHash('sha256').update(content.replaceAll('\r\n', '\n')).digest('hex'), hash, path);
  }
});

test('all original stock screens are present and IDs are unique', () => {
  const markup = JSON.parse(read('lib/stock/markup.json'));
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const id of ['auth', 'app', 'hub', 'snav', 'view', 'au-in', 'au-up', 'au-fg', 'au-np']) assert.ok(ids.includes(id), id);
  assert.ok(!markup.includes('<script'));
});

test('runtime and auth parse successfully', () => {
  new vm.Script(read('public/stock/app.js'));
  new vm.Script(read('public/stock/auth.js'));
  new vm.Script(read('public/sw.js'));
});

async function session(email) {
  const listeners = new Map();
  const element = { hidden: false, textContent: '', className: '', querySelectorAll: () => [], querySelector: () => null };
  const context = vm.createContext({
    window: {}, console, URL, URLSearchParams, Blob, crypto,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    document: {
      readyState: 'loading', querySelector: () => element,
      documentElement: { classList: { add() {}, remove() {} } },
      addEventListener: (name, fn) => listeners.set(name, fn),
    },
    location: { origin: 'http://localhost:3000', pathname: '/', search: '', hash: '' },
  });
  vm.runInContext(read('tests/mock_supabase.js'), context);
  const original = context.window.supabase.createClient;
  let client;
  context.window.supabase.createClient = () => (client = original());
  vm.runInContext(read('public/stock/auth.js'), context);
  listeners.get('DOMContentLoaded')();
  await client.auth.signInWithPassword({ email, password: 'secreto1' });
  return { context, client, db: await context.window.claude.use('db'), user: await context.window.claude.use('user') };
}

test('owner can save in Torcuato without changing Munro', async () => {
  const { db, user } = await session('dueno@example.com');
  assert.equal((await user.me()).rol, 'dueno');
  const before = (await db.doc('munro/productos/p-001').get()).data();
  await db.doc('torcuato/productos/p-001').update({ sinStock: true, cantidad: 12.5 });
  assert.equal((await db.doc('torcuato/productos/p-001').get()).data().cantidad, 12.5);
  assert.deepEqual((await db.doc('munro/productos/p-001').get()).data(), before);
  await db.collection('torcuato/conteos').add({ fecha: 123, autor: 'owner', total: 12.5 });
  assert.equal((await db.collection('torcuato/conteos').get()).size, 1);
  assert.equal((await db.collection('munro/conteos').get()).size, 0);
});

test('manager only reads and updates assigned branch in simulated backend', async () => {
  const { db, user } = await session('gerente.munro@example.com');
  assert.deepEqual(Array.from((await user.me()).locales), ['munro']);
  assert.equal((await db.collection('torcuato/productos').get()).size, 0);
  await assert.rejects(db.doc('torcuato/productos/p-001').update({ cantidad: 99 }));
  await db.doc('munro/productos/p-001').update({ cantidad: 4 });
  assert.equal((await db.doc('munro/productos/p-001').get()).data().cantidad, 4);
  await assert.rejects(db.doc('equipo/new@example.com').set({ rol: 'creadora' }));
});

test('read-only user cannot save through adapter', async () => {
  const { db, user } = await session('lectura@example.com');
  assert.equal(await user.canEdit(), false);
  assert.ok((await db.collection('munro/productos').get()).size > 0);
  await assert.rejects(db.doc('munro/productos/p-001').update({ cantidad: 99 }));
  await assert.rejects(db.collection('munro/conteos').add({ fecha: 123 }));
});

test('administrator creates, renames and removes a custom sheet', async () => {
  const { db, user } = await session('admin@example.com');
  assert.equal(await user.isOwner(), true);
  const sheet = await db.collection('munro/hojas').add({ nombre: 'Prueba', tipo: 'stock', orden: 10 });
  await sheet.update({ nombre: 'Nueva' });
  assert.equal((await sheet.get()).data().nombre, 'Nueva');
  await sheet.delete();
  assert.equal((await sheet.get()).exists, false);
});

test('managers only see the team of their own branch', async () => {
  const munro = await session('gerente.munro@example.com');
  const vistos = Array.from((await munro.db.collection('equipo').get()).docs, d => d.data().email).sort();
  assert.deepEqual(vistos, ['admin@example.com', 'dueno@example.com', 'gerente.munro@example.com', 'lectura@example.com']);
  const torcuato = await session('gerente.torcuato@example.com');
  const vistosT = Array.from((await torcuato.db.collection('equipo').get()).docs, d => d.data().email).sort();
  assert.deepEqual(vistosT, ['admin@example.com', 'dueno@example.com', 'gerente.torcuato@example.com']);
  const admin = await session('admin@example.com');
  assert.equal((await admin.db.collection('equipo').get()).size, 5);
});

test('only owner and administrator change the suggested stock', async () => {
  const owner = await session('dueno@example.com');
  await owner.db.doc('torcuato/productos/p-001').update({ sugerido: 6 });
  assert.equal((await owner.db.doc('torcuato/productos/p-001').get()).data().sugerido, 6);

  const manager = await session('gerente.torcuato@example.com');
  manager.context.window.__rows.find(r => r.col === 'torcuato/productos' && r.id === 'p-001').data.sugerido = 6;
  await manager.db.doc('torcuato/productos/p-001').update({ sugerido: 99, stock: 2 });
  const row = (await manager.db.doc('torcuato/productos/p-001').get()).data();
  assert.equal(row.stock, 2);
  assert.equal(row.sugerido, 6);
  await manager.db.collection('torcuato/productos').add({ nombre: 'Nuevo', cat: 'Salsas', sugerido: 50 });
  const added = (await manager.db.collection('torcuato/productos').get()).docs.map(d => d.data()).find(d => d.nombre === 'Nuevo');
  assert.ok(added && !('sugerido' in added));
});

test('only owner and administrator show or hide the suggested stock of a sheet', async () => {
  const owner = await session('dueno@example.com');
  await owner.db.doc('torcuato/hojas/h-cajas').set({ nombre: 'Stock Cajas', tipo: 'lista', orden: 4, sugerido: true });
  assert.equal((await owner.db.doc('torcuato/hojas/h-cajas').get()).data().sugerido, true);

  const manager = await session('gerente.torcuato@example.com');
  manager.context.window.__rows.push({ col: 'torcuato/hojas', id: 'h-cajas', data: { nombre: 'Stock Cajas', tipo: 'lista', orden: 4, sugerido: true } });
  await manager.db.doc('torcuato/hojas/h-cajas').set({ nombre: 'Cajas', tipo: 'lista', orden: 4, sugerido: false });
  const hoja = (await manager.db.doc('torcuato/hojas/h-cajas').get()).data();
  assert.equal(hoja.nombre, 'Cajas');
  assert.equal(hoja.sugerido, true);
});
