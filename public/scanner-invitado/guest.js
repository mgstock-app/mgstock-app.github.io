(() => {
  'use strict';
  const config=window.SPM_CONFIG;
  const db=window.supabase.createClient(config.url,config.key);
  window.GestLokSupabase=db;
  const labels={caja:'Caja',ventas:'Ventas',stock:'Stock',precios:'Precios',historial:'Historial',reportes:'Reportes'};
  const login=document.querySelector('#guest-login');
  const signout=document.querySelector('#guest-signout');
  const status=document.querySelector('#guest-status');
  const nav=document.querySelector('#guest-modules');
  const content=document.querySelector('#guest-content');
  const key='gestlok:scanner-invite';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(value));
  let token='', context=null, active='', generation=0, sessionUid=null, loading=false, refreshAgain=false;
  try {token=localStorage.getItem(key)||'';} catch {}
  if(/^[0-9a-f]{64}$/.test(location.hash.slice(1))){
    token=location.hash.slice(1);
    try {localStorage.setItem(key,token);}catch{}
    history.replaceState(null,'',location.pathname+location.search);
  }
  window.GestLokPilot=Object.freeze({authorized:()=>context?.permissions?.ventas===true && active==='ventas',tenantId:()=>context?.tenant_id});
  function clear(){
    active=''; generation++;
    window.GestLokPosPreview?.dispose();
    content.replaceChildren();
  }
  function message(text){status.textContent=text;}
  async function rpc(name,args){
    const {data,error}=await db.rpc('gestlok_scanner_'+name,args);
    if(error)throw error;
    return data;
  }
  async function refresh(session){
    if(loading){refreshAgain=true;return;}
    loading=true;
    try {
      const uid=session?.user?.id||null;
      if(uid!==sessionUid){clear();context=null;sessionUid=uid;nav.replaceChildren();}
      login.hidden=!!uid; signout.hidden=!uid;
      if(!uid){message(token?'Ingresá o creá una cuenta con el correo que recibió la invitación.':'Ingresá con tu cuenta de invitado.');return;}
      let next=await rpc('guest_context');
      if(!next && token){
        try {await rpc('invite_redeem',{p_token:token});}
        catch {message('La invitación no está disponible para esta cuenta. Verificá el correo o pedí un enlace nuevo.');return;}
        next=await rpc('guest_context');
      }
      if(next&&token){token='';try{localStorage.removeItem(key);}catch{}}
      if(!next || context?.tenant_id!==next.tenant_id || (active && next.permissions?.[active]!==true))clear();
      context=next;
      nav.replaceChildren();
      for(const [module,label] of Object.entries(labels)){
        if(context?.permissions?.[module]!==true)continue;
        const button=document.createElement('button');button.textContent=label;button.dataset.guestModule=module;
        if(active===module)button.setAttribute('aria-current','page');
        nav.append(button);
      }
      message(!context?'Esta cuenta no tiene una invitación activa.':nav.children.length?`Hola, ${context.first_name}. Elegí un módulo.`:'Tu cuenta está activa. El dueño todavía no habilitó módulos.');
    } catch {clear();context=null;nav.replaceChildren();message('No se pudo verificar el acceso. Revisá la conexión.');}
    finally {loading=false;if(refreshAgain){refreshAgain=false;void checkSession();}}
  }
  async function checkSession(){const {data}=await db.auth.getSession();await refresh(data?.session);}
  function renderRows(module,rows){
    if(!rows.length){content.innerHTML='<p>No hay registros para mostrar.</p>';return;}
    if(['stock','precios'].includes(module)){
      const stock=module==='stock';
      content.innerHTML=rows.map(row=>`<form data-guest-product data-id="${esc(row.id)}" data-version="${esc(row.updated_at)}"><article><h3>${esc(row.name)}</h3><p>${esc(row.sku)}</p>
        ${stock?'':`<label>Costo <input name="cost" type="number" min="0" max="9999999999.99" step="0.01" required value="${esc(row.cost_price)}"></label>`}
        <label>${stock?'Unidades':'Precio final'} <input name="value" type="number" min="0" max="${stock?'100000000':'9999999999.99'}" step="${stock?'1':'0.01'}" required value="${esc(stock?row.stock_quantity:row.unit_price)}"></label>
        <button type="submit">Guardar</button></article></form>`).join('');
      return;
    }
    content.innerHTML=rows.map(row=>module==='historial'
      ? `<article><strong>${esc(new Date(row.created_at).toLocaleString('es-AR'))} · ${esc(money(row.total))}</strong><p>${esc(row.payment_method)}</p>${(row.items||[]).map(item=>`<p>${esc(item.quantity)} × ${esc(item.name)}</p>`).join('')}</article>`
      : `<article><strong>${esc(row.fecha)}</strong><p>${esc(row.ventas)} ventas · ${esc(money(row.total))}</p></article>`).join('');
  }
  async function open(module){
    if(context?.permissions?.[module]!==true)return;
    clear();active=module;
    nav.querySelectorAll('button').forEach(b=>{if(b.dataset.guestModule===module)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    const request=generation;
    const tenant=context.tenant_id;
    content.textContent='Cargando…';
    try {
      if(module==='caja'){
        const commerce=await rpc('guest_caja',{p_tenant:tenant});
        if(request!==generation)return;
        if(!commerce){content.textContent='El dueño todavía tiene que vincular la Caja de esta empresa.';return;}
        const iframe=document.createElement('iframe');iframe.id='gl-caja-app-frame';iframe.title='Caja';
        iframe.src='/caja/?desde=gestlok&integrado=1&scanner_comercio='+encodeURIComponent(commerce);
        content.replaceChildren(iframe);
        return;
      }
      const data=await rpc('guest_module',{p_tenant:tenant,p_module:module});
      if(request!==generation)return;
      if(module==='ventas'){
        window.GestLokPosPreview.render(content,data.products,{guest:true,checkoutEnabled:data.live,paymentMethods:data.methods.map(m=>({id:m.method_id,label:m.label})),
          getReceipt:result=>db.rpc('gestlok_scanner_guest_receipt',{p_tenant:tenant,p_sale:result.saleId})});
        const settingsButton=document.createElement('button');
        settingsButton.type='button';settingsButton.textContent='Configurar lector e impresora';
        settingsButton.addEventListener('click',()=>{
          if(request!==generation || context?.permissions?.ventas!==true)return;
          window.GestLokPosPreview?.dispose();
          content.innerHTML=window.GestLokPosDevices.renderSettings(tenant);
          const back=document.createElement('button');
          back.type='button';back.textContent='Volver a Ventas';
          back.addEventListener('click',()=>void open('ventas'));
          content.prepend(back);
          window.GestLokPosDevices.mountSettings(content,tenant);
        });
        content.prepend(settingsButton);
      }else renderRows(module,data);
    } catch(error){if(request===generation)content.textContent=error.message||'No se pudo abrir el módulo.';}
  }
  nav.addEventListener('click',e=>{const module=e.target.closest('[data-guest-module]')?.dataset.guestModule;if(module)void open(module);});
  window.addEventListener('message',e=>{
    const frame=content.querySelector('#gl-caja-app-frame');
    if(frame&&e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==='gestlok-caja-volver')clear();
  });
  content.addEventListener('submit',async e=>{
    const form=e.target;
    if(!form.matches('[data-guest-product]')||!['stock','precios'].includes(active))return;
    e.preventDefault();
    const module=active, request=generation, data=new FormData(form), button=form.querySelector('button');
    button.disabled=true;
    try{
      await rpc('guest_update_product',{p_tenant:context.tenant_id,p_module:module,p_id:form.dataset.id,p_version:form.dataset.version,p_value:Number(data.get('value')),p_cost:data.has('cost')?Number(data.get('cost')):null});
      if(request===generation){message('Producto actualizado.');await open(module);}
    }catch(error){if(request===generation)message(error.message||'No se pudo guardar.');}
    finally{button.disabled=false;}
  });
  login.addEventListener('submit',async e=>{
    e.preventDefault();
    const data=new FormData(login),signup=e.submitter?.value==='signup';
    const email=String(data.get('email')).trim().toLowerCase(),password=String(data.get('password'));
    if(signup&&!token){message('Abrí el enlace de invitación antes de crear la cuenta.');return;}
    const button=e.submitter; if(button)button.disabled=true;
    try{
      const result=signup?await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/scanner-invitado/'}}):await db.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
      login.elements.password.value='';
      if(result.data.session)await refresh(result.data.session);
      else message('Confirmá tu correo y volvé a abrir el enlace de invitación.');
    }catch(error){message(error.message||'No se pudo ingresar.');}
    finally{if(button)button.disabled=false;}
  });
  signout.addEventListener('click',async()=>{await db.auth.signOut({scope:'local'});await checkSession();});
  db.auth.onAuthStateChange((_event,session)=>setTimeout(()=>void refresh(session),0));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkSession();});
  setInterval(()=>{if(context&&!document.hidden)void checkSession();},30000);
})();
