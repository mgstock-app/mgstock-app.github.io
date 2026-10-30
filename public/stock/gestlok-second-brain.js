/* GESTLOK · Segundo cerebro: solo para la Creadora verificada.
   Datos exclusivamente desde RPC que comprueba gestlok_platform.require_admin().
   No almacena ideas en el navegador ni en el repositorio público. */
(() => {
  'use strict';
  let api, rows = [], loading = false, loaded = false, busy = false;
  let error = '', notice = '', search = '', draft = null;
  const db = () => window.GestLokSupabase;
  const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const allowed = () => api?.isCreadora?.() === true &&
    !window.GestLokCreatorSupport?.state?.()?.active &&
    !window.GestLokCreatorSupport?.previewRol?.();
  const redraw = () => api?.render?.();
  const statusNames = {idea:'Idea',diseno:'En diseño',pendiente:'Pendiente',aprobada:'Aprobada',archivada:'Archivada'};
  const statusList = Object.keys(statusNames);
  function styles() {
    if (document.getElementById('gl-second-brain-style')) return;
    const style = document.createElement('style');
    style.id = 'gl-second-brain-style';
    style.textContent = `
      .gl-br{color:#173452;display:grid;gap:16px;min-width:0}
      .gl-br-head,.gl-br-card{background:#fff;border:1px solid #e0e8f0;border-radius:18px;padding:20px;box-shadow:0 3px 14px rgba(20,51,85,.04)}
      .gl-br-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .gl-br-head h2{font-size:24px;margin:4px 0 7px;color:#122e50}
      .gl-br-head p,.gl-br-hint{font-size:13px;color:#53697f;margin:0;line-height:1.6}
      .gl-br-overline{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#3b648b;font-weight:800}
      .gl-br-btn{border:1px solid #becedc;background:#fff;color:#173452;border-radius:10px;padding:10px 14px;font:600 13px system-ui;cursor:pointer;min-height:42px}
      .gl-br-btn-primary{background:#12365c;border-color:#12365c;color:#fff}
      .gl-br-btn:disabled{opacity:.6;cursor:not-allowed}
      .gl-br-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .gl-br-search{max-width:420px;width:100%;background:#fff;border:1px solid #cbd8e6;border-radius:10px;padding:12px;color:#173452;font-size:14px}
      .gl-br-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:14px}
      .gl-br-item{border:1px solid #dce6ee;border-radius:13px;padding:16px;background:#fbfcfe;min-width:0}
      .gl-br-item h3{font-size:16px;margin:9px 0 7px;color:#143759;overflow-wrap:anywhere}
      .gl-br-item p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.5;color:#475b71;margin:0 0 11px}
      .gl-br-item small{color:#698198}
      .gl-br-state{display:inline-block;border-radius:50px;background:#e7eff8;padding:5px 10px;font-size:11px;font-weight:750;color:#173a60}
      .gl-br-form{display:grid;gap:14px;margin-top:14px}
      .gl-br-form label{display:grid;gap:6px;font-size:13px;font-weight:700;color:#234361}
      .gl-br-form input,.gl-br-form textarea,.gl-br-form select{border:1px solid #bbcad8;border-radius:10px;padding:12px;background:#fff;color:#102f51;font:14px system-ui;width:100%;box-sizing:border-box;min-height:44px}
      .gl-br-form textarea{min-height:200px;resize:vertical;line-height:1.6}
      .gl-br-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .gl-br-alert{border-left:3px solid #b14949;background:#fff1f1;padding:12px;border-radius:8px;color:#842e2e}
      .gl-br-notice{border-left:3px solid #357b5e;background:#edf8f1;padding:12px;border-radius:8px;color:#245d41}
      @media(max-width:600px){.gl-br-head,.gl-br-card{padding:14px}.gl-br-form-grid{grid-template-columns:1fr}.gl-br-list{grid-template-columns:1fr}.gl-br-head h2{font-size:21px}}
    `;
    document.head.appendChild(style);
  }
  function dateLabel(iso) {
    try { return new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short'}).format(new Date(iso)); }
    catch { return ''; }
  }
  async function refresh() {
    if (!allowed() || loading || busy || !db()?.rpc) return;
    loading = true; error = '';
    try {
      const {data,error:e} = await db().rpc('gestlok_creator_ideas_list');
      if (e || !Array.isArray(data)) throw e || Error('Sin autorización');
      rows = data; loaded = true;
    } catch {
      rows = []; loaded = false; error = 'No se pudieron cargar las ideas privadas. Verificá la conexión y tus permisos.';
    } finally { loading = false; redraw(); }
  }
  function editor() {
    if (!draft) return '';
    const d = draft;
    return '<section class="gl-br-card"><h3>'+(d.id?'Editar idea':'Nueva idea')+'</h3>'+
      '<form class="gl-br-form" id="gl-br-form">'+
      '<label>Título<input name="title" required minlength="3" maxlength="160" value="'+E(d.title)+'" placeholder="Nombre de la idea"></label>'+
      '<div class="gl-br-form-grid"><label>Categoría<input name="topic" required minlength="2" maxlength="80" value="'+E(d.topic||'General')+'"></label>'+
      '<label>Estado<select name="status">'+statusList.map(s=>'<option value="'+s+'"'+(s===d.status?' selected':'')+'>'+statusNames[s]+'</option>').join('')+'</select></label></div>'+
      '<label>Descripción y decisiones<textarea name="body" required minlength="3" maxlength="16000" placeholder="Descripción, acuerdos y pendientes...">'+E(d.body)+'</textarea></label>'+
      '<p class="gl-br-hint">Guardar esta idea no implementa ningún cambio en GESTLOK. La publicación de funcionalidades requiere autorización aparte.</p>'+
      '<div class="gl-br-actions"><button class="gl-br-btn gl-br-btn-primary" type="submit"'+(busy?' disabled':'')+'>Guardar en Segundo cerebro</button>'+
      '<button class="gl-br-btn" type="button" data-br-cancel>Cancelar</button></div></form></section>';
  }
  function item(r) {
    const text = String(r.body||'');
    return '<article class="gl-br-item"><span class="gl-br-state">'+E(statusNames[r.status]||'Idea')+'</span>'+
      '<h3>'+E(r.title)+'</h3><p>'+E(text.length>330?text.slice(0,330)+'…':text)+'</p>'+
      '<div class="gl-br-actions"><small>'+E(r.topic)+' · '+E(dateLabel(r.updated_at))+'</small>'+
      '<button class="gl-br-btn" type="button" data-br-edit="'+E(r.id)+'">Abrir / editar</button></div></article>';
  }
  function view() {
    if (!allowed()) return '';
    styles();
    if (!loaded && !loading && !error) queueMicrotask(refresh);
    const filtered = rows.filter(r => (r.title+' '+r.topic+' '+r.body).toLowerCase().includes(search.toLowerCase()));
    return '<div class="gl-br"><header class="gl-br-head"><div><span class="gl-br-overline">PRIVADO · SOLO CREADORA</span>'+
      '<h2>Segundo cerebro</h2><p>Ideas, bocetos y decisiones para el futuro de GESTLOK. Guardarlas no las publica.</p></div>'+
      '<div class="gl-br-actions"><button class="gl-br-btn" type="button" data-br-refresh>Actualizar</button>'+
      '<button class="gl-br-btn gl-br-btn-primary" type="button" data-br-new>+ Nueva idea</button></div></header>'+
      (error?'<p class="gl-br-alert" role="alert">'+E(error)+'</p>':'')+
      (notice?'<p class="gl-br-notice" role="status">'+E(notice)+'</p>':'')+
      (draft?editor():'')+
      '<section class="gl-br-card"><label for="gl-br-search" class="gl-br-overline">Buscar ideas</label>'+
      '<div><input id="gl-br-search" class="gl-br-search" type="search" value="'+E(search)+'" placeholder="Buscar por título, contenido o categoría"></div>'+
      (loading?'<p role="status">Cargando ideas privadas…</p>':
       !loaded?'<p class="gl-br-hint">Usá Actualizar para consultar las ideas guardadas.</p>':
       '<div class="gl-br-list">'+(filtered.length?filtered.map(item).join(''):'<p class="gl-br-hint">No encontramos ideas con ese criterio.</p>')+'</div>')+
      '</section></div>';
  }
  async function save(form) {
    if (!allowed() || !draft || busy) return;
    const values = Object.fromEntries(new FormData(form).entries());
    const payload = {p_title:String(values.title||'').trim(),p_body:String(values.body||'').trim(),
      p_topic:String(values.topic||'').trim(),p_status:String(values.status||'idea'),p_id:draft.id||null};
    if(payload.p_title.length<3||payload.p_body.length<3||payload.p_topic.length<2||!statusList.includes(payload.p_status)){
      error='Revisá el título, la categoría y la descripción.';redraw();return;
    }
    draft = {...draft,title:payload.p_title,body:payload.p_body,topic:payload.p_topic,status:payload.p_status};
    busy = true; error = ''; notice = '';
    try {
      const {data,error:e} = await db().rpc('gestlok_creator_ideas_save',payload);
      if (e || !data?.id) throw e || Error('Sin confirmación del servidor');
      draft = null; notice = 'Idea guardada de forma privada. No se publicaron funciones.';
      busy = false; await refresh();
    } catch { error='No se pudo guardar la idea. Tu borrador sigue abierto para volver a intentar.'; }
    finally { busy=false;redraw(); }
  }
  document.addEventListener('click', e => {
    if (!allowed()) return;
    const btn = e.target?.closest?.('[data-br-new],[data-br-edit],[data-br-cancel],[data-br-refresh]');
    if (!btn) return;
    e.preventDefault();
    if (btn.hasAttribute('data-br-new')) { draft={id:null,title:'',body:'',topic:'General',status:'idea'};error='';notice='';redraw(); }
    else if (btn.hasAttribute('data-br-edit')) {
      const r=rows.find(x=>x.id===btn.dataset.brEdit);
      if(r){draft={...r};error='';notice='';redraw();}
    } else if (btn.hasAttribute('data-br-cancel')) { draft=null;error='';redraw(); }
    else if (btn.hasAttribute('data-br-refresh')) void refresh();
  });
  document.addEventListener('change', e => {
    if(!allowed()||e.target?.id!=='gl-br-search')return;
    search=String(e.target.value||'').slice(0,160);redraw();
  });
  document.addEventListener('submit', e => {
    if(e.target?.id!=='gl-br-form')return;
    e.preventDefault();if(allowed())void save(e.target);
  });
  window.GestLokSecondBrain=Object.freeze({attach(ctx){api=ctx;},view,refresh});
})();