/* Guided visitor tour: real app screens, fictional business adapter only. */
(()=>{
'use strict';
if(new URLSearchParams(location.search).get('demo')!=='1')return;
const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('stock/gestlok-demo-tour.css',document.baseURI).href;document.head.append(style);
 const mobileStyle=document.createElement('link');mobileStyle.rel='stylesheet';mobileStyle.href=new URL('stock/gestlok-demo-mobile.css',document.baseURI).href;document.head.append(mobileStyle);
const showcaseStyle=document.createElement('link');showcaseStyle.rel='stylesheet';showcaseStyle.href=new URL('stock/gestlok-demo-showcase.css?rev=nueve-etapas-20261029',document.baseURI).href;document.head.append(showcaseStyle);
const stages=[
 {name:'Inicio',title:'Un negocio, todo en orden',desc:'Explorá el inicio actualizado de GESTLOK. Abrí las tarjetas de administración y conocé los accesos del dueño o gerente.',hint:'Tocá una tarjeta y recorré el inicio.'},
 {name:'Empresa',title:'Administrá cada producto',desc:'Entrá al stock real de la demo y probá las cantidades y los datos ficticios. Tu información comercial nunca se modifica.',hint:'Probá el stock y el catálogo de ejemplo.'},
 {name:'Proveedores',title:'Organizá tus proveedores',desc:'Conocé los pedidos de mercadería, los proveedores y sus historiales desde las carpetas de la app.',hint:'Abrí los proveedores y revisá sus herramientas.'},
 {name:'Colaboradores',title:'Tu equipo, organizado',desc:'Consultá legajos y estados ficticios. Explorá Horarios y, como Dueña, un recibo de demostración. El gerente no puede ver sueldos.',hint:'Probá un legajo y sus opciones de Horarios.'},
 {name:'Precios',title:'Controlá precios y ganancias',desc:'Cargá el costo y el porcentaje de recargo: GESTLOK calcula el precio de venta y la ganancia bruta por unidad.',hint:'Modificá el costo y el porcentaje en el teléfono.'},
 {name:'Stock',title:'Conocé tus existencias',desc:'Llevá un conteo por producto, fijá mínimos y detectá faltantes. Esta etapa simula el nuevo control de stock.',hint:'Sumá o restá unidades de los artículos ficticios.'},
 {name:'Pedidos',title:'Registrá pedidos del día',desc:'Armá un pedido y cambialo de pendiente a preparado o entregado. Descubrí qué productos se mueven más.',hint:'Guardá un pedido ficticio y avanzá su estado.'},
 {name:'Vencimientos',title:'Anticipate a los vencimientos',desc:'Revisá fechas próximas y tareas de mantenimiento desde la aplicación. Probá los registros de ejemplo.',hint:'Entrá a Vencimientos y explorá las fechas de ejemplo.'},
 {name:'Final',title:'¿Qué te pareció GESTLOK?',desc:'Terminaste el recorrido. Tu reseña es bienvenida y podés dejar un contacto opcional. El cupón aparece únicamente después de enviar la reseña.',hint:'Calificá la demo o volvé a explorar sus etapas.'}
];
const names=stages.map(s=>s.name),last=stages.length-1;
let step=0, sent=false, saving=false, rating=0, couponCode='';
let commentDraft='',publishDraft=false,contactDraft=false,nameDraft='',valueDraft='';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v)||0);
const demoShop=new URLSearchParams(location.search).get('shop')==='nova'?'nova':'mercado';
const simulationKey='gestlok:guided:products:v2:'+demoShop;
function originalItems(){
 const nova=demoShop==='nova';
 return (nova?[
  ['Remera básica','Ropa',3800,60,12],
  ['Jean recto','Indumentaria',13200,75,5],
  ['Buzo algodón','Abrigos',9800,70,0]
 ]:[
  ['Café molido','Almacén',4800,45,12],
  ['Galletitas','Almacén',1800,55,5],
  ['Agua mineral','Bebidas',1200,40,0]
 ]).map((r,i)=>({id:i,name:r[0],category:r[1],cost:r[2],markup:r[3],stock:r[4],min:3}));
}
function initialSimulation(){
 try{
  const saved=JSON.parse(sessionStorage.getItem(simulationKey)||'null');
  if(saved?.version===2&&Array.isArray(saved.items)&&saved.items.length===3&&Array.isArray(saved.orders))return saved;
 }catch{}
 return {version:2,items:originalItems(),orders:[]};
}
let practice=initialSimulation();
const persist=()=>{try{sessionStorage.setItem(simulationKey,JSON.stringify(practice));}catch{}};
function nav(){
 return '<nav aria-label="Etapas de la demo" class="gl-tour-nav"><button type="button" data-tour="'+(step-1)+'" '+(step===0?'disabled':'')+' aria-label="Etapa anterior">←</button>'+
 names.map((n,i)=>'<button type="button" data-tour="'+i+'" aria-label="Etapa '+(i+1)+': '+n+'" aria-current="'+(i===step?'step':'false')+'">'+(i+1)+'<span> '+n+'</span></button>').join('')+
 '<button type="button" data-tour="'+(step+1)+'" '+(step===last?'disabled':'')+' aria-label="Etapa siguiente">→</button></nav>'+
 '<p class="gl-tour-hint">'+stages[step].hint+'</p>';
}
function story(){
 return '<div class="gl-tour-story-kicker">DEMO INTERACTIVA · '+(step+1)+' / '+stages.length+'</div>'+
 '<h1>Conocé <span>GESTLOK</span> etapa por etapa</h1><div class="gl-tour-story-rule"></div>'+
 '<p class="gl-tour-story-label">ETAPA '+(step+1)+' · '+stages[step].name.toUpperCase()+'</p>'+
 '<h2 id="gl-tour-stage-title">'+stages[step].title+'</h2>'+
 '<p class="gl-tour-story-description">'+stages[step].desc+'</p>'+
 '<div class="gl-tour-story-note"><span aria-hidden="true">↔</span> Deslizá el carrusel manualmente o usá las flechas. Probá cada pantalla dentro del teléfono.</div>';
}
function sandbox(){
 const items=practice.items,quantity=q=>Math.max(0,Number(q)||0);
 const cards='<div class="gl-tour-demo-products">'+items.map(p=>'<article class="gl-tour-demo-item"><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.category)+'</small></div>'+
 (step===4?'<span>'+money(p.cost*(1+p.markup/100))+'</span>':
 step===5?'<div class="gl-tour-demo-count"><button type="button" data-practice-adjust="'+p.id+':-1" aria-label="Restar '+esc(p.name)+'">−</button><output>'+quantity(p.stock)+'</output><button type="button" data-practice-adjust="'+p.id+':1" aria-label="Sumar '+esc(p.name)+'">+</button></div>':
 '<span>'+money(p.cost*(1+p.markup/100))+'</span>')+'</article>').join('')+'</div>';
 if(step===4){
 const p=items[0];
 return '<div class="gl-tour-demo-view"><small>GESTLOK · DEMOSTRACIÓN</small><h2>Precios</h2><p>Calculá tu precio a vender.</p>'+cards+
 '<form id="gl-tour-price-form" class="gl-tour-demo-form"><label>Producto<select name="product">'+items.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select></label>'+
 '<label>Costo (ARS)<input name="cost" type="number" min="0" step=".01" value="'+p.cost+'" required></label>'+
 '<label>Recargo (%)<input name="markup" type="number" min="0" max="5000" step=".01" value="'+p.markup+'" required></label>'+
 '<div class="gl-tour-demo-math"><span>Precio de venta <strong data-practice-sale>'+money(p.cost*(1+p.markup/100))+'</strong></span><span>Ganancia bruta <strong data-practice-profit>'+money(p.cost*p.markup/100)+'</strong></span></div>'+
 '<button type="submit">Guardar precios ficticios</button></form></div>';
 }
 if(step===5){
 return '<div class="gl-tour-demo-view"><small>GESTLOK · DEMOSTRACIÓN</small><h2>Stock</h2><p>Actualizá unidades con + y −.</p>'+
 '<div class="gl-tour-demo-kpis"><div>Con stock <b>'+items.filter(p=>p.stock>0).length+'</b></div><div>Sin stock <b>'+items.filter(p=>p.stock===0).length+'</b></div></div>'+cards+
 '<p class="gl-tour-demo-note">Stock manual de ejemplo · Queda guardado solo en esta pestaña.</p></div>';
 }
 if(step===6){
 return '<div class="gl-tour-demo-view"><small>GESTLOK · DEMOSTRACIÓN</small><h2>Pedidos del día</h2><p>Registrá y prepará pedidos ficticios.</p>'+
 '<div class="gl-tour-demo-kpis"><div>Pedidos <b>'+practice.orders.length+'</b></div><div>Entregados <b>'+practice.orders.filter(o=>o.status==='entregado').length+'</b></div></div>'+
 '<form id="gl-tour-order-form" class="gl-tour-demo-form"><label>Producto<select name="product">'+items.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select></label>'+
 '<label>Unidades<input type="number" name="quantity" min="1" max="20" value="1" required></label><button type="submit">Crear pedido ficticio</button></form>'+
 '<div class="gl-tour-demo-orders">'+practice.orders.slice(-6).reverse().map(o=>{
 const p=items.find(p=>p.id===o.product);
 return '<div><span><strong>'+(p?esc(p.name):'Producto')+'</strong><small>'+o.qty+' unidad(es) · '+(o.status==='pendiente'?'Pendiente':o.status==='preparado'?'Preparado':'Entregado')+'</small></span>'+
 (o.status!=='entregado'?'<button type="button" data-practice-next="'+o.id+'">'+(o.status==='pendiente'?'Preparar':'Entregar')+'</button>':'<span>✓</span>')+'</div>';
 }).join('')+'</div></div>';
 }
 return '';
}
function feedback(){return '<section class="gl-tour-end card pad" aria-label="Reseña de GESTLOK"><img src="icons/gestlok-wordmark.svg" alt="GESTLOK" width="240"><p>Organizá tu negocio, simplificá tu día</p>'+(sent?'<h2>¡Gracias por tu reseña!</h2><p>Tu opinión se guardó correctamente.</p><div id="gl-tour-gift"><h3>🎁 Tu regalo sorpresa</h3><p>¡Gracias por ayudarnos a mejorar! Este es tu cupón exclusivo GESTLOK.</p><div class="gl-tour-coupon" role="status" aria-label="Cupón único GESTLOK"><small>CUPÓN EXCLUSIVO GESTLOK</small><strong>'+couponCode+'</strong><span>Guardá este código. Beneficio sujeto a condiciones que se comunicarán próximamente.</span></div><button type="button" data-coupon-copy>Copiar código</button></div><button type="button" data-tour="0">Volver a explorar</button>':'<h2>¿Qué te pareció la demo?</h2><p>Calificá tu experiencia. Tu comentario y tus datos son opcionales.</p><form id="gl-tour-review-form"><fieldset><legend>Tu calificación (obligatoria)</legend>'+[1,2,3,4,5].map(n=>'<button type="button" class="gl-tour-star" data-review-star="'+n+'" aria-label="'+n+' estrellas" aria-pressed="'+(rating===n)+'">'+(n<=rating?'★':'☆')+'</button>').join('')+'</fieldset><label>Comentario (opcional)<textarea name="comment" maxlength="1000" rows="3"></textarea></label><label><input type="checkbox" name="publish_consent"> Autorizo que publiquen mi comentario como testimonio (opcional).</label><label><input type="checkbox" name="contact_consent"> Quiero que me contacten para conocer planes y promociones.</label><label>Nombre (opcional)<input name="contact_name" maxlength="100"></label><label>Email o teléfono (opcional)<input name="contact_value" maxlength="180"></label><p>Solo usaremos tu contacto si solicitás información. Podés enviar tu calificación sin compartir datos personales.</p><p id="gl-tour-review-status" role="status"></p><button class="btn primary" type="submit">Enviar reseña</button></form>')+'</section>';}

