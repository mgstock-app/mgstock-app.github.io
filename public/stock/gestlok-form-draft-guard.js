/* GESTLOK · Borradores de formularios durante renders de suscripciones.
   Solo DOM en memoria. Nunca almacena contraseñas, archivos ni datos entre cuentas/locales. */
(()=>{
 'use strict';
 const controls=root=>Array.from(root?.querySelectorAll?.('input,textarea,select')||[]);
 const eligible=el=>!el.disabled&&!el.readOnly&&!['hidden','file','password','submit','button','reset','image'].includes(el.type);
 const host=el=>el.closest?.('form')||null;
 const hostKey=form=>form?('form:'+(form.id||form.getAttribute?.('name')||'unnamed')+
    ':'+(form.getAttribute?.('data-draft-key')||'')):'outside';
 const fieldKey=el=>{
   const data=el.dataset||{};
   const identity=el.id ? 'id:'+el.id :
    data.provVal ? 'provider:'+String(data.id||'')+':'+data.provVal :
    data.provNote ? 'note:'+String(data.id||'')+':'+data.provNote :
    el.name ? 'name:'+el.name : '';
   if(!identity)return '';
   return hostKey(host(el))+'|'+identity+(el.type==='radio'?'|radio:'+el.value:'');
 };
 const baseline=el=>(el.type==='checkbox'||el.type==='radio')?
   String(Boolean(el.defaultChecked)):
   (el.tagName==='SELECT' ? String(Array.from(el.options||[]).find(x=>x.defaultSelected)?.value??el.options?.[0]?.value??'') :
    String(el.defaultValue??''));
 function capture(root,context,active,options={}){
   if(!root||!context)return null;
   const items=new Map(),occurrences=new Map();
   let focus=null;
   for(const el of controls(root)){
    if(!eligible(el))continue;
    const key=fieldKey(el);if(!key||(options.legacy&&!el.id&&!el.dataset?.provVal&&!el.dataset?.provNote))continue;
    const index=occurrences.get(key)||0;occurrences.set(key,index+1);
    const uid=key+'|'+index,base=baseline(el);
    const checked=el.type==='checkbox'||el.type==='radio';
    const changed=checked?el.checked!==el.defaultChecked:(options.legacy?el.value!==el.defaultValue:String(el.value)!==base);
    // Lo que se acaba de enviar no se copia al formulario siguiente: después de guardar,
    // las casillas quedan vacías para la próxima carga. Si el guardado falla, se repone (ver abajo).
    if(changed&&!alreadySubmitted(el,uid))items.set(uid,{type:el.type,base,value:el.value,checked:el.checked,legacy:!!options.legacy});
    if(active===el){
      let start=null,end=null;
      try{start=el.selectionStart;end=el.selectionEnd;}catch{}
      focus={uid,start,end};
    }
   }
   return {context,items,focus};
 }
 function restore(root,snapshot,context){
   if(!root||!snapshot||snapshot.context!==context)return;
   const occurrences=new Map(),fields=new Map();
   for(const el of controls(root)){
     if(!eligible(el))continue;
     const key=fieldKey(el);if(!key)continue;
     const index=occurrences.get(key)||0;occurrences.set(key,index+1);
     const uid=key+'|'+index;
     fields.set(uid,el);
     const saved=snapshot.items.get(uid);
     // Diferente registro o valor que cambió en el servidor: no inyectar borradores viejos.
     if(!saved||saved.type!==el.type||(!saved.legacy&&saved.base!==baseline(el)))continue;
     if(el.type==='checkbox'||el.type==='radio')el.checked=saved.checked;
     else el.value=saved.value;
   }
   if(pending&&hasError(root))reapply(root);
   const focus=snapshot.focus;
   const el=focus&&fields.get(focus.uid);
   if(el&&typeof el.focus==='function'){
     el.focus({preventScroll:true});
     if(focus.start!=null&&typeof el.setSelectionRange==='function'){
       try{el.setSelectionRange(focus.start,focus.end);}catch{}
     }
   }
 }
 /* ---- Después de guardar: casillas vacías para la siguiente carga (todo GESTLOK) ----
    Al enviar un formulario de la vista se anota lo enviado. Los renders siguientes ya no lo
    vuelven a copiar, así el formulario nuevo queda vacío. Si aparece un error (mensaje con
    role="alert" en la vista o aviso rojo), lo enviado se repone para no perder lo escrito. */
 const WINDOW_MS=60000;
 let pending=null;
 const now=()=>Date.now();
 function live(){if(pending&&now()-pending.at>WINDOW_MS)pending=null;return pending;}
 function snapshotForm(form){
   const values=new Map(),occurrences=new Map();
   for(const el of controls(form)){
     if(!eligible(el))continue;
     const key=fieldKey(el);if(!key)continue;
     const index=occurrences.get(key)||0;occurrences.set(key,index+1);
     values.set(key+'|'+index,{type:el.type,value:String(el.value??''),checked:!!el.checked});
   }
   return values;
 }
 const TEXT_TYPES=new Set(['text','tel','email','search','url','textarea']);
 function isEntryForm(form){
   const texts=controls(form).filter(el=>eligible(el)&&TEXT_TYPES.has(el.tagName==='TEXTAREA'?'textarea':el.type));
   return texts.length>0&&texts.every(el=>String(el.defaultValue??'')==='');
 }
 function alreadySubmitted(el,uid){
   const p=live();if(!p||hostKey(host(el))!==p.key)return false;
   const sent=p.values.get(uid);if(!sent||sent.type!==el.type)return false;
   return (el.type==='checkbox'||el.type==='radio')?sent.checked===!!el.checked:sent.value===String(el.value??'');
 }
 function hasError(root){
   return !!root?.querySelector?.('[role="alert"]:not([hidden])');
 }
 function reapply(root){
   const p=live();if(!p)return;pending=null;
   const occurrences=new Map();
   for(const el of controls(root)){
     if(!eligible(el))continue;
     const key=fieldKey(el);if(!key)continue;
     const index=occurrences.get(key)||0;occurrences.set(key,index+1);
     if(hostKey(host(el))!==p.key)continue;
     const sent=p.values.get(key+'|'+index);if(!sent||sent.type!==el.type)continue;
     // Solo completar lo que quedó vacío: nunca pisar lo que la persona escribió después.
     if(el.type==='checkbox'||el.type==='radio'){if(el.checked===el.defaultChecked)el.checked=sent.checked;}
     else if(String(el.value)===baseline(el))el.value=sent.value;
   }
 }
 // Cuando el módulo ya vació el formulario por su cuenta (por ejemplo, Pagos Online).
 function saved(form){form?.reset?.();pending=null;}
 /* ---- Sin sugerencias del navegador (todo GESTLOK) ----
    El navegador guarda lo escrito en cada campo y lo ofrece como lista desplegable
    (comandas, montos o teléfonos anteriores). Se desactiva en todos los formularios.
    Se respetan solo los datos de ingreso (email y contraseñas) para el gestor de contraseñas. */
 const CREDENTIALS=new Set(['email','username','current-password','new-password','one-time-code']);
 const SKIP_TYPES=new Set(['hidden','file','checkbox','radio','submit','button','reset','image','range','color','password']);
 const credential=el=>CREDENTIALS.has(String(el.getAttribute?.('autocomplete')||'').toLowerCase());
 function noSuggestions(root){
   if(!root?.querySelectorAll)return;
   const nodes=[...(root.matches?.('form,input,textarea')?[root]:[]),...root.querySelectorAll('form,input,textarea')];
   for(const el of nodes){
     if(el.closest?.('[data-gl-autocomplete="keep"]'))continue;
     if(el.tagName==='FORM'){
       if(el.querySelector('input[type="password"],[autocomplete="email"],[autocomplete="username"],[autocomplete="current-password"],[autocomplete="new-password"]'))continue;
     }else if(SKIP_TYPES.has(el.type)||credential(el))continue;
     if(el.getAttribute('autocomplete')!=='off')el.setAttribute('autocomplete','off');
   }
 }
 if(typeof document!=='undefined'&&typeof MutationObserver!=='undefined'){
   document.addEventListener('submit',event=>{
     const form=event.target;
     if(!form?.closest?.('#view')||form.querySelector?.('input[type="password"]'))return;
     // Solo formularios de carga nueva (sus textos empiezan vacíos). En los de edición
     // los valores guardados vuelven a mostrarse, así que se mantiene el comportamiento anterior.
     if(!isEntryForm(form))return;
     pending={key:hostKey(form),values:snapshotForm(form),at:now()};
   },true);
   const start=()=>{
     noSuggestions(document.body);
     new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1)noSuggestions(n);})
       .observe(document.body,{childList:true,subtree:true});
     // Errores que se muestran como aviso rojo (fuera de la vista): reponer lo enviado.
     const toast=document.getElementById('toast');
     if(toast)new MutationObserver(()=>{
       if(live()&&!toast.hidden&&toast.classList.contains('err')){const view=document.getElementById('view');if(view)reapply(view);}
     }).observe(toast,{attributes:true,attributeFilter:['class','hidden']});
   };
   if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
 }
 window.GestLokFormDraftGuard=Object.freeze({capture,restore,saved,noSuggestions});
})();
