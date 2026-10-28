/* GESTLOK · modo sin conexión de las dos áreas
   («Administrar mi empresa» y «Administrar a los empleados»).

   - Guarda en este equipo (IndexedDB) una copia de lo que cada cuenta YA puede ver,
     separada por cuenta y empresa. Nunca guarda tokens ni contraseñas.
   - Sin internet, las lecturas salen de esa copia y las escrituras quedan en una cola
     local. Al volver la conexión se envían solas, en orden y una sola vez cada una
     (el servidor guarda un recibo por operación), con la sesión vigente de la misma cuenta.
   - No amplía permisos: el servidor vuelve a aplicar RLS y las reglas de cada función. */
(function(root){
'use strict';
const DB_NAME='gestlok-offline-v2';
/* Tablas que se pueden editar sin conexión (clave primaria conocida). */
const PK={docs:['col','id'],rm_test_documents:['path'],rm_app_settings:['owner_id','organization_id','path']};
/* Funciones de solo lectura: se guardan para consultarlas sin conexión. */
const READS=new Set(['mi_acceso','mi_rol','rm_app_me','rm_app_organizations','rm_app_locals','rm_app_users','rm_app_owner_count',
 'rm_app_access_state','rm_app_open_report','rm_app_report_image','rm_app_access_requests','rm_app_schedule_context',
 'rm_app_branch_schedule_links','gestlok_owner_area_context','gestlok_gerente_area_context','gestlok_creator_dashboard',
 'gestlok_creator_editing_state','gestlok_creator_support_state','gestlok_creator_companies_index','gestlok_creator_audit',
 'gestlok_creator_list_companies','gestlok_creator_registration_requests','gestlok_my_registration','gestlok_catalogo_pagina',
 'gestlok_catalogo_resumen','gestlok_catalogo_categorias','gestlok_support_config',
 'gestlok_resenas_list']);
/* Funciones que guardan datos y pueden quedar pendientes. */
const WRITES=new Set(['doc_update','importar_mercaderia','gestlok_proveedor_guardar_historial','rm_app_save_schedule',
 'rm_app_set_branch_schedule_link','rm_app_schedule_comment','rm_app_record_whatsapp']);
/* No idempotentes: siempre pasan por el recibo del servidor, aun con internet. */
const ONCE=new Set(['importar_mercaderia','gestlok_proveedor_guardar_historial','rm_app_save_schedule','rm_app_schedule_comment','rm_app_record_whatsapp']);
const META=new Set(['select','order','limit','offset','on_conflict','columns']);
const PREPARE_EVERY=6*3600e3;

const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const canonical=x=>JSON.stringify(sortKeys(x));
function sortKeys(x){if(Array.isArray(x))return x.map(sortKeys);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,sortKeys(x[k])]));return x===undefined?null:x;}
const pkOf=(table,row)=>{const ks=PK[table];if(!ks||!row)return null;const v=ks.map(k=>row[k]);return v.every(x=>x!=null&&x!=='')?JSON.stringify(v):null;};
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value===undefined?null:value),{status,headers:{'content-type':'application/json; charset=utf-8',...extra}});
const isNetworkError=e=>!!e&&(e.name==='TypeError'||/fetch|network|load failed|conexi/i.test(String(e.message||'')));
function subOf(headers){
 try{const t=(headers.get('authorization')||'').replace(/^Bearer\s+/i,'');const part=t.split('.')[1];if(!part)return null;
  const s=part.replace(/-/g,'+').replace(/_/g,'/');const pad=s+'='.repeat((4-s.length%4)%4);
  const txt=root.atob?root.atob(pad):Buffer.from(pad,'base64').toString('binary');const claims=JSON.parse(txt);
  return claims.role==='anon'?null:(claims.sub||null);}catch{return null;}
}

/* ---------- Almacenamiento local (IndexedDB) ---------- */
function storage(){
 let opened;
 const db=()=>opened??=(new Promise((resolve,reject)=>{
  const r=root.indexedDB.open(DB_NAME,1);
  r.onupgradeneeded=()=>{const s=r.result.createObjectStore('records');s.createIndex('bucket','bucket');s.createIndex('group','group');};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 }));
 async function tx(mode,fn){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('records',mode),s=t.objectStore('records');let out;const q=fn(s);if(q)q.onsuccess=()=>{out=q.result;};t.oncomplete=()=>resolve(out);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Almacenamiento lleno'));});}
 return {
  get:k=>tx('readonly',s=>s.get(k)),
  put:(k,v)=>tx('readwrite',s=>s.put(v,k)),
  putMany:entries=>entries.length?tx('readwrite',s=>{for(const [k,v] of entries)s.put(v,k);}):Promise.resolve(),
  remove:k=>tx('readwrite',s=>s.delete(k)),
  removeMany:keys=>keys.length?tx('readwrite',s=>{for(const k of keys)s.delete(k);}):Promise.resolve(),
  bucket:name=>tx('readonly',s=>s.index('bucket').getAll(name)),
  group:name=>tx('readonly',s=>s.index('group').getAll(name)),
  keys:()=>tx('readonly',s=>s.getAllKeys())
 };
}
/* Mismo contrato en memoria (pruebas y navegadores sin IndexedDB). */
function memoryStorage(){
 const m=new Map();
 return {get:async k=>clone(m.get(k)),put:async(k,v)=>{m.set(k,clone(v));},putMany:async e=>{for(const [k,v] of e)m.set(k,clone(v));},
  remove:async k=>{m.delete(k);},removeMany:async ks=>{for(const k of ks)m.delete(k);},
  bucket:async n=>[...m.values()].filter(v=>v&&v.bucket===n).map(clone),group:async n=>[...m.values()].filter(v=>v&&v.group===n).map(clone),
  keys:async()=>[...m.keys()],_map:m};
}

/* ---------- Filtros de PostgREST que se pueden reproducir sin conexión ---------- */
function filtersOf(url){
 const out=[];
 for(const [k,raw] of url.searchParams){
  if(META.has(k))continue;
  const i=raw.indexOf('.');if(i<0)return null;
  let op=raw.slice(0,i),val=raw.slice(i+1),neg=false;
  if(op==='not'){const j=val.indexOf('.');if(j<0)return null;neg=true;op=val.slice(0,j);val=val.slice(j+1);}
  if(!['eq','neq','like','ilike','in','is','gt','gte','lt','lte'].includes(op)||k==='or'||k==='and')return null;
  out.push({k,op,val,neg});
 }
 return out;
}
const eqOnly=f=>f&&f.every(x=>x.op==='eq'&&!x.neg)?Object.fromEntries(f.map(x=>[x.k,x.val])):null;
function test1(row,{k,op,val}){
 const v=row[k],s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);
 switch(op){
  case 'eq':return v!=null&&s===val;
  case 'neq':return s!==val;
  case 'like':case 'ilike':{const re=new RegExp('^'+val.split(/[%*]/).map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$',op==='ilike'?'i':'');return re.test(s);}
  case 'in':{const list=val.replace(/^\(|\)$/g,'').split(',').map(x=>x.trim().replace(/^"|"$/g,''));return list.includes(s);}
  case 'is':return val==='null'?v==null:val==='true'?v===true:val==='false'?v===false:false;
  case 'gt':return s>val;case 'gte':return s>=val;case 'lt':return s<val;case 'lte':return s<=val;
 }
 return false;
}
const matches=(row,f)=>f.every(x=>x.neg?!test1(row,x):test1(row,x));
function shape(rows,url,headers){
 const order=url.searchParams.get('order');
 if(order){const parts=order.split(',').map(p=>{const [k,dir='asc']=p.split('.');return {k,desc:dir==='desc'};});
  rows.sort((a,b)=>{for(const {k,desc} of parts){const x=a[k],y=b[k];if(x===y)continue;if(x==null)return 1;if(y==null)return -1;const c=x<y?-1:1;return desc?-c:c;}return 0;});}
 const total=rows.length;let from=Number(url.searchParams.get('offset')||0),count=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):Infinity;
 const range=headers.get('range');if(range&&/^\d+-\d+$/.test(range)){const [a,b]=range.split('-').map(Number);from=a;count=b-a+1;}
 let out=rows.slice(from,from+count);
 const sel=url.searchParams.get('select');
 if(sel&&sel!=='*'&&/^[a-z0-9_,]+$/i.test(sel)){const cols=sel.split(',');out=out.map(r=>Object.fromEntries(cols.filter(c=>c in r).map(c=>[c,r[c]])));}
 const end=out.length?from+out.length-1:from;
 return {rows:out,total,range:out.length?`${from}-${end}/${total}`:`*/${total}`};
}
const fullRead=(url,headers,n)=>{const off=Number(url.searchParams.get('offset')||0),lim=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):null,range=headers.get('range');
 if(off)return false;if(range){const [a,b]=range.split('-').map(Number);return a===0&&n<b-a+1;}return lim==null||n<lim;};

function create(options={}){
 const store=options.store||(root.indexedDB?storage():memoryStorage());
 const online=options.online||(()=>root.navigator?.onLine!==false);
 const now=options.now||Date.now;
 const uuid=options.uuid||(()=>root.crypto.randomUUID());
 const contexts=new Map(),listeners=new Set(),results=new Map();
 let active=null,auth=null,flushing=null,seq=0,lastError='',unsupported=false,lastSent=0;
 const demo={on:false,items:[]};

 const scope=c=>c.actor+':'+(c.tenant||'none');
 const opsOf=async c=>(await store.bucket('ops|'+scope(c))).filter(o=>o&&o.type==='operation').sort((a,b)=>a.created-b.created||a.order-b.order);
 async function state(){
  if(demo.on)return {online:online(),pending:demo.items.length,blocked:0,busy:false,error:'',items:demo.items.map(x=>({...x,state:'pending'})),sent:lastSent,demo:true};
  const items=active?await opsOf(active):[];
  return {online:online(),pending:items.filter(o=>o.state!=='blocked').length,blocked:items.filter(o=>o.state==='blocked').length,busy:!!flushing,error:lastError,items,sent:lastSent,demo:false};
 }
 async function notify(){const s=await state();for(const f of listeners){try{f(s);}catch{}}}

 /* ---------- Identidad: cuenta + empresa, comprobadas por el servidor ---------- */
 async function context(headers,base,net){
  const actor=subOf(headers);if(!actor||unsupported)return null;
  let c=contexts.get(actor)||await store.get('identity|'+actor).catch(()=>null);
  if(online()&&(!c||now()-c.checked>60000)){
   try{
    const r=await net(base+'/rest/v1/rpc/gestlok_sync_context',{method:'POST',headers:{authorization:headers.get('authorization'),apikey:headers.get('apikey')||'','content-type':'application/json'},body:'{}',cache:'no-store'});
    if(r.status===404){unsupported=true;return null;}
    if(r.ok){const v=await r.json();if(v&&v.actor===actor){c={actor,tenant:v.tenant||null,checked:now()};await store.put('identity|'+actor,c).catch(()=>{});}}
   }catch{}
  }
  if(!c)return null;
  contexts.set(actor,c);
  if(!active||scope(active)!==scope(c)){active=c;void notify();root.setTimeout?.(()=>void flush(),0);}
  return c;
 }

 /* ---------- Filas guardadas en el equipo ---------- */
 const rowKey=(c,table,row)=>'row|'+scope(c)+'|'+table+'|'+pkOf(table,row);
 const bucketOf=(c,table,row)=>'rows|'+scope(c)+'|'+table+'|'+(table==='docs'?row.col:'');
 const rowRecord=(c,table,row)=>[rowKey(c,table,row),{type:'row',bucket:bucketOf(c,table,row),group:'rows|'+scope(c)+'|'+table,row,at:now()}];
 async function cachedRows(c,table,eq){
  const list=table==='docs'&&eq&&eq.col!=null?await store.bucket('rows|'+scope(c)+'|docs|'+eq.col):await store.group('rows|'+scope(c)+'|'+table);
  return list.filter(x=>x&&x.type==='row').map(x=>x.row);
 }
 async function rememberRows(c,table,url,headers,value){
  const f=filtersOf(url),eq=eqOnly(f)||{};
  const rows=(Array.isArray(value)?value:value?[value]:[]).map(r=>({...eq,...r}));
  if(!rows.every(r=>pkOf(table,r)))return false;
  /* Una sola lectura del equipo por respuesta (no una por fila). */
  const before=await cachedRows(c,table,eq).catch(()=>[]),known=new Map(before.map(r=>[pkOf(table,r),r]));
  await store.putMany(rows.map(r=>rowRecord(c,table,{...(known.get(pkOf(table,r))||{}),...r})));
  if(f&&fullRead(url,headers,rows.length)){
   const keep=new Set(rows.map(r=>pkOf(table,r)));
   const stale=before.filter(r=>matches(r,f)&&!keep.has(pkOf(table,r))).map(r=>rowKey(c,table,r));
   await store.removeMany(stale);
   /* Una lectura completa sin filtros cubre la tabla; una colección de docs («col») cubre esa colección. */
   if(!f.length)await store.put('cover|'+scope(c)+'|'+table+'|*',{type:'cover',at:now()});
   else if(table==='docs'&&f.length===1&&eq.col!=null)await store.put('cover|'+scope(c)+'|docs|'+eq.col,{type:'cover',at:now()});
  }
  await store.put('seen|'+scope(c)+'|'+url.pathname+url.search+'|'+(headers.get('range')||''),{type:'seen',at:now()});
  return true;
 }
 async function covered(c,table,url,headers){
  const eq=eqOnly(filtersOf(url))||{};
  return !!(await store.get('seen|'+scope(c)+'|'+url.pathname+url.search+'|'+(headers.get('range')||''))||
   await store.get('cover|'+scope(c)+'|'+table+'|*')||(table==='docs'&&eq.col!=null&&await store.get('cover|'+scope(c)+'|docs|'+eq.col)));
 }
 /* Aplica los cambios pendientes sobre lo que se muestra (incluso con internet, hasta que se envíen). */
 function overlay(table,rows,ops){
  const map=new Map(rows.map(r=>[pkOf(table,r),clone(r)]));
  for(const op of ops){
   if(op.state==='blocked')continue;const p=op.payload;
   if(p.kind==='rpc'&&p.name==='doc_update'&&table==='docs'){const k=pkOf('docs',{col:p.args.p_col,id:p.args.p_id}),r=map.get(k);if(r)r.data={...(r.data||{}),...(p.args.p_patch||{})};continue;}
   if(p.kind!=='table'||p.table!==table)continue;
   for(const e of p.rows){
    const k=pkOf(table,e.key),before=map.get(k);
    if(p.method==='DELETE'){map.delete(k);continue;}
    if(p.method==='PATCH'&&!before)continue;
    const next={...(before||{}),...(e.body||{}),...e.key};
    if(e.data_merge){const d={...((before&&before.data)||{})};for(const x of e.data_merge.unset||[])delete d[x];Object.assign(d,e.data_merge.set||{});next.data=d;}
    map.set(k,next);
   }
  }
  return [...map.values()];
 }
 async function applyToCache(c,payload,result){
  if(payload.kind==='rpc'&&payload.name==='doc_update'){
   const key={col:payload.args.p_col,id:payload.args.p_id};const old=await store.get(rowKey(c,'docs',key)).catch(()=>null);
   if(old)await store.put(rowKey(c,'docs',key),rowRecord(c,'docs',{...old.row,data:{...(old.row.data||{}),...(payload.args.p_patch||{})}})[1]);
   return;
  }
  if(payload.kind!=='table')return;
  const t=payload.table,server=Array.isArray(result)?result.filter(Boolean):[];
  for(const e of payload.rows){
   const k=rowKey(c,t,e.key);
   if(payload.method==='DELETE'){await store.remove(k);continue;}
   const fromServer=server.find(r=>pkOf(t,r)===pkOf(t,e.key));
   const old=await store.get(k).catch(()=>null);
   const next=fromServer||overlay(t,old?[old.row]:[],[{state:'pending',payload:{...payload,rows:[e]}}])[0];
   if(next)await store.put(k,rowRecord(c,t,next)[1]);
  }
 }

 /* ---------- Cola de cambios ---------- */
 function describe(p){
  if(p.kind==='rpc')return ({doc_update:'Cambio de planilla',importar_mercaderia:'Ingreso de mercadería',gestlok_proveedor_guardar_historial:'Pedido a proveedor',
   rm_app_save_schedule:'Horario semanal',rm_app_set_branch_schedule_link:'Enlace de Horarios',rm_app_schedule_comment:'Comentario de Horarios',rm_app_record_whatsapp:'Envío por WhatsApp'})[p.name]||'Cambio';
  if(p.table==='docs'){const col=String(p.rows[0]?.key?.col||''),part=col.split('/').pop();
   const n={productos:'Producto',conteos:'Conteo',fabrica:'Conteo de fábrica',chat:'Mensaje del chat',proveedores:'Proveedor',proveedores_historial:'Historial de proveedor',
    diario:'Control diario',vencimientos:'Vencimiento',avisos:'Aviso',hojas:'Hoja',munro_control:'Control del local',equipo:'Equipo',locales:'Local',pedidos_online:'Pedido online'}[part]||'Registro';
   return (p.method==='DELETE'?'Borrar · ':'')+n;}
  return p.method==='DELETE'?'Borrar registro de empleados':'Planilla de empleados';
 }
 async function enqueue(c,payload,meta){
  /* Tocar Guardar dos veces sin conexión no genera dos envíos iguales. */
  const same=(await opsOf(c)).find(o=>o.state!=='blocked'&&canonical(o.payload)===canonical(payload));if(same)return same;
  const op={type:'operation',bucket:'ops|'+scope(c),id:uuid(),scope:scope(c),actor:c.actor,tenant:c.tenant,created:now(),order:++seq,
   state:'pending',attempts:0,label:describe(payload),payload,base:meta.base,apikey:meta.apikey};
  await store.put('op|'+op.id,op);
  void notify();return op;
 }
 async function apply(op,headers,net){
  const r=await net(op.base+'/rest/v1/rpc/gestlok_sync_apply',{method:'POST',headers,cache:'no-store',
   body:JSON.stringify({p_id:op.id,p_tenant:op.tenant,p_payload:op.payload})});
  const text=await r.text();let body=null;try{body=text?JSON.parse(text):null;}catch{body=null;}
  if(!r.ok){const e=Error(body?.message||'No se pudo enviar el cambio.');e.status=r.status;e.body=body;e.raw=text;throw e;}
  return body;
 }
 function human(e){
  const m=String(e?.message||'');
  if(/SYNC_MISSING/.test(m))return 'El registro ya no existe o tu usuario no puede modificarlo.';
  if(/SYNC_IDENTITY/.test(m))return 'Tu cuenta cambió de empresa o de permisos. Revisalo con conexión.';
  if(/permission|row-level|42501/i.test(m+(e?.body?.code||'')))return 'Tu usuario no tiene permiso para este cambio.';
  if(/otro usuario|version|versión|conflict/i.test(m))return 'Otra persona cambió estos datos. Revisalo antes de volver a guardar.';
  return m.replace(/^MGS:\S*\s*/,'')||'No se pudo enviar el cambio.';
 }
 async function flush(){
  if(demo.on){if(online()&&demo.items.length){const n=demo.items.length;demo.items=[];lastSent=n;await notify();root.dispatchEvent?.(new CustomEvent('gestlok-sync-complete',{detail:{count:n,demo:true}}));}return;}
  if(flushing)return flushing;
  if(!online()||!active||!auth)return;
  const current=active,net=root.fetch.bind(root);
  flushing=(async()=>{
   const work=async()=>{
    let sent=0;
    try{
     const pending=(await opsOf(current)).filter(o=>o.state!=='blocked');if(!pending.length)return;
     await notify();
     const session=await auth();if(!session||session.user?.id!==current.actor)return;
     const headers={authorization:'Bearer '+session.access_token,'content-type':'application/json'};
     for(const op of pending){
      if(!online()||!active||scope(active)!==scope(current))break;
      try{
       const result=await apply(op,{...headers,apikey:op.apikey},net);
       if(op.payload.kind==='rpc'&&op.payload.name==='importar_mercaderia'&&result&&result.estado&&result.estado!=='ok'){
        /* La base respondió sin guardar (remito repetido o productos cambiados): queda a la vista para revisarlo. */
        op.state='blocked';op.error=result.estado==='duplicado'?'Ese remito ya se había importado: no se sumó dos veces.':'No se aplicó: algunos productos cambiaron o ya no existen. Volvé a revisar el remito.';
        await store.put('op|'+op.id,op);results.set(op.id,{ok:true,result});continue;
       }
       await store.remove('op|'+op.id);results.set(op.id,{ok:true,result});
       await applyToCache(current,op.payload,result).catch(()=>{});sent++;lastError='';
      }catch(e){
       if(e.status===404&&/gestlok_sync_apply/.test(e.raw||'')){unsupported=true;lastError='Falta una actualización del servidor.';break;}
       if(!e.status||e.status>=500||e.status===401||e.status===408||e.status===429){lastError=e.status?'El servidor no respondió. Se reintenta solo.':'';op.attempts++;await store.put('op|'+op.id,op).catch(()=>{});break;}
       op.state='blocked';op.error=human(e);op.attempts++;await store.put('op|'+op.id,op);results.set(op.id,{ok:false,status:e.status,raw:e.raw});
      }
     }
    }finally{
     if(sent){lastSent=sent;root.dispatchEvent?.(new CustomEvent('gestlok-sync-complete',{detail:{count:sent}}));}
    }
   };
   const locks=root.navigator?.locks;
   if(locks)await locks.request('gestlok-sync:'+scope(current),{ifAvailable:true},async lock=>{if(lock)await work();});else await work();
  })().finally(()=>{flushing=null;void notify();});
  return flushing;
 }

 /* ---------- Transporte: envuelve fetch del cliente de Supabase ---------- */
 function transport(base,apikey,fetcher){
  const origin=new URL(base).origin,net=fetcher||((i,n)=>root.fetch(i,n));
  return async function(input,init){
   init=init||{};
   const request=new Request(input,init),url=new URL(request.url);
   if(url.origin!==origin)return net(input,init);
   const method=request.method,path=url.pathname,isUser=path==='/auth/v1/user'&&method==='GET';
   if(path.endsWith('/gestlok_choose_role_context')||path.endsWith('/gestlok_my_role_contexts')){
    // Cambiar de empresa nunca se encola: debe validarlo el servidor en línea.
    return online()?net(input,init):json({code:'GL_OFFLINE',message:'Conectate a internet para cambiar de empresa.'},503);
   }
   if(!isUser&&!path.startsWith('/rest/v1/')||path.endsWith('/gestlok_sync_apply')||path.endsWith('/gestlok_sync_context'))return net(input,init);
   const headers=new Headers(request.headers);
   const c=await context(headers,base,net);if(!c)return net(input,init);
   const rpc=path.includes('/rest/v1/rpc/'),name=path.split('/').pop();
   let bodyText='';if(method!=='GET'&&method!=='HEAD'){try{bodyText=await request.clone().text();}catch{}}
   let body=null;try{body=bodyText?JSON.parse(bodyText):null;}catch{body=null;}
   const read=isUser||method==='GET'||method==='HEAD'||(rpc&&READS.has(name));
   if(read)return readThrough(c,{input,init,url,headers,method,rpc,name,body,isUser,net});
   /* Borrar necesita conexión: no se deja en cola. */
   if(method==='DELETE'&&!rpc&&PK[name]&&!online())return json({code:'GL_OFFLINE',message:'Sin conexión: para borrar necesitás internet.',details:null,hint:null},503);
   const payload=await writePayload(c,{rpc,name,method,url,headers,body});
   if(!payload)return net(input,init);
   return writeThrough(c,payload,{input,init,headers,method,rpc,name,net,base,apikey,url});
  };
 }
 async function readThrough(c,{input,init,url,headers,method,rpc,name,body,isUser,net}){
  const table=!rpc&&!isUser&&PK[name]?name:null;
  const key='read|'+scope(c)+'|'+method+'|'+url.pathname+url.search+'|'+canonical(body)+'|'+(headers.get('accept')||'')+'|'+(headers.get('range')||'');
  if(online()){
   try{
    const res=await net(input,init);
    if(res.ok&&method!=='HEAD'){
     const value=await res.clone().json().catch(()=>undefined);
     if(value!==undefined){
      const asRows=table?await rememberRows(c,table,url,headers,value).catch(()=>false):false;
      if(!asRows)await store.put(key,{type:'read',value,at:now()}).catch(()=>{});
      const ops=await opsOf(c).catch(()=>[]);
      if(table&&asRows&&ops.some(o=>o.state!=='blocked')){const list=overlay(table,Array.isArray(value)?value:value?[value]:[],ops);
       return json(Array.isArray(value)?list:list[0]??null,res.status,{'content-range':res.headers.get('content-range')||`0-${Math.max(list.length-1,0)}/*`});}
      if(rpc&&name==='rm_app_branch_schedule_links'&&ops.length)return json(linkOverlay(value,ops),res.status);
     }
     return res;
    }
    if(res.ok||res.status<500)return res;
   }catch(e){if(e&&e.name==='AbortError')throw e;}
  }
  if(table&&await covered(c,table,url,headers)){
   const f=filtersOf(url)||[],eq=eqOnly(f)||{};
   const list=overlay(table,(await cachedRows(c,table,eq)).filter(r=>matches(r,f)),await opsOf(c));
   const out=shape(list.filter(r=>matches(r,f)),url,headers);
   if((headers.get('accept')||'').includes('vnd.pgrst.object')){
    if(out.rows.length!==1)return json({code:'PGRST116',message:'Sin conexión: no se encontró el registro en este equipo.',details:null,hint:null},406);
    return json(out.rows[0]);
   }
   return json(out.rows,200,{'content-range':out.range});
  }
  const cached=await store.get(key).catch(()=>null);
  if(cached){
   if(cached.value&&cached.value.expires_at&&Date.parse(cached.value.expires_at)<now())return json({message:'Necesitás conexión para renovar este acceso.'},401);
   const ops=await opsOf(c).catch(()=>[]);
   return json(rpc&&name==='rm_app_branch_schedule_links'?linkOverlay(cached.value,ops):cached.value);
  }
  return json({code:'GL_OFFLINE',message:'Sin conexión: esta sección todavía no se descargó en este equipo. Abrila una vez con internet.',details:null,hint:null},503);
 }
 function linkOverlay(value,ops){
  if(!Array.isArray(value))return value;const rows=clone(value);
  for(const op of ops){const p=op.payload;if(op.state==='blocked'||p.kind!=='rpc'||p.name!=='rm_app_set_branch_schedule_link')continue;
   for(const r of rows)if(r&&r.local_id===p.args.p_local)r.url=p.args.p_url||null;}
  return rows;
 }
 async function writePayload(c,{rpc,name,method,url,headers,body}){
  if(rpc)return WRITES.has(name)&&method==='POST'?{kind:'rpc',name,args:body&&typeof body==='object'?body:{}}:null;
  const keys=PK[name];if(!keys)return null;
  if(method==='POST'){
   const oc=url.searchParams.get('on_conflict');if(oc&&oc.split(',').sort().join()!==[...keys].sort().join())return null;
   const prefer=headers.get('prefer')||'',list=Array.isArray(body)?body:body?[body]:[];
   if(!list.length)return null;
   const rows=list.map(b=>({key:Object.fromEntries(keys.map(k=>[k,b[k]])),body:b}));
   if(rows.some(r=>!pkOf(name,r.key)))return null;
   return {kind:'table',table:name,method,mode:prefer.includes('merge-duplicates')?'upsert':prefer.includes('ignore-duplicates')?'ignore':'insert',rows};
  }
  if(method!=='PATCH')return null;
  const eq=eqOnly(filtersOf(url));if(!eq)return null;
  const key=Object.fromEntries(keys.map(k=>[k,eq[k]]));if(!pkOf(name,key))return null;
  const constraints=Object.fromEntries(Object.entries(eq).filter(([k])=>!keys.includes(k)));
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  const entry={key,constraints,body:{...body}};
  /* Solo viajan los campos que cambiaron dentro de «data», para no pisar otros cambios. */
  if(name!=='docs'&&body.data&&typeof body.data==='object'&&!Array.isArray(body.data)){
   const old=await store.get(rowKey(c,name,key)).catch(()=>null),before=old&&old.row&&old.row.data;
   if(before&&typeof before==='object'){
    const set={},unset=[];
    for(const [k,v] of Object.entries(body.data))if(canonical(v)!==canonical(before[k]))set[k]=v;
    for(const k of Object.keys(before))if(!(k in body.data))unset.push(k);
    delete entry.body.data;entry.data_merge={set,unset};
   }
  }
  return {kind:'table',table:name,method,rows:[entry]};
 }
 async function echo(c,payload,headers,method){
  if(payload.kind==='rpc'){
   if(payload.name==='doc_update')return json(1);
   return json({gl_pending:true,message:'Guardado en este equipo. Se enviará automáticamente al volver la conexión.'},202);
  }
  const before=[];
  for(const e of payload.rows){const old=await store.get(rowKey(c,payload.table,e.key)).catch(()=>null);if(old)before.push(old.row);}
  const rows=payload.method==='DELETE'?[]:overlay(payload.table,before,[{state:'pending',payload:payload.method==='PATCH'&&!before.length?{...payload,method:'POST'}:payload}]);
  const single=(headers.get('accept')||'').includes('vnd.pgrst.object');
  return json(single?rows[0]??null:rows,method==='POST'?201:200);
 }
 async function writeThrough(c,payload,{input,init,headers,method,net,base,apikey}){
  const meta={base,apikey:headers.get('apikey')||apikey};
  const queued=(await opsOf(c).catch(()=>[])).some(o=>o.state!=='blocked');
  const once=payload.kind==='rpc'&&ONCE.has(payload.name);
  if(online()&&!queued&&!once){
   try{
    const res=await net(input,init);
    if(res.ok){let value=null;try{value=await res.clone().json();}catch{}await applyToCache(c,payload,Array.isArray(value)?value:value&&typeof value==='object'?[value]:null).catch(()=>{});}
    return res;
   }catch(e){if(e&&e.name==='AbortError')throw e;if(!isNetworkError(e))throw e;}
  }
  let op;
  try{op=await enqueue(c,payload,meta);}
  catch{return json({code:'GL_STORAGE',message:'No se pudo guardar en este equipo: revisá el espacio disponible.',details:null,hint:null},507);}
  if(online()){
   for(let i=0;i<2&&!results.has(op.id)&&online();i++)await flush();
   const done=results.get(op.id);
   if(done){results.delete(op.id);
    if(done.ok){
     if(!queued){await store.remove('op|'+op.id).catch(()=>{});void notify();}
     if(payload.kind==='rpc')return json(payload.name==='doc_update'?(done.result??1):done.result);
     const rows=Array.isArray(done.result)?done.result.filter(Boolean):[];
     return json((headers.get('accept')||'').includes('vnd.pgrst.object')?rows[0]??null:rows,method==='POST'?201:200);
    }
    if(!queued){await store.remove('op|'+op.id).catch(()=>{});void notify();return new Response(done.raw||'{}',{status:done.status||400,headers:{'content-type':'application/json'}});}
   }
  }
  return echo(c,payload,headers,method);
 }

 /* ---------- Descarga inicial para usar sin conexión ---------- */
 async function prepare(client,force=false){
  if(!online()||!client)return;
  const session=(await client.auth.getSession()).data.session;if(!session?.user?.id)return;
  const ctx=await store.get('identity|'+session.user.id).catch(()=>null);
  const mark=ctx?'prepared|'+scope(ctx):null;
  if(!force&&mark){const last=await store.get(mark).catch(()=>null);if(last&&now()-last.at<PREPARE_EVERY)return;}
  try{
   for(const table of Object.keys(PK)){
    for(let from=0;online();from+=1000){
     const r=await client.from(table).select('*').range(from,from+999);
     if(r.error||!Array.isArray(r.data))break;
     if(r.data.length<1000){if(from&&active)await store.put('cover|'+scope(active)+'|'+table+'|*',{type:'cover',at:now()});break;}
    }
   }
   await client.rpc('mi_acceso');await client.auth.getUser().catch(()=>{});
   const me=await client.rpc('rm_app_me');
   await client.rpc('gestlok_owner_area_context');await client.rpc('gestlok_gerente_area_context');
   const role=me.data&&me.data.role;
   if(role==='owner'||role==='admin'){
    await client.rpc('rm_app_organizations');await client.rpc('rm_app_locals');await client.rpc('rm_app_users');
    const companies=await client.from('rm_companies').select('id,organization_id,name').order('name');
    for(const co of companies.data||[]){await client.rpc('rm_app_branch_schedule_links',{p_local:null,p_company:co.id});await client.rpc('rm_app_schedule_context',{p_company:co.id});}
   }
   for(const local of (me.data&&me.data.gestlok_gerente&&me.data.gestlok_gerente.local_ids)||[])await client.rpc('rm_app_branch_schedule_links',{p_local:local,p_company:null});
   if(active)await store.put('prepared|'+scope(active),{type:'prepared',at:now()});
  }catch(e){lastError='';}
  finally{void notify();}
 }

 /* ---------- Sesión: seguir usando la cuenta ya abierta sin conexión ---------- */
 function attach(client,base,home,opts={}){
  const storageKey='sb-'+new URL(base).hostname.split('.')[0]+'-auth-token';
  const saved=()=>{try{const v=JSON.parse(root.localStorage.getItem(storageKey)||'null');return v&&v.currentSession?v.currentSession:v;}catch{return null;}};
  const known=async s=>!!(s&&s.user&&s.user.id&&(contexts.has(s.user.id)||await store.get('identity|'+s.user.id).catch(()=>null)));
  const original=client.auth.getSession.bind(client.auth),getUser=client.auth.getUser&&client.auth.getUser.bind(client.auth),signOut=client.auth.signOut&&client.auth.signOut.bind(client.auth);
  client.auth.getSession=async()=>{
   const s=saved();if(!online()&&await known(s))return {data:{session:s},error:null};
   try{const r=await original();if(r.error&&await known(s)&&isNetworkError(r.error))return {data:{session:s},error:null};return r;}
   catch(e){if(await known(s))return {data:{session:s},error:null};throw e;}
  };
  if(getUser)client.auth.getUser=async(...a)=>{
   const s=saved();if(!online()&&await known(s))return {data:{user:s.user},error:null};
   try{const r=await getUser(...a);if(r.error&&await known(s)&&(isNetworkError(r.error)||r.error.status===0||/fetch/i.test(String(r.error.name||''))))return {data:{user:s.user},error:null};return r;}
   catch(e){if(await known(s))return {data:{user:s.user},error:null};throw e;}
  };
  if(signOut)client.auth.signOut=async(...a)=>{
   const s=saved();
   if(!online()){try{root.localStorage.removeItem(storageKey);}catch{}if(s&&s.user)await api.forget(s.user.id);if(home)root.location?.assign(home);return {error:null};}
   const r=await signOut(...a);if(!r.error&&s&&s.user)await api.forget(s.user.id);return r;
  };
  auth=async()=>{const r=await client.auth.getSession();return r.data.session;};
  if(opts.prepare!==false){
   client.auth.onAuthStateChange?.(ev=>{if(ev==='SIGNED_IN'||ev==='INITIAL_SESSION')root.setTimeout?.(()=>void prepare(client),2000);});
   root.setTimeout?.(()=>void prepare(client),2500);
  }
  const refresh=()=>{if(online())client.auth.startAutoRefresh?.();else client.auth.stopAutoRefresh?.();};
  root.addEventListener?.('online',refresh);root.addEventListener?.('offline',refresh);refresh();
  void flush();
  return client;
 }

 const api={transport,attach,prepare,flush,
  // Solo invalida la selección del servidor; NO borra datos ni operaciones pendientes.
  async invalidateContext(){
    const actor=active?.actor;
    if(actor){contexts.delete(actor);await store.remove('identity|'+actor).catch(()=>{});}
    active=null;results.clear();await notify();
  },
  available:()=>demo.on||(!!active&&!unsupported),
  pending:async()=>(await state()).pending,
  subscribe(fn){listeners.add(fn);void notify();return()=>listeners.delete(fn);},
  async list(){return active?opsOf(active):[];},
  async discard(id){const op=await store.get('op|'+id);if(active&&op&&op.scope===scope(active)){await store.remove('op|'+id);await notify();}},
  async retry(id){const op=await store.get('op|'+id);if(active&&op&&op.scope===scope(active)){op.state='pending';delete op.error;await store.put('op|'+id,op);await notify();void flush();}},
  /* Al cerrar sesión se borra la copia de datos de esa cuenta en este equipo; los cambios pendientes se conservan para cuando vuelva a entrar. */
  async forget(actor){
   contexts.delete(actor);if(active&&active.actor===actor)active=null;
   const keys=(await store.keys()).filter(k=>typeof k==='string'&&(k.startsWith('row|'+actor+':')||k.startsWith('read|'+actor+':')||k.startsWith('cover|'+actor+':')||k.startsWith('seen|'+actor+':')||k.startsWith('prepared|'+actor+':')||k==='identity|'+actor));
   await store.removeMany(keys).catch(()=>{});await notify();
  },
  /* Demo pública: simula la cola sin servidor ni datos reales. */
  demoAttach(){demo.on=true;void notify();},
  demoRecord(label){if(!demo.on||online())return false;demo.items.push({id:'demo-'+(++seq),label:String(label||'Cambio'),created:now()});void notify();return true;},
  _test:{store,overlay,filtersOf,matches,shape,scope:()=>active&&scope(active)}
 };
 root.addEventListener?.('online',()=>{void flush();void notify();});
 root.addEventListener?.('offline',()=>void notify());
 root.addEventListener?.('focus',()=>void flush());
 return api;
}

