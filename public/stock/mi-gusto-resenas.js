/* Reseñas · Mi Gusto (Munro y Torcuato, cada sucursal con sus propios cupones).
   Beneficio independiente de cualquier publicación en Google.
   Las fechas, los códigos y la transición de único uso son autoridad del servidor.
   Sin conexión se puede consultar la última lista; emitir y marcar usado exigen conexión
   para que nunca haya un cupón duplicado ni usado dos veces. */
(() => {
  'use strict';
  const TENANT = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
  const LOCALES = {munro:'Munro', torcuato:'Torcuato'};
  let api, rows = [], query = '', error = '', loading = false, modal = null, busy = false, generation = 0;
  const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalizePhone = value => {
    let phone = String(value || '').replace(/\D/g, '');
    if (phone.startsWith('0054')) phone = phone.slice(4);
    else if (phone.startsWith('54') && phone.length > 11) phone = phone.slice(2);
    if (phone.length === 11 && phone.startsWith('9')) phone = phone.slice(1);
    if (phone.startsWith('0')) phone = phone.slice(1);
    return phone;
  };
  const filter = (items, term) => {
    const q = String(term || '').trim().toLocaleLowerCase('es-AR');
    const digits = q.replace(/\D/g, '');
    return items.filter(r => !q || r.customer_name.toLocaleLowerCase('es-AR').includes(q) || r.phone.includes(q) || (digits.length >= 3 && normalizePhone(r.phone).includes(digits)) || r.code.toLowerCase().includes(q));
  };
  const local = () => api?.S.local;
  const allowed = () => !!api && api.S.me?.tenant_id === TENANT && local() in LOCALES &&
    (['creadora','dueno'].includes(api.miRol()) || (api.miRol() === 'gerente' && api.misLocales().includes(local())));
  const online = () => !api.S.offline && navigator.onLine !== false;
  const editable = () => allowed() && online() && !!window.GestLokSupabase && !busy;
  const date = value => new Date(value).toLocaleString('es-AR', {timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short',timeStyle:'short'});
  const label = status => ({pending:'Pendiente',used:'Usado',expired:'Cupón Vencido'}[status] || 'No disponible');
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  /* «Válido del 1 al 12 de noviembre»: período del cupón (registrado después del 12, vale el mes siguiente). */
  const vigencia = r => { const [y,m] = String(r?.valid_from || r?.period || '').split('-').map(Number); return y && m ? 'del 1 al 12 de ' + MESES[m-1] + ' ' + y : 'del 1 al 12 del mes que corresponda'; };
  const rpc = async (name, params) => {
    if (!allowed() || !window.GestLokSupabase) throw new Error('Necesitás acceso autorizado para ver los cupones.');
    if (name !== 'gestlok_resenas_list' && !online()) throw new Error('Sin conexión: para emitir o marcar un cupón como usado hace falta internet.');
    const result = await window.GestLokSupabase.rpc(name, {p_local:local(), ...params});
    if (result.error) {
      const text = result.error.message || '';
      if (/duplicate|unique|ya tiene/i.test(text)) throw new Error('Este teléfono ya tiene un cupón para este período en esta sucursal.');
      if (/motivo|explicá el motivo/i.test(text)) throw new Error('Indicá el motivo del cambio manual de estado (entre 8 y 300 caracteres).');
      if (/todavía no está vigente/i.test(text)) throw new Error('El cupón todavía no está vigente: se usa del 1 al 12 de su mes.');
      if (/inválido/i.test(text)) throw new Error('Revisá el nombre y el teléfono (10 dígitos: código de área + número, sin 0 ni 15).');
      if (/vigencia|vencido|utilizado|otra sucursal|pendientes/i.test(text)) throw new Error('El cupón ya se usó, venció o es de otra sucursal.');
      throw new Error('No se pudo completar. Revisá tu conexión y permisos; si falta la actualización de base, consultá a Administración.');
    }
    return result.data;
  };
  async function refresh() {
    if (!allowed() || loading || modal || busy) return;
    const current = generation;
    loading = true;
    try {
      const data = await rpc('gestlok_resenas_list', {});
      if (current !== generation || !allowed()) return;
      rows = data || []; error = '';
    } catch (cause) { if (current === generation) { rows = []; error = cause.message; } }
    finally {
      loading = false;
      if (current !== generation || api.S.view !== 'resenas') return;
      // Mientras se escribe en el buscador solo se actualiza la tabla, sin reemplazar el campo.
      const box = document.querySelector('#rv-history');
      if (document.activeElement?.id === 'rv-search' && box) box.innerHTML = tabla(filter(rows, query)); else api.render();
    }
  }
  const tabla = selected => `<table><caption>Historial completo de cupones de ${E(LOCALES[local()])} · ${selected.length} registros</caption><thead><tr><th>Cliente</th><th>Teléfono</th><th>Cupón</th><th>Estado</th><th>Creado / Utilizado</th><th>Acción</th></tr></thead><tbody>${selected.map(r=>`<tr><td>${E(r.customer_name)}</td><td>${E(r.phone)}</td><td><b>${E(r.code)}</b></td><td><span class="rv-badge ${r.status}">${label(r.status)}</span></td><td>${E(date(r.created_at))}${r.used_at?`<br>Usado: ${E(date(r.used_at))}`:''}</td><td><button data-rv="edit" data-id="${E(r.id)}">${r.status==='pending'&&editable()?'Ver / Modificar':r.status==='expired'&&editable()?'Cambiar estado':'Ver cupón'}</button></td></tr>`).join('') || '<tr><td colspan="6">No hay cupones para esta búsqueda.</td></tr>'}</tbody></table>`;
  function view() {
    if (!allowed()) return '';
    const counts = {pending:0,used:0,expired:0};
    rows.forEach(r => { if (r.status in counts) counts[r.status]++; });
    const selected = filter(rows, query);
    return `<section class="rv-page" aria-label="Reseñas de Mi Gusto ${E(LOCALES[local()])}">
      <header><div><h2>Reseñas</h2><p>▣ Válido del 1 al 12 de cada mes · 10% OFF · Sucursal ${E(LOCALES[local()])}</p></div><button data-rv="history">Historial</button></header>
      <p class="rv-policy">El descuento es independiente de publicar reseñas en Google. No se solicita ni se exige una reseña.</p>
      <button class="rv-new" data-rv="new" ${editable()?'':'disabled'}>＋ Nuevo cupón</button>
      <div class="rv-stats">${[['Total',rows.length,'total'],['Pendientes',counts.pending,'pending'],['Usados',counts.used,'used'],['Vencidos',counts.expired,'expired']].map(([name,count,cls])=>`<article class="${cls}"><small>${name}</small><strong>${count}</strong></article>`).join('')}</div>
      <label class="rv-search">Buscar cliente, teléfono o cupón<input id="rv-search" type="search" value="${E(query)}" placeholder="Buscar por nombre, teléfono o cupón…"></label>
      ${!online()?'<p class="rv-offline" role="status">Sin conexión: podés consultar y buscar la última lista guardada. Para emitir o marcar un cupón como usado hace falta internet.</p>':''}
      ${error?`<p role="alert">${E(error)}</p><button data-rv="reload">Reintentar</button>`:''}
      ${loading && !rows.length?'<p role="status">Cargando cupones…</p>':''}
      <div class="rv-table" id="rv-history">${tabla(selected)}</div>
      <p class="rv-hint">Los pendientes vencen automáticamente después del día 12. Cada cliente recibe un único beneficio por mes.</p>
      ${modal?dialog():''}</section>`;
  }
  function dialog() {
    const r = modal.id ? rows.find(row=>row.id===modal.id) : null;
    const pendiente = r?.status === 'pending', editando = !r || modal.editing;
    const ro = editando ? '' : 'readonly';
    const titulo = !r ? 'Nuevo cupón' : modal.editing ? 'Modificar cupón' : 'Cupón';
    const usable = pendiente && r.usable !== false;
    const manual = !!r && !r.used_at && !usable && (pendiente || r.status === 'expired');
    return `<div class="rv-overlay"><section class="rv-modal" role="dialog" aria-modal="true" aria-labelledby="rv-title"><header><h2 id="rv-title">${titulo}</h2><button data-rv="close" aria-label="Cerrar cupón" ${busy?'disabled':''}>×</button></header>
      <form id="rv-form"><label>Nombre del cliente<input name="name" required maxlength="100" value="${E(modal.editing ? modal.name ?? r.customer_name : r?.customer_name || modal.name || '')}" ${ro}></label>
      <label>Teléfono<input name="phone" type="tel" required maxlength="30" value="${E(modal.editing ? modal.phone ?? r.phone : r?.phone || modal.phone || '')}" ${ro}></label>
      <div class="rv-code"><small>${r?'Cupón · 10% OFF':'Cupón automático · 10% OFF'}</small><strong>${r?E(r.code):'Al guardar'}</strong><small>Código único y aleatorio generado de forma segura</small></div>
      <p>▣ ${r ? 'Válido ' + E(vigencia(r)) : 'Se usa del 1 al 12: registrado hasta el 12 vale este mes; después del 12, el mes siguiente.'}</p>
      ${r?`<p class="rv-badge ${r.status}">${label(r.status)}${pendiente && !usable ? ' · todavía no vigente' : ''}</p>${r.used_at?`<p>✓ Cupón marcado como usado el ${E(date(r.used_at))}</p>`:''}`:''}
      ${modal.error?`<p role="alert">${E(modal.error)}</p>`:''}
      ${editando ? `<div class="rv-actions">${r?`<button type="button" data-rv="cancel-edit" ${busy?'disabled':''}>Cancelar</button>`:''}<button class="rv-new" type="submit" ${editable()?'':'disabled'}>${busy?'Guardando…':r?'Guardar cambios':'Guardar cupón'}</button></div>`
        : pendiente ? `<div class="rv-actions"><button type="button" data-rv="modify" ${editable()?'':'disabled'}>✎ Modificar</button></div>
          ${usable ? `<label class="rv-check"><input name="used" type="checkbox"> Confirmo que el cliente utilizó el cupón</label>
          <button class="rv-new" type="button" data-rv="redeem" ${editable()?'':'disabled'}>${busy?'Guardando…':'Marcar como utilizado'}</button>` : ''}` : ''}
      ${manual ? `<div class="rv-manual"><p><b>Cambio manual de estado</b> · Este cupón está fuera del período habitual de uso (1 al 12). Registrá el motivo para marcarlo como utilizado sin alterar las fechas originales.</p><label>Motivo de la corrección<input name="reason" maxlength="300" minlength="8" placeholder="Ej.: descuento aplicado en caja" autocomplete="off"></label><label class="rv-check"><input name="manual-used" type="checkbox"> Confirmo que el beneficio se aplicó y que el cambio es definitivo</label><button class="rv-new" type="button" data-rv="manual-redeem" ${editable()?'':'disabled'}>${busy?'Guardando…':'Cambiar estado a Usado'}</button></div>` : ''}
      </form></section></div>`;
  }
  function close() { modal = null; api.render(); document.querySelector('.rv-new')?.focus(); }
  async function run(name, params) {
    busy = true; modal.error = ''; api.render();
    try {
      const r = await rpc(name, params);
      if (r.local && r.local !== local()) throw new Error('El cupón pertenece a otra sucursal.');
      rows = [r,...rows.filter(row=>row.id!==r.id)];
      modal = {id:r.id, saved:true};
    } catch (cause) { modal.error = cause.message; }
    finally { busy = false; api.render(); }
  }
  /* «Guardar cupón» (alta) y «Guardar cambios» (modificar nombre y teléfono de un pendiente). */
  async function save(form) {
    if (!editable() || !modal) return;
    const values = new FormData(form);
    const name = String(values.get('name') || '').trim(), phone = normalizePhone(values.get('phone'));
    modal.name = name; modal.phone = phone;
    if (name.length < 2 || !/^\d{10}$/.test(phone)) { modal.error = 'Completá nombre y teléfono argentino de 10 dígitos (código de área + número, sin 0 ni 15).'; api.render(); return; }
    if (modal.id && !modal.editing) return;
    await run(modal.id ? 'gestlok_resenas_update' : 'gestlok_resenas_create', modal.id ? {p_id:modal.id, p_name:name, p_phone:phone} : {p_name:name, p_phone:phone});
  }
  async function redeem() {
    if (!editable() || !modal?.id) return;
    const check = document.querySelector('#rv-form input[name="used"]');
    if (!check?.checked) { modal.error = 'Marcá la tilde para confirmar que el cliente utilizó el cupón.'; api.render(); return; }
    await run('gestlok_resenas_redeem', {p_id:modal.id});
  }
  async function manualRedeem() {
    if (!editable() || !modal?.id) return;
    const motive = String(document.querySelector('#rv-form input[name="reason"]')?.value || '').trim();
    const checked = document.querySelector('#rv-form input[name="manual-used"]')?.checked === true;
    if (motive.length < 8 || motive.length > 300 || !checked) {
      modal.error = 'Escribí el motivo (mínimo 8 caracteres) y marcá la confirmación para cambiar el estado.';
      api.render(); return;
    }
    await run('gestlok_resenas_manual_use', {p_id:modal.id, p_reason:motive});
  }
  function attach(h) {
    api = h;
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-rv]');
      if (!button || !allowed() || busy) return;
      const action = button.dataset.rv;
      if (action==='new') modal = {};
      else if (action==='edit') modal = {id:button.dataset.id};
      else if (action==='close') { close(); return; }
      else if (action==='modify' && modal?.id) { modal = {id:modal.id, editing:true}; }
      else if (action==='cancel-edit' && modal?.id) { modal = {id:modal.id}; }
      else if (action==='redeem') { void redeem(); return; }
      else if (action==='manual-redeem') { void manualRedeem(); return; }
      else if (action==='reload') { void refresh(); return; }
      else if (action==='history') { document.querySelector('#rv-history')?.scrollIntoView({behavior:'smooth'}); return; }
      api.render(); document.querySelector('.rv-modal input')?.focus();
    });
    document.addEventListener('submit', event => { if (event.target.id==='rv-form') { event.preventDefault(); void save(event.target); } });
    document.addEventListener('input', event => {
      if (event.target.id!=='rv-search' || !allowed()) return;
      // Solo se actualiza la tabla: el campo de búsqueda no se reemplaza mientras se escribe.
      query = event.target.value; const box=document.querySelector('#rv-history'); if (box) box.innerHTML = tabla(filter(rows, query)); else api.render();
    });
    document.addEventListener('keydown', event => { if (event.key==='Escape' && modal && !busy) close(); });
  }
  function subscribe(loc, push) {
    if (!(loc in LOCALES) || !allowed()) return;
    void refresh();
    const interval = setInterval(()=>{ if(api.S.view==='resenas' && !document.hidden) void refresh(); },15000);
    const onFocus = ()=>{if(api.S.view==='resenas') void refresh();};
    window.addEventListener('focus',onFocus);
    push(()=>{clearInterval(interval);window.removeEventListener('focus',onFocus);});
  }
  function reset() { generation++; rows=[]; query=''; error=''; modal=null; busy=false; }
  window.GestLokResenas = {attach,view,subscribe,reset,permitido:allowed,_t:{normalizePhone,filter,E}};
})();
