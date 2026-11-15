/* GESTLOK · Mi Gusto Munro · Conteo por turnos.
   Chapas representadas por cuadrados: 4 lados + diagonal = 5 chapas.
   El backend valida tenant, sucursal, rol, fecha y ediciones de catálogo. */
(()=>{
'use strict';
if(window.GestLokMunroConteo)return;
const TENANT='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const SHIFTS=[['manana_entrada','Mañana · entrada'],['manana_salida','Mañana · salida'],['noche_salida','Noche · salida']];
const RESPONSABLES=['Cami','Shuli','Tizi'];
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
let api=null,snapshot=null,day=arDay(),shift='manana_entrada',historyRecord=null,loading=false,error='',busy=false,opened=new Set(['EMPANADAS']),generation=0;
let historyMode=false,historyMonth=arDay().slice(0,7),historyRows=[],historyExpanded=null,historyLoading=false,historyError='',historyToken=0;
const queues=new Map();
const allowed=()=>!!api&&api.S?.me?.tenant_id===TENANT&&api.S?.local==='munro'&&
 !window.GestLokCreatorSupport?.previewRol?.() &&
 (api.miRol()==='creadora'||api.miRol()==='dueno'||(api.miRol()==='gerente'&&api.misLocales().includes('munro')));
const editable=()=>allowed()&&!api.S?.ro&&api.S?.offline!==true&&navigator.onLine!==false&&!!window.GestLokSupabase;
const admin=()=>allowed()&&api.miRol()==='creadora'&&!api.S?.ro;
const selected=()=>historyRecord||(snapshot?.counts||[]).find(s=>s.shift===shift)||null;
const closed=()=>!!historyRecord||selected()?.status==='finalizado';
function reset(){
 ++generation;++historyToken;
 snapshot=null;day=arDay();shift='manana_entrada';historyRecord=null;
 loading=false;busy=false;error='';queues.clear();opened=new Set(['EMPANADAS']);
 historyMode=false;historyMonth=arDay().slice(0,7);historyRows=[];historyExpanded=null;historyLoading=false;historyError='';
}
async function rpc(name,args){
 if(!allowed()||!window.GestLokSupabase)throw Error('Sin acceso o sin conexión con el servidor.');
 const r=await window.GestLokSupabase.rpc(name,args||{});
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
  snapshot=value;error='';
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
function groupedHistory(){
 const groups=new Map();
 for(const r of historyRows){
  if(!groups.has(r.day))groups.set(r.day,new Map());
  groups.get(r.day).set(r.shift,r);
 }
 return [...groups.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
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
   (expanded?'<div class="gcm-history-shifts">'+SHIFTS.map(([key,title])=>{
    const rec=records.get(key);
    return '<div class="gcm-history-shift"><span class="gcm-history-shift-name">Turno '+esc(title.replace(' · ',' '))+'</span>'+
    (rec?'<span class="gcm-history-status'+(rec.status==='finalizado'?' is-done':'')+'">'+(rec.status==='finalizado'?'Finalizado':'En curso')+'</span>'+
     '<button type="button" class="gcm-history-detail-button" data-gcm-history="'+esc(date)+'|'+esc(key)+'">Ver detalle</button>':
     '<span class="gcm-history-no-data">Sin cargar</span>')+'</div>';
   }).join('')+'</div>':'')+'</section>';
 }).join('');
 return '<div class="gcm-page gcm-history-screen">'+
  '<header class="gcm-history-top"><div class="gcm-history-title"><button type="button" data-gcm-history-exit>← Volver al conteo</button>'+
   '<div><span class="gcm-eyebrow">MI GUSTO · MUNRO</span><h2>Historial de conteos</h2></div></div>'+
   '<label>Mes <input type="month" id="gcm-history-month" min="2025-01" max="'+arDay().slice(0,7)+'" value="'+esc(historyMonth)+'"></label></header>'+
  (historyError?'<p class="gcm-error" role="alert">'+esc(historyError)+' <button type="button" data-gcm-history-retry>Reintentar</button></p>':'')+
  (historyLoading?'<p role="status" class="gcm-loading">Cargando historial…</p>':
   !groups.length&&!historyError?'<p class="gcm-history-empty">No hay conteos registrados en este mes.</p>':days)+
  '</div>';
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
 const rows=(Array.isArray(rec[kind])?rec[kind]:[]).filter(r=>r&&(String(r.name||'').trim()||String(r.value||'').trim()));
 if(!rows.length||kind==='waste'&&!rec.waste_visible)return '';
 return '<section class="gcm-hd-extra"><h3>'+title+'</h3><table><tbody>'+
  rows.map(r=>'<tr><td>'+esc(r.name||'—')+'</td><td>'+esc(r.value||'—')+'</td></tr>').join('')+
  '</tbody></table></section>';
}
function historyDetailView(){
 const rec=historyRecord;
 if(!rec)return historyListView();
 const products=(snapshot?.products||[]).filter(p=>p.active||rec.data?.[p.id]||rec.decomiso?.[p.id]);
 const hidden=new Set(Array.isArray(rec.hidden_sections)?rec.hidden_sections:[]);
 const categories=[...new Set(products.map(p=>p.section))].filter(x=>!hidden.has(x));
 return '<div class="gcm-page gcm-history-screen gcm-history-detail">'+
  '<header class="gcm-history-top"><div class="gcm-history-title">'+
   '<button type="button" data-gcm-history-back>← Volver al historial</button>'+
   '<div><span class="gcm-eyebrow">MI GUSTO · MUNRO</span><h2>Detalle del conteo</h2></div></div></header>'+
  '<div class="gcm-hd-meta"><strong>'+esc(labelDay(rec.day))+'</strong><span>'+esc('Turno '+(SHIFTS.find(x=>x[0]===rec.shift)?.[1]||rec.shift).replace(' · ',' '))+'</span>'+
  '<span>Responsable: '+esc(rec.responsable||'Sin asignar')+'</span><span class="gcm-history-status'+(rec.status==='finalizado'?' is-done':'')+'">'+
  (rec.status==='finalizado'?'Finalizado':'En curso')+'</span></div>'+
  '<p class="gcm-hd-notice">Consulta de solo lectura. Los totales incluyen el decomiso registrado.</p>'+
  (categories.length?categories.map(section=>historyDetailsTable(section,products.filter(p=>p.section===section),rec)).join(''):'<p>No hay productos cargados.</p>')+
  '<div class="gcm-hd-extras">'+historyExtraBlock('consumption','Consumo',rec)+historyExtraBlock('waste','Desperdicios',rec)+'</div>'+
  '</div>';
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
 const d=day,s=shift;
 return schedule(d+'|'+s+'|decomiso|'+p.id,()=>rpc('gestlok_munro_conteo_set_decomiso',{
  p_day:d,p_shift:s,p_product:p.id,p_chapas:newCell.chapas,p_sueltas:newCell.sueltas,p_qty:newCell.qty
 }));
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
   '<output class="gcm-units-value" aria-label="Unidades sueltas '+label+'">'+v.sueltas+' u.</output>'+
   '<button type="button" class="gcm-unit-plus" '+unitPlus+'="'+pid+'"'+attrs+disabled+
    ' aria-label="Sumar unidad suelta '+label+'">+</button>'+
  '</div>'+
  '<span class="gcm-cell-save" role="status" aria-live="polite"></span>'+
 '</div>';
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
 if(units)units.textContent=v.sueltas+' u.';
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
 const v=getDecomisoCell(p), disabled=canWrite?'':' disabled';
 if(p.units_per_chapa>0){
  return '<td class="gcm-chapa gcm-decomp-cell">'+chapaCompacta(p,v,canWrite,true,0)+'</td>';
 }
 return '<td class="gcm-decomp-cell"><input type="number" class="gcm-qty" min="0" max="1000000" inputmode="numeric" data-gcm-decomp-qty="'+esc(p.id)+'" value="'+(v.qty||'')+'" placeholder="—"'+disabled+' aria-label="Decomiso de '+esc(p.name)+'"></td>';
}
function sectionTable(name,items,canWrite,canCatalog,showDecomiso,canManageCategories){
 const dateBase=historyRecord?.day||day,first=historyRecord?.shift||shift;
 const dates=Array.from({length:4},(_,i)=>({vto:'Vto '+(i+1),dia:first==='manana_entrada'?labelDay(plusDays(dateBase,i)).slice(0,5):''}));
 const rows=items.map(p=>{
  const cells=[1,2,3,4].map(i=>{
   const v=getCell(p,i),disabled=!canWrite?' disabled':'';
   if(p.units_per_chapa){
    return '<td class="gcm-chapa">'+chapaCompacta(p,v,canWrite,false,i)+'</td>';
   }
   return '<td><input class="gcm-qty" type="number" min="0" max="1000000" inputmode="numeric" data-gcm-qty="'+esc(p.id)+'" data-idx="'+i+'" value="'+(v.qty||'')+'" placeholder="—"'+disabled+' aria-label="Cantidad '+esc(p.name)+' vencimiento '+i+'"></td>';
  }).join('');
  let sum=amount(p,getDecomisoCell(p));
  for(let i=1;i<=4;i++)sum+=amount(p,getCell(p,i));
  return '<tr>'+(showDecomiso?decompColumn(p,canWrite):'')+
   '<th scope="row" class="gcm-product-cell"><span class="gcm-product-name">'+esc(p.name)+'</span>'+ 
   (canCatalog?'<div class="gcm-product-actions">'+
   '<button type="button" class="gcm-product-menu-trigger" data-gcm-product-menu="'+esc(p.id)+'" aria-haspopup="dialog" aria-label="Opciones del producto '+esc(p.name)+'" title="Opciones del producto">⋯</button>'+
   '<dialog class="gcm-product-dialog" aria-label="Opciones del producto '+esc(p.name)+'">'+
   '<div class="gcm-product-dialog-heading"><strong>Opciones del producto</strong><span>'+esc(p.name)+'</span></div>'+
   '<div class="gcm-product-dialog-actions">'+
   '<button type="button" data-gcm-rename="'+esc(p.id)+'">Cambiar nombre</button>'+
   '<button type="button" data-gcm-remove="'+esc(p.id)+'">Quitar producto</button>'+
   '<button type="button" class="gcm-product-dialog-cancel" data-gcm-menu-close>Cancelar</button>'+
   '</div></dialog></div>':'')+
   '</th>'+cells+'<td class="gcm-total">'+(sum||'—')+'</td></tr>';
 }).join('');
 return '<details class="gcm-section" data-gcm-section="'+esc(name)+'"'+(opened.has(name)?' open':'')+'><summary><strong>'+esc(name)+'</strong>'+
 '<span class="gcm-section-toolbar"><span>'+items.length+' productos</span>'+
 (canManageCategories?'<button type="button" class="gcm-hide-section" data-gcm-hide-section="'+esc(name)+'" aria-label="Quitar sección '+esc(name)+' del conteo" title="Ocultar sección del conteo">Quitar</button>':'')+
 '</span></summary>'+
 '<div class="gcm-scroller gcm-sheet-scroll" role="region" aria-label="'+esc(name)+'" tabindex="0"><table><thead><tr>'+
 (showDecomiso?'<th scope="col" class="gcm-decomp-head">Decomiso</th>':'')+
 '<th scope="col" class="gcm-product-head">Producto</th>'+
 dates.map(s=>'<th scope="col"><span class="gcm-vto">'+esc(s.vto)+'</span>'+(s.dia?'<span class="gcm-vto-date">'+esc(s.dia)+'</span>':'')+'</th>').join('')+'<th scope="col">Total</th></tr></thead><tbody>'+rows+'</tbody></table></div></details>';
}
function extraTable(kind,title,headA,headB,rec,canWrite){
 const rows=Array.isArray(rec[kind])?rec[kind]:[];
 const count=Math.min(60,Math.max(1,rows.length));
 return '<section class="gcm-extras" data-gcm-kind="'+kind+'"><div class="gcm-extra-header"><h3>'+title+'</h3>'+
 (canWrite?'<button type="button" data-gcm-extra-add="'+kind+'"'+(rows.length>=60?' disabled':'')+
  ' aria-label="Agregar '+(kind==='consumption'?'colaborador':'desperdicio')+'">+ Agregar '+(kind==='consumption'?'colaborador':'desperdicio')+'</button>':'')+
 '</div><table><thead><tr><th>'+headA+'</th><th>'+headB+'</th>'+(canWrite?'<th class="gcm-remove-col">Acción</th>':'')+'</tr></thead><tbody>'+
 Array.from({length:count},(_,i)=>{
  const item=rows[i]||{},disabled=canWrite?'':' disabled';
  return '<tr><td><input type="text" maxlength="90" data-gcm-extra="'+kind+'" data-row="'+i+'" data-field="name" value="'+esc(item.name||'')+
   '" placeholder="'+esc(headA)+'" aria-label="'+esc(headA)+' '+(i+1)+'"'+disabled+'></td>'+
   '<td><input type="text" maxlength="90" data-gcm-extra="'+kind+'" data-row="'+i+'" data-field="value" value="'+esc(item.value||'')+
   '" placeholder="'+esc(headB)+'" aria-label="'+esc(headB)+' '+(i+1)+'"'+disabled+'></td>'+
   (canWrite?'<td class="gcm-remove-col"><button type="button" data-gcm-extra-remove="'+kind+'" data-row="'+i+
   '" aria-label="Quitar fila '+(i+1)+' de '+title+'" title="Quitar fila">×</button></td>':'')+'</tr>';
 }).join('')+'</tbody></table>'+
 (kind==='consumption'?'<p class="gcm-extra-hint">Sumá o quitá colaboradores según el turno. Cada cambio se guarda automáticamente.</p>':'')+
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
function view(){
 if(!allowed())return '<p>El Conteo está disponible únicamente para el personal autorizado de Mi Gusto Munro.</p>';
 if(!historyMode&&!historyRecord&&day!==arDay()&&!busy){day=arDay();snapshot=null;++generation;}
 if(!snapshot&&!loading&&!error)void refresh();
 if(historyMode)return historyRecord?historyDetailView():historyListView();
 const rec=entry(),canWrite=editable()&&!closed()&&!!snapshot,canCatalog=admin()&&!historyRecord&&!busy;
 const showDecomiso=!!rec.decomiso_visible;
 const sectionsLocked=!!snapshot?.settings?.locked;
 const canManageCategories=canWrite&&(!sectionsLocked||admin());
 const list=(snapshot?.products||[]).filter(p=>p.active||!!rec.data?.[p.id]||!!rec.decomiso?.[p.id]);
 const categories=[...new Set(list.map(p=>p.section))];
 const hiddenSource=sectionsLocked&&!historyRecord?snapshot?.settings?.hidden_sections:rec.hidden_sections;
 const hidden=new Set(Array.isArray(hiddenSource)?hiddenSource:[]);
 const visibleCategories=categories.filter(name=>!hidden.has(name));
 const showWaste=!!rec.waste_visible;
 const names=SHIFTS.map(([id,name])=>'<button type="button" data-gcm-shift="'+id+'"'+(!historyRecord&&shift===id?' class="is-active"':'')+'>'+esc(name)+'</button>').join('');

 return '<div class="gcm-page"><header class="gcm-header"><div><span class="gcm-eyebrow">MI GUSTO · MUNRO</span><h2>Conteo</h2><p>Tres conteos por día · guardado automático por casilla.</p><button type="button" class="gcm-open-history" data-gcm-history-open>Historial de conteos</button></div>'+
 '<div class="gcm-header-fields"><div><span>Local</span><strong>Munro</strong></div>'+
 '<label>Gerente / Responsable <select id="gcm-responsable"'+(!canWrite?' disabled':'')+'><option value="">Seleccionar responsable</option>'+
 RESPONSABLES.map(n=>'<option value="'+esc(n)+'"'+(rec.responsable===n?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></label>'+
 '<div><span>Fecha de inicio</span><strong>'+(historyRecord?'Archivado: ':'Hoy · ')+labelDay(historyRecord?.day||day)+'</strong></div></div></header>'+
 '<nav class="gcm-tabs" aria-label="Turno">'+names+'</nav>'+
 (error?'<p class="gcm-error" role="alert">'+esc(error)+' <button type="button" data-gcm-retry>Reintentar</button></p>':'')+
 (loading?'<p class="gcm-loading" role="status">Cargando conteos…</p>':'')+
 (snapshot?'<div class="gcm-help"><label class="gcm-decomp-toggle"><input type="checkbox" id="gcm-decomiso-toggle"'+(showDecomiso?' checked':'')+(!canWrite?' disabled':'')+'> Mostrar Decomiso</label><div>'+(historyRecord?'Consulta del conteo finalizado.':shift==='manana_entrada'?'Entrada: hoy y tres días posteriores.':'Salida: cuatro vencimientos por producto.')+
 '<span>'+(closed()?'Finalizado · solo lectura':!editable()?'Solo lectura':busy?'Guardando…':'Guardado automático')+'</span></div></div>'+
'<div class="gcm-sheet-tip">Tocá las marcas para sumar chapas (5 forman un cuadrado). Usá + y − para las unidades sueltas. Cada cambio se guarda sin mover la planilla.</div>'+
 (canManageCategories?'<details class="gcm-section-config"><summary>Personalizar secciones'+(hidden.size?' · '+hidden.size+' ocultas':'')+'</summary>'+
 '<div class="gcm-config-options">'+categories.map(name=>
  '<label><input type="checkbox" data-gcm-section-visible="'+esc(name)+'"'+(!hidden.has(name)?' checked':'')+
  (!canWrite?' disabled':'')+'><span>'+esc(name)+'</span></label>'
 ).join('')+'</div><p>Ocultar una sección no borra productos ni cantidades. Podés volver a mostrarla cuando quieras.</p></details>':
 sectionsLocked?'<p class="gcm-sections-locked">Categorías fijas de Munro. Solo la administradora puede cambiarlas.</p>':'')+
 (visibleCategories.length?'':'<p class="gcm-empty-sections">Todas las secciones están ocultas. Entrá a «Personalizar secciones» para mostrarlas.</p>')+
 visibleCategories.map(name=>sectionTable(name,list.filter(p=>p.section===name),canWrite,canCatalog,showDecomiso,canManageCategories)).join('')+
 (Object.values(rec.decomiso||{}).some(v=>Number(v.chapas)||Number(v.sueltas)||Number(v.qty))?'<p class="gcm-decomp-note">Los totales incluyen el decomiso registrado, aunque ocultes la columna.</p>':'')+
 '<div class="gcm-extra-controls"><label class="gcm-waste-toggle"><input id="gcm-waste-toggle" type="checkbox"'+(showWaste?' checked':'')+
 (!canWrite?' disabled':'')+'><span>Mostrar Desperdicios</span></label>'+
 (showWaste?'<span>Habilitado para este turno</span>':'<span>Opcional · se muestra solo al activarlo</span>')+'</div>'+
 '<div class="gcm-bottom'+(showWaste?'':' gcm-bottom-single')+'">'+
 extraTable('consumption','CONSUMO','Colaborador','Consumo',rec,canWrite)+
 (showWaste?extraTable('waste','DESPERDICIOS','Producto','Cantidad',rec,canWrite):'')+'</div>'+
 (!historyRecord?'<div class="gcm-actions"><button type="button" data-gcm-refresh>Actualizar</button>'+
 (!closed()?'<button type="button" data-gcm-finalize'+(!canWrite?' disabled':'')+'>Finalizar '+esc(SHIFTS.find(s=>s[0]===shift)?.[1]||'turno')+'</button>':'<span>Conteo del turno archivado</span>')+'</div>':'')+
 '':'' )+
 '</div>';
}
function schedule(key,fn){
 const old=queues.get(key)||Promise.resolve();
 const next=old.catch(()=>{}).then(fn);
 queues.set(key,next);busy=true;
 const indicator=document.querySelector('.gcm-help span:last-child');
 if(indicator)indicator.textContent='Guardando…';
 next.then(()=>{
  if(queues.get(key)!==next)return;
  queues.delete(key);busy=queues.size>0;
  const el=document.querySelector('.gcm-help span:last-child');
  if(el)el.textContent=busy?'Guardando…':'Guardado automáticamente';
 }).catch(e=>{
  if(queues.get(key)===next)queues.delete(key);
  busy=queues.size>0;
  error='Error al guardar: '+(e.message||'Reintentá');
  api?.toast?.(error);
  if(api?.S?.view==='conteo-munro')api.render();
 });
 return next;
}
function saveCell(p,i,newCell){
 patchCell(p.id,i,newCell);
 const d=day,s=shift;
 return schedule(d+'|'+s+'|'+p.id+'|'+i,()=>rpc('gestlok_munro_conteo_set_cell',{
 p_day:d,p_shift:s,p_product:p.id,p_index:i,
 p_chapas:newCell.chapas,p_sueltas:newCell.sueltas,p_qty:newCell.qty
 }));
}
const productById=id=>snapshot?.products?.find(p=>p.id===id&&p.active);
function updateExtra(input){
 const kind=input.dataset.gcmExtra,idx=Number(input.dataset.row),field=input.dataset.field;
 if(!['consumption','waste'].includes(kind)||!['name','value'].includes(field)||idx<0||idx>59)return;
 const data=extrasList(kind);if(!data||kind==='waste'&&!data.rec.waste_visible)return;
 const vals=data.vals;
 while(vals.length<=idx)vals.push({name:'',value:''});
 vals[idx]={...vals[idx],[field]:input.value.slice(0,90)};
 return saveExtraList(kind,vals);
}
function attach(value){api=value;}
function subscribe(local,push){
 if(local!=='munro'||!allowed())return;
 void refresh();
 const focus=()=>{if(api?.S?.view==='conteo-munro'&&!busy&&!loading)void refresh();};
 window.addEventListener('focus',focus);
 push(()=>window.removeEventListener('focus',focus));
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
  if(!['consumption','waste'].includes(kind))return;
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
 if(el.hasAttribute('data-gcm-retry')||el.hasAttribute('data-gcm-refresh')){error='';void refresh();return;}
 if(el.hasAttribute('data-gcm-history-open')){
  if(busy)return;
  historyMode=true;historyRecord=null;historyMonth=arDay().slice(0,7);
  historyExpanded=null;historyRows=[];historyError='';void loadHistory();api.render();return;
 }
 if(el.hasAttribute('data-gcm-history-exit')){
  if(busy)return;
  historyMode=false;historyRecord=null;++historyToken;
  historyLoading=false;error='';void refresh();api.render();return;
 }
 if(el.hasAttribute('data-gcm-history-back')){
  historyRecord=null;api.render();return;
 }
 if(el.hasAttribute('data-gcm-history-retry')){historyError='';void loadHistory();api.render();return;}
 if(el.hasAttribute('data-gcm-history-day')){
  const date=el.dataset.gcmHistoryDay;
  if(groupedHistory().some(([d])=>d===date)){historyExpanded=historyExpanded===date?null:date;api.render();}
  return;
 }
 const newShift=el.dataset.gcmShift;
 if(newShift){
  if(!SHIFTS.some(x=>x[0]===newShift)||busy)return;
  historyRecord=null;shift=newShift;api.render();return;
 }
 if(el.hasAttribute('data-gcm-history')){
  if(busy)return;
  const [d,s]=el.dataset.gcmHistory.split('|');
  const record=historyRows.find(v=>v.day===d&&v.shift===s);
  if(historyMode&&record){historyRecord=record;api.render();}return;
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
  if(remove&&!window.confirm('¿Quitar '+p.name+' del catálogo de Munro? Los conteos históricos se conservarán.'))return;
  const name=remove?p.name:window.prompt('Nuevo nombre del producto:',p.name);
  if(name===null||!name.trim()||name.trim().length>100)return;
  busy=true;
  try{await rpc('gestlok_munro_conteo_product',{p_id:p.id,p_name:name.trim(),p_active:!remove});await refresh();api.render();}
  catch(err){error=err.message||'No se pudo modificar el producto';api.toast?.(error);}
  finally{busy=false;void refresh();}
  return;
 }
 if(el.hasAttribute('data-gcm-finalize')&&editable()&&!closed()&&!busy){
  if(!window.confirm('¿Finalizar y archivar el conteo del turno? Después queda en solo lectura.'))return;
  busy=true;
  try{await rpc('gestlok_munro_conteo_finalize',{p_day:day,p_shift:shift});}
  catch(err){error=err.message||'No se pudo finalizar';api.toast?.(error);}
  finally{busy=false;void refresh();}
 }
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
  finally{busy=false;api.render();}
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
window.GestLokMunroConteo=Object.freeze({attach,view,subscribe,reset,permitido:allowed,_test:{marks,plusDays,labelDay}});
})();