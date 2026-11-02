/* GESTLOK · Caja diaria por empresa (pedido #200).
 * Aparece solo cuando el servidor confirma que la empresa de la sesión tiene la caja habilitada
 * (RPC gestlok_caja_acceso). Cada acción se vuelve a validar en la base (RPC + RLS por empresa).
 * Efectivo y transferencia, responsable obligatorio, «Cerrar día» y cierre automático 23:59
 * en el servidor. Sin foto. No guarda importes ni ventas en el dispositivo. */
(() => {
 'use strict';
 const TZ='America/Argentina/Buenos_Aires';
 const ROLES=['dueno','gerente','editor'];
 let host=null,acceso=null,cajaApp=null,checking=false,checkedKey='';
 let displayed=false,loading=false,busy=false,error='',aviso='',estado=null,tab='hoy',confirmando=false,editResp=false,detalle=null,op=newOp(),timer=0;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));
 const DIAS=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
 // Fechas AAAA-MM-DD del servidor: se muestran tal cual, sin pasar por la zona del equipo.
 function fecha(d,larga){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d||''));if(!m)return '';
  const corta=m[3]+'/'+m[2]+'/'+m[1];
  if(!larga)return corta;
  const dia=DIAS[new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).getUTCDay()];
  return dia.charAt(0).toUpperCase()+dia.slice(1)+' '+corta;
 }
 function hora(ts){try{return new Date(ts).toLocaleTimeString('es-AR',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}catch{return '';}}
 function newOp(){
  const c=globalThis.crypto;
  if(c?.randomUUID)return c.randomUUID();
  const b=new Uint8Array(16);
  if(c?.getRandomValues)c.getRandomValues(b);else for(let i=0;i<16;i++)b[i]=Math.floor(Math.random()*256);
  b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
 }
 // Importes en formato argentino: «1.500,50», «1500,5», «1500.50» o «$ 2.000».
 function parseMonto(raw){
  let s=String(raw??'').replace(/[\s$]/g,'');
  if(!s)return null;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  if(!/^\d+(\.\d{1,2})?$/.test(s))return null;
  const n=Number(s);
  return Number.isFinite(n)&&n>0&&n<1e10?n:null;
 }
 const db=()=>window.GestLokSupabase;
 const tenant=()=>host?.S?.me?.tenant_id||'';
 const role=()=>host?.role?.()||'';
 function permitido(){return !!acceso&&acceso.tenant===tenant()&&ROLES.includes(role());}
 // GESTLOK Caja (app completa en /caja/): empresas que la usan en lugar de la caja diaria (Perfumes desde el 02/11/2026).
 function appPermitida(){return !permitido()&&!!cajaApp&&cajaApp.tenant===tenant()&&ROLES.includes(role());}
 // Consulta liviana al servidor. Para Mi Gusto y el resto devuelve habilitada:false y no se muestra nada.
 async function refresh(h){
  if(h)host=h;
  const key=tenant()+'|'+role();
  if(!tenant()||!ROLES.includes(role())||window.GestLokVisitorDemo?.active){
   checkedKey='';
   if(acceso||cajaApp){acceso=null;cajaApp=null;close();host?.render?.();}
   return;
  }
  if(key===checkedKey||checking||host?.S?.offline||!db()?.rpc)return;
  checking=true;
  let next=null,app=null;
  try{
   const {data,error:err}=await db().rpc('gestlok_caja_acceso');
   if(!err&&data?.habilitada===true&&data.tenant_id===tenant())next={tenant:data.tenant_id};
   // Solo si la empresa no usa la caja diaria se pregunta por GESTLOK Caja (para Mi Gusto ambas dicen que no).
   if(!next){
    const r=await db().rpc('gestlok_caja_app_acceso');
    const d=r?.data;
    if(!r?.error&&d?.habilitada===true&&d.tenant_id===tenant())
     app={tenant:d.tenant_id,locales:Array.isArray(d.locales)?d.locales.filter(x=>typeof x==='string'&&x):[],yo:typeof d.yo==='string'?d.yo:''};
   }
   checkedKey=key;
  }catch{next=null;app=null;}
  finally{checking=false;}
  const changed=!!acceso!==!!next||!!cajaApp!==!!app;
  acceso=next;cajaApp=app;
  if(!acceso)close();
  if(changed)host?.render?.();
 }
 function homeTile(){
  if(appPermitida()){
   const loc=cajaApp.locales[0]||'';
   const q='desde=gestlok'+(loc?'&comercio='+encodeURIComponent(loc)+'&local='+encodeURIComponent(loc):'')+(cajaApp.yo?'&yo='+encodeURIComponent(cajaApp.yo):'');
   return '<section class="gl-caja-entry gl-caja-app-entry" aria-label="GESTLOK Caja"><div><small>GESTLOK CAJA · SOLO TU EMPRESA</small><h2>Caja del local</h2>'+
    '<p>Caja inicial, cobros por medio de pago, gastos, ingresos, retiros, arqueo y cierre. Cada persona entra con su propia cuenta, sin PIN. Funciona en el teléfono y en la PC.</p></div>'+
    '<a href="/caja/?'+esc(q)+'" data-caja-app>Abrir GESTLOK Caja <span aria-hidden="true">→</span></a></section>';
  }
  if(!permitido())return '';
  return '<section class="gl-caja-entry" aria-label="Caja diaria"><div><small>CAJA DIARIA · SOLO TU EMPRESA</small><h2>Pagos del día</h2>'+
   '<p>Efectivo y transferencia, responsable de caja, «Cerrar día» e historial. Si nadie la cierra, se cierra sola a las 23:59.</p></div>'+
   '<button type="button" data-caja-open>Abrir caja diaria <span aria-hidden="true">→</span></button></section>';
 }
 async function rpc(name,args){
  if(!permitido())throw Error('Sin permiso para la caja de esta empresa.');
  if(host?.S?.offline||navigator.onLine===false)throw Error('Sin conexión. La caja necesita internet para guardar.');
  const {data,error:err}=await db().rpc(name,args||{});
  if(err){
   const msg=String(err.message||'');
   if(err.code==='42501'||/permiso|permission/i.test(msg))throw Error('No tenés permiso para esta caja.');
   if(/failed to fetch|network|load failed|timeout/i.test(msg))throw Error('No hubo respuesta del servidor. Lo que escribiste sigue acá: probá de nuevo (no se duplica).');
   throw Error(msg||'No se pudo completar. Probá de nuevo.');
  }
  return data;
 }
 async function load(){
  const data=await rpc('gestlok_caja_estado');
  if(!data||data.tenant_id!==tenant())throw Error('La caja no corresponde a tu empresa.');
  if(estado&&estado.hoy!==data.hoy){confirmando=false;editResp=false;}
  estado=data;
 }
 const turno=()=>estado?.turno||null;
 function resumen(t){
  return '<div class="gl-caja-kpis"><div><span>Efectivo</span><strong data-caja-total="efectivo">'+esc(money(t.efectivo))+'</strong></div>'+
   '<div><span>Transferencia</span><strong data-caja-total="transferencia">'+esc(money(t.transferencia))+'</strong></div>'+
   '<div class="gl-caja-kpi-total"><span>Total del día</span><strong data-caja-total="total">'+esc(money(t.total))+'</strong></div>'+
   '<div><span>Ventas</span><strong>'+esc(t.ventas)+'</strong></div></div>';
 }
 function ventas(t,abierta){
  const list=(t.movimientos||[]).slice().reverse();
  if(!list.length)return '<p class="gl-caja-empty">Todavía no hay ventas registradas'+(abierta?' hoy.':' en este día.')+'</p>';
  return '<ul class="gl-caja-list" aria-label="Ventas del día">'+list.map(m=>'<li class="'+(m.anulado?'is-void':'')+'">'+
   '<span class="gl-caja-when">'+esc(hora(m.registrado_at))+'</span><span class="gl-caja-method">'+(m.metodo==='efectivo'?'Efectivo':'Transferencia')+'</span>'+
   '<b>'+esc(money(m.monto))+'</b><small>'+esc([m.nota,m.registrado_por,m.anulado?'Anulada':''].filter(Boolean).join(' · '))+'</small>'+
   (abierta&&!m.anulado?'<button type="button" data-caja-anular="'+esc(m.id)+'" '+(busy?'disabled':'')+'>Anular</button>':'')+'</li>').join('')+'</ul>';
 }
 function cierreTexto(t){
  if(t.tipo_cierre==='automatico')return 'Cierre automático a las 23:59';
  return 'Cerrada a las '+hora(t.cerrado_at)+(t.cerrado_por?' por '+t.cerrado_por:'');
 }
 function vistaHoy(){
  if(!estado)return '<p role="status">Consultando la caja…</p>';
  const t=turno();
  if(!t){
   if(!estado.puede_abrir)return '<p class="gl-caja-empty">La caja de hoy ya cerró a las 23:59. Podés abrir la de mañana desde las 00:00.</p>';
   return '<form class="gl-caja-card" id="gl-caja-abrir" autocomplete="off"><h3>Abrir la caja de hoy</h3>'+
    '<p>Una sola caja por día. Si otra persona ya la abrió desde otro equipo, vas a ver esa misma caja.</p>'+
    '<label>Responsable de caja<input name="responsable" required minlength="2" maxlength="80" autocomplete="off" placeholder="Nombre y apellido"></label>'+
    '<button type="submit" class="gl-caja-primary" '+(busy?'disabled':'')+'>'+(busy?'Abriendo…':'Abrir caja del día')+'</button></form>';
  }
  if(t.estado==='cerrado'){
   return '<section class="gl-caja-card gl-caja-closed" aria-label="Caja cerrada"><h3>Caja cerrada</h3><p><b>Responsable:</b> '+esc(t.responsable)+' · '+esc(cierreTexto(t))+'</p>'+
    resumen(t)+'<p class="gl-caja-note">El cierre es definitivo: esta caja no se reabre. Mañana se abre una nueva.</p></section>'+ventas(t,false);
  }
  const resp=editResp
   ?'<form class="gl-caja-inline" id="gl-caja-resp" autocomplete="off"><label>Responsable de caja<input name="responsable" required minlength="2" maxlength="80" autocomplete="off" value="'+esc(t.responsable)+'"></label>'+
     '<button type="submit" '+(busy?'disabled':'')+'>Guardar</button><button type="button" data-caja-resp-cancel>Cancelar</button></form>'
   :'<p class="gl-caja-resp"><b>Responsable:</b> <span data-caja-responsable>'+esc(t.responsable)+'</span> <button type="button" data-caja-resp-edit>Cambiar</button></p>';
  const cierre=confirmando
   ?'<form class="gl-caja-card gl-caja-confirm" id="gl-caja-cerrar" autocomplete="off" role="group" aria-label="Confirmar cierre"><h3>¿Cerrar la caja de hoy?</h3>'+
     '<p>Se guardan los totales y quién cerró. Después no se pueden cargar ni anular ventas de este día.</p>'+resumen(t)+
     '<label>Responsable del cierre<input name="responsable" required minlength="2" maxlength="80" autocomplete="off" value="'+esc(t.responsable)+'"></label>'+
     '<div class="gl-caja-actions"><button type="submit" class="gl-caja-danger" '+(busy?'disabled':'')+'>'+(busy?'Cerrando…':'Confirmar cierre')+'</button><button type="button" data-caja-cerrar-cancel>Cancelar</button></div></form>'
   :'<div class="gl-caja-actions gl-caja-close-row"><button type="button" class="gl-caja-danger" data-caja-cerrar '+(busy?'disabled':'')+'>Cerrar día</button>'+
     '<small>Si nadie la cierra, el servidor la cierra a las 23:59 (hora de Argentina).</small></div>';
  return '<section class="gl-caja-card" aria-label="Caja abierta"><h3>Caja abierta</h3>'+resp+resumen(t)+'</section>'+
   (confirmando?'':'<form class="gl-caja-card" id="gl-caja-venta" autocomplete="off"><h3>Registrar pago</h3>'+
    '<fieldset class="gl-caja-methods"><legend>Medio de pago</legend>'+
    '<label><input type="radio" name="metodo" value="efectivo" checked> Efectivo</label>'+
    '<label><input type="radio" name="metodo" value="transferencia"> Transferencia</label></fieldset>'+
    '<div class="gl-caja-grid"><label>Importe<input name="monto" inputmode="decimal" required autocomplete="off" placeholder="Ej.: 15.000,50"></label>'+
    '<label>Detalle (opcional)<input name="nota" maxlength="120" autocomplete="off" placeholder="Ej.: perfume 100 ml"></label></div>'+
    '<input type="hidden" name="operacion" value="'+esc(op)+'">'+
    '<button type="submit" class="gl-caja-primary" '+(busy?'disabled':'')+'>'+(busy?'Guardando…':'Registrar pago')+'</button></form>')+
   cierre+ventas(t,true);
 }
 function vistaHistorial(){
  const h=estado?.historial||[];
  if(!h.length)return '<p class="gl-caja-empty">Todavía no hay días cerrados.</p>';
  const rows=h.map(x=>'<tr><td>'+esc(fecha(x.dia))+'</td><td>'+esc(x.responsable)+'</td><td>'+esc(money(x.efectivo))+'</td><td>'+esc(money(x.transferencia))+'</td>'+
   '<td><b>'+esc(money(x.total))+'</b></td><td>'+esc(x.ventas)+'</td><td>'+(x.tipo_cierre==='automatico'?'Automático 23:59':'Manual '+esc(hora(x.cerrado_at)))+'</td>'+
   '<td><button type="button" data-caja-detalle="'+esc(x.id)+'">Ver ventas</button></td></tr>').join('');
  const det=detalle?'<section class="gl-caja-card" aria-label="Detalle del día"><h3>Ventas del '+esc(fecha(detalle.dia,true))+'</h3><p><b>Responsable:</b> '+esc(detalle.responsable)+' · '+esc(cierreTexto(detalle))+'</p>'+
   resumen(detalle)+ventas(detalle,false)+'<button type="button" data-caja-detalle-cerrar>Volver al historial</button></section>':'';
  return det+'<div class="gl-caja-table"><table><caption>Días cerrados</caption><thead><tr><th>Fecha</th><th>Responsable</th><th>Efectivo</th><th>Transferencia</th><th>Total</th><th>Ventas</th><th>Cierre</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
 }
 // Al redibujar se conservan los datos que la persona está escribiendo.
 function keepInputs(root){
  const out={};
  root?.querySelectorAll('form[id] input:not([type=hidden]),form[id] textarea').forEach(i=>{
   const k=i.form.id+'|'+i.name+'|'+(i.type==='radio'?i.value:'');
   out[k]=i.type==='radio'?i.checked:i.value;
  });
  const a=document.activeElement;
  return {out,focus:a&&root?.contains(a)&&a.form?a.form.id+'|'+a.name:''};
 }
 function restoreInputs(root,kept){
  root.querySelectorAll('form[id] input:not([type=hidden]),form[id] textarea').forEach(i=>{
   const k=i.form.id+'|'+i.name+'|'+(i.type==='radio'?i.value:'');
   if(!(k in kept.out))return;
   if(i.type==='radio')i.checked=kept.out[k];else i.value=kept.out[k];
  });
  if(kept.focus){const [f,n]=kept.focus.split('|');root.querySelector('#'+f+' [name="'+n+'"]')?.focus();}
 }
 function render(){
  if(!displayed)return;
  let root=document.querySelector('#gl-caja-panel');
  const kept=keepInputs(root);
  if(!root){root=document.createElement('div');root.id='gl-caja-panel';document.body.append(root);}
  const dia=estado?.hoy?fecha(estado.hoy,true):'';
  root.innerHTML='<div class="gl-caja-shell" role="dialog" aria-modal="true" aria-labelledby="gl-caja-title">'+
   '<header class="gl-caja-top"><div><small>GESTLOK · CAJA DIARIA</small><h1 id="gl-caja-title">Caja diaria</h1><span>'+esc(dia)+(dia?' · hora de Argentina':'')+'</span></div>'+
   '<button type="button" data-caja-close aria-label="Cerrar caja diaria">Cerrar ×</button></header>'+
   '<nav class="gl-caja-tabs" aria-label="Secciones de la caja"><button type="button" data-caja-tab="hoy" aria-current="'+(tab==='hoy'?'page':'false')+'">Hoy</button>'+
   '<button type="button" data-caja-tab="historial" aria-current="'+(tab==='historial'?'page':'false')+'">Historial</button></nav>'+
   '<main class="gl-caja-main">'+(error?'<p class="gl-caja-error" role="alert">'+esc(error)+'</p>':'')+(aviso?'<p class="gl-caja-ok" role="status">'+esc(aviso)+'</p>':'')+
   (loading&&!estado?'<p role="status">Consultando la caja…</p>':tab==='hoy'?vistaHoy():vistaHistorial())+'</main></div>';
  restoreInputs(root,kept);
  document.body.classList.add('gl-caja-open');
 }
 function close(){
  document.querySelector('#gl-caja-panel')?.remove();document.body?.classList?.remove('gl-caja-open');
  displayed=false;confirmando=false;editResp=false;detalle=null;error='';aviso='';tab='hoy';
  if(timer){clearInterval(timer);timer=0;}
 }
 async function reload(silent){
  if(!displayed||busy)return;
  if(!silent){loading=true;render();}
  try{await load();if(!silent)error='';}catch(e){error=e.message;}
  finally{loading=false;render();}
 }
 async function open(){
  if(!permitido())return;
  if(displayed){render();return;}
  displayed=true;tab='hoy';error='';aviso='';
  await reload(false);
  // Refresca cada minuto: el cierre automático de las 23:59 y lo que carguen otros equipos se ven solos.
  if(!timer)timer=setInterval(()=>{if(document.visibilityState!=='hidden'&&!confirmando)void reload(true);},60000);
 }
 // Ejecuta una acción una sola vez aunque se toque dos veces.
 async function act(fn){
  if(busy)return false;
  busy=true;error='';aviso='';render();
  try{await fn();return true;}
  catch(e){error=e.message||'No se pudo completar.';try{await load();}catch{}return false;}
  finally{busy=false;render();}
 }
 async function abrir(form){
  const r=String(new FormData(form).get('responsable')||'').trim();
  if(r.length<2){error='Escribí el nombre de la persona responsable de la caja.';render();return;}
  await act(async()=>{
   const data=await rpc('gestlok_caja_abrir',{p_responsable:r});
   aviso=data?.nuevo?'Caja abierta.':data?.turno?.estado==='cerrado'?'La caja de hoy ya se cerró y no se reabre.':'La caja ya estaba abierta por '+(data?.turno?.responsable||'otra persona')+'.';
   await load();
  });
 }
 async function registrar(form){
  const f=new FormData(form);
  const metodo=String(f.get('metodo')||''),monto=parseMonto(f.get('monto')),nota=String(f.get('nota')||'').trim();
  if(!['efectivo','transferencia'].includes(metodo)||monto===null){error='Revisá el importe: mayor a 0 y hasta 2 decimales.';render();return;}
  const t=turno();if(!t||t.estado!=='abierto')return;
  const ok=await act(async()=>{
   const data=await rpc('gestlok_caja_registrar',{p_turno:t.id,p_metodo:metodo,p_monto:monto,p_nota:nota,p_operacion:op});
   aviso=(data?.repetida?'Ese pago ya estaba guardado: ':'Pago registrado: ')+money(monto)+' en '+(metodo==='efectivo'?'efectivo':'transferencia')+'.';
   if(data?.turno)estado={...estado,turno:data.turno};
  });
  if(ok){
   // Formulario limpio para el próximo pago y clave nueva (un reintento fallido usa la misma).
   op=newOp();
   const fresh=document.querySelector('#gl-caja-venta');
   fresh?.reset();
   fresh?.querySelectorAll('input[name="monto"],input[name="nota"]').forEach(i=>{i.value='';});
   const ef=fresh?.querySelector('input[name="metodo"][value="efectivo"]');if(ef)ef.checked=true;
   const hidden=fresh?.querySelector('input[name="operacion"]');if(hidden)hidden.value=op;
   fresh?.querySelector('input[name="monto"]')?.focus();
  }
 }
 async function anular(id){
  const t=turno();if(!t||t.estado!=='abierto')return;
  if(typeof confirm==='function'&&!confirm('¿Anular esta venta? Queda registrada como anulada y deja de sumar.'))return;
  await act(async()=>{const data=await rpc('gestlok_caja_anular',{p_turno:t.id,p_movimiento:id});aviso='Venta anulada.';if(data?.turno)estado={...estado,turno:data.turno};});
 }
 async function responsable(form){
  const r=String(new FormData(form).get('responsable')||'').trim();
  const t=turno();if(!t)return;
  if(r.length<2){error='Escribí el nombre de la persona responsable de la caja.';render();return;}
  const ok=await act(async()=>{const data=await rpc('gestlok_caja_responsable',{p_turno:t.id,p_responsable:r});if(data?.turno)estado={...estado,turno:data.turno};aviso='Responsable actualizado.';});
  if(ok){editResp=false;render();}
 }
 async function cerrar(form){
  const r=String(new FormData(form).get('responsable')||'').trim();
  const t=turno();if(!t)return;
  if(r.length<2){error='Escribí el nombre de la persona responsable del cierre.';render();return;}
  const ok=await act(async()=>{
   const data=await rpc('gestlok_caja_cerrar',{p_turno:t.id,p_responsable:r});
   aviso=data?.ya_cerrado?'La caja ya estaba cerrada.':'Caja cerrada. Total del día: '+money(data?.turno?.total)+'.';
   await load();
  });
  if(ok){confirmando=false;render();}
 }
 async function verDetalle(id){
  await act(async()=>{detalle=await rpc('gestlok_caja_detalle',{p_turno:id});});
  document.querySelector('#gl-caja-panel .gl-caja-main')?.scrollTo?.({top:0,behavior:'smooth'});
 }
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-caja-open]')){e.preventDefault();void open();return;}
  if(!displayed)return;
  if(e.target.closest('[data-caja-close]')){close();return;}
  const tb=e.target.closest('[data-caja-tab]');
  if(tb){tab=tb.dataset.cajaTab==='historial'?'historial':'hoy';detalle=null;error='';aviso='';render();return;}
  if(e.target.closest('[data-caja-cerrar]')){confirmando=true;error='';aviso='';render();document.querySelector('#gl-caja-cerrar input[name="responsable"]')?.focus();return;}
  if(e.target.closest('[data-caja-cerrar-cancel]')){confirmando=false;render();return;}
  if(e.target.closest('[data-caja-resp-edit]')){editResp=true;render();document.querySelector('#gl-caja-resp input')?.focus();return;}
  if(e.target.closest('[data-caja-resp-cancel]')){editResp=false;render();return;}
  const an=e.target.closest('[data-caja-anular]');if(an){void anular(an.dataset.cajaAnular);return;}
  const dt=e.target.closest('[data-caja-detalle]');if(dt){void verDetalle(dt.dataset.cajaDetalle);return;}
  if(e.target.closest('[data-caja-detalle-cerrar]')){detalle=null;render();}
 });
 document.addEventListener('submit',e=>{
  const id=e.target?.id;
  if(!displayed||!['gl-caja-abrir','gl-caja-venta','gl-caja-resp','gl-caja-cerrar'].includes(id))return;
  e.preventDefault();
  if(id==='gl-caja-abrir')void abrir(e.target);
  else if(id==='gl-caja-venta')void registrar(e.target);
  else if(id==='gl-caja-resp')void responsable(e.target);
  else void cerrar(e.target);
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&displayed){if(confirmando){confirmando=false;render();}else close();}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&displayed)void reload(true);});
 window.GestLokCajaDiaria=Object.freeze({refresh,homeTile,open,close,permitido,appPermitida,
  _test:Object.freeze({parseMonto,fecha,money,newOp,vistaHoy:()=>vistaHoy(),setEstado:v=>{estado=v;},setAcceso:v=>{acceso=v;},setCajaApp:v=>{cajaApp=v;}})});
})();
