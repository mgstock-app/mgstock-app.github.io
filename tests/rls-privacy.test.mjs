import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('real PostgreSQL policies deny anonymous, pending, cross-branch and privilege escalation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create publication supabase_realtime;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.role() returns text language sql stable as $$select current_user::text$$;
      grant usage on schema auth to authenticated,anon;`);
    await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
    for (const [email, rol, locales] of [
      ['admin@example.invalid','creadora',[]], ['owner@example.invalid','dueno',[]],
      ['munro@example.invalid','gerente',['munro']], ['torcuato@example.invalid','gerente',['torcuato']],
      ['reader@example.invalid','lectura',['munro']],
    ]) await db.query('insert into public.docs(col,id,data) values($1,$2,$3)', ['equipo',email,JSON.stringify({email,rol,locales})]);
    for (const local of ['munro','torcuato']) {
      await db.query('insert into public.docs(col,id,data) values($1,$2,$3)', ['locales',local,JSON.stringify({nombre:local})]);
      for (const type of ['productos','fabrica','conteos','hojas']) await db.query('insert into public.docs(col,id,data) values($1,$2,$3)', [local+'/'+type,'synthetic',JSON.stringify({stock:10,sugerido:20})]);
    }
    const as = async email => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({email,user_metadata:{rol:'creadora'}})]);
      await db.exec('set role '+(email?'authenticated':'anon'));
    };
    await as(null);
    await assert.rejects(db.query('select public.mi_acceso()'), /permission denied/);
    await assert.rejects(db.query('select * from public.docs'), /permission denied/);
    await as('pending@example.invalid');
    assert.equal((await db.query('select * from public.docs')).rows.length,0);
    await assert.rejects(db.query("insert into public.docs(col,id,data) values('equipo','pending@example.invalid','{\"rol\":\"creadora\"}')"), /row-level security/);
    for (const local of ['munro','torcuato']) {
      await as(local+'@example.invalid');
      const other = local==='munro'?'torcuato':'munro';
      assert.equal((await db.query('select * from public.docs where col like $1',[other+'/%'])).rows.length,0);
      assert.equal((await db.query('select public.doc_update($1,$2,$3) n',[other+'/productos','synthetic','{"stock":99}'])).rows[0].n,0);
      assert.equal((await db.query('select public.doc_update($1,$2,$3) n',[local+'/productos','synthetic','{"stock":11,"sugerido":99}'])).rows[0].n,1);
      assert.equal((await db.query('select data from public.docs where col=$1',[local+'/productos'])).rows[0].data.sugerido,20);
      await assert.rejects(db.query('update public.docs set col=$1 where col=$2',[other+'/productos',local+'/productos']),/row-level security/);
      assert.equal((await db.query("update public.docs set data=data||'{\"rol\":\"creadora\"}' where col='equipo' and id=$1 returning id",[local+'@example.invalid'])).rows.length,0);
      const team = (await db.query("select id from public.docs where col='equipo'")).rows.map(row=>row.id);
      assert.ok(!team.includes(other+'@example.invalid'));
    }
    await as('reader@example.invalid');
    assert.equal((await db.query("select public.doc_update('munro/productos','synthetic','{\"stock\":999}') n")).rows[0].n,0);
    assert.equal((await db.query("delete from public.docs where col='munro/productos' returning id")).rows.length,0);
    for (const email of ['owner@example.invalid','admin@example.invalid']) {
      await as(email);
      for (const local of ['munro','torcuato']) assert.equal((await db.query('select public.doc_update($1,$2,$3) n',[local+'/productos','synthetic','{"stock":12}'])).rows[0].n,1);
    }
  } finally { await db.close(); }
});
