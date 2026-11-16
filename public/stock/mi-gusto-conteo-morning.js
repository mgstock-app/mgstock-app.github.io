/* Mi Gusto · comparación Noche salida / Mañana entrada.
   Mantiene la vista compacta y actualiza diferencias sin reconstruir el teclado. */
(()=>{
'use strict';
if(window.GestLokConteoMorning)return;
let current='',data=null,error='',loading=false,token=0,timer=null,context=null;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayLabel=s=>{const a=String(s||'').split('-');return a.length===3?a[2]+'/'+a[1]+'/'+a[0]:'—';};
const plusDays=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const key=c=>c.local+'|'+c.day;
function connect(c){
 if(!c||!c.local||!c.day||typeof c.rpc!=='function')return false;
 if(key(c)!==current){current=key(c);data=null;error='';loading=false;++token;}
 context=c;return true;
}
const differences=()=>data?.rows?.filter(x=>Number(x.difference)!==0)||[];
const pending=()=>data?.first_day?[]:differences().filter(x=>!x.acknowledged);
const ready=()=>!!(data?.baseline_ready||data?.first_day)&&!pending().length;
function panel(){
 const d=context?.day||'',previous=data?.previous_day||plusDays(d,-1);
 const title='Comparación · Noche salida '+dayLabel(previous)+' / Mañana entrada '+dayLabel(d);
 const refreshButton='<button type="button" data-gcm-compare-refresh>Volver a comparar</button>';
 const err=error?'<p class="gcm-morning-error" role="alert">'+esc(error)+'</p>':'';
 if(!data)return '<section class="gcm-morning-review" role="status"><header><strong>'+esc(title)+
  '</strong>'+refreshButton+'</header><p>'+ (loading?'Comparando los totales guardados…':'Verificá los totales de cada producto antes del cierre.')+'</p>'+err+'</section>';
 if(data.first_day)return '<section class="gcm-morning-review is-complete" role="status"><header><strong>'+esc(title)+
  '</strong>'+refreshButton+'</header><p>Primer día de Conteo: todavía no existe una Noche salida anterior para comparar. Este primer cierre crea el punto de partida. Desde mañana la comparación será obligatoria.</p>'+err+'</section>';
 if(!data.baseline_ready)return '<section class="gcm-morning-review is-blocked" role="alert"><header><strong>'+esc(title)+
  '</strong>'+refreshButton+'</header><p>Falta cerrar Noche salida del día anterior. No se puede finalizar Mañana entrada sin ese conteo.</p>'+err+'</section>';
 const rows=differences(),issues=pending();
 const items=rows.map(x=>{
  const yes=!!x.acknowledged,diff=Number(x.difference),sign=diff>0?'+':'';
  return '<li class="gcm-morning-item'+(yes?' is-confirmed':' is-difference')+'">'+
   '<div><strong>'+esc(x.section+' · '+x.name)+'</strong>'+
   '<p>Noche <b>'+x.night_total+'</b> · Mañana <b>'+x.morning_total+
   '</b> · Diferencia <b>'+sign+diff+'</b></p></div>'+
   '<label><input type="checkbox" data-gcm-morning-ok="'+esc(x.id)+'"'+(yes?' checked':'')+
   (context?.editable?'':' disabled')+'><span>'+(yes?'OK · verificado':'OK · comprobé que Mañana entrada está correcta')+'</span></label></li>';
 }).join('');
 return '<section class="gcm-morning-review'+(issues.length?' is-blocked':' is-complete')+'" aria-live="polite">'+
  '<header><div><strong>'+esc(title)+'</strong><p>Prioridad de revisión: empanadas y pizzas. Se comparan todos los productos.</p></div>'+
  '<div class="gcm-morning-actions"><strong>'+ (issues.length?issues.length+' pendiente'+(issues.length===1?'':'s'):'✓ Sin pendientes')+
  '</strong>'+refreshButton+'</div></header>'+
  (rows.length?'<p class="gcm-morning-instructions">Los productos en rojo tienen diferencia. Volvé a contarlos: corregí Mañana entrada o, si la noche anterior estaba mal, confirmá con OK cada producto revisado.</p>'+
   '<ul class="gcm-morning-items">'+items+'</ul>':
   '<p class="gcm-morning-match">✓ Todos los totales coinciden con la noche anterior.</p>')+err+'</section>';
}
function row(productId){
 const x=differences().find(x=>x.id===productId);
 if(!x)return {different:false,acknowledged:false,label:''};
 return {different:true,acknowledged:!!x.acknowledged,
  label:'Noche '+x.night_total+' · Mañana '+x.morning_total+(x.acknowledged?' · OK':' · DIFERENCIA')};
}
function paint(){
 const root=document.querySelector('.gcm-count-screen'),holder=root?.querySelector('[data-gcm-morning-holder]');
 if(!holder||!context)return;
 holder.innerHTML=panel();
 for(const tr of root.querySelectorAll('[data-gcm-morning-row]')){
  const x=row(tr.dataset.gcmMorningRow);
  tr.classList.toggle('gcm-morning-difference',x.different&&!x.acknowledged);
  tr.classList.toggle('gcm-morning-confirmed',x.different&&x.acknowledged);
  const label=tr.querySelector('[data-gcm-morning-note]');
  if(label){label.textContent=x.label;label.hidden=!x.different;}
 }
}
async function load(c,redraw=false){
 if(!connect(c))return null;
 const n=++token,k=current,ctx=context;loading=true;error='';
 try{
  const result=await ctx.rpc('gestlok_munro_conteo_compare_morning',{p_day:ctx.day});
  if(n!==token||k!==current)return null;
  if(!result||!Array.isArray(result.rows))throw Error('El servidor devolvió una comparación incompleta');
  data=result;error='';return result;
 }catch(e){
  if(n===token)error=e.message||'No se pudo consultar Noche salida';
  return null;
 }finally{
  if(n===token){loading=false;if(redraw)ctx.render?.();else paint();}
 }
}
function schedule(c){
 if(!connect(c))return;
 if(timer!==null)clearTimeout(timer);
 timer=setTimeout(()=>{timer=null;void load(c,false);},450);
}
async function acknowledge(id,checked){
 const ctx=context,x=differences().find(r=>r.id===id);
 if(!ctx||!x||!ctx.editable)return;
 if(checked&&!window.confirm('¿Volviste a controlar '+x.name+' y confirmás que Mañana entrada ('+x.morning_total+
 ') está correcta aunque Noche salida registró '+x.night_total+'? Quedará guardado quién dio OK.')){paint();return;}
 try{
  const res=await ctx.rpc('gestlok_munro_conteo_ack_morning',{
   p_day:ctx.day,p_product:id,p_confirm:checked,
   p_night_total:x.night_total,p_morning_total:x.morning_total,
   p_night_updated_at:x.night_updated_at
  });
  if(!res?.ok)throw Error('No se confirmó el OK en el servidor');
  await load(ctx,false);
  ctx.toast?.(checked?'OK registrado para '+x.name:'OK retirado para '+x.name);
 }catch(e){error=e.message||'No se pudo confirmar la diferencia';paint();ctx.toast?.(error);}
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-gcm-compare-refresh]');
 if(!b||!b.closest('.gcm-count-screen'))return;
 e.preventDefault();e.stopImmediatePropagation();
 if(context)void load(context,false);
},true);
document.addEventListener('change',e=>{
 const input=e.target.closest?.('[data-gcm-morning-ok]');
 if(!input||!input.closest('.gcm-count-screen'))return;
 e.preventDefault();e.stopImmediatePropagation();
 void acknowledge(input.dataset.gcmMorningOk,input.checked);
},true);
function clear(){++token;if(timer!==null)clearTimeout(timer);timer=null;current='';context=null;data=null;error='';loading=false;}
window.GestLokConteoMorning=Object.freeze({connect,load,schedule,panel,row,paint,ready,pending,clear,
 _test:{dayLabel,plusDays}});
})();