/* Reseñas: beneficio independiente de cualquier publicación en Google.
   Las fechas, los códigos y la transición de único uso son autoridad del servidor. */
(() => {
  'use strict';
  const TENANT = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
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
  const allowed = () => !!api && api.S.me?.tenant_id === TENANT && api.S.local === 'munro' &&
    (['creadora','dueno'].includes(api.miRol()) || (api.miRol() === 'gerente' && api.misLocales().includes('munro')));
  const editable = () => allowed() && !api.S.offline && !!window.GestLokSupabase && !busy;
  const date = value => new Date(value).toLocaleString('es-AR', {timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short',timeStyle:'short'});
  const label = status => ({pending:'Pendiente',used:'Usado',expired:'Cupón Vencido'}[status] || 'No disponible');
  const rpc = async (name, params) => {
    if (!allowed() || api.S.offline) throw new Error('Necesitás acceso autorizado y conexión para operar cupones.');
    const result = await window.GestLokSupabase.rpc(name, params);
    if (result.error) {
      const text = result.error.message || '';
      if (/duplicate|unique|ya tiene/i.test(text)) throw new Error('Este teléfono ya recibió el beneficio en este mes.');
      if (/vigencia|vencido|utilizado/i.test(text)) throw new Error('El cupón está utilizado o fuera de vigencia (del 1 al 12).');
      throw new Error('No se pudo completar. Revisá tu conexión y permisos; si falta la actualización de base, consultá a Administración.');
    }
    return result.data;
  };
  async function refresh() {
    if (!allowed() || loading || modal || busy) return;
    const current = generation;
    loading = true;
    try {
      const data = await rpc('gestlok_resenas_list');
      if (current !== generation || !allowed()) return;
      rows = data || []; error = '';
    } catch (cause) { if (current === generation) { rows = []; error = cause.message; } }
    finally { loading = false; if (current === generation && api.S.view === 'resenas') api.render(); }
  }
  function view() {
    if (!allowed()) return '';
    const counts = {pending:0,used:0,expired:0};
    rows.forEach(r => { if (r.status in counts) counts[r.status]++; });
    const selected = filter(rows, query);
    return `<section class="rv-page" aria-label="Reseñas de Mi Gusto Munro">
      <header><div><h2>Reseñas</h2><p>▣ Válido del 1 al 12 de cada mes · 10% OFF</p></div><button data-rv="history">Historial</button></header>
      <p class="rv-policy">El descuento es independiente de publicar reseñas en Google. No se solicita ni se exige una reseña.</p>
      <button class="rv-new" data-rv="new" ${editable()?'':'disabled'}>＋ Nuevo cupón</button>
      <div class="rv-stats">${[['Total',rows.length,'total'],['Pendientes',counts.pending,'pending'],['Usados',counts.used,'used'],['Vencidos',counts.expired,'expired']].map(([name,count,cls])=>`<article class="${cls}"><small>${name}</small><strong>${count}</strong></article>`).join('')}</div>
      <label class="rv-search">Buscar cliente, teléfono o cupón<input id="rv-search" type="search" value="${E(query)}" placeholder="Buscar por nombre, teléfono o cupón…"></label>
      ${error?`<p role="alert">${E(error)}</p><button data-rv="reload">Reintentar</button>`:''}
      ${loading && !rows.length?'<p role="status">Cargando cupones…</p>':''}
      <div class="rv-table" id="rv-history"><table><caption>Historial completo de cupones · ${selected.length} registros</caption><thead><tr><th>Cliente</th><th>Teléfono</th><th>Cupón</th><th>Estado</th><th>Creado / Utilizado</th><th>Acción</th></tr></thead><tbody>${selected.map(r=>`<tr><td>${E(r.customer_name)}</td><td>${E(r.phone)}</td><td><b>${E(r.code)}</b></td><td><span class="rv-badge ${r.status}">${label(r.status)}</span></td><td>${E(date(r.created_at))}${r.used_at?`<br>Usado: ${E(date(r.used_at))}`:''}</td><td><button data-rv="edit" data-id="${E(r.id)}">${r.status==='pending'?'Marcar utilizado':'Ver cupón'}</button></td></tr>`).join('') || '<tr><td colspan="6">No hay cupones para esta búsqueda.</td></tr>'}</tbody></table></div>
      <p class="rv-hint">Los pendientes vencen automáticamente después del día 12. Cada cliente recibe un único beneficio por mes.</p>
      ${modal?dialog():''}</section>`;
  }
  function dialog() {
    const r = modal.id ? rows.find(row=>row.id===modal.id) : null;
    return `<div class="rv-overlay"><section class="rv-modal" role="dialog" aria-modal="true" aria-labelledby="rv-title"><header><h2 id="rv-title">${r?'Editar cupón':'Nuevo cupón'}</h2><button data-rv="close" aria-label="Cerrar cupón" ${busy?'disabled':''}>×</button></header>
      <form id="rv-form"><label>Nombre del cliente<input name="name" required maxlength="100" value="${E(r?.customer_name || modal.name || '')}" ${r?'readonly':''}></label>
      <label>Teléfono<input name="phone" type="tel" required maxlength="30" value="${E(r?.phone || modal.phone || '')}" ${r?'readonly':''}></label>
      <div class="rv-code"><small>${r?'Cupón · 10% OFF':'Cupón automático · 10% OFF'}</small><strong>${r?E(r.code):'Al guardar'}</strong><small>Código único y aleatorio generado de forma segura</small></div>
      <p>▣ Válido del 1 al 12 del mes de emisión</p>
      ${r?`<p class="rv-badge ${r.status}">${label(r.status)}</p>${r.used_at?`<p>✓ Cupón marcado como usado el ${E(date(r.used_at))}</p>`:''}`:''}
      ${r?.status==='pending'?'<label class="rv-check"><input name="used" type="checkbox" required> Confirmo que el cliente utilizó el cupón</label>':''}
      ${modal.error?`<p role="alert">${E(modal.error)}</p>`:''}
      ${!r || r.status==='pending'?`<button class="rv-new" type="submit" ${editable()?'':'disabled'}>${busy?'Guardando…':r?'Guardar como utilizado':'Guardar cupón'}</button>`:''}
      </form></section></div>`;
  }
  function close() { modal = null; api.render(); document.querySelector('.rv-new')?.focus(); }
  async function save(form) {
    if (!editable() || !modal) return;
    const values = new FormData(form);
    const selected = modal.id;
    const name = String(values.get('name') || '').trim(), phone = normalizePhone(values.get('phone'));
    modal.name = name; modal.phone = phone;
    if (!selected && (name.length < 2 || !/^\d{10}$/.test(phone))) { modal.error = 'Completá nombre y teléfono argentino de 10 dígitos (código de área + número, sin 0 ni 15).'; api.render(); return; }
    if (selected && values.get('used') !== 'on') return;
    busy = true; modal.error = ''; api.render();
    try {
      const r = await rpc(selected?'gestlok_resenas_redeem':'gestlok_resenas_create',selected?{p_id:selected}:{p_name:name,p_phone:phone});
      rows = [r,...rows.filter(row=>row.id!==r.id)];
      modal = {id:r.id};
    } catch (cause) { modal.error = cause.message; }
    finally { busy = false; api.render(); }
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
      else if (action==='reload') { void refresh(); return; }
      else if (action==='history') { document.querySelector('#rv-history')?.scrollIntoView({behavior:'smooth'}); return; }
      api.render(); document.querySelector('.rv-modal input')?.focus();
    });
    document.addEventListener('submit', event => { if (event.target.id==='rv-form') { event.preventDefault(); void save(event.target); } });
    document.addEventListener('input', event => {
      if (event.target.id!=='rv-search' || !allowed()) return;
      query = event.target.value; api.render(); const input=document.querySelector('#rv-search'); input?.focus();
    });
    document.addEventListener('keydown', event => { if (event.key==='Escape' && modal && !busy) close(); });
  }
  function subscribe(local, push) {
    if (local!=='munro' || !allowed()) return;
    void refresh();
    const interval = setInterval(()=>{ if(api.S.view==='resenas' && !document.hidden) void refresh(); },15000);
    const onFocus = ()=>{if(api.S.view==='resenas') void refresh();};
    window.addEventListener('focus',onFocus);
    push(()=>{clearInterval(interval);window.removeEventListener('focus',onFocus);});
  }
  function reset() { generation++; rows=[]; query=''; error=''; modal=null; busy=false; }
  window.GestLokMunroResenas = {attach,view,subscribe,reset,permitido:allowed,_t:{normalizePhone,filter,E}};
})();
