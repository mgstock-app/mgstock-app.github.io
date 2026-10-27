import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261025_gestlok_demo_estadisticas_admin.sql');
const visitor=read('public/stock/gestlok-visitor-demo.js');
const metrics=read('public/stock/gestlok-demo-metrics.js');
const app=read('public/stock/app.js');
const runtime=read('components/stock-runtime.tsx');

test('Métricas no exponen datos personales ni permisos del negocio',()=>{
 assert.match(sql,/create schema if not exists gestlok_demo/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on gestlok_demo\.visitas from public, anon, authenticated/);
 assert.match(sql,/grant execute on function public\.gestlok_demo_registrar\(uuid,text,text\) to anon/);
 assert.match(sql,/grant execute on function public\.gestlok_demo_resumen\(\) to authenticated/);
 assert.match(sql,/public\.es_creadora\(\)/);
 assert.match(sql,/p_rol not in \('dueno','gerente'\)/);
 assert.match(sql,/p_tienda not in \('mercado','nova'\)/);
 assert.doesNotMatch(sql,/\b(email|telefono|ip_address|nombre_cliente)\b/i);
 assert.match(visitor,/STATS_CHOICE/);
 assert.match(visitor,/if\(choice==='yes'\)recordDemoChoice\(\)/);
 assert.match(visitor,/gestlok_demo_registrar/);
 assert.match(runtime,/gestlok-demo-metrics\.js/);
 assert.match(app,/GestLokDemoMetrics\?\.view/);
 assert.match(app,/GestLokDemoMetrics\?\.attach\(\{isCreadora,renderHub\}\)/);
});
test('La administradora obtiene agregados; gerente y dueña no ven métricas',async()=>{
 assert.doesNotThrow(()=>new vm.Script(metrics));
 const callbacks={},window={GestLokSupabase:{async rpc(name){
  assert.equal(name,'gestlok_demo_resumen');
  return {data:{sesiones:3,duena:2,gerente:2,ambos:1,mercado:1,nova:3,ultimos7:3},error:null};
 }}};
 const document={addEventListener:(type,handler)=>{callbacks[type]=handler;}};
 const ctx={window,document,queueMicrotask,Number,Date,String,Array,Object};
 new vm.Script(metrics).runInNewContext(ctx);
 let redraw=0,creator=false;
 window.GestLokDemoMetrics.attach({isCreadora:()=>creator,renderHub:()=>redraw++});
 assert.equal(window.GestLokDemoMetrics.view(),'');
 creator=true;
 window.GestLokDemoMetrics.view();
 for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
 const html=window.GestLokDemoMetrics.view();
 assert.match(html,/Sesiones registradas/);
 assert.match(html,/>3<\/strong>/);
 assert.match(html,/Exploraron Dueña/);
 assert.match(html,/Probaron ambos roles/);
 assert.ok(redraw>0);
 creator=false;
 assert.equal(window.GestLokDemoMetrics.view(),'');
});
test('Visitante rechaza y usa demo sin enviar analíticas. Si acepta, envía solo rol, tienda y UUID.',async()=>{
 let requests=[],events={},client;
 const store=new Map();
 const sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const consent={id:'gl-demo-consent',setAttribute(){},remove(){},innerHTML:''};
 const bar={append(){}};
 const dom={
  addEventListener(type,cb){(events[type]??=[]).push(cb);},
  getElementById(id){return id==='gl-visitor-bar'?bar:id==='gl-demo-consent'?consent:null;},
  createElement(){return {setAttribute(){},innerHTML:'',id:'',className:''};},
  documentElement:{classList:{add(){}}},
  body:{prepend(){}}
 };
 const window={SPM_CONFIG:{url:'https://fake.invalid',key:'public'},
  supabase:{createClient(){client={auth:{async getSession(){return {data:{session:null}}}},
   async rpc(name,args){requests.push({name,args});return {data:true,error:null};}};return client;}}};
 const location={search:'?demo=1&shop=nova&role=gerente',pathname:'/'};
 const ctx={window,sessionStorage,document:dom,location,console,
  crypto:{randomUUID:()=> '12345678-1234-4234-8234-123456789abc'},
  URLSearchParams,Date,Math,Map,Set,Object,Array,JSON,String,Number,Promise,
  queueMicrotask,encodeURIComponent,Blob,setTimeout,clearTimeout};
 vm.runInNewContext(visitor,ctx);
 await window.claude.use('db');
 assert.equal(requests.length,0);
 const rejection={dataset:{visitorStats:'no'}};
 for(const h of events.click)h({target:{closest:s=>s==='[data-visitor-stats]'?rejection:null},preventDefault(){}});
 assert.equal(requests.length,0);
 assert.equal(sessionStorage.getItem('gestlok:demo:stats-choice:v1'),'no');
 // Segunda sesión: test independiente con autorización de estadísticas.
 store.set('gestlok:demo:stats-choice:v1','yes');
 const ctx2={...ctx,window:{...window},location:{search:'?demo=1&shop=mercado&role=dueno',pathname:'/'}};
 vm.runInNewContext(visitor,ctx2);
 await ctx2.window.claude.use('db');
 assert.equal(requests.length,1);
 assert.equal(requests[0].name,'gestlok_demo_registrar');
 assert.equal(requests[0].args.p_rol,'dueno');
 assert.equal(requests[0].args.p_tienda,'mercado');
 assert.equal(requests[0].args.p_sesion,'12345678-1234-4234-8234-123456789abc');
 assert.deepEqual(Object.keys(requests[0].args).sort(),['p_rol','p_sesion','p_tienda'].sort());
});
