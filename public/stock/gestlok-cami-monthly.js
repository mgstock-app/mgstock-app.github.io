/* Resumen Mensual: registro manual privado de Camila. No modifica POS, Caja, stock ni Mi Gusto. */
(()=>{
 'use strict';
 if(window.GestLokCamiMonthly)return;
 const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', UID='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3', EMAIL='camilab.lopez99@gmail.com', TABLE='gestlok_cami_monthly_movements';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(v||0);
 const monthNow=()=>(()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit'}).formatToParts(new Date());return p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value;})();
 let host=null,context=null,allowed=false,visible=false,month=monthNow(),rows=[],error='',busy=false;
 const db=()=>window.GestLokSupabase;
 const valid=(ctx,h)=>ctx?.tenant_id===TENANT&&ctx?.role==='dueno'&&h?.role?.()==='dueno'&&h?.S?.me?.tenant_id===TENANT&&String(h?.S?.me?.email||'').toLowerCase()===EMAIL;
 async function check(){
  if(!allowed||!valid(context,host))throw Error('Acceso privado');
  const {data,error:e}=await db().auth.getUser();
  if(e||data?.user?.id!==UID||String(data?.user?.email||'').toLowerCase()!==EMAIL)throw Error('Acceso privado');
 }
 async function refresh(ctx,h){
  context=ctx;host=h;allowed=false;
  if(!valid(ctx,h)){close();return;}
  try{
   const {data,error:e}=await db().auth.getUser();
   allowed=!e&&data?.user?.id===UID&&String(data?.user?.email||'').toLowerCase()===EMAIL;
  }catch{allowed=false;}
  if(!allowed)close();
 }
 function homeTile(){return allowed&&valid(context,host)?'<section class="gl-cm-entry"><div><small>CONTROL PRIVADO</small><h2>Resumen Mensual</h2><p>Ingresos, ventas, gastos, reinversión y ganancia.</p></div><button type="button" data-cm-open>Ver resumen</button></section>':'';}
 const totals=rs=>rs.reduce((a,r)=>(a[r.category]+=Number(r.amount)||0,a),{venta:0,ingreso:0,gasto:0,reinversion:0});
 async function load(){
  await check();
  const start=month+'-01',next=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)).toISOString().slice(0,10);
  const {data,error:e}=await db().from(TABLE).select('id,movement_date,category,concept,amount,note').eq('tenant_id',TENANT).gte('movement_date',start).lt('movement_date',next).order('movement_date',{ascending:false});
  if(e)throw e;rows=data||[];
 }
 function render(){
  if(!visible)return;
  const t=totals(rows),gain=t.venta+t.ingreso-t.gasto-t.reinversion;
  const labels={venta:'Ventas',ingreso:'Otros ingresos',gasto:'Gastos',reinversion:'Reinversión'};
  const node=document.getElementById('gl-cm-panel');if(!node)return;
  node.innerHTML='<div class="gl-cm-wrap"><header><button data-cm-close>← Volver</button><h1>Resumen Mensual</h1><span>Privado</span></header>'+
   '<label>Mes <input type="month" data-cm-month value="'+month+'"></label>'+
   (error?'<p role="alert">'+esc(error)+'</p>':'')+
   '<div class="gl-cm-grid">'+Object.keys(labels).map(k=>'<article><small>'+labels[k]+'</small><strong>'+money(t[k])+'</strong></article>').join('')+'</div>'+
   '<section class="gl-cm-profit"><span>Ganancia disponible del mes</span><strong>'+money(gain)+'</strong></section>'+
   '<p class="gl-cm-help">Registro manual: cargá cada venta o ingreso una sola vez. Clasificá las compras como gasto o reinversión, nunca ambas.</p>'+
   '<form id="gl-cm-form"><h2>Agregar movimiento</h2><label>Fecha<input type="date" name="movement_date" required value="'+month+'-01"></label><label>Tipo<select name="category"><option value="venta">Venta manual</option><option value="ingreso">Otro ingreso</option><option value="gasto">Gasto / mercadería</option><option value="reinversion">Reinversión</option></select></label><label>Concepto<input name="concept" maxlength="180" required placeholder="Ej. compra de perfumes"></label><label>Importe ($)<input name="amount" type="number" step="0.01" min="0.01" required></label><label>Nota<input name="note" maxlength="2000"></label><button type="submit" '+(busy?'disabled':'')+'>Guardar movimiento</button></form>'+
   '<section><h2>Historial de '+month+'</h2><div class="gl-cm-list">'+(rows.length?rows.map(r=>'<div><span>'+esc(r.movement_date)+' · '+esc(labels[r.category]||r.category)+'<b>'+esc(r.concept)+'</b></span><strong>'+money(r.amount)+'</strong><button data-cm-delete="'+esc(r.id)+'" aria-label="Eliminar movimiento">Eliminar</button></div>').join(''):'<p>Todavía no hay movimientos cargados este mes.</p>')+'</div></section>'+
   '<p>Para ver meses anteriores, cambiá el selector de mes. Los movimientos quedan guardados en el historial.</p></div>';
 }
 async function open(){
  if(!allowed)return;
  try{await check();visible=true;error='';host?.closePanel?.();document.body.classList.add('gl-cm-open');let el=document.getElementById('gl-cm-panel');if(!el){el=document.createElement('main');el.id='gl-cm-panel';document.body.append(el);}await load();render();}
  catch(e){error=e.message||'No se pudo abrir el resumen.';if(visible)render();}
 }
 function close(){visible=false;document.body.classList.remove('gl-cm-open');document.getElementById('gl-cm-panel')?.remove();}
 async function save(form){
  if(busy)return;busy=true;
  try{await check();const f=new FormData(form);const amount=Number(f.get('amount')),date=String(f.get('movement_date')),category=String(f.get('category')),concept=String(f.get('concept')).trim();
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['venta','ingreso','gasto','reinversion'].includes(category)||!concept||!Number.isFinite(amount)||amount<=0)throw Error('Revisá los datos.');
   const {error:e}=await db().from(TABLE).insert({owner_uid:UID,tenant_id:TENANT,movement_date:date,category,concept,amount,note:String(f.get('note')||'')});
   if(e)throw e;month=date.slice(0,7);await load();error='';
  }catch(e){error=e.message||'No se pudo guardar.';}finally{busy=false;render();}
 }
 async function remove(id){
  if(busy||!window.confirm('¿Eliminar este movimiento?'))return;busy=true;
  try{await check();const {error:e}=await db().from(TABLE).delete().eq('id',id).eq('tenant_id',TENANT);if(e)throw e;await load();error='';}
  catch(e){error=e.message||'No se pudo eliminar.';}finally{busy=false;render();}
 }
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-cm-open]')){e.preventDefault();void open();}
  if(e.target.closest('[data-cm-close]')){e.preventDefault();close();}
  const del=e.target.closest('[data-cm-delete]');if(del){e.preventDefault();void remove(del.dataset.cmDelete);}
 });
 document.addEventListener('change',e=>{if(e.target.matches('[data-cm-month]')){month=e.target.value;void load().then(()=>{error='';render();}).catch(err=>{error=err.message;render();});}});
 document.addEventListener('submit',e=>{if(e.target.id==='gl-cm-form'){e.preventDefault();void save(e.target);}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&visible)close();});
 window.GestLokCamiMonthly=Object.freeze({refresh,homeTile,open,reset:()=>{allowed=false;close();},authorized:()=>allowed&&valid(context,host)});
})();
