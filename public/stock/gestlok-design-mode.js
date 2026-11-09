/* GESTLOK · Modo diseño de la Administradora General (09/11/2026).
   La creadora puede, en cualquier pantalla de la empresa en la que está, editar un texto,
   ocultar un elemento o agregar un bloque nuevo (para que después se le dé función).
   Los cambios se guardan por empresa en gestlok_design_overrides: todos los miembros de
   esa empresa los ven; solo la creadora puede escribir (RLS + gestlok_design_can_edit()).
   Nunca se inserta HTML: solo texto. Los datos que cambian (cantidades, precios, saldos)
   no se pisan: un cambio de texto se aplica solo si el texto original sigue igual. */
(()=>{
'use strict';
if(window.GestLokDesign)return;
const TABLE='gestlok_design_overrides';
const ROOTS=['#gl-molino-panel','#view','#hub','#snav'];
const COLS='id,page,anchor,original,kind,value';
let on=false,available=false,showHidden=false,items=[],loadedTenant='',loading=false,applying=false,timer=0,selected=null,mode='',bar=null,toggle=null,busy=false;
const ctx=()=>{try{return window.GestLokNavContext?.()||{};}catch{return {};}};
const isCreator=()=>ctx().creator===true;
const tenant=()=>String(ctx().tenant||'');
const sb=()=>window.GestLokSupabase;
const norm=v=>String(v??'').replace(/\s+/g,' ').trim().slice(0,500);
const isBlock=n=>!!n?.dataset?.glDesignBlock;
const isOwnUI=n=>!!n?.closest?.('#gl-design-bar,#gl-design-toggle');

function pageKey(){
 if(document.getElementById('gl-molino-panel'))return 'molino:'+(window.GestLokMolino?.sectionName?.()||'panel');
 const app=document.getElementById('app');
 if(app&&!app.hidden){
  const cur=document.querySelector('#snav [data-go][aria-current="page"]');
  return 'app:'+(cur?.dataset?.go||'inicio');
 }
 return 'hub';
}
function rootOf(el){
 for(const sel of ROOTS){const r=document.querySelector(sel);if(r&&r!==el&&r.contains(el))return [sel,r];}
 return [null,null];
}
// Ubicación estable del elemento: raíz + recorrido por etiqueta y orden (sin contar los bloques nuevos).
function anchorOf(el){
 const [sel,root]=rootOf(el);if(!root)return '';
 const parts=[];let n=el;
 while(n&&n!==root&&parts.length<30){
  const tag=n.tagName.toLowerCase();let i=1,s=n;
  while((s=s.previousElementSibling))if(s.tagName===n.tagName&&!isBlock(s))i++;
  parts.unshift(tag+':'+i);n=n.parentElement;
 }
 return n===root&&parts.length?sel+'>'+parts.join('>'):'';
}
function find(anchor){
 const [sel,...rest]=String(anchor||'').split('>');
 if(!ROOTS.includes(sel)||!rest.length)return null;
 let n=document.querySelector(sel);
 for(const part of rest){
  if(!n)return null;
  const [tag,raw]=part.split(':');const want=Number(raw);let c=0,next=null;
  for(const ch of n.children){if(isBlock(ch))continue;if(ch.tagName.toLowerCase()===tag&&++c===want){next=ch;break;}}
  n=next;
 }
 return n;
}
const singleLeaf=el=>{if(!el?.querySelectorAll)return null;const l=[...el.querySelectorAll('*')].filter(n=>textual(n));return l.length===1?l[0]:null;};
const textual=el=>!!el&&el.children.length===0&&norm(el.textContent).length>0&&!el.matches('input,textarea,select,option,script,style,svg,img');

async function load(force=false){
 const t=tenant();
 if(!t||!sb()?.from||loading||(!force&&loadedTenant===t))return;
 loading=true;
 try{
  const {data,error}=await sb().from(TABLE).select(COLS).limit(1000);
  if(error)throw error;
  items=Array.isArray(data)?data:[];loadedTenant=t;available=true;
 }catch{items=[];loadedTenant=t;available=false;}
 finally{loading=false;apply();renderUI();}
}
function apply(){
 if(applying)return;applying=true;
 try{
  const page=pageKey();
  for(const b of document.querySelectorAll('[data-gl-design-block]'))
   if(!items.some(o=>o.id===b.dataset.glDesignBlock&&o.page===page))b.remove();
  for(const el of document.querySelectorAll('[data-gl-design-hide]'))
   if(!items.some(o=>o.id===el.dataset.glDesignHide&&o.page===page)){el.classList.remove('gl-design-hidden');delete el.dataset.glDesignHide;}
  for(const o of items){
   if(o.page!==page)continue;
   const el=find(o.anchor);if(!el||isOwnUI(el))continue;
   const txt=norm(el.textContent);
   if(o.kind==='text'){
    if(el.isContentEditable)continue;
    if(textual(el)&&txt===norm(o.original)&&txt!==norm(o.value)){el.textContent=o.value;el.dataset.glDesignText=o.id;}
   }else if(o.kind==='hide'){
    if(!o.original||txt===norm(o.original)||el.dataset.glDesignHide===o.id){el.dataset.glDesignHide=o.id;el.classList.add('gl-design-hidden');}
   }else if(o.kind==='add'){
    const next=el.nextElementSibling;
    if(next?.dataset?.glDesignBlock===o.id){if(next.textContent!==o.value)next.textContent=o.value;continue;}
    const b=document.createElement('div');b.className='gl-design-block';b.dataset.glDesignBlock=o.id;b.textContent=o.value;el.after(b);
   }
  }
  document.body.classList.toggle('gl-design-show-hidden',on&&showHidden);
 }finally{applying=false;}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(tenant()!==loadedTenant)void load(true);else apply();renderUI();},90);}

