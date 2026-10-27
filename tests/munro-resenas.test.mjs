import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
const root = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const tenant='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';

function client(role='gerente',local='munro',organization=tenant) {
  const listeners={};
  const document={querySelector:()=>null,addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const window={};
  runInNewContext(root('public/stock/munro-resenas.js'),{window,document,Intl,Date,String,Array,Object,Number,console});
  const module=window.GestLokMunroResenas;
  module.attach({S:{me:{tenant_id:organization},local,offline:false},miRol:()=>role,misLocales:()=>[local],render:()=>{}});
  return module;
}
test('Reseñas: Munro únicamente, roles explícitos, búsqueda y escape de datos',()=>{
  for(const role of ['dueno','gerente','creadora']) assert(client(role).permitido());
  for(const role of ['editor','lector',null]) assert(!client(role).permitido());
  assert(!client('gerente','torcuato').permitido());
  assert(!client('dueno','munro','another-tenant').permitido());
  const t=client()._t;
  assert.equal(t.normalizePhone('+54 9 11 2233-7788'),'1122337788');
  assert.equal(t.normalizePhone('0054 9 11 2233 7788'),'1122337788');
  assert.equal(t.normalizePhone('01122337788'),'1122337788');
  const rows=[{customer_name:'Mariana Díaz',phone:'1122337788',code:'ABC123'}];
  for(const term of ['mariana','2233','abc123','11 2233']) assert.equal(t.filter(rows,term).length,1);
  assert.equal(t.filter(rows,'nadie').length,0);
  assert.equal(t.E('<script>'), '&lt;script&gt;');
  assert(client().view().includes('independiente de publicar reseñas'));
});

test('Reseñas SQL: generación única, vencimiento AR, permisos, duplicados y uso atómico',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema gestlok_tenancy;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function gestlok_tenancy.current_tenant_id() returns uuid language sql stable as $$select nullif(current_setting('test.tenant',true),'')::uuid$$;
      create function public.mi_rol() returns text language sql stable as $$select current_setting('test.role',true)$$;
      create function public.puede_editar_local(p text) returns boolean language sql stable as $$select p=current_setting('test.local',true)$$;`);
    await db.exec(root('supabase/migrations/20261027015411_munro_resenas_cupones.sql'));
    await db.exec(`create or replace function gestlok_resenas_private.today_ar() returns date language sql stable set search_path='' as $$select current_setting('test.day')::date$$;`);
    const context=async(role='dueno',org=tenant,local='munro',day='2026-11-01')=>{
      for(const [key,value] of Object.entries({uid:'11111111-1111-4111-8111-111111111111',role,tenant:org,local,day})) await db.query('select set_config($1,$2,false)',['test.'+key,value]);
    };
    const rpc=async(sql,args=[])=>{const r=await db.query(sql,args);return r.rows[0]?.result;};
    await context();
    await db.exec('set role authenticated');
    const create=(name,phone)=>rpc('select public.gestlok_resenas_create($1,$2) as result',[name,phone]);
    const first=await create('Cliente ficticio','+54 9 11 2233-7788');
    assert.match(first.code,/^[A-F0-9]{6}$/);assert.equal(first.discount,10);assert.equal(first.status,'pending');
    assert.equal(new Date(first.expires_at).getTime(),new Date('2026-11-13T03:00:00Z').getTime());
    await assert.rejects(()=>create('Mismo teléfono','01122337788'),/ya tiene/);
    await assert.rejects(()=>create('Nombre','123'),/inválido/);
    const codes=new Set([first.code]);
    for(let i=0;i<50;i++){const row=await create('Cliente ficticio '+i,'113000'+String(i).padStart(4,'0'));assert(!codes.has(row.code));codes.add(row.code);}
    await context('gerente');
    const attempts=await Promise.allSettled([1,2].map(()=>rpc('select public.gestlok_resenas_redeem($1) as result',[first.id])));
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(attempts.filter(r=>r.status==='rejected').length,1);
    await assert.rejects(()=>db.query('select * from gestlok_resenas_private.coupons'),/permission denied/);
    for(const [role,org,local] of [['gerente',tenant,'torcuato'],['dueno','22222222-2222-4222-8222-222222222222','munro'],['lector',tenant,'munro']]){
      await context(role,org,local);
      await assert.rejects(()=>rpc('select public.gestlok_resenas_list() as result'),/denegado/);
      await assert.rejects(()=>create('No autorizado','1199999999'),/denegado/);
      await assert.rejects(()=>rpc('select public.gestlok_resenas_redeem($1) as result',[first.id]),/denegado/);
    }
    await context('dueno',tenant,'munro','2026-11-12');
    const last=await create('Último día','1199999999');
    await context('dueno',tenant,'munro','2026-11-13');
    const list=await rpc('select public.gestlok_resenas_list() as result');
    assert.equal(list.find(r=>r.id===last.id).status,'expired');
    assert.equal(list.find(r=>r.id===first.id).status,'used');
    await assert.rejects(()=>rpc('select public.gestlok_resenas_redeem($1) as result',[last.id]),/vencido/);
    await assert.rejects(()=>create('Fuera de fecha','1188888888'),/vigencia/);
    await context('dueno',tenant,'munro','2026-12-01');
    const next=await create('Beneficio mes siguiente','1122337788');
    assert.notEqual(next.code,first.code);assert.equal(next.status,'pending');
    await db.exec('reset role; set role anon');
    await assert.rejects(()=>rpc('select public.gestlok_resenas_list() as result'),/permission denied/);
    await db.exec('reset role');
    assert.equal((await db.query("select count(*)::int n from gestlok_resenas_private.events where action='used'")).rows[0].n,1);
  } finally {await db.close();}
});
