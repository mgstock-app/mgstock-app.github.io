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
 function capture(root,context,active){
   if(!root||!context)return null;
   const items=new Map(),occurrences=new Map();
   let focus=null;
   for(const el of controls(root)){
    if(!eligible(el))continue;
    const key=fieldKey(el);if(!key)continue;
    const index=occurrences.get(key)||0;occurrences.set(key,index+1);
    const uid=key+'|'+index,base=baseline(el);
    const checked=el.type==='checkbox'||el.type==='radio';
    const changed=checked?el.checked!==el.defaultChecked:String(el.value)!==base;
    if(changed)items.set(uid,{type:el.type,base,value:el.value,checked:el.checked});
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
     if(!saved||saved.type!==el.type||saved.base!==baseline(el))continue;
     if(el.type==='checkbox'||el.type==='radio')el.checked=saved.checked;
     else el.value=saved.value;
   }
   const focus=snapshot.focus;
   const el=focus&&fields.get(focus.uid);
   if(el&&typeof el.focus==='function'){
     el.focus({preventScroll:true});
     if(focus.start!=null&&typeof el.setSelectionRange==='function'){
       try{el.setSelectionRange(focus.start,focus.end);}catch{}
     }
   }
 }
 window.GestLokFormDraftGuard=Object.freeze({capture,restore});
})();
