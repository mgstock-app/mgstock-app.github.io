/* Guided visitor tour: real app screens, fictional business adapter only. */
(()=>{
'use strict';
if(new URLSearchParams(location.search).get('demo')!=='1')return;
const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('stock/gestlok-demo-tour.css',document.baseURI).href;document.head.append(style);
const names=['Inicio','Stock','Proveedores','Personal','Tu opinión'];
let step=0,busy=false,sent=false,client=null;
const model={rating:0,comment:'',publish_consent:false,contact_consent:false,contact_name:'',contact_value:''};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function nav(){return '<nav aria-label="Etapas de la demo" class="gl-tour-nav"><button type="button" data-tour="'+(step-1)+'" '+(step===0?'disabled':'')+' aria-label="Etapa anterior">←</button>'+names.map((n,i)=>'<button type="button" data-tour="'+i+'" aria-current="'+(i===step?'step':'false')+'">'+(i+1)+'<span> '+n+'</span></button>').join('')+'<button type="button" data-tour="'+(step+1)+'" '+(step===4?'disabled':'')+' aria-label="Etapa siguiente">→</button></nav><p class="gl-tour-hint">'+['Tocá una tarjeta para descubrir su menú. Deslizá esta barra para cambiar de etapa.','Probá modificar y guardar el stock ficticio.','Armá un pedido con productos de ejemplo.','Editá los horarios y consultá un recibo ficticio.','Gracias por conocer GESTLOK. Tu opinión es opcional.'][step]+'</p>';}
function feedback(){return '<section class="gl-tour-end card pad" aria-label="Final de la demo"><img src="icons/gestlok-wordmark.svg" alt="GESTLOK" width="240"><p>Organizá tu negocio, simplificá tu día</p><h2>¡Gracias por conocernos!</h2>'+(sent?'<p role="status">Tu reseña fue enviada. ¡Gracias por ayudarnos a mejorar!</p><aside id="gl-tour-gift"><h3>🎁 Un regalo para organizar tu equipo</h3><p>Te llevás nuestra plantilla de horarios para empezar a organizar tu negocio.</p><a class="btn primary" download href="plantillas/GESTLOK-plantilla-horarios.xlsx">Descargar mi regalo</a></aside>':'<form id="gl-tour-review"><fieldset><legend>¿Qué te pareció GESTLOK?</legend>'+[1,2,3,4,5].map(n=>'<button type="button" class="gl-tour-star" data-rating="'+n+'" aria-label="'+n+' estrellas" aria-pressed="'+(model.rating===n)+'">'+(n<=model.rating?'★':'☆')+'</button>').join('')+'</fieldset><label>Comentario (opcional)<textarea name="comment" maxlength="2000" rows="3">'+esc(model.comment)+'</textarea></label><label><input type="checkbox" name="publish_consent" '+(model.publish_consent?'checked':'')+'> Autorizo que se publique mi reseña de GESTLOK, previa revisión.</label><label><input type="checkbox" name="contact_consent" '+(model.contact_consent?'checked':'')+'> Quiero que GESTLOK me contacte sobre planes y suscripciones. Autorizo el uso de mis datos para ese fin.</label><div '+(!model.contact_consent?'hidden':'')+' id="gl-tour-contact"><label>Nombre<input name="contact_name" maxlength="80" value="'+esc(model.contact_name)+'" '+(model.contact_consent?'required':'')+'></label><label>Email o teléfono<input name="contact_value" maxlength="160" value="'+esc(model.contact_value)+'" '+(model.contact_consent?'required':'')+'></label></div><p>Los datos de contacto son privados. Podés dejar una reseña sin pedir contacto. Estas reseñas son de GESTLOK y no corresponden a los locales de Mi Gusto. <a href="privacidad.html" target="_blank" rel="noopener">Privacidad</a></p><button class="btn primary" type="submit" '+(busy?'disabled':'')+'>'+(busy?'Enviando…':'Enviar reseña')+'</button><p id="gl-tour-status" role="status"></p></form>')+'</section>';}
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
 if(!window.GestLokVisitorDemo?.isReady()||!document.querySelector('.gl-owner-landing,.gl-manager-landing'))return false;
 const bar=document.createElement('section');bar.id='gl-tour-controls';document.getElementById('gl-visitor-bar').append(bar);
 const end=document.createElement('div');end.id='gl-tour-final';end.hidden=true;document.body.append(end);
 client=window.supabase.createClient(window.SPM_CONFIG.url,window.SPM_CONFIG.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 new ResizeObserver(()=>document.documentElement.style.setProperty('--gl-tour-header',document.getElementById('gl-visitor-bar').getBoundingClientRect().height+'px')).observe(document.getElementById('gl-visitor-bar'));
 paint();return true;
}
const timer=setInterval(()=>{if(init())clearInterval(timer);},250);
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-tour]');if(b){move(Number(b.dataset.tour));return;}
 const star=e.target.closest?.('[data-rating]');if(star&&!busy){model.rating=Number(star.dataset.rating);paint();}
});
document.addEventListener('input',e=>{if(!e.target.closest?.('#gl-tour-review'))return;const t=e.target;if(Object.hasOwn(model,t.name))model[t.name]=t.type==='checkbox'?t.checked:t.value;});
document.addEventListener('change',e=>{if(e.target.name==='contact_consent'&&e.target.closest?.('#gl-tour-review')){model.contact_consent=e.target.checked;if(!model.contact_consent){model.contact_name='';model.contact_value='';}paint();}});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='gl-tour-review')return;e.preventDefault();if(busy||sent)return;
 const status=message=>{const p=document.getElementById('gl-tour-status');if(p)p.textContent=message;};
 if(!model.rating){status('Elegí entre 1 y 5 estrellas.');return;}
 if(model.contact_consent&&(!model.contact_name.trim()||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(model.contact_value.trim())||/^\+?[\d\s()-]{7,25}$/.test(model.contact_value.trim())))){status('Completá tu nombre y un email o teléfono válido.');return;}
 busy=true;paint();
 try{
  const payload={...model,contact_name:model.contact_consent?model.contact_name.trim():null,contact_value:model.contact_consent?model.contact_value.trim():null};
  const {error}=await client.from('gestlok_app_reviews').insert(payload);
  if(error)throw error;
  sent=true;model.contact_name='';model.contact_value='';model.comment='';
 }catch{busy=false;paint();status('No se pudo enviar. Revisá tu conexión y volvé a intentar.');return;}
 busy=false;paint();
});
let touch=null;
document.addEventListener('touchstart',e=>{if(!e.target.closest?.('input,textarea,select,a,table,.gl-dh-scroll')&&(!e.target.closest?.('button')||e.target.closest?.('#gl-tour-controls')))touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
document.addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)move(step+(dx<0?1:-1));},{passive:true});
})();
