/* GESTLOK · DEMO Pagos Online
   Todo es ficticio y se mantiene en memoria de esta pestaña: NO hay RPC, Storage ni datos reales.
   Las formas de pago son configurables; en empresas reales no deben imponerse métodos fijos. */
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n)||0);
const fmtDay=x=>{const a=x.split('-');return a[2]+'/'+a[1]+'/'+a[0].slice(2);};
const labelTurn=x=>x==='manana'?'Mañana':'Noche';
const today='2026-10-29';
let methods=['Transferencia','Tarjeta'];
let shifts=[{id:1,day:today,turn:'manana',closed:false,photo:false,movements:[
 {id:1,num:'24',method:'Tarjeta',amount:10900,app:true,note:'Entrega coordinada'},
 {id:2,num:'36',method:'Transferencia',amount:15900,app:false,note:''}
]}];
let section='resumen',methodOpen=false,modalDay=null,modalTab='dia',error='',nextId=3;
const totals=arr=>{
 const out={total:0,app:0,online:0,count:0,methods:{}};
 for(const s of arr){for(const m of s?.movements||[]){
  out.total+=m.amount;out.app+=m.app?m.amount:0;out.count++;
  out.methods[m.method]=(out.methods[m.method]||0)+m.amount;
 }}
 out.online=out.total-out.app;return out;
};
const active=()=>shifts.find(s=>!s.closed);
const dayShifts=day=>shifts.filter(s=>s.day===day);
const dayRows=()=>[...new Set(shifts.filter(s=>s.closed).map(s=>s.day))].sort().reverse();
function amountRows(summary){
 return '<div class="gl-dp-numbers">'+
  methods.map(m=>'<div><span>'+esc(m)+'</span><strong>'+money(summary.methods[m]||0)+'</strong></div>').join('')+
  '<div><span>Total APP</span><strong>'+money(summary.app)+'</strong></div>'+
  '<div><span>Total ventas</span><strong>'+money(summary.total)+'</strong></div>'+
  '<div class="gl-dp-local"><span>Online Local</span><strong>'+money(summary.online)+'</strong></div></div>';
}
function shiftView(s,turn){
 if(!s)return '<article class="gl-dp-shift"><h3>'+labelTurn(turn)+'</h3><p>Sin movimientos. Este turno todavía no comenzó.</p></article>';
 return '<article class="gl-dp-shift"><header><h3>'+labelTurn(turn)+'</h3><small>'+ (s.closed?'✓ Cerrado':'● Abierto')+'</small></header>'+
 amountRows(totals([s]))+
 (s.closed?'<button type="button" data-dp-photo="'+s.id+'">'+(s.photo?'📷 Foto de ejemplo adjuntada':'📷 Simular foto del cierre')+'</button>':'')+'</article>';
}
function report(day){
 const list=dayShifts(day).filter(x=>x.closed),m=list.find(x=>x.turn==='manana'),n=list.find(x=>x.turn==='noche');
 const selected=modalTab==='dia'?list:modalTab==='manana'?[m].filter(Boolean):[n].filter(Boolean);
 const rows=selected.flatMap(s=>s.movements.map(v=>({...v,turn:s.turn})));
 const summary=totals(selected);
 return '<div class="gl-dp-overlay"><section role="dialog" aria-modal="true" aria-labelledby="gl-dp-modal-title" class="gl-dp-modal">'+
 '<header><div><small>REPORTE FICTICIO</small><h3 id="gl-dp-modal-title">'+fmtDay(day)+'</h3></div><button type="button" aria-label="Cerrar reporte" data-dp-modal-close>×</button></header>'+
 '<nav aria-label="Detalle por turno">'+[['dia','Día Completo'],['manana','Mañana'],['noche','Noche']].map(([key,v])=>
  '<button type="button" data-dp-modal-tab="'+key+'" aria-current="'+(modalTab===key?'page':'false')+'">'+v+'</button>').join('')+'</nav>'+
 '<div class="gl-dp-modal-scroll">'+amountRows(summary)+'<h4>Movimientos individuales</h4>'+
 (rows.length?rows.map(row=>'<article class="gl-dp-receipt"><b>#'+esc(row.num)+'</b><div>'+esc(labelTurn(row.turn))+' · '+esc(row.method)+
 (row.app?' · APP':'')+'<small>'+esc(row.note||'Sin observaciones')+'</small></div><strong>'+money(row.amount)+'</strong></article>').join(''):
 '<p>Sin cierre registrado para este turno.</p>')+
 '<div class="gl-dp-proof">'+selected.map(s=>'<div><b>'+labelTurn(s.turn)+'</b>'+
 '<span>'+(s.photo?'📷 Foto de ejemplo adjuntada':'Sin fotografía todavía')+'</span>'+
 '<button type="button" data-dp-photo="'+s.id+'">📷 '+(s.photo?'Ver ejemplo':'Simular foto')+'</button></div>').join('')+'</div>'+
 '<p class="gl-dp-disclaimer">Todo el contenido de esta pantalla es ficticio. No se guarda ninguna foto real.</p></div></section></div>';
}
function summary(){
 const current=active(),day=current?.day||today,sh=dayShifts(day),a=sh.find(s=>s.turn==='manana'),n=sh.find(s=>s.turn==='noche');
 const total=totals(sh);
 return '<h3>Resumen diario · '+fmtDay(day)+'</h3><div class="gl-dp-metrics"><div><span>Total ventas</span><strong>'+money(total.total)+'</strong></div>'+
 '<div><span>Online Local</span><strong>'+money(total.online)+'</strong></div></div>'+
 '<div class="gl-dp-shifts">'+shiftView(a,'manana')+shiftView(n,'noche')+'</div>'+
 '<h3>Historial por día</h3><p>Elegí un día para ver Mañana, Noche y Día Completo.</p>'+
 (dayRows().length?dayRows().map(day=>{
  const t=totals(dayShifts(day).filter(s=>s.closed));
  return '<div class="gl-dp-day"><b>'+fmtDay(day)+'</b><span>'+money(t.total)+'</span><button type="button" data-dp-day="'+day+'">Ver detalle</button></div>';
 }).join(''):'<p class="gl-dp-empty">El historial aparece cuando cerrás un turno de prueba.</p>');
}
function entry(){
 const s=active();
 return '<h3>Carga de pedidos</h3><p>Registrá comandas ficticias y configurá los medios de pago de tu negocio.</p>'+
 '<form id="gl-dp-form" class="gl-dp-form"><label>Comanda<input name="num" required inputmode="numeric" pattern="[0-9]{1,10}" placeholder="Ej. 45"></label>'+
 '<label>Monto ($)<input name="amount" required type="number" min="0.01" step="0.01" placeholder="0,00"></label>'+
 '<label>Forma de pago<select name="method" required>'+methods.map(m=>'<option>'+esc(m)+'</option>').join('')+'</select></label>'+
 '<label class="gl-dp-app"><input type="checkbox" name="app"> APP</label>'+
 '<label class="gl-dp-wide">Observaciones (opcional)<textarea name="note" maxlength="300" rows="2" placeholder="Detalle del pedido"></textarea></label>'+
 '<button type="submit" '+(!s||!methods.length?'disabled':'')+'>Guardar pedido ficticio</button></form>'+
 '<button type="button" class="gl-dp-method-trigger" data-dp-manage>⚙ Formas de pago (agregar manualmente)</button>'+
 (methodOpen?'<div class="gl-dp-method-box"><form id="gl-dp-add-method"><label>Nuevo medio<input name="method" maxlength="40" required placeholder="Ej. Billetera digital"></label><button type="submit">Agregar</button></form>'+
 methods.map(m=>'<div><span>'+esc(m)+'</span><button data-dp-remove-method="'+esc(m)+'" '+(shifts.some(s=>s.movements.some(x=>x.method===m))?'disabled title="Este método ya tiene movimientos"':'')+'>Quitar</button></div>').join('')+'</div>':'')+
 '<h3>Movimientos del turno</h3>'+((s?.movements||[]).length?s.movements.map(m=>
 '<div class="gl-dp-receipt"><b>#'+esc(m.num)+'</b><div>'+esc(m.method)+(m.app?' · APP':'')+'<small>'+esc(m.note||'Sin observaciones')+'</small></div><strong>'+money(m.amount)+'</strong></div>').join(''):'<p>Sin pedidos todavía.</p>')+
 '<button type="button" class="gl-dp-close" data-dp-close '+(!s?.movements?.length?'disabled':'')+'>Cerrar '+labelTurn(s?.turn||'manana')+' →</button>';
}
function view(){
 const s=active();
 return '<section class="gl-dp-root" aria-label="Pagos Online ficticios"><small>GESTLOK · DEMO SIN DATOS REALES</small>'+
 '<h2>Pagos Online</h2><p>Turno '+labelTurn(s?.turn||'manana')+' · '+fmtDay(s?.day||today)+'</p>'+
 '<div class="gl-dp-tabs"><button type="button" data-dp-tab="resumen" aria-current="'+(section==='resumen'?'page':'false')+'">Resumen e historial</button>'+
 '<button type="button" data-dp-tab="carga" aria-current="'+(section==='carga'?'page':'false')+'">Carga de pedidos</button></div>'+
 (error?'<p role="alert" class="gl-dp-error">'+esc(error)+'</p>':'')+
 (section==='resumen'?summary():entry())+
 '<p class="gl-dp-disclaimer">Ejemplo interactivo. Las formas de pago se eligen manualmente según cada empresa.</p>'+
 (modalDay?report(modalDay):'')+'</section>';
}
function handleClick(e){
 const t=e.target.closest?.('[data-dp-tab],[data-dp-day],[data-dp-modal-close],[data-dp-modal-tab],[data-dp-close],[data-dp-manage],[data-dp-photo],[data-dp-remove-method]');
 if(!t)return false;
 error='';
 if(t.dataset.dpTab){section=t.dataset.dpTab;return true;}
 if(t.dataset.dpDay){modalDay=t.dataset.dpDay;modalTab='dia';return true;}
 if(t.hasAttribute('data-dp-modal-close')){modalDay=null;return true;}
 if(t.dataset.dpModalTab){modalTab=t.dataset.dpModalTab;return true;}
 if(t.hasAttribute('data-dp-manage')){methodOpen=!methodOpen;return true;}
 if(t.dataset.dpPhoto){
  const s=shifts.find(x=>x.id===Number(t.dataset.dpPhoto));if(s?.closed)s.photo=true;return true;
 }
 if(t.dataset.dpRemoveMethod){methods=methods.filter(m=>m!==t.dataset.dpRemoveMethod);return true;}
 if(t.hasAttribute('data-dp-close')){
  const s=active();if(!s?.movements?.length)return true;
  s.closed=true;const turn=s.turn==='manana'?'noche':'manana';
  const day=s.turn==='noche'?'2026-10-30':s.day;
  shifts.push({id:nextId++,day,turn,closed:false,photo:false,movements:[]});
  modalDay=s.day;modalTab=s.turn;section='resumen';return true;
 }
 return true;
}
function handleSubmit(e){
 const form=e.target;
 if(form.id==='gl-dp-add-method'){
  e.preventDefault();
  const name=String(new FormData(form).get('method')||'').trim();
  if(!name||name.length>40||methods.some(m=>m.toLowerCase()===name.toLowerCase()))error='Elegí otro nombre para la forma de pago';
  else methods.push(name);
  return true;
 }
 if(form.id==='gl-dp-form'){
  e.preventDefault();const f=new FormData(form),s=active();
  const num=String(f.get('num')||'').trim(),amount=Number(f.get('amount')),method=String(f.get('method')||'');
  if(!s||!/^[0-9]{1,10}$/.test(num)||!Number.isFinite(amount)||amount<=0||!methods.includes(method)){
   error='Revisá los datos del pedido.';return true;
  }
  s.movements.push({id:nextId++,num,amount,method,app:f.has('app'),note:String(f.get('note')||'').trim().slice(0,300)});
  error='';return true;
 }
 return false;
}
window.GestLokDemoPagos=Object.freeze({view,handleClick,handleSubmit,_test:{totals,labelTurn},reset:()=>{section='resumen';modalDay=null;}});
})();