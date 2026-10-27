/* GestLok · DEMO PÚBLICA AISLADA: ninguna escritura/consulta de datos de negocios reales.
 * Reutiliza app.js y sus módulos; sustituye únicamente acceso y almacenamiento
 * por un adaptador local en memoria/sessionStorage. Siempre datos ficticios.
 * La única conexión opcional registra métricas de sesión sin identificar visitantes. */
(()=>{
'use strict';
const params=new URLSearchParams(location.search);
if(params.get('demo')!=='1')return;
const SID='gestlok:visitor:demo:v1';
const STATS_CHOICE='gestlok:demo:stats-choice:v1';
const STATS_SESSION='gestlok:demo:stats-session:v1';
let statsClient=null;
function recordDemoChoice(){
 if(!statsClient || sessionStorage.getItem(STATS_CHOICE)!=='yes')return;
 try{
  let id=sessionStorage.getItem(STATS_SESSION);
  if(!id){id=crypto.randomUUID();sessionStorage.setItem(STATS_SESSION,id);}
  // Única excepción deliberada al aislamiento ficticio: registra exclusivamente
  // sesión aleatoria y rol/tienda visitados; nunca datos de la demo.
  statsClient.rpc('gestlok_demo_registrar',{
   p_sesion:id,p_rol:selectedRole,p_tienda:selectedShop
  }).catch(()=>{});
 }catch(e){console.warn('Estadísticas opcionales no disponibles');}
}
function statsChoice(){
 const choice=sessionStorage.getItem(STATS_CHOICE);
 if(choice==='yes'){recordDemoChoice();return;}
 if(choice==='no')return;
 if(document.getElementById('gl-demo-consent'))return;
 const bar=document.getElementById('gl-visitor-bar');if(!bar)return;
 const el=document.createElement('div');
 el.id='gl-demo-consent';
 el.setAttribute('role','group');el.setAttribute('aria-label','Estadísticas opcionales de la demo');
 el.innerHTML='<span>¿Nos permitís contar esta visita? Solo registramos una sesión aleatoria, el rol y la tienda explorados; sin correo ni datos personales.</span>'+
 '<button type="button" data-visitor-stats="yes">Permitir estadísticas</button>'+
 '<button type="button" data-visitor-stats="no">Seguir sin estadísticas</button>';
 bar.append(el);
}

const SHOPS={
 mercado:{name:'Mercado Central',type:'fisica',icon:'🏬'},
 nova:{name:'Nova Indumentaria',type:'mixta',icon:'🛍️'}
};
const roles={dueno:'Dueña',gerente:'Gerente'};
const next=(s)=>s.toString().padStart(4,'0');
const clone=x=>JSON.parse(JSON.stringify(x));
const today=()=>new Date().toISOString().slice(0,10);
const isoAfter=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const money=n=>Math.round(n*100)/100;
let selectedShop=SHOPS[params.get('shop')]?params.get('shop'):'mercado';
let selectedRole=roles[params.get('role')]?params.get('role'):'dueno';
let ready=false, state;
const email='visitante.'+selectedRole+'@demo.invalid';
const tenant='demo-empresa-'+selectedShop;
const teamId=email;
const updateSubs=new Map();
const uid=()=>('f'+Math.random().toString(36).slice(2,11)+Date.now().toString(36));
const safeEsc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function makeShop(id){
 const physical=id==='mercado';
 const cat=physical?['Almacén','Bebidas','Limpieza','Snacks','Cuidado personal']:
 ['Remeras','Pantalones','Abrigos','Calzado','Accesorios'];
 const names=physical?['Café molido','Galletitas','Agua mineral','Gaseosa','Detergente','Arroz','Aceite','Yerba mate','Jugo natural','Chocolate','Jabón','Harina','Papas fritas','Té verde','Leche']:
 ['Remera básica','Jean recto','Buzo algodón','Campera liviana','Zapatilla urbana','Camisa lino','Bermuda','Cinturón','Gorra','Vestido','Medias','Bolso','Top','Pantalón cargo','Sweater'];
 const suppliers=physical?['Distribuidora Norte','Mayorista Central','Bebidas del Sur']:
 ['Textiles Andina','Moda Mayorista','Accesorios del Sur'];
 const total=physical?150:500;
 const products=Array.from({length:total},(_,i)=>{
   const catName=cat[i%cat.length],base=names[i%names.length];
   return {
    id:'producto-'+id+'-'+next(i+1),nombre:base+' '+(i%11+1)+(physical?' · presentación':' · modelo'),
    sku:(physical?'MC':'NV')+'-'+next(i+1),cat:catName,categoria:catName,
    stock:i%13===0?0:2+(i*13)%55,min:8, minimo:8,sugerido:20,
    proveedor:suppliers[i%suppliers.length],unidad:'unidad',precio:money(450+(i%21)*140),
    costo:money(240+(i%19)*70),activo:true,ubicacion:'Estante '+(1+i%9),
    marca:physical?'Marca de ejemplo':'Nova Demo',variante:physical?'Unidad':
     (['S','M','L','XL'][i%4]+' · '+['Negro','Blanco','Azul'][i%3]),
    descripcion:'Artículo ficticio de demostración',orden:i+1,hoja:'stock'
   };
 });
 const docs={};
 const put=(col,id,data)=>{(docs[col]??={})[id]=data;};
 put('locales',id,{nombre:SHOPS[id].name,orden:1});
 put('configuracion_negocio','empresa-'+('demo-empresa-'+id),{
   tipo:SHOPS[id].type,actualizado:Date.now()
 });
 for(let i=0;i<products.length;i++)put(id+'/productos',products[i].id,products[i]);
 for(let i=0;i<6;i++)put(id+'/fabrica','f'+i,{
   nombre:names[i],categoria:cat[i%cat.length],local:12+i,fabrica:24+i,bloque:1
 });
 put(id+'/conteos','conteo-inicial',{fecha:Date.now()-3600000*8,autor:'demo.gerente@demo.invalid',
   responsable:'Gerente de prueba',tipo:'stock',hoja:'stock',cambios:[],nota:'Conteo de demostración'});
 put(id+'/proveedores','p-'+encodeURIComponent(suppliers[0].toLowerCase()),{
   nombre:suppliers[0],contacto:'Contacto ficticio',telefono:'',
   entrega:'Entrega de ejemplo',items:[],catalogo:{},pedidoActualizado:Date.now()-86400000
 });
 put(id+'/proveedores_historial','hist-001',{
   proveedor:suppliers[0],proveedorId:'p-'+encodeURIComponent(suppliers[0].toLowerCase()),
   fecha:Date.now()-86400000,productosTotal:2,
   productos:[{nombre:products[0].nombre,pedir:10,unidad:'unidad'},{nombre:products[1].nombre,pedir:5,unidad:'unidad'}]
 });
 put(id+'/chat','mensaje-bienvenida',{
   texto:'¡Bienvenidos a la demo! Este mensaje es ficticio.',autor:'demo.gerente@demo.invalid',
   nombre:'Gerente de ejemplo',fecha:Date.now()-90000,local:id
 });
 put(id+'/vencimientos','ficticio-v1',{
   nombre:physical?'Control de fumigación':'Control del depósito',
   fechaRealizacion:today(),fechaVencimiento:isoAfter(3),
   duracionDias:3,activo:true,historial:[]
 });
 put(id+'/vencimientos','ficticio-v2',{
   nombre:'Mantenimiento del local',fechaRealizacion:today(),
   fechaVencimiento:isoAfter(12),duracionDias:12,activo:true,historial:[]
 });
 put(id+'/avisos','aviso-prueba',{
   nombre:'Reposición pendiente',detalle:'Aviso ficticio de ejemplo',
   fecha:Date.now()-900000,activo:true,tipo:'stock'
 });
 put(id+'/pedidos_online','pedido-0001',{
   cliente:'Pedido DEMO #0001',producto:products[2].nombre,cantidad:2,
   items:[{nombre:products[2].nombre,cantidad:2,precio:products[2].precio}],
   total:products[2].precio*2,canal:'instagram',entrega:'envio',estado:'nuevo',
   fecha:Date.now()-900000,historial:[{estado:'nuevo',fecha:Date.now()-900000}]
 });
 put(id+'/pedidos_online','pedido-0002',{
   cliente:'Pedido DEMO #0002',producto:products[4].nombre,cantidad:1,
   items:[{nombre:products[4].nombre,cantidad:1,precio:products[4].precio}],
   total:products[4].precio,canal:'whatsapp',entrega:'retiro',estado:'preparando',
   fecha:Date.now()-3600000,historial:[{estado:'preparando',fecha:Date.now()-3600000}]
 });
 return {docs,catalog:products.map(p=>({
   ...p,tienda_id:'tienda-demo-'+id,tenant_id:'demo-empresa-'+id,
   publicado:false,imagen_url:'',precio_anterior:null,subcategoria:'',codigo_barras:''
 }))};
}
function fresh(){return {version:1,mercado:makeShop('mercado'),nova:makeShop('nova')};}
function restore(){
 try{
  const old=JSON.parse(sessionStorage.getItem(SID)||'null');
  if(old?.version===1 && old.mercado?.docs && old.nova?.catalog)return old;
 }catch{}
 return fresh();
}
const save=()=>{try{sessionStorage.setItem(SID,JSON.stringify(state));}catch{}};
const slot=()=>state[selectedShop];
const collection=(col)=>slot().docs[col]??={};
const notify=(col)=>{for(const fn of updateSubs.get(col)||[])queueMicrotask(fn);};
const itemSnap=(id,data)=>({id,exists:true,data:()=>clone(data),metadata:{fromCache:true,hasPendingWrites:false}});
const rowSnaps=(col,options={})=>{
 let rows=Object.entries(collection(col)).map(([id,v])=>itemSnap(id,v));
 if(options.filters)for(const [key,value] of options.filters)
  rows=rows.filter(x=>x.data()[key]===value);
 if(options.order){
  const {field,dir}=options.order,sign=dir==='desc'?-1:1;
  rows.sort((a,b)=>a.data()[field]>b.data()[field]?sign:a.data()[field]<b.data()[field]?-sign:0);
 }
 if(options.limit)rows=rows.slice(0,options.limit);
 return {docs:rows,size:rows.length,empty:rows.length===0,docChanges:()=>[],metadata:{fromCache:true,hasPendingWrites:false}};
};
/* Modo sin conexión simulado: sin internet, lo guardado en la demo se marca como pendiente
   y se «envía» solo al volver la conexión (no existe servidor: todo sigue en esta pestaña). */
const offlineMark=(col,what)=>{try{if(typeof navigator!=='undefined'&&navigator.onLine===false)window.GestLokOffline?.demoRecord?.(what+' · '+String(col).split('/').pop());}catch{}};
function documentRef(col,id){
 return {id,path:col+'/'+id,
  async get(){return col in slot().docs && Object.hasOwn(collection(col),id)
   ? itemSnap(id,collection(col)[id]):{id,exists:false,data:()=>undefined};},
  async set(value){collection(col)[id]=clone(value);save();notify(col);offlineMark(col,'Guardado');},
  async update(patch){
   if(!Object.hasOwn(collection(col),id))throw Error('Documento inexistente en demo');
   collection(col)[id]={...collection(col)[id],...clone(patch)};save();notify(col);offlineMark(col,'Cambio');
  },
  async delete(){delete collection(col)[id];save();notify(col);offlineMark(col,'Borrado');}
 };
}
function query(col,options={}){
 return {
  path:col,
  where(field,op,value){return query(col,{...options,filters:[...(options.filters||[]),[field,value]]});},
  orderBy(field,dir){return query(col,{...options,order:{field,dir:dir||'asc'}});},
  limit(n){return query(col,{...options,limit:n});},
  async get(){return rowSnaps(col,options);},
  onSnapshot(next,error){
   let live=true;
   const invoke=()=>{if(live)try{next(rowSnaps(col,options));}catch(e){error?.(e);}};
   if(!updateSubs.has(col))updateSubs.set(col,new Set());
   updateSubs.get(col).add(invoke);
   queueMicrotask(invoke);
   return ()=>{live=false;updateSubs.get(col)?.delete(invoke);};
  },
  doc(id){return documentRef(col,id||uid());},
  async add(data){const r=documentRef(col,uid());await r.set(data);return r;}
 };
}
const db=Object.freeze({
 collection:col=>query(col),
 doc:path=>{const ix=path.lastIndexOf('/');return documentRef(path.slice(0,ix),path.slice(ix+1));},
 async rpc(){throw {code:'invalid_argument',message:'Esta operación de servidor no está habilitada en la demo.'};}
});
const initials=txt=>(txt||'D').slice(0,1).toUpperCase();
const avatar=name=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#15364e"/><text x="32" y="41" font-size="28" text-anchor="middle" fill="#fff">'+initials(name)+'</text></svg>');
const user=Object.freeze({
 async me(){return {id:email,email,name:'Visitante · '+roles[selectedRole],
  rol:selectedRole,isOwner:false,canEdit:true,locales:[selectedShop],tenant_id:tenant,
  avatarUrl:avatar(roles[selectedRole])};},
 async profiles(ids){return Object.fromEntries(ids.map(id=>[id,{id,name:id.includes('gerente')?'Gerente de ejemplo':'Dueña de ejemplo'}]));},
 async id(){return email;},async isOwner(){return false;},
 async canEdit(){return true;},async can(){return true;}
});
const downloads=Object.freeze({async save({filename,data}){
 const blob=data instanceof Blob?data:new Blob([data]);
 const href=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=href;
 a.download='DEMO-'+String(filename||'archivo.csv').replace(/[^a-zA-Z0-9._-]/g,'-');
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),2000);
}});
const asRows=()=>slot().catalog;
function catalogSearch(args={}){
 let rows=asRows().filter(p=>p.tienda_id===args.p_tienda);
 const q=String(args.p_consulta||'').trim().toLocaleLowerCase('es');
 if(q)rows=rows.filter(p=>[p.nombre,p.sku,p.categoria,p.subcategoria,p.marca,p.variante,
  p.proveedor,p.ubicacion,p.codigo_barras].join(' ').toLocaleLowerCase('es').includes(q));
 if(args.p_categoria)rows=rows.filter(p=>p.categoria===args.p_categoria);
 if(args.p_proveedor)rows=rows.filter(p=>p.proveedor===args.p_proveedor);
 if(args.p_estado==='activos')rows=rows.filter(p=>p.activo);
 if(args.p_estado==='archivados')rows=rows.filter(p=>!p.activo);
 if(args.p_estado==='alertas')rows=rows.filter(p=>p.activo && p.minimo>0 && p.stock<=p.minimo);
 rows.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')||String(a.id).localeCompare(String(b.id),'es'));
 if(args.p_cursor_id)rows=rows.filter(p=>p.nombre>args.p_cursor_nombre ||
   (p.nombre===args.p_cursor_nombre && String(p.id)>String(args.p_cursor_id)));
 const limit=Math.min(100,Math.max(1,Number(args.p_limite)||50));
 return {items:clone(rows.slice(0,limit)),hasMore:rows.length>limit};
}
function builder(table){
 let mode='read', filters=[],patch=null,sorts=[],first=0,last=null,cols='*';
 const same=r=>filters.every(([k,v])=>r[k]===v);
 const execute=()=>{
  let rows=table==='gestlok_tiendas'?
   [{id:'tienda-demo-'+selectedShop,tenant_id:tenant,local_id:selectedShop,nombre:SHOPS[selectedShop].name}]
   :asRows();
  const candidates=rows.filter(same);
  if(mode==='insert'){
   if(table==='gestlok_tiendas')return {data:null,error:{message:'Espacio demo ya creado'}};
   const item={...clone(patch),id:uid()};
   asRows().push(item);save();return {data:cols==='id'?{id:item.id}:clone(item),error:null};
  }
  if(mode==='update'){
   if(!candidates.length)return {data:null,error:{message:'Artículo de demo no encontrado'}};
   for(const p of candidates)Object.assign(p,clone(patch));
   save();return {data:cols==='id'?{id:candidates[0].id}:clone(candidates[0]),error:null};
  }
  if(mode==='delete'){slot().catalog=rows.filter(p=>!same(p));save();return {data:null,error:null};}
  for(const s of sorts)rows=rows.sort((a,b)=>String(a[s.key]).localeCompare(String(b[s.key])));
  rows=rows.filter(same);
  if(last!==null)rows=rows.slice(first,last+1);
  return {data:clone(rows),error:null};
 };
 const b={
  select(c='*'){cols=c;return b;},
  eq(k,v){filters.push([k,v]);return b;},
  order(key){sorts.push({key});return b;},
  range(a,z){first=a;last=z;return b;},
  insert(value){mode='insert';patch=value;return b;},
  update(value){mode='update';patch=value;return b;},
  delete(){mode='delete';return b;},
  async maybeSingle(){const r=execute();return {...r,data:Array.isArray(r.data)?r.data[0]||null:r.data};},
  async single(){const r=execute();return {...r,data:Array.isArray(r.data)?r.data[0]||null:r.data};},
  then(onOk,onErr){return Promise.resolve(execute()).then(onOk,onErr);}
 };
 return b;
}
const sb=Object.freeze({
 from:table=>{if(!['gestlok_tiendas','gestlok_productos_tienda'].includes(table))
   throw Error('La demo no puede consultar tablas externas');return builder(table);},
 async rpc(name,args){
  const a=asRows();
  // Demo: también «Administrar a los empleados» (Horarios con un Excel ficticio, ver gestlok-demo-horarios.js).
  if(name==='gestlok_owner_area_context')return {data:{role:selectedRole,tenant_id:tenant,company_name:SHOPS[selectedShop].name,local_ids:[selectedShop],modules:{comercial:{authorized:true,operational:true},recibos_personal:{authorized:true,operational:true}}},error:null};
  if(name==='gestlok_gerente_area_context')return selectedRole==='gerente'?{data:{role:'gerente',tenant_id:tenant,local_ids:[selectedShop]},error:null}:{data:null,error:{message:'Solo gerentes'}};
  if(name==='gestlok_catalogo_pagina')return {data:catalogSearch(args),error:null};
  if(name==='gestlok_catalogo_resumen'){
   const live=a.filter(p=>p.activo);
   return {data:{total:a.length,activos:live.length,archivados:a.length-live.length,
    categorias:new Set(live.map(p=>p.categoria)).size,
    alertas:live.filter(p=>p.minimo>0&&p.stock<=p.minimo).length},error:null};
  }
  if(name==='gestlok_catalogo_categorias'){
   const map=new Map();
   for(const p of a.filter(p=>p.activo)){
     if(args.p_consulta&&!p.categoria.toLocaleLowerCase('es').includes(String(args.p_consulta).toLocaleLowerCase('es')))continue;
     const prev=map.get(p.categoria)||{categoria:p.categoria,productos:0,alertas:0};
     prev.productos++;
     if(p.minimo>0&&p.stock<=p.minimo)prev.alertas++;
     map.set(p.categoria,prev);
   }
   return {data:[...map.values()].sort((x,y)=>x.categoria.localeCompare(y.categoria,'es')).slice(0,200),error:null};
  }
  if(name==='gestlok_proveedor_guardar_historial'){
   if(!args||args.p_local!==selectedShop || !String(args.p_proveedor_id||'').startsWith('p-'))
     return {data:null,error:{message:'Carpeta ficticia inválida'}};
   const col=selectedShop+'/proveedores',hist=selectedShop+'/proveedores_historial';
   const entry=collection(col)[args.p_proveedor_id];
   const current=Number(entry?.pedidoActualizado||0),expected=Number(args.p_version||0);
   if(current!==expected)return {data:null,error:{message:'La lista ficticia cambió: revisala antes de guardar'}};
   if(!Array.isArray(args.p_productos)||!args.p_productos.length)
     return {data:null,error:{message:'No hay productos ficticios seleccionados'}};
   const version=Math.max(Date.now(),current+1),historialId=uid();
   collection(col)[args.p_proveedor_id]={
    ...(entry||{nombre:args.p_productos[0].proveedor||'Proveedor de ejemplo'}),
    items:clone(args.p_items||[]),catalogo:clone(args.p_catalogo||{}),
    pedidoActualizado:version,pedidoPor:email
   };
   collection(hist)[historialId]={
    proveedorId:args.p_proveedor_id,proveedor:collection(col)[args.p_proveedor_id].nombre,
    fecha:version,productos:clone(args.p_productos),productosTotal:args.p_productos.length,
    local:selectedShop,autor:email
   };
   save();notify(col);notify(hist);offlineMark(hist,'Pedido');
   return {data:{pedidoActualizado:version,historialId},error:null};
  }
  throw Error('El módulo nuevo requiere simulación de datos ficticios');
 }
});
const permitted={master:true,order_ready:true,due_soon:true,due_today:true,urgent_chat:true,important_changes:true};
const pushCategories=[['master','Recibir notificaciones push'],['order_ready','Pedido preparado'],
 ['due_soon','Vencimiento próximo'],['due_today','Vencimiento hoy'],
 ['urgent_chat','Mensaje urgente'],['important_changes','Cambios importantes']];
