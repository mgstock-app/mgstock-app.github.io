import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/migrations/20261107165000_el_molino_cafe_pendiente_duenos.sql','utf8');
const creator=readFileSync('public/stock/gestlok-creator.js','utf8');

test('El Molino Café queda con dos sucursales, sin asignar dueños inexistentes',()=>{
 assert.match(sql,/El Molino Café/);
 assert.match(sql,/'Acassuso'/);
 assert.match(sql,/'San Isidro'/);
 assert.match(sql,/alter column owner_email drop not null/);
 assert.match(sql,/new\.owner_email is null/);
 assert.match(sql,/values\s*\(v_tenant,v_code,'El Molino Café',v_local_a,'Acassuso',null,'fisica',v_admin\)/);
 assert.doesNotMatch(sql,/insert into public\.docs\s*\([^;]*['"]equipo['"]/i);
 assert.match(sql,/v_tenant uuid := gen_random_uuid\(\)/);
 assert.match(sql,/visible_en','administracion_creadora'/);
 assert.match(creator,/correo_dueno\|\|'Dueño pendiente'/);
});

test('La nueva empresa no modifica Mi Gusto ni otras empresas',()=>{
 assert.doesNotMatch(sql,/\b(?:drop table|delete from|truncate|update public\.docs|update gestlok_platform\.companies)\b/i);
 assert.match(sql,/where lower\(btrim\(name\)\) in \('el molino cafe','el molino café'\)/);
 assert.match(sql,/join auth\.users u on u\.id = a\.user_id/);
 assert.match(sql,/lower\(u\.email\) = 'kmu15lopez@gmail\.com'/);
});
