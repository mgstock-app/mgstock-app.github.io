(() => {
  'use strict';
  const labels = {caja:'Caja', ventas:'Ventas', stock:'Stock', precios:'Precios', historial:'Historial', reportes:'Reportes'};
  const statuses = {draft:'Borrador', pending:'Pendiente', accepted:'Activo', revoked:'Revocado'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pilot = () => window.GestLokPilot;
  const db = () => window.GestLokSupabase;
  let panel, busy = false;
  function profile(person = {}) {
    const locked = person.status === 'revoked';
    return `<details ${person.id?'':'open'}><summary>${person.id ? `${esc(person.first_name)} ${esc(person.last_name)} · ${statuses[person.status]}` : 'Nuevo invitado'}</summary>
      <form data-invite-profile data-id="${esc(person.id)}"><fieldset ${locked?'disabled':''}>
      <label>Nombre <input name="first" required maxlength="80" value="${esc(person.first_name)}"></label>
      <label>Apellido <input name="last" required maxlength="80" value="${esc(person.last_name)}"></label>
      <label>Teléfono con código de país <input name="phone" type="tel" required maxlength="25" placeholder="+54…" value="${esc(person.phone)}"></label>
      <label>Correo de acceso <input name="email" type="email" maxlength="254" required ${person.status && person.status !== 'draft' ? 'readonly':''} value="${esc(person.invited_email)}"></label>
      <fieldset ${person.id ? "" : "disabled"}><legend>Permisos ${person.id ? "" : "· disponibles al crear el perfil"}</legend>${Object.entries(labels).map(([id,label]) => `<label><input role="switch" name="${id}" type="checkbox" ${person.permissions?.[id]?'checked':''}> ${label}</label>`).join('')}</fieldset>
      ${person.id ? '<button type="submit">Guardar perfil</button>' : '<button type="submit" value="issue">Enviar invitación por WhatsApp</button>'}
      ${person.id && ['draft','pending'].includes(person.status) ? '<button type="submit" value="issue">Preparar WhatsApp</button>' : ''}
      ${person.id && !locked ? '<button type="button" data-invite-revoke>Revocar acceso</button>' : ''}
      </fieldset></form></details>`;
  }
  function status(message) { if(panel?.open) panel.querySelector('[role=status]').textContent = message; }
  async function load() {
    if (!pilot()?.scanner?.()) return;
    const tenant = pilot().tenantId();
    const {data,error} = await db().from('gestlok_scanner_invites').select('id,first_name,last_name,phone,invited_email,permissions,status').eq('tenant_id',tenant).order('created_at');
    if (error) throw error;
    if(!panel?.open || !pilot()?.scanner?.() || pilot().tenantId()!==tenant) return;
    const caja = await db().rpc('gestlok_scanner_caja_options',{p_tenant:tenant});
    if (!panel?.open || pilot().tenantId()!==tenant) return;
    const box=panel.querySelector('[data-invite-caja]');
    box.innerHTML=caja.data?.options?.length ? '<form data-invite-caja-form><label>Caja para invitados <select name="caja" required><option value="">Elegir Caja</option>'+caja.data.options.map(option=>'<option value="'+esc(option.id)+'" '+(option.id===caja.data.selected?'selected':'')+'>'+esc(option.nombre)+'</option>').join('')+'</select></label><button>Vincular Caja</button></form>' : '<p>La empresa necesita una Caja habilitada para compartirla.</p>';
    panel.querySelector('[data-invite-list]').innerHTML = profile() + (data||[]).map(profile).join('');
  }
  async function rpc(name,args) {
    const {data,error} = await db().rpc('gestlok_scanner_invite_'+name,args);
    if (error) throw error;
    return data;
  }
  async function run(task) {
    if(busy || !pilot()?.scanner?.()) return;
    busy = true;
    try { await task(); } catch(error) { status(error.message || 'No se pudo guardar.'); }
    finally { busy = false; }
  }
  async function open() {
    if (!pilot()?.scanner?.() || panel?.open) return;
    panel = document.createElement('dialog');
    panel.setAttribute('aria-label','Invitar personas');
    panel.className='gl-scanner-invites';
    panel.style.cssText='width:min(95vw,42rem);max-height:85vh;overflow:auto;padding:1.5rem';
    panel.innerHTML='<form method="dialog"><button>Cerrar</button></form><h2>Invitar personas</h2><p role="status"></p><div data-invite-caja></div><div data-invite-share></div><div data-invite-list></div>';
    panel.addEventListener('close', () => {panel.remove();panel=null;},{once:true});
    document.body.append(panel);
    panel.showModal();
    await run(load);
  }
  document.addEventListener('click', e => {
    if(e.target.closest('[data-scanner-invite-open]')) void open();
    const revoke=e.target.closest('[data-invite-revoke]');
    if(!revoke || !panel?.contains(revoke)) return;
    const id=revoke.form.dataset.id;
    if(!window.confirm('¿Revocar esta invitación y quitar su acceso?')) return;
    void run(async () => {await rpc('revoke',{p_id:id});await load();status('Acceso revocado.');});
  });
  document.addEventListener('submit', e => {
    const form=e.target;
    if(form.matches('[data-invite-caja-form]') && panel?.contains(form)){
      e.preventDefault();
      void run(async () => {
        const {error}=await db().rpc('gestlok_scanner_caja_link',{p_tenant:pilot().tenantId(),p_comercio:new FormData(form).get('caja')});
        if(error) throw error;
        status('Caja vinculada.');
      });
      return;
    }
    if(!form.matches('[data-invite-profile]') || !panel?.contains(form)) return;
    e.preventDefault();
    const issue=e.submitter?.value==='issue';
    const data=new FormData(form);
    const phone=String(data.get('phone')).replace(/[\s().-]/g,'');
    // Open a tab synchronously from the user gesture; browsers block async popups.
    const whatsappTab=issue ? window.open('about:blank','_blank') : null;
    void run(async () => {
      try {
      const id=await rpc('save',{p_tenant:pilot().tenantId(),p_id:form.dataset.id||null,p_first:data.get('first'),p_last:data.get('last'),p_phone:phone,p_email:data.get('email'),p_permissions:Object.fromEntries(Object.keys(labels).map(k=>[k,form.dataset.id ? data.has(k) : false]))});
      if(issue){
        const token=await rpc('issue',{p_id:id});
        const invite=new URL('/scanner-invitado/',location.origin);
        invite.hash=token;
        const whatsapp=new URL('https://wa.me/');
        whatsapp.searchParams.set('text',`Te invitaron al Plan Scanner de GESTLOK. Abrí el enlace con el correo indicado por quien te invitó. Vence en 48 horas. ${invite}`);
        if(whatsappTab && !whatsappTab.closed) whatsappTab.location.replace(whatsapp.href);
        const link=document.createElement('a');link.href=whatsapp.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir WhatsApp para compartir';
        panel?.querySelector('[data-invite-share]').replaceChildren(link);
      }
      await load();status(issue?'Se preparó el enlace. Elegí el contacto y enviá la invitación desde WhatsApp.':'Perfil guardado.');
      } catch(error) { if(whatsappTab && !whatsappTab.closed) whatsappTab.close(); throw error; }
    });
  });
})();
