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
const queues=new Map();
const allowed=()=>!!api&&api.S?.me?.tenant_id===TENANT&&api.S?.local==='munro'&&
 !window.GestLokCreatorSupport?.previewRol?.() &&
 (api.miRol()==='creadora'||api.miRol()==='dueno'||(api.miRol()==='gerente'&&api.misLocales().includes('munro')));
const editable=()=>allowed()&&!api.S?.ro&&api.S?.offline!==true&&navigator.onLine!==false&&!!window.GestLokSupabase;
const admin=()=>allowed()&&api.miRol()==='creadora'&&!api.S?.ro;
const selected=()=>historyRecord||(snapshot?.counts||[]).find(s=>s.shift===shift)||null;
const closed=()=>!!historyRecord||selected()?.status==='finalizado';
function reset(){++generation;snapshot=null;day=arDay();shift='manana_entrada';historyRecord=null;loading=false;busy=false;error='';queues.clear();opened=new Set(['EMPANADAS']);}
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
function entry(){return selected()||{day,shift,data:{},decomiso:{},decomiso_visible:false,responsable:null,consumption:[],waste:[],status:'borrador'};}
function draftRecord(){
 if(!snapshot)return null;
 let rec=(snapshot.counts||[]).find(s=>s.shift===shift);
 if(!rec){rec={day,shift,data:{},decomiso:{},decomiso_visible:false,responsable:null,consumption:[],waste:[],status:'borrador'};snapshot.counts.push(rec);}
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

/* Las chapas y las sueltas se cargan juntas, tal como se anotan en papel (|| 16). */
function chapaCompacta(p,v,canWrite,isDecomiso,index){
 const pid=esc(p.id),where=isDecomiso?'de decomiso':'del vencimiento '+index;
 const attrs=isDecomiso?'':' data-idx="'+index+'"';
 const plus=isDecomiso?'data-gcm-decomp-plus':'data-gcm-plus';
 const minus=isDecomiso?'data-gcm-decomp-minus':'data-gcm-minus';
 const suelta=isDecomiso?'data-gcm-decomp-suelta':'data-gcm-suelta';
 const disabled=canWrite?'':' disabled';
 const unitValue=v.sueltas>0?v.sueltas:'';
 const label=esc(p.name+' '+where);
 return '<div class="gcm-inline-count">'+
  '<button type="button" class="gcm-mark-button" '+plus+'="'+pid+'"'+attrs+disabled+
    ' aria-label="Sumar chapa '+label+'" title="'+v.chapas+' chapas · tocar para sumar">'+marks(v.chapas)+'</button>'+
  '<button type="button" class="gcm-mark-undo" '+minus+'="'+pid+'"'+attrs+disabled+
    ' aria-label="Quitar chapa '+label+'" title="Quitar una chapa">−</button>'+
  '<label class="gcm-inline-units"><span aria-hidden="true">+</span>'+
   '<input type="number" min="0" max="100000" inputmode="numeric" '+suelta+'="'+pid+'"'+attrs+
    ' placeholder="u." value="'+unitValue+'"'+disabled+
    ' aria-label="Unidades sueltas '+label+'"></label>'+
  '</div>';
}

function decompColumn(p,canWrite){
 const v=getDecomisoCell(p), disabled=canWrite?'':' disabled';
 if(p.units_per_chapa>0){
  return '<td class="gcm-chapa gcm-decomp-cell">'+chapaCompacta(p,v,canWrite,true,0)+'</td>';
 }
 return '<td class="gcm-decomp-cell"><input type="number" class="gcm-qty" min="0" max="1000000" inputmode="numeric" data-gcm-decomp-qty="'+esc(p.id)+'" value="'+(v.qty||'')+'" placeholder="—"'+disabled+' aria-label="Decomiso de '+esc(p.name)+'"></td>';
}
function sectionTable(name,items,canWrite,canCatalog,showDecomiso){
 const dateBase=historyRecord?.day||day,first=historyRecord?.shift||shift;
 const dates=Array.from({length:4},(_,i)=>({vto:'Vto '+(i+1),dia:first==='manana_entrada'?labelDay(plusDays(dateBase,i)).slice(0,5):''}));
 const rows=items.map(p=>{
  const cells=[1,2,3,4].map(i=>{
   const v=getCell(p,i),disabled=!canWrite?' disabled':'';
   if(p.units_per_chapa){
    return '<td class="gcm-chapa">'+chapaCompacta(p,v,canWrite,false,i)+'</td>';
   }
   return '<td><input class="gcm-qty" type="number" min="0" max="1000000" inputmode="numeric" data-gcm-qty="'+esc(p.id)+'" data-idx="'+i+'" value="'+v.qty+'"'+disabled+' aria-label="Cantidad '+esc(p.name)+' vencimiento '+i+'"></td>';
  }).join('');
  let sum=amount(p,getDecomisoCell(p));
  for(let i=1;i<=4;i++)sum+=amount(p,getCell(p,i));
  return '<tr>'+(showDecomiso?decompColumn(p,canWrite):'')+
   '<th scope="row"><span>'+esc(p.name)+'</span>'+
   (canCatalog?'<details class="gcm-product-actions"><summary aria-label="Opciones del producto '+esc(p.name)+'">⋯</summary><span class="gcm-admin-actions">'+
   '<button type="button" data-gcm-rename="'+esc(p.id)+'" aria-label="Cambiar nombre de '+esc(p.name)+'">Renombrar</button>'+
   '<button type="button" data-gcm-remove="'+esc(p.id)+'" aria-label="Quitar '+esc(p.name)+'">Quitar</button></span></details>':'')+
   '</th>'+cells+'<td class="gcm-total">'+(sum||'—')+'</td></tr>';
 }).join('');
 return '<details class="gcm-section" data-gcm-section="'+esc(name)+'"'+(opened.has(name)?' open':'')+'><summary><strong>'+esc(name)+'</strong><span>'+items.length+' productos</span></summary>'+
 '<div class="gcm-scroller gcm-sheet-scroll" role="region" aria-label="'+esc(name)+'" tabindex="0"><table><thead><tr>'+
 (showDecomiso?'<th scope="col" class="gcm-decomp-head">Decomiso</th>':'')+
 '<th scope="col">Producto</th>'+
 dates.map(s=>'<th scope="col"><span class="gcm-vto">'+esc(s.vto)+'</span>'+(s.dia?'<span class="gcm-vto-date">'+esc(s.dia)+'</span>':'')+'</th>').join('')+'<th scope="col">Total</th></tr></thead><tbody>'+rows+'</tbody></table></div></details>';
}
function extraTable(kind,title,headA,headB,rec,canWrite){
 const rows=Array.isArray(rec[kind])?rec[kind]:[],length=Math.max(3,rows.length+1);
 return '<section class="gcm-extras"><h3>'+title+'</h3><table><thead><tr><th>'+headA+'</th><th>'+headB+'</th></tr></thead><tbody>'+
 Array.from({length:Math.min(60,length)},(_,i)=>{
  const item=rows[i]||{},disabled=canWrite?'':' disabled';
  return '<tr><td><input type="text" maxlength="90" data-gcm-extra="'+kind+'" data-row="'+i+'" data-field="name" value="'+esc(item.name||'')+'" placeholder="'+esc(headA)+'"'+disabled+'></td>'+
   '<td><input type="text" maxlength="90" data-gcm-extra="'+kind+'" data-row="'+i+'" data-field="value" value="'+esc(item.value||'')+'" placeholder="'+esc(headB)+'"'+disabled+'></td></tr>';
 }).join('')+'</tbody></table></section>';
}
function view(){
 if(!allowed())return '<p>El Conteo está disponible únicamente para el personal autorizado de Mi Gusto Munro.</p>';
 if(!snapshot&&!loading&&!error)void refresh();
 if(!historyRecord && day!==arDay() && !busy){day=arDay();snapshot=null;++generation;}
 const rec=entry(),canWrite=editable()&&!closed()&&!!snapshot,canCatalog=admin()&&!historyRecord&&!busy;
 const showDecomiso=!!rec.decomiso_visible;
 const list=(snapshot?.products||[]).filter(p=>p.active||!!rec.data?.[p.id]||!!rec.decomiso?.[p.id]);
 const categories=[...new Set(list.map(p=>p.section))];
 const names=SHIFTS.map(([id,name])=>'<button type="button" data-gcm-shift="'+id+'"'+(!historyRecord&&shift===id?' class="is-active"':'')+'>'+esc(name)+'</button>').join('');
 const hist='<div class="gcm-history-list">'+(snapshot?.history||[]).map(x=>
  '<button type="button" data-gcm-history="'+esc(x.day)+'|'+esc(x.shift)+'">'+labelDay(x.day)+' · '+esc(SHIFTS.find(s=>s[0]===x.shift)?.[1]||x.shift)+' · '+esc(x.responsable||'Sin responsable')+'</button>').join('')+'</div>';
 const history=historyRecord?'<div class="gcm-history-alert"><strong>Historial · '+labelDay(historyRecord.day)+'</strong><button type="button" data-gcm-back>Volver al conteo</button></div>':'';
 return '<div class="gcm-page"><header class="gcm-header"><div><span class="gcm-eyebrow">MI GUSTO · MUNRO</span><h2>Conteo</h2><p>Tres conteos por día · guardado automático por casilla.</p></div>'+
 '<div class="gcm-header-fields"><div><span>Local</span><strong>Munro</strong></div>'+
 '<label>Gerente / Responsable <select id="gcm-responsable"'+(!canWrite?' disabled':'')+'><option value="">Seleccionar responsable</option>'+
 RESPONSABLES.map(n=>'<option value="'+esc(n)+'"'+(rec.responsable===n?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></label>'+
 '<div><span>Fecha de inicio</span><strong>'+(historyRecord?'Archivado: ':'Hoy · ')+labelDay(historyRecord?.day||day)+'</strong></div></div></header>'+
 '<nav class="gcm-tabs" aria-label="Turno">'+names+'</nav>'+history+
 (error?'<p class="gcm-error" role="alert">'+esc(error)+' <button type="button" data-gcm-retry>Reintentar</button></p>':'')+
 (loading?'<p class="gcm-loading" role="status">Cargando conteos…</p>':'')+
 (snapshot?'<div class="gcm-help"><label class="gcm-decomp-toggle"><input type="checkbox" id="gcm-decomiso-toggle"'+(showDecomiso?' checked':'')+(!canWrite?' disabled':'')+'> Mostrar Decomiso</label><div>'+(historyRecord?'Consulta del conteo finalizado.':shift==='manana_entrada'?'Entrada: hoy y tres días posteriores.':'Salida: cuatro vencimientos por producto.')+
 '<span>'+(closed()?'Finalizado · solo lectura':!editable()?'Solo lectura':busy?'Guardando…':'Guardado automático')+'</span></div></div>'+
'<div class="gcm-sheet-tip">Cada toque agrega una chapa (5 marcas completan un cuadrado). Escribí las unidades sueltas junto a las marcas; el total se calcula a la derecha.</div>'+
 categories.map(name=>sectionTable(name,list.filter(p=>p.section===name),canWrite,canCatalog,showDecomiso)).join('')+
 (Object.values(rec.decomiso||{}).some(v=>Number(v.chapas)||Number(v.sueltas)||Number(v.qty))?'<p class="gcm-decomp-note">Los totales incluyen el decomiso registrado, aunque ocultes la columna.</p>':'')+
 '<div class="gcm-bottom">'+extraTable('consumption','CONSUMO','Colaborador','Consumo',rec,canWrite)+extraTable('waste','DESPERDICIO','Producto','Cantidad',rec,canWrite)+'</div>'+
 (!historyRecord?'<div class="gcm-actions"><button type="button" data-gcm-refresh>Actualizar</button>'+
 (!closed()?'<button type="button" data-gcm-finalize'+(!canWrite?' disabled':'')+'>Finalizar '+esc(SHIFTS.find(s=>s[0]===shift)?.[1]||'turno')+'</button>':'<span>Conteo del turno archivado</span>')+'</div>':'')+
 '<section class="gcm-history"><h3>Historial de conteos</h3><p>Los turnos finalizados se conservan por fecha y responsable.</p>'+hist+'</section>':'')+
 '</div>';
}
function schedule(key,fn){
 const old=queues.get(key)||Promise.resolve();
 const next=old.catch(()=>{}).then(fn);
 queues.set(key,next);busy=true;
 const indicator=document.querySelector('.gcm-help span:last-child');
 if(indicator)indicator.textContent='Guardando…';
 next.then(()=>{if(queues.get(key)===next){queues.delete(key);if(!queues.size)busy=false;const el=document.querySelector('.gcm-help span:last-child');if(el)el.textContent='Guardado automáticamente';}})
 .catch(e=>{if(queues.get(key)===next){queues.delete(key);busy=false;}error='Error al guardar: '+(e.message||'Reintentá');api?.toast?.(error);if(api?.S?.view==='conteo-munro')api.render();});
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
 let rec=(snapshot?.counts||[]).find(s=>s.shift===shift);
 if(!rec){rec={day,shift,data:{},consumption:[],waste:[],status:'borrador'};snapshot.counts.push(rec);}
 const vals=Array.isArray(rec[kind])?[...rec[kind]]:[];
 while(vals.length<=idx)vals.push({name:'',value:''});
 vals[idx]={...vals[idx],[field]:input.value.trim().slice(0,90)};
 rec[kind]=vals;
 const d=day,s=shift,copy=JSON.parse(JSON.stringify(vals));
 return schedule(d+'|'+s+'|'+kind,()=>rpc('gestlok_munro_conteo_set_extra',{p_day:d,p_shift:s,p_kind:kind,p_items:copy}));
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
 if(!el)return;
 if(el.hasAttribute('data-gcm-retry')||el.hasAttribute('data-gcm-refresh')){error='';void refresh();return;}
 if(el.hasAttribute('data-gcm-back')){historyRecord=null;api.render();return;}
 const newShift=el.dataset.gcmShift;
 if(newShift){
  if(!SHIFTS.some(x=>x[0]===newShift)||busy)return;
  historyRecord=null;shift=newShift;api.render();return;
 }
 if(el.hasAttribute('data-gcm-history')){
  if(busy)return;
  const [d,s]=el.dataset.gcmHistory.split('|');
  const record=(snapshot?.history||[]).find(v=>v.day===d&&v.shift===s);
  if(record){historyRecord=record;shift=s;api.render();}return;
 }
 const isDecomp=el.hasAttribute('data-gcm-decomp-plus')||el.hasAttribute('data-gcm-decomp-minus');
 const id=el.dataset.gcmPlus||el.dataset.gcmMinus||el.dataset.gcmDecompPlus||el.dataset.gcmDecompMinus;
 if(id){
  if(!editable()||closed())return;
  const p=productById(id),i=Number(el.dataset.idx);
  if(!p||!p.units_per_chapa||(!isDecomp&&(i<1||i>4)))return;
  const cell=isDecomp?getDecomisoCell(p):getCell(p,i);
  const delta=el.hasAttribute('data-gcm-plus')||el.hasAttribute('data-gcm-decomp-plus')?1:-1;
  cell.chapas=Math.max(0,Math.min(500,cell.chapas+delta));
  if(isDecomp)void saveDecomiso(p,cell);else void saveCell(p,i,cell);
  api.render();return;
 }
 const productId=el.dataset.gcmRename||el.dataset.gcmRemove;
 if(productId&&admin()&&!busy){
  const p=productById(productId);if(!p)return;
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