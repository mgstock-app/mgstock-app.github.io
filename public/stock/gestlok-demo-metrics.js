/* GestLok · Analytics de la demo, visibles solo por Creadora autorizada. */
(()=>{
'use strict';
let api=null,loading=false,loaded=false,data=null,error='',last=0;
let reviews=[],reviewsLoaded=false,reviewsLoading=false,reviewsError='';
async function loadReviews(){if(!allowed()||reviewsLoading)return;reviewsLoading=true;reviewsError='';try{const {data,error}=await window.GestLokSupabase.rpc('gestlok_creator_reviews');if(error)throw error;reviews=Array.isArray(data)?data:[];reviewsLoaded=true;}catch{reviewsError='No se pudieron cargar las reseñas.';}finally{reviewsLoading=false;if(allowed())api?.renderHub?.();}}
function reviewView(){if(!reviewsLoaded&&!reviewsLoading)queueMicrotask(loadReviews);return '<section class="gl-admin-card" aria-label="Reseñas de GESTLOK"><header><h2>Reseñas de la demo GESTLOK</h2><button type="button" data-gl-reviews-refresh>Actualizar</button></header><p>Solo creadora · Contactar únicamente a quienes lo autorizaron.</p>'+(reviewsError?'<p>'+esc(reviewsError)+'</p>':reviewsLoading&&!reviewsLoaded?'<p>Cargando reseñas…</p>':reviews.length?reviews.map(r=>'<article style="padding:12px;border-top:1px solid #ddd"><b>'+('★'.repeat(Math.min(5,Math.max(0,Number(r.rating)||0))))+'</b> <small>'+esc(String(r.created_at||'').slice(0,10))+'</small><p>'+esc(r.comment||'Sin comentario')+'</p><small>'+(r.publish_consent?'Autorizó publicar testimonio':'No autorizó publicar testimonio')+'</small>'+(r.contact_consent?'<p>Solicitó contacto: '+esc(r.contact_name||'')+' · '+esc(r.contact_value||'')+'</p>':'')+'</article>').join(''):'<p>Aún no hay reseñas.</p>')+'</section>';}

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
 '</section>'+reviewView();
}
document.addEventListener('click',e=>{
 const review=e.target.closest?.('[data-gl-reviews-refresh]');if(review&&allowed()){e.preventDefault();loadReviews();return;}
 const b=e.target.closest?.('[data-gl-demo-refresh]');
 if(b && allowed()){e.preventDefault();refresh(true);}
});
window.GestLokDemoMetrics=Object.freeze({attach(ctx){api=ctx;},view,refresh});
})();