function saveDraft(){const f=document.getElementById('gl-tour-review-form');if(!f)return;const d=new FormData(f);commentDraft=String(d.get('comment')||'');publishDraft=d.has('publish_consent');contactDraft=d.has('contact_consent');nameDraft=String(d.get('contact_name')||'');valueDraft=String(d.get('contact_value')||'');}
function paint(){
 const controls=document.getElementById('gl-tour-controls');
 if(controls)controls.innerHTML=nav();
 const narrative=document.getElementById('gl-tour-story-content');
 if(narrative)narrative.innerHTML=story();
 const fake=document.getElementById('gl-tour-sandbox');
 if(fake){fake.hidden=![4,5,6].includes(step);if(!fake.hidden)fake.innerHTML=sandbox();}
 const end=document.getElementById('gl-tour-final');
 if(step===last&&end){
  end.innerHTML=feedback();
  const f=end.querySelector('#gl-tour-review-form');
  if(f){f.elements.comment.value=commentDraft;f.elements.publish_consent.checked=publishDraft;
    f.elements.contact_consent.checked=contactDraft;f.elements.contact_name.value=nameDraft;f.elements.contact_value.value=valueDraft;}
 }
}
async function move(n){
 if(!Number.isInteger(n)||n<0||n>last)return;
 saveDraft();step=n;
 window.GestLokDemoHorarios?.close();
 document.getElementById('gl-tour-final').hidden=step!==last;
 document.documentElement.classList.toggle('gl-tour-finished',step===last);
 document.documentElement.classList.toggle('gl-tour-sandbox-active',[4,5,6].includes(step));
 paint();
 if(step===0)document.querySelector('#snav [data-act="locales"]')?.click();
 if([1,2,7].includes(step)){
  if(document.getElementById('app')?.hidden)document.querySelector('.gl-owner-business .gl-owner-arrow,[data-gerente-business]')?.click();
  const route=step===1?'stock':step===2?'proveedores':'vencimientos';
  document.querySelector('#snav [data-go="'+route+'"]')?.click();
 }
 if(step===3){await window.GestLokDemoHorarios?.open({section:'colaboradores'});if(step!==3)window.GestLokDemoHorarios?.close();}
 const phone=document.getElementById('gl-tour-phone-screen');if(phone)phone.scrollTop=0;
}
function init(){
 if(!window.GestLokVisitorDemo?.isReady()||!document.querySelector('.gl-owner-landing,.gl-manager-landing')||!document.getElementById('gl-visitor-bar'))return false;
 const root=document.getElementById('stock-root');
 const hub=document.getElementById('hub'),app=document.getElementById('app');
 if(!root||!hub||!app)return false;
 const layout=document.createElement('section');
 layout.id='gl-tour-layout';layout.setAttribute('aria-label','Recorrido interactivo GESTLOK');
 const storyEl=document.createElement('aside');storyEl.id='gl-tour-story';
 storyEl.innerHTML='<div id="gl-tour-story-content"></div><div id="gl-tour-controls"></div>';
 const shell=document.createElement('div');shell.id='gl-tour-phone';
 shell.innerHTML='<div class="gl-tour-phone-frame"><div class="gl-tour-phone-notch" aria-hidden="true"></div>'+
  '<div class="gl-tour-phone-screen" id="gl-tour-phone-screen"></div></div>'+
  '<p class="gl-tour-phone-caption">PANTALLA INTERACTIVA · DATOS FICTICIOS</p>';
 const screen=shell.querySelector('#gl-tour-phone-screen');
 const fake=document.createElement('div');fake.id='gl-tour-sandbox';fake.hidden=true;
 const end=document.createElement('div');end.id='gl-tour-final';end.hidden=true;
 screen.append(hub,app,fake,end);
 const dock=document.getElementById('gestlok-mobile-dock'),sheet=document.getElementById('gestlok-mobile-sheet');
 if(dock)screen.append(dock);
 if(sheet)screen.append(sheet);
 layout.append(storyEl,shell);
 root.append(layout);
 document.documentElement.classList.add('gl-tour-layout-active');
 // Empleados funciona con las pantallas reales de la demo. Se integra al teléfono
 // sin duplicar la interfaz ni consultar a la base real.
 if(typeof MutationObserver!=='undefined'){
  const ob=new MutationObserver(()=>{
   const emp=document.getElementById('gl-demo-emp');
   if(emp&&emp.parentElement!==screen)screen.append(emp);
  });
  ob.observe(document.body,{childList:true,subtree:true});
 }
 paint();
 return true;
}
const timer=setInterval(()=>{if(init())clearInterval(timer);},250);
document.addEventListener('click',e=>{
 const copy=e.target.closest?.('[data-coupon-copy]');if(copy&&couponCode){navigator.clipboard?.writeText(couponCode).then(()=>{copy.textContent='¡Copiado!';}).catch(()=>{copy.textContent=couponCode;});return;} const star=e.target.closest?.('[data-review-star]');if(star){rating=Number(star.dataset.reviewStar);document.querySelectorAll('[data-review-star]').forEach(el=>{const n=Number(el.dataset.reviewStar);el.textContent=n<=rating?'★':'☆';el.setAttribute('aria-pressed',String(n===rating));});return;}
 const b=e.target.closest?.('[data-tour]');if(b){move(Number(b.dataset.tour));return;}
});
document.addEventListener('submit',async e=>{if(e.target.id!=='gl-tour-review-form')return;e.preventDefault();if(saving)return;const form=e.target,status=document.getElementById('gl-tour-review-status');if(!rating){status.textContent='Elegí entre 1 y 5 estrellas.';return;}const data=new FormData(form),wantContact=data.has('contact_consent'),contact=String(data.get('contact_value')||'').trim();if(wantContact&&!contact){status.textContent='Para recibir información, ingresá un email o teléfono.';return;}if(wantContact&&!/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+?[0-9 ()-]{7,25})$/.test(contact)){status.textContent='Ingresá un email o teléfono válido.';return;}saving=true;form.querySelector('[type=submit]').disabled=true;status.textContent='Guardando reseña…';try{const client=window.supabase.createClient(window.SPM_CONFIG.url,window.SPM_CONFIG.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const payload={rating,comment:String(data.get('comment')||'').trim()||null,publish_consent:data.has('publish_consent'),contact_consent:wantContact,contact_name:wantContact?String(data.get('contact_name')||'').trim()||null:null,contact_value:wantContact?contact:null};const {data:code,error}=await client.rpc('gestlok_demo_enviar_resena_cupon',{p_rating:payload.rating,p_comment:payload.comment,p_publish_consent:payload.publish_consent,p_contact_consent:payload.contact_consent,p_contact_name:payload.contact_name,p_contact_value:payload.contact_value});if(error)throw error;if(!/^G-[0-9]{3}$/.test(code))throw Error('Cupón inválido');couponCode=code;sent=true;paint();}catch(err){status.textContent='No pudimos guardar la reseña. Intentá nuevamente.';form.querySelector('[type=submit]').disabled=false;console.warn('Reseña no guardada',err?.message);}finally{saving=false;} });
// Solo navegación manual. No hay temporizadores que avancen el carrusel.
let touch=null;
document.addEventListener('touchstart',e=>{
 if(!e.target.closest?.('#gl-tour-layout'))return;
 if(e.target.closest?.('input,textarea,select,button,a,table,.gl-dh-scroll,.gl-tour-demo-orders'))return;
 touch={x:e.touches[0].clientX,y:e.touches[0].clientY};
},{passive:true});
document.addEventListener('touchend',e=>{
 if(!touch)return;
 const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;
 if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.6)move(step+(dx<0?1:-1));
},{passive:true});
document.addEventListener('input',e=>{
 const f=e.target.closest?.('#gl-tour-price-form');if(!f)return;
 const selected=practice.items.find(p=>p.id===Number(f.elements.product.value))||practice.items[0];
 if(e.target.name==='product'){f.elements.cost.value=selected.cost;f.elements.markup.value=selected.markup;}
 const cost=Number(f.elements.cost.value)||0,markup=Number(f.elements.markup.value)||0;
 const sale=cost*(1+markup/100);
 f.querySelector('[data-practice-sale]').textContent=money(sale);
 f.querySelector('[data-practice-profit]').textContent=money(sale-cost);
});
document.addEventListener('click',e=>{
 const adjust=e.target.closest?.('[data-practice-adjust]');
 if(adjust){
  const [id,delta]=adjust.dataset.practiceAdjust.split(':').map(Number);
  const p=practice.items.find(p=>p.id===id);
  if(p){p.stock=Math.max(0,Math.min(99999,p.stock+delta));persist();paint();}
  return;
 }
 const next=e.target.closest?.('[data-practice-next]');
 if(next){
  const o=practice.orders.find(o=>o.id===Number(next.dataset.practiceNext));
  if(o){o.status=o.status==='pendiente'?'preparado':'entregado';persist();paint();}
 }
});
document.addEventListener('submit',e=>{
 if(e.target.id==='gl-tour-price-form'){
  e.preventDefault();const f=e.target;
  const p=practice.items.find(x=>x.id===Number(f.elements.product.value));
  const cost=Number(f.elements.cost.value),markup=Number(f.elements.markup.value);
  if(p&&Number.isFinite(cost)&&cost>=0&&cost<1e9&&Number.isFinite(markup)&&markup>=0&&markup<=5000){
   p.cost=Math.round(cost*100)/100;p.markup=Math.round(markup*100)/100;persist();paint();
  }
 }
 if(e.target.id==='gl-tour-order-form'){
  e.preventDefault();const f=e.target,product=Number(f.elements.product.value),qty=Number(f.elements.quantity.value);
  if(practice.items.some(p=>p.id===product)&&Number.isInteger(qty)&&qty>=1&&qty<=20){
   practice.orders.push({id:Date.now()+practice.orders.length,product,qty,status:'pendiente'});
   persist();paint();
  }
 }
});
})();
