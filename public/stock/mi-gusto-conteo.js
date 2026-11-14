/* GESTLOK · Mi Gusto Munro · Conteo por turnos.
   Chapas representadas por cuadrados: 4 lados + diagonal = 5 chapas.
   El backend valida tenant, sucursal, rol, fecha y ediciones de catálogo. */
(()=>{
'use strict';
if(window.GestLokMunroConteo)return;
const TENANT='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const SHIFTS=[['manana_entrada','Mañana · entrada'],['manana_salida','Mañana · salida'],['noche_salida','Noche · salida']];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const labelDay=s=>{const a=String(s||'').split('-');return a.length===3?a[2]+'/'+a[1]+'/'+a[0]:'—';};
function plusDays(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function marks(value){
 const n=Math.max(0,Math.min(500,Math.floor(Number(value)||0)));
 if(!n)return '<small>+ chapa</small>';
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
function entry(){return selected()||{day,shift,data:{},consumption:[],waste:[],status:'borrador'};}
function getCell(p,i){
 const e=entry(),v=e.data?.[p.id]?.['v'+i]||{};
 return {chapas:Math.max(0,Number(v.chapas)||0),sueltas:Math.max(0,Number(v.sueltas)||0),qty:Math.max(0,Number(v.qty)||0)};
}
function patchCell(pid,i,newCell){
 let rec=(snapshot?.counts||[]).find(s=>s.shift===shift);
 if(!rec){rec={day,shift,data:{},consumption:[],waste:[],status:'borrador'};snapshot.counts.push(rec);}
 rec.data=rec.data||{};rec.data[pid]={...(rec.data[pid]||{}),['v'+i]:{...newCell}};
}
const amount=(p,v)=>p.units_per_chapa>0?v.chapas*p.units_per_chapa+v.sueltas:v.qty;
function sectionTable(name,items,canWrite,canCatalog){
 const dateBase=historyRecord?.day||day,first=historyRecord?.shift||shift;
 const dates=Array.from({length:4},(_,i)=>first==='manana_entrada'?labelDay(plusDays(dateBase,i)):'Vto '+(i+1));
 const rows=items.map(p=>{
  const cells=[1,2,3,4].map(i=>{
   const v=getCell(p,i),disabled=!canWrite?' disabled':'',value=amount(p,v);
   if(p.units_per_chapa){
    return '<td class="gcm-chapa"><div class="gcm-chapa-box"><button type="button" data-gcm-plus="'+esc(p.id)+'" data-idx="'+i+'"'+disabled+' aria-label="Sumar chapa '+esc(p.name)+' vencimiento '+i+'">'+marks(v.chapas)+'</button>'+
    '<button class="gcm-less" type="button" data-gcm-minus="'+esc(p.id)+'" data-idx="'+i+'"'+disabled+' aria-label="Quitar chapa">−</button></div>'+
    '<label class="gcm-small">Sueltas <input type="number" min="0" max="100000" inputmode="numeric" data-gcm-suelta="'+esc(p.id)+'" data-idx="'+i+'" value="'+v.sueltas+'"'+disabled+'></label>'+
    '<span class="gcm-cell-total">'+value+' u.</span></td>';
   }
   return '<td><input class="gcm-qty" type="number" min="0" max="1000000" inputmode="numeric" data-gcm-qty="'+esc(p.id)+'" data-idx="'+i+'" value="'+v.qty+'"'+disabled+' aria-label="Cantidad '+esc(p.name)+' vencimiento '+i+'"></td>';
  }).join('');
  let sum=0;for(let i=1;i<=4;i++)sum+=amount(p,getCell(p,i));
  return '<tr><th scope="row"><span>'+esc(p.name)+'</span>'+
   (canCatalog?'<span class="gcm-admin-actions"><button type="button" data-gcm-rename="'+esc(p.id)+'" aria-label="Cambiar nombre de '+esc(p.name)+'">Editar</button>'+
   '<button type="button" data-gcm-remove="'+esc(p.id)+'" aria-label="Quitar '+esc(p.name)+'">Quitar</button></span>':'')+
   '</th>'+cells+'<td class="gcm-total">'+sum+'</td></tr>';
 }).join('');
 return '<details class="gcm-section" data-gcm-section="'+esc(name)+'"'+(opened.has(name)?' open':'')+'><summary><strong>'+esc(name)+'</strong><span>'+items.length+' productos</span></summary>'+
 '<div class="gcm-scroller" role="region" aria-label="'+esc(name)+'" tabindex="0"><table><thead><tr><th scope="col">Producto</th>'+
 dates.map(s=>'<th scope="col">'+esc(s)+'</th>').join('')+'<th scope="col">Total</th></tr></thead><tbody>'+rows+'</tbody></table></div></details>';
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
 const rec=entry(),canWrite=editable()&&!closed()&&!busy,canCatalog=admin()&&!historyRecord&&!busy;
 const list=(snapshot?.products||[]).filter(p=>p.active||!!rec.data?.[p.id]);
 const categories=[...new Set(list.map(p=>p.section))];
 const names=SHIFTS.map(([id,name])=>'<button type="button" data-gcm-shift="'+id+'"'+(!historyRecord&&shift===id?' class="is-active"':'')+'>'+esc(name)+'</button>').join('');
 const hist='<div class="gcm-history-list">'+(snapshot?.history||[]).map(x=>
  '<button type="button" data-gcm-history="'+esc(x.day)+'|'+esc(x.shift)+'">'+labelDay(x.day)+' · '+esc(SHIFTS.find(s=>s[0]===x.shift)?.[1]||x.shift)+'</button>').join('')+'</div>';
 const history=historyRecord?'<div class="gcm-history-alert"><strong>Historial · '+labelDay(historyRecord.day)+'</strong><button type="button" data-gcm-back>Volver al conteo</button></div>':'';
 return '<div class="gcm-page"><header class="gcm-header"><div><span class="gcm-eyebrow">MI GUSTO · MUNRO</span><h2>Conteo</h2><p>Tres conteos por día · guardado automático por casilla.</p></div>'+
 '<label>Fecha de trabajo <input type="date" id="gcm-day" value="'+esc(day)+'" max="'+arDay()+'"'+(historyRecord?' disabled':'')+'></label></header>'+
 '<nav class="gcm-tabs" aria-label="Turno">'+names+'</nav>'+history+
 (error?'<p class="gcm-error" role="alert">'+esc(error)+' <button type="button" data-gcm-retry>Reintentar</button></p>':'')+
 (loading?'<p class="gcm-loading" role="status">Cargando conteos…</p>':'')+
 (snapshot?'<div class="gcm-help">'+(historyRecord?'Consulta del conteo finalizado.':shift==='manana_entrada'?'Entrada: fecha de trabajo y tres días posteriores.':'Salida: cuatro vencimientos por producto.')+
 '<span>'+(closed()?'Finalizado · solo lectura':!editable()?'Solo lectura':busy?'Guardando…':'Guardado automático')+'</span></div>'+
 categories.map(name=>sectionTable(name,list.filter(p=>p.section===name),canWrite,canCatalog)).join('')+
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
 const id=el.dataset.gcmPlus||el.dataset.gcmMinus;
 if(id){
  if(!editable()||closed()||busy)return;
  const p=productById(id),i=Number(el.dataset.idx);
  if(!p||!p.units_per_chapa||i<1||i>4)return;
  const cell=getCell(p,i),delta=el.hasAttribute('data-gcm-plus')?1:-1;
  cell.chapas=Math.max(0,Math.min(500,cell.chapas+delta));
  void saveCell(p,i,cell);api.render();return;
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
document.addEventListener('change',e=>{
 const input=e.target,root=input.closest?.('.gcm-page');
 if(!root||!allowed()||busy)return;
 if(input.id==='gcm-day'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.value)||input.value>arDay())return;
  day=input.value;historyRecord=null;error='';snapshot=null;generation++;api.render();return;
 }
 if(!editable()||closed())return;
 if(input.hasAttribute('data-gcm-extra')){void updateExtra(input);return;}
 const kind=input.hasAttribute('data-gcm-suelta')?'sueltas':input.hasAttribute('data-gcm-qty')?'qty':null;
 if(!kind)return;
 const p=productById(input.dataset[kind==='sueltas'?'gcmSuelta':'gcmQty']),i=Number(input.dataset.idx);
 if(!p||i<1||i>4)return;
 const limit=kind==='sueltas'?100000:1000000,val=Number(input.value);
 if(!Number.isSafeInteger(val)||val<0||val>limit){api.toast?.('Ingresá una cantidad válida');api.render();return;}
 const cell=getCell(p,i);cell[kind]=val;
 void saveCell(p,i,cell);api.render();
});
window.GestLokMunroConteo=Object.freeze({attach,view,subscribe,reset,permitido:allowed,_test:{marks,plusDays,labelDay}});
})();