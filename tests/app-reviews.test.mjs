import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('Application reviews: anonymous insert, explicit contact consent, creator-only reading and no tenant access',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function public.es_creadora() returns boolean language sql stable as $$select coalesce(current_setting('test.creator',true),'false')='true'$$;
 grant usage on schema auth to anon,authenticated;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261027170000_gestlok_app_reviews.sql',import.meta.url),'utf8'));
 await db.exec('set role anon');
 await db.exec("insert into public.gestlok_app_reviews(rating) values(2)");
 await assert.rejects(db.query('select * from public.gestlok_app_reviews'),/permission denied/);
 await assert.rejects(db.exec("insert into public.gestlok_app_reviews(rating,contact_value) values(5,'test@example.com')"),/contact_requires_consent/);
 await assert.rejects(db.exec('insert into public.gestlok_app_reviews(rating) values(6)'),/check constraint/);
 await assert.rejects(db.exec("insert into public.gestlok_app_reviews(id,rating) values(gen_random_uuid(),5)"),/permission denied/);
 await db.exec("insert into public.gestlok_app_reviews(rating,contact_consent,contact_name,contact_value) values(1,true,'Example','test@example.com')");
 await db.exec("reset role; set test.uid='00000000-0000-0000-0000-000000000001';set role authenticated");
 assert.equal((await db.query('select * from public.gestlok_app_reviews')).rows.length,0);
 await assert.rejects(db.exec('insert into public.gestlok_app_reviews(rating) values(5)'),/permission denied/);
 await db.exec("reset role;set test.creator='true';set role authenticated");
 assert.equal((await db.query('select * from public.gestlok_app_reviews')).rows.length,2);
 await assert.rejects(db.exec('delete from public.gestlok_app_reviews'),/permission denied/);
 }finally{await db.close();}
});
