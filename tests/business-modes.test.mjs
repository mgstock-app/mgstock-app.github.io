import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const file = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const commerce = file('public/stock/gestlok-commerce.js');
const app = file('public/stock/app.js');

function loadCommerce(role = 'dueno') {
  const handlers = {};
  const rows = [];
  const saved = [];
  const state = {db:{}, loaded:{e:true}, me:{email:'duena@demo.invalid',tenant_id:'11111111-1111-4111-8111-111111111111'},offline:false,local:'sucursal-centro',view:'inicio'};
  const root = {confirm:() => true};
  const document = {addEventListener:(event,fn)=>{handlers[event]=fn;},querySelector:()=>null};
  new Script(commerce).runInNewContext({window:root,document,Date,Number,String,Object,Array});
  const api = root.GestLokCommerce;
  const ctx = {
    S:state,miRol:()=>role,canW:()=>role!=='lectura',toast:()=>{},fail:e=>{throw e;},
    localNombre:()=> 'Sucursal Centro',render:()=>{},go:()=>{},
    C:col=>({
      doc:id=>({get:async()=>({exists:false}),set:async d=>saved.push({col,id,d}),update:async d=>saved.push({col,id,d})}),
      add:async d=>{rows.push({col,d});}
    })
  };
  api.attach(ctx);
  return {handlers,saved,rows,api,state};
}

test('Se presentan las tres modalidades y la dueña puede elegirlas', async () => {
  const {api,handlers,saved} = loadCommerce();
  assert.doesNotThrow(()=>new Script(commerce));
  for (const label of ['Tienda física','Tienda online','Tienda mixta']) assert.ok(api.card().includes(label));
  handlers.click({target:{closest:selector=>selector==='[data-commerce-mode]'?{dataset:{commerceMode:'online'}}:null},preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saved.length,1);
  assert.equal(saved[0].col,'configuracion_negocio');
  assert.equal(saved[0].id,'empresa-11111111-1111-4111-8111-111111111111');
  assert.equal(saved[0].d.tipo,'online');
  assert.equal(api.online(),true);
});

test('Gerentes y perfiles de lectura no pueden cambiar la modalidad', async () => {
  for (const role of ['gerente','lectura']) {
    const {api,handlers,saved} = loadCommerce(role);
    handlers.click({target:{closest:()=>({dataset:{commerceMode:'mixta'}})},preventDefault(){}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(saved.length,0);
    assert.equal(api.mode(),'fisica');
    assert.match(api.card(),/disabled/);
  }
});

test('Online y mixta muestran pedidos por sucursal y conservan los registros al cambiar', () => {
  const {api}=loadCommerce();
  api.config({tipo:'mixta'});
  api.orders('sucursal-centro',[{id:'p1',cliente:'Cliente ficticio',producto:'Cuaderno',cantidad:2,estado:'nuevo',canal:'web',fecha:1}]);
  assert.match(api.view(),/Cliente ficticio/);
  assert.match(api.summary(),/1 pedidos pendientes/);
  assert.match(api.view(),/no modifica automáticamente el stock/);
  api.config({tipo:'fisica'});
  assert.equal(api.online(),false);
  api.config({tipo:'online'});
  assert.match(api.view(),/Cliente ficticio/);
  api.orders('sucursal-norte',[{id:'p2',cliente:'Otra sucursal',producto:'Lapicera',cantidad:1,estado:'nuevo',canal:'web',fecha:2}]);
  assert.doesNotMatch(api.view(),/Otra sucursal/);
});

test('Las rutas cambian según modalidad y se conserva el Conteo diario exclusivo de Munro', () => {
  assert.match(app,/window\.GestLokCommerce\?\.online\(\)/);
  assert.match(app,/if \(S\.view === 'pedidos-online'\)/);
  assert.match(app,/S\.db\.collection\('configuracion_negocio'\)/);
  assert.match(app,/C\('pedidos_online'\)/);
  assert.match(app,/puedeVerDiarioMunro\(\)/);
  assert.match(file('components/stock-runtime.tsx'),/load\("\/stock\/gestlok-commerce\.js"\)/);
});

test('El acceso a configuración de empresa queda limitado por RLS y tenant', () => {
  const migration=file('supabase/migrations/20261024_gestlok_business_modes.sql');
  assert.match(migration,/gestlok_tenant_fence/);
  assert.match(migration,/gestlok_tenancy\.current_tenant_id\(\)/);
  assert.match(migration,/public\.es_miembro\(\)/);
  assert.match(migration,/public\.mi_rol\(\) in \('creadora','dueno'\)/);
  assert.doesNotMatch(migration,/\bdrop table\b|\btruncate\b/i);
});
