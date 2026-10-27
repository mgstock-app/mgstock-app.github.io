/* La creadora verificada tiene edición permanente. El backend decide el permiso. */
(() => {
  'use strict';
  let api, state={active:false,permanent:false,loaded:false};
  async function refresh(){
    if(!api?.isCreadora()||!window.GestLokSupabase)return;
    let next={active:false,permanent:false,loaded:true};
    try{
      const {data,error}=await window.GestLokSupabase.rpc('gestlok_creator_editing_state');
      if(!error&&data?.active===true&&data?.permanent===true)next={active:true,permanent:true,loaded:true};
    }catch{}
    const changed=JSON.stringify(state)!==JSON.stringify(next);state=next;
    if(changed)api.onChange();
  }
  function banner(){
    if(!api?.isCreadora())return '';
    return state.active
      ? '<p class="note gl-creator-mode gl-creator-mode-on" role="status"><b>Acceso de creadora · Edición sin límite de tiempo</b></p>'
      : '<p class="note gl-creator-mode" role="status">Comprobando el acceso de creadora…</p>';
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
  window.GestLokCreatorMode=Object.freeze({attach(ctx){api=ctx;},refresh,readOnly:()=>!state.active,banner,state:()=>({...state})});
})();
