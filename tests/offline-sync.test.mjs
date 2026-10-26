import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {create,memoryStorage}=createRequire(import.meta.url)('../public/stock/gestlok-offline.js');

const base='https://offline-test.supabase.co',tenant='00000000-0000-4000-8000-000000000010';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const token=id=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:id,role:'authenticated'})).toString('base64url')+'.ficticio';
const tick=()=>new Promise(r=>setTimeout(r,5));

/* Servidor ficticio: misma forma de respuestas que PostgREST y recibos por operación. */
function harness(t){
 const store=memoryStorage(),receipts=new Map(),calls=[];
 const docs=new Map([['munro/productos|p1',{col:'munro/productos',id:'p1',data:{nombre:'Producto ficticio',stock:1}}],
  ['torcuato/productos|p9',{col:'torcuato/productos',id:'p9',data:{nombre:'Otro local',stock:3}}]]);
 const hojas=new Map([['hojas/h1',{path:'hojas/h1',organization_id:'org-1',data:{nombre:'Ana',horas:10,nota:'x'}}]]);
 const links=[{local_id:'munro',local_name:'Munro',url:'https://docs.google.com/spreadsheets/d/VIEJO/edit'}];
 let connected=true,who=A,loseReply=false,reject=null;
 const net=async(input,init={})=>{
  const req=new Request(input,init),url=new URL(req.url),path=url.pathname;
  if(!connected)throw new TypeError('Failed to fetch');
  const id=JSON.parse(Buffer.from(req.headers.get('authorization').split('.')[1],'base64url')).sub;
  const body=req.method==='GET'?null:await req.json().catch(()=>null);
  calls.push({path,method:req.method,body,who:id});
  const ok=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json'}});
  if(path.endsWith('/gestlok_sync_context'))return ok({actor:id,tenant});
  const run=p=>{
   if(p.kind==='rpc'&&p.name==='doc_update'){const k=p.args.p_col+'|'+p.args.p_id,d=docs.get(k);if(!d)throw Object.assign(Error('SYNC_MISSING'),{status:400});d.data={...d.data,...p.args.p_patch};return 1;}
   if(p.kind==='rpc'&&p.name==='importar_mercaderia'){if(reject)throw Object.assign(Error(reject),{status:400});return {importados:p.args.p_items.length};}
   if(p.kind==='rpc'&&p.name==='rm_app_set_branch_schedule_link'){links[0].url=p.args.p_url;return null;}
   if(p.kind==='table'&&p.table==='docs'){return p.rows.map(r=>{const k=r.key.col+'|'+r.key.id;if(p.method==='DELETE'){docs.delete(k);return null;}const row={...docs.get(k),...r.body,...r.key};docs.set(k,row);return row;});}
   if(p.kind==='table'&&p.table==='rm_test_documents'){return p.rows.map(r=>{const old=hojas.get(r.key.path);const data={...old.data};for(const x of r.data_merge?.unset||[])delete data[x];Object.assign(data,r.data_merge?.set||{},r.body?.data||{});const row={...old,data};hojas.set(r.key.path,row);return row;});}
   throw Object.assign(Error('SYNC_UNSUPPORTED'),{status:400});
  };
  if(path.endsWith('/gestlok_sync_apply')){
   const key=id+':'+body.p_id;if(receipts.has(key))return ok(receipts.get(key));
   try{const result=run(body.p_payload);receipts.set(key,result);if(loseReply){loseReply=false;throw new TypeError('respuesta perdida');}return ok(result);}
   catch(e){if(e instanceof TypeError)throw e;return ok({message:e.message,code:'P0001'},e.status||400);}
  }
  if(path.endsWith('/rpc/doc_update'))return ok(run({kind:'rpc',name:'doc_update',args:body}));
  if(path.endsWith('/rpc/importar_mercaderia'))return ok(run({kind:'rpc',name:'importar_mercaderia',args:body}));
  if(path.endsWith('/rpc/rm_app_branch_schedule_links'))return ok(structuredClone(links));
  if(path.endsWith('/rpc/rm_app_set_branch_schedule_link'))return ok(run({kind:'rpc',name:'rm_app_set_branch_schedule_link',args:body}));
  if(path==='/rest/v1/docs'&&req.method==='GET'){const col=url.searchParams.get('col');return ok([...docs.values()].filter(r=>!col||r.col===col.slice(3)).map(r=>({id:r.id,data:r.data,...(url.searchParams.get('select')==='*'?{col:r.col}:{})})));}
  if(path==='/rest/v1/docs'&&req.method==='POST'){for(const r of [].concat(body))docs.set(r.col+'|'+r.id,{...r});return new Response(null,{status:201});}
  if(path==='/rest/v1/rm_test_documents'&&req.method==='GET'){const p=url.searchParams.get('path');return ok([...hojas.values()].filter(r=>!p||r.path===p.slice(3)).map(r=>({data:r.data})));}
  return ok({message:'no encontrado'},404);
 };
 const engine=()=>create({store,online:()=>connected});
 let api=engine();
 const call=(path,{method='GET',body,id=who,headers={}}={})=>api.transport(base,'clave-publica',net)(base+path,{method,headers:{authorization:'Bearer '+token(id),apikey:'clave-publica','content-type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const bind=()=>{const prev=globalThis.fetch;globalThis.fetch=net;t.after(()=>{globalThis.fetch=prev;});api.attach({auth:{getSession:async()=>({data:{session:{user:{id:who},access_token:token(who)}},error:null})}},base,'/',{prepare:false});};
 return {store,docs,hojas,links,calls,call,bind,get api(){return api;},
  offline(){connected=false;},online(){connected=true;},as(id){who=id;},loseReply(){loseReply=true;},reject(m){reject=m;},
  reload(){api=engine();},syncCalls:()=>calls.filter(c=>c.path.endsWith('/gestlok_sync_apply'))};
}
const productos='/rest/v1/docs?select=id%2Cdata&col=eq.munro%2Fproductos';

test('sin conexión: el cambio queda en el equipo, se ve en pantalla y sobrevive a cerrar la app, sin tokens en la cola',async t=>{
 const h=harness(t);await h.call(productos);h.offline();
 const r=await h.call('/rest/v1/rpc/doc_update',{method:'POST',body:{p_col:'munro/productos',p_id:'p1',p_patch:{stock:4}}});
 assert.equal(await r.json(),1);assert.equal(h.docs.get('munro/productos|p1').data.stock,1);
 h.reload();const rows=await (await h.call(productos)).json();
 assert.equal(rows[0].data.stock,4);assert.equal(rows[0].data.nombre,'Producto ficticio');
 const pend=JSON.stringify(await h.api.list());assert.ok(pend.length>10);assert.ok(!pend.includes(token(A)));assert.ok(!/authorization|bearer/i.test(pend));
});

test('al volver internet se envía solo, una vez, con la misma cuenta y sin pisar otros campos',async t=>{
 const h=harness(t);await h.call(productos);h.offline();
 await h.call('/rest/v1/rpc/doc_update',{method:'POST',body:{p_col:'munro/productos',p_id:'p1',p_patch:{stock:4}}});
 await h.call('/rest/v1/docs',{method:'POST',body:{col:'munro/conteos',id:'c1',data:{fecha:1}},headers:{prefer:'resolution=merge-duplicates'}});
 h.online();h.bind();await h.api.flush();
 assert.equal(h.docs.get('munro/productos|p1').data.stock,4);assert.equal(h.docs.get('munro/productos|p1').data.nombre,'Producto ficticio');
 assert.deepEqual(h.docs.get('munro/conteos|c1').data,{fecha:1});
 assert.equal((await h.api.list()).length,0);assert.equal(h.syncCalls().length,2);assert.ok(h.syncCalls().every(c=>c.who===A));
});

test('si se pierde la respuesta, el reintento usa el mismo id y no duplica',async t=>{
 const h=harness(t);await h.call(productos);h.offline();
 await h.call('/rest/v1/rpc/importar_mercaderia',{method:'POST',body:{p_local:'munro',p_items:[{id:'p1',cantidad:2}]}});
 h.online();h.bind();h.loseReply();await h.api.flush();
 assert.equal((await h.api.list()).length,1);await h.api.flush();
 const ids=h.syncCalls().map(c=>c.body.p_id);assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
 assert.equal((await h.api.list()).length,0);
});

test('un cambio rechazado por el servidor queda para revisión y no se pierde',async t=>{
 const h=harness(t);await h.call(productos);h.offline();
 await h.call('/rest/v1/rpc/doc_update',{method:'POST',body:{p_col:'munro/productos',p_id:'p1',p_patch:{stock:4}}});
 h.docs.delete('munro/productos|p1');h.online();h.bind();await h.api.flush();
 const [op]=await h.api.list();assert.equal(op.state,'blocked');assert.match(op.error,/ya no existe/);
 await h.api.discard(op.id);assert.equal((await h.api.list()).length,0);
});

test('otra cuenta en el mismo equipo no ve ni envía los pendientes de la anterior',async t=>{
 const h=harness(t);await h.call(productos);h.offline();
 await h.call('/rest/v1/rpc/doc_update',{method:'POST',body:{p_col:'munro/productos',p_id:'p1',p_patch:{stock:4}}});
 h.as(B);h.online();await h.call(productos);h.bind();await h.api.flush();
 assert.equal((await h.api.list()).length,0);assert.equal(h.docs.get('munro/productos|p1').data.stock,1);assert.equal(h.syncCalls().length,0);
 h.as(A);await h.call(productos);h.bind();await h.api.flush();assert.equal(h.docs.get('munro/productos|p1').data.stock,4);
});

test('con internet y sin pendientes, el guardado común sigue yendo directo como antes',async t=>{
 const h=harness(t);await h.call(productos);
 const r=await h.call('/rest/v1/rpc/doc_update',{method:'POST',body:{p_col:'munro/productos',p_id:'p1',p_patch:{stock:6}}});
 assert.equal(await r.json(),1);assert.equal(h.syncCalls().length,0);assert.ok(h.calls.some(c=>c.path.endsWith('/rpc/doc_update')));
});

test('operaciones no repetibles usan recibo aun con internet y los errores llegan a la pantalla',async t=>{
 const h=harness(t);h.bind();await h.call(productos);
 let r=await h.call('/rest/v1/rpc/importar_mercaderia',{method:'POST',body:{p_local:'munro',p_items:[{id:'p1'}]}});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{importados:1});assert.equal(h.syncCalls().length,1);
 h.reject('MGS:duplicado El remito ya se importó');
 r=await h.call('/rest/v1/rpc/importar_mercaderia',{method:'POST',body:{p_local:'munro',p_items:[{id:'p2'}]}});
 assert.equal(r.status,400);assert.match((await r.json()).message,/MGS:duplicado/);assert.equal((await h.api.list()).length,0);
});

test('una sección nunca abierta avisa que falta descargarla; una ya descargada se lee filtrada',async t=>{
 const h=harness(t);await h.call(productos);h.offline();
 const r=await h.call('/rest/v1/docs?select=id%2Cdata&col=eq.torcuato%2Fproductos');assert.equal(r.status,503);
 h.online();await h.call('/rest/v1/docs?select=*&offset=0&limit=1000');h.offline();
 const rows=await (await h.call('/rest/v1/docs?select=id%2Cdata&col=eq.torcuato%2Fproductos')).json();
 assert.deepEqual(rows.map(x=>x.id),['p9']);
});

test('planillas de empleados: sin conexión viajan solo los campos cambiados',async t=>{
 const h=harness(t);await h.call('/rest/v1/rm_test_documents?select=data&path=eq.hojas%2Fh1&organization_id=eq.org-1');h.offline();
 const r=await h.call('/rest/v1/rm_test_documents?path=eq.hojas%2Fh1&organization_id=eq.org-1&select=path',{method:'PATCH',body:{data:{nombre:'Ana',horas:12}},headers:{accept:'application/vnd.pgrst.object+json',prefer:'return=representation'}});
 assert.equal(r.status,200);assert.equal((await r.json()).path,'hojas/h1');
 const [op]=await h.api.list();assert.deepEqual(op.payload.rows[0].data_merge,{set:{horas:12},unset:['nota']});
 h.hojas.get('hojas/h1').data.extra='de otro equipo';h.online();h.bind();await h.api.flush();
 assert.deepEqual(h.hojas.get('hojas/h1').data,{nombre:'Ana',horas:12,extra:'de otro equipo'});
});

test('Horarios: el enlace cambiado sin conexión se muestra hasta enviarse',async t=>{
 const h=harness(t);const q={p_local:'munro',p_company:null};await h.call('/rest/v1/rpc/rm_app_branch_schedule_links',{method:'POST',body:q});h.offline();
 const s=await h.call('/rest/v1/rpc/rm_app_set_branch_schedule_link',{method:'POST',body:{p_local:'munro',p_url:'https://docs.google.com/spreadsheets/d/NUEVO/edit'}});
 assert.equal(s.status,202);assert.equal((await s.json()).gl_pending,true);
 const rows=await (await h.call('/rest/v1/rpc/rm_app_branch_schedule_links',{method:'POST',body:q})).json();assert.match(rows[0].url,/NUEVO/);
 h.online();h.bind();await h.api.flush();assert.match(h.links[0].url,/NUEVO/);
});

test('las dos áreas cargan el motor sin conexión y el service worker lo guarda',()=>{
 const runtime=readFileSync('components/stock-runtime.tsx','utf8'),auth=readFileSync('public/stock/auth.js','utf8');
 const browser=readFileSync('modules/empleados/lib/supabase/browser.ts','utf8'),layout=readFileSync('modules/empleados/app/layout.tsx','utf8');
 const sw=readFileSync('scripts/sw-template.js','utf8');
 assert.ok(runtime.indexOf('/stock/gestlok-offline.js')<runtime.indexOf('/stock/auth.js'));
 assert.match(auth,/GestLokOffline\.transport\(CFG\.url, CFG\.key\)/);assert.match(auth,/GestLokOffline\.attach\(/);
 assert.match(browser,/GestLokOffline/);assert.match(layout,/stock\/gestlok-offline\.js/);
 assert.match(sw,/'\/stock\/gestlok-offline\.js'/);assert.match(sw,/__EMPLEADOS_PRECACHE__/);
});

test('borrar necesita conexión: sin internet no se encola y avisa', async t => {
 const h = harness(t); await h.call(productos); h.offline();
 const r = await h.call('/rest/v1/docs?col=eq.munro%2Fproductos&id=eq.p1', {method: 'DELETE'});
 assert.equal(r.status, 503); assert.match((await r.json()).message, /borrar necesitás internet/);
 assert.equal((await h.api.list()).length, 0);
});
