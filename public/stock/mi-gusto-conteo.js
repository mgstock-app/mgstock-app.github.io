/* GESTLOK · Mi Gusto Munro y Don Torcuato · Conteo por turnos.
   Chapas representadas por cuadrados: 4 lados + diagonal = 5 chapas.
   El backend valida tenant, sucursal, rol, fecha y ediciones de catálogo. */
(()=>{
'use strict';
if(window.GestLokMunroConteo)return;
const TENANT='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const LOCALES=['munro','torcuato'];
// La interfaz es la misma, pero todas las consultas y escrituras del conteo
// se efectúan sobre funciones y tablas privadas de su propia sucursal.
const activeLocal=()=>LOCALES.includes(api?.S?.local)?api.S.local:'munro';
const localLabel=()=>activeLocal()==='torcuato'?'Don Torcuato':'Munro';
const onlyMunroHistoricalCorrection=rec=>activeLocal()==='munro'&&rec?.day==='2026-11-14'&&rec?.shift==='manana_entrada';
const SHIFTS=[['manana_entrada','Mañana · entrada'],['manana_salida','Mañana · salida'],['noche_salida','Noche · salida']];
const RESPONSABLES=['Cami','Shuli','Tizi'];
/** Orden único del turno. El último cierre abre mañana entrada del siguiente día. */
function nextTurn(date,turn){
 const idx=SHIFTS.findIndex(x=>x[0]===turn);
 if(idx<0)throw Error('Turno de Conteo no válido');
 return idx===SHIFTS.length-1?{day:plusDays(date,1),shift:SHIFTS[0][0]}:
  {day:date,shift:SHIFTS[idx+1][0]};
}

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arDay=()=>{const v=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const n=k=>v.find(t=>t.type===k)?.value||'';return n('year')+'-'+n('month')+'-'+n('day');};
const labelDay=s=>{const a=String(s||'').split('-');return a.length===3?a[2]+'/'+a[1]+'/'+a[0]:'—';};
function plusDays(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function marks(value){
 const n=Math.max(0,Math.min(500,Math.floor(Number(value)||0)));
 if(!n)return '<small aria-hidden="true">+</small>';
 const group=count=>'<svg viewBox="0 0 34 34" aria-hidden="true" focusable="false">'+
 (count>=1?'<path d="M5 4V30"/>':'')+(count>=2?'<path d="M5 4H29"/>':'')+
 (count>=3?'<path d="M29 4V30"/>':'')+(count>=4?'<path d="M5 30H29"/>':'')+
 (count>=5?'<path d="M5 30L29 4"/>':'')+'</svg>';
 const g=Math.floor(n/5),r=n%5;
 return '<span class="gcm-marks">'+Array.from({length:Math.min(g,12)},()=>group(5)).join('')+
 (r?group(r):'')+(g>12?'<small>+'+(g-12)*5+'</small>':'')+'</span>';
}
let api=null,snapshot=null,day=arDay(),shift='manana_entrada',activeVto='1',historyRecord=null,loading=false,error='',busy=false,finishing=false,opened=new Set(['EMPANADAS']),generation=0;
let historyMode=false,historyMonth=arDay().slice(0,7),historyRows=[],historyExpanded=null,historyLoading=false,historyError='',historyToken=0,autoResumeTurn=true,lastClosedDay=null,historyPreviewUrl='',historyPreviewError='';
let historyEditMode=false,historyEditKind='cell',historyEditProduct='',historyEditVto=1;
let historyCorrections=[],historyCorrectionsLoaded=false,historyCorrectionError='',historyCorrecting=false;
function clearHistoryEditor(){
 historyEditMode=false;historyEditKind='cell';historyEditProduct='';historyEditVto=1;
 historyCorrections=[];historyCorrectionsLoaded=false;historyCorrectionError='';historyCorrecting=false;
}

const queues=new Map();
// Borradores locales: se conservan hasta recibir confirmación real del servidor.
// Solo cantidades del usuario, local y fechas recientes; sin información de otras empresas.
const pendingDrafts=new Map();
let pendingStore='';
function draftStorageKey(){
 const user=api?.S?.me?.id||api?.S?.me?.email;
 return user?(activeLocal()==='munro'?'gcm:pendientes:v1:'+TENANT+':'+String(user):'gcm:pendientes:v2:'+TENANT+':torcuato:'+String(user)):'';
}
function persistDrafts(){
 if(!pendingStore||!window.localStorage)return;
 try{window.localStorage.setItem(pendingStore,JSON.stringify([...pendingDrafts.values()]));}
 catch(_){/* El conteo permanece en memoria y en la cola hasta la confirmación. */}
}
function readDrafts(){
 const key=draftStorageKey();
 if(!key||key===pendingStore)return;
 pendingStore=key;pendingDrafts.clear();
 try{
  const items=JSON.parse(window.localStorage?.getItem(key)||'[]');
  const today=arDay();
  if(Array.isArray(items))for(const item of items){
   if(!item||typeof item.key!=='string'||typeof item.day!=='string'||item.day>plusDays(today,1)||item.day<plusDays(today,-7))continue;
   if(!SHIFTS.some(x=>x[0]===item.shift)||!item.pid||!['cell','decomiso'].includes(item.kind))continue;
   pendingDrafts.set(item.key,item);
  }
 }catch(_){/* No interrumpir el conteo por un borrador local inválido. */}
}
function noteDraft(kind,d,s,pid,i,value){
 readDrafts();
 const key=[d,s,kind,pid,i].join('|');
 const item={key,kind,day:d,shift:s,pid,index:i,cell:{...value}};
 pendingDrafts.set(key,item);persistDrafts();
 return item;
}
function confirmDraft(item){
 if(pendingDrafts.get(item.key)!==item)return;
 pendingDrafts.delete(item.key);persistDrafts();
}
function overlayDrafts(){
 if(!snapshot)return;
 readDrafts();
 for(const draft of pendingDrafts.values()){
  if(draft.day!==day)continue;
  let rec=snapshot.counts.find(x=>x.shift===draft.shift);
  if(!rec){rec={day,shift:draft.shift,data:{},decomiso:{},status:'borrador'};snapshot.counts.push(rec);}
  if(draft.kind==='decomiso'){
   rec.decomiso=rec.decomiso||{};rec.decomiso[draft.pid]={...draft.cell};
  }else{
   rec.data=rec.data||{};
   rec.data[draft.pid]={...(rec.data[draft.pid]||{}),['v'+draft.index]:{...draft.cell}};
  }
 }
}
const activePending=()=>[...pendingDrafts.values()].filter(x=>x.day===day&&x.shift===shift);
const allowed=()=>!!api&&api.S?.me?.tenant_id===TENANT&&LOCALES.includes(api.S?.local)&&
 !window.GestLokCreatorSupport?.previewRol?.() &&
 (api.miRol()==='creadora'||api.miRol()==='dueno'||(api.miRol()==='gerente'&&api.misLocales().includes(api.S.local)));
const editable=()=>allowed()&&!finishing&&!api.S?.ro&&api.S?.offline!==true&&navigator.onLine!==false&&!!window.GestLokSupabase;
const admin=()=>allowed()&&api.miRol()==='creadora'&&!api.S?.ro;
const selected=()=>historyRecord||(snapshot?.counts||[]).find(s=>s.shift===shift)||null;
const closed=()=>!!historyRecord||selected()?.status==='finalizado';
function reset(){
 ++generation;++historyToken;
 snapshot=null;day=arDay();shift='manana_entrada';activeVto='1';historyRecord=null;
 loading=false;busy=false;finishing=false;error='';queues.clear();pendingDrafts.clear();pendingStore='';opened=new Set(['EMPANADAS']);
 historyMode=false;historyMonth=arDay().slice(0,7);historyRows=[];historyExpanded=null;historyLoading=false;historyError='';autoResumeTurn=true;lastClosedDay=null;historyPreviewUrl='';historyPreviewError='';clearHistoryEditor();
}
async function rpc(name,args){
 if(!allowed()||!window.GestLokSupabase)throw Error('Sin acceso o sin conexión con el servidor.');
 const local=activeLocal();
 // No aceptar RPC arbitrarios: solo los nombres del módulo original.
 if(!/^gestlok_munro_conteo_[a-z_]+$/.test(name))throw Error('Función de Conteo no autorizada');
 const target=local==='torcuato'?name.replace('gestlok_munro_conteo_','gestlok_torcuato_conteo_'):name;
 const r=await window.GestLokSupabase.rpc(target,args||{});
 if(r.error)throw Error(r.error.message||'No se pudo guardar.');
 return r.data;
}
async function refresh(){
 if(!allowed()||loading||busy)return;
 const token=generation,d=day;
 loading=true;
 try{
  const value=await rpc('gestlok_munro_conteo_state',{p_day:d});
  if(token!==generation||day!==d)return;
  if(!Array.isArray(value?.products)||!Array.isArray(value?.counts)||!Array.isArray(value?.history))throw Error('Respuesta incompleta del servidor.');
  snapshot=value;overlayDrafts();error='';
  if(autoResumeTurn&&d===arDay()){
   autoResumeTurn=false;
   const firstOpen=SHIFTS.find(([id])=>value.counts.find(row=>row.shift===id)?.status!=='finalizado');
   if(firstOpen)shift=firstOpen[0];
   else{
    // Ya cerraron los 3 turnos del día: continuar con la entrada del día siguiente.
    day=plusDays(d,1);shift=SHIFTS[0][0];snapshot=null;
   }
  }
 }catch(e){if(token===generation)error=e.message||'No se pudo consultar Conteo';}
 finally{loading=false;if(token===generation&&api?.S?.view==='conteo-munro')api.render();}
}
// El historial es una pantalla separada. No muestra datos de producto hasta tocar Ver detalle.
async function loadHistory(){
 if(!historyMode||!allowed()||historyLoading)return;
 const token=++historyToken,month=historyMonth;
 historyLoading=true;historyError='';
 try{
  const rows=await rpc('gestlok_munro_conteo_history',{p_month:month+'-01'});
  if(token!==historyToken||!historyMode||month!==historyMonth)return;
  if(!Array.isArray(rows))throw Error('No se pudo leer el historial.');
  historyRows=rows.filter(r=>r&&typeof r.day==='string'&&SHIFTS.some(s=>s[0]===r.shift));
  historyError='';
 }catch(e){
  if(token===historyToken)historyError=e.message||'No se pudo cargar el historial';
 }finally{
  if(token===historyToken){historyLoading=false;if(api?.S?.view==='conteo-munro')api.render();}
 }
}
function dateTitle(iso){
 const d=new Date(iso+'T12:00:00Z');
 return new Intl.DateTimeFormat('es-AR',{weekday:'long',timeZone:'UTC'}).format(d);
}
// Corrección excepcional de etiqueta: 14/11/2026 fue un solo conteo real.
 // Se mantiene el ID original del registro (manana_entrada) y TODAS sus cantidades.
 // Solo el texto visible en el historial y su PNG se identifica como Noche salida.
 function historyShiftLabel(rec){
  if(onlyMunroHistoricalCorrection(rec))return 'Noche · salida';
  return SHIFTS.find(s=>s[0]===rec?.shift)?.[1]||rec?.shift||'';
 }
 function groupedHistory(){
 const groups=new Map();
 for(const r of historyRows){
  if(!groups.has(r.day))groups.set(r.day,new Map());
  groups.get(r.day).set(r.shift,r);
 }
 return [...groups.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
}
function conteoHistorialNav(mode){
 return '<nav class="gcm-mode-nav" aria-label="Conteo e historial">'+
 '<button type="button" data-gcm-history-exit'+(mode==='conteo'?' class="is-active" aria-current="page"':'')+'>Conteo</button>'+
 '<button type="button" data-gcm-history-open'+(mode==='historial'?' class="is-active" aria-current="page"':'')+'>Historial</button>'+
 '</nav>';
}
function historyListView(){
 const groups=groupedHistory();
 const days=groups.map(([date,records])=>{
  const expanded=historyExpanded===date;
  const name=(date===arDay()?'Hoy · ':'')+labelDay(date);
  return '<section class="gcm-history-day">'+
   '<button type="button" class="gcm-history-day-button" data-gcm-history-day="'+esc(date)+'" aria-expanded="'+expanded+'" aria-label="'+esc('Mostrar conteos del '+labelDay(date))+'">'+
   '<span class="gcm-history-date"><span class="gcm-history-calendar" aria-hidden="true">▦</span><strong>'+esc(name)+'</strong>'+
   '<span class="gcm-history-weekday">'+esc(dateTitle(date))+'</span></span>'+
   '<span class="gcm-history-arrow" aria-hidden="true">'+(expanded?'⌃':'⌄')+'</span></button>'+
   (expanded?'<div class="gcm-history-shifts">'+(activeLocal()==='munro'&&date==='2026-11-14'
  ?[['manana_entrada','Noche · salida']]
  :SHIFTS).map(([key,title])=>{
    const rec=records.get(key);
    return '<div class="gcm-history-shift"><span class="gcm-history-shift-name">Turno '+esc(title.replace(' · ',' '))+'</span>'+
    (rec?'<span class="gcm-history-status'+(rec.status==='finalizado'?' is-done':'')+'">'+(rec.status==='finalizado'?'Finalizado':'En curso')+'</span>'+
     '<button type="button" class="gcm-history-detail-button" data-gcm-history="'+esc(date)+'|'+esc(key)+'">Vista previa A4</button>':
     '<span class="gcm-history-no-data">Sin cargar</span>')+'</div>';
   }).join('')+'</div>':'')+'</section>';
 }).join('');
 return '<div class="gcm-page gcm-history-screen">'+conteoHistorialNav('historial')+
  '<header class="gcm-history-top"><div class="gcm-history-title"><button type="button" data-gcm-history-exit>← Volver al conteo</button>'+
   '<div><span class="gcm-eyebrow">MI GUSTO · '+esc(localLabel().toUpperCase())+'</span><h2>Historial de conteos</h2></div></div>'+
   '<label>Mes <input type="month" id="gcm-history-month" min="2025-01" max="'+arDay().slice(0,7)+'" value="'+esc(historyMonth)+'"></label></header>'+
  (historyError?'<p class="gcm-error" role="alert">'+esc(historyError)+' <button type="button" data-gcm-history-retry>Reintentar</button></p>':'')+
  (historyLoading?'<p role="status" class="gcm-loading">Cargando historial…</p>':
   !groups.length&&!historyError?'<p class="gcm-history-empty">No hay conteos registrados en este mes.</p>':days)+
  '</div>';
}
// Resumen derivado de las cantidades realmente archivadas. Nunca modifica el historial.
function historyProductTotals(rec){
 // Conteo muestra snapshot.products en el orden original del catálogo.
 // El historial debe respetar exactamente ese mismo orden, no ordenar alfabéticamente.
 const catalogProducts=snapshot?.products||[];
 const catalog=new Map(catalogProducts.map(p=>[String(p.id),p]));
 const catalogOrder=new Map(catalogProducts.map((p,i)=>[String(p.id),i]));
 const ids=new Set([...Object.keys(rec.data||{}),...Object.keys(rec.decomiso||{})]);
 return [...ids].map(id=>{
  const p=catalog.get(id);
  if(!p)return {id,name:'Producto sin referencia ('+id.slice(0,8)+')',section:'OTROS',total:null,order:Number.MAX_SAFE_INTEGER};
  const data=rec.data?.[id]||{},decomiso=rec.decomiso?.[id]||{};
  let total=0;
  for(let i=1;i<=4;i++){
   const v=data['v'+i]||{};
   total+=amount(p,{chapas:Number(v.chapas)||0,sueltas:Number(v.sueltas)||0,qty:Number(v.qty)||0});
  }
  total+=amount(p,{chapas:Number(decomiso.chapas)||0,sueltas:Number(decomiso.sueltas)||0,qty:Number(decomiso.qty)||0});
  return {id,name:p.name,section:p.section||'OTROS',total,order:catalogOrder.get(id)??Number.MAX_SAFE_INTEGER};
 }).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}
// Agrupación únicamente visual: usa las secciones y los totales reales del catálogo.
// Se comparte entre la imagen A4 y el resumen de lectura. No escribe datos.
function historyGroupedProducts(rec){
 const groups=new Map();
 for(const row of historyProductTotals(rec)){
  const section=String(row.section||'OTROS').trim()||'OTROS';
  if(!groups.has(section))groups.set(section,{section,rows:[],total:0,missing:false});
  const group=groups.get(section);
  group.rows.push(row);
  if(row.total===null)group.missing=true;
  else group.total+=row.total;
 }
 return [...groups.values()];
}
function historySummaryTable(rec){
 const groups=historyGroupedProducts(rec);
 const general=groups.reduce((sum,group)=>sum+group.total,0);
 const missing=groups.some(group=>group.missing);
 const isEmpanadas=group=>group.section.toLocaleUpperCase('es').includes('EMPANADAS');
 const empanadas=groups.filter(isEmpanadas),others=groups.filter(group=>!isEmpanadas(group));
 // Un solo renglón por producto. El orden de la planilla se conserva íntegro.
 const card=group=>'<section class="gcm-hd-summary-group'+(isEmpanadas(group)?' gcm-hd-empanadas':'')+'"><h4>'+esc(group.section)+
   '<span>Total: '+group.total+(group.missing?' · revisar':'')+'</span></h4>'+
   '<table><thead><tr><th>Producto</th><th>Total</th></tr></thead><tbody>'+
   group.rows.map(row=>'<tr><td><strong>'+esc(row.name)+'</strong></td>'+
    '<td class="gcm-hd-summary-number">'+(row.total===null?'Sin referencia':row.total)+'</td></tr>').join('')+
   '</tbody></table></section>';
 return '<section class="gcm-hd-summary"><header class="gcm-hd-summary-header">'+
  '<h3>Productos y totales</h3><div>Total general <strong>'+general+'</strong></div></header>'+
  (groups.length?'<div class="gcm-hd-summary-layout'+(empanadas.length?' has-empanadas':'')+'">'+
    (empanadas.length?'<div class="gcm-hd-empanadas-stack">'+empanadas.map(card).join('')+'</div>':'')+
    (others.length?'<div class="gcm-hd-summary-grid">'+others.map(card).join('')+'</div>':'')+
    '</div>':'<p>Sin cantidades registradas</p>')+
  (missing?'<p>Algunos productos ya no están en el catálogo; revisalos antes de tomar el total como definitivo.</p>':'')+
  '</section>';
}
/* Imagen A4 del historial (Munro y Don Torcuato). Los bloques se forman con
   las categorías reales: jamás se asignan rubros, productos ni valores ficticios. */
function historyA4Image(rec){
 const canvas=document.createElement('canvas');
 canvas.width=1240;canvas.height=1754;
 const c=canvas.getContext('2d');
 if(!c)throw Error('Este dispositivo no puede generar la vista previa A4.');
 const W=canvas.width,H=canvas.height,M=67,right=W-M;
 const navy='#12345a',ink='#172d44',muted='#536b80',line='#dce5ed',pale='#eff4f9';
 const write=(text,x,y,size=21,color=ink,weight='500',align='left')=>{
  c.fillStyle=color;c.textAlign=align;c.textBaseline='alphabetic';
  c.font=weight+' '+size+'px Arial, sans-serif';
  c.fillText(String(text??''),x,y);
 };
 const trim=(value,maxWidth,size=21,weight='500')=>{
  c.font=weight+' '+size+'px Arial, sans-serif';
  let txt=String(value??'');
  if(c.measureText(txt).width<=maxWidth)return txt;
  while(txt.length>1&&c.measureText(txt+'…').width>maxWidth)txt=txt.slice(0,-1);
  return txt+'…';
 };
 const rule=(x,y,w,color=line)=>{
  c.strokeStyle=color;c.lineWidth=1.5;c.beginPath();
  c.moveTo(x,y);c.lineTo(x+w,y);c.stroke();
 };
 const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
 const groups=historyGroupedProducts(rec);
 const rows=groups.flatMap(group=>group.rows);
 const sum=groups.reduce((n,group)=>n+group.total,0);
 const consumption=Array.from({length:10},(_,i)=>rec.consumption?.[i]||{});
 const waste=rec.waste_visible&&Array.isArray(rec.waste)?
  rec.waste.filter(x=>String(x?.name||'').trim()||String(x?.value||'').trim()):[];
 const wasteCols=waste.length>27?4:waste.length>18?3:waste.length>9?2:1;
 const wasteRows=Math.ceil(waste.length/wasteCols);
 const wasteH=waste.length?55+wasteRows*27:0;
 const consH=385,consY=H-93-consH-wasteH;
 rect(0,0,W,H,'#fff');rect(0,0,W,13,navy);
 write('MI GUSTO  ·  '+localLabel().toUpperCase(),M,70,22,navy,'700');
 write('CONTEO DE PRODUCTOS',M,122,38,ink,'700');
 rule(M,140,W-2*M,navy);
 // Los datos identifican el turno sin ocupar toda la página.
 const meta=[
  ['Fecha',labelDay(rec.day)],
  ['Turno',historyShiftLabel(rec)],
  ['Responsable',rec.responsable||'Sin asignar'],
  ['Estado',rec.status==='finalizado'?'Finalizado':'En curso']
 ];
 const metaW=(W-2*M)/4;
 rect(M,160,W-2*M,86,pale);
 for(let i=0;i<meta.length;i++){
  const x=M+i*metaW;
  if(i)rect(x,172,1,62,line);
  write(meta[i][0],x+16,188,17,muted,'600');
  write(trim(meta[i][1],metaW-30,21,'700'),x+16,224,21,ink,'700');
 }
 // Barra principal: total de ese turno; los 10 consumos son espacios fijos.
 rect(M,262,W-2*M,99,navy);
 write('TOTAL GENERAL',M+23,297,20,'#dce8f4','700');
 write(sum,M+23,342,43,'#fff','700');
 write('10 ESPACIOS DE CONSUMO',right-23,325,21,'#fff','600','right');
 write('RESUMEN POR CATEGORÍA',M,407,26,navy,'700');
 rule(M,421,W-2*M);
 const top=437,available=Math.max(180,consY-top-24),gap=14;
 // Distribuir grupos de distintos tamaños en columnas, sin alterar su orden interno.
 const plans=[
  {cols:2,width:500,rowH:34,font:24,chunk:12},
  {cols:3,width:340,rowH:31,font:21,chunk:11},
  {cols:3,width:340,rowH:27,font:19,chunk:13},
  {cols:3,width:340,rowH:23,font:17,chunk:16},
  {cols:3,width:340,rowH:18,font:14,chunk:20}
 ];
 const arrange=plan=>{
  const colHeights=Array(plan.cols).fill(0),cards=[];
  for(const group of groups){
   for(let offset=0;offset<group.rows.length;offset+=plan.chunk){
    const slice=group.rows.slice(offset,offset+plan.chunk);
    const col=colHeights.indexOf(Math.min(...colHeights));
    const height=39+slice.length*plan.rowH;
    cards.push({group,rows:slice,continued:offset>0,col,y:colHeights[col]});
    colHeights[col]+=height+gap;
   }
  }
  return {plan,cards,height:Math.max(0,...colHeights)-gap};
 };
 let chosen=arrange(plans[plans.length-1]);
 for(const plan of plans){
  const candidate=arrange(plan);
  if(candidate.height<=available){chosen=candidate;break;}
 }
 const {plan,cards}=chosen;
 const startX=(W-(plan.cols*plan.width+(plan.cols-1)*21))/2;
 for(const card of cards){
  const x=startX+card.col*(plan.width+21),y=top+card.y;
  const totalLabel=card.continued?'':('Total '+card.group.total+(card.group.missing?'*':''));
  rect(x,y,plan.width,37,pale);
  write(trim(card.group.section+(card.continued?' (cont.)':''),plan.width-148,19,'700'),
   x+13,y+25,19,navy,'700');
  if(totalLabel)write(totalLabel,x+plan.width-12,y+25,17,navy,'700','right');
  for(let i=0;i<card.rows.length;i++){
   const row=card.rows[i],yy=y+39+i*plan.rowH;
   if(i%2===1)rect(x,yy,plan.width,plan.rowH,'#f8fafc');
   const label=trim(row.name,plan.width-113,plan.font,'600');
   write(label,x+13,yy+plan.rowH*.76,plan.font,ink,'600');
   write(row.total===null?'—':row.total,x+plan.width-13,yy+plan.rowH*.76,
    plan.font,navy,'700','right');
   rule(x,yy+plan.rowH,plan.width);
  }
 }
 if(!rows.length)write('Sin productos registrados en este turno',M,top+47,23,muted);
 if(groups.some(group=>group.missing))
  write('* Hay productos sin referencia; revisar el detalle del historial.',M,consY-14,16,'#9b6925');
 // Consumos: no se oculta ninguna de las diez filas originales.
 let y=consY;
 write('CONSUMOS  ·  10 COLABORADORES',M,y+25,26,navy,'700');
 y+=41;
 rect(M,y,W-2*M,40,pale);
 write('#',M+14,y+27,21,navy,'700');
 write('Colaborador',M+67,y+27,21,navy,'700');
 write('Consumo',right-14,y+27,21,navy,'700','right');
 y+=40;
 for(let i=0;i<10;i++){
  const row=consumption[i],rh=29;
  if(i%2===1)rect(M,y+i*rh,W-2*M,rh,'#f8fafc');
  write(i+1,M+15,y+i*rh+22,21,muted);
  write(trim(row.name||'—',650,21),M+67,y+i*rh+22,21,ink);
  write(trim(row.value||'—',260,21),right-14,y+i*rh+22,21,ink,'600','right');
  rule(M,y+(i+1)*rh,W-2*M);
 }
 y+=290;
 if(waste.length){
  y+=23;write('DESPERDICIOS',M,y,23,navy,'700');y+=14;
  const gapW=16,colW=(W-2*M-(wasteCols-1)*gapW)/wasteCols;
  for(let i=0;i<waste.length;i++){
   const col=Math.floor(i/wasteRows),r=i%wasteRows;
   const x=M+col*(colW+gapW),yy=y+r*27;
   write(trim(waste[i].name||'—',colW-91,17),x+4,yy+21,17,ink);
   write(trim(waste[i].value||'—',84,17),x+colW-4,yy+21,17,navy,'700','right');
   rule(x,yy+27,colW);
  }
 }
 rule(M,H-72,W-M*2);
 write('Conteo archivado · '+labelDay(rec.day),M,H-47,16,muted);
 write('Documento A4 · Mi Gusto '+localLabel(),right,H-47,16,muted,'500','right');
 return canvas.toDataURL('image/png');
}
function historyDetailsTable(section,products,rec){
 const showDecomiso=!!rec.decomiso_visible;
 const makeCell=(p,v)=>{
  const chapas=Math.max(0,Number(v?.chapas)||0),sueltas=Math.max(0,Number(v?.sueltas)||0),qty=Math.max(0,Number(v?.qty)||0);
  const total=p.units_per_chapa>0?chapas*p.units_per_chapa+sueltas:qty;
  if(!total)return '<td class="gcm-hd-qty">—</td>';
  const parts=p.units_per_chapa>0&&chapas?'<small>'+chapas+' '+(chapas===1?'chapa':'chapas')+(sueltas?' + '+sueltas+' u.':'')+'</small>':'';
  return '<td class="gcm-hd-qty"><strong>'+total+'</strong>'+parts+'</td>';
 };
 const rows=products.map(p=>{
  const v=rec.data?.[p.id]||{},decomp=rec.decomiso?.[p.id]||{};
  let total=0;
  const cols=[1,2,3,4].map(i=>{
   const cell=v['v'+i]||{};
   total+=amount(p,{chapas:Number(cell.chapas)||0,sueltas:Number(cell.sueltas)||0,qty:Number(cell.qty)||0});
   return makeCell(p,cell);
  }).join('');
  total+=amount(p,{chapas:Number(decomp.chapas)||0,sueltas:Number(decomp.sueltas)||0,qty:Number(decomp.qty)||0});
  return '<tr><th scope="row">'+esc(p.name)+'</th>'+(showDecomiso?makeCell(p,decomp):'')+cols+'<td class="gcm-hd-total">'+(total||'—')+'</td></tr>';
 }).join('');
 return '<details class="gcm-hd-category"'+(section==='EMPANADAS'?' open':'')+'>'+
   '<summary>'+esc(section)+'<span>'+products.length+' productos</span></summary>'+
   '<div class="gcm-scroller"><table><thead><tr><th>Producto</th>'+
   (showDecomiso?'<th>Decomiso</th>':'')+
   [1,2,3,4].map(i=>'<th>Vto '+i+'</th>').join('')+'<th>Total</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
   '</details>';
}
function historyExtraBlock(kind,title,rec){
 const existing=Array.isArray(rec[kind])?rec[kind]:[];
 const rows=kind==='consumption'?Array.from({length:10},(_,i)=>existing[i]||{}):
  existing.filter(r=>r&&(String(r.name||'').trim()||String(r.value||'').trim()));
 if(!rows.length||(kind==='waste'&&!rec.waste_visible))return '';
 return '<section class="gcm-hd-extra"><h3>'+title+'</h3><table><thead><tr>'+
 (kind==='consumption'?'<th>#</th>':'')+'<th>'+(kind==='consumption'?'Colaborador':'Producto')+'</th><th>'+(kind==='consumption'?'Consumo':'Cantidad')+'</th></tr></thead><tbody>'+
 rows.map((r,i)=>'<tr>'+(kind==='consumption'?'<td>'+(i+1)+'</td>':'')+
  '<td>'+esc(r.name||'—')+'</td><td>'+esc(r.value||'—')+'</td></tr>').join('')+
 '</tbody></table>'+
 (kind==='consumption'&&existing.length>10?
  '<p>Existen '+(existing.length-10)+' registros adicionales de turnos anteriores, conservados en el historial original.</p>':'')+
 '</section>';
}

function historyCorrectionPanel(rec){
 const canEdit=editable()&&rec.status==='finalizado';
 const catalog=snapshot?.products||[];
 const present=new Set([...Object.keys(rec.data||{}),...Object.keys(rec.decomiso||{})]);
 const products=catalog.filter(p=>present.has(p.id));
 const usable=products.length?products:catalog;
 if(!historyEditProduct||!usable.some(p=>p.id===historyEditProduct))historyEditProduct=usable[0]?.id||'';
 const p=usable.find(x=>x.id===historyEditProduct);
 const kind=historyEditKind;
 const idx=kind==='decomiso'?0:historyEditVto;
 const prev=kind==='cell'?rec.data?.[p?.id]?.['v'+idx]:
  kind==='decomiso'?rec.decomiso?.[p?.id]:null;
 const value={chapas:Number(prev?.chapas)||0,sueltas:Number(prev?.sueltas)||0,qty:Number(prev?.qty)||0};
 const input=(field,label,max)=>'<label>'+label+'<input type="number" min="0" max="'+max+
  '" step="1" inputmode="numeric" data-gcm-history-number="'+field+'" value="'+value[field]+'" required></label>';
 const list=kind==='consumption'?Array.from({length:10},(_,i)=>rec.consumption?.[i]||{name:'',value:''}):
  [...(Array.isArray(rec.waste)?rec.waste:[]),{name:'',value:''}].slice(0,60);
 const row=(r,i)=>'<div class="gcm-history-fix-row"><strong>'+(i+1)+'</strong>'+
  '<input data-gcm-history-extra-name placeholder="'+(kind==='consumption'?'Colaborador':'Producto')+'" maxlength="90" value="'+esc(r.name||'')+'" aria-label="Nombre fila '+(i+1)+'">'+
  '<input data-gcm-history-extra-value placeholder="'+(kind==='consumption'?'Consumo':'Cantidad')+'" maxlength="90" value="'+esc(r.value||'')+'" aria-label="Valor fila '+(i+1)+'"></div>';
 const details=kind==='cell'||kind==='decomiso'?
  '<div class="gcm-history-fix-grid"><label>Producto<select id="gcm-history-fix-product">'+
   usable.map(q=>'<option value="'+esc(q.id)+'"'+(q.id===historyEditProduct?' selected':'')+'>'+esc(q.section+' · '+q.name)+'</option>').join('')+
   '</select></label>'+
   (kind==='cell'?'<label>Vencimiento<select id="gcm-history-fix-vto">'+
    [1,2,3,4].map(n=>'<option value="'+n+'"'+(idx===n?' selected':'')+'>Vto '+n+'</option>').join('')+
    '</select></label>':'<p class="gcm-history-fix-expl">Decomiso del turno</p>')+
   (p?.units_per_chapa>0?input('chapas','Chapas (0–500)',500)+input('sueltas','Unidades sueltas (0–100000)',100000):
    input('qty','Unidades (0–1000000)',1000000))+'</div>'+
   '<p class="gcm-history-fix-expl">Valor archivado: <strong>'+
   (p?.units_per_chapa>0?value.chapas+' chapas + '+value.sueltas+' unidades':value.qty+' unidades')+
   '</strong>. El cambio afecta únicamente este producto y vencimiento.</p>':
  kind==='responsable'?'<label>Responsable del turno<select id="gcm-history-fix-responsable">'+
   RESPONSABLES.map(name=>'<option value="'+esc(name)+'"'+(rec.responsable===name?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>':
  '<div class="gcm-history-fix-list">'+list.map(row).join('')+'</div>'+
   '<p class="gcm-history-fix-expl">Se guardan los registros cargados. Los campos vacíos de la fila adicional no crean datos.</p>';
 const kinds=[['cell','Cantidad por vencimiento'],['decomiso','Decomiso'],['responsable','Responsable'],['consumption','Consumos'],['waste','Desperdicios']];
 const changes=historyCorrectionsLoaded?
  '<div class="gcm-history-corrections"><h4>Correcciones registradas</h4>'+
  (historyCorrections.length?historyCorrections.map(x=>'<article><strong>'+esc(x.kind==='cell'?'Vto '+x.expiry_index:x.kind==='decomiso'?'Decomiso':x.kind==='responsable'?'Responsable':x.kind==='consumption'?'Consumos':'Desperdicios')+
   '</strong> · '+esc(catalog.find(p=>p.id===x.product_id)?.name||'')+
   '<small>'+esc(x.actor_email||'')+' · '+esc(new Date(x.corrected_at).toLocaleString('es-AR'))+'</small>'+
   '<p>Motivo: '+esc(x.reason||'')+'</p><details><summary>Ver antes y después</summary>'+
   '<pre>'+esc(JSON.stringify(x.before_value))+' → '+esc(JSON.stringify(x.after_value))+'</pre></details></article>').join(''):
   '<p>Este turno todavía no tiene correcciones.</p>')+'</div>':'';
 return '<section class="gcm-history-correction">'+
  '<div class="gcm-history-correction-head"><div><h3>Correcciones del turno cerrado</h3>'+
  '<p>El turno sigue finalizado. Cada modificación se registra con fecha, usuario y motivo.</p></div>'+
  (canEdit?'<button type="button" data-gcm-history-fix-toggle aria-expanded="'+historyEditMode+'">'+
   (historyEditMode?'Cancelar edición':'Editar turno cerrado')+'</button>':'')+
  '<button type="button" data-gcm-history-show-corrections>Ver cambios realizados</button></div>'+
  (historyCorrectionError?'<p class="gcm-error" role="alert">'+esc(historyCorrectionError)+'</p>':'')+
  (canEdit&&historyEditMode?'<div class="gcm-history-fix-form" role="group" aria-label="Corregir turno finalizado">'+
   '<label>¿Qué querés corregir?<select id="gcm-history-fix-kind">'+
   kinds.map(([id,name])=>'<option value="'+id+'"'+(id===kind?' selected':'')+'>'+name+'</option>').join('')+'</select></label>'+
   details+
   '<label>Motivo obligatorio de la corrección<textarea id="gcm-history-fix-reason" maxlength="300" minlength="8" rows="2" placeholder="Por ejemplo: se registraron 3 unidades de más por error de carga"></textarea></label>'+
   '<button type="button" data-gcm-history-fix-save'+(historyCorrecting?' disabled':'')+'>Guardar corrección auditada</button>'+
   '<p class="gcm-history-fix-expl">Solo se guardará este cambio. El registro anterior permanece en auditoría.</p></div>':'')+
  changes+'</section>';
}
function historyDetailView(){
 const rec=historyRecord;
 if(!rec)return historyListView();
 const products=(snapshot?.products||[]).filter(p=>rec.data?.[p.id]||rec.decomiso?.[p.id]);
 const categories=[...new Set(products.map(p=>p.section))];
 const filename='conteo-'+activeLocal()+'-'+rec.day+'-'+(onlyMunroHistoricalCorrection(rec)?'noche_salida':rec.shift)+'.png';
 const image=historyPreviewUrl?'<figure class="gcm-a4-preview">'+
   '<img src="'+historyPreviewUrl+'" alt="Hoja A4 completa: conteo del '+esc(labelDay(rec.day))+'; '+esc(historyShiftLabel(rec))+'; productos, totales y consumos" loading="lazy">'+
   '<figcaption>Vista de impresión opcional. El resumen de pantalla es ancho y no depende del tamaño A4.</figcaption></figure>':
   '<p class="gcm-error" role="alert">'+esc(historyPreviewError||'No se pudo generar la imagen A4.')+'</p>';
 return '<div class="gcm-page gcm-history-screen gcm-history-detail gcm-history-wide">'+conteoHistorialNav('historial')+
  '<header class="gcm-history-top"><div class="gcm-history-title">'+
   '<button type="button" data-gcm-history-back>← Volver al historial</button>'+
   '<div><span class="gcm-eyebrow">MI GUSTO · '+esc(localLabel().toUpperCase())+'</span><h2>Resumen del conteo</h2></div></div></header>'+
  '<div class="gcm-hd-meta" aria-label="Datos del turno"><strong>'+esc(labelDay(rec.day))+'</strong>'+
  '<span>Turno '+esc(historyShiftLabel(rec).replace(' · ',' '))+'</span>'+
  '<span>Responsable: '+esc(rec.responsable||'Sin asignar')+'</span>'+
  '<span class="gcm-history-status'+(rec.status==='finalizado'?' is-done':'')+'">'+
  (rec.status==='finalizado'?'Finalizado':'En curso')+'</span></div>'+
  // Pantalla principal: tarjetas reales en todo el ancho; Empanadas ocupa la
  // fila completa y distribuye sus numerosos productos en columnas legibles.
  historySummaryTable(rec)+
  historyCorrectionPanel(rec)+
  '<details class="gcm-hd-consumption"><summary>Consumos <span>10 colaboradores</span></summary>'+
  '<div class="gcm-hd-consumption-body">'+historyExtraBlock('consumption','Consumos',rec)+'</div></details>'+
  (rec.waste_visible?'<details class="gcm-hd-consumption"><summary>Desperdicios</summary>'+
   '<div class="gcm-hd-consumption-body">'+historyExtraBlock('waste','Desperdicios',rec)+'</div></details>':'')+
  '<details class="gcm-hd-breakdown"><summary>Ver detalle por vencimiento</summary>'+
  '<p class="gcm-hd-notice">El detalle original se conserva. Las correcciones auditadas se gestionan arriba.</p>'+
  (categories.length?categories.map(section=>historyDetailsTable(section,products.filter(p=>p.section===section),rec)).join(''):
   '<p>No hay productos cargados.</p>')+'</details>'+
  // La hoja A4 queda disponible solo al desplegar esta opción secundaria;
  // nunca más sustituye la vista de pantalla ni limita el ancho del resumen.
  '<details class="gcm-hd-print"><summary>Descargar o imprimir</summary>'+
  '<h3>Vista previa A4 (opcional)</h3>'+
  '<div class="gcm-a4-toolbar">'+(historyPreviewUrl?'<a class="gcm-a4-download" href="'+historyPreviewUrl+
  '" download="'+filename+'">Descargar imagen A4 (PNG)</a>':'')+
  '<button type="button" data-gcm-a4-refresh>Regenerar vista previa</button></div>'+
  image+'</details></div>';
}
function entry(){return selected()||{day,shift,data:{},decomiso:{},decomiso_visible:false,waste_visible:false,hidden_sections:[],responsable:null,consumption:[],waste:[],status:'borrador'};}
function draftRecord(){
 if(!snapshot)return null;
 let rec=(snapshot.counts||[]).find(s=>s.shift===shift);
 if(!rec){rec={day,shift,data:{},decomiso:{},decomiso_visible:false,waste_visible:false,hidden_sections:[],responsable:null,consumption:[],waste:[],status:'borrador'};snapshot.counts.push(rec);}
 return rec;
}
function getDecomisoCell(p){
 const v=entry().decomiso?.[p.id]||{};
 return {chapas:Math.max(0,Number(v.chapas)||0),sueltas:Math.max(0,Number(v.sueltas)||0),qty:Math.max(0,Number(v.qty)||0)};
}
function getCell(p,i){
 const e=entry(),v=e.data?.[p.id]?.['v'+i]||{};
 return {chapas:Math.max(0,Number(v.chapas)||0),sueltas:Math.max(0,Number(v.sueltas)||0),qty:Math.max(0,Number(v.qty)||0)};
}
function patchCell(pid,i,newCell){
 const rec=draftRecord();if(!rec)return;
 rec.data=rec.data||{};rec.data[pid]={...(rec.data[pid]||{}),['v'+i]:{...newCell}};
}
const amount=(p,v)=>p.units_per_chapa>0?v.chapas*p.units_per_chapa+v.sueltas:v.qty;
function patchDecomiso(pid,newCell){const rec=draftRecord();if(rec){rec.decomiso=rec.decomiso||{};rec.decomiso[pid]={...newCell};}}
function saveDecomiso(p,newCell){
 patchDecomiso(p.id,newCell);
 const d=day,s=shift,draft=noteDraft('decomiso',d,s,p.id,0,newCell);
 const task=schedule(d+'|'+s+'|decomiso|'+p.id,()=>rpc('gestlok_munro_conteo_set_decomiso',{
  p_day:d,p_shift:s,p_product:p.id,p_chapas:newCell.chapas,p_sueltas:newCell.sueltas,p_qty:newCell.qty
 }));
 task.then(()=>confirmDraft(draft)).catch(()=>{});
 return task;
}

/* Controles de tamaño fijo: un toque suma chapa; unidades sueltas con botones +/-.
   No abrir teclado ni redibujar la planilla mientras se está contando. */
function chapaCompacta(p,v,canWrite,isDecomiso,index){
 const pid=esc(p.id),where=isDecomiso?'de decomiso':'del vencimiento '+index;
 const attrs=isDecomiso?'':' data-idx="'+index+'"';
 const plus=isDecomiso?'data-gcm-decomp-plus':'data-gcm-plus';
 const minus=isDecomiso?'data-gcm-decomp-minus':'data-gcm-minus';
 const unitPlus=isDecomiso?'data-gcm-decomp-suelta-plus':'data-gcm-suelta-plus';
 const unitMinus=isDecomiso?'data-gcm-decomp-suelta-minus':'data-gcm-suelta-minus';
 const suelta=isDecomiso?'data-gcm-decomp-suelta':'data-gcm-suelta';
 const disabled=canWrite?'':' disabled';
 const label=esc(p.name+' '+where);
 return '<div class="gcm-inline-count">'+
  '<div class="gcm-chapas-stepper">'+
   '<button type="button" class="gcm-mark-button" '+plus+'="'+pid+'"'+attrs+disabled+
    ' aria-label="Sumar chapa '+label+'" title="'+v.chapas+' chapas · tocar para sumar">'+
    '<span class="gcm-mark-visual">'+marks(v.chapas)+'</span><strong class="gcm-chapas-value">'+v.chapas+'</strong></button>'+
   '<button type="button" class="gcm-mark-undo" '+minus+'="'+pid+'"'+attrs+disabled+
    ' aria-label="Quitar chapa '+label+'" title="Quitar una chapa">−</button>'+
  '</div>'+
  '<div class="gcm-units-stepper">'+
   '<button type="button" class="gcm-unit-minus" '+unitMinus+'="'+pid+'"'+attrs+
    (!canWrite||v.sueltas<=0?' disabled':'')+' aria-label="Quitar unidad suelta '+label+'">−</button>'+
   '<input type="number" min="0" max="100000" inputmode="numeric" class="gcm-units-value" '+suelta+'="'+pid+'"'+attrs+
    ' value="'+v.sueltas+'"'+disabled+' aria-label="Unidades sueltas '+label+'">'+
   '<button type="button" class="gcm-unit-plus" '+unitPlus+'="'+pid+'"'+attrs+disabled+
    ' aria-label="Sumar unidad suelta '+label+'">+</button>'+
  '</div>'+
  '<span class="gcm-cell-save" role="status" aria-live="polite"></span>'+
 '</div>';
}
/* Productos sin chapas (aguas, gaseosas, etc.): un contador compacto y editable.
   Las unidades siguen guardándose en el mismo campo qty de cada vencimiento. */
function numericCompacta(p,v,canWrite,isDecomiso,index){
 const pid=esc(p.id),label=esc(p.name+(isDecomiso?' decomiso':' vencimiento '+index));
 const attrs=isDecomiso?'':' data-idx="'+index+'"';
 const plus=isDecomiso?'data-gcm-decomp-qty-plus':'data-gcm-qty-plus';
 const minus=isDecomiso?'data-gcm-decomp-qty-minus':'data-gcm-qty-minus';
 const inputAttr=isDecomiso?'data-gcm-decomp-qty':'data-gcm-qty';
 const disabled=canWrite?'':' disabled';
 return '<div class="gcm-numeric-count">'+
 '<div class="gcm-qty-stepper">'+
 '<button type="button" class="gcm-qty-minus" '+minus+'="'+pid+'"'+attrs+
 (!canWrite||!v.qty?' disabled':'')+' aria-label="Restar una unidad de '+label+'">−</button>'+
 '<input class="gcm-qty" type="number" min="0" max="1000000" inputmode="numeric" '+inputAttr+'="'+pid+'"'+attrs+
 ' value="'+(v.qty||0)+'"'+disabled+' aria-label="Unidades de '+label+'">'+
 '<button type="button" class="gcm-qty-plus" '+plus+'="'+pid+'"'+attrs+disabled+' aria-label="Sumar una unidad de '+label+'">+</button>'+
 '</div><span class="gcm-cell-save" role="status" aria-live="polite"></span></div>';
}
// Actualización puntual de la casilla y del total, sin reemplazar el DOM de Conteo.
function syncCountDom(el,p,i,isDecomp){
 const td=el.closest('td');
 if(!td)return;
 const v=isDecomp?getDecomisoCell(p):getCell(p,i);
 const button=td.querySelector('.gcm-mark-button');
 if(button){
  const visual=button.querySelector('.gcm-mark-visual');
  if(visual)visual.innerHTML=marks(v.chapas);
  const count=button.querySelector('.gcm-chapas-value');
  if(count)count.textContent=String(v.chapas);
  button.title=v.chapas+' chapas · tocar para sumar';
 }
 const units=td.querySelector('.gcm-units-value');
 if(units&&units!==el)units.value=String(v.sueltas);
 const directQty=td.querySelector('.gcm-qty');
 if(directQty&&directQty!==el)directQty.value=String(v.qty);
 const qtyMinus=td.querySelector('.gcm-qty-minus');
 if(qtyMinus)qtyMinus.disabled=v.qty<=0;
 const unitMinus=td.querySelector('.gcm-unit-minus');
 if(unitMinus)unitMinus.disabled=v.sueltas<=0;
 const row=td.closest('tr'),total=row?.querySelector('.gcm-total');
 if(total){
  let sum=amount(p,getDecomisoCell(p));
  for(let n=1;n<=4;n++)sum+=amount(p,getCell(p,n));
  total.textContent=sum?String(sum):'—';
 }
}

// Cada casilla reserva su espacio de confirmación; guardados anteriores no pisan el último.
function saveCellFeedback(el,task){
 const td=el.closest('td'),status=td?.querySelector('.gcm-cell-save');
 if(!td||!status)return;
 const token=String((Number(td.dataset.gcmSaveToken)||0)+1);
 td.dataset.gcmSaveToken=token;
 status.className='gcm-cell-save is-saving';status.textContent='Guardando…';
 task.then(()=>{
  if(td.dataset.gcmSaveToken!==token)return;
  status.className='gcm-cell-save is-saved';status.textContent='✓ Guardado';
 }).catch(()=>{
  if(td.dataset.gcmSaveToken!==token)return;
  status.className='gcm-cell-save is-error';status.textContent='No guardado';
 });
}

function decompColumn(p,canWrite){
 const v=getDecomisoCell(p);
 if(p.units_per_chapa>0){
  return '<td class="gcm-chapa gcm-decomp-cell gcm-vto-col'+(activeVto==='d'?' is-current-vto':'')+'" data-gcm-idx="d">'+chapaCompacta(p,v,canWrite,true,0)+'</td>';
 }
 return '<td class="gcm-decomp-cell gcm-numeric-cell gcm-vto-col'+(activeVto==='d'?' is-current-vto':'')+'" data-gcm-idx="d">'+numericCompacta(p,v,canWrite,true,0)+'</td>';
}

function categorySidebar(names,products){
 const links=names.map((name,index)=>'<button type="button" data-gcm-nav-section="'+esc(name)+'"'+(index===0?' class="is-active" aria-current="true"':'')+
 '><span>'+esc(name)+'</span><small>'+products.filter(p=>p.section===name).length+'</small></button>').join('');
 return '<button type="button" class="gcm-category-toggle" data-gcm-category-toggle aria-expanded="false" aria-controls="gcm-category-nav">☰ Categorías</button>'+
 '<aside class="gcm-category-nav" id="gcm-category-nav" aria-label="Navegar por categorías del conteo">'+
 '<div class="gcm-category-nav-head"><strong>Categorías</strong><button type="button" data-gcm-category-close aria-label="Cerrar categorías">×</button></div>'+
 '<div class="gcm-category-nav-items">'+links+
 '<button type="button" data-gcm-nav-extras="consumption">Consumo de Staff</button>'+
 '<button type="button" data-gcm-nav-extras="waste">Desperdicios</button></div></aside>';
}
function expiryRuler(showDecomiso){
 const base=historyRecord?.day||day;
 const dates=Array.from({length:4},(_,i)=>'<span class="gcm-expiry-ruler-date"><b>Vto '+(i+1)+'</b><strong>'+esc(labelDay(plusDays(base,i)).slice(0,5))+'</strong></span>').join('');
 return '<div class="gcm-expiry-ruler" aria-label="Vencimientos y fechas fijos durante el conteo">'+
 '<div class="gcm-expiry-ruler-scroll" role="region" aria-label="Fechas y vencimientos, desplazamiento horizontal" tabindex="0">'+
 '<div class="gcm-expiry-ruler-grid'+(showDecomiso?' has-decomiso':'')+'">'+
 '<span class="gcm-expiry-ruler-product">Producto</span>'+
 (showDecomiso?'<span class="gcm-expiry-ruler-decomiso">Decomiso</span>':'')+dates+
 '<span class="gcm-expiry-ruler-total">Total</span></div></div></div>';
}
function selectCategoryButton(root,name){
 root.querySelectorAll('.gcm-category-nav [data-gcm-nav-section],.gcm-category-nav [data-gcm-nav-extras]').forEach(btn=>{
  const active=btn.dataset.gcmNavSection===name||btn.dataset.gcmNavExtras===name;
  btn.classList.toggle('is-active',active);
  if(active)btn.setAttribute('aria-current','true');else btn.removeAttribute('aria-current');
 });
}
function updateCategoryFromScroll(){
 const root=document.querySelector?.('.gcm-count-screen');
 if(!root)return;
 const sections=[...root.querySelectorAll('.gcm-count-main .gcm-section,.gcm-count-main .gcm-extras')];
 const threshold=205;let last=null;
 for(const section of sections){if(section.getBoundingClientRect().top<=threshold)last=section;}
 const current=last||sections[0];
 if(current)selectCategoryButton(root,current.dataset.gcmSection||current.dataset.gcmKind);
}

function sectionTable(name,items,canWrite,canCatalog,showDecomiso,canManageCategories){
 const dateBase=historyRecord?.day||day;
 const dates=Array.from({length:4},(_,i)=>({vto:'Vto '+(i+1),dia:labelDay(plusDays(dateBase,i)).slice(0,5)}));
 const rows=items.map(p=>{
  const cells=[1,2,3,4].map(i=>{
   const v=getCell(p,i);
   if(p.units_per_chapa){
    return '<td class="gcm-chapa gcm-vto-col'+(activeVto===String(i)?' is-current-vto':'')+'" data-gcm-idx="'+i+'">'+chapaCompacta(p,v,canWrite,false,i)+'</td>';
   }
   return '<td class="gcm-numeric-cell gcm-vto-col'+(activeVto===String(i)?' is-current-vto':'')+'" data-gcm-idx="'+i+'">'+numericCompacta(p,v,canWrite,false,i)+'</td>';
  }).join('');
  let sum=amount(p,getDecomisoCell(p));
  for(let i=1;i<=4;i++)sum+=amount(p,getCell(p,i));
  return '<tr class="'+(p.units_per_chapa>0?'gcm-chapa-row':'gcm-qty-row')+'"><th scope="row" class="gcm-product-cell"><span class="gcm-product-name">'+esc(p.name)+'</span>'+ 
   (canCatalog?'<div class="gcm-product-actions">'+
   '<button type="button" class="gcm-product-menu-trigger" data-gcm-product-menu="'+esc(p.id)+'" aria-haspopup="dialog" aria-label="Opciones del producto '+esc(p.name)+'" title="Opciones del producto">⋯</button>'+
   '<dialog class="gcm-product-dialog" aria-label="Opciones del producto '+esc(p.name)+'">'+
   '<div class="gcm-product-dialog-heading"><strong>Opciones del producto</strong><span>'+esc(p.name)+'</span></div>'+
   '<div class="gcm-product-dialog-actions">'+
   '<button type="button" data-gcm-rename="'+esc(p.id)+'">Cambiar nombre</button>'+
   '<button type="button" data-gcm-remove="'+esc(p.id)+'">Quitar producto</button>'+
   '<button type="button" class="gcm-product-dialog-cancel" data-gcm-menu-close>Cancelar</button>'+
   '</div></dialog></div>':'')+
   '</th>'+(showDecomiso?decompColumn(p,canWrite):'')+cells+'<td class="gcm-total">'+(sum||'—')+'</td></tr>';
 }).join('');
 return '<details class="gcm-section" data-gcm-section="'+esc(name)+'"'+(opened.has(name)?' open':'')+'><summary><strong>'+esc(name)+'</strong>'+
 '<span class="gcm-section-toolbar"><span>'+items.length+' productos</span>'+
 (canManageCategories?'<button type="button" class="gcm-hide-section" data-gcm-hide-section="'+esc(name)+'" aria-label="Quitar sección '+esc(name)+' del conteo" title="Ocultar sección del conteo">Quitar</button>':'')+
 '</span></summary>'+
 (canCatalog?'<div class="gcm-product-add-bar">'+
 '<button type="button" class="gcm-add-product-trigger" data-gcm-add-product-open="'+esc(name)+'" aria-haspopup="dialog">+ Agregar producto</button>'+
 '<span>El producto aparecerá en los tres turnos.</span></div>'+
 '<dialog class="gcm-add-product-dialog" aria-label="Agregar producto en '+esc(name)+'">'+
 '<div class="gcm-product-dialog-heading"><strong>Agregar producto</strong><span>Categoría: '+esc(name)+'</span></div>'+
 '<label class="gcm-add-product-field">Nombre del producto'+
 '<input type="text" data-gcm-new-product-name maxlength="100" placeholder="Ej.: Pizza especial" autocomplete="off" required></label>'+
 '<label class="gcm-add-product-field">Cómo se cuenta'+
 '<select data-gcm-new-product-type>'+
 '<option value="0"'+(name!=='EMPANADAS'?' selected':'')+'>Por unidades</option>'+
 '<option value="27">Por chapas (27 unidades)</option>'+
 '<option value="30"'+(name==='EMPANADAS'?' selected':'')+'>Por chapas (30 unidades)</option>'+
 '</select></label>'+
 '<p class="gcm-add-product-help">Se agregará en esta categoría, para los tres turnos. No modifica conteos anteriores.</p>'+
 '<p class="gcm-add-product-error" role="alert" aria-live="polite" data-gcm-add-product-error></p>'+
 '<div class="gcm-add-product-actions"><button type="button" data-gcm-add-product-save>Guardar producto</button>'+
 '<button type="button" data-gcm-add-product-cancel>Cancelar</button></div></dialog>':'')+
 '<div class="gcm-scroller gcm-sheet-scroll" role="region" aria-label="'+esc(name)+'" tabindex="0"><table class="gcm-count-data-table'+(showDecomiso?' has-decomiso':'')+'"><colgroup><col class="gcm-col-product">'+
 (showDecomiso?'<col class="gcm-col-decomiso">':'')+Array.from({length:4},()=>'<col class="gcm-col-vto">').join('')+'<col class="gcm-col-total"></colgroup><thead class="gcm-repeat-head"><tr>'+
 '<th scope="col" class="gcm-product-head">Producto</th>'+(showDecomiso?'<th scope="col" class="gcm-decomp-head gcm-vto-col" data-gcm-idx="d">Decomiso</th>':'')+
 
 dates.map((s,index)=>'<th scope="col" class="gcm-vto-col'+(activeVto===String(index+1)?' is-current-vto':'')+'" data-gcm-idx="'+(index+1)+'"><span class="gcm-vto">'+esc(s.vto)+'</span><span class="gcm-vto-date">'+esc(s.dia)+'</span></th>').join('')+'<th scope="col">Total</th></tr></thead><tbody>'+rows+'</tbody></table></div></details>';
}
function extraTable(kind,title,headA,headB,rec,canWrite){
 const rows=Array.isArray(rec[kind])?rec[kind]:[];
 const count=kind==='consumption'?10:Math.min(60,Math.max(1,rows.length));
 return '<section class="gcm-extras" data-gcm-kind="'+kind+'"><div class="gcm-extra-header"><h3>'+title+'</h3>'+
 (canWrite&&kind!=='consumption'?'<button type="button" data-gcm-extra-add="'+kind+'"'+(rows.length>=60?' disabled':'')+
  ' aria-label="Agregar '+(kind==='consumption'?'colaborador':'desperdicio')+'">+ Agregar '+(kind==='consumption'?'colaborador':'desperdicio')+'</button>':'')+
 '</div><table><thead><tr><th>'+headA+'</th><th>'+headB+'</th>'+(canWrite&&kind!=='consumption'?'<th class="gcm-remove-col">Acción</th>':'')+'</tr></thead><tbody>'+
 Array.from({length:count},(_,i)=>{
  const item=rows[i]||{},disabled=canWrite?'':' disabled';
  return '<tr><td><input type="text" maxlength="90" data-gcm-extra="'+kind+'" data-row="'+i+'" data-field="name" value="'+esc(item.name||'')+
   '" placeholder="'+esc(headA)+'" aria-label="'+esc(headA)+' '+(i+1)+'"'+disabled+'></td>'+
   '<td><input type="text" maxlength="90" data-gcm-extra="'+kind+'" data-row="'+i+'" data-field="value" value="'+esc(item.value||'')+
   '" placeholder="'+esc(headB)+'" aria-label="'+esc(headB)+' '+(i+1)+'"'+disabled+'></td>'+
   (canWrite&&kind!=='consumption'?'<td class="gcm-remove-col"><button type="button" data-gcm-extra-remove="'+kind+'" data-row="'+i+
   '" aria-label="Quitar fila '+(i+1)+' de '+title+'" title="Quitar fila">×</button></td>':'')+'</tr>';
 }).join('')+'</tbody></table>'+
 (kind==='consumption'?'<p class="gcm-extra-hint">10 espacios fijos para colaboradores. Cada cambio se guarda automáticamente.</p>':'')+
 '</section>';
}
function extrasList(kind){
 const rec=draftRecord();if(!rec)return null;
 const vals=Array.isArray(rec[kind])?[...rec[kind]]:[];
 return {rec,vals};
}
function saveExtraList(kind,vals){
 if(!['consumption','waste'].includes(kind)||!Array.isArray(vals)||vals.length>60)return;
 const rec=draftRecord();if(!rec)return;
 if(kind==='waste'&&!rec.waste_visible)return;
 const safe=vals.map(x=>({name:String(x?.name||'').slice(0,90),value:String(x?.value||'').slice(0,90)}));
 rec[kind]=safe;
 const d=day,s=shift,copy=JSON.parse(JSON.stringify(safe));
 return schedule(d+'|'+s+'|'+kind,()=>rpc('gestlok_munro_conteo_set_extra',{
  p_day:d,p_shift:s,p_kind:kind,p_items:copy
 }));
}
/** Verifica contra Supabase cada cantidad antes de guardar o cerrar el turno.
 * Reintenta borradores locales y nunca descarta datos sin confirmación. */
async function verifyTurnSaved(requireExisting=false){
 const d=day,s=shift;
 await Promise.allSettled([...queues.values()]);
 const pending=activePending();
 const tasks=[];
 for(const draft of pending){
  const p=productById(draft.pid);
  if(!p)throw Error('Hay un producto pendiente que necesita revisión: '+draft.pid);
  tasks.push(draft.kind==='decomiso'?saveDecomiso(p,draft.cell):saveCell(p,draft.index,draft.cell));
 }
 await Promise.all(tasks);
 await Promise.all([...queues.values()]);
 if(day!==d||shift!==s)throw Error('El turno cambió durante el guardado. Revisá antes de cerrar.');
 if(activePending().length)throw Error('Hay cantidades sin guardar. No se puede cerrar el turno.');
 const state=await rpc('gestlok_munro_conteo_state',{p_day:d});
 if(!Array.isArray(state?.counts))throw Error('El servidor no pudo confirmar el guardado.');
 const local=entry(),remote=state.counts.find(x=>x.shift===s);
 if(!remote){
  if(requireExisting||Object.keys(local.data||{}).length||Object.keys(local.decomiso||{}).length)
   throw Error('Todavía no existe un conteo guardado para este turno.');
  return {state,remote:null};
 }
 const mismatched=Object.entries(local.data||{}).some(([pid,values])=>
  Object.entries(values).some(([vto,cell])=>{
   const saved=remote.data?.[pid]?.[vto];
   return !saved||['chapas','sueltas','qty'].some(k=>Number(saved[k]||0)!==Number(cell[k]||0));
  }));
 const decompMismatch=Object.entries(local.decomiso||{}).some(([pid,cell])=>
  ['chapas','sueltas','qty'].some(k=>Number(remote.decomiso?.[pid]?.[k]||0)!==Number(cell?.[k]||0)));
 const extraMismatch=['consumption','waste'].some(kind=>
  JSON.stringify(remote[kind]||[])!==JSON.stringify(local[kind]||[]));
 if(mismatched||decompMismatch||extraMismatch)
  throw Error('Hay cantidades sin confirmar en el servidor. No se cerró el turno.');
 if(requireExisting){
  if(remote.status==='finalizado')throw Error('Este turno ya está cerrado. Revisá el historial.');
  if(!RESPONSABLES.includes(remote.responsable))
   throw Error('Seleccioná al gerente responsable antes de cerrar el turno.');
 }
 return {state,remote};
}
function view(){
 if(!allowed())return '<p>El Conteo está disponible únicamente para el personal autorizado de su sucursal de Mi Gusto.</p>';
 // Se conserva el día seleccionado hasta que el gerente lo cambie expresamente.
 if(!snapshot&&!loading&&!error)void refresh();
 if(historyMode)return historyRecord?historyDetailView():historyListView();
 const rec=entry(),canWrite=editable()&&!closed()&&!!snapshot,canCatalog=admin()&&!historyRecord&&!busy;
 const showDecomiso=!!rec.decomiso_visible;
 if(activeVto==='d'&&!showDecomiso)activeVto='1';
 const sectionsLocked=!!snapshot?.settings?.locked;
 const canManageCategories=canWrite&&(!sectionsLocked||admin());
 const list=(snapshot?.products||[]).filter(p=>p.active||!!rec.data?.[p.id]||!!rec.decomiso?.[p.id]);
 // La administradora también puede recuperar categorías sin productos activos.
 const categories=[...new Set((admin()?snapshot?.products||[]:list).map(p=>p.section).filter(Boolean))];
 const hiddenSource=sectionsLocked&&!historyRecord?snapshot?.settings?.hidden_sections:rec.hidden_sections;
 const hidden=new Set(Array.isArray(hiddenSource)?hiddenSource:[]);
 const visibleCategories=categories.filter(name=>!hidden.has(name));
 const showWaste=!!rec.waste_visible;
 return '<div class="gcm-page gcm-count-screen">'+conteoHistorialNav('conteo')+
 '<header class="gcm-header gcm-header-compact"><div class="gcm-header-title"><span class="gcm-eyebrow">MI GUSTO · '+esc(localLabel().toUpperCase())+'</span><h2>Conteo</h2></div>'+
 '<div class="gcm-header-fields gcm-header-fields-compact" aria-label="Datos del conteo"><div class="gcm-field-local"><span>Local</span><strong>'+esc(localLabel())+'</strong></div>'+
 '<label class="gcm-field-responsable">Responsable <select id="gcm-responsable"'+(!canWrite?' disabled':'')+'><option value="">Seleccionar responsable</option>'+
 RESPONSABLES.map(n=>'<option value="'+esc(n)+'"'+(rec.responsable===n?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></label>'+
 '<div class="gcm-field-fecha"><span>Fecha</span><strong>'+labelDay(day)+'</strong></div></div></header>'+
 '<div class="gcm-save-bar"><span>Los cambios se guardan por casilla y pueden verificarse en el servidor.</span>'+
 '<button type="button" data-gcm-manual-save>Guardar conteo</button>'+
 (!closed()?'<button type="button" class="gcm-close-turn" data-gcm-finalize'+(!canWrite?' disabled':'')+'>Cerrar turno</button>':'')+
 '</div>'+
 // Sin pestañas de turnos: el avance es automático y se identifica en Historial.
 (error?'<p class="gcm-error" role="alert">'+esc(error)+' <button type="button" data-gcm-retry>Reintentar</button></p>':'')+
 (loading?'<p class="gcm-loading" role="status">Cargando conteos…</p>':'')+
 (snapshot?'<div class="gcm-help"><label class="gcm-decomp-toggle"><input type="checkbox" id="gcm-decomiso-toggle"'+(showDecomiso?' checked':'')+(!canWrite?' disabled':'')+'> Mostrar Decomiso</label><div>'+'Los cuatro vencimientos se completan en la misma planilla.'+
 '<span>'+(closed()?'Finalizado · solo lectura':!editable()?'Solo lectura':activePending().length?'Cambios pendientes de confirmar':busy?'Guardando…':'Guardado automático')+'</span></div></div>'+
'<div class="gcm-sheet-tip">Las cuatro fechas están juntas. En el celular deslizá la tabla hacia los costados para verlas.</div>'+
 '<div class="gcm-count-layout">'+categorySidebar(visibleCategories,list)+
 '<main class="gcm-count-main">'+expiryRuler(showDecomiso)+
 (canManageCategories?'<details class="gcm-section-config"><summary>Personalizar secciones'+(hidden.size?' · '+hidden.size+' ocultas':'')+'</summary>'+
 '<div class="gcm-config-options">'+categories.map(name=>
  '<label><input type="checkbox" data-gcm-section-visible="'+esc(name)+'"'+(!hidden.has(name)?' checked':'')+
  (!canWrite?' disabled':'')+'><span>'+esc(name)+'</span></label>'
 ).join('')+'</div><p>Ocultar una sección no borra productos ni cantidades. Podés volver a mostrarla cuando quieras.</p></details>':
 sectionsLocked?'':'')+
 (visibleCategories.length?'':'<p class="gcm-empty-sections">Todas las secciones están ocultas. Entrá a «Personalizar secciones» para mostrarlas.</p>')+
 visibleCategories.map(name=>sectionTable(name,list.filter(p=>p.section===name),canWrite,canCatalog,showDecomiso,canManageCategories)).join('')+
 (Object.values(rec.decomiso||{}).some(v=>Number(v.chapas)||Number(v.sueltas)||Number(v.qty))?'<p class="gcm-decomp-note">Los totales incluyen el decomiso registrado, aunque ocultes la columna.</p>':'')+
 '<div class="gcm-extra-controls"><label class="gcm-waste-toggle"><input id="gcm-waste-toggle" type="checkbox"'+(showWaste?' checked':'')+
 (!canWrite?' disabled':'')+'><span>Mostrar Desperdicios</span></label>'+
 (showWaste?'<span>Habilitado para este turno</span>':'<span>Opcional · se muestra solo al activarlo</span>')+'</div>'+
 '<div class="gcm-bottom'+(showWaste?'':' gcm-bottom-single')+'">'+
 extraTable('consumption','CONSUMO','Colaborador','Consumo',rec,canWrite)+
 (showWaste?extraTable('waste','DESPERDICIOS','Producto','Cantidad',rec,canWrite):'')+'</div>'+
 (!historyRecord?'<div class="gcm-actions"><button type="button" data-gcm-manual-save>Guardar conteo</button><button type="button" data-gcm-refresh>Actualizar</button>'+
 (!closed()?'<button type="button" data-gcm-finalize'+(!canWrite?' disabled':'')+'>Cerrar turno</button>':'<span>Conteo archivado</span>')+'</div>':'')+
 '</main></div>'+ '':'' )+
 '</div>';
}
function schedule(key,fn){
 const thisLocal=activeLocal(),thisGeneration=generation;
 const old=queues.get(key)||Promise.resolve();
 // Una operación pendiente de Munro no puede terminar escribiendo en Torcuato.
 const next=old.catch(()=>{}).then(()=>{
  if(thisGeneration!==generation||thisLocal!==activeLocal())throw Error('Se cambió de sucursal antes de guardar.');
  return fn();
 });
 queues.set(key,next);busy=true;
 const indicator=document.querySelector('.gcm-help span:last-child');
 if(indicator)indicator.textContent='Guardando…';
 next.then(()=>{
  if(thisGeneration!==generation||thisLocal!==activeLocal())return;
  if(queues.get(key)!==next)return;
  queues.delete(key);busy=queues.size>0;
  const el=document.querySelector('.gcm-help span:last-child');
  if(el)el.textContent=busy?'Guardando…':'Guardado automáticamente';
 }).catch(e=>{
  if(thisGeneration!==generation||thisLocal!==activeLocal())return;
  if(queues.get(key)===next)queues.delete(key);
  busy=queues.size>0;
  error='Error al guardar: '+(e.message||'Reintentá');
  const indicator=document.querySelector('.gcm-help span:last-child');
  if(indicator)indicator.textContent='Error al guardar · Reintentar';
  api?.toast?.(error);
 });
 return next;
}
function saveCell(p,i,newCell){
 patchCell(p.id,i,newCell);
 const d=day,s=shift,draft=noteDraft('cell',d,s,p.id,i,newCell);
 const task=schedule(d+'|'+s+'|'+p.id+'|'+i,()=>rpc('gestlok_munro_conteo_set_cell',{
 p_day:d,p_shift:s,p_product:p.id,p_index:i,
 p_chapas:newCell.chapas,p_sueltas:newCell.sueltas,p_qty:newCell.qty
 }));
 task.then(()=>confirmDraft(draft)).catch(()=>{});
 return task;
}
const productById=id=>snapshot?.products?.find(p=>p.id===id&&p.active);
function updateExtra(input){
 const kind=input.dataset.gcmExtra,idx=Number(input.dataset.row),field=input.dataset.field;
 if(!['consumption','waste'].includes(kind)||!['name','value'].includes(field)||idx<0||idx>=(kind==='consumption'?10:60))return;
 const data=extrasList(kind);if(!data||kind==='waste'&&!data.rec.waste_visible)return;
 const vals=data.vals;
 while(vals.length<=idx)vals.push({name:'',value:''});
 vals[idx]={...vals[idx],[field]:input.value.slice(0,90)};
 return saveExtraList(kind,vals);
}
function attach(value){api=value;readDrafts();}
function subscribe(local,push){
 if(!LOCALES.includes(local)||local!==activeLocal()||!allowed())return;
 void refresh();
 // Sin refresh por focus: preserva posición y teclado del dispositivo.
}

let navScrollQueued=false;
function queueActiveCategoryUpdate(){
 if(navScrollQueued)return;navScrollQueued=true;
 const run=()=>{navScrollQueued=false;updateCategoryFromScroll();};
 if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(run);
 else run();
}
// Las secciones mantienen scroll horizontal independiente. La barra superior
// replica la posición sin redibujar ni perder foco del teclado de la tablet.
document.addEventListener('scroll',e=>{
 const target=e.target;
 if(target?.matches?.('.gcm-sheet-scroll,.gcm-expiry-ruler-scroll')){
  const root=target.closest('.gcm-count-screen');if(!root)return;
  const x=target.scrollLeft;
  root.querySelectorAll('.gcm-sheet-scroll,.gcm-expiry-ruler-scroll').forEach(el=>{
   if(el!==target&&Math.abs(el.scrollLeft-x)>2)el.scrollLeft=x;
  });
  return;
 }
 if(target===document||target===document.documentElement)queueActiveCategoryUpdate();
},true);
if(typeof window.addEventListener==='function'){
 window.addEventListener('scroll',queueActiveCategoryUpdate,{passive:true});
}

document.addEventListener('toggle',e=>{
 if(e.target.matches?.('.gcm-section')){
  const name=e.target.dataset.gcmSection;
  if(e.target.open)opened.add(name);else opened.delete(name);
 }
},true);
document.addEventListener('click',async e=>{
 const root=e.target.closest('.gcm-page');
 if(!root||!allowed())return;
 const el=e.target.closest('button');
 if(!el){
  // Pulsar fuera del cuadro cierra el menú sin alterar el conteo.
  const dialog=e.target?.matches?.('.gcm-product-dialog')?e.target:null;
  if(dialog?.open)dialog.close();
  return;
 }
 if(el.hasAttribute('data-gcm-category-toggle')||el.hasAttribute('data-gcm-category-close')){
  const open=el.hasAttribute('data-gcm-category-toggle')&&!root.classList.contains('is-category-nav-open');
  root.classList.toggle('is-category-nav-open',open);
  root.querySelector('.gcm-category-toggle')?.setAttribute('aria-expanded',String(open));
  return;
 }
 if(el.hasAttribute('data-gcm-nav-section')||el.hasAttribute('data-gcm-nav-extras')){
  const name=el.dataset.gcmNavSection,extra=el.dataset.gcmNavExtras;
  const section=name?[...root.querySelectorAll('.gcm-count-main .gcm-section')].find(x=>x.dataset.gcmSection===name):null;
  const target=section||root.querySelector('.gcm-count-main [data-gcm-kind="'+extra+'"]')||
    (extra==='waste'?root.querySelector('.gcm-extra-controls'):null);
  if(!target)return;
  if(section&&!section.open){section.open=true;opened.add(name);}
  selectCategoryButton(root,name||extra);
  root.classList.remove('is-category-nav-open');
  root.querySelector('.gcm-category-toggle')?.setAttribute('aria-expanded','false');
  target.scrollIntoView?.({behavior:'smooth',block:'start'});
  return;
 }
 if(el.hasAttribute('data-gcm-add-product-open')){
  e.preventDefault();
  if(!admin()||!editable()||busy||!snapshot||historyMode)return;
  const section=el.dataset.gcmAddProductOpen;
  const wrapper=el.closest('.gcm-section');
  if(!wrapper||wrapper.dataset.gcmSection!==section||
     !snapshot.products.some(p=>p.section===section))return;
  const dialog=wrapper.querySelector('.gcm-add-product-dialog');
  if(dialog&&!dialog.open&&typeof dialog.showModal==='function'){
   dialog.showModal();
   dialog.querySelector('[data-gcm-new-product-name]')?.focus();
  }
  return;
 }
 if(el.hasAttribute('data-gcm-add-product-cancel')){
  e.preventDefault();
  el.closest('.gcm-add-product-dialog')?.close();
  return;
 }
 if(el.hasAttribute('data-gcm-add-product-save')){
  e.preventDefault();
  if(!admin()||!editable()||busy||!snapshot||historyMode)return;
  const dialog=el.closest('.gcm-add-product-dialog');
  const section=el.closest('.gcm-section')?.dataset.gcmSection;
  if(!dialog||!section||!snapshot.products.some(p=>p.section===section))return;
  const input=dialog.querySelector('[data-gcm-new-product-name]');
  const type=dialog.querySelector('[data-gcm-new-product-type]');
  const status=dialog.querySelector('[data-gcm-add-product-error]');
  const name=String(input?.value||'').trim(),per=Number(type?.value);
  const fail=message=>{if(status)status.textContent=message;input?.focus();};
  if(!name||name.length>100){fail('Escribí un nombre de producto de hasta 100 caracteres.');return;}
  if(![0,27,30].includes(per)){fail('Seleccioná unidades o chapas.');return;}
  if(snapshot.products.some(p=>p.active&&p.section===section&&p.name.trim().toLocaleLowerCase('es')===name.toLocaleLowerCase('es'))){
   fail('Ya existe un producto con ese nombre en esta categoría.');return;
  }
  busy=true;el.disabled=true;el.textContent='Guardando…';
  try{
   const result=await rpc('gestlok_munro_conteo_add_product',{
    p_section:section,p_name:name,p_units_per_chapa:per
   });
   if(!result?.ok||!result?.product?.id)throw Error('El servidor no confirmó el alta del producto.');
   opened.add(section);
   dialog.close();
   error='';
   busy=false;
   await refresh();
   api?.toast?.('Producto «'+name+'» agregado en '+section+'.');
  }catch(err){
   const message=err.message||'No se pudo agregar el producto.';
   if(status)status.textContent=message;
   api?.toast?.(message);
  }finally{
   busy=false;el.disabled=false;el.textContent='Guardar producto';
  }
  return;
 }
 if(el.hasAttribute('data-gcm-product-menu')){
  e.preventDefault();
  if(!admin()||busy||closed())return;
  const p=productById(el.dataset.gcmProductMenu);
  if(!p)return;
  const dialog=el.closest('.gcm-product-actions')?.querySelector('.gcm-product-dialog');
  if(dialog&&!dialog.open&&typeof dialog.showModal==='function'){
   dialog.showModal(); // Top layer: nunca se recorta por el scroll horizontal de la planilla.
   dialog.querySelector('[data-gcm-rename]')?.focus();
  }
  return;
 }
 if(el.hasAttribute('data-gcm-menu-close')){
  el.closest('.gcm-product-dialog')?.close();
  return;
 }
 if(el.hasAttribute('data-gcm-hide-section')){
  // El botón está dentro del summary: no debe abrir/cerrar la categoría.
  e.preventDefault();
  e.stopPropagation();
  if(!editable()||closed()||busy||!snapshot||snapshot?.settings?.locked&&!admin())return;
  const section=el.dataset.gcmHideSection;
  if(!section||!snapshot.products.some(p=>p.active&&p.section===section))return;
  busy=true;
  const d=day,s=shift;
  try{
   await rpc('gestlok_munro_conteo_set_section',{p_day:d,p_shift:s,p_section:section,p_visible:false});
   const rec=draftRecord();
   if(rec){
    const hidden=Array.isArray(rec.hidden_sections)?rec.hidden_sections:[];
    rec.hidden_sections=[...new Set([...hidden,section])];
   }
   if(snapshot?.settings?.locked){
    const original=Array.isArray(snapshot.settings.hidden_sections)?snapshot.settings.hidden_sections:[];
    const next=[...new Set([...original,section])];
    snapshot.settings.hidden_sections=next;
    snapshot.counts.filter(x=>x.status==='borrador').forEach(x=>{x.hidden_sections=next;});
   }
   opened.delete(section);
   error='';
  }catch(err){error=err.message||'No se pudo ocultar la sección';api.toast?.(error);}
  finally{busy=false;api.render();}
  return;
 }
 if(el.hasAttribute('data-gcm-extra-add')||el.hasAttribute('data-gcm-extra-remove')){
  if(!editable()||closed()||!snapshot)return;
  const isAdd=el.hasAttribute('data-gcm-extra-add');
  const kind=isAdd?el.dataset.gcmExtraAdd:el.dataset.gcmExtraRemove;
  if(!['consumption','waste'].includes(kind)||kind==='consumption')return;
  const data=extrasList(kind);if(!data||kind==='waste'&&!data.rec.waste_visible)return;
  const vals=data.vals;
  if(isAdd){
   if(vals.length>=60){api.toast?.('Máximo 60 filas por sección');return;}
   if(vals.length===0)vals.push({name:'',value:''});
   vals.push({name:'',value:''});
  }else{
   const index=Number(el.dataset.row);
   if(!Number.isInteger(index)||index<0||index>=Math.max(1,vals.length))return;
   const item=vals[index];
   if(item&&(item.name||item.value)&&!window.confirm('¿Quitar esta fila? Se eliminarán sus datos del conteo del turno.'))return;
   vals.splice(index,1);
  }
  void saveExtraList(kind,vals);api.render();return;
 }
 if(el.hasAttribute('data-gcm-manual-save')){
  if(!editable()||closed()||!snapshot||finishing)return;
  el.disabled=true;el.textContent='Verificando guardado…';
  try{
   await verifyTurnSaved();
   error='';el.textContent='✓ Guardado verificado';
   api?.toast?.('Conteo guardado y verificado en el servidor.');
  }catch(err){
   error=err.message||'No se pudo guardar';
   el.textContent='No se guardó · Reintentar';
   api?.toast?.(error);
  }finally{el.disabled=false;}
  return;
 }
 if(el.hasAttribute('data-gcm-retry')||el.hasAttribute('data-gcm-refresh')){if(busy)return;error='';void refresh();return;}
 if(el.hasAttribute('data-gcm-history-open')){
  if(busy)return;
  if(historyMode){historyRecord=null;api.render();return;}
  historyMode=true;historyRecord=null;historyPreviewUrl='';historyPreviewError='';historyMonth=(lastClosedDay||arDay()).slice(0,7);clearHistoryEditor();
  historyExpanded=null;historyRows=[];historyError='';void loadHistory();api.render();return;
 }
 if(el.hasAttribute('data-gcm-history-exit')){
  if(busy)return;
  historyMode=false;historyRecord=null;historyPreviewUrl='';historyPreviewError='';++historyToken;clearHistoryEditor();
  historyLoading=false;error='';void refresh();api.render();return;
 }
 if(el.hasAttribute('data-gcm-history-back')){
  historyRecord=null;historyPreviewUrl='';historyPreviewError='';clearHistoryEditor();api.render();return;
 }
 if(el.hasAttribute('data-gcm-history-fix-toggle')&&historyMode&&historyRecord){
  if(!editable()||historyCorrecting)return;
  historyEditMode=!historyEditMode;historyCorrectionError='';api.render();return;
 }
 if(el.hasAttribute('data-gcm-history-show-corrections')&&historyMode&&historyRecord){
  try{
   const rows=await rpc('gestlok_munro_conteo_correction_history',
     {p_day:historyRecord.day,p_shift:historyRecord.shift});
   historyCorrections=Array.isArray(rows)?rows:[];historyCorrectionsLoaded=true;
   historyCorrectionError='';api.render();
  }catch(err){historyCorrectionError=err.message||'No se pudieron consultar las correcciones.';api?.toast?.(historyCorrectionError);api.render();}
  return;
 }
 if(el.hasAttribute('data-gcm-history-fix-save')&&historyMode&&historyRecord){
  if(!editable()||!historyEditMode||historyCorrecting)return;
  const rec=historyRecord,local=activeLocal(),kind=historyEditKind;
  const reason=document.getElementById('gcm-history-fix-reason')?.value?.trim()||'';
  if(reason.length<8||reason.length>300){historyCorrectionError='Escribí el motivo de la corrección (mínimo 8 caracteres).';api.render();return;}
  let pid=null,index=null,value,expected;
  if(kind==='cell'||kind==='decomiso'){
   pid=historyEditProduct;index=kind==='cell'?historyEditVto:0;
   const p=snapshot?.products?.find(x=>x.id===pid);
   if(!p){historyCorrectionError='Seleccioná un producto válido.';api.render();return;}
   const current=kind==='cell'?rec.data?.[pid]?.['v'+index]:rec.decomiso?.[pid];
   expected=current===undefined?null:current;
   const read=field=>{
    const input=document.querySelector('[data-gcm-history-number="'+field+'"]');
    const n=Number(input?.value);
    if(!input||!Number.isSafeInteger(n)||n<0)throw Error('Ingresá cantidades enteras y mayores o iguales a cero.');
    return n;
   };
   try{
    value=p.units_per_chapa>0?{chapas:read('chapas'),sueltas:read('sueltas'),qty:0}:
     {chapas:0,sueltas:0,qty:read('qty')};
   }catch(err){historyCorrectionError=err.message;api.render();return;}
  }else if(kind==='responsable'){
   value=document.getElementById('gcm-history-fix-responsable')?.value||'';
   expected=rec.responsable||null;
  }else if(kind==='consumption'||kind==='waste'){
   const names=[...document.querySelectorAll('.gcm-history-fix-list [data-gcm-history-extra-name]')];
   const values=[...document.querySelectorAll('.gcm-history-fix-list [data-gcm-history-extra-value]')];
   value=names.map((n,i)=>({name:n.value.trim(),value:(values[i]?.value||'').trim()}))
    .filter(x=>x.name||x.value);
   expected=kind==='consumption'?(rec.consumption||[]):(rec.waste||[]);
  }else return;
  historyCorrecting=true;historyCorrectionError='';el.disabled=true;
  const fixedDay=rec.day,fixedShift=rec.shift;
  try{
   const response=await rpc('gestlok_munro_conteo_correct_closed',{
    p_day:fixedDay,p_shift:fixedShift,p_kind:kind,p_product:pid,p_index:index,
    p_value:value,p_expected:expected,p_reason:reason
   });
   if(!response?.ok)throw Error('El servidor no confirmó la corrección.');
   if(local!==activeLocal()||historyRecord?.day!==fixedDay||historyRecord?.shift!==fixedShift)throw Error('Cambió el turno o la sucursal. Revisá el historial.');
   const rows=await rpc('gestlok_munro_conteo_history',{p_month:fixedDay.slice(0,7)+'-01'});
   if(!Array.isArray(rows))throw Error('No fue posible verificar el historial actualizado.');
   historyRows=rows;
   const fresh=rows.find(r=>r.day===fixedDay&&r.shift===fixedShift);
   if(!fresh||fresh.status!=='finalizado')throw Error('No se confirmó que el turno siga finalizado.');
   historyRecord=fresh;historyPreviewUrl='';historyPreviewError='';
   try{historyPreviewUrl=historyA4Image(fresh);}catch(e){historyPreviewError=e.message||'Error en vista A4';}
   const audit=await rpc('gestlok_munro_conteo_correction_history',{p_day:fixedDay,p_shift:fixedShift});
   historyCorrections=Array.isArray(audit)?audit:[];historyCorrectionsLoaded=true;
   historyEditMode=false;historyCorrectionError='';
   api?.toast?.('Corrección guardada. El turno continúa cerrado y el cambio quedó auditado.');
  }catch(err){historyCorrectionError=err.message||'No se pudo guardar la corrección.';api?.toast?.(historyCorrectionError);}
  finally{historyCorrecting=false;api.render();}
  return;
 }
 if(el.hasAttribute('data-gcm-a4-refresh')&&historyMode&&historyRecord){
  try{historyPreviewUrl=historyA4Image(historyRecord);historyPreviewError='';}
  catch(err){historyPreviewUrl='';historyPreviewError=err.message||'No se pudo generar el A4.';}
  api.render();return;
 }
 if(el.hasAttribute('data-gcm-history-retry')){historyError='';void loadHistory();api.render();return;}
 if(el.hasAttribute('data-gcm-history-day')){
  const date=el.dataset.gcmHistoryDay;
  if(groupedHistory().some(([d])=>d===date)){historyExpanded=historyExpanded===date?null:date;api.render();}
  return;
 }
 if(el.hasAttribute('data-gcm-history')){
  if(busy)return;
  const [d,s]=el.dataset.gcmHistory.split('|');
  const record=historyRows.find(v=>v.day===d&&v.shift===s);
  if(historyMode&&record){
   historyRecord=record;historyPreviewUrl='';historyPreviewError='';clearHistoryEditor();
   try{historyPreviewUrl=historyA4Image(record);}
   catch(err){historyPreviewError=err.message||'No se pudo generar el A4.';}
   api.render();
  }return;
 }
 // Contador directo para aguas, gaseosas y otros productos sin chapas.
 if(el.hasAttribute('data-gcm-qty-plus')||el.hasAttribute('data-gcm-qty-minus')||
    el.hasAttribute('data-gcm-decomp-qty-plus')||el.hasAttribute('data-gcm-decomp-qty-minus')){
  if(!editable()||closed()||!snapshot)return;
  const isDecompQty=el.hasAttribute('data-gcm-decomp-qty-plus')||el.hasAttribute('data-gcm-decomp-qty-minus');
  const pid=el.dataset.gcmQtyPlus||el.dataset.gcmQtyMinus||el.dataset.gcmDecompQtyPlus||el.dataset.gcmDecompQtyMinus;
  const p=productById(pid),i=Number(el.dataset.idx);
  if(!p||p.units_per_chapa>0||(!isDecompQty&&(i<1||i>4)))return;
  const cell=isDecompQty?getDecomisoCell(p):getCell(p,i);
  const add=el.hasAttribute('data-gcm-qty-plus')||el.hasAttribute('data-gcm-decomp-qty-plus');
  const qty=Math.max(0,Math.min(1000000,cell.qty+(add?1:-1)));
  if(qty===cell.qty)return;
  cell.qty=qty;
  const task=isDecompQty?saveDecomiso(p,cell):saveCell(p,i,cell);
  syncCountDom(el,p,i,isDecompQty);saveCellFeedback(el,task);
  return;
 }
 const isDecomp=['data-gcm-decomp-plus','data-gcm-decomp-minus','data-gcm-decomp-suelta-plus','data-gcm-decomp-suelta-minus'].some(name=>el.hasAttribute(name));
 const id=el.dataset.gcmPlus||el.dataset.gcmMinus||el.dataset.gcmDecompPlus||el.dataset.gcmDecompMinus||
  el.dataset.gcmSueltaPlus||el.dataset.gcmSueltaMinus||el.dataset.gcmDecompSueltaPlus||el.dataset.gcmDecompSueltaMinus;
 if(id){
  if(!editable()||closed())return;
  const p=productById(id),i=Number(el.dataset.idx);
  if(!p||!p.units_per_chapa||(!isDecomp&&(i<1||i>4)))return;
  const cell=isDecomp?getDecomisoCell(p):getCell(p,i);
  const isUnit=el.hasAttribute('data-gcm-suelta-plus')||el.hasAttribute('data-gcm-suelta-minus')||
   el.hasAttribute('data-gcm-decomp-suelta-plus')||el.hasAttribute('data-gcm-decomp-suelta-minus');
  const adding=el.hasAttribute('data-gcm-plus')||el.hasAttribute('data-gcm-decomp-plus')||
   el.hasAttribute('data-gcm-suelta-plus')||el.hasAttribute('data-gcm-decomp-suelta-plus');
  const field=isUnit?'sueltas':'chapas',limit=isUnit?100000:500;
  const next=Math.max(0,Math.min(limit,cell[field]+(adding?1:-1)));
  if(next===cell[field])return;
  cell[field]=next;
  const task=isDecomp?saveDecomiso(p,cell):saveCell(p,i,cell);
  syncCountDom(el,p,i,isDecomp);
  saveCellFeedback(el,task);
  return;
 }
 const productId=el.dataset.gcmRename||el.dataset.gcmRemove;
 if(productId&&admin()&&!busy){
  const p=productById(productId);if(!p)return;
  // Cerrar el diálogo antes del aviso nativo de confirmación/renombrado.
  el.closest('.gcm-product-dialog')?.close();
  const remove=el.hasAttribute('data-gcm-remove');
  if(remove&&!window.confirm('¿Quitar '+p.name+' del catálogo de '+localLabel()+'? Los conteos históricos se conservarán.'))return;
  const name=remove?p.name:window.prompt('Nuevo nombre del producto:',p.name);
  if(name===null||!name.trim()||name.trim().length>100)return;
  busy=true;
  try{await rpc('gestlok_munro_conteo_product',{p_id:p.id,p_name:name.trim(),p_active:!remove});await refresh();api.render();}
  catch(err){error=err.message||'No se pudo modificar el producto';api.toast?.(error);}
  finally{busy=false;void refresh();}
  return;
 }
 if(el.hasAttribute('data-gcm-finalize')){
  if(!editable()||closed()||!snapshot||finishing)return;
  const currentDay=day,currentShift=shift,following=nextTurn(currentDay,currentShift);
  const currentName=SHIFTS.find(x=>x[0]===currentShift)?.[1]||currentShift;
  const nextName=SHIFTS.find(x=>x[0]===following.shift)?.[1]||following.shift;
  if(!window.confirm('¿Cerrar turno '+currentName+' del '+labelDay(currentDay)+'? Se guardará en Historial y se abrirá '+nextName+' del '+labelDay(following.day)+'.'))return;
  finishing=true;busy=true;
  el.disabled=true;el.textContent='Guardando y cerrando…';
  try{
   await verifyTurnSaved(true);
   const response=await rpc('gestlok_munro_conteo_finalize',{p_day:currentDay,p_shift:currentShift});
   if(!response?.ok)throw Error('El servidor no confirmó el cierre del turno.');
   const archived=await rpc('gestlok_munro_conteo_state',{p_day:currentDay});
   if(archived?.counts?.find(x=>x.shift===currentShift)?.status!=='finalizado')
    throw Error('No se pudo comprobar el archivo del turno. Actualizá antes de continuar.');
   // El historial consulta estos mismos registros, sin duplicar ni alterar cantidades.
   autoResumeTurn=false;lastClosedDay=currentDay;shift=following.shift;historyMode=false;historyRecord=null;
   historyRows=[];historyExpanded=null;historyMonth=currentDay.slice(0,7);
   error='';
   if(following.day!==currentDay){
    ++generation;day=following.day;snapshot=null;loading=false;
   }else{
    snapshot=archived;overlayDrafts();
   }
   api?.toast?.('Turno '+currentName+' cerrado. Abriendo '+nextName+'.');
  }catch(err){
   error=err.message||'No se pudo cerrar el turno';
   api?.toast?.(error);
  }finally{
   finishing=false;busy=false;
   api.render();
   if(!error){
    document.querySelector('.gcm-page')?.scrollIntoView?.({block:'start'});
    window.scrollTo?.(0,0);
   }
  }
  return;
 }
});
// Carga numérica: el teclado sigue abierto y cada dígito se protege sin re-render.
document.addEventListener('input',e=>{
 const input=e.target;
 if(!input?.matches?.('[data-gcm-qty],[data-gcm-decomp-qty],[data-gcm-suelta],[data-gcm-decomp-suelta]')||!input.closest?.('.gcm-page'))return;
 if(!editable()||closed()||!snapshot)return;
 const isUnit=input.hasAttribute('data-gcm-suelta')||input.hasAttribute('data-gcm-decomp-suelta');
 const isDecomp=input.hasAttribute('data-gcm-decomp-qty')||input.hasAttribute('data-gcm-decomp-suelta');
 const id=isDecomp?(isUnit?input.dataset.gcmDecompSuelta:input.dataset.gcmDecompQty):
  (isUnit?input.dataset.gcmSuelta:input.dataset.gcmQty);
 const p=productById(id),i=Number(input.dataset.idx);
 if(!p||(!isDecomp&&(i<1||i>4)))return;
 const raw=String(input.value||'');
 if(raw!==''&&!/^\d+$/.test(raw))return;
 const limit=isUnit?100000:1000000,val=raw===''?0:Number(raw);
 if(!Number.isSafeInteger(val)||val<0||val>limit)return;
 const cell=isDecomp?getDecomisoCell(p):getCell(p,i);
 const field=isUnit?'sueltas':'qty';
 if(cell[field]===val)return;
 cell[field]=val;
 const task=isDecomp?saveDecomiso(p,cell):saveCell(p,i,cell);
 syncCountDom(input,p,i,isDecomp);
 saveCellFeedback(input,task);
});
document.addEventListener('change',async e=>{
 const input=e.target,root=input.closest?.('.gcm-page');
 if(!root||!allowed())return;
 if(input.id==='gcm-history-month'){
  if(!historyMode||historyRecord||historyLoading)return;
  const month=input.value;
  if(!/^\d{4}-\d{2}$/.test(month)||month<'2025-01'||month>arDay().slice(0,7))return;
  historyMonth=month;historyExpanded=null;historyRows=[];historyError='';void loadHistory();api.render();return;
 }
 if(historyMode&&historyRecord&&historyEditMode&&
  ['gcm-history-fix-kind','gcm-history-fix-product','gcm-history-fix-vto'].includes(input.id)){
   if(input.id==='gcm-history-fix-kind')historyEditKind=input.value;
   if(input.id==='gcm-history-fix-product')historyEditProduct=input.value;
   if(input.id==='gcm-history-fix-vto')historyEditVto=Number(input.value)||1;
   historyCorrectionError='';api.render();return;
 }
 if(input.id==='gcm-responsable'){
  if(!editable()||closed()||busy||!snapshot)return;
  const name=input.value;
  if(name!==''&&!RESPONSABLES.includes(name))return;
  const d=day,s=shift,old=entry().responsable||'';
  busy=true;
  try{await rpc('gestlok_munro_conteo_responsable',{p_day:d,p_shift:s,p_responsable:name});
    const rec=draftRecord();if(rec)rec.responsable=name||null;error='';
  }catch(err){error=err.message||'No se pudo guardar el responsable';input.value=old;api.toast?.(error);}
  finally{busy=false;api.render();}
  return;
 }
 if(input.id==='gcm-decomiso-toggle'){
  if(!editable()||closed()||busy||!snapshot)return;
  const visible=input.checked,old=!!entry().decomiso_visible;
  if(!visible && Object.values(entry().decomiso||{}).some(v=>Number(v.chapas)||Number(v.sueltas)||Number(v.qty))&&
     !window.confirm('¿Ocultar Decomiso? Los valores registrados se conservarán y seguirán sumándose al total.')){
     input.checked=old;return;
  }
  const d=day,s=shift;busy=true;
  try{await rpc('gestlok_munro_conteo_decomiso_visible',{p_day:d,p_shift:s,p_visible:visible});
    const rec=draftRecord();if(rec)rec.decomiso_visible=visible;error='';
  }catch(err){error=err.message||'No se pudo cambiar Decomiso';input.checked=old;api.toast?.(error);}
  finally{
   busy=false;api.render();
   if(!error){
    // La columna Decomiso está junto al producto para que se vea enseguida
    // incluso en tablets de poco ancho, sin tener que buscar el Vto 5.
    const sheet=document.querySelector?.('.gcm-count-screen .gcm-sheet-scroll');
    if(sheet)sheet.scrollLeft=0;
    const ruler=document.querySelector?.('.gcm-count-screen .gcm-expiry-ruler-scroll');
    if(ruler)ruler.scrollLeft=0;
    api?.toast?.(visible?'Decomiso habilitado. La columna amarilla aparece junto a Producto.':'Decomiso oculto. Las cantidades registradas siguen guardadas.');
   }
  }
  return;
 }
 if(input.hasAttribute('data-gcm-section-visible')||input.id==='gcm-waste-toggle'){
  const section=input.id==='gcm-waste-toggle'?'_waste':input.dataset.gcmSectionVisible;
  if(!editable()||closed()||!snapshot)return;
  if(section!=='_waste'&&snapshot?.settings?.locked&&!admin()){api.toast?.('Solo la administradora puede cambiar las categorías fijas.');return;}
  if(busy){
   const active=entry();
   const hiddenNow=snapshot?.settings?.locked?snapshot.settings.hidden_sections:active.hidden_sections;
   input.checked=section==='_waste'?!!active.waste_visible:
     !Array.isArray(hiddenNow)||!hiddenNow.includes(section);
   api.toast?.('Se está guardando el conteo. Reintentá cuando termine.');
   return;
  }
  if(!section||section!=='_waste'&&!snapshot.products.some(p=>p.section===section&&p.active))return;
  const visible=input.checked,oldRec=entry();
  const prevHidden=snapshot?.settings?.locked?snapshot.settings.hidden_sections:oldRec.hidden_sections;
  const old=section==='_waste'?!!oldRec.waste_visible:!Array.isArray(prevHidden)||!prevHidden.includes(section);
  const d=day,s=shift;busy=true;
  try{
   await rpc('gestlok_munro_conteo_set_section',{p_day:d,p_shift:s,p_section:section,p_visible:visible});
   const rec=draftRecord();if(rec){
    if(section==='_waste')rec.waste_visible=visible;
    else {
     const current=Array.isArray(rec.hidden_sections)?rec.hidden_sections:[];
     rec.hidden_sections=visible?current.filter(n=>n!==section):[...new Set([...current,section])];
     if(snapshot?.settings?.locked){
      const all=Array.isArray(snapshot.settings.hidden_sections)?snapshot.settings.hidden_sections:[];
      const next=visible?all.filter(n=>n!==section):[...new Set([...all,section])];
      snapshot.settings.hidden_sections=next;
      snapshot.counts.filter(x=>x.status==='borrador').forEach(x=>{x.hidden_sections=next;});
     }
    }
   }
   error='';
  }catch(err){input.checked=old;error=err.message||'No se pudo modificar la sección';api.toast?.(error);}
  finally{busy=false;api.render();}
  return;
 }
 if(!editable()||closed())return;
 // Los numéricos ya se guardaron en input: no reconstruir la vista al perder el foco.
 if(input.hasAttribute('data-gcm-qty')||input.hasAttribute('data-gcm-decomp-qty'))return;
 if(input.hasAttribute('data-gcm-suelta')||input.hasAttribute('data-gcm-decomp-suelta'))return;
 if(input.hasAttribute('data-gcm-extra')){void updateExtra(input);return;}
 const isDecomp=input.hasAttribute('data-gcm-decomp-suelta')||input.hasAttribute('data-gcm-decomp-qty');
 const kind=input.hasAttribute('data-gcm-suelta')||input.hasAttribute('data-gcm-decomp-suelta')?'sueltas':
  input.hasAttribute('data-gcm-qty')||input.hasAttribute('data-gcm-decomp-qty')?'qty':null;
 if(!kind)return;
 const datasetKey=(isDecomp?'gcmDecomp':'gcm')+(kind==='sueltas'?'Suelta':'Qty');
 const p=productById(input.dataset[datasetKey]),i=Number(input.dataset.idx);
 if(!p||(!isDecomp&&(i<1||i>4)))return;
 const limit=kind==='sueltas'?100000:1000000,val=Number(input.value);
 if(!Number.isSafeInteger(val)||val<0||val>limit){api.toast?.('Ingresá una cantidad válida');api.render();return;}
 const cell=isDecomp?getDecomisoCell(p):getCell(p,i);cell[kind]=val;
 if(isDecomp)void saveDecomiso(p,cell);else void saveCell(p,i,cell);
 api.render();
});
window.GestLokMunroConteo=Object.freeze({attach,view,subscribe,reset,permitido:allowed,_test:{marks,plusDays,labelDay,nextTurn,historyShiftLabel}});
})();