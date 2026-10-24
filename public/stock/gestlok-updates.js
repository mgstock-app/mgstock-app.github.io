/* GestLok · Vencimientos y centro de avisos (sin modificar planillas previas). */
(() => {
  'use strict';
  let ctx = null;
  let editing = null;
  let showingHistory = '';
  let archivedOpen = false;
  let busy = false;
  const get = () => ctx;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asISO = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  const dateMs = iso => {
    const s = asISO(iso), parts = s.split('-').map(Number);
    if (!s) return NaN;
    const time = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    return new Date(time).toISOString().slice(0, 10) === s ? time : NaN;
  };
  const plusDays = (iso, days) => {
    const t = dateMs(iso);
    return Number.isFinite(t) && Number.isInteger(days) && days > 0 && days <= 36500
      ? new Date(t + days * 86400000).toISOString().slice(0, 10) : '';
  };
  const todayISO = () => {
    const values = new Intl.DateTimeFormat('en-US', {timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const v = name => values.find(p => p.type === name)?.value || '';
    return v('year') + '-' + v('month') + '-' + v('day');
  };
  const remaining = iso => Math.round((dateMs(iso) - dateMs(todayISO())) / 86400000);
  const dateAR = iso => asISO(iso) ? iso.slice(8,10) + '/' + iso.slice(5,7) + '/' + iso.slice(2,4) : '—';
  const stateOf = iso => {
    const days = remaining(iso);
    if (!Number.isFinite(days)) return {cls:'invalid',title:'Sin fecha válida',days};
    if (days < 0) return {cls:'expired',title:'Vencido',days};
    if (days === 0) return {cls:'today',title:'Vence hoy',days};
    if (days <= 5) return {cls:'soon',title:'Vence pronto',days};
    return {cls:'valid',title:'Vigente',days};
  };
  const viewDue = () => {
    if (!ctx) return '';
    const S = ctx.S;
    const list = [...(S.vencimientos || [])].sort((a,b) =>
      Number(a.activo === false) - Number(b.activo === false) ||
      String(a.fechaVencimiento || '').localeCompare(String(b.fechaVencimiento || '')) ||
      String(a.nombre || '').localeCompare(String(b.nombre || ''),'es'));
    const active = list.filter(i => i.activo !== false), inactive = list.filter(i => i.activo === false);
    const editable = ctx.canW() && !S.offline, editingItem = list.find(i => i.id === editing) || null;
    const counts = {valid:0,soon:0,today:0,expired:0};
    active.forEach(i => {const s = stateOf(i.fechaVencimiento).cls;if (counts[s] != null) counts[s]++;});
    const fields = editing !== null ? (
      '<form class="gl-exp-form card pad" id="gl-exp-form">' +
       '<div class="gl-exp-form-title"><h2>' + (editingItem ? 'Actualizar servicio' : 'Agregar servicio') + '</h2><button type="button" class="btn sm" data-up-action="cancel">Cancelar</button></div>' +
       '<div class="gl-exp-form-grid"><div class="fld"><label for="gl-exp-name">Servicio o control</label><input required maxlength="100" id="gl-exp-name" placeholder="Ej.: Fumigación" value="' + esc(editingItem?.nombre || '') + '"></div>' +
       '<div class="fld"><label for="gl-exp-done">Fecha de realización</label><input required type="date" id="gl-exp-done" value="' + esc(editingItem?.fechaRealizacion || todayISO()) + '"></div>' +
       '<div class="fld"><label for="gl-exp-days">Vigencia en días</label><input required type="number" min="1" max="36500" step="1" id="gl-exp-days" placeholder="Ej.: 30" value="' + esc(editingItem?.duracionDias || 30) + '"></div>' +
       '<div class="gl-exp-preview"><small>Vencimiento calculado</small><strong id="gl-exp-preview-date">' + dateAR(plusDays(editingItem?.fechaRealizacion || todayISO(),Number(editingItem?.duracionDias || 30))) + '</strong></div></div>' +
       '<p class="lead">Podés agregar cualquier servicio según el negocio. Al actualizarlo, la fecha anterior queda guardada en el historial.</p>' +
       '<div class="bar-a"><button class="btn primary" type="submit" ' + (!editable || busy ? 'disabled' : '') + '>' + (busy ? 'Guardando…' : 'Guardar servicio') + '</button></div></form>'
    ) : '';
    const row = i => {
      const status=stateOf(i.fechaVencimiento);
      const days=status.days<0?'Venció hace '+Math.abs(status.days)+' días':status.days===0?'Vence hoy':status.days===1?'Queda 1 día':'Quedan '+status.days+' días';
      const history=(Array.isArray(i.historial) ? i.historial : []);
      return '<article class="gl-exp-row card"><div class="gl-exp-row-body">' +
        '<div class="gl-exp-name"><strong>'+esc(i.nombre)+'</strong><span class="gl-exp-state '+status.cls+'">'+esc(status.title)+'</span></div>' +
        '<div class="gl-exp-values"><div><small>Realizado</small><b>'+dateAR(i.fechaRealizacion)+'</b></div>' +
        '<div><small>Vigencia</small><b>'+esc(i.duracionDias)+' días</b></div>' +
        '<div><small>Vencimiento</small><b>'+dateAR(i.fechaVencimiento)+'</b></div>' +
        '<div><small>Estado</small><b>'+esc(days)+'</b></div></div>' +
        '<div class="gl-exp-actions"><button type="button" class="btn sm" data-up-action="history" data-id="'+esc(i.id)+'">Historial ('+history.length+')</button>' +
        (editable && i.activo !== false?'<button type="button" class="btn sm" data-up-action="edit" data-id="'+esc(i.id)+'">Renovar / editar</button><button type="button" class="btn sm" data-up-action="archive" data-id="'+esc(i.id)+'">Archivar</button>':'') +
        '</div></div>' +
        (showingHistory===i.id?'<div class="gl-exp-history"><h4>Historial del servicio</h4>'+ (history.length?
          history.slice().reverse().map(h=>'<div class="gl-exp-history-item"><b>'+esc(h.accion||'Registro')+'</b><span>'+dateAR(h.fechaRealizacion)+' · '+esc(h.duracionDias)+' días · Vence '+dateAR(h.fechaVencimiento)+'</span><small>'+esc(h.autor||'Equipo')+'</small></div>').join(''):
          '<p class="lead">Sin registros anteriores.</p>')+'</div>':'')+
        '</article>';
    };
    return '<section class="sheet gl-exp-page"><div class="gl-exp-heading"><div><p class="eyebrow">Gestión de servicios · '+esc(ctx.localNombre())+'</p><h1>Vencimientos</h1><p class="lead">Registrá controles periódicos, conocé cuándo vencen y conservá cada renovación.</p></div>' +
      (editable?'<button class="btn primary" data-up-action="new">+ Agregar servicio</button>':'')+'</div>' +
      '<div class="gl-exp-stats"><div><strong>'+counts.valid+'</strong><span>Vigentes</span></div><div><strong>'+counts.soon+'</strong><span>Próximos</span></div><div><strong>'+counts.today+'</strong><span>Hoy</span></div><div><strong>'+counts.expired+'</strong><span>Vencidos</span></div></div>' +
      fields + '<div class="gl-exp-list">' + (active.length ? active.map(row).join(''):'<div class="card pad"><h2>Empezá con tus servicios</h2><p class="lead">Ejemplos: Fumigación, Limpieza de campana, Análisis de agua. Los agregás solo si tu negocio los necesita.</p></div>') + '</div>' +
      (inactive.length?'<div class="gl-exp-archived"><button class="btn sm" data-up-action="toggle-archived">Archivados ('+inactive.length+')</button>'+(archivedOpen?inactive.map(row).join(''):'')+'</div>':'') +
      '<p class="gl-exp-footnote">Estados: verde 6 días o más · naranja de 1 a 5 días · amarillo hoy · rojo vencido. Fechas según Argentina.</p></section>';
  };
  const getAlerts = S => {
    const alerts=[];
    const today=todayISO();
    const missing=(S.allProds || []).filter(p => p.sinStock===true || (p.stock!==null && p.stock!==undefined && Number(p.stock)===0));
    if(missing.length)alerts.push({level:'urgent',label:missing.length+' productos sin stock',desc:'Revisá los productos y prepará la reposición.'});
    const due=(S.vencimientos || []).filter(v=>v.activo!==false && remaining(v.fechaVencimiento)<=5);
    if(due.length) alerts.push({level:'important',label:due.length+' servicios próximos o vencidos',desc:'Entrá a Vencimientos para revisar fechas.'});
    const conteos=(S.conteos || []).filter(c=>{
      const f=Number(c.fecha||c.creado||0);
      return f && new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(f))===today;
    });
    if(!conteos.length) alerts.push({level:'warning',label:'Aún no hay conteos registrados hoy',desc:'Confirmá el cierre del local antes de las 23:15.'});
    return alerts;
  };
  const viewAlerts = () => {
    if (!ctx) return '';
    const S=ctx.S, alerts=getAlerts(S), logs=(S.avisos || []).slice().sort((a,b)=>Number(b.fecha||0)-Number(a.fecha||0)).slice(0,40);
    const state=window.GestLokPush?.state?.() || {supported:false,ready:false,enabled:false,issue:'Servicio no disponible',permission:'unsupported'};
    const supported=state.supported;
    return '<section class="sheet gl-exp-page"><p class="eyebrow">GestLok · '+esc(ctx.localNombre())+'</p><h1>Centro de avisos</h1>'+
      '<p class="lead">Consultá faltantes, conteos pendientes y novedades del equipo en el local.</p>'+
      '<div class="card pad gl-push-optin"><h2>Notificaciones en tu dispositivo</h2><p class="lead">Se habilitan únicamente si aceptás recibirlas. Los avisos del servidor requieren activar el servicio de notificaciones; esta pantalla no solicita permisos sin tu consentimiento.</p>'+
      '<p class="gl-push-status">'+esc(!supported?'Este dispositivo no admite notificaciones push.':state.permission==='denied'?'Bloqueadas por el navegador.':state.issue?'Servicio: '+state.issue:state.enabled?'Notificaciones activas en este dispositivo · Resumen diario 23:15.':state.ready?'Listo para activar · Resumen diario 23:15 (Argentina).':'Conectando con el servicio de avisos…')+'</p>'+
      '<div class="bar-a"><button class="btn sm" data-up-action="push-enable" '+(!supported || !state.ready || state.enabled?'disabled':'')+'>Activar notificaciones</button><button class="btn sm" data-up-action="push-disable" '+(!state.enabled?'disabled':'')+'>Desactivar</button></div></div>'+
      '<h2>Situación actual</h2><div class="gl-exp-alerts">'+(alerts.length?alerts.map(a=>'<article class="card pad gl-alert '+a.level+'"><b>'+esc(a.label)+'</b><p>'+esc(a.desc)+'</p></article>').join(''):'<div class="card pad"><b>Sin alertas urgentes en este local.</b></div>')+'</div>'+
      '<h2>Actividad reciente</h2>'+(logs.length?logs.map(a=>'<div class="gl-activity card pad"><b>'+esc(a.titulo||'Actualización')+'</b><small>'+esc(a.detalle||'')+'</small></div>').join(''):'<p class="lead">Las próximas actualizaciones guardadas aparecerán acá.</p>')+'</section>';
  };
  const save = async form => {
    if(!ctx || busy || !ctx.canW() || ctx.S.offline) return ctx?.toast('Necesitás conexión y permiso de edición.',true);
    const name=String(form.querySelector('#gl-exp-name')?.value || '').trim().slice(0,100);
    const done=asISO(form.querySelector('#gl-exp-done')?.value);
    const duration=Number(form.querySelector('#gl-exp-days')?.value);
    const expiry=plusDays(done,duration);
    if(!name || !expiry){ctx.toast('Revisá el servicio, la fecha y la vigencia en días.',true);return;}
    if(!editing && ctx.S.vencimientos.some(x=>x.activo!==false && x.nombre?.toLowerCase()===name.toLowerCase())){ctx.toast('Ese servicio ya existe. Usá Renovar / editar.',true);return;}
    const local=ctx.S.local, id=editing || ('v-'+crypto.randomUUID()), actor=String(ctx.S.me?.name || ctx.S.uid || 'Equipo').slice(0,90);
    const item={nombre:name,fechaRealizacion:done,duracionDias:duration,fechaVencimiento:expiry,activo:true,actualizado:Date.now(),autor:ctx.S.uid};
    busy=true;
    try {
      const ref=ctx.C('vencimientos').doc(id), prev=await ref.get();
      const old=prev?.exists ? prev.data() : null;
      const change={accion:old?'Renovación / edición':'Primer registro',fechaRealizacion:done,duracionDias:duration,fechaVencimiento:expiry,autor:actor,registrado:Date.now()};
      const history=Array.isArray(old?.historial) ? old.historial.slice(-199) : [];
      item.historial=[...history,change];
      await ctx.w(()=>old ? ref.update(item) : ref.set(item));
      if(ctx.S.local===local){editing=null;showingHistory='';ctx.toast('Vencimiento guardado con historial.');ctx.render();}
    } catch(e){ctx.fail(e);}
    finally{busy=false;}
  };
  const archive=async id=>{
    if(!ctx || !ctx.canW() || ctx.S.offline || busy)return;
    const obj=ctx.S.vencimientos.find(x=>x.id===id);
    if(!obj || obj.activo===false || !window.confirm('¿Archivar "'+obj.nombre+'"? El historial se conserva.'))return;
    busy=true;
    try {
      const hist=Array.isArray(obj.historial) ? obj.historial.slice(-199) : [];
      hist.push({accion:'Archivado',fechaRealizacion:obj.fechaRealizacion,duracionDias:obj.duracionDias,fechaVencimiento:obj.fechaVencimiento,autor:ctx.S.me?.name||'Equipo',registrado:Date.now()});
      await ctx.w(()=>ctx.C('vencimientos').doc(id).update({activo:false,historial:hist,actualizado:Date.now()}));
      ctx.toast('Servicio archivado, con historial conservado.');
    } catch(e){ctx.fail(e);}
    finally{busy=false;}
  };
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-up-action]');if(!btn || !ctx)return;
    const action=btn.dataset.upAction, id=btn.dataset.id;
    if(action==='new'){editing='';ctx.render();}
    if(action==='cancel'){editing=null;ctx.render();}
    if(action==='edit'){editing=id;ctx.render();}
    if(action==='history'){showingHistory=showingHistory===id?'':id;ctx.render();}
    if(action==='archive')archive(id);
    if(action==='toggle-archived'){archivedOpen=!archivedOpen;ctx.render();}
    if(action==='push-enable') ctx.pushEnable?.();
    if(action==='push-disable') ctx.pushDisable?.();
  });
  document.addEventListener('submit',e=>{
    if(e.target.id!=='gl-exp-form')return;
    e.preventDefault();
    save(e.target);
  });
  document.addEventListener('input',e=>{
    if(!['gl-exp-done','gl-exp-days'].includes(e.target.id))return;
    const form=e.target.closest('form'), out=form?.querySelector('#gl-exp-preview-date');
    if(out) out.textContent=dateAR(plusDays(form.querySelector('#gl-exp-done')?.value,Number(form.querySelector('#gl-exp-days')?.value)));
  });
  window.GestLokUpdates={
    attach:function(c){ctx=c;},
    viewDue,viewAlerts,plusDays,remaining,stateOf,dateAR,todayISO,
    reset:function(){editing=null;showingHistory='';archivedOpen=false;},
    getAlerts
  };
})();