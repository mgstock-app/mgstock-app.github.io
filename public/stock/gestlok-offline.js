/* Shared offline storage. No tokens in caches/outbox. Server rechecks every replay. */
(function(root){
'use strict';
const PK={docs:['col','id'],rm_test_documents:['path'],rm_app_settings:['owner_id','organization_id','path'],gestlok_tiendas:['id']};
const WRITES=new Set(['importar_mercaderia','gestlok_proveedor_guardar_historial','rm_app_save_schedule','rm_app_set_branch_schedule_link','rm_app_schedule_comment']);
const READS=new Set(['mi_acceso','mi_rol','rm_app_me','rm_app_organizations','rm_app_locals','rm_app_users','rm_app_owner_count','rm_app_access_state','rm_app_open_report','rm_app_report_image','rm_app_access_requests','rm_app_schedule_context','rm_app_branch_schedule_links','gestlok_owner_area_context','gestlok_gerente_area_context','gestlok_creator_dashboard','gestlok_creator_editing_state','gestlok_creator_support_state','gestlok_creator_companies_index','gestlok_creator_audit','gestlok_creator_list_companies','gestlok_creator_registration_requests','gestlok_my_registration','gestlok_catalogo_pagina','gestlok_catalogo_resumen','gestlok_catalogo_categorias','gestlok_support_config']);
const clone=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x??null);
const rowKey=(table,row)=>PK[table]?.every(k=>row[k]!=null)?table+':'+canonical(Object.fromEntries(PK[table].map(k=>[k,row[k]]))):null;
function storage(){
 let opened;
 const db=()=>opened??=(new Promise((resolve,reject)=>{
  const r=root.indexedDB.open('gestlok-offline-v1',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('records');s.createIndex('bucket','bucket');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 }));
 async function call(mode,action){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('records',mode),s=tx.objectStore('records');let result;const q=action(s);q.onsuccess=()=>{result=q.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
 return {get:k=>call('readonly',s=>s.get(k)),put:(k,v)=>call('readwrite',s=>s.put(v,k)),remove:k=>call('readwrite',s=>s.delete(k)),all:()=>call('readonly',s=>s.getAll()),bucket:k=>call('readonly',s=>s.index('bucket').getAll(k))};
}
function create(options={}){
 const store=options.store||storage(),online=options.online||(()=>root.navigator.onLine),now=options.now||Date.now;
 const uuid=options.uuid||(()=>root.crypto.randomUUID());
 let active=null,pendingCount=0,busy=false,lastError='',auth=null,seq=0,demoMode=false;const preparing=new Map();
 const contexts=new Map(),listeners=new Set();
 const notify=async()=>{const items=active?await queue(active):[];pendingCount=items.length;for(const f of listeners)f({online:online(),pending:pendingCount,busy,error:lastError,items});};
 const scope=c=>c.actor+':'+c.tenant;
 const queue=async c=>(await (store.bucket?store.bucket('operations:'+scope(c)):store.all())).filter(x=>x.type==='operation'&&x.scope===scope(c)).sort((a,b)=>a.created-b.created||a.order-b.order);
 function actor(headers){try{const t=headers.get('authorization')?.replace(/^Bearer /i,'');return JSON.parse(root.atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub||null;}catch{return null;}}
 async function context(headers,base,fetcher){
  const id=actor(headers);if(!id)return null;if(active&&active.actor!==id){active=null;pendingCount=0;void notify();}
  let c=contexts.get(id)||await store.get('identity:'+id);
  if(online()&&(!c||now()-c.checked>15000)){
   try{const r=await fetcher(base+'/rest/v1/rpc/gestlok_sync_context',{method:'POST',headers,body:'{}',cache:'no-store'});if(!r.ok)return null;const v=await r.json();if(!v.actor||!v.tenant)return null;c={...v,checked:now()};contexts.set(id,c);await store.put('identity:'+id,c);}catch{if(!c)return null;}
  }
  if(c){active=c;contexts.set(id,c);void notify();root.queueMicrotask?.(()=>void flush());}return c||null;
 }
 async function rows(c,table){
  const prefix='row:'+scope(c)+':'+table+':';const all=await (store.bucket?store.bucket('rows:'+scope(c)+':'+table):store.all());const map=new Map(all.filter(x=>x.type==='row'&&x.key.startsWith(prefix)).map(x=>[rowKey(table,x.row),clone(x.row)]));
  for(const op of await queue(c))if(op.payload.kind==='table'&&op.payload.table===table)for(const entry of op.payload.rows){
   const key=rowKey(table,entry.key);if(op.payload.method==='DELETE')map.delete(key);else{
    const before=map.get(key)||{};const body=entry.merge_data?{...entry.body,data:{...before.data,...entry.body.data}}:entry.body;
    map.set(key,{...before,...body,...entry.key});
   }
  }
  return [...map.values()];
 }
 function matches(row,url){for(const [key,raw]of url.searchParams){if(['select','order','limit','offset','on_conflict'].includes(key))continue;const value=String(row[key]??'');if(raw.startsWith('eq.')){if(value!==raw.slice(3))return false;}else if(raw.startsWith('like.')){const pattern=raw.slice(5).split('%').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');if(!new RegExp('^'+pattern+'$').test(value))return false;}else return false;}return true;}
 function filters(url){const result={};for(const [k,v]of url.searchParams){if(['select','order','limit','offset','on_conflict'].includes(k))continue;if(!v.startsWith('eq.'))return null;result[k]=v.slice(3);}return result;}
 async function cacheRows(c,table,value,filter){
  if(!PK[table]||!filter)return;
  for(const r of Array.isArray(value)?value:value?[value]:[]){const row={...filter,...r},key=rowKey(table,row);if(key){const old=await store.get('row:'+scope(c)+':'+key);await store.put('row:'+scope(c)+':'+key,{type:'row',bucket:'rows:'+scope(c)+':'+table,key:'row:'+scope(c)+':'+key,row:{...old?.row,...row}});}}
 }
 async function tableRead(c,table,url,headers,source){
  const filter=filters(url)||{};if(!PK[table])return null;
  let base;if(source!==undefined){const entries=new Map((Array.isArray(source)?source:source?[source]:[]).map(r=>{const row={...filter,...r};return [rowKey(table,row),row];}));for(const op of await queue(c))if(op.payload.kind==='table'&&op.payload.table===table)for(const e of op.payload.rows){const k=rowKey(table,e.key);if(op.payload.method==='DELETE')entries.delete(k);else{const before=entries.get(k)||{};entries.set(k,{...before,...e.key,...e.body,...(e.merge_data?{data:{...before.data,...e.body.data}}:{})});}}base=[...entries.values()];}else base=await rows(c,table);
  let result=base.filter(r=>matches(r,url));
  const order=url.searchParams.get('order');if(order){const [key,dir]=order.split('.');result.sort((a,b)=>String(a[key]??'').localeCompare(String(b[key]??''))*(dir==='desc'?-1:1));}
  const count=result.length,range=headers.get('range');let from=Number(url.searchParams.get('offset')||0),to=Number(url.searchParams.get('limit')||count);
  if(range){const bits=range.split('-').map(Number);from=bits[0];to=bits[1]-from+1;}if(source===undefined)result=result.slice(from,from+to);
  const fields=url.searchParams.get('select');if(fields&&fields!=='*')result=result.map(r=>Object.fromEntries(fields.split(',').filter(k=>k in r).map(k=>[k,r[k]])));
  const single=headers.get('accept')?.includes('vnd.pgrst.object');return {value:single?result[0]??null:result,count};
 }
 function response(value,status=200,headers={}){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});}
 async function payload(c,table,method,url,body){
  if(table==='doc_update'){
   const data=body,all=await rows(c,'docs'),before=all.find(r=>r.col===data.p_col&&r.id===data.p_id);
   return {kind:'table',table:'docs',method:'PATCH',rows:[{key:{col:data.p_col,id:data.p_id},body:{data:data.p_patch},merge_data:true,check:!!before,exists:!!before,expected:table==='gestlok_tiendas'?before??null:before?.data??null}]};
  }
  if(WRITES.has(table)){const result={kind:'rpc',name:table,args:body};if(table==='rm_app_set_branch_schedule_link'){const saved=await store.get('link:'+scope(c)+':'+body.p_local);if(saved)result.expected_link=saved.url;}return result;}
  if(!PK[table])return null;
  const filter=filters(url);if(!filter)return null;
  const values=method==='POST'?(Array.isArray(body)?body:[body]):[{...filter,...body}];const all=await rows(c,table),entries=[];
  for(const data of values){const key=Object.fromEntries(PK[table].map(k=>[k,data[k]??filter[k]]));if(!rowKey(table,key))return null;const before=all.find(r=>rowKey(table,r)===rowKey(table,key));entries.push({key,constraints:filter,body:method==='POST'?data:body,check:!!before||method==='POST',exists:!!before,expected:table==='gestlok_tiendas'?before??null:before?.data??null});}
  return {kind:'table',table,method,rows:entries};
 }
 async function saveOperation(c,payload,base,apikey){
  const previous=(await queue(c)).find(x=>x.state==='pending'&&canonical(x.payload)===canonical(payload));if(previous)return previous;
  const id=uuid(),operation={type:'operation',bucket:'operations:'+scope(c),id,scope:scope(c),actor:c.actor,tenant:c.tenant,payload,base,apikey,created:now(),order:++seq,state:'pending'};
  await store.put('operation:'+id,operation);await notify();return operation;
 }
 async function apply(op,headers,fetcher,deferred=false){
  const r=await fetcher(op.base+'/rest/v1/rpc/gestlok_sync_apply',{method:'POST',headers,body:JSON.stringify({p_id:op.id,p_tenant:op.tenant,p_payload:op.payload,p_deferred:deferred}),cache:'no-store'});
  if(!r.ok){const error=await r.json().catch(()=>({message:'Error de sincronización'}));const e=Error(error.message||'No se pudo sincronizar');e.status=r.status;throw e;}
  const value=await r.json();
  if(op.payload.kind==='table'){
   const table=op.payload.table;
   for(const row of Array.isArray(value)?value:[])if(row){const key='row:'+op.scope+':'+rowKey(table,row);if(op.payload.method==='DELETE')await store.remove(key);else await store.put(key,{type:'row',bucket:'rows:'+op.scope+':'+table,key,row});}
  }
  await store.remove('operation:'+op.id);lastError='';await notify();root.dispatchEvent?.(new Event('gestlok-sync-complete'));return value;
 }
 async function flush(){
  if(busy||!online()||!active||!auth)return;
  const current=clone(active);busy=true;await notify();
  try{
   const session=await auth();if(!session||session.user?.id!==current.actor)return;
   const headers=new Headers({'authorization':'Bearer '+session.access_token,'apikey':current.apikey||'' ,'content-type':'application/json'});
   const work=async()=>{for(const op of await queue(current)){if(!online()||op.state==='blocked'||!active||scope(active)!==scope(current)||(await auth())?.user?.id!==current.actor)break;headers.set('apikey',op.apikey);try{await apply(op,headers,root.fetch.bind(root),true);}catch(e){lastError=e.message;if(e.status&&e.status<500){op.state='blocked';op.error=e.message;await store.put('operation:'+op.id,op);}break;}}};
   if(root.navigator?.locks)await root.navigator.locks.request('gestlok-sync:'+scope(current),work);else await work();
  }finally{busy=false;await notify();}
 }
 function transport(base,apikey,fetcher=root.fetch.bind(root)){
  return async(input,init={})=>{
   const request=new Request(input,init),url=new URL(request.url);if(url.origin!==new URL(base).origin)return fetcher(input,init);
   const headers=new Headers(request.headers);const method=request.method;const body=method==='GET'?null:await request.clone().json().catch(()=>null);
   if(!url.pathname.startsWith('/rest/v1/')&&url.pathname!=='/auth/v1/user')return fetcher(input,init);
   const c=await context(headers,base,fetcher);if(!c)return fetcher(input,init);
   c.apikey=apikey;
   const name=url.pathname.split('/').at(-1),rpc=url.pathname.includes('/rpc/'),read=method==='GET'||rpc&&READS.has(name);
   const cacheKey='read:'+scope(c)+':'+method+':'+url.pathname+url.search+':'+canonical(body)+':'+headers.get('accept')+':'+headers.get('range');
   if(read){
    if(online())try{const r=await fetcher(input,init);if(!r.ok&&r.status<500)return r;if(r.ok){const value=await r.clone().json();await store.put(cacheKey,{type:'read',value,at:now()});if(!rpc)await cacheRows(c,name,value,filters(url)||{});if(rpc&&name==='rm_app_branch_schedule_links')for(const row of value||[])await store.put('link:'+scope(c)+':'+row.local_id,{url:row.url});const table=!rpc&&await tableRead(c,name,url,headers,value);return table?response(table.value,r.status,{'content-range':r.headers.get('content-range')||'*/'+table.count}):r;}}catch(e){if(e?.name==='AbortError')throw e;}
    const cached=await store.get(cacheKey);if(!rpc&&(cached||await store.get('complete:'+scope(c)+':'+name))){const table=await tableRead(c,name,url,headers,cached?.value);if(table)return response(table.value);}
    if(cached){if(cached.value?.expires_at&&Date.parse(cached.value.expires_at)<now())return response({message:'Necesitás conexión para renovar este acceso.'},401);return response(cached.value);}
    return response({message:'Esta sección todavía no se descargó para usar sin conexión.'},503);
   }
   const data=await payload(c,name,method,url,body);if(!data)return fetcher(input,init);
   // Accept only actions with a known baseline when replacing an existing row offline.
   if(!online()&&data.kind==='table'&&data.method!=='POST'&&data.rows.some(r=>!r.check))return response({message:'Abrí esta planilla con conexión antes de guardar cambios sin internet.'},409);
   const op=await saveOperation(c,data,base,apikey);
   let result;
   if(online()&&(await queue(c))[0]?.id===op.id)try{result=await apply(op,headers,fetcher);}catch(e){lastError=e.message;if(e.status&&e.status<500){op.state='blocked';op.error=e.message;await store.put('operation:'+op.id,op);await notify();return response({message:e.message},e.status);}}
   if(result===undefined){
    if(data.kind==='table')result=data.rows.map(r=>({...r.key,...r.body}));
    else {void flush();return response({message:'Solicitud guardada en este equipo, pendiente de sincronización.',code:'GL_PENDING'},503);}
   }
   void flush();
   if(rpc&&name==='doc_update')return response(1);
   if(rpc)return response(result);
   const single=headers.get('accept')?.includes('vnd.pgrst.object');return response(single?result?.[0]??null:result);
  };
 }
 async function prepare(client){
  if(!online())return;
  const session=(await client.auth.getSession()).data.session;if(!session?.user?.id||preparing.has(session.user.id))return;
  const task=(async()=>{const check=await client.rpc('gestlok_sync_context');if(check.error||!check.data?.tenant)return;
   const identity=await client.rpc('rm_app_me');
   for(const table of ['docs','rm_test_documents','rm_app_settings','rm_app_local','rm_companies','rm_schedules','rm_schedule_comments','gestlok_tiendas','gestlok_productos_tienda']){
    for(let from=0;online();from+=1000){const result=await client.from(table).select('*',{count:'exact'}).range(from,from+999);if(result.error||typeof result.count!=='number')break;if(from+1000>=result.count){if(active?.actor===session.user.id)await store.put('complete:'+scope(active)+':'+table,{type:'complete'});break;}}
   }
   await client.rpc('mi_acceso');
   if(identity.data?.role==='owner'||identity.data?.role==='admin'){
    await client.rpc('rm_app_organizations');await client.rpc('rm_app_locals');await client.rpc('rm_app_users');
    const companies=await client.from('rm_companies').select('*');for(const c of companies.data||[]){await client.rpc('rm_app_branch_schedule_links',{p_local:null,p_company:c.id});await client.rpc('rm_app_schedule_context',{p_company:c.id});}
   }
   for(const local of identity.data?.gestlok_gerente?.local_ids||[])await client.rpc('rm_app_branch_schedule_links',{p_local:local,p_company:null});
  })().catch(e=>{lastError='No se completó la descarga para uso sin conexión: '+String(e.message||e);}).finally(()=>{preparing.delete(session.user.id);void notify();});
  preparing.set(session.user.id,task);return task;
 }
 function attach(client,base,home='/'){
  const key='sb-'+new URL(base).hostname.split('.')[0]+'-auth-token',original=client.auth.getSession.bind(client.auth),getUser=client.auth.getUser?.bind(client.auth),signOut=client.auth.signOut?.bind(client.auth);
  const saved=()=>{try{return JSON.parse(root.localStorage.getItem(key)||'null');}catch{return null;}};
  client.auth.getSession=async()=>{if(!online()){const session=saved();if(session?.user?.id&&await store.get('identity:'+session.user.id))return {data:{session},error:null};}return original();};
  if(getUser)client.auth.getUser=async()=>{if(!online()){const session=saved();if(session?.user?.id&&await store.get('identity:'+session.user.id))return {data:{user:session.user},error:null};}return getUser();};
  if(signOut)client.auth.signOut=async(...args)=>{const session=saved();if(!online()){root.localStorage.removeItem(key);if(session?.user?.id)await api.clearIdentity(session.user.id);root.location?.assign(home);return {error:null};}const r=await signOut(...args);if(!r.error&&session?.user?.id)await api.clearIdentity(session.user.id);return r;};
  api.bindAuth(async()=>{const r=await client.auth.getSession();return r.data.session;});
  client.auth.onAuthStateChange?.((event)=>{if(event==='SIGNED_IN'||event==='INITIAL_SESSION')root.setTimeout(()=>void prepare(client),1000);});
  root.setTimeout(()=>void prepare(client),1500);
  const refresh=()=>{if(online())client.auth.startAutoRefresh?.();else client.auth.stopAutoRefresh?.();};root.addEventListener?.('online',refresh);root.addEventListener?.('offline',refresh);refresh();
  return client;
 }
 const api={transport,attach,prepare,flush,available:()=>!!active||demoMode,demo(mode){if(root.location&&new URLSearchParams(root.location.search).get('demo')==='1')demoMode=!!mode;},bindAuth(fn){auth=fn;void flush();},subscribe(fn){listeners.add(fn);void notify();return()=>listeners.delete(fn);},pending:()=>pendingCount,
  async list(){return active?queue(active):[];},async discard(id){const op=await store.get('operation:'+id);if(active&&op?.scope===scope(active)){await store.remove('operation:'+id);await notify();}},
  async clearIdentity(id){contexts.delete(id);if(active?.actor===id){active=null;pendingCount=0;}await notify();},
  _test:{rows,context,store,canonical}};
 root.addEventListener?.('online',()=>{void flush();void notify();});root.addEventListener?.('offline',()=>void notify());root.addEventListener?.('focus',()=>void flush());
 return api;
}
const exports={create,PK,READS,WRITES};
if(typeof module!=='undefined'&&module.exports)module.exports=exports;
if(root?.document){
 const api=root.GestLokOffline=create();
 const mount=()=>{if(root.document.getElementById('gl-offline-sync'))return;const box=root.document.createElement('aside');box.id='gl-offline-sync';box.setAttribute('aria-label','Estado de sincronización');box.style.cssText='position:fixed;bottom:78px;left:12px;right:12px;max-width:620px;margin:auto;z-index:11000;background:#112e40;color:white;padding:12px 16px;border-radius:14px;box-shadow:0 4px 18px #0003;font:14px system-ui';
 const text=root.document.createElement('span');text.setAttribute('role','status');text.setAttribute('aria-live','polite');const button=root.document.createElement('button');button.textContent='Ver pendientes';button.style.cssText='margin-left:12px;background:#fff;color:#112e40;border:0;padding:7px;border-radius:8px';const list=root.document.createElement('div');list.hidden=true;button.onclick=()=>{list.hidden=!list.hidden;};box.append(text,button,list);root.document.body.append(box);
 api.subscribe(state=>{box.hidden=state.online&&!state.pending&&!state.error;text.textContent=state.error?'Hay cambios que necesitan revisión. '+state.error:state.busy?'Sincronizando cambios pendientes…':state.pending?state.pending+' cambio(s) guardado(s) en este equipo. Se enviarán automáticamente al recuperar conexión.':'Sin conexión. Se muestran los datos descargados en este equipo.';button.hidden=!state.pending;list.replaceChildren();for(const item of state.items){const row=root.document.createElement('p');row.textContent=(item.payload.kind==='table'?'Cambio de planilla':'Solicitud de la aplicación')+' · '+(item.state==='blocked'?'Necesita revisión':'Pendiente');const discard=root.document.createElement('button');discard.textContent='Descartar';discard.onclick=()=>{if(root.confirm('¿Descartar este cambio pendiente? No modifica lo que ya está guardado en la nube.'))void api.discard(item.id);};row.append(' ',discard);list.append(row);}if(state.items.length){const download=root.document.createElement('button');download.textContent='Descargar copia de pendientes';download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state.items,null,2)],{type:'application/json'}));const a=root.document.createElement('a');a.href=url;a.download='GESTLOK-pendientes.json';a.click();root.setTimeout(()=>URL.revokeObjectURL(url),1000);};list.append(download);}});
 root.setInterval(()=>void api.flush(),20000);
 };if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
}
})(typeof window==='undefined'?globalThis:window);
