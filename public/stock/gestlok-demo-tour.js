/* Guided visitor tour: real app screens, fictional business adapter only. */
(()=>{
'use strict';
if(new URLSearchParams(location.search).get('demo')!=='1')return;
const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('stock/gestlok-demo-tour.css',document.baseURI).href;document.head.append(style);
const names=['Inicio','Stock','Proveedores','Personal','Final'];
let step=0, sent=false, saving=false, rating=0;
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function nav(){return '<nav aria-label="Etapas de la demo" class="gl-tour-nav"><button type="button" data-tour="'+(step-1)+'" '+(step===0?'disabled':'')+' aria-label="Etapa anterior">←</button>'+names.map((n,i)=>'<button type="button" data-tour="'+i+'" aria-current="'+(i===step?'step':'false')+'">'+(i+1)+'<span> '+n+'</span></button>').join('')+'<button type="button" data-tour="'+(step+1)+'" '+(step===4?'disabled':'')+' aria-label="Etapa siguiente">→</button></nav><p class="gl-tour-hint">'+['Tocá una tarjeta para descubrir su menú. Deslizá esta barra para cambiar de etapa.','Probá modificar y guardar el stock ficticio.','Armá un pedido con productos de ejemplo.','Editá los horarios y consultá un recibo ficticio.','¡Terminaste el recorrido! Podés volver a explorar las etapas.'][step]+'</p>';}
function feedback(){return '<section class="gl-tour-end card pad" aria-label="Reseña de GESTLOK"><img src="icons/gestlok-wordmark.svg" alt="GESTLOK" width="240"><p>Organizá tu negocio, simplificá tu día</p>'+(sent?'<h2>¡Gracias por tu reseña!</h2><p>Tu opinión se guardó correctamente.</p><div id="gl-tour-gift"><h3>🎁 Tu regalo sorpresa</h3><p>¡Gracias por ayudarnos a mejorar! Pronto habrá novedades especiales para quienes prueban GESTLOK.</p></div><button type="button" data-tour="0">Volver a explorar</button>':'<h2>¿Qué te pareció la demo?</h2><p>Calificá tu experiencia. Tu comentario y tus datos son opcionales.</p><form id="gl-tour-review-form"><fieldset><legend>Tu calificación (obligatoria)</legend>'+[1,2,3,4,5].map(n=>'<button type="button" class="gl-tour-star" data-review-star="'+n+'" aria-label="'+n+' estrellas" aria-pressed="'+(rating===n)+'">'+(n<=rating?'★':'☆')+'</button>').join('')+'</fieldset><label>Comentario (opcional)<textarea name="comment" maxlength="1000" rows="3"></textarea></label><label><input type="checkbox" name="publish_consent"> Autorizo que publiquen mi comentario como testimonio (opcional).</label><label><input type="checkbox" name="contact_consent"> Quiero que me contacten para conocer planes y promociones.</label><label>Nombre (opcional)<input name="contact_name" maxlength="100"></label><label>Email o teléfono (opcional)<input name="contact_value" maxlength="180"></label><p>Solo usaremos tu contacto si solicitás información. Podés enviar tu calificación sin compartir datos personales.</p><p id="gl-tour-review-status" role="status"></p><button class="btn primary" type="submit">Enviar reseña</button></form>')+'</section>';}

function paint(){document.getElementById('gl-tour-controls').innerHTML=nav();if(step===4)document.getElementById('gl-tour-final').innerHTML=feedback();}
async function move(n){
 if(!Number.isInteger(n)||n<0||n>4)return;
 step=n;window.GestLokDemoHorarios?.close();
 document.getElementById('gl-tour-final').hidden=step!==4;
 document.documentElement.classList.toggle('gl-tour-finished',step===4);
 paint();
 if(step===0)document.querySelector('#snav [data-act="locales"]')?.click();
 if(step===1||step===2){
  if(document.getElementById('app')?.hidden)document.querySelector('.gl-owner-business .gl-owner-arrow, [data-gerente-business]')?.click();
  const route=step===1?'stock':'proveedores';
  document.querySelector('#snav [data-go="'+route+'"]')?.click();
 }
 if(step===3){await window.GestLokDemoHorarios?.open();if(step!==3)window.GestLokDemoHorarios?.close();}
}
function init(){
 if(!window.GestLokVisitorDemo?.isReady()||!document.querySelector('.gl-owner-landing,.gl-manager-landing')||!document.getElementById('gl-visitor-bar'))return false;
 const bar=document.createElement('section');bar.id='gl-tour-controls';document.getElementById('gl-visitor-bar').append(bar);
 const end=document.createElement('div');end.id='gl-tour-final';end.hidden=true;document.body.append(end);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>document.documentElement.style.setProperty('--gl-tour-header',document.getElementById('gl-visitor-bar').getBoundingClientRect().height+'px')).observe(document.getElementById('gl-visitor-bar'));
 paint();return true;
}
const timer=setInterval(()=>{if(init())clearInterval(timer);},250);
document.addEventListener('click',e=>{
 const star=e.target.closest?.('[data-review-star]');if(star){rating=Number(star.dataset.reviewStar);document.querySelectorAll('[data-review-star]').forEach(el=>{const n=Number(el.dataset.reviewStar);el.textContent=n<=rating?'★':'☆';el.setAttribute('aria-pressed',String(n===rating));});return;}
 const b=e.target.closest?.('[data-tour]');if(b){move(Number(b.dataset.tour));return;}
});
document.addEventListener('submit',async e=>{if(e.target.id!=='gl-tour-review-form')return;e.preventDefault();if(saving)return;const form=e.target,status=document.getElementById('gl-tour-review-status');if(!rating){status.textContent='Elegí entre 1 y 5 estrellas.';return;}const data=new FormData(form),wantContact=data.has('contact_consent'),contact=String(data.get('contact_value')||'').trim();if(wantContact&&!contact){status.textContent='Para recibir información, ingresá un email o teléfono.';return;}saving=true;form.querySelector('[type=submit]').disabled=true;status.textContent='Guardando reseña…';try{const client=window.supabase.createClient(window.SPM_CONFIG.url,window.SPM_CONFIG.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const payload={rating,comment:String(data.get('comment')||'').trim()||null,publish_consent:data.has('publish_consent'),contact_consent:wantContact,contact_name:wantContact?String(data.get('contact_name')||'').trim()||null:null,contact_value:wantContact?contact:null};const {error}=await client.from('gestlok_app_reviews').insert(payload);if(error)throw error;sent=true;paint();}catch(err){status.textContent='No pudimos guardar la reseña. Intentá nuevamente.';form.querySelector('[type=submit]').disabled=false;console.warn('Reseña no guardada',err?.message);}finally{saving=false;} });
let touch=null;
document.addEventListener('touchstart',e=>{if(!e.target.closest?.('input,textarea,select,a,table,.gl-dh-scroll')&&(!e.target.closest?.('button')||e.target.closest?.('#gl-tour-controls')))touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
document.addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)move(step+(dx<0?1:-1));},{passive:true});
})();
