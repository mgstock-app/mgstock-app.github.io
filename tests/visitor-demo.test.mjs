import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const visitor=read('public/stock/gestlok-visitor-demo.js');
const auth=read('public/stock/auth.js');
const runtime=read('components/stock-runtime.tsx');
const app=read('public/stock/app.js');
const css=read('app/globals.css');

test('El visitante utiliza los módulos operativos reales con backend de memoria',()=>{
 assert.doesNotThrow(()=>new vm.Script(visitor));
 assert.match(auth,/Explorar demo interactiva · Sin registrarme/);
 assert.match(runtime,/visitor \? "\/stock\/gestlok-visitor-demo\.js" : "\/stock\/auth\.js"/);
 assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-push\.js"\)/);
 assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-support\.js"\)/);
 for(const m of ['gestlok-updates','gestlok-commerce','gestlok-tienda',
  'gestlok-provider-pdf','app.js'])assert.ok(runtime.includes(m));
 assert.match(visitor,/window\.claude=Object\.freeze/);
 assert.match(visitor,/window\.GestLokSupabase=sb/);
 assert.match(visitor,/data-visitor-notif/);
 assert.match(visitor,/demo.invalid/);
 assert.match(visitor,/client\.auth\.getSession/);
 assert.match(visitor,/if\(data\?\.session\)\{location\.replace\(location\.pathname\)/);
 assert.doesNotMatch(visitor,/fetch\(|\.supabase\.co\/rest\/v1/);
 assert.match(visitor,/sessionStorage/);
 assert.match(css,/#gl-visitor-bar/);
});

test('La demo conserva cambios exclusivamente en memoria y simula 2 tiendas y 2 roles',async()=>{
 const store=new Map();
 const sessionStorage={
  getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)
 };
 let networkCreates=0;
 const window={
  SPM_CONFIG:{url:'https://fake.local',key:'anon-safe'},
  supabase:{createClient(){
    networkCreates++;
    return {auth:{async getSession(){return {data:{session:null}}}}};
  }}
 };
 const listeners=new Map(),dom={
  getElementById(){return null;},
  addEventListener:(k,f)=>listeners.set(k,f),
  documentElement:{classList:{add(){}}},
  body:{prepend(){}}
 };
 const location={search:'?demo=1&shop=nova&role=gerente',pathname:'/'};
 const context={window,document:dom,location,sessionStorage,
  URLSearchParams,Date,Math,Map,Set,Object,Array,JSON,String,Number,Promise,
  console,queueMicrotask,setTimeout,clearTimeout,encodeURIComponent,Blob};
 vm.runInNewContext(visitor,context);
 const db=await window.claude.use('db'),user=await window.claude.use('user');
 const me=await user.me();
 assert.equal(me.rol,'gerente');
 assert.equal(me.tenant_id,'demo-empresa-nova');
 assert.deepEqual(Array.from(me.locales),['nova']);
 assert.equal(networkCreates,1,'Solo se consulta el estado de sesión');
 const locales=await db.collection('locales').get();
 assert.equal(locales.size,1);
 assert.equal(locales.docs[0].data().nombre,'Nova Indumentaria');
 const ps=await db.collection('nova/productos').get();
 assert.equal(ps.docs.length,500);
 assert.ok(ps.docs.every(p=>p.data().sku.startsWith('NV-')));
 const t=ps.docs[0].id;
 const before=ps.docs[0].data().stock;
 await db.collection('nova/productos').doc(t).update({stock:before+10});
 const again=await db.collection('nova/productos').doc(t).get();
 assert.equal(again.data().stock,before+10);
 const r=await window.GestLokSupabase.rpc('gestlok_catalogo_pagina',{
   p_tienda:'tienda-demo-nova',p_consulta:'',p_estado:'activos',
   p_limite:50
 });
 assert.equal(r.data.items.length,50);
 assert.equal(r.data.hasMore,true);
 assert.equal(store.has('gestlok:visitor:demo:v1'),true);
 const json=store.get('gestlok:visitor:demo:v1');
 assert.ok(!json.includes('supabase.co'));
 assert.ok(JSON.parse(json).mercado.docs['mercado/productos']);
});