/* ---------- Aviso visible en las dos áreas ---------- */
function mountBanner(api){
 const d=root.document;if(!d||d.getElementById('gl-offline-sync'))return;
 const style=d.createElement('style');
 style.textContent='#gl-offline-sync{position:fixed;right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 86px);z-index:11000;max-width:min(400px,calc(100vw - 24px));background:#0f2d44;color:#fff;border-radius:14px;box-shadow:0 8px 24px #0004;font:14px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;padding:10px 12px}#gl-offline-sync[hidden]{display:none}#gl-offline-sync .gl-os-row{display:flex;gap:10px;align-items:center}#gl-offline-sync .gl-os-dot{flex:0 0 10px;height:10px;border-radius:50%;background:#f5b041}#gl-offline-sync.ok .gl-os-dot{background:#52c27d}#gl-offline-sync.bad .gl-os-dot{background:#ff7b72}#gl-offline-sync button{font:inherit;font-size:13px;border:0;border-radius:8px;padding:6px 10px;background:#fff;color:#0f2d44;cursor:pointer;white-space:nowrap}#gl-offline-sync .gl-os-list{margin-top:8px;border-top:1px solid #ffffff2e;padding-top:8px;max-height:40vh;overflow:auto}#gl-offline-sync .gl-os-item{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:4px 0}#gl-offline-sync .gl-os-item small{display:block;color:#ffd7d3}#gl-offline-sync .gl-os-actions{display:flex;gap:6px;flex-wrap:wrap}@media(max-width:760px){#gl-offline-sync{left:10px;right:10px;max-width:none;bottom:auto;top:calc(env(safe-area-inset-top,0px) + 76px)}}';
 d.head.append(style);
 const box=d.createElement('aside');box.id='gl-offline-sync';box.hidden=true;box.setAttribute('aria-label','Estado sin conexión');
 box.innerHTML='<div class="gl-os-row"><span class="gl-os-dot" aria-hidden="true"></span><span class="gl-os-text" role="status" aria-live="polite"></span><button type="button" class="gl-os-toggle" hidden>Ver</button></div><div class="gl-os-list" hidden></div>';
 d.body.append(box);
 const text=box.querySelector('.gl-os-text'),toggle=box.querySelector('.gl-os-toggle'),list=box.querySelector('.gl-os-list');
 let okTimer=null,lastSent=0,okUntil=0,last=null;
 toggle.onclick=()=>{list.hidden=!list.hidden;toggle.textContent=list.hidden?'Ver':'Ocultar';};
 const plural=(n,a,b)=>n+' '+(n===1?a:b);
 const paint=s=>{
  last=s;
  if(s.sent&&s.sent!==lastSent){lastSent=s.sent;okUntil=Date.now()+5000;clearTimeout(okTimer);okTimer=setTimeout(()=>{if(last)paint(last);},5100);}
  const showOk=Date.now()<okUntil&&s.online&&!s.pending&&!s.blocked;
  /* En «Administrar mi empresa» el estado sin internet ya se ve arriba: el aviso aparece solo con cambios pendientes. */
  const quiet=!!d.getElementById('stock-root');
  const visible=(!s.online&&!quiet)||s.pending||s.blocked||showOk;
  if(!visible){box.hidden=true;box.classList.remove('ok','bad');return;}
  box.hidden=false;box.classList.toggle('bad',!!s.blocked);box.classList.toggle('ok',!!showOk);
  text.textContent=s.blocked?plural(s.blocked,'cambio necesita','cambios necesitan')+' revisión. Tocá «Ver».':
   showOk?'✓ '+(s.demo?'Demo: ':'')+plural(lastSent,'cambio enviado','cambios enviados')+' al volver la conexión.':
   s.busy&&s.online&&s.pending?'Enviando cambios guardados en este equipo…':
   s.pending?(s.online?plural(s.pending,'cambio pendiente','cambios pendientes')+'. Se envían solos.':'Sin conexión · '+plural(s.pending,'cambio guardado','cambios guardados')+' en este equipo. Se envían solos al volver internet.'):
   'Sin conexión · podés seguir navegando y cargando. Lo que guardes se envía solo al volver internet.';
  toggle.hidden=!(s.items&&s.items.length);
  list.replaceChildren();
  for(const it of s.items||[]){
   const row=d.createElement('div');row.className='gl-os-item';
   const info=d.createElement('div');info.textContent=(it.label||'Cambio')+' · '+new Date(it.created).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
   if(it.state==='blocked'){const why=d.createElement('small');why.textContent=it.error||'Necesita revisión';info.append(why);}
   row.append(info);
   if(!s.demo){
    const acts=d.createElement('div');acts.className='gl-os-actions';
    if(it.state==='blocked'){const again=d.createElement('button');again.type='button';again.textContent='Reintentar';again.onclick=()=>void api.retry(it.id);acts.append(again);}
    const drop=d.createElement('button');drop.type='button';drop.textContent='Descartar';
    drop.onclick=()=>{if(root.confirm('¿Descartar este cambio? No se enviará y no modifica lo que ya está guardado en la nube.'))void api.discard(it.id);};
    acts.append(drop);row.append(acts);
   }
   list.append(row);
  }
  if(!s.demo&&s.items&&s.items.length){
   const dl=d.createElement('button');dl.type='button';dl.textContent='Descargar copia de los pendientes';
   dl.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(s.items.map(x=>({cambio:x.label,fecha:new Date(x.created).toISOString(),estado:x.state,detalle:x.payload})),null,2)],{type:'application/json'}));const a=d.createElement('a');a.href=url;a.download='GESTLOK-cambios-pendientes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);};
   list.append(dl);
  }
 };
 api.subscribe(paint);
 setInterval(()=>void api.flush(),20000);
}

const exported={create,memoryStorage,PK,READS,WRITES,ONCE};
if(typeof module!=='undefined'&&module.exports)module.exports=exported;
if(root&&root.document&&!root.GestLokOffline){
 const api=root.GestLokOffline=create();
 const go=()=>mountBanner(api);
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',go,{once:true});else go();
}
})(typeof window==='undefined'?globalThis:window);
