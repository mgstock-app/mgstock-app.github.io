import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';

const ui=readFileSync('public/stock/gestlok-precios-stock.js','utf8');
const migration=readFileSync('supabase/migrations/20261106035000_scanner_precio_final_manual.sql','utf8');
const tenant='11111111-1111-4111-8111-111111111111';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('Precio final manual: calcula porcentaje, respeta centavos y precio por debajo del costo',()=>{
 const listeners={};
 const ctx={window:{GestLokPilot:{authorized:()=>true}},document:{querySelector:()=>({}),addEventListener:(name,fn)=>{listeners[name]=fn;}},Intl,Date,Event:class Event{}};
 runInNewContext(ui,ctx);
 const api=ctx.window.GestLokPreciosStock;
 assert.equal(api.percentForSale(7625,15000),96.72);
 assert.equal(api.percentForSale(100,80),-20);
 assert.equal(api.percentForSale(0,2500),null);
 const fields={
  cost_price:{value:'7625'},markup_percent:{value:''},
  manual_sale_price:{value:''},pricing_mode:{value:'percentage'}
 };
 const selectors=['data-ps-sale','data-ps-profit','data-ps-suggested','data-ps-use-suggested'];
 const nodes=Object.fromEntries(selectors.map(x=>['['+x+']',{}]));
 const form={elements:{namedItem:key=>fields[key]},querySelector:key=>nodes[key]};
 const fire=name=>listeners.input({target:{name,form,matches:()=>false,closest:selector=>selector==='#gl-ps-price-form'?form:null}});
 const ARS=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);

 fields.manual_sale_price.value='15000';fire('manual_sale_price');
 assert.equal(fields.pricing_mode.value,'manual');
 assert.equal(fields.markup_percent.value,'96.72');
 assert.equal(nodes['[data-ps-sale]'].textContent,ARS(15000));
 assert.equal(nodes['[data-ps-profit]'].textContent,ARS(7375));

 fields.cost_price.value='8500';fire('cost_price');
 assert.equal(fields.manual_sale_price.value,'15000','el precio final queda fijo al cambiar el costo');
 assert.equal(fields.markup_percent.value,'76.47');
 assert.equal(nodes['[data-ps-profit]'].textContent,ARS(6500));

 fields.markup_percent.value='50';fire('markup_percent');
 assert.equal(fields.pricing_mode.value,'percentage');
 assert.equal(fields.manual_sale_price.value,'12750');
 assert.equal(nodes['[data-ps-sale]'].textContent,ARS(12750));

 fields.manual_sale_price.value='8000';fire('manual_sale_price');
 assert.equal(fields.markup_percent.value,'-5.88');
 assert.equal(nodes['[data-ps-profit]'].textContent,ARS(-500));
});

test('Precio final manual: guardado envía modo correcto, sin modificar otros tenants',async()=>{
 const listeners={},writes=[];
 const pendingQuery={
  eq(){return this;},order(){return this;},limit(){return Promise.resolve({data:[],error:null});},
  select(){return this;},maybeSingle(){return Promise.resolve({data:{id:'product-id'},error:null});}
 };
 const db={
  auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},
  from(table){assert.equal(table,'gestlok_pilot_products');return {
   insert:row=>{writes.push({type:'insert',row});return pendingQuery;},
   update:row=>{writes.push({type:'update',row});return pendingQuery;},
   select:()=>pendingQuery
  };}
 };
 const root={
  window:{GestLokPilot:{authorized:()=>true,tenantId:()=>tenant,rerender(){}},GestLokSupabase:db},
  document:{addEventListener:(event,callback)=>{listeners[event]=callback;},querySelector:()=>({})},
  Intl,Date,FormData:class {constructor(form){this.form=form;}entries(){return Object.entries(this.form.values);}}
 };
 runInNewContext(ui,root);
 // Simulate first pressing "Agregar producto" (editing='new').
 const add={matches:q=>q==='[data-ps-new]',dataset:{}};
 listeners.click({target:{closest:selector=>selector.includes('[data-ps-edit]')?add:null},preventDefault(){}});
 const makeForm=values=>({id:'gl-ps-price-form',values});
 const values={name:'Perfume de muestra',category:'Perfumes',cost_price:'7625',
  markup_percent:'96.72',manual_sale_price:'15000',pricing_mode:'manual'};
 listeners.submit({target:makeForm(values),preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(writes.length,1);
 assert.equal(writes[0].type,'insert');
 assert.equal(writes[0].row.tenant_id,tenant);
 assert.equal(writes[0].row.manual_sale_price,15000);
 assert.equal(writes[0].row.markup_percent,null);
 assert.equal(writes[0].row.cost_price,7625);
});

test('Migración: el servidor conserva el precio exacto, deriva recargo, protege cada negocio y no altera stock',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated;
   create schema auth;
   create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.uid',true),'')::uuid $$;
   create table public.gestlok_pilot_access(tenant_id uuid primary key,owner_uid uuid,enabled boolean,plan_code text);
   create table public.gestlok_pilot_products(
    tenant_id uuid, cost_price numeric(12,2),markup_percent numeric(7,2),
    unit_price numeric(12,2),stock_quantity integer,in_stock boolean
   );
   insert into public.gestlok_pilot_access values ('${tenant}','${owner}',true,'scanner');`);
  await db.exec(migration);
  await db.exec(`create trigger gl_pilot_product_calculate_prices
    before insert or update on public.gestlok_pilot_products
    for each row execute function public.gl_pilot_product_calculate_prices();`);
  await db.query("select set_config('request.uid',$1,false)",[owner]);
  const insert=await db.query(
   'insert into public.gestlok_pilot_products(tenant_id,cost_price,manual_sale_price,stock_quantity) values ($1,7625,15000,7) returning unit_price,markup_percent,stock_quantity',
   [tenant]
  );
  assert.equal(Number(insert.rows[0].unit_price),15000);
  assert.equal(Number(insert.rows[0].markup_percent),96.72);
  assert.equal(insert.rows[0].stock_quantity,7);
  const edit=await db.query(
   'update public.gestlok_pilot_products set cost_price=8500 where tenant_id=$1 returning unit_price,markup_percent,stock_quantity',
   [tenant]
  );
  assert.equal(Number(edit.rows[0].unit_price),15000);
  assert.equal(Number(edit.rows[0].markup_percent),76.47);
  assert.equal(edit.rows[0].stock_quantity,7);
  const percent=await db.query(
   'update public.gestlok_pilot_products set manual_sale_price=null,markup_percent=70 where tenant_id=$1 returning unit_price,markup_percent',
   [tenant]
  );
  assert.equal(Number(percent.rows[0].unit_price),14450);
  const below=await db.query(
   'update public.gestlok_pilot_products set manual_sale_price=8000 where tenant_id=$1 returning unit_price,markup_percent',
   [tenant]
  );
  assert.equal(Number(below.rows[0].unit_price),8000);
  assert.equal(Number(below.rows[0].markup_percent),-5.88);
  const zero=await db.query(
   'update public.gestlok_pilot_products set cost_price=0,manual_sale_price=2500 where tenant_id=$1 returning unit_price,markup_percent',
   [tenant]
  );
  assert.equal(Number(zero.rows[0].unit_price),2500);
  assert.equal(zero.rows[0].markup_percent,null);
  await db.query("select set_config('request.uid',$1,false)",['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
  await assert.rejects(db.query('update public.gestlok_pilot_products set manual_sale_price=1000 where tenant_id=$1',[tenant]));
 }finally{await db.close();}
});