// ── Interfaz (solo la creadora) ──
function style(){
 if(document.getElementById('gl-design-style'))return;
 const s=document.createElement('style');s.id='gl-design-style';
 s.textContent=
 '.gl-design-hidden{display:none!important}'+
 'body.gl-design-show-hidden .gl-design-hidden{display:revert!important;opacity:.45;outline:2px dashed #B5441A!important}'+
 '.gl-design-block{margin:12px 0;padding:14px 16px;border:1px dashed #9AA7B2;border-radius:12px;background:#FFFDF7;color:#1B2733;font:15px/1.5 Inter,system-ui,sans-serif;white-space:pre-line}'+
 '.gl-design-block::first-line{font-weight:700}'+
 'body.gl-design-on :is(#view,#hub,#snav,#gl-molino-panel) :is(h1,h2,h3,h4,p,span,b,strong,small,a,button,li,label,td,th,div,section,article,img):hover{outline:2px dashed #3B6FD8;outline-offset:2px;cursor:pointer}'+
 '.gl-design-selected{outline:3px solid #3B6FD8!important;outline-offset:2px}'+
 '#gl-design-toggle{position:fixed;left:16px;bottom:16px;z-index:100200;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid #16202E;background:#fff;color:#16202E;font:600 14px Inter,system-ui,sans-serif;box-shadow:0 4px 14px rgba(22,32,46,.18);cursor:pointer}'+
 'body.gl-design-on #gl-design-toggle{background:#3B6FD8;border-color:#3B6FD8;color:#fff}'+
 'body:has(#gestlok-mobile-dock:not([hidden])) #gl-design-toggle{bottom:calc(76px + env(safe-area-inset-bottom,0px))}'+
 '#gl-design-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:100201;width:min(680px,calc(100vw - 20px));box-sizing:border-box;background:#16202E;color:#fff;border-radius:14px;padding:12px 14px;font:14px/1.4 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:10px}'+
 '#gl-design-bar .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}'+
 '#gl-design-bar button{min-height:40px;padding:0 12px;border-radius:9px;border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;font:600 13px Inter,system-ui,sans-serif;cursor:pointer}'+
 '#gl-design-bar button.primary{background:#fff;color:#16202E;border-color:#fff}'+
 '#gl-design-bar textarea{width:100%;box-sizing:border-box;min-height:70px;border-radius:9px;border:none;padding:10px;font:14px Inter,system-ui,sans-serif;color:#16202E}'+
 '#gl-design-bar small{color:#C9D4DE}'+
 '[contenteditable="true"].gl-design-editing{outline:3px solid #F2B705!important;background:#FFFBEA;color:#1B2733}';
 document.head.appendChild(s);
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderUI(){
 // El botón aparece solo cuando la tabla de diseño responde (si no, no se podría guardar).
 const allowed=available&&isCreator()&&!!tenant()&&!!sb()?.from;
 if(!allowed){toggle?.remove();toggle=null;bar?.remove();bar=null;if(on)setOn(false);return;}
 style();
 if(!toggle){
  toggle=document.createElement('button');toggle.id='gl-design-toggle';toggle.type='button';
  toggle.setAttribute('aria-pressed','false');document.body.appendChild(toggle);
 }
 const label=on?'Salir del modo diseño':'✎ Diseñar';
 if(toggle.textContent!==label)toggle.textContent=label;
 toggle.setAttribute('aria-pressed',String(on));
}
function setOn(v){
 on=!!v;document.body.classList.toggle('gl-design-on',on);
 if(!on){finishEdit(false);unselect();bar?.remove();bar=null;showHidden=false;}
 else showBar();
 apply();renderUI();
}
function unselect(){selected?.classList?.remove('gl-design-selected');selected=null;mode='';}
function showBar(msg){
 if(!on)return;
 if(!bar){bar=document.createElement('div');bar.id='gl-design-bar';bar.setAttribute('role','dialog');bar.setAttribute('aria-label','Modo diseño');document.body.appendChild(bar);}
 const page=pageKey();
 const count=items.filter(o=>o.page===page).length;
 let html='';
 if(!selected){
  html='<div class="row"><b>Modo diseño</b><small>Tocá cualquier texto o bloque de esta pantalla para editarlo, ocultarlo o agregar algo nuevo debajo. Los cambios los ve toda la empresa.</small></div>'+
   '<div class="row"><button type="button" data-gd="show-hidden">'+(showHidden?'Ocultar lo oculto':'Mostrar lo oculto')+'</button>'+
   (count?'<button type="button" data-gd="reset-page">Quitar mis cambios de esta pantalla ('+count+')</button>':'')+
   '<button type="button" data-gd="exit">Salir</button></div>';
 }else if(mode==='edit'){
  html='<div class="row"><b>Editando texto</b><small>Escribí directamente sobre el texto resaltado.</small></div>'+
   '<div class="row"><button type="button" class="primary" data-gd="save-text">Guardar</button><button type="button" data-gd="cancel">Cancelar</button></div>';
 }else if(mode==='add'||mode==='edit-block'){
  const cur=mode==='edit-block'?items.find(o=>o.id===selected.dataset.glDesignBlock)?.value||'':'';
  html='<div class="row"><b>'+(mode==='add'?'Nuevo bloque debajo':'Editar bloque')+'</b><small>La primera línea es el título. Después le damos la función.</small></div>'+
   '<textarea id="gl-design-text" maxlength="2000" placeholder="Ej.: Botón Exportar a PDF&#10;Que descargue el resumen del día">'+esc(cur)+'</textarea>'+
   '<div class="row"><button type="button" class="primary" data-gd="save-block">Guardar bloque</button><button type="button" data-gd="cancel">Cancelar</button></div>';
 }else{
  const block=isBlock(selected);
  const hidden=selected.classList.contains('gl-design-hidden');
  const edited=items.find(o=>o.kind==='text'&&o.id===selected.dataset.glDesignText);
  html='<div class="row"><b>'+(block?'Bloque nuevo':'Elemento seleccionado')+'</b><small>'+esc(norm(selected.textContent).slice(0,80)||'(sin texto)')+'</small></div><div class="row">'+
   (block?'<button type="button" data-gd="edit-block">Editar bloque</button><button type="button" data-gd="delete-block">Borrar bloque</button>':
    (textual(selected)||singleLeaf(selected)?'<button type="button" data-gd="edit">Editar texto</button>':'')+
    (edited?'<button type="button" data-gd="restore-text">Volver al texto original</button>':'')+
    '<button type="button" data-gd="'+(hidden?'unhide':'hide')+'">'+(hidden?'Volver a mostrar':'Ocultar')+'</button>'+
    '<button type="button" data-gd="add">Agregar bloque debajo</button>')+
   '<button type="button" data-gd="cancel">Listo</button></div>';
 }
 if(msg)html+='<div class="row" role="status"><small>'+esc(msg)+'</small></div>';
 bar.innerHTML=html;
 bar.querySelector('#gl-design-text')?.focus();
}
function pick(el){
 unselect();
 if(!el||isOwnUI(el))return showBar();
 selected=el;el.classList.add('gl-design-selected');showBar();
}
function startEdit(){
 if(selected&&!textual(selected)){const leaf=singleLeaf(selected);if(!leaf)return;selected.classList.remove('gl-design-selected');selected=leaf;selected.classList.add('gl-design-selected');}
 if(!selected||!textual(selected))return;
 const prev=items.find(o=>o.kind==='text'&&o.id===selected.dataset.glDesignText);
 selected.dataset.glDesignOriginal=prev?prev.original:norm(selected.textContent);
 mode='edit';selected.contentEditable='true';selected.classList.add('gl-design-editing');selected.focus();showBar();
}
function finishEdit(){
 if(selected?.isContentEditable){selected.contentEditable='false';selected.classList.remove('gl-design-editing');}
}
async function save(op,payload,id){
 if(busy)return null;busy=true;
 try{
  let q;
  if(op==='insert')q=sb().from(TABLE).insert({tenant_id:tenant(),...payload}).select(COLS).single();
  else if(op==='update')q=sb().from(TABLE).update({...payload,updated_at:new Date().toISOString()}).eq('id',id).select(COLS).single();
  else q=sb().from(TABLE).delete().eq('id',id);
  const {data,error}=await q;
  if(error)throw error;
  if(op==='delete')items=items.filter(o=>o.id!==id);
  else if(data){items=items.filter(o=>o.id!==data.id);items.push(data);}
  return data||true;
 }catch(e){showBar('No se pudo guardar: '+(e?.message||'revisá la conexión.'));return null;}
 finally{busy=false;}
}
async function action(kind){
 const page=pageKey();
 if(kind==='exit')return setOn(false);
 if(kind==='cancel'){
  if(mode==='edit'&&selected){const o=selected.dataset.glDesignOriginal;finishEdit();const prev=items.find(x=>x.id===selected.dataset.glDesignText);selected.textContent=prev?prev.value:o;}
  unselect();return showBar();
 }
 if(kind==='show-hidden'){showHidden=!showHidden;apply();return showBar();}
 if(kind==='reset-page'){
  for(const o of items.filter(x=>x.page===page))await save('delete',null,o.id);
  unselect();apply();return showBar('Se quitaron tus cambios de esta pantalla. Recargá para ver el diseño original.');
 }
 if(!selected)return;
 const anchor=isBlock(selected)?'':anchorOf(selected);
 if(!isBlock(selected)&&!anchor)return showBar('Este elemento no se puede editar desde acá.');
 if(kind==='edit')return startEdit();
 if(kind==='add'||kind==='edit-block'){mode=kind;return showBar();}
 if(kind==='save-text'){
  const value=norm(selected.textContent).slice(0,2000),original=selected.dataset.glDesignOriginal||'';
  finishEdit();
  const prev=items.find(o=>o.kind==='text'&&o.page===page&&o.anchor===anchor);
  if(!value){selected.textContent=prev?prev.value:original;unselect();return showBar('El texto no puede quedar vacío. Para quitarlo usá «Ocultar».');}
  const ok=value===original?(prev?await save('delete',null,prev.id):true):
   prev?await save('update',{value,original},prev.id):await save('insert',{page,anchor,original,kind:'text',value});
  if(ok&&value!==original)selected.dataset.glDesignText=(items.find(o=>o.kind==='text'&&o.anchor===anchor&&o.page===page)||{}).id||'';
  unselect();apply();return showBar(ok?'Texto guardado.':undefined);
 }
 if(kind==='restore-text'){
  const prev=items.find(o=>o.id===selected.dataset.glDesignText);
  if(prev&&await save('delete',null,prev.id)){selected.textContent=prev.original;delete selected.dataset.glDesignText;}
  unselect();apply();return showBar('Se volvió al texto original.');
 }
 if(kind==='hide'){
  const ok=await save('insert',{page,anchor,original:norm(selected.textContent),kind:'hide',value:''});
  unselect();apply();return showBar(ok?'Elemento oculto para toda la empresa. Podés verlo con «Mostrar lo oculto».':undefined);
 }
 if(kind==='unhide'){
  const id=selected.dataset.glDesignHide;
  if(id&&await save('delete',null,id)){selected.classList.remove('gl-design-hidden');delete selected.dataset.glDesignHide;}
  unselect();apply();return showBar('Elemento visible otra vez.');
 }
 if(kind==='save-block'){
  const value=String(document.getElementById('gl-design-text')?.value||'').trim().slice(0,2000);
  if(!value)return showBar('Escribí el contenido del bloque.');
  const ok=mode==='edit-block'?await save('update',{value},selected.dataset.glDesignBlock):
   await save('insert',{page,anchor,original:norm(selected.textContent),kind:'add',value});
  unselect();apply();return showBar(ok?'Bloque guardado. Contame qué tiene que hacer y le doy la función.':undefined);
 }
 if(kind==='delete-block'){
  const id=selected.dataset.glDesignBlock;
  if(id&&await save('delete',null,id))selected.remove();
  unselect();apply();return showBar('Bloque borrado.');
 }
}
// Captura: con el modo diseño activo, tocar la pantalla selecciona en vez de ejecutar la acción.
document.addEventListener('click',e=>{
 const t=e.target;
 if(t?.closest?.('#gl-design-toggle')){e.preventDefault();setOn(!on);return;}
 const gd=t?.closest?.('[data-gd]');
 if(gd&&bar?.contains(gd)){e.preventDefault();void action(gd.dataset.gd);return;}
 if(!on||isOwnUI(t))return;
 const [,root]=rootOf(t);if(!root&&!isBlock(t))return;
 if(mode==='edit'&&selected?.contains(t))return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();
 if(mode==='edit')void action('cancel');
 pick(t.closest('[data-gl-design-block]')||t);
},true);
document.addEventListener('keydown',e=>{if(on&&e.key==='Escape'){e.preventDefault();if(selected)void action('cancel');else setOn(false);}},true);
function start(){
 if(!document.body)return setTimeout(start,50);
 new MutationObserver(()=>{if(!applying)schedule();}).observe(document.body,{childList:true,subtree:true});
 schedule();
}
start();
window.GestLokDesign=Object.freeze({refresh:()=>load(true),pageKey,anchorOf,find,state:()=>({on,count:items.length})});
})();
