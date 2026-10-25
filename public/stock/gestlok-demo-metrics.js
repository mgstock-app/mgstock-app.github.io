/* GestLok · Analytics de la demo, visibles solo por Creadora autorizada. */
(()=>{
'use strict';
let api=null,loading=false,loaded=false,data=null,error='',last=0;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>Number(x||0).toLocaleString('es-AR');
function allowed(){return !!api?.isCreadora?.();}
async function refresh(force=false){
 if(!allowed()||loading)return;
 if(loaded&&!force&&Date.now()-last<60000)return;
 const sb=window.GestLokSupabase;
 if(!sb?.rpc){loaded=true;error='No se pudo conectar con el contador.';api?.renderHub?.();return;}
 loading=true;error='';
 try{
  const {data:result,error:err}=await sb.rpc('gestlok_demo_resumen');
  if(err)throw err;
  if(!allowed())return;
  data=result;loaded=true;last=Date.now();
 }catch(e){
  if(!allowed())return;
  loaded=true;error='No se pudieron cargar las estadísticas. Reintentá.';
 }finally{loading=false;if(allowed())api?.renderHub?.();}
}
function view(){
 if(!allowed())return '';
 if(!loaded&&!loading)queueMicrotask(()=>refresh());
 const n=data||{};
 const state=loading&&!loaded?'Cargando estadísticas…':
  error?esc(error):
  data?'Conteo estimado de sesiones que aceptaron estadísticas. No identifica personas ni visitas de otros dispositivos.':
  'Todavía no hay información.';
 return '<section class="gl-admin-card gl-demo-analytics" id="gl-demo-analytics" aria-label="Estadísticas de la demo pública">'+
  '<header><div><h2>Visitantes de la demo</h2><small>Datos agregados · Solo Administradora General</small></div>'+
  '<button type="button" class="btn sm" data-gl-demo-refresh '+(loading?'disabled':'')+'>Actualizar</button></header>'+
  '<p class="lead">'+state+'</p>'+
  '<div class="gl-demo-analytics-stats">'+
   [['Sesiones registradas',n.sesiones],['Exploraron Dueña',n.duena],['Exploraron Gerente',n.gerente],
    ['Probaron ambos roles',n.ambos],['Últimos 7 días',n.ultimos7]].map(([label,value])=>
      '<article><small>'+label+'</small><strong>'+(!loaded||error?'—':fmt(value))+'</strong></article>').join('')+
  '</div>'+
  '<div class="gl-demo-analytics-shops">'+
   '<div><b>Mercado Central</b><span>'+(loaded&&!error?fmt(n.mercado):'—')+' sesiones</span></div>'+
   '<div><b>Nova Indumentaria</b><span>'+(loaded&&!error?fmt(n.nova):'—')+' sesiones</span></div>'+
  '</div>'+
  '<p class="note">Una sesión puede explorar los dos roles y tiendas, por eso los subtotales pueden superar el total. No contamos a quienes rechazan estadísticas.</p>'+
 '</section>';
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-gl-demo-refresh]');
 if(b && allowed()){e.preventDefault();refresh(true);}
});
window.GestLokDemoMetrics=Object.freeze({attach(ctx){api=ctx;},view,refresh});
})();
