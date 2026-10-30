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
const shiftName=x=>x==='manana'?'Mañana':'Noche';
const todayArgentina=()=>new Intl.DateTimeFormat('es-AR',{
 timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric'
}).format(new Date());
const timeOf=x=>{const t=new Date(x);return x&&Number.isFinite(t.getTime())?
 new Intl.DateTimeFormat('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Argentina/Buenos_Aires'}).format(t):'—';};
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
let api=null, snapshot=null, tab='movimientos', error='', loading=false, saving=false, editing=null, opened=null, filter='', viewMode='dia', shiftFilter='todos', modalDay=null, modalTab='dia', uploading=null, photoUrls={}, photoError='', saveNotice=false, showAllMoves=false, gen=0;
const local=()=>api?.S?.local;
const allowed=()=>!!api&&api.S?.me?.tenant_id===TENANT&&local() in LOCALS &&
  (api.miRol()==='dueno'||(api.miRol()==='gerente'&&api.misLocales().includes(local())));
const online=()=>api&&!api.S?.offline&&navigator.onLine!==false;
const writable=()=>allowed()&&online()&&!saving;
function openForEntry(){tab='movimientos';editing=null;saveNotice=false;showAllMoves=false;error='';}
function reset(){++gen;snapshot=null;tab='movimientos';error='';loading=false;saving=false;editing=null;opened=null;filter='';viewMode='dia';shiftFilter='todos';modalDay=null;modalTab='dia';uploading=null;photoUrls={};photoError='';saveNotice=false;showAllMoves=false;}
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
 '<h2>Pagos Online</h2><p>Registro rápido de comandas por turno.</p></div>'+
 '<div class="mg-on-period"><span>Hoy en Argentina <strong>'+todayArgentina()+'</strong></span>'+
 '<span>Fecha del turno <strong>'+date(s?.day)+'</strong></span>'+
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
 return '<nav class="mg-on-tabs" aria-label="Secciones de Pagos Online">'+
 '<button type="button" data-mgon-tab="movimientos" aria-current="'+(tab==='movimientos'?'page':'false')+'">Cargar pedidos</button>'+
 '<button type="button" data-mgon-tab="resumen" aria-current="'+(tab==='resumen'?'page':'false')+'">Resumen</button>'+
 '<button type="button" data-mgon-tab="historial" aria-current="'+(tab==='historial'?'page':'false')+'">Historial</button></nav>';
}
function movementList(){
 const all=[...(snapshot?.active?.movements||[])].reverse();
 const rows=showAllMoves?all:all.slice(0,6);
 const heading='<header class="mg-on-recent-head"><div class="mg-on-recent-title"><span class="mg-on-recent-icon" aria-hidden="true">☷</span><h3>Últimos movimientos</h3></div>'+
  '<span class="mg-on-recent-count">'+all.length+' '+(all.length===1?'comanda':'comandas')+'</span></header>';
 const tags='<div class="mg-on-recent-tags" aria-label="Datos del turno"><span>'+date(snapshot?.active?.day)+'</span><span>Turno '+esc(shiftName(snapshot?.active?.turno))+'</span><span>'+esc(LOCALS[local()]||'')+'</span></div>';
 if(!all.length)return '<section class="mg-on-recent" aria-label="Últimos movimientos">'+heading+tags+
   '<p class="mg-on-empty">Todavía no hay comandas cargadas en este turno.</p></section>';
 const method=r=>'<span class="mg-on-method"><span class="mg-on-method-mark mg-on-method-'+esc(r.method)+'" aria-hidden="true">'+
  esc(({transferencia:'T',getnet:'G',mercado_pago:'MP'})[r.method]||'•')+'</span>'+esc(METHODS[r.method]||r.method)+'</span>';
 const appControl=r=>'<button type="button" class="mg-on-switch" role="switch" aria-label="APP de comanda '+esc(r.comanda)+
   '" aria-checked="'+!!r.app+'" data-mgon-app="'+esc(r.id)+'" '+(!writable()?'disabled':'')+'><span></span><b>'+(r.app?'APP':'—')+'</b></button>';
 const actions=r=>'<div class="mg-on-rowbuttons"><button type="button" data-mgon-edit="'+esc(r.id)+'" '+(!writable()?'disabled':'')+'>Editar</button>'+
   '<button type="button" class="mg-on-danger" data-mgon-delete="'+esc(r.id)+'" '+(!writable()?'disabled':'')+'>Quitar</button></div>';
 const desktop='<div class="mg-on-recent-desktop"><div class="mg-on-tablewrap"><table><thead><tr>'+
  '<th>Hora</th><th>Comanda</th><th>Monto</th><th>Forma de pago</th><th>APP</th><th>Acciones</th></tr></thead><tbody>'+
  rows.map(r=>'<tr><td>'+timeOf(r.created_at)+'</td><td><strong>#'+esc(r.comanda)+'</strong>'+
   (r.observacion?'<span title="'+esc(r.observacion)+'" class="mg-on-recent-note">'+esc(r.observacion)+'</span>':'')+'</td>'+
   '<td><strong>'+cash(r.amount)+'</strong></td><td>'+method(r)+'</td><td>'+appControl(r)+'</td><td>'+actions(r)+'</td></tr>').join('')+
  '</tbody></table></div></div>';
 const mobile='<div class="mg-on-recent-mobile">'+rows.map(r=>'<article class="mg-on-recent-card">'+
  '<div class="mg-on-recent-card-top"><div><small>'+timeOf(r.created_at)+' · Comanda #'+esc(r.comanda)+'</small>'+
  '<strong>'+cash(r.amount)+'</strong></div>'+appControl(r)+'</div>'+
  '<div class="mg-on-recent-card-method">'+method(r)+'</div>'+
  (r.observacion?'<p class="mg-on-recent-card-note">'+esc(r.observacion)+'</p>':'')+actions(r)+'</article>').join('')+'</div>';
 return '<section class="mg-on-recent" aria-label="Últimos movimientos">'+heading+tags+desktop+mobile+
 (all.length>6?'<button type="button" class="mg-on-more" data-mgon-recent-all aria-expanded="'+showAllMoves+'">'+
 (showAllMoves?'Mostrar solo los últimos 6':'Ver los '+all.length+' movimientos del turno')+'</button>':'')+'</section>';
}
function entry(){
 const s=snapshot?.active,r=(s?.movements||[]).find(x=>x.id===editing);
 return '<form id="mg-online-form" class="mg-on-entry"><div class="mg-on-entry-head"><span class="mg-on-entry-icon" aria-hidden="true">▤</span>'+
  '<h3>'+(r?'Editar comanda':'Cargar pedido')+'</h3></div>'+
 '<div class="mg-on-fields"><label>Número de comanda<input type="text" inputmode="numeric" pattern="[0-9]{1,10}" name="comanda" maxlength="10" value="'+esc(r?.comanda||'')+'" placeholder="Ej. 36" required></label>'+
 '<label>Monto ($)<input type="number" inputmode="decimal" name="amount" min="0.01" max="99999999999" step="0.01" value="'+esc(r?.amount||'')+'" placeholder="0,00" required></label>'+
 '<label>Forma de pago<select name="method">'+Object.entries(METHODS).map(([k,v])=>'<option value="'+k+'" '+((r?.method||'transferencia')===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
 '<label class="mg-on-check"><input type="checkbox" name="app" '+(r?.app?'checked':'')+'><span>APP <small>Descontar de Online Local</small></span></label></div>'+
 '<details class="mg-on-observation-details" '+(r?.observacion?'open':'')+'><summary>Agregar observación <small>(opcional)</small></summary>'+
 '<label class="mg-on-observation">Detalle de la observación <small>(máximo 300 caracteres)</small>'+
 '<textarea name="observacion" maxlength="300" rows="2" placeholder="Ej. El cliente retiró más tarde">'+esc(r?.observacion||'')+'</textarea></label></details>'+
 '<div class="mg-on-actions mg-on-save-actions"><button class="mg-on-primary mg-on-save" type="submit" '+(!writable()?'disabled':'')+'>'+
  '<span aria-hidden="true">✓</span> '+(r?'Guardar cambios':'Guardar movimiento')+'</button>'+
 (r?'<button type="button" data-mgon-cancel>Cancelar edición</button>':'')+'</div></form>';
}
function movements(){
 return '<div class="mg-on-section">'+entry()+(saveNotice?'<div class="mg-on-success" role="status" aria-live="polite"><span aria-hidden="true">✓</span><div><strong>¡Movimiento guardado correctamente!</strong><small>La comanda ya figura en los movimientos del turno.</small></div></div>':'')+
  movementList()+'</div>'+status()+
 '<div class="mg-on-close"><p>Al cerrar el turno, los movimientos quedan guardados en el historial y se abre automáticamente el turno siguiente.</p>'+
 '<button type="button" data-mgon-close '+(!writable()?'disabled':'')+'>Cerrar turno →</button></div>';
}
function photoControl(s){
 if(!s||s.status!=='cerrado')return '';
 if(s.photo_path)return '<button type="button" class="mg-on-photo-btn" data-mgon-view-photo="'+esc(s.id)+'">📷 Ver foto del cierre</button>';
 return '<label class="mg-on-photo-upload '+(uploading===s.id?'mg-on-busy':'')+'">📷 '+(uploading===s.id?'Subiendo foto…':'Subir foto')+
  '<input type="file" data-mgon-photo="'+esc(s.id)+'" accept="image/*" capture="environment" '+(!online()||uploading?'disabled':'')+'></label>';
}
async function compressPhoto(file){
 if(!file||!file.type.startsWith('image/')||file.size>15*1024*1024)throw Error('Elegí una imagen de hasta 15 MB.');
 const bmp=await createImageBitmap(file);
 const max=1500,factor=Math.min(1,max/Math.max(bmp.width,bmp.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bmp.width*factor);canvas.height=Math.round(bmp.height*factor);
 const ctx=canvas.getContext('2d');
 if(!ctx)throw Error('No se pudo preparar la imagen.');
 ctx.drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close?.();
 const exportBlob=q=>new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',q));
 let blob=await exportBlob(.79);
 if(blob?.size>2800000)blob=await exportBlob(.57);
 if(!blob||!blob.size||blob.size>3000000)throw Error('La foto es demasiado grande. Probá con otra.');
 return new File([blob],'cierre.jpg',{type:'image/jpeg'});
}
async function photoRequest(body){
 const result=await window.GestLokSupabase.functions.invoke('mg-online-closure-photo',{body});
 if(result.error)throw Error(result.data?.error||'No pudimos procesar la fotografía. Revisá tu conexión.');
 if(result.data?.error)throw Error(result.data.error);
 return result.data;
}
async function uploadPhoto(id,file){
 if(!writable()||uploading||!file)return;
 const shift=[snapshot?.active,...(snapshot?.history||[])].find(x=>x?.id===id&&x.status==='cerrado');
 if(!shift)return;
 uploading=id;photoError='';api.render();
 try{
  const jpg=await compressPhoto(file);
  const form=new FormData();form.set('action','upload');form.set('local',local());form.set('shift_id',id);form.set('photo',jpg);
  const result=await photoRequest(form);
  if(!result?.ok)throw Error('No se pudo completar la carga.');
  modalDay=shift.day;modalTab=shift.turno;
  await rpcRefresh();
  api.toast?.('Foto asociada al cierre de '+shiftName(shift.turno)+'.');
 }catch(e){photoError=e.message||'No se pudo subir la foto';api.render();}
 finally{uploading=null;api.render();}
}
async function showPhoto(id){
 if(!allowed()||!online())return;
 if(photoUrls[id]){photoUrls[id]=null;api.render();return;}
 try{
  const data=await photoRequest({action:'get',local:local(),shift_id:id});
  photoUrls[id]=data.signedUrl;photoError='';api.render();
 }catch(e){photoError=e.message||'No se pudo abrir la foto';api.render();}
}
function shiftCard(s,turnoHint='tarde'){
 if(!s)return '<article class="mg-on-shift"><header><h3>'+esc(shiftName(turnoHint))+'</h3><span class="mg-on-pending">Próximo turno</span></header><p class="mg-on-empty">Sin movimientos. Este turno todavía no tiene registros guardados.</p></article>';
 return '<article class="mg-on-shift"><header><h3>'+esc(shiftName(s.turno))+'</h3><span class="'+(s.status==='cerrado'?'mg-on-closed':'mg-on-open')+'">'+(s.status==='cerrado'?'✓ Cerrado':'● Abierto')+'</span></header>'+
 [['transferencia','Transferencia'],['getnet','Getnet'],['mercado_pago','Mercado Pago'],['total_app','Total APP'],['total_ventas','Total ventas'],['online_local','Online Local']].map(([key,label])=>
 '<div class="mg-on-shift-row '+(key==='online_local'?'mg-on-local':'')+'"><span>'+label+'</span><strong>'+cash(s[key])+'</strong></div>').join('')+
 '<small>'+Number(s.comandas||0)+' comandas registradas</small>'+photoControl(s)+'</article>';
}
function summary(){
 const curr=snapshot?.active, all=[curr,...(snapshot?.history||[])].filter(Boolean).filter(s=>s.day===curr?.day);
 const morning=all.find(s=>s.turno==='manana'),afternoon=all.find(s=>s.turno==='tarde');
 const total=Number(morning?.total_ventas||0)+Number(afternoon?.total_ventas||0);
 const onlineLocal=Number(morning?.online_local||0)+Number(afternoon?.online_local||0);
 return '<section class="mg-on-dashboard"><h3>Resumen diario · '+date(curr?.day)+'</h3>'+
 '<div class="mg-on-hero"><div><span>Total ventas del día</span><strong>'+cash(total)+'</strong></div><div><span>Online Local</span><strong>'+cash(onlineLocal)+'</strong></div></div>'+
 '<div class="mg-on-shifts">'+shiftCard(morning,'manana')+shiftCard(afternoon,'tarde')+'</div>'+
 '<p class="mg-on-note">Total APP = suma de comandas con APP activado. Online Local = Total ventas − Total APP.</p>'+
 '<div class="mg-on-actions"><button type="button" data-mgon-tab="movimientos" class="mg-on-primary">Cargar comandas</button>'+
 '<button type="button" data-mgon-jump-history>Ver historial</button></div></section>';
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
 return '<article class="mg-on-history-day mg-on-day-row"><div class="mg-on-day-info">'+
  '<strong>'+date(d.day)+'</strong>'+
  '<small>'+d.shifts.length+' de 2 turnos cerrados · '+d.comandas+' comandas</small></div>'+
  '<div class="mg-on-day-amount"><small>Total ventas</small><strong>'+cash(d.total_ventas)+'</strong></div>'+
  '<div class="mg-on-day-amount"><small>Online Local</small><strong>'+cash(d.online_local)+'</strong></div>'+
  '<button type="button" class="mg-on-day-open" data-mgon-open-day="'+esc(d.day)+'">Ver detalle</button></article>';
}
function reportTurn(s,turno){
 if(!s)return '<div class="mg-on-report-turn"><h3>'+esc(shiftName(turno))+'</h3><p class="mg-on-empty">Sin cierre registrado para este turno.</p></div>';
 return '<section class="mg-on-report-turn"><header><h3>'+esc(shiftName(turno))+'</h3>'+
 '<span class="mg-on-closed">✓ Cerrado</span></header>'+
 historyTotals(s)+
 '<h4>Movimientos individuales</h4>'+
 '<div class="mg-on-tablewrap"><table><thead><tr><th>Comanda</th><th>Pago</th><th>Monto</th><th>APP</th><th>Observaciones</th></tr></thead><tbody>'+
 (s.movements||[]).map(m=>'<tr><td>#'+esc(m.comanda)+'</td><td>'+esc(METHODS[m.method]||m.method)+'</td>'+
 '<td>'+cash(m.amount)+'</td><td>'+(m.app?'Sí':'No')+'</td><td class="mg-on-observation-cell">'+esc(m.observacion||'—')+'</td></tr>').join('')+
 '</tbody></table></div><div class="mg-on-photo-area">'+photoControl(s)+
 (photoUrls[s.id]?'<div class="mg-on-photo-preview"><img alt="Foto del cierre '+esc(shiftName(s.turno))+'" src="'+esc(photoUrls[s.id])+'"></div>':'')+
 '</div></section>';
}
function historyModal(){
 if(!modalDay)return '';
 const d=historyGroups(snapshot?.history||[]).find(x=>x.day===modalDay);
 if(!d)return '';
 const morning=d.shifts.find(x=>x.turno==='manana');
 const night=d.shifts.find(x=>x.turno==='tarde');
 const tabs=[['dia','Día Completo'],['manana','Mañana'],['tarde','Noche']];
 return '<div class="mg-on-modal-backdrop" data-mgon-modal-backdrop>'+
 '<section role="dialog" aria-modal="true" aria-labelledby="mg-on-modal-title" class="mg-on-modal">'+
 '<header class="mg-on-modal-header"><div><small>MI GUSTO · '+esc(LOCALS[local()]||'')+'</small>'+
 '<h2 id="mg-on-modal-title">Reporte del '+date(d.day)+'</h2>'+
 '<p>Detalle de pagos y evidencias del día seleccionado.</p></div>'+
 '<button type="button" data-mgon-modal-close aria-label="Cerrar reporte" class="mg-on-modal-close">×</button></header>'+
 '<nav class="mg-on-modal-tabs" aria-label="Ver el reporte">'+tabs.map(([key,label])=>
 '<button type="button" data-mgon-modal-tab="'+key+'" aria-current="'+(modalTab===key?'page':'false')+'">'+label+'</button>').join('')+'</nav>'+
 '<div class="mg-on-modal-content">'+(photoError?'<p role="alert" class="mg-on-error">'+esc(photoError)+'</p>':'')+
 (modalTab==='dia'?'<section class="mg-on-day-total"><h3>Día Completo</h3>'+historyTotals(d)+'</section>'+
 reportTurn(morning,'manana')+reportTurn(night,'tarde'):
 reportTurn(modalTab==='manana'?morning:night,modalTab))+'</div></section></div>';
}
function history(){
 const rows=(snapshot?.history||[]).filter(s=>!filter||s.day===filter);
 const days=historyGroups(rows);
 return '<section class="mg-on-history-embedded" id="mg-on-history"><header><h3>Historial por día</h3>'+
 '<p>Elegí una fecha para abrir el reporte completo, separado en Mañana, Noche y Día Completo.</p></header>'+
 '<div class="mg-on-history-filters"><label>Buscar fecha<input id="mg-on-date-filter" type="date" value="'+esc(filter)+'"></label>'+
 '<button type="button" data-mgon-clear-filters>Ver todos los días</button></div>'+
 (days.length?'<div class="mg-on-history-list">'+days.map(dayHistoryCard).join('')+'</div>':
 '<p class="mg-on-empty">Todavía no hay cierres con ese filtro.</p>')+'</section>';
}
function view(){
 if(!allowed())return '';
 if(!snapshot&&!loading&&!error&&online())queueMicrotask(refresh);
 return '<div class="mg-on-page" style="zoom:'+getScale()/100+'">'+currentHead()+
  '<div class="mg-on-workbar">'+nav()+scaleBar()+'</div>'+
 (error?'<p class="mg-on-error" role="alert">'+esc(error)+'</p>':'')+
 (!online()?'<p class="mg-on-offline">Sin conexión: esta sección solo permite registrar y cerrar turnos con internet.</p>':'')+
 (!snapshot?'<p role="status">Cargando pagos online autorizados…</p>':tab==='movimientos'?movements():tab==='historial'?history():summary())+historyModal()+
 '</div>';
}
async function action(name,args,notify){
 if(!writable())return;
 saving=true;error='';saveNotice=false;
 try{const result=await rpc(name,args);editing=null;
  if(name==='gestlok_mg_online_close'&&result?.closed){modalDay=result.closed.day;modalTab=result.closed.turno;photoError='';}
  await rpcRefresh();saveNotice=notify==='Movimiento guardado.';if(notify)api.toast?.(notify);}
 catch(e){error=e.message||'No se pudo completar';api.render();}
 finally{
  saving=false;
  if(allowed()&&api?.S?.view==='cierre-online'){
   api.render();
   // En PC, después de guardar una comanda, dejar listo el siguiente número.
   if(saveNotice&&tab==='movimientos'&&window.matchMedia?.('(pointer:fine)').matches)
    document.querySelector('#mg-online-form input[name="comanda"]')?.focus({preventScroll:true});
  }
 }
}
async function rpcRefresh(){
 const current=local(),value=await rpc('gestlok_mg_online_state');if(current!==local())return;
 snapshot=value;error='';api.render();
}
function attach(h){
 if(api)return;
 api=h;
 document.addEventListener('click',e=>{
  // Al volver a ingresar desde el menú, la pantalla principal siempre es Cargar pedidos.
  if(e.target.closest?.('[data-go="cierre-online"]'))openForEntry();
  if(!allowed())return;
  const size=e.target.closest('[data-mgon-scale]');
  if(size){changeScale(size.dataset.mgonScale==='up'?5:-5);return;}
  const jump=e.target.closest('[data-mgon-jump-history]');
  if(jump){tab='historial';api.render();document.querySelector('.mg-on-history-embedded')?.scrollIntoView({block:'start'});return;}
  const tabButton=e.target.closest('[data-mgon-tab]');
  if(tabButton){tab=tabButton.dataset.mgonTab;error='';saveNotice=false;api.render();return;}
  const recentAll=e.target.closest('[data-mgon-recent-all]');
  if(recentAll){showAllMoves=!showAllMoves;api.render();return;}
  const cancel=e.target.closest('[data-mgon-cancel]');
  if(cancel){editing=null;api.render();return;}
  const clear=e.target.closest('[data-mgon-clear-filters]');
  if(clear){filter='';shiftFilter='todos';opened=null;api.render();return;}
  const day=e.target.closest('[data-mgon-open-day]');
  if(day){modalDay=day.dataset.mgonOpenDay;modalTab='dia';photoError='';api.render();document.querySelector('[data-mgon-modal-close]')?.focus();return;}
  if(e.target.closest('[data-mgon-modal-close]')||e.target.hasAttribute?.('data-mgon-modal-backdrop')){
   const prior=modalDay;modalDay=null;photoError='';api.render();document.querySelector('[data-mgon-open-day="'+prior+'"]')?.focus();return;}
  const modalTabButton=e.target.closest('[data-mgon-modal-tab]');
  if(modalTabButton){modalTab=modalTabButton.dataset.mgonModalTab;photoError='';api.render();return;}
  const photoView=e.target.closest('[data-mgon-view-photo]');
  if(photoView){
   const id=photoView.dataset.mgonViewPhoto;
   const shift=[snapshot?.active,...(snapshot?.history||[])].find(x=>x?.id===id);
   if(shift&&!modalDay){modalDay=shift.day;modalTab=shift.turno;}
   void showPhoto(id);return;
  }
  const detail=e.target.closest('[data-mgon-detail]');
  if(detail){opened=opened===detail.dataset.mgonDetail?null:detail.dataset.mgonDetail;api.render();return;}
  const edit=e.target.closest('[data-mgon-edit]');
  if(edit){editing=edit.dataset.mgonEdit;saveNotice=false;api.render();document.querySelector('#mg-online-form input[name="comanda"]')?.focus();return;}
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
   void action('gestlok_mg_online_close',{p_shift:snapshot.active.id},'Turno cerrado. Se abrió el siguiente.');tab='movimientos';showAllMoves=false;return;}
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
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&modalDay){modalDay=null;photoError='';api.render();}
 });
 document.addEventListener('change',e=>{
  if(!allowed())return;
  if(e.target.matches?.('[data-mgon-photo]')){const file=e.target.files?.[0];if(file)void uploadPhoto(e.target.dataset.mgonPhoto,file);return;}
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
window.GestLokMiGustoOnline=Object.freeze({attach,view,subscribe,reset,openForEntry,permitido:allowed,_test:{date,shiftName,historyGroups,clampScale,getScale,todayArgentina,timeOf}});
})();