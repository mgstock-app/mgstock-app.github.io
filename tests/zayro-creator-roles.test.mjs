import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pilot=readFileSync('public/stock/gestlok-pilot.js','utf8');
const menu=readFileSync('public/stock/gestlok-scanner-menu.js','utf8');
const rls=readFileSync('supabase/migrations/20261108213000_zayro_creator_operative_scope.sql','utf8');
const tests=readFileSync('tests/sql/zayro-creator-operative-scope.sql','utf8');
test('Solo el plan ZAYRO y la administradora verificada reciben gestión adicional',()=>{
 assert.match(pilot,/const CREATOR_TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'/);
 assert.match(pilot,/gestlok_creator_editing_state/);
 assert.match(pilot,/identity\.user\.id!==ownerUid/);
 assert.match(pilot,/accessMode==='creadora'/);
 assert.match(menu,/GestLokPilot\?\.creatorMode\?\.\(\)===true/);
 assert.doesNotMatch(menu,/data-scanner-readonly|disabled title="Vista previa/);
});
test('No se amplían permisos de dueños, invitados ni de otras empresas',()=>{
 assert.match(rls,/zayro_scanner_creator_can_read/);
 assert.match(rls,/owner_uid = \(select a\.owner_uid/);
 assert.doesNotMatch(rls,/drop policy|disable row level security|truncate|delete from public\./i);
 assert.match(rls,/created_by is distinct from old\.created_by/);
 assert.match(tests,/rollback;/);
 assert.match(tests,/Fuga de escritura entre empresas/);
 assert.match(tests,/Usuario ajeno logró escribir/);
 assert.match(tests,/Dueña perdió catálogo/);
});