const demoPush=Object.freeze({
 attach(){},homePrompt(){return '';},
 drawerContent(){
  return '<section class="gl-push-settings" aria-label="Notificaciones de demostración"><h4>Ajustes simulados</h4>'+
   '<p class="gl-push-pref-description">Estas preferencias son ficticias. No se piden permisos ni se envían push.</p>'+
   pushCategories.map(([id,label])=>'<div class="gl-push-pref-row"><b>'+safeEsc(label)+'</b>'+
    '<button type="button" role="switch" aria-label="'+safeEsc(label)+'" aria-checked="'+permitted[id]+'" class="gl-push-switch '+(permitted[id]?'on':'')+
    '" data-visitor-notif="'+id+'"><span></span></button></div>').join('')+'</section>';
 },
 onOpen(){},onLogout(){}
});
function addBanner(){
 if(document.getElementById('gl-visitor-bar'))return;
 document.documentElement.classList.add('gl-visitor-mode');
 const el=document.createElement('header');
 el.id='gl-visitor-bar';el.setAttribute('aria-label','Modo demostración público');
 el.innerHTML='<div class="gl-visitor-sign"><b>GestLok · DEMO</b><small>Todo es ficticio · Los cambios quedan solo en esta pestaña</small></div>'+
 '<div class="gl-visitor-controls"><label>Tienda<select id="gl-visitor-shop">'+Object.entries(SHOPS).map(([id,p])=>
  '<option value="'+id+'" '+(id===selectedShop?'selected':'')+'>'+p.icon+' '+safeEsc(p.name)+'</option>').join('')+'</select></label>'+
 '<label>Rol<select id="gl-visitor-role">'+Object.entries(roles).map(([id,name])=>
  '<option value="'+id+'" '+(id===selectedRole?'selected':'')+'>'+name+'</option>').join('')+'</select></label>'+
 '<button id="gl-visitor-reset" class="btn sm" type="button">Reiniciar</button>'+
 '<a class="gl-visitor-exit" href="'+location.pathname+'">Salir de la demo</a></div>';
 document.body.prepend(el);
}
function navigate(shop,role){
 const p=new URLSearchParams({demo:'1',shop,role});
 location.href=location.pathname+'?'+p;
}
document.addEventListener('click',e=>{
 const t=e.target.closest?.('[data-visitor-stats]');if(!t)return;
 const choice=t.dataset.visitorStats;
 if(choice!=='yes'&&choice!=='no')return;
 e.preventDefault();
 sessionStorage.setItem(STATS_CHOICE,choice);
 document.getElementById('gl-demo-consent')?.remove();
 if(choice==='yes')recordDemoChoice();
},true);
document.addEventListener('change',e=>{
 if(e.target.id==='gl-visitor-shop')navigate(e.target.value,selectedRole);
 if(e.target.id==='gl-visitor-role')navigate(selectedShop,e.target.value);
});
document.addEventListener('click',e=>{
 const reset=e.target.closest?.('#gl-visitor-reset');
 if(reset){if(confirm('¿Reiniciar los dos negocios ficticios y borrar los cambios de esta pestaña?')){
  sessionStorage.removeItem(SID);location.reload();
 }return;}
 const toggle=e.target.closest?.('[data-visitor-notif]');
 if(toggle){
  const key=toggle.dataset.visitorNotif;
  if(!Object.hasOwn(permitted,key))return;
  permitted[key]=!permitted[key];
  toggle.setAttribute('aria-checked',String(permitted[key]));
  toggle.classList.toggle('on',permitted[key]);
 }
},true);
// Captura acciones con salida exterior; ninguna demo debe enviar mensajes ni solicitar permisos.
document.addEventListener('click',e=>{
 const t=e.target.closest?.('[data-act]');
 if(!t)return;
 if(['prov-share','prov-share-ready','prov-history-pdf','install','backup'].includes(t.dataset.act)){
  e.preventDefault();e.stopImmediatePropagation();
  alert('Esta acción está deshabilitada en la demostración. No se envían datos ni mensajes reales.');
 }
},true);
window.GestLokVisitorDemo=Object.freeze({active:true,isReady:()=>ready});
window.GestLokPush=demoPush;
window.GestLokSupabase=sb;
let resolved;
const accessReady=new Promise(resolve=>resolved=resolve);
window.claude=Object.freeze({async use(name){
 await accessReady;
 if(name==='db')return ready?db:null;
 if(name==='user')return ready?user:null;
 if(name==='downloads')return ready?downloads:null;
 return null;
}});
(async()=>{
 try{
  // ÚNICA operación con autenticación real: comprobar si ya hay sesión iniciada.
  // Si hay sesión, abrir la app privada, nunca la demo.
  const client=window.supabase.createClient(window.SPM_CONFIG.url,window.SPM_CONFIG.key,{
   auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data}=await client.auth.getSession();
  if(data?.session){location.replace(location.pathname);resolved();return;}
  state=restore();
  const userEntry={email,rol:selectedRole,locales:[selectedShop],nombre:roles[selectedRole]};
  slot().docs.equipo={['visitante-demo']:userEntry};
  ready=true;
  save();
  try{window.GestLokOffline?.demoAttach?.();}catch{}
  statsClient=client;
  addBanner();
  statsChoice();
  resolved();
 }catch(e){
  console.error('No se pudo abrir la demo:',e);
  resolved();
  const wrap=document.getElementById('hub');
  if(wrap){wrap.hidden=false;wrap.textContent='No se pudo comprobar el acceso de la demo. Recargá para reintentar.';}
 }
})();
})();
