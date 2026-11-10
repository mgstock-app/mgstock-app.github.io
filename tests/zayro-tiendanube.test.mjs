import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';

const script=readFileSync('public/stock/gestlok-tiendanube.js','utf8');
const schema=readFileSync('supabase/migrations/20261110145000_zayro_tiendanube_movimientos.sql','utf8');
const edge=readFileSync('supabase/functions/zayro-tiendanube-sync/index.ts','utf8');
const runtime=readFileSync('components/stock-runtime.tsx','utf8');
const owner=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
const sw=readFileSync('scripts/sw-template.js','utf8');
const layout=readFileSync('app/layout.tsx','utf8');
const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
function launch(role='dueno',email='camilab.lopez99@gmail.com',tenant=TENANT,hasAccess=true){
 const root={id:'gl-tn-root',hidden:true,innerHTML:''},listeners={};
 let exists=false;const calls=[];
 const document={
  querySelector:s=>s==='#gl-tn-root'&&exists?root:null,
  createElement:()=>root,body:{append(){exists=true;}},
  addEventListener:(name,cb)=>{listeners[name]=cb}
 };
 const order={order_id:'10',order_number:'100',order_status:'open',payment_status:'paid',
  fulfillment_status:'shipped',total_amount:'20000',currency:'ARS',item_count:1,
  shipping_method:'Correo Argentino',created_at_tn:'2026-11-10T12:00:00Z'};
 const db={
  auth:{getUser:async()=>({error:null,data:{user:{id:'uid',email}}})},
  from:(table)=>{
   calls.push(table);
   const q={select(){return q},eq(){return q},order(){return q},
    limit:async()=>({data:hasAccess?(table.endsWith('_state')?[{tenant_id:TENANT}]:[order]):[],error:null}),
    single:async()=>({data:{connection_state:'connected',last_sync_at:'2026-11-10T12:00:00Z',last_sync_count:1},error:null})};
   return q;
  },
  functions:{invoke:async()=>({data:{ok:true},error:null})}
 };
 const host={S:{me:{tenant_id:tenant,email}},role:()=>role,isCreadora:()=>role==='creadora',render(){}};
 const ctx={tenant_id:tenant,role:'dueno'};
 const history={state:{},pushState(next){this.state=next},back(){this.state={}}};
 const window={GestLokSupabase:db,history,addEventListener(){}};
 runInNewContext(script,{window,document,console,Intl,Date});
 return {mod:window.GestLokTiendaNube,ctx,host,root,calls,listeners};
}
test('La carpeta TiendaNube carga solamente para ZAYRO y aparece en el inicio',async()=>{
 assert.doesNotThrow(()=>new Script(script));
 assert.match(runtime,/gestlok-tiendanube\.js/);
 assert.match(owner,/GestLokTiendaNube\?\.refresh/);
 assert.match(sw,/gestlok-tiendanube\.js/);
 assert.match(layout,/gestlok-tiendanube\.css/);
 const a=launch();await a.mod.refresh(a.ctx,a.host);
 assert.equal(a.mod.authorized(),true);
 assert.match(a.mod.homeTile(),/TiendaNube/);
 await a.mod.open();
 assert.match(a.root.innerHTML,/Movimientos de TiendaNube/);
 assert.match(a.root.innerHTML,/#100/);
 assert.match(a.root.innerHTML,/Pagado/);
 assert.match(a.root.innerHTML,/Correo Argentino/);
 assert.doesNotMatch(a.root.innerHTML,/nombre del cliente/i);
});
test('Creadora entra; terceros y otros tenants no reciben la carpeta',async()=>{
 const admin=launch('creadora','kmu15lopez@gmail.com');
 await admin.mod.refresh(admin.ctx,admin.host);
 assert.equal(admin.mod.authorized(),true);
 for(const [role,email,tenant] of [
  ['dueno','otro@example.com',TENANT],
  ['gerente','camilab.lopez99@gmail.com',TENANT],
  ['dueno','camilab.lopez99@gmail.com','cb0dc04a-9a13-434f-a3d0-47f1d8f39670']
 ]){
  const d=launch(role,email,tenant);await d.mod.refresh(d.ctx,d.host);
  assert.equal(d.mod.authorized(),false);
  assert.equal(d.mod.homeTile(),'');
  assert.equal(d.calls.length,0);
 }
 const denied=launch('dueno','camilab.lopez99@gmail.com',TENANT,false);
 await denied.mod.refresh(denied.ctx,denied.host);
 assert.equal(denied.mod.authorized(),false,'La RLS es obligatoria aun en una cuenta con email autorizado');
});
test('RLS restringe lectura y no permite escrituras del navegador ni afectan caja/stock',()=>{
 assert.match(schema,/enable row level security/g);
 assert.match(schema,/gestlok_cami_creator_authorized/);
 assert.match(schema,/auth\.uid\(\)/);
 assert.match(schema,/revoke all on public\.gestlok_zayro_tn_orders/);
 assert.doesNotMatch(schema,/grant (insert|update|delete) on public\.gestlok_zayro_tn_/i);
 assert.doesNotMatch(schema,/disable row level security|drop table|\btruncate\b/i);
 assert.doesNotMatch(script,/TIENDANUBE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|gestlok_pilot_pos_sales|gestlok_pilot_products/);
});
test('Sin OAuth, la API se limita a read_orders y evita guardar datos de clientes',()=>{
 assert.match(edge,/TIENDANUBE_STORE_ID/);
 assert.match(edge,/TIENDANUBE_ACCESS_TOKEN/);
 assert.match(edge,/read_orders/);
 assert.match(edge,/getUser\(/);
 assert.match(edge,/gestlok_cami_creator_authorized/);
 assert.match(edge,/onConflict:'tenant_id,order_id'/);
 assert.match(edge,/order_id|order_number|payment_status/);
 assert.doesNotMatch(edge,/customer_email|customer_name|billing_address|shipping_address/);
 assert.doesNotMatch(edge,/from\('gestlok_pilot_products'\)|from\('gestlok_pilot_pos_sales'\)/);
});
