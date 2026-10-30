/* GESTLOK: menú sin cabecera Hojas, personalización exclusiva de creadora. */
(()=>{
'use strict';
const nav=document.getElementById('snav'),side=document.getElementById('side');
if(!nav||!side)return;
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const permitted=['inicio','stock','proveedores','chat','adm-local','vencimientos','avisos','ingreso','pedido','conteo','fabrica','historial','motos','resenas','reclamos-internos','cierre-online','pedidos-online','tienda-online'];
const targets=['stock','proveedores','chat','vencimientos','avisos','pedido','conteo','historial'];
const preferred=['inicio','stock','proveedores','chat','adm-local','vencimientos','avisos','ingreso'];
const pinned=['inicio','stock']; // Accesos diarios al comienzo, aunque la creadora reordene otros.
let current='',data=[],draft=[],overlay=null,busy=false,error='',sequence=0,tick=false;
const ctx=()=>window.GestLokNavContext?.()||null;
const idOf=el=>el.matches?.('.snav-folder')?'adm-local':el.getAttribute?.('data-go')||'';
const nameOf=el=>el.querySelector?.('.nl')?.textContent?.trim()||el.textContent?.trim()||'';
const nodes=()=>new Map([...nav.children].filter(el=>!el.hasAttribute('data-nav-custom')&&!el.hasAttribute('data-daily-shortcut')).map(el=>[(/^(stock local|stock)$/i.test(nameOf(el))?'stock':idOf(el)),el]).filter(([id])=>permitted.includes(id)));
const trim=s=>String(s||'').trim().replace(/\s+/g,' ').slice(0,45);
function baseline(){
 const known=nodes(),ids=[...new Set([...preferred,...known.keys()])].filter(id=>known.has(id));
 return ids.map(id=>({id,label:id==='stock'?'Stock Local':nameOf(known.get(id))}));
}
function shown(){
 const base=baseline(),byId=new Map(base.map(x=>[x.id,x])),out=[];
 for(const x of data){
  if(!x||typeof x.id!=='string'||out.some(y=>y.id===x.id))continue;
  if(byId.has(x.id))out.push({id:x.id,label:trim(x.label)||byId.get(x.id).label});
  else if(x.id.startsWith('custom-')&&targets.includes(x.target)&&trim(x.label))
   out.push({id:x.id,label:trim(x.label),target:x.target});
 }
 for(const x of base)if(!out.some(y=>y.id===x.id))out.push(x);
 // Inicio y Stock Local no se pueden perder debajo de otras categorías.
 return [...pinned.flatMap(id=>out.filter(x=>x.id===id)),...out.filter(x=>!pinned.includes(x.id))];
}
function draw(){
 const c=ctx();if(!c?.tenant||!c.local)return;
 // Mi Gusto: retirar únicamente accesos del menú, sin borrar datos ni servicios.
 // La identificación de Mi Gusto se toma del módulo de pagos autorizado.
 const miGusto=!!nav.querySelector('.snav-sub button[data-go="cierre-online"]');
 for(const id of ['ingreso','avisos']){
  const button=[...nav.children].find(el=>el.dataset?.go===id);
  if(button)button.hidden=miGusto;
 }
 nav.querySelector('.snav-l')?.remove();
 // Las hojas siguen accesibles: se elimina solo el título, jamás su botón de alta.
 const known=nodes(),order=shown(),back=nav.querySelector('[data-act="locales"]');
 // Stock Local es una hoja real: mantener su data-go y reemplazar solo el ícono.
 const stock=known.get('stock');
 if(stock){
  const productIcon=nav.querySelector('button[data-go="proveedores"] svg');
  const oldIcon=stock.querySelector('svg');
  if(productIcon&&oldIcon&&oldIcon.outerHTML!==productIcon.outerHTML)oldIcon.replaceWith(productIcon.cloneNode(true));
 }
 // Pagos Online solo se fija cuando el sistema original lo permite en este local.
 // La entrada interna sigue disponible y mantiene las mismas validaciones de go().
 const originalPayment=nav.querySelector('.snav-sub button[data-go="cierre-online"]');
 if(originalPayment)originalPayment.hidden=true;
 let payment=nav.querySelector('[data-daily-shortcut="pagos"]');
 if(!originalPayment){payment?.remove();payment=null;}
 else{
  if(!payment){
   payment=document.createElement('button');payment.type='button';
   payment.dataset.go='cierre-online';payment.dataset.dailyShortcut='pagos';
   payment.className='gl-daily-shortcut';
  }
  if(payment.innerHTML!==originalPayment.innerHTML)payment.innerHTML=originalPayment.innerHTML;
  const name=payment.querySelector('.nl');if(name&&name.textContent!=='Pagos Online')name.textContent='Pagos Online';
 }
 let last=back;
 const existing=new Map([...nav.querySelectorAll('[data-nav-custom]')].map(x=>[x.dataset.navCustom,x]));
 for(const item of order){
  let n=known.get(item.id);
  if(!n&&item.id.startsWith('custom-')&&targets.includes(item.target)&&known.has(item.target)){
   n=existing.get(item.id);
   if(!n){n=document.createElement('button');n.type='button';n.dataset.navCustom=item.id;n.dataset.go=item.target;}
   if(n.textContent!==item.label)n.textContent=item.label;
  }
  if(!n)continue;
  if(!item.id.startsWith('custom-')){
   const txt=n.querySelector('.nl');if(txt&&txt.textContent!==item.label)txt.textContent=item.label;
  }
  if(last?.nextElementSibling!==n)nav.insertBefore(n,last?.nextElementSibling||null);
  last=n;
  if(payment&&(item.id==='stock'||(item.id==='inicio'&&!known.has('stock')))){
   if(payment.parentNode!==nav||last.nextElementSibling!==payment)nav.insertBefore(payment,last.nextElementSibling);
   last=payment;
  }
 }
 // El acceso a Stock Local debe quedar justo después de Inicio, incluso si
 // una disposición guardada lo colocó al final de las hojas.
 const inicio=known.get('inicio');
 const stockLocal=known.get('stock');
 if(inicio&&stockLocal&&inicio.nextElementSibling!==stockLocal)nav.insertBefore(stockLocal,inicio.nextElementSibling);
 if(payment&&stockLocal&&stockLocal.nextElementSibling!==payment)nav.insertBefore(payment,stockLocal.nextElementSibling);
 for(const [id,b] of existing)if(!order.some(x=>x.id===id))b.remove();
 const can=!!c.creator;
 let edit=nav.querySelector('#gl-edit-menu');
 if(can){
  if(!edit){edit=document.createElement('button');edit.type='button';edit.id='gl-edit-menu';
   edit.textContent='⚙ Editar categorías';edit.addEventListener('click',open);}
  if(edit.parentNode!==nav)nav.append(edit);
 }else edit?.remove();
 const footer=side.querySelector('.side-f');
 if(footer){
  // Reutilizar el cierre de sesión original: evita dos botones y mantiene
  // la salida local segura de Supabase, sin desconectar otros dispositivos.
  const logout=footer.querySelector('#logout-wrap');
  const button=logout?.querySelector('[data-au="out"]');
  if(button){
   button.id='gl-nav-logout';button.textContent='↪ Cerrar sesión';
   logout.hidden=false;
  }
 }
}
function scopeCheck(){
 const c=ctx(),key=c?.tenant&&c.local?c.tenant+'|'+c.local:'';
 if(key===current)return;
 current=key;data=[];sequence++;close();
 if(key)void fetchLayout(c,sequence);
}
async function fetchLayout(c,seq){
 try{
  const result=await window.GestLokSupabase?.rpc('gestlok_navigation_read',{p_tenant:c.tenant,p_local:c.local});
  if(seq===sequence&&!result?.error&&Array.isArray(result?.data))data=result.data;
 }catch{}finally{refresh();}
}
function refresh(){if(tick)return;tick=true;queueMicrotask(()=>{tick=false;scopeCheck();draw();});}
function close(){overlay?.remove();overlay=null;error='';}
function open(){
 if(!ctx()?.creator)return;
 draft=shown().map(x=>({...x}));error='';
 overlay=document.createElement('div');overlay.className='gl-nav-modal';
 overlay.innerHTML='<section class="gl-nav-dialog" role="dialog" aria-modal="true" aria-labelledby="gl-nav-heading">'+
  '<header><h2 id="gl-nav-heading">Editar categorías</h2><button type="button" data-nav-close>✕</button></header>'+
  '<p>Renombrá y ordená los accesos sin borrar información ni alterar los permisos.</p>'+
  '<div id="gl-nav-rows"></div><div class="gl-nav-add"><input type="text" maxlength="45" placeholder="Nueva categoría" aria-label="Nueva categoría">'+
  '<select aria-label="Pantalla que se abrirá"></select><button type="button" data-nav-add>Agregar</button></div>'+
  '<p id="gl-nav-err" role="alert"></p><footer><button type="button" data-nav-close>Cancelar</button>'+
  '<button class="gl-nav-save" type="button" data-nav-save>Guardar cambios</button></footer></section>';
 document.body.append(overlay);overlay.addEventListener('click',actions);
 overlay.addEventListener('input',e=>{const el=e.target.closest('[data-nav-name]');if(el)draft[Number(el.dataset.index)].label=el.value;});
 paint();
}
function paint(){
 if(!overlay)return;
 const rows=overlay.querySelector('#gl-nav-rows');
 rows.innerHTML=draft.map((x,i)=>'<div class="gl-nav-item"><input maxlength="45" data-nav-name data-index="'+i+'" aria-label="Nombre de categoría" value="'+html(x.label)+'">'+
 '<button type="button" data-nav-up="'+i+'" '+(i<=1?'disabled':'')+' aria-label="Subir categoría">↑</button>'+
 '<button type="button" data-nav-down="'+i+'" '+(i===draft.length-1||i<2?'disabled':'')+' aria-label="Bajar categoría">↓</button>'+
 (x.id.startsWith('custom-')?'<button type="button" data-nav-remove="'+i+'" aria-label="Eliminar acceso">×</button>':'')+'</div>').join('');
 const known=nodes();
 overlay.querySelector('select').innerHTML=targets.filter(x=>known.has(x)).map(x=>'<option value="'+x+'">'+html(nameOf(known.get(x)))+'</option>').join('');
 overlay.querySelector('#gl-nav-err').textContent=error;
 overlay.querySelector('[data-nav-save]').disabled=busy;
}
function actions(e){
 if(e.target===overlay||e.target.closest('[data-nav-close]')){close();return;}
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-nav-up')||b.hasAttribute('data-nav-down')){
  const up=b.hasAttribute('data-nav-up'),i=Number(b.dataset[up?'navUp':'navDown']),j=i+(up?-1:1);
  if(i>=2&&j>=2&&j<draft.length)[draft[i],draft[j]]=[draft[j],draft[i]];
  paint();return;
 }
 if(b.hasAttribute('data-nav-remove')){draft.splice(Number(b.dataset.navRemove),1);paint();return;}
 if(b.hasAttribute('data-nav-add')){
  const input=overlay.querySelector('.gl-nav-add input'),label=trim(input.value),target=overlay.querySelector('select').value;
  if(label.length<2||!targets.includes(target)){error='Ingresá un nombre y elegí una pantalla.';paint();return;}
  draft.push({id:'custom-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),label,target});
  error='';input.value='';paint();return;
 }
 if(b.hasAttribute('data-nav-save'))void save();
}
async function save(){
 const c=ctx();if(!c?.creator||busy)return;
 const items=draft.map(x=>({id:x.id,label:trim(x.label),...(x.target?{target:x.target}:{})}));
 if(items.some(x=>x.label.length<2||x.label.length>45)){error='Cada nombre debe tener entre 2 y 45 caracteres.';paint();return;}
 busy=true;paint();
 try{
  const result=await window.GestLokSupabase.rpc('gestlok_navigation_save',{p_tenant:c.tenant,p_local:c.local,p_items:items});
  if(result.error)throw result.error;
  if(current!==c.tenant+'|'+c.local)throw Error('Cambiaste de local.');
  data=items;close();refresh();
 }catch(e){error=e?.message||'No se pudo guardar.';}finally{busy=false;paint();}
}
const observer=new MutationObserver(()=>refresh());
observer.observe(nav,{childList:true,subtree:true,characterData:true});
setTimeout(refresh,0);
window.GestLokNavigation={refresh};
})();