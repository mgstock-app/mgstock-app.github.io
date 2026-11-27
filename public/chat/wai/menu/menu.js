const cfg = window.GESTLOK_CHAT_CONFIG;
const token = location.hash.slice(1);
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2,minimumFractionDigits:0}).format(n);
const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const sum = obj => Object.values(obj||{}).reduce((a,b)=>a+Number(b),0);
const totalGroup = g => g.tipo==='cantidad'?Number(g.total):1;
let menu, lines=[], selected='Todas', query='', prepared=null;
const node=(tag,attrs={},...children)=>{
 const n=document.createElement(tag);
 for(const [k,v] of Object.entries(attrs)){if(k==='text') n.textContent=v;else if(k==='class') n.className=v;else if(k==='click') n.onclick=v;else if(v!==null) n.setAttribute(k,String(v))}
 n.append(...children.filter(x=>x!==null));return n;
};
const btn=(text,fn,cls='outline')=>node('button',{type:'button',class:cls,text,click:fn});
const errorPage=msg=>$('app').replaceChildren(node('div',{class:'empty'},node('h2',{text:'Carta no disponible'}),node('p',{text:msg})));
const rpc=async(name,data)=>{
 const res=await fetch(cfg.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store',referrerPolicy:'no-referrer'});
 if(!res.ok) throw Error('No pudimos conectar. Reintentá.');
 return res.json();
};
const product = id=>menu.productos.find(p=>p.id===id);
const lineTotal = l=>{
 const p=product(l.id);return +p.precio+p.grupos.reduce((acc,g)=>acc+g.valores.reduce((a,v)=>a+(l.grupos[g.id]?.[v.id]||0)*Number(v.extra||0),0),0)+sum(l.salsas_extra)*Number(p.salsa_precio||0);
};
const subtotal=()=>lines.reduce((a,l)=>a+lineTotal(l),0);
const description=l=>{const p=product(l.id);return [...p.grupos.flatMap(g=>g.valores.filter(v=>l.grupos[g.id]?.[v.id]).map(v=>l.grupos[g.id][v.id]+' × '+v.nombre)),...Object.entries(l.salsas_extra||{}).map(([id,q])=>q+' × '+(p.grupos.find(g=>g.id==='salsas')?.valores.find(v=>v.id===id)?.nombre||id)+' (adicional)')].join(' · ')};
const updateBar=()=>{$('bar').hidden=lines.length===0||!!prepared;$('count').textContent=lines.length+' '+(lines.length===1?'producto':'productos');$('subtotal').textContent=money(subtotal());};
const open=(title,body)=>{$('modalTitle').textContent=title;$('modalBody').replaceChildren(body);if(!$('modal').open)$('modal').showModal();$('modal').scrollTop=0;};
$('close').onclick=()=>$('modal').close();$('cart').onclick=()=>checkout();
function render(){
 const groups=['Todas',...new Set(menu.productos.map(p=>p.categoria))];
 const tabs=node('div',{class:'tabs','aria-label':'Categorías'},...groups.map(c=>btn(c,()=>{selected=c;render()},selected===c?'active':'')));
 const search=node('input',{class:'search',type:'search',placeholder:'Buscar producto…','aria-label':'Buscar producto'});search.value=query;
 const list=node('section',{id:'catalog'});search.oninput=()=>{query=search.value;renderList(list)};
 $('app').replaceChildren(node('div',{class:'lead'},node('h2',{text:'Armá tu pedido'}),node('p',{text:'Elegí productos, gustos y cantidades.'})),search,tabs,list);
 renderList(list);updateBar();
}
function renderList(list){
 list.replaceChildren();
 const found=menu.productos.filter(p=>(selected==='Todas'||selected===p.categoria)&&normalize(p.nombre+' '+p.categoria).includes(normalize(query)));
 for(const category of new Set(found.map(p=>p.categoria))){
  list.append(node('h3',{class:'category',text:category}),node('div',{class:'grid'},...found.filter(p=>p.categoria===category).map(p=>node('article',{class:'card'},
   node('div',{},node('h3',{text:p.nombre}),node('span',{class:'price',text:money(p.precio)}),p.grupos.length?node('small',{text:'Personalizable'}):null),
   productStepper(p)))));
 }
 if(!found.length)list.append(node('p',{class:'empty',text:'No encontramos productos en esta búsqueda.'}));
}
function refreshCatalog(){
 const list=$('app').querySelector('#catalog');if(list)renderList(list);updateBar();
}
function productStepper(p){
 const count=lines.filter(l=>l.id===p.id).length;
 const minus=btn('−',()=>{const i=lines.findLastIndex(l=>l.id===p.id);if(i>=0)lines.splice(i,1);refreshCatalog()},'');
 const plus=btn('+',()=>{if(lines.length>=5){alert('Podés elegir hasta 5 productos en este ensayo.');return;}if(p.grupos.length){choose(p);return;}lines.push({id:p.id,grupos:{},salsas_extra:{}});refreshCatalog()},'');
 minus.setAttribute('aria-label','Quitar '+p.nombre);plus.setAttribute('aria-label','Agregar '+p.nombre);
 minus.disabled=count===0;plus.disabled=!!prepared||lines.length>=5;
 return node('div',{class:'step product-step'},minus,node('output',{text:count}),plus);
}
function choose(p,idx=-1){
 if(prepared)return;
 if(idx<0&&lines.length>=5){alert('Podés elegir hasta 5 productos en este ensayo.');return;}
 const l=idx>=0?structuredClone(lines[idx]):{id:p.id,grupos:Object.fromEntries(p.grupos.map(g=>[g.id,{}])),salsas_extra:{}};
 const content=node('div',{},node('p',{class:'muted',text:'Precio base: '+money(p.precio)}));
 const controls=[], groupViews=[];
 const action=btn('',()=>{if(!valid())return;if(idx>=0)lines[idx]=l;else lines.push(l);$('modal').close();refreshCatalog()},'primary');
 const valid=()=>p.grupos.every(g=>sum(l.grupos[g.id])===totalGroup(g));
 function group(title,values,selection,target,extraPrice=null){
  const counter=node('span',{}), box=node('section',{class:'group'},node('div',{class:'group-title'},node('strong',{text:title}),counter));
  groupViews.push(()=>{counter.textContent=target===null?sum(selection)+' adicionales':sum(selection)+' de '+target;});
  for(const v of values){
   const minus=btn('−',()=>{const n=(selection[v.id]||0)-1;if(n>0)selection[v.id]=n;else delete selection[v.id];refresh()},'');
   const plus=btn('+',()=>{if(sum(selection)>=(target===null?10:target))return;selection[v.id]=(selection[v.id]||0)+1;refresh()},'');
   minus.setAttribute('aria-label','Quitar '+v.nombre);plus.setAttribute('aria-label','Agregar '+v.nombre);
   const qty=node('output',{});const extra=extraPrice??Number(v.extra||0);
   box.append(node('div',{class:'option'},node('div',{},node('span',{text:v.nombre}),extra?node('small',{text:'+'+money(extra)}):null),node('div',{class:'step'},minus,qty,plus)));
   controls.push(()=>{qty.textContent=selection[v.id]||0;minus.disabled=!selection[v.id];plus.disabled=sum(selection)>=(target===null?10:target)||(target===null&&(selection[v.id]||0)>=9);});
  }
  content.append(box);
 }
 for(const g of p.grupos)group('Elegí '+totalGroup(g)+' · '+g.nombre,g.valores,l.grupos[g.id],totalGroup(g));
 const sauces=p.grupos.find(g=>g.id==='salsas');if(p.salsa_precio&&sauces)group('Salsas adicionales · opcional',sauces.valores,l.salsas_extra,null,Number(p.salsa_precio));
 function refresh(){controls.forEach(f=>f());groupViews.forEach(f=>f());action.disabled=!valid();action.textContent=(idx>=0?'Guardar':'Agregar al pedido')+' · '+money(lineTotal(l));}
 content.append(node('div',{class:'stickyAction'},action));refresh();open(p.nombre,content);
}
function checkout(){
 if(prepared){showPrepared();return;}
 if(!lines.length){$('modal').close();updateBar();return;}
 const content=node('div'), cartlist=node('section');
 for(const [i,l] of lines.entries()){
  cartlist.append(node('article',{class:'cartline'},node('div',{class:'row'},node('strong',{text:product(l.id).nombre}),node('strong',{text:money(lineTotal(l))})),node('p',{text:description(l)}),node('div',{class:'row'},btn('Editar',()=>choose(product(l.id),i)),btn('Quitar',()=>{lines.splice(i,1);refreshCatalog();checkout()}))));
 }
 content.append(cartlist,btn('+ Agregar más productos',()=>$('modal').close()));
 const summary=node('div',{class:'summary'},node('div',{class:'total'},node('span',{text:'Subtotal de productos'}),node('span',{text:money(subtotal())})));
 const err=node('p',{class:'error',role:'alert'});
 const submit=btn('Enviar selección a WhatsApp',async()=>{
  if(submit.disabled)return;submit.disabled=true;submit.textContent='Preparando…';err.textContent='';
  try{
   const r=await rpc('gestlok_chat_wai_menu_preparar',{p_token:token,p_datos:{lineas:lines,total:Number(subtotal().toFixed(2))}});
   if(!r.ok){err.textContent=r.error;return;}prepared=r;showPrepared();
  }catch(e){err.textContent=e.message||'No pudimos preparar tu selección.';}finally{submit.disabled=false;submit.textContent='Enviar selección a WhatsApp';}
 },'primary');
 content.append(summary,node('p',{class:'notice',text:'Vas a continuar con el asistente en WhatsApp: nombre, entrega, pago y confirmación del pedido.'}),err,node('div',{class:'stickyAction'},submit));
 open('Tu selección',content);
}
function showPrepared(){
 updateBar();const text='Mi selección WAI '+prepared.referencia;
 const link='https://wa.me/'+menu.whatsapp+'?text='+encodeURIComponent(text);
 const box=node('div',{class:'success'},node('h2',{text:'¡Tu selección está lista!'}),node('p',{class:'muted',text:'Subtotal: '+money(prepared.total)}),node('p',{class:'notice',text:'Abrí WhatsApp y tocá Enviar. El asistente te va a pedir los datos que faltan.'}),node('a',{class:'primary',href:link,rel:'noreferrer',text:'Abrir WhatsApp y enviar'}),btn('Copiar mensaje',async()=>{try{await navigator.clipboard.writeText(text);alert('Mensaje copiado. Pegalo en el chat del local y envialo.')}catch{alert(text)}}));
 open('Confirmación',box);$('app').replaceChildren(node('div',{class:'empty'},node('h2',{text:'Selección preparada'}),btn('Volver a WhatsApp',showPrepared,'primary')));
}
(async()=>{
 if(!cfg||!['prueba','testing'].includes(cfg.entorno)||!/^[-a-f0-9]{36}$/i.test(token)){errorPage('Abrí el acceso que te envió el comercio por WhatsApp.');return;}
 try{menu=await rpc('gestlok_chat_wai_menu',{p_token:token});if(!menu.ok){errorPage(menu.error);return;}if(!menu.productos?.length){errorPage('No hay productos disponibles. Consultá al local.');return;}$('local').textContent=menu.local||'Carta interactiva';render();}catch(e){errorPage(e.message||'Revisá la conexión y recargá.');}
})();
