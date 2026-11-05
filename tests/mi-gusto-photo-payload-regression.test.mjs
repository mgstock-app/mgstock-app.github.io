import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration = read('supabase/migrations/20261105032200_mi_gusto_restaurar_fotos_payload.sql');
const js = read('public/stock/mi-gusto-cierre-online.js');

test('Mi Gusto: los turnos con fotos informan foto y observación al cliente', () => {
 assert.match(migration, /'photo_path',s\.photo_path/);
 assert.match(migration, /'photo_at',s\.photo_at/);
 assert.match(migration, /'cierre_observacion',s\.cierre_observacion/);
 assert.match(js, /if\(!saved\?\.photo_path\)throw Error/);
 assert.match(js, /!s\?\.photo_path\?'disabled'/);
});

test('Mi Gusto: recuperar fotos no revierte exclusión de efectivo ni pierde OK', () => {
 assert.match(migration, /'gross_amount',m\.gross_amount/);
 assert.match(migration, /'discount_amount',m\.discount_amount/);
 assert.match(migration, /'ok',m\.cash_checked/);
 assert.match(migration, /'efectivo',z\.efectivo/);
 assert.match(migration, /filter\(where m\.app and m\.method<>'efectivo'\),0\) as total_app/);
 assert.match(migration, /filter\(where m\.method<>'efectivo'\),0\) as total_ventas/);
 assert.match(migration, /'online_local',z\.total_ventas-z\.total_app/);
 assert.doesNotMatch(migration, /\b(?:delete from|truncate table|drop table)\b/i);
});
