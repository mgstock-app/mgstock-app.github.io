import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
const root = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const tenant='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';

function client(role='gerente',local='munro',organization=tenant,locales=[local]) {
  const listeners={};
  const document={querySelector:()=>null,addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const window={};
  runInNewContext(root('public/stock/mi-gusto-resenas.js'),{window,document,navigator:{onLine:true},Intl,Date,String,Array,Object,Number,console});
  const module=window.GestLokResenas;
  module.attach({S:{me:{tenant_id:organization},local,offline:false},miRol:()=>role,misLocales:()=>locales,render:()=>{}});
  return module;
}
test('Reseñas: Mi Gusto en Munro y Torcuato, roles explícitos, búsqueda y escape de datos',()=>{
  for(const local of ['munro','torcuato']) for(const role of ['dueno','gerente','creadora']) assert(client(role,local).permitido());
  for(const role of ['editor','lector','lectura',null]) assert(!client(role).permitido());
  assert(!client('gerente','torcuato','cb0dc04a-9a13-434f-a3d0-47f1d8f39670',['munro']).permitido());
  assert(!client('gerente','munro','cb0dc04a-9a13-434f-a3d0-47f1d8f39670',['torcuato']).permitido());
  assert(!client('dueno','otro-local').permitido());
  assert(!client('dueno','munro','another-tenant').permitido());
  const t=client()._t;
  assert.equal(t.normalizePhone('+54 9 11 2233-7788'),'1122337788');
  assert.equal(t.normalizePhone('0054 9 11 2233 7788'),'1122337788');
  assert.equal(t.normalizePhone('01122337788'),'1122337788');
  const rows=[{customer_name:'Mariana Díaz',phone:'1122337788',code:'ABC234'}];
  for(const term of ['mariana','2233','abc234','11 2233']) assert.equal(t.filter(rows,term).length,1);
  assert.equal(t.filter(rows,'nadie').length,0);
  assert.equal(t.E('<script>'), '&lt;script&gt;');
  const html=client('gerente','torcuato').view();
  assert(html.includes('independiente de publicar reseñas'));
  assert(html.includes('Sucursal Torcuato'));
});

test('Reseñas: cada llamada al servidor lleva la sucursal; sin conexión solo se consulta',()=>{
  const script=root('public/stock/mi-gusto-resenas.js');
  assert.match(script,/window\.GestLokSupabase\.rpc\(name, \{p_local:local\(\), \.\.\.params\}\)/);
  assert.match(script,/if \(name !== 'gestlok_resenas_list' && !online\(\)\) throw/);
  assert.doesNotMatch(script,/localStorage|indexedDB/);
  const offline=root('public/stock/gestlok-offline.js');
  assert.match(offline,/'gestlok_resenas_list'\]\);/);
  assert.doesNotMatch(offline,/WRITES=new Set\([^)]*gestlok_resenas/);
  for(const sw of ['public/sw.js','scripts/sw-template.js']) assert.match(root(sw),/'\/stock\/mi-gusto-resenas\.js'/);
  const app=root('public/stock/app.js');
  assert.match(app,/\(puedeVerResenas\(\) \? `<button data-go="resenas">/);
  assert.match(app,/\(v === 'resenas' && puedeVerResenas\(\)\)/);
});

test('Reseñas SQL: sucursales independientes, código único, vencimiento AR, permisos y uso atómico',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema gestlok_tenancy;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function gestlok_tenancy.current_tenant_id() returns uuid language sql stable as $$select nullif(current_setting('test.tenant',true),'')::uuid$$;
      create function public.mi_rol() returns text language sql stable as $$select current_setting('test.role',true)$$;
      create function public.puede_editar_local(p text) returns boolean language sql stable as $$select p=any(string_to_array(current_setting('test.local',true),','))$$;`);
    await db.exec(root('supabase/migrations/20261027015411_mi_gusto_resenas_cupones.sql'));
    await db.exec(root('supabase/migrations/20261027030000_mi_gusto_resenas_registro_y_edicion.sql'));
    await db.exec(root('supabase/migrations/20261028211000_resenas_mi_gusto_estado_manual_auditado.sql'));
    await db.exec(`create or replace function gestlok_resenas_private.today_ar() returns date language sql stable set search_path='' as $$select current_setting('test.day')::date$$;`);
    const context=async(role='dueno',org=tenant,local='munro,torcuato',day='2026-11-01')=>{
      for(const [key,value] of Object.entries({uid:'11111111-1111-4111-8111-111111111111',role,tenant:org,local,day})) await db.query('select set_config($1,$2,false)',['test.'+key,value]);
    };
    const rpc=async(sql,args=[])=>{const r=await db.query(sql,args);return r.rows[0]?.result;};
    await context();
    await db.exec('set role authenticated');
    const create=(local,name,phone)=>rpc('select public.gestlok_resenas_create($1,$2,$3) as result',[local,name,phone]);
    const redeem=(local,id)=>rpc('select public.gestlok_resenas_redeem($1,$2) as result',[local,id]);
    const manual=(local,id,reason)=>rpc('select public.gestlok_resenas_manual_use($1,$2,$3) as result',[local,id,reason]);
    const list=local=>rpc('select public.gestlok_resenas_list($1) as result',[local]);

    const first=await create('munro','Cliente ficticio','+54 9 11 2233-7788');
    assert.match(first.code,/^[A-HJ-NP-Z2-9]{6}$/);assert.equal(first.discount,10);assert.equal(first.status,'pending');assert.equal(first.local,'munro');
    assert.equal(new Date(first.expires_at).getTime(),new Date('2026-11-13T03:00:00Z').getTime());
    await assert.rejects(()=>create('munro','Mismo teléfono','01122337788'),/ya tiene/);
    await assert.rejects(()=>create('munro','Nombre','123'),/inválido/);
    await assert.rejects(()=>create('quilmes','Otra sucursal','1144445555'),/denegado/);
    // Torcuato es independiente: el mismo cliente puede tener su cupón allí, con otro código.
    const otro=await create('torcuato','Cliente ficticio','1122337788');
    assert.equal(otro.local,'torcuato');assert.notEqual(otro.code,first.code);
    assert.deepEqual((await list('munro')).map(r=>r.id),[first.id]);
    assert.deepEqual((await list('torcuato')).map(r=>r.id),[otro.id]);
    // El cupón solo se usa en la sucursal que lo emitió.
    await assert.rejects(()=>redeem('torcuato',first.id),/otra sucursal/);
    const codes=new Set([first.code,otro.code]);
    for(let i=0;i<60;i++){const row=await create(i%2?'munro':'torcuato','Cliente ficticio '+i,'113000'+String(i).padStart(4,'0'));assert(!codes.has(row.code));assert.match(row.code,/^[A-HJ-NP-Z2-9]{6}$/);codes.add(row.code);}

    // Gerente de Munro: registra y marca usado en Munro; dos usos simultáneos, uno solo gana.
    await context('gerente',tenant,'munro');
    const attempts=await Promise.allSettled([1,2].map(()=>redeem('munro',first.id)));
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(attempts.filter(r=>r.status==='rejected').length,1);
    await assert.rejects(()=>redeem('munro',first.id),/utilizado/);
    await assert.rejects(()=>list('torcuato'),/denegado/);
    await assert.rejects(()=>db.query('select * from gestlok_resenas_private.coupons'),/permission denied/);
    for(const [role,org,local,target] of [['gerente',tenant,'torcuato','munro'],['dueno','22222222-2222-4222-8222-222222222222','munro,torcuato','munro'],['lector',tenant,'munro','munro'],['lectura',tenant,'munro','munro']]){
      await context(role,org,local);
      await assert.rejects(()=>list(target),/denegado/);
      await assert.rejects(()=>create(target,'No autorizado','1199999999'),/denegado/);
      await assert.rejects(()=>redeem(target,first.id),/denegado/);
      await assert.rejects(()=>manual(target,first.id,'Descuento aplicado en caja'),/denegado/);
    }

    // Día 12 se emite; desde el 13 todo pendiente queda vencido y no se puede usar ni emitir.
    await context('dueno',tenant,'munro,torcuato','2026-11-12');
    const last=await create('munro','Último día','1199999999');
    await context('dueno',tenant,'munro,torcuato','2026-11-13');
    const after=await list('munro');
    assert.equal(after.find(r=>r.id===last.id).status,'expired');
    assert.equal(after.find(r=>r.id===first.id).status,'used');
    await assert.rejects(()=>redeem('munro',last.id),/vencido/);
    await assert.rejects(()=>rpc('select public.gestlok_resenas_update($1,$2,$3,$4) as result',['munro',last.id,'Otro','1199999999']),/pendientes/);
    // Después del 12 se registra igual: el cupón vale del 1 al 12 del mes siguiente.
    const tarde=await create('torcuato','Registrado el 13','1188888888');
    assert.equal(tarde.period,'2026-12-01');assert.equal(tarde.status,'pending');assert.equal(tarde.usable,false);
    await assert.rejects(()=>redeem('torcuato',tarde.id),/no está vigente/);
    // Cambio manual fuera de fecha: exige motivo, conserva sucursal y nunca reutiliza el cupón.
    const manualCoupon=await create('torcuato','Uso excepcional','1188776655');
    await assert.rejects(()=>manual('torcuato',manualCoupon.id,'corto'),/motivo/);
    await assert.rejects(()=>manual('munro',manualCoupon.id,'El cliente canjeó en caja'),/otra sucursal|corresponde al canje/);
    const manuallyUsed=await manual('torcuato',manualCoupon.id,'Descuento aplicado en mostrador');
    assert.equal(manuallyUsed.status,'used');
    assert.equal(manuallyUsed.local,'torcuato');
    assert.equal(manuallyUsed.code,manualCoupon.code);
    await assert.rejects(()=>manual('torcuato',manualCoupon.id,'No se puede usar dos veces'),/utilizado/);
    assert.equal((await manual('munro',last.id,'Canje registrado con demora')).status,'used',
      'Un vencido del local correcto puede marcarse usado de forma manual y auditada');
    // Modificar nombre y teléfono de un pendiente (el código no cambia); sin duplicar teléfono del período.
    const upd=await rpc('select public.gestlok_resenas_update($1,$2,$3,$4) as result',['torcuato',tarde.id,'Nombre corregido','+54 9 11 7777-6666']);
    assert.equal(upd.customer_name,'Nombre corregido');assert.equal(upd.phone,'1177776666');assert.equal(upd.code,tarde.code);
    await assert.rejects(()=>rpc('select public.gestlok_resenas_update($1,$2,$3,$4) as result',['munro',tarde.id,'Otra sucursal','1177776666']),/pendientes/);
    await create('torcuato','Otro cliente','1166665555');
    await assert.rejects(()=>rpc('select public.gestlok_resenas_update($1,$2,$3,$4) as result',['torcuato',tarde.id,'Duplicado','1166665555']),/ya tiene/);
    await context('dueno',tenant,'munro,torcuato','2026-12-01');
    assert.equal((await redeem('torcuato',tarde.id)).status,'used');
    const next=await create('munro','Beneficio mes siguiente','1122337788');
    assert.notEqual(next.code,first.code);assert.equal(next.status,'pending');
    assert.equal((await list('munro')).find(r=>r.id===first.id).status,'used');
    await db.exec('reset role; set role anon');
    await assert.rejects(()=>list('munro'),/permission denied/);
    await db.exec('reset role');
    assert.equal((await db.query("select count(*)::int n from gestlok_resenas_private.events where action='used'")).rows[0].n,2);
    assert.equal((await db.query("select count(*)::int n from gestlok_resenas_private.events where action='updated'")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from gestlok_resenas_private.events where action='manual_used'")).rows[0].n,2);
    assert.equal((await db.query("select count(*)::int n from gestlok_resenas_private.events where action='manual_used' and length(reason)>=8")).rows[0].n,2);
    // Ni con acceso directo se puede registrar un segundo uso del mismo cupón.
    await assert.rejects(()=>db.query("insert into gestlok_resenas_private.events(coupon_id,action,actor) values($1,'used',$2)",[first.id,'11111111-1111-4111-8111-111111111111']),/duplicate key/);
  } finally {await db.close();}
});
