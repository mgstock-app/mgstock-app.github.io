import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const get=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Reseñas GESTLOK: bloquear INSERT directo y conservar API de cupones',()=>{
 const migration=get('supabase/migrations/20261029233000_gestlok_reviews_rpc_only.sql');
 const tour=get('public/stock/gestlok-demo-tour.js');
 assert.match(migration,/revoke insert on table public\.gestlok_app_reviews from anon, authenticated;/i);
 assert.match(migration,/revoke insert on table public\.gestlok_app_reviews from public;/i);
 assert.doesNotMatch(migration,/(drop table|delete from|truncate|alter table.*disable row level security|grant\s+insert)/i);
 assert.match(tour,/gestlok_demo_enviar_resena_cupon/);
 assert.doesNotMatch(tour,/\.from\(['"]gestlok_app_reviews['"]\)\.insert\(/);
 assert.match(tour,/p_contact_consent/);
});
test('SQL de validación de privilegios no escribe datos reales',()=>{
 const sql=get('supabase/tests/gestlok_reviews_rpc_only.sql');
 assert.match(sql,/begin read only;/i);
 assert.match(sql,/has_table_privilege\('anon','public.gestlok_app_reviews','INSERT'\)/);
 assert.match(sql,/has_function_privilege\('anon','public.gestlok_demo_enviar_resena_cupon/);
 assert.match(sql,/rollback;/i);
 assert.doesNotMatch(sql,/(insert into|delete from|truncate|update public\.)/i);
});
