/* Mi Gusto · Cierre Online / Munro y Torcuato. Backend privado: RPC autorizadas.
   No reemplaza ni modifica los Excel preexistentes. */
(()=>{
'use strict';
const TENANT='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const LOCALS={munro:'Munro',torcuato:'Don Torcuato'};
const METHODS={transferencia:'Transferencia',getnet:'Getnet',mercado_pago:'Mercado Pago'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=x=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(x)||0);
const date=x=>{const a=String(x||'').slice(0,10).split('-');return a.length===3?a[2]+'/'+a[1]+'/'+a[0].slice(2):'—';};
const shiftName=x=>x==='manana'?'Mañana':'Tarde';
const SCALE_KEY='gestlok:pagos-online:escala-v1';
const clampScale=x=>Math.min(110,Math.max(85,Math.round(Number(x)/5)*5));
let pageScale=null;
function getScale(){
 if(pageScale!==null)return pageScale;
 const mobile=typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(max-width: 600px)').matches;
 const initial=mobile?100:95;
 try{const saved=localStorage.getItem(SCALE_KEY);pageScale=saved&&/^\d{2,3}$/.test(saved)?clampScale(saved):initial;}
 catch{pageScale=initial;}
 return pageScale;
}
function changeScale(delta){
 const before=getScale();pageScale=clampScale(before+delta);
 if(pageScale===before)return;
 try{localStorage.setItem(SCALE_KEY,String(pageScale));}catch{}
 const page=document.querySelector('.mg-on-page');
 if(page)page.style.zoom=String(pageScale/100);
 const value=document.querySelector('#mg-on-scale-value');
 if(value)value.textContent=pageScale+'%';
 const minus=document.querySelector('[data-mgon-scale="down"]'),plus=document.querySelector('[data-mgon-scale="up"]');
 if(minus)minus.disabled=pageScale<=85;
 if(plus)plus.disabled=pageScale>=110;
}
let api=null, snapshot=null, tab='resumen', error='', loading=false, saving=false, editing=null, opened=null, filter='', viewMode='dia', shiftFilter='todos', gen=0;
const local=()=>api?.S?.local;
const allowed=()=>!!api&&api.S?.me?.tenant_id===TENANT&&local() in LOCALS &&
  (api.miRol()==='dueno'||(api.miRol()==='gerente'&&api.misLocales().includes(local())));
const online=()=>api&&!api.S?.offline&&navigator.onLine!==false;
const writable=()=>allowed()&&online()&&!saving;
function reset(){++gen;snapshot=null;tab='resumen';error='';loading=false;saving=false;editing=null;opened=null;filter='';viewMode='dia';shiftFilter='todos';}
async function rpc(name,args={}){
 if(!allowed())throw Error('Sin autorización para el local');
 if(!online())throw Error('Sin conexión. Guardar y cerrar turnos requiere internet.');
 const a=await window.GestLokSupabase.rpc(name,{p_local:local(),...args});
 if(a.error)throw Error(a.error.message||'No se pudo guardar el cambio');
 return a.data;
}
async function refresh(){
 if(!allowed()||loading||saving||!online())return;
 const loc=local(),token=gen;
 loading=true;
 try{const value=await rpc('gestlok_mg_online_state');
   if(loc!==local()||token!==gen)return;
   snapshot=value;error='';
 }catch(e){if(token===gen)error=e.message||'No pudimos consultar los cierres';}
 finally{loading=false;if(token===gen&&api?.S?.view==='cierre-online')api.render();}
}
function status(){
 const s=snapshot?.active;
 return '<div class="mg-on-summary">'+
 ['transferencia','getnet','mercado_pago','total_app','total_ventas','online_local'].map((key,i)=>
  '<div class="mg-on-summary-item '+(key==='online_local'?'mg-on-local':key==='total_ventas'?'mg-on-total':'')+'"><span>'+esc({
 transferencia:'Transferencia',getnet:'Getnet',mercado_pago:'Mercado Pago',total_app:'Total APP',
 total_ventas:'Total ventas',online_local:'Online Local'}[key])+'</span><strong>'+cash(s?.[key]||0)+'</strong></div>').join('')+'</div>';
}
function currentHead(){
 const s=snapshot?.active;
 return '<div class="mg-on-head"><div><small>MI GUSTO · '+esc(LOCALS[local()]||'')+'</small>'+
 '<h2>Pagos Online</h2><p>Control de comandas y cierres por turno, separado por sucursal.</p></div>'+
 '<div class="mg-on-period"><span>Fecha <strong>'+date(s?.day)+'</strong></span>'+
 '<span>Turno <strong>'+esc(shiftName(s?.turno||'manana'))+'</strong></span>'+
 '<span class="mg-on-open">● Abierto</span></div></div>';
}
function scaleBar(){
 const v=getScale();
 return '<div class="mg-on-scale" role="group" aria-label="Tamaño de Pagos Online">'+
  '<span>Tamaño de letra</span>'+
  '<button type="button" data-mgon-scale="down" aria-label="Reducir tamaño de letra" '+(v<=85?'disabled':'')+'>−</button>'+
  '<output id="mg-on-scale-value" aria-live="polite">'+v+'%</output>'+
  '<button type="button" data-mgon-scale="up" aria-label="Aumentar tamaño de letra" '+(v>=110?'disabled':'')+'>+</button></div>';
}
function nav(){
 return '<nav class="mg-on-tabs" aria-label="Pagos Online">'+
 '<button type="button" data-mgon-tab="resumen" aria-current="'+(tab==='resumen'?'page':'false')+'">Resumen del turno e historial</button>'+
 '<button type="button" data-mgon-tab="movimientos" aria-current="'+(tab==='movimientos'?'page':'false')+'">Carga de pedidos</button></nav>';
}
function movementList(){
 const rows=snapshot?.active?.movements||[];
 if(!rows.length)return '<p class="mg-on-empty">Todavía no hay comandas cargadas en este turno.</p>';
 return '<div class="mg-on-tablewrap"><table><thead><tr><th>Comanda</th><th>Forma de pago</th><th>Monto</th><th>APP</th><th>Observaciones</th><th>Acciones</th></tr></thead><tbody>'+
 rows.map(r=>'<tr><td><strong>#'+esc(r.comanda)+'</strong></td><td>'+esc(METHODS[r.method]||r.method)+'</td>'+
 '<td>'+cash(r.amount)+'</td><td><button type="button" class="mg-on-switch" role="switch" aria-label="APP de comanda '+esc(r.comanda)+'" aria-checked="'+!!r.app+'" data-mgon-app="'+esc(r.id)+'" '+(!writable()?'disabled':'')+'><span></span><b>'+(r.app?'APP':'—')+'</b></button></td>'+
 '<td class="mg-on-observation-cell">'+(r.observacion?'<span title="'+esc(r.observacion)+'">'+esc(r.observacion)+'</span>':'<small>—</small>')+'</td>'+
 '<td><div class="mg-on-rowbuttons"><button type="button" data-mgon-edit="'+esc(r.id)+'" '+(!writable()?'disabled':'')+'>Editar</button>'+
 '<button type="button" class="mg-on-danger" data-mgon-delete="'+esc(r.id)+'" '+(!writable()?'disabled':'')+'>Quitar</button></div></td></tr>').join('')+
 '</tbody></table></div>';
}
function entry(){
 const s=snapshot?.active,r=(s?.movements||[]).find(x=>x.id===editing);
 return '<form id="mg-online-form" class="mg-on-entry"><h3>'+(r?'Editar comanda':'Agregar movimiento')+'</h3>'+
 '<div class="mg-on-fields"><label>Número de comanda<input type="text" inputmode="numeric" pattern="[0-9]{1,10}" name="comanda" maxlength="10" value="'+esc(r?.comanda||'')+'" placeholder="Ej. 36" required></label>'+
 '<label>Monto ($)<input type="number" inputmode="decimal" name="amount" min="0.01" max="99999999999" step="0.01" value="'+esc(r?.amount||'')+'" placeholder="0,00" required></label>'+
 '<label>Forma de pago<select name="method">'+Object.entries(METHODS).map(([k,v])=>'<option value="'+k+'" '+((r?.method||'transferencia')===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
 '<label class="mg-on-check"><input type="checkbox" name="app" '+(r?.app?'checked':'')+'><span>APP <small>Descontar de Online Local</small></span></label></div>'+
 '<label class="mg-on-observation">Observaciones <small>(opcional · máximo 300 caracteres)</small>'+
 '<textarea name="observacion" maxlength="300" rows="2" placeholder="Ej. El cliente retiró más tarde">'+esc(r?.observacion||'')+'</textarea></label>'+
 '<div class="mg-on-actions"><button class="mg-on-primary" type="submit" '+(!writable()?'disabled':'')+'>'+(r?'Guardar cambios':'Guardar movimiento')+'</button>'+
 (r?'<button type="button" data-mgon-cancel>Cancelar edición</button>':'')+'</div></form>';
}
function movements(){
 return '<div class="mg-on-section"><header><h3>Carga manual de pedidos</h3><p>Cargá cada pedido individualmente con su comanda, monto, pago y switch APP.</p></header>'+
 entry()+movementList()+'</div>'+status()+
 '<div class="mg-on-close"><p>Al cerrar el turno, los movimientos quedan guardados en el historial y se abre automáticamente el turno siguiente.</p>'+
 '<button type="button" data-mgon-close '+(!writable()?'disabled':'')+'>Cerrar turno →</button></div>';
}
function shiftCard(s){
 if(!s)return '<article class="mg-on-shift"><h3>Sin movimientos</h3><p>Este turno todavía no tiene registros guardados.</p></article>';
 return '<article class="mg-on-shift"><header><h3>'+esc(shiftName(s.turno))+'</h3><span class="'+(s.status==='cerrado'?'mg-on-closed':'mg-on-open')+'">'+(s.status==='cerrado'?'✓ Cerrado':'● Abierto')+'</span></header>'+
 [['transferencia','Transferencia'],['getnet','Getnet'],['mercado_pago','Mercado Pago'],['total_app','Total APP'],['total_ventas','Total ventas'],['online_local','Online Local']].map(([key,label])=>
 '<div class="mg-on-shift-row '+(key==='online_local'?'mg-on-local':'')+'"><span>'+label+'</span><strong>'+cash(s[key])+'</strong></div>').join('')+
 '<small>'+Number(s.comandas||0)+' comandas registradas</small></article>';
}
function summary(){
 const curr=snapshot?.active, all=[curr,...(snapshot?.history||[])].filter(Boolean).filter(s=>s.day===curr?.day);
 const morning=all.find(s=>s.turno==='manana'),afternoon=all.find(s=>s.turno==='tarde');
 const total=Number(morning?.total_ventas||0)+Number(afternoon?.total_ventas||0);
 const onlineLocal=Number(morning?.online_local||0)+Number(afternoon?.online_local||0);
 return '<section class="mg-on-dashboard"><h3>Resumen diario · '+date(curr?.day)+'</h3>'+
 '<div class="mg-on-hero"><div><span>Total ventas del día</span><strong>'+cash(total)+'</strong></div><div><span>Online Local</span><strong>'+cash(onlineLocal)+'</strong></div></div>'+
 '<div class="mg-on-shifts">'+shiftCard(morning)+shiftCard(afternoon)+'</div>'+
 '<p class="mg-on-note">Total APP = suma de comandas con APP activado. Online Local = Total ventas − Total APP.</p>'+
 '<div class="mg-on-actions"><button type="button" data-mgon-tab="movimientos" class="mg-on-primary">Cargar comandas</button>'+
 '<button type="button" data-mgon-jump-history>Ver historial</button></div>'+history()+'</section>';
}
function oldRows(s){
 return '<div class="mg-on-detail"><h4>Movimientos individuales · '+esc(shiftName(s.turno))+'</h4>'+
 '<div class="mg-on-tablewrap"><table><thead><tr><th>Comanda</th><th>Pago</th><th>Importe</th><th>APP</th><th>Observaciones</th></tr></thead><tbody>'+
 (s.movements||[]).map(m=>'<tr><td>#'+esc(m.comanda)+'</td><td>'+esc(METHODS[m.method]||m.method)+'</td><td>'+cash(m.amount)+'</td><td>'+(m.app?'Sí':'No')+'</td><td class="mg-on-observation-cell">'+esc(m.observacion||'—')+'</td></tr>').join('')+
 '</tbody></table></div>'+shiftCard(s)+'</div>';
}
/* El servidor devuelve cierres definitivos por sucursal.
   Agrupar solamente en la presentación preserva detalle y cálculo histórico. */
function historyGroups(rows){
 const days=new Map();
 for(const s of rows||[]){
  if(!days.has(s.day))days.set(s.day,{day:s.day,shifts:[],transferencia:0,getnet:0,mercado_pago:0,total_app:0,total_ventas:0,online_local:0,comandas:0});
  const d=days.get(s.day);d.shifts.push(s);
  for(const key of ['transferencia','getnet','mercado_pago','total_app','total_ventas','online_local','comandas'])d[key]+=Number(s[key]||0);
 }
 return [...days.values()].sort((a,b)=>String(b.day).localeCompare(String(a.day)));
}
function historyTotals(model){
 return '<div class="mg-on-kpis">'+
  [['transferencia','Transferencia'],['getnet','Getnet'],['mercado_pago','Mercado Pago'],
   ['total_ventas','Total ventas'],['total_app','Total APP'],['online_local','Online Local']].map(([key,label])=>
    '<span>'+label+' <strong>'+cash(model[key])+'</strong></span>').join('')+'</div>';
}
function shiftHistoryCard(s){
 return '<article class="mg-on-history-card"><header><div><strong>'+
  esc(shiftName(s.turno))+' · '+date(s.day)+'</strong><small>✓ Cierre guardado · '+Number(s.comandas||0)+' comandas</small></div>'+
  '<button type="button" data-mgon-detail="'+esc(s.id)+'" aria-expanded="'+(opened===s.id)+'">'+
  (opened===s.id?'Ocultar detalle':'Ver pedidos')+'</button></header>'+
  historyTotals(s)+(opened===s.id?oldRows(s):'')+'</article>';
}
function dayHistoryCard(d){
 return '<article class="mg-on-history-day"><header><div><small>RESUMEN DEL DÍA</small><h4>'+
 date(d.day)+'</h4><p>'+d.shifts.length+' '+(d.shifts.length===1?'turno cerrado':'turnos cerrados')+
 ' · '+d.comandas+' comandas</p></div><span class="mg-on-closed">✓ Guardado</span></header>'+
 historyTotals(d)+'<div class="mg-on-history-day-shifts">'+
 d.shifts.slice().sort((a,b)=>a.turno==='manana'?-1:1).map(shiftHistoryCard).join('')+
 '</div></article>';
}
function history(){
 const rows=(snapshot?.history||[]).filter(s=>!filter||s.day===filter);
 const days=historyGroups(rows);
 const shifts=rows.filter(s=>shiftFilter==='todos'||s.turno===shiftFilter);
 const controls='<div class="mg-on-history-filters" role="group" aria-label="Consultar historial">'+
  '<label>Ver historial por<select id="mg-on-history-view">'+
  '<option value="dia" '+(viewMode==='dia'?'selected':'')+'>Por día</option>'+
  '<option value="turno" '+(viewMode==='turno'?'selected':'')+'>Por turno</option></select></label>'+
  '<label>Fecha<input id="mg-on-date-filter" type="date" value="'+esc(filter)+'"></label>'+
  (viewMode==='turno'?'<label>Turno<select id="mg-on-turn-filter">'+
   '<option value="todos" '+(shiftFilter==='todos'?'selected':'')+'>Todos los turnos</option>'+
   '<option value="manana" '+(shiftFilter==='manana'?'selected':'')+'>Mañana</option>'+
   '<option value="tarde" '+(shiftFilter==='tarde'?'selected':'')+'>Tarde</option></select></label>':'')+
  '<button type="button" data-mgon-clear-filters>Ver todo el historial</button></div>';
 const content=viewMode==='dia'
   ?days.map(dayHistoryCard).join('')
   :shifts.map(shiftHistoryCard).join('');
 return '<section class="mg-on-history-embedded" id="mg-on-history"><header><h3>Historial de pagos online</h3>'+
 '<p>Consultá un día completo o cada turno. Abrí cualquier cierre para ver las comandas individuales y la forma de pago.</p></header>'+
 controls+(content?'<div class="mg-on-history" aria-live="polite">'+content+'</div>':
 '<p class="mg-on-empty">No se encontraron cierres con esos filtros.</p>')+'</section>';
}
function view(){
 if(!allowed())return '';
 if(!snapshot&&!loading&&online())queueMicrotask(refresh);
 return '<div class="mg-on-page" style="zoom:'+getScale()/100+'">'+currentHead()+scaleBar()+nav()+
 (error?'<p class="mg-on-error" role="alert">'+esc(error)+'</p>':'')+
 (!online()?'<p class="mg-on-offline">Sin conexión: esta sección solo permite registrar y cerrar turnos con internet.</p>':'')+
 (!snapshot?'<p role="status">Cargando pagos online autorizados…</p>':tab==='movimientos'?movements():summary())+
 '</div>';
}
async function action(name,args,notify){
 if(!writable())return;
 saving=true;error='';
 try{await rpc(name,args);editing=null;await rpcRefresh();if(notify)api.toast?.(notify);}
 catch(e){error=e.message||'No se pudo completar';api.render();}
 finally{saving=false;if(allowed()&&api?.S?.view==='cierre-online')api.render();}
}
async function rpcRefresh(){
 const current=local(),value=await rpc('gestlok_mg_online_state');if(current!==local())return;
 snapshot=value;error='';api.render();
}
function attach(h){
 if(api)return;
 api=h;
 document.addEventListener('click',e=>{
  if(!allowed())return;
  const size=e.target.closest('[data-mgon-scale]');
  if(size){changeScale(size.dataset.mgonScale==='up'?5:-5);return;}
  const jump=e.target.closest('[data-mgon-jump-history]');
  if(jump){document.querySelector('.mg-on-history-embedded')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const tabButton=e.target.closest('[data-mgon-tab]');
  if(tabButton){tab=tabButton.dataset.mgonTab;error='';api.render();return;}
  const cancel=e.target.closest('[data-mgon-cancel]');
  if(cancel){editing=null;api.render();return;}
  const clear=e.target.closest('[data-mgon-clear-filters]');
  if(clear){filter='';shiftFilter='todos';opened=null;api.render();return;}
  const detail=e.target.closest('[data-mgon-detail]');
  if(detail){opened=opened===detail.dataset.mgonDetail?null:detail.dataset.mgonDetail;api.render();return;}
  const edit=e.target.closest('[data-mgon-edit]');
  if(edit){editing=edit.dataset.mgonEdit;api.render();document.querySelector('#mg-online-form input[name="comanda"]')?.focus();return;}
  const remove=e.target.closest('[data-mgon-delete]');
  if(remove&&writable()&&window.confirm('¿Quitar esta comanda del turno abierto? El movimiento quedará en la auditoría.')){
    void action('gestlok_mg_online_delete',{p_shift:snapshot.active.id,p_id:remove.dataset.mgonDelete},'Movimiento eliminado.');return;}
  const toggle=e.target.closest('[data-mgon-app]');
  if(toggle&&writable()){
   const m=snapshot?.active?.movements?.find(x=>x.id===toggle.dataset.mgonApp);
   if(m)void action('gestlok_mg_online_save_note',{p_shift:snapshot.active.id,p_id:m.id,
     p_comanda:m.comanda,p_method:m.method,p_amount:m.amount,p_app:!m.app,p_observacion:m.observacion||''},'APP actualizado.');return;}
  const close=e.target.closest('[data-mgon-close]');
  if(close&&writable()&&window.confirm('¿Cerrar el turno '+shiftName(snapshot.active.turno)+'? Se guardará en el historial y se abrirá el siguiente turno.')){
   void action('gestlok_mg_online_close',{p_shift:snapshot.active.id},'Turno cerrado. Se abrió el siguiente.');tab='resumen';return;}
 });
 document.addEventListener('submit',e=>{
  if(e.target.id!=='mg-online-form'||!writable())return;
  e.preventDefault();const d=new FormData(e.target),comanda=String(d.get('comanda')||'').trim(),
   amount=Number(d.get('amount')),method=String(d.get('method')||''),app=d.has('app'),
   observacion=String(d.get('observacion')||'').trim();
  if(!/^[0-9]{1,10}$/.test(comanda)||!Number.isFinite(amount)||amount<=0||!(method in METHODS)||observacion.length>300){
    error='Completá una comanda numérica, un monto positivo y la forma de pago.';api.render();return;}
  void action('gestlok_mg_online_save_note',{p_shift:snapshot.active.id,p_id:editing,
   p_comanda:comanda,p_method:method,p_amount:amount,p_app:app,p_observacion:observacion},'Movimiento guardado.');
 });
 document.addEventListener('change',e=>{
  if(!allowed())return;
  if(e.target.id==='mg-on-date-filter'){filter=e.target.value;opened=null;api.render();}
  if(e.target.id==='mg-on-history-view'){viewMode=e.target.value==='turno'?'turno':'dia';opened=null;api.render();}
  if(e.target.id==='mg-on-turn-filter'){shiftFilter=['manana','tarde'].includes(e.target.value)?e.target.value:'todos';opened=null;api.render();}
 });
}
function subscribe(loc,push){
 if(!allowed()||!(loc in LOCALS))return;
 void refresh();
 const timer=setInterval(()=>{if(api?.S?.view==='cierre-online'&&!document.hidden&&!document.activeElement?.closest('#mg-online-form'))void refresh();},30000);
 const focus=()=>{if(api?.S?.view==='cierre-online')void refresh();};
 window.addEventListener('focus',focus);
 push(()=>{clearInterval(timer);window.removeEventListener('focus',focus);});
}
window.GestLokMiGustoOnline=Object.freeze({attach,view,subscribe,reset,permitido:allowed,_test:{date,shiftName,historyGroups,clampScale,getScale}});
})();