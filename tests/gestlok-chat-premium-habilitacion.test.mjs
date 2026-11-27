import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql=readFileSync(new URL('../supabase/migrations/20261126165000_gestlok_chat_premium_habilitacion.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/stock/gestlok-creator-home.js',import.meta.url),'utf8');
const tenant='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
test('habilitación comercial: varios números, permisos, aislamiento, validación, pausa y persistencia',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema gestlok_chat_private; create schema gestlok_tenancy; create schema gestlok_platform;
      create table gestlok_tenancy.tenants(id uuid primary key,code text not null);
      create table public.docs(tenant_id uuid not null,col text not null,id text not null,data jsonb,primary key(tenant_id,col,id));
      create table gestlok_chat_private.empresas(tenant_id uuid primary key,nombre_publico text);
      create function gestlok_platform.require_admin() returns uuid language plpgsql as $$begin
        if current_setting('test.admin',true) is distinct from 'yes' then raise exception 'Acceso exclusivo' using errcode='42501'; end if;
        return '00000000-0000-4000-8000-000000000019';
      end$$;
      insert into gestlok_tenancy.tenants values ('${tenant}','comercio-uno'),('${other}','comercio-dos');
      insert into public.docs values ('${tenant}','locales','uno','{"nombre":"Local A"}'),('${other}','locales','uno','{"nombre":"Local B"}');
      `);
    await db.exec(sql); await db.exec(sql);
    const rpc=(a='listar',t=null,l=null,ps=null,id=null,h=null)=>db.query('select public.gestlok_chat_admin_whatsapp_premium($1,$2,$3,$4,$5,$6) as result',[a,t,l,ps,id,h]).then(r=>r.rows[0].result);
    await db.exec('set role anon');
    await assert.rejects(rpc(),/permission denied/);
    await db.exec('reset role; set role authenticated; set test.admin=\'no\'');
    await assert.rejects(rpc(),/Acceso exclusivo/);
    await assert.rejects(db.query('select * from gestlok_chat_private.whatsapp_premium_habilitaciones'),/permission denied/);
    await db.exec("set test.admin='yes'");
    assert.equal((await rpc()).locales.length,2);
    const result=await rpc('agregar',tenant,'uno',['+54 9 11 0000 0001','+1 (555) 000-0002']);
    assert.equal(result.numeros.length,2);assert.equal(result.conexion_meta,'pendiente');
    assert.ok(result.numeros.every(x=>x.tenant_id===tenant&&x.habilitada));
    await assert.rejects(rpc('agregar',other,'uno',['+541100000001']),/ya está registrado/);
    await assert.rejects(rpc('agregar',tenant,'inexistente',['+15550000003']),/local existente/);
    await assert.rejects(rpc('agregar',other,'uno',['+15550000003','incorrecto']),/Número inválido/);
    assert.equal((await rpc()).numeros.length,2);
    const id=result.numeros[0].id;
    assert.equal((await rpc('estado',null,null,null,id,false)).numeros.find(n=>n.id===id).habilitada,false);
    assert.equal((await rpc('estado',null,null,null,id,true)).numeros.find(n=>n.id===id).habilitada,true);
    const both=await rpc('agregar',other,'uno',['+15550000003']);assert.equal(both.numeros.filter(n=>n.tenant_id===other).length,1);
    await db.exec('reset role');
    await db.query("delete from public.docs where tenant_id=$1 and col='locales'",[tenant]);
    await db.exec('set role authenticated');
    assert.ok((await rpc()).numeros.filter(n=>n.tenant_id===tenant).every(n=>!n.local_existe));
    await assert.rejects(rpc('estado',null,null,null,id,true),/local ya no existe/);
    assert.equal((await rpc()).numeros.length,3);
  } finally { await db.close(); }
});

test('panel privado: formulario, estado comercial y vínculo pendiente; sin transporte',()=>{
  assert.match(ui,/\['habilitacion', 'Habilitación'/);
  assert.match(ui,/cur === 'habilitacion'\) body = .*premiumWAView/);
  assert.match(ui,/data-ch-wa-form/);
  assert.match(ui,/gestlok_chat_admin_whatsapp_premium/);
  assert.match(ui,/WhatsApp: pendiente de vinculación/);
  assert.match(ui,/premiumWAAllowed=\(\)=>premiumAdmin/);
  assert.doesNotMatch(sql,/https?:|net\.http|vault\.|service_role/);
});
