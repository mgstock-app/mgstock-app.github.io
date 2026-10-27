/* Guided visitor tour: real app screens, fictional business adapter only. */
(()=>{
'use strict';
if(new URLSearchParams(location.search).get('demo')!=='1')return;
const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('stock/gestlok-demo-tour.css',document.baseURI).href;document.head.append(style);
const names=['Inicio','Stock','Proveedores','Personal','Final'];
let step=0,busy=false,sent=false,client=null;
const model={rating:0,comment:'',publish_consent:false,contact_consent:false,contact_name:'',contact_value:''};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function nav(){return '<nav aria-label="Etapas de la demo" class="gl-tour-nav"><button type="button" data-tour="'+(step-1)+'" '+(step===0?'disabled':'')+' aria-label="Etapa anterior">←</button>'+names.map((n,i)=>'<button type="button" data-tour="'+i+'" aria-current="'+(i===step?'step':'false')+'">'+(i+1)+'<span> '+n+'</span></button>').join('')+'<button type="button" data-tour="'+(step+1)+'" '+(step===4?'disabled':'')+' aria-label="Etapa siguiente">→</button></nav><p class="gl-tour-hint">'+['Tocá una tarjeta para descubrir su menú. Deslizá esta barra para cambiar de etapa.','Probá modificar y guardar el stock ficticio.','Armá un pedido con productos de ejemplo.','Editá los horarios y consultá un recibo ficticio.','¡Terminaste el recorrido! Podés volver a explorar las etapas.'][step]+'</p>';}
function feedback(){return '<section class="gl-tour-end card pad" aria-label="Final de la demo"><img src="icons/gestlok-wordmark.svg" alt="GESTLOK" width="240"><p>Organizá tu negocio, simplificá tu día</p><h2>¡Gracias por recorrer GESTLOK!</h2><p>Terminaste las cinco etapas de la demo con datos ficticios. Podés volver a cualquier etapa para seguir explorando.</p><a class="btn primary" href="./">Volver al inicio</a></section>';}
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
  new ResizeObserver(()=>document.documentElement.style.setProperty('--gl-tour-header',document.getElementById('gl-visitor-bar').getBoundingClientRect().height+'px')).observe(document.getElementById('gl-visitor-bar'));
 paint();return true;
}
const timer=setInterval(()=>{if(init())clearInterval(timer);},250);
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-tour]');if(b){move(Number(b.dataset.tour));return;}
});
let touch=null;
document.addEventListener('touchstart',e=>{if(!e.target.closest?.('input,textarea,select,a,table,.gl-dh-scroll')&&(!e.target.closest?.('button')||e.target.closest?.('#gl-tour-controls')))touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
document.addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)move(step+(dx<0?1:-1));},{passive:true});
})();
