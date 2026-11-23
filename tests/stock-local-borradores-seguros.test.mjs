import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../public/stock/app.js', import.meta.url), 'utf8');
const ini = source.indexOf('function purgarBorradoresViejos(){');
const fin = source.indexOf('\n/* Cuándo llegaron por última vez', ini);
assert.ok(ini > 0 && fin > ini, 'La limpieza de borradores debe existir');
const codigo = source.slice(ini, fin) + '\nthis.purgar = purgarBorradoresViejos;';
const MI_GUSTO = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';

function armar({tenant = MI_GUSTO, fdraft, fmeta, sesion = [], allFab}){
  const S = {me:{tenant_id:tenant}, fdraft, fmeta, fSesion:new Set(sesion), allFab};
  const ctx = {S, MI_GUSTO_TENANT:MI_GUSTO, has:(o, k) => Object.prototype.hasOwnProperty.call(o || {}, k),
    num:v => Number(v) || 0, stockLocalHoyAR:() => '2026-11-23'};
  runInNewContext(codigo, ctx);
  return {S, purgar:() => ctx.purgar()};
}
const fab = [{id:'jamon', local:3, fabrica:0}, {id:'roquefort', local:1, fabrica:0}, {id:'panceta', local:1, fabrica:2}];

test('un borrador viejo sin día (como el de la computadora de la dueña) se descarta y no tapa el servidor', () => {
  const {S, purgar} = armar({fdraft:{jamon:{l:0}, roquefort:{l:0}}, fmeta:{}, allFab:fab});
  assert.equal(purgar(), 2);
  assert.deepEqual(S.fdraft, {});
});

test('un borrador de otro día se descarta', () => {
  const {S, purgar} = armar({fdraft:{jamon:{l:5}}, fmeta:{jamon:{dia:'2026-11-22', base:{l:3}}}, allFab:fab});
  assert.equal(purgar(), 1);
  assert.deepEqual(S.fdraft, {});
});

test('si el servidor cambió después de empezar a editar, gana el dato guardado', () => {
  const {S, purgar} = armar({fdraft:{panceta:{l:4, f:5}}, fmeta:{panceta:{dia:'2026-11-23', base:{l:9, f:2}}}, allFab:fab});
  assert.equal(purgar(), 1);
  assert.deepEqual(S.fdraft, {panceta:{f:5}});
});

test('se conserva un borrador de hoy sin conflicto y lo editado en esta sesión', () => {
  const {S, purgar} = armar({fdraft:{jamon:{l:4}, roquefort:{l:0}},
    fmeta:{jamon:{dia:'2026-11-23', base:{l:3}}}, sesion:['roquefort'], allFab:fab});
  assert.equal(purgar(), 0);
  assert.deepEqual(S.fdraft, {jamon:{l:4}, roquefort:{l:0}});
});

test('otras empresas no cambian de comportamiento', () => {
  const {S, purgar} = armar({tenant:'otra', fdraft:{jamon:{l:0}}, fmeta:{}, allFab:fab});
  assert.equal(purgar(), 0);
  assert.deepEqual(S.fdraft, {jamon:{l:0}});
});

test('Stock Local muestra cuándo llegaron los datos del servidor y permite actualizar', () => {
  assert.match(source, /Datos del servidor al día · /);
  assert.match(source, /Los datos pueden no estar al día/);
  assert.match(source, /\$\{stockLocalDuenaAviso\(\)\}\$\{stockLocalSyncLinea\(\)\}/);
  assert.match(source, /m\.base\[k\] = base/);
  const runtime = readFileSync(new URL('../components/stock-runtime.tsx', import.meta.url), 'utf8');
  assert.equal((runtime.match(/app\.js\?rev=stock-local-borradores-20261123/g) || []).length, 2);
});
