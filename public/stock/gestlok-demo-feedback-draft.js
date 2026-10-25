/* BORRADOR DE GESTLOK — texto y formulario sujetos a aprobación.
 * El módulo NO se carga en la web publicada, no envía ni almacena contactos.
 * Solo prepara la vista final de la demo con valoración opcional de texto.
 */
(()=>{
'use strict';
const stars=[1,2,3,4,5];
const labels=['Muy mala','Regular','Buena','Muy buena','Excelente'];
const model={stars:0,comment:'',interest:'no',name:'',channel:'whatsapp',contact:'',consent:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function view(){
 const interested=model.interest==='si';
 return '<section id="gl-demo-feedback" class="gl-demo-feedback" aria-labelledby="gl-demo-feedback-title">'+
 '<header class="gl-demo-feedback-header">'+
 '<p class="eyebrow">GESTLOK · FINAL DE LA DEMOSTRACIÓN</p>'+
 '<h2 id="gl-demo-feedback-title">¿Qué te pareció GestLok?</h2>'+
 '<p>¡Gracias por explorar nuestra demo! Tu opinión nos ayuda a mejorar.</p>'+
 '</header><form id="gl-demo-feedback-form" novalidate>'+
 '<fieldset class="gl-demo-rating"><legend>Calificá tu experiencia</legend>'+
 '<div class="gl-demo-stars" role="group" aria-label="Puntaje de la demo de 1 a 5 estrellas">'+
 stars.map(n=>'<button class="gl-demo-star '+(n<=model.stars?'selected':'')+'" type="button" data-demo-star="'+n+
 '" aria-pressed="'+(model.stars===n)+'" aria-label="'+n+' '+(n===1?'estrella':'estrellas')+' · '+labels[n-1]+'">'+
 '<span aria-hidden="true">★</span></button>').join('')+
 '</div><p class="gl-demo-rating-caption" role="status">'+(model.stars?labels[model.stars-1]+' · '+model.stars+' de 5 estrellas':'Tocá las estrellas para calificar')+'</p></fieldset>'+
 '<div class="gl-demo-feedback-field"><label for="gl-demo-comment">¿Querés dejarnos un comentario? <small>(Opcional)</small></label>'+
 '<textarea name="comment" id="gl-demo-comment" maxlength="500" rows="3" placeholder="Contanos qué te gustó o qué mejorarías. Si preferís, dejalo en blanco.">'+esc(model.comment)+'</textarea></div>'+
 '<fieldset class="gl-demo-feedback-interest"><legend>¿Querés recibir información sobre los planes, precios y promociones de GestLok?</legend>'+
 '<label><input type="radio" name="interest" value="si" '+(interested?'checked':'')+'> Sí, me gustaría recibir información.</label>'+
 '<label><input type="radio" name="interest" value="no" '+(!interested?'checked':'')+'> No, gracias. Solo quiero valorar la demo.</label></fieldset>'+
 (interested?'<div class="gl-demo-feedback-contact">'+
 '<p>¡Genial! Contanos cómo preferís que te contactemos.</p>'+
 '<div class="gl-demo-feedback-field"><label for="gl-demo-contact-name">Nombre</label>'+
 '<input id="gl-demo-contact-name" name="name" type="text" maxlength="80" autocomplete="name" required placeholder="Tu nombre" value="'+esc(model.name)+'"></div>'+
 '<div class="gl-demo-feedback-field"><label for="gl-demo-contact-method">Prefiero que me contacten por</label>'+
 '<select id="gl-demo-contact-method" name="channel"><option value="whatsapp" '+(model.channel==='whatsapp'?'selected':'')+'>WhatsApp</option>'+
 '<option value="email" '+(model.channel==='email'?'selected':'')+'>Correo electrónico</option></select></div>'+
 '<div class="gl-demo-feedback-field"><label for="gl-demo-contact-value">'+(model.channel==='email'?'Correo electrónico':'Número de WhatsApp')+'</label>'+
 '<input id="gl-demo-contact-value" name="contact" type="'+(model.channel==='email'?'email':'tel')+'" maxlength="160" required '+
 'autocomplete="'+(model.channel==='email'?'email':'tel')+'" placeholder="'+(model.channel==='email'?'ejemplo@correo.com':'+54 9 11 1234-5678')+'" value="'+esc(model.contact)+'"></div>'+
 '<label class="gl-demo-marketing"><input type="checkbox" name="consent" '+(model.consent?'checked':'')+' required>'+
 '<span>Autorizo a GestLok a contactarme por el medio elegido con información sobre planes, precios y promociones. Puedo pedir que dejen de contactarme cuando quiera.</span></label></div>':'')+
 '<p class="gl-demo-feedback-small">Tu calificación no te suscribe a mensajes comerciales. Este paso es opcional y podés salir sin completarlo.</p>'+
 '<div class="gl-demo-feedback-actions"><button class="btn primary" type="submit" disabled>Enviar respuesta · Próximamente</button>'+
 '<small>Vista previa del formulario: todavía no se guardan ni envían respuestas.</small></div>'+
 '</form></section>';
}
function mount(target){
 if(!target)return;
 const existing=target.querySelector('#gl-demo-feedback');
 if(existing){existing.outerHTML=view();return;}
 target.insertAdjacentHTML('beforeend',view());
}
function redraw(){
 const old=document.getElementById('gl-demo-feedback');
 if(old)old.outerHTML=view();
}
document.addEventListener('click',event=>{
 const btn=event.target.closest?.('[data-demo-star]');
 if(!btn || !btn.closest('#gl-demo-feedback'))return;
 event.preventDefault();
 model.stars=Number(btn.dataset.demoStar);
 if(!stars.includes(model.stars))return;
 redraw();
});
document.addEventListener('input',event=>{
 const item=event.target;if(!item.closest?.('#gl-demo-feedback-form'))return;
 if(item.name==='comment')model.comment=item.value.slice(0,500);
 else if(item.name==='name')model.name=item.value.slice(0,80);
 else if(item.name==='contact')model.contact=item.value.slice(0,160);
 else if(item.name==='consent')model.consent=!!item.checked;
});
document.addEventListener('change',event=>{
 const item=event.target;if(!item.closest?.('#gl-demo-feedback-form'))return;
 if(item.name==='interest'){
  model.interest=item.value==='si'?'si':'no';
  if(model.interest==='no')model.consent=false;
  redraw();
 }else if(item.name==='channel'){
  model.channel=item.value==='email'?'email':'whatsapp';
  model.contact='';
  redraw();
 }
});
document.addEventListener('submit',event=>{
 if(event.target.id==='gl-demo-feedback-form')event.preventDefault();
});
window.GestLokDemoFeedbackDraft=Object.freeze({view,mount,preview:true});
})();