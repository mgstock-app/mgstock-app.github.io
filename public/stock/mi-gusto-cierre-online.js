/* Mi Gusto · Cierre Online / Munro y Torcuato. Backend privado: RPC autorizadas.
   No reemplaza ni modifica los Excel preexistentes. */
(()=>{
'use strict';
const TENANT='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const LOCALS={munro:'Munro',torcuato:'Don Torcuato'};
const METHODS={transferencia:'Transferencia',getnet:'Getnet',mercado_pago:'Mercado Pago',efectivo:'Efectivo'};
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
let api=null, snapshot=null, tab='movimientos', error='', loading=false, saving=false, editing=null, opened=null, filter='', viewMode='dia', shiftFilter='todos', modalDay=null, modalTab='dia', uploading=null, choosingPhoto=false, photoUrls={}, photoError='', saveNotice=false, showAllMoves=false, gen=0;
const local=()=>api?.S?.local;
const allowed=()=>!!api&&api.S?.me?.tenant_id===TENANT&&local() in LOCALS &&
  !window.GestLokCreatorSupport?.previewRol?.() &&
  (api.miRol()==='dueno'||(api.miRol()==='gerente'&&api.misLocales().includes(local()))||
   (api.miRol()==='creadora'&&!api.S?.ro));
const online=()=>api&&!api.S?.offline&&navigator.onLine!==false;
const writable=()=>allowed()&&online()&&!saving;
function openForEntry(){tab='movimientos';editing=null;saveNotice=false;showAllMoves=false;error='';}
function reset(){++gen;snapshot=null;tab='movimientos';error='';loading=false;saving=false;editing=null;opened=null;filter='';viewMode='dia';shiftFilter='todos';modalDay=null;modalTab='dia';uploading=null;choosingPhoto=false;photoUrls={};photoError='';saveNotice=false;showAllMoves=false;}
async function rpc(name,args={}){
 if(!allowed())throw Error('Sin autorización para el local');
 if(!online())throw Error('Sin conexión. Guardar y cerrar turnos requiere internet.');
 const a=await window.GestLokSupabase.rpc(name,{p_local:local(),...args});
 if(a.error)throw Error(a.error.message||'No se pudo guardar el cambio');
 return a.data;
}
async function refresh(){
 if(!allowed()||loading||saving||uploading||choosingPhoto||!online())return;
 const loc=local(),token=gen;
 loading=true;
 try{const value=await rpc('gestlok_mg_online_state');
   if(loc!==local()||token!==gen)return;
   // Un estado vacío sin error no debe disparar un ciclo infinito de recargas.
   if(!value||typeof value!=='object'||!value.active||!Array.isArray(value.history))
     throw Error('No recibimos datos válidos de Pagos Online. Volvé a ingresar para reintentar.');
   snapshot=value;error='';
 }catch(e){if(token===gen&&!choosingPhoto&&!uploading)error=e.message||'No pudimos consultar los cierres';}
 finally{loading=false;if(token===gen&&!choosingPhoto&&!uploading&&api?.S?.view==='cierre-online')api.render();}
}
function status(){
 const s=snapshot?.active;
 return '<div class="mg-on-summary">'+
 ['transferencia','getnet','mercado_pago','efectivo','total_app','total_ventas','online_local'].map((key,i)=>
  '<div class="mg-on-summary-item '+(key==='online_local'?'mg-on-local':key==='total_ventas'?'mg-on-total':'')+'"><span>'+esc({
 transferencia:'Transferencia',getnet:'Getnet',mercado_pago:'Mercado Pago',efectivo:'Efectivo',total_app:'Total APP',
 total_ventas:'Total ventas online',online_local:'Online Local'}[key])+'</span><strong>'+cash(s?.[key]||0)+'</strong></div>').join('')+'</div><p class="mg-on-online-help">Online Local = Transferencia + Getnet + Mercado Pago − APP. El efectivo se controla aparte.</p>';
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
  esc(({transferencia:'T',getnet:'G',mercado_pago:'MP',efectivo:'E'})[r.method]||'•')+'</span>'+esc(METHODS[r.method]||r.method)+'</span>';
 const appControl=r=>'<button type="button" class="mg-on-switch" role="switch" aria-label="APP de comanda '+esc(r.comanda)+
   '" aria-checked="'+!!r.app+'" data-mgon-app="'+esc(r.id)+'" '+(!writable()?'disabled':'')+'><span></span><b>APP</b></button>';
 const actions=r=>'<div class="mg-on-rowbuttons"><button type="button" data-mgon-edit="'+esc(r.id)+'" '+(!writable()?'disabled':'')+'>Editar</button>'+
   '<button type="button" class="mg-on-danger" data-mgon-delete="'+esc(r.id)+'" '+(!writable()?'disabled':'')+'>Quitar</button></div>';
 const card=r=>'<article class="mg-on-recent-card '+(r.method==='efectivo'?'mg-on-cash-row':'')+'">'+
  '<div class="mg-on-recent-row-main">'+
  '<strong class="mg-on-recent-order" aria-label="Comanda número '+esc(r.comanda)+'">#'+esc(r.comanda)+'</strong>'+
  '<div class="mg-on-recent-amount"><strong>'+cash(r.amount)+'</strong>'+
   (r.method==='efectivo'?'<small class="mg-on-cash-detail">Bruto '+cash(r.gross_amount??r.amount)+' · 10% OFF '+cash(r.discount_amount||0)+'</small>':'')+'</div>'+
  '<div class="mg-on-recent-app">'+appControl(r)+'</div>'+
  '<div class="mg-on-recent-meta"><span class="mg-on-recent-time">'+timeOf(r.created_at)+'</span>'+method(r)+'</div>'+
  '<div class="mg-on-recent-commands">'+actions(r)+'</div></div>'+
  (r.observacion?'<p class="mg-on-recent-card-note"><span>Observación: </span>'+esc(r.observacion)+'</p>':'')+
  '</article>';
 const desktop='<div class="mg-on-recent-desktop"><div class="mg-on-recent-stack">'+rows.map(card).join('')+'</div></div>';
 const mobile='<div class="mg-on-recent-mobile">'+rows.map(card).join('')+'</div>';
 return '<section class="mg-on-recent" aria-label="Últimos movimientos">'+heading+tags+desktop+mobile+
 (all.length>6?'<button type="button" class="mg-on-more" data-mgon-recent-all aria-expanded="'+showAllMoves+'">'+
 (showAllMoves?'Mostrar solo los últimos 6':'Ver los '+all.length+' movimientos del turno')+'</button>':'')+'</section>';
}
function cashMovementDetail(s=snapshot?.active){
 const closed=s?.status==='cerrado';
 const rows=[...(s?.movements||[])].filter(r=>r.method==='efectivo').reverse();
 const total=rows.reduce((v,r)=>v+(Number(r.amount)||0),0);
 if(closed&&!rows.length)return '';
 const title='<header class="mg-on-cash-head"><div><h3>Detalle de efectivo del turno</h3><p>'+date(s?.day)+' · Turno '+esc(shiftName(s?.turno))+' · '+esc(LOCALS[local()]||'')+(closed?' · Cerrado':'')+'</p></div><div class="mg-on-cash-total"><span>Total efectivo</span><strong>'+cash(total)+'</strong><small>'+rows.length+' movimientos</small></div></header>';
 if(!rows.length)return '<section class="mg-on-cash-detail-section">'+title+'<p class="mg-on-empty">Todavía no se registraron pagos en efectivo en este turno.</p></section>';
 const table='<div class="mg-on-cash-scroll" tabindex="0" aria-label="Detalle de pagos en efectivo"><table><thead><tr><th scope="col">OK</th><th scope="col">Comanda</th><th scope="col">Hora</th><th scope="col">Importe bruto</th><th scope="col">Descuento</th><th scope="col">Efectivo cobrado</th><th scope="col">Observación</th></tr></thead><tbody>'+
 rows.map(r=>'<tr class="'+(r.ok?'mg-on-cash-reviewed':'')+'"><td><label class="mg-on-ok-label"><input type="checkbox" data-mgon-cash-ok="'+esc(r.id)+'" '+(r.ok?'checked':'')+' '+(closed||!writable()?'disabled':'')+' aria-label="OK comanda '+esc(r.comanda)+'"><span>OK</span></label></td><td><strong>#'+esc(r.comanda)+'</strong></td><td>'+timeOf(r.created_at)+'</td><td>'+cash(r.gross_amount??r.amount)+'</td><td>'+cash(r.discount_amount||0)+'</td><td><strong>'+cash(r.amount)+'</strong></td><td>'+esc(r.observacion||'—')+'</td></tr>').join('')+
 '</tbody><tfoot><tr><td colspan="5">TOTAL EFECTIVO DEL TURNO</td><td>'+cash(total)+'</td><td>'+rows.length+' movimientos · '+rows.filter(r=>r.ok).length+' OK</td></tr></tfoot></table></div>';
 return '<section class="mg-on-cash-detail-section'+(closed?' mg-on-cash-history':'')+'" aria-label="Detalle de efectivo del turno">'+title+table+'</section>';
}
function parseAmountInput(value){const raw=String(value??'').trim().replace(/\s/g,'');if(!/^\d{1,11}(?:\.\d{3})*(?:,\d{0,2})?$/.test(raw)&&!/^\d{1,11}(?:,\d{0,2})?$/.test(raw))return NaN;return Number(raw.replace(/\./g,'').replace(',','.'));}
function formatAmountInput(value){const n=Number(value);return Number.isFinite(n)?n.toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:2}):'';}
function formatAmountTyping(value){const cleaned=String(value??'').replace(/[^0-9,]/g,'');const comma=cleaned.indexOf(',');const integer=(comma<0?cleaned:cleaned.slice(0,comma)).slice(0,11);const cents=comma<0?'':','+cleaned.slice(comma+1).replace(/,/g,'').slice(0,2);return integer.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+cents;}
function updateCashPreview(){const f=document.querySelector('#mg-online-form');if(!f)return;const out=f.querySelector('#mg-on-cash-preview');if(!out)return;const gross=parseAmountInput(f.elements.amount?.value||'');if(f.elements.method?.value!=='efectivo'||!Number.isFinite(gross)||gross<=0){out.textContent='';out.hidden=true;return;}const discount=Math.round(gross*10)/100;out.hidden=false;out.textContent='Total a cobrar: '+cash(gross-discount);}
function entry(){
 const s=snapshot?.active,r=(s?.movements||[]).find(x=>x.id===editing);
 return '<form id="mg-online-form" class="mg-on-entry" autocomplete="off"><div class="mg-on-entry-head"><span class="mg-on-entry-icon" aria-hidden="true">▤</span>'+
  '<h3>'+(r?'Editar comanda':'Cargar pedido')+'</h3></div>'+
 '<div class="mg-on-fields"><label>Número de comanda<input type="text" inputmode="numeric" pattern="[0-9]{1,10}" name="comanda" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="10" value="'+esc(r?.comanda||'')+'" placeholder="Ej. 36" required></label>'+
 '<label>Monto ($)<input type="text" inputmode="decimal" name="amount" autocomplete="off" maxlength="18" value="'+esc(r?.gross_amount!=null?formatAmountInput(r.gross_amount):'')+'" placeholder="0,00" required></label>'+
 '<label>Forma de pago<select name="method">'+Object.entries(METHODS).map(([k,v])=>'<option value="'+k+'" '+((r?.method||'transferencia')===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
 '<label class="mg-on-check"><input type="checkbox" name="app" '+(r?.app?'checked':'')+'><span>APP <small>Descontar de Online Local</small></span></label></div>'+
 '<p class="mg-on-cash-preview" id="mg-on-cash-preview" aria-live="polite"></p>'+ '<details class="mg-on-observation-details" '+(r?.observacion?'open':'')+'><summary>Agregar observación <small>(opcional)</small></summary>'+
 '<label class="mg-on-observation">Detalle de la observación <small>(máximo 300 caracteres)</small>'+
 '<textarea name="observacion" maxlength="300" autocomplete="off" rows="2" placeholder="Ej. El cliente retiró más tarde">'+esc(r?.observacion||'')+'</textarea></label></details>'+
 '<div class="mg-on-actions mg-on-save-actions"><button class="mg-on-primary mg-on-save" type="submit" '+(!writable()?'disabled':'')+'>'+
  '<span aria-hidden="true">✓</span> '+(r?'Guardar cambios':'Guardar movimiento')+'</button>'+
 (r?'<button type="button" data-mgon-cancel>Cancelar edición</button>':'')+'</div></form>';
}
function movements(){
 const s=snapshot?.active;
 return '<div class="mg-on-section">'+entry()+(saveNotice?'<div class="mg-on-success" role="status" aria-live="polite"><span aria-hidden="true">✓</span><div><strong>¡Movimiento guardado correctamente!</strong><small>La comanda ya figura en los movimientos del turno.</small></div></div>':'')+
  movementList()+'</div>'+status()+
 '<div class="mg-on-close"><div class="mg-on-close-copy"><p>Al cerrar el turno, los movimientos quedan guardados en el historial y se abre automáticamente el turno siguiente.</p>'+
 '<p class="mg-on-photo-reminder '+(s?.photo_path?'mg-on-photo-ready':'')+'" role="status">'+(s?.photo_path?'✓ Foto cargada. Ya podés cerrar el turno.':'📷 Antes de cerrar el turno, el gerente debe subir la foto. El cierre se habilitará cuando termine la carga.')+'</p></div>'+
 (photoError?'<p role="alert" class="mg-on-error">'+esc(photoError)+'</p>':'')+
 '<div class="mg-on-close-controls">'+'<button type="button" class="mg-on-close-primary" data-mgon-close '+(!writable()||!s?.photo_path?'disabled':'')+'>Cerrar turno →</button>'+photoControl(s)+'</div></div>'+cashMovementDetail();
}
const cameraIcon='<svg class="mg-on-camera" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/></svg>';
function photoControl(s){
 if(!s)return '';
 return '<div class="mg-on-photo-area"><label class="mg-on-photo-upload">'+cameraIcon+' '+(uploading===s.id?'Subiendo foto…':'Elegir foto de galería')+
 '<input type="file" data-mgon-photo="'+esc(s.id)+'" accept="image/*" '+(!allowed()||!online()||uploading?'disabled':'')+'></label>'+
 '<label class="mg-on-photo-upload">'+cameraIcon+' Sacar foto'+
 '<input type="file" data-mgon-photo="'+esc(s.id)+'" accept="image/*" capture="environment" '+(!allowed()||!online()||uploading?'disabled':'')+'></label>'+
 '<button type="button" data-mgon-view-photo="'+esc(s.id)+'">Ver fotos del turno</button>'+
 (photoUrls[s.id]?'<div class="mg-on-photo-preview">'+photoUrls[s.id].map((url,i)=>'<img alt="Foto '+(i+1)+' del cierre" src="'+esc(url)+'">').join('')+'</div>':'')+
 '<label>Observaciones del cierre (opcional)<textarea data-mgon-close-note="'+esc(s.id)+'" maxlength="2000" rows="2" placeholder="Escribí una observación">'+esc(s.cierre_observacion||'')+'</textarea></label>'+
 '<button type="button" data-mgon-save-note="'+esc(s.id)+'" '+(!writable()?'disabled':'')+'>Guardar observación</button></div>';
}
async function compressPhoto(file){
 if(!file||!file.type.startsWith('image/')||file.size>15*1024*1024)throw Error('Elegí una imagen de hasta 15 MB.');
 let bmp;
 try{if(typeof createImageBitmap==='function')bmp=await createImageBitmap(file);}catch{}
 if(!bmp){
  const url=URL.createObjectURL(file);
  try{
   bmp=await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(Error('No se pudo leer esta imagen. Probá tomar otra foto o elegir un JPG o PNG.'));
    img.src=url;
   });
  }finally{URL.revokeObjectURL(url);}
 }
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
 if(result.error){
  let message=result.data?.error;
  if(!message&&result.error.context?.json){
   try{message=(await result.error.context.json())?.error;}catch{}
  }
  throw Error(message||'No pudimos enviar la foto. Revisá tu conexión y volvé a intentar.');
 }
 if(result.data?.error)throw Error(result.data.error);
 return result.data;
}
async function uploadPhoto(id,file){
 if(!allowed()||!online()||saving||uploading||!file)return;
 choosingPhoto=false;
 const shift=[snapshot?.active,...(snapshot?.history||[])].find(x=>x?.id===id);
 if(!shift)return;
 uploading=id;photoError='';api.render();
 try{
  const jpg=await compressPhoto(file);
  const form=new FormData();form.set('action','upload');form.set('local',local());form.set('shift_id',id);form.set('photo',jpg);
  const result=await photoRequest(form);
  if(!result?.ok)throw Error('No se pudo completar la carga.');
  // La carga del turno activo no debe abrir un modal que tape «Cerrar turno».
  if(shift.status==='cerrado'&&modalDay){modalDay=shift.day;modalTab=shift.turno;}
  await rpcRefresh();
  const saved=[snapshot?.active,...(snapshot?.history||[])].find(x=>x?.id===id);
  if(!saved?.photo_path)throw Error('La foto se recibió, pero no figura guardada en este turno. Volvé a intentar.');
  api.toast?.('Foto guardada. '+(shift.status==='abierto'?'Ya podés cerrar el turno.':'Quedó asociada al cierre.'));
 }catch(e){photoError=e.message||'No se pudo subir la foto';api.toast?.(photoError);api.render();}
 finally{uploading=null;api.render();}
}
async function showPhoto(id){
 if(!allowed()||!online())return;
 if(photoUrls[id]){photoUrls[id]=null;api.render();return;}
 try{
  const photos=await rpc('gestlok_mg_online_photo_list',{p_shift:id});
  const data=await Promise.all(photos.map(p=>photoRequest({action:'get',local:local(),shift_id:id,path:p.path})));
  photoUrls[id]=data.map(x=>x.signedUrl);photoError='';api.render();
 }catch(e){photoError=e.message||'No se pudo abrir la foto';api.render();}
}
function shiftCard(s,turnoHint='tarde'){
 if(!s)return '<article class="mg-on-shift"><header><h3>'+esc(shiftName(turnoHint))+'</h3><span class="mg-on-pending">Próximo turno</span></header><p class="mg-on-empty">Sin movimientos. Este turno todavía no tiene registros guardados.</p></article>';
 return '<article class="mg-on-shift"><header><h3>'+esc(shiftName(s.turno))+'</h3><span class="'+(s.status==='cerrado'?'mg-on-closed':'mg-on-open')+'">'+(s.status==='cerrado'?'✓ Cerrado':'● Abierto')+'</span></header>'+
 [['transferencia','Transferencia'],['getnet','Getnet'],['mercado_pago','Mercado Pago'],['efectivo','Efectivo'],['total_app','Total APP'],['total_ventas','Total ventas online'],['online_local','Online Local']].map(([key,label])=>
 '<div class="mg-on-shift-row '+(key==='online_local'?'mg-on-local':'')+'"><span>'+label+'</span><strong>'+cash(s[key])+'</strong></div>').join('')+
 '<small>'+Number(s.comandas||0)+' comandas registradas</small>'+photoControl(s)+'</article>';
}
function summary(){
 const curr=snapshot?.active, all=[curr,...(snapshot?.history||[])].filter(Boolean).filter(s=>s.day===curr?.day);
 const morning=all.find(s=>s.turno==='manana'),afternoon=all.find(s=>s.turno==='tarde');
 const total=Number(morning?.total_ventas||0)+Number(afternoon?.total_ventas||0);
 const onlineLocal=Number(morning?.online_local||0)+Number(afternoon?.online_local||0);
 return '<section class="mg-on-dashboard"><h3>Resumen diario · '+date(curr?.day)+'</h3>'+
 '<div class="mg-on-hero"><div><span>Total ventas online del día</span><strong>'+cash(total)+'</strong></div><div><span>Online Local</span><strong>'+cash(onlineLocal)+'</strong></div></div>'+
 '<div class="mg-on-shifts">'+shiftCard(morning,'manana')+shiftCard(afternoon,'tarde')+'</div>'+
 '<p class="mg-on-note">Online Local = Transferencia + Getnet + Mercado Pago − APP. El efectivo se controla por separado y no se suma al online.</p>'+
 '<div class="mg-on-actions"><button type="button" data-mgon-tab="movimientos" class="mg-on-primary">Cargar comandas</button>'+
 '<button type="button" data-mgon-jump-history>Ver historial</button></div></section>';
}
function oldRows(s){
 return '<div class="mg-on-detail"><h4>Movimientos individuales · '+esc(shiftName(s.turno))+'</h4>'+
 '<div class="mg-on-tablewrap"><table><thead><tr><th>Comanda</th><th>Pago</th><th>Importe</th><th>APP</th><th>Observaciones</th></tr></thead><tbody>'+
 (s.movements||[]).map(m=>'<tr><td>#'+esc(m.comanda)+'</td><td>'+esc(METHODS[m.method]||m.method)+'</td><td>'+cash(m.amount)+'</td><td>'+(m.app?'Sí':'No')+'</td><td class="mg-on-observation-cell">'+esc(m.observacion||'—')+'</td></tr>').join('')+
 '</tbody></table></div>'+shiftCard(s)+cashMovementDetail(s)+'</div>';
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
   ['total_ventas','Total ventas online'],['total_app','Total APP'],['online_local','Online Local']].map(([key,label])=>
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
  '<div class="mg-on-day-amount"><small>Total ventas online</small><strong>'+cash(d.total_ventas)+'</strong></div>'+
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
 '</tbody></table></div><div class="mg-on-photo-area">'+photoControl(s)+'</div>'+cashMovementDetail(s)+'</section>';
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
// Vaciar el formulario de carga. Se usa solo después de que el servidor confirmó el guardado.
// Debe correr ANTES de redibujar: el preservador global de formularios (GestLokFormDraftGuard)
// copia lo escrito en el DOM y lo vuelve a poner en el formulario nuevo; por eso la comanda,
// el monto y la observación anteriores quedaban cargados después de guardar.
function clearEntryForm(){
 const form=document.querySelector('#mg-online-form');if(!form)return;
 window.GestLokFormDraftGuard?.saved?.(form);
 for(const name of ['comanda','amount','observacion']){const field=form.elements.namedItem(name);if(field)field.value='';}
 const method=form.elements.namedItem('method');if(method)method.value='transferencia';
 const app=form.elements.namedItem('app');if(app)app.checked=false;
 const details=form.querySelector('.mg-on-observation-details');if(details)details.open=false;
}
async function action(name,args,notify){
 if(!writable())return;
 saving=true;error='';saveNotice=false;
 try{const result=await rpc(name,args);if(name==='gestlok_mg_online_save_note')clearEntryForm();editing=null;
  if(name==='gestlok_mg_online_close'&&result?.closed){modalDay=result.closed.day;modalTab=result.closed.turno;photoError='';}
  await rpcRefresh();saveNotice=notify==='Movimiento guardado.';if(notify)api.toast?.(notify);}
 catch(e){error=e.message||'No se pudo completar';api.render();}
 finally{
  saving=false;
  if(allowed()&&api?.S?.view==='cierre-online'){
   api.render();
   // Red de seguridad: dejar el formulario vacío también después del último render.
   if(saveNotice&&tab==='movimientos')clearEntryForm();
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
 // Recalcular después de cada render: el guardado de borradores restaura el monto,
 // pero el aviso de efectivo debe reconstruirse sobre el formulario recién insertado.
 // Observar solo hijos directos de #view evita reaccionar al texto del aviso.
 const root=document.getElementById('view');
 if(root&&typeof MutationObserver!=='undefined'){
  new MutationObserver(()=>{if(api?.S?.view==='cierre-online')updateCashPreview();}).observe(root,{childList:true});
 }
 document.addEventListener('click',e=>{
  // Evitar que una actualización del estado desmonte el selector nativo de fotos.
  if(e.target.closest?.('.mg-on-photo-upload')){choosingPhoto=true;return;}
  // Al volver a ingresar desde el menú, la pantalla principal siempre es Cargar pedidos.
  if(e.target.closest?.('[data-go="cierre-online"]'))openForEntry();
  if(!allowed())return;
  const size=e.target.closest('[data-mgon-scale]');
  if(size){changeScale(size.dataset.mgonScale==='up'?5:-5);return;}
  const noteSave=e.target.closest('[data-mgon-save-note]');
  if(noteSave){
   const id=noteSave.dataset.mgonSaveNote;
   const input=[...document.querySelectorAll('[data-mgon-close-note]')].find(el=>el.dataset.mgonCloseNote===id);
   if(input){void (async()=>{try{
    await rpc('gestlok_mg_online_close_note',{p_shift:id,p_note:input.value});
    await rpcRefresh();api.toast?.('Observación del cierre guardada.');
   }catch(err){photoError=err.message||'No se pudo guardar la observación';api.toast?.(photoError);}})();}
   return;
  }
  const jump=e.target.closest('[data-mgon-jump-history]');
  if(jump){tab='historial';api.render();document.querySelector('.mg-on-history-embedded')?.scrollIntoView({block:'start'});return;}
  const tabButton=e.target.closest('[data-mgon-tab]');
  if(tabButton){tab=tabButton.dataset.mgonTab;error='';saveNotice=false;api.render();return;}
  const cashOk=e.target.closest('[data-mgon-cash-ok]');
  if(cashOk){
   if(!writable()){cashOk.checked=!cashOk.checked;return;}
   const checked=cashOk.checked,id=cashOk.dataset.mgonCashOk,shift=snapshot?.active?.id;
   cashOk.disabled=true;
   void (async()=>{try{
    await rpc('gestlok_mg_online_cash_ok',{p_shift:shift,p_id:id,p_ok:checked});
    await rpcRefresh();
   }catch(err){cashOk.checked=!checked;cashOk.disabled=false;api.toast?.(err.message||'No se pudo guardar OK');}})();
   return;
  }
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
   amount=parseAmountInput(d.get('amount')),method=String(d.get('method')||''),app=d.has('app'),
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
  if(e.target.matches?.('[data-mgon-photo]')){const file=e.target.files?.[0];choosingPhoto=false;if(file)void uploadPhoto(e.target.dataset.mgonPhoto,file);return;}
  if(e.target.id==='mg-on-date-filter'){filter=e.target.value;opened=null;api.render();}
  if(e.target.id==='mg-on-history-view'){viewMode=e.target.value==='turno'?'turno':'dia';opened=null;api.render();}
  if(e.target.id==='mg-on-turn-filter'){shiftFilter=['manana','tarde'].includes(e.target.value)?e.target.value:'todos';opened=null;api.render();}
 });
 // Cuando el usuario cancela la cámara/galería, restaurar los refrescos normales.
 document.addEventListener('cancel',e=>{if(e.target.matches?.('[data-mgon-photo]'))choosingPhoto=false;},true);
}
function subscribe(loc,push){
 if(!allowed()||!(loc in LOCALS))return;
 void refresh();
 const timer=setInterval(()=>{if(api?.S?.view==='cierre-online'&&!choosingPhoto&&!uploading&&!document.hidden&&!document.activeElement?.closest('#mg-online-form'))void refresh();},30000);
 const focus=()=>{if(api?.S?.view==='cierre-online'&&!choosingPhoto&&!uploading)void refresh();};
 window.addEventListener('focus',focus);
 push(()=>{clearInterval(timer);window.removeEventListener('focus',focus);});
}
document.addEventListener('input',e=>{if(e.target?.matches?.('#mg-online-form [name=amount]')){const field=e.target;const before=field.value;const cursor=field.selectionStart??before.length;const digitsBefore=before.slice(0,cursor).replace(/[^0-9,]/g,'').length;const formatted=formatAmountTyping(before);field.value=formatted;let pos=0,seen=0;while(pos<formatted.length&&seen<digitsBefore){if(/[0-9,]/.test(formatted[pos]))seen++;pos++;}field.setSelectionRange(pos,pos);}if(e.target?.closest?.('#mg-online-form'))updateCashPreview();});
document.addEventListener('change',e=>{if(e.target?.closest?.('#mg-online-form'))updateCashPreview();});
window.GestLokMiGustoOnline=Object.freeze({attach,view,subscribe,reset,openForEntry,permitido:allowed,syncCashPreview:updateCashPreview,_test:{date,shiftName,historyGroups,clampScale,getScale,todayArgentina,timeOf}});
})();