/* GESTLOK · demo pública: «Administrar a los empleados» › Horarios.
   Muestra la planilla semanal de GESTLOK con un Excel de ejemplo (datos 100 % ficticios) y deja elegir
   entre la plantilla GESTLOK o un archivo propio. Nada se envía a ningún servidor: todo queda en esta pestaña. */
(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('demo') !== '1') return;
  const canSeeReceipt = () => document.getElementById('gl-visitor-role')?.value === 'dueno';
  const KEY = 'gestlok:visitor:horarios:v1';
  const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const ESTADOS = ['', 'OFF', 'Feriado', 'Ausente', 'Ausente justificado', 'Vacaciones'];
  // Menú de empleados: el demo reutiliza la planilla ficticia y suma los legajos actuales.
  const url = p => new URL(p, document.baseURI).href;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sheetsOk = u => /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/edit(?:[?#].*)?$/.test(u);
  let base = null, data = null, employeeStates = {}, view = {source:'gestlok', tab:'semana', section:'horarios', employeeSearch:'', selectedPerson:-1, own:null, link:'', error:''};

  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify({data, employeeStates, source:view.source, link:view.link})); } catch {} };
  const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
  async function ready(){
    if (data) return;
    const saved = load();
    if (!base){
      const r = await fetch(url('plantillas/demo-horarios.json'), {cache:'no-cache'});
      if (!r.ok) throw new Error('No se pudo abrir el ejemplo');
      base = await r.json();
    }
    data = saved?.data || JSON.parse(JSON.stringify(base));
    if (saved){ view.source = saved.source === 'propio' ? 'propio' : 'gestlok'; view.link = saved.link || ''; employeeStates = saved.employeeStates && typeof saved.employeeStates === 'object' ? saved.employeeStates : {}; }
  }

  /* ---------- Mismos cálculos que la planilla Excel ---------- */
  const min = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
  const span = (a, b) => { const x = min(a), y = min(b); return x == null || y == null ? 0 : ((y - x) % 1440 + 1440) % 1440; };
  const hm = n => `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`;
  const dayHours = d => d[4] && d[4] !== 'Feriado' ? 0 : span(d[0], d[1]) + span(d[2], d[3]);
  const dayTurns = d => (d[0] ? 1 : 0) + (d[2] ? 1 : 0);
  function totals(p){
    const w = data.semana[p.nombre] || [];
    const ok = d => !d[4] || d[4] === 'Feriado';
    const r = {horas:0, turnos:0, off:0, ferH:0, ferT:0, aus:0, vac:0};
    for (const d of w){
      r.horas += dayHours(d); if (ok(d)) r.turnos += dayTurns(d);
      if (d[4] === 'OFF') r.off++; if (d[4] === 'Ausente') r.aus++; if (d[4] === 'Vacaciones') r.vac++;
      if (d[4] === 'Feriado'){ r.ferH += dayHours(d); r.ferT += dayTurns(d); }
    }
    const offMin = p.cobra === 'Horas' ? min(p.off) || 0 : 0;
    r.porHoras = p.cobra === 'Horas';
    r.total = r.porHoras ? `${hm(r.horas + r.off * offMin + r.ferH)} hs` : `${r.turnos + r.off + r.ferT} ${r.turnos + r.off + r.ferT === 1 ? 'turno' : 'turnos'}`;
    r.trab = r.porHoras ? `${hm(r.horas)} hs` : `${r.turnos} ${r.turnos === 1 ? 'turno' : 'turnos'}`;
    r.offTxt = !r.off ? '–' : r.porHoras ? `${hm(r.off * offMin)} hs (${r.off} ${r.off === 1 ? 'día' : 'días'})` : `${r.off} ${r.off === 1 ? 'turno' : 'turnos'}`;
    r.ferTxt = r.porHoras ? (r.ferH ? `${hm(r.ferH)} hs` : '–') : (r.ferT ? `${r.ferT} ${r.ferT === 1 ? 'turno' : 'turnos'}` : '–');
    return r;
  }
  const fecha = i => { const d = new Date(data.lunes + 'T12:00:00'); d.setDate(d.getDate() + i); return d; };
  const ddmm = d => d.toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit'});
  const feriado = d => (data.feriados || []).some(f => f[0] === d.toISOString().slice(0, 10) && f[2] === 'Feriado');

  /* ---------- Vista ---------- */
  function semana(){
    const head = DAYS.map((n, i) => { const d = fecha(i), f = feriado(d); return `<th class="${f ? 'gl-dh-fer' : ''}">${n}<small>${ddmm(d)}${f ? ' · Feriado' : ''}</small></th>`; }).join('');
    const filas = data.equipo.map((p, pi) => {
      const w = data.semana[p.nombre] || (data.semana[p.nombre] = DAYS.map(() => ['', '', '', '', '']));
      const t = totals(p);
      const cell = (di, k) => `<td><input type="text" inputmode="numeric" maxlength="5" placeholder="--:--" autocomplete="off" value="${esc(w[di][k])}" data-dh-p="${pi}" data-dh-d="${di}" data-dh-k="${k}" aria-label="${esc(p.nombre)} · ${DAYS[di]} · ${['mañana entrada', 'mañana salida', 'noche entrada', 'noche salida'][k]}"></td>`;
      const rows = ['Mañana · entrada', 'Mañana · salida', 'Noche · entrada', 'Noche · salida'].map((label, k) =>
        `<tr>${k === 0 ? `<th class="gl-dh-who" rowspan="6" scope="rowgroup"><b>${esc(p.nombre)}</b><small>${esc(p.puesto)} · cobra por ${esc(p.cobra.toLowerCase())}</small></th>` : ''}<td class="gl-dh-lbl">${label}</td>${DAYS.map((_, di) => cell(di, k)).join('')}${k === 0 ? `<td class="gl-dh-tot" rowspan="6"><span>${esc(t.trab)}</span><small>OFF ${esc(t.offTxt)} · Feriado ${esc(t.ferTxt)}${t.aus ? ` · ${t.aus} ausente` : ''}${t.vac ? ` · ${t.vac} vac.` : ''}</small><b>${esc(t.total)}</b></td>` : ''}</tr>`).join('');
      const estado = `<tr><td class="gl-dh-lbl">Estado</td>${DAYS.map((_, di) => `<td><select data-dh-p="${pi}" data-dh-d="${di}" data-dh-k="4" class="gl-dh-st ${w[di][4] ? 'gl-st-' + w[di][4].split(' ')[0].toLowerCase() : ''}" aria-label="${esc(p.nombre)} · ${DAYS[di]} · estado">${ESTADOS.map(e => `<option ${w[di][4] === e ? 'selected' : ''} value="${e}">${e || '—'}</option>`).join('')}</select></td>`).join('')}</tr>`;
      const horas = `<tr class="gl-dh-hrs"><td class="gl-dh-lbl">Horas del día</td>${DAYS.map((_, di) => `<td>${dayHours(w[di]) ? hm(dayHours(w[di])) : '–'}</td>`).join('')}</tr>`;
      return rows + estado + horas;
    }).join('');
    return `<div class="gl-dh-scroll" tabindex="0" aria-label="Planilla semanal (deslizá para ver todos los días)"><table class="gl-dh-table"><thead><tr><th>Colaborador</th><th>Detalle</th>${head}<th>Total a liquidar</th></tr></thead><tbody>${filas}</tbody></table></div>`;
  }
  function resumen(){
    return `<div class="gl-dh-scroll"><table class="gl-dh-table gl-dh-sum"><thead><tr><th>Colaborador</th><th>Puesto</th><th>Cobra por</th><th>Trabajado</th><th>OFF</th><th>Feriado</th><th>Ausentes</th><th>Vacaciones</th><th>Total a liquidar</th></tr></thead><tbody>${
      data.equipo.map(p => { const t = totals(p); return `<tr><th scope="row">${esc(p.nombre)}</th><td>${esc(p.puesto)}</td><td>${esc(p.cobra)}</td><td>${esc(t.trab)}</td><td>${esc(t.offTxt)}</td><td>${esc(t.ferTxt)}</td><td>${t.aus ? t.aus + (t.aus === 1 ? ' día' : ' días') : '–'}</td><td>${t.vac ? t.vac + ' días' : '–'}</td><td><b>${esc(t.total)}</b></td></tr>`; }).join('')
    }</tbody></table></div>`;
  }
  const equipo = () => `<div class="gl-dh-scroll"><table class="gl-dh-table gl-dh-sum"><thead><tr><th>#</th><th>Colaborador</th><th>Puesto</th><th>Cobra por</th><th>OFF</th><th>Notas</th></tr></thead><tbody>${data.equipo.map((p, i) => `<tr><td>${i + 1}</td><th scope="row">${esc(p.nombre)}</th><td>${esc(p.puesto)}</td><td>${esc(p.cobra)}</td><td>${p.cobra === 'Horas' ? esc(p.off) + ' hs' : '1 turno'}</td><td>${esc(p.nota)}</td></tr>`).join('')}</tbody></table></div>`;
  const feriados = () => `<div class="gl-dh-scroll"><table class="gl-dh-table gl-dh-sum"><thead><tr><th>Fecha</th><th>Motivo</th><th>Tipo</th></tr></thead><tbody>${(data.feriados || []).map(f => `<tr><td>${new Date(f[0] + 'T12:00:00').toLocaleDateString('es-AR')}</td><td>${esc(f[1])}</td><td>${esc(f[2])}</td></tr>`).join('')}</tbody></table></div>`;
  const comoUsar = () => `<ol class="gl-dh-steps"><li><b>Equipo:</b> cargá a cada persona una vez (puesto, si cobra por horas o por turnos y cuánto vale un OFF).</li><li><b>Semana:</b> escribí el local y la fecha del lunes; los días y feriados se completan solos.</li><li>Cargá entrada y salida con formato 10:00. Si sale pasada la medianoche, se calcula bien.</li><li><b>Estado:</b> OFF, Feriado (trabajó un feriado), Ausente, Ausente justificado o Vacaciones.</li><li><b>Resumen:</b> total de la semana de cada persona, listo para liquidar.</li><li>En tu cuenta real: subí la plantilla a Google Drive, abrila con Google Sheets y pegá su enlace en Horarios.</li></ol>`;

  function propio(){
    const own = view.own;
    return `<div class="gl-dh-own">
      <div class="gl-dh-own-box"><h3>Subir mi Excel (.xlsx)</h3><p>En la demo tu archivo se lee solo en este navegador: no se sube a ningún servidor.</p>
        <label class="btn" for="gl-dh-file">Elegir archivo</label><input id="gl-dh-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
        ${view.error ? `<p class="note warn" role="alert">${esc(view.error)}</p>` : ''}
        ${own ? `<p class="gl-dh-ok">✓ ${esc(own.nombre)} · ${own.hojas.length} ${own.hojas.length === 1 ? 'hoja' : 'hojas'}</p>
          <div class="gl-dh-tabs" role="tablist" aria-label="Hojas de tu archivo">${own.hojas.map((h, i) => `<button role="tab" aria-selected="${i === (view.ownSheet || 0)}" data-dh-sheet="${i}">${esc(h.nombre)}</button>`).join('')}</div>
          ${[own.hojas[view.ownSheet || 0] || own.hojas[0]].map(h => `<div class="gl-dh-scroll"><table class="gl-dh-table gl-dh-sum gl-dh-own-prev"><tbody>${h.filas.slice(0, 30).map(f => `<tr>${f.slice(0, 12).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}` : ''}
      </div>
      <div class="gl-dh-own-box"><h3>Usar mi Google Sheets</h3><p>Pegá el enlace de tu planilla. En tu cuenta real queda guardado para todo el equipo autorizado de ese local.</p>
        <form id="gl-dh-link" class="gl-dh-linkform"><label for="gl-dh-url">Enlace de Google Sheets</label><input id="gl-dh-url" type="url" placeholder="https://docs.google.com/spreadsheets/d/…/edit" value="${esc(view.link)}"><button class="btn primary" type="submit">Guardar enlace</button></form>
        ${view.link ? `<p class="gl-dh-ok">✓ Enlace guardado en esta demo · <a href="${esc(view.link)}" target="_blank" rel="noopener noreferrer">Abrir planilla</a></p>` : ''}
      </div></div>`;
  }
  /* Legajos exclusivamente ficticios, iguales para los dos roles. No se consultan usuarios reales.
     El gerente puede consultar el estado, nunca importes del recibo. */
  const statusOf = p => ['activo','refuerzo','inactivo'].includes(employeeStates[p.nombre]) ? employeeStates[p.nombre] : 'activo';
  const statusText = v => ({activo:'Activo',refuerzo:'Refuerzo',inactivo:'Inactivo'}[v] || 'Activo');
  function collaborators(shop){
    const q = view.employeeSearch.trim().toLocaleLowerCase('es');
    const staff = data.equipo.map((p,i)=>({...p,i})).filter(p=>p.nombre.toLocaleLowerCase('es').includes(q)||p.puesto.toLocaleLowerCase('es').includes(q));
    const activos=data.equipo.filter(p=>statusOf(p)==='activo').length;
    const refuerzos=data.equipo.filter(p=>statusOf(p)==='refuerzo').length;
    const inactivos=data.equipo.filter(p=>statusOf(p)==='inactivo').length;
    const list=staff.map(p=>`<article class="gl-dh-person" data-dh-person>
       <span class="gl-dh-avatar" aria-hidden="true">${esc(p.nombre.slice(0,1).toUpperCase())}</span>
       <div class="gl-dh-person-info"><strong>${esc(p.nombre)}</strong><small>${esc(p.puesto)} · ${esc(shop)}</small></div>
       <span class="gl-dh-status gl-dh-status--${statusOf(p)}">${statusText(statusOf(p))}</span>
       <button type="button" class="gl-dh-view" data-dh-legajo="${p.i}">Ver legajo</button>
     </article>`).join('');
    const selected=data.equipo[view.selectedPerson];
    const detail=selected ? `<div class="gl-dh-detail" id="gl-dh-legajo" role="region" aria-label="Legajo ficticio">
       <header><div><small>LEGAJO DE DEMOSTRACIÓN</small><h2>${esc(selected.nombre)}</h2></div><button type="button" data-dh-detail-close aria-label="Cerrar legajo">×</button></header>
       <dl><div><dt>Local</dt><dd>${esc(shop)}</dd></div><div><dt>Colaborador</dt><dd>${esc(selected.nombre)}</dd></div><div><dt>Puesto</dt><dd>${esc(selected.puesto)}</dd></div><div><dt>Estado</dt><dd>${statusText(statusOf(selected))}</dd></div></dl>
       <label for="gl-dh-status">Cambiar estado ficticio</label>
       <select id="gl-dh-status" data-dh-status="${view.selectedPerson}">${['activo','refuerzo','inactivo'].map(x=>`<option value="${x}" ${x===statusOf(selected)?'selected':''}>${statusText(x)}</option>`).join('')}</select>
       <p class="gl-dh-note">Solo datos ficticios. El estado de este ejemplo se guarda en esta pestaña; no modifica legajos reales.</p>
       <button type="button" class="btn" data-dh-detail-close>← Volver a Colaboradores</button>
       </div>`:'';
    return `<section class="gl-dh-directory" aria-label="Colaboradores ficticios">
       <p class="gl-dh-intro">GESTLOK · ${esc(shop).toUpperCase()}</p>
       <h1 id="gl-dh-title">Administración de empleados</h1>
       <p class="lead">Explorá el equipo y sus legajos con el nuevo diseño móvil de GESTLOK. No se usan datos personales reales.</p>
       <div class="gl-dh-summary" aria-label="Resumen de colaboradores">
         <div><span>Total colaboradores</span><strong>${data.equipo.length}</strong></div>
         <div><span>Activos</span><strong>${activos}</strong></div>
         <div><span>Refuerzos</span><strong>${refuerzos}</strong></div>
         <div><span>Inactivos</span><strong>${inactivos}</strong></div>
       </div>
       <label class="gl-dh-search">Buscar colaborador o puesto
         <input id="gl-dh-search" type="search" placeholder="Buscar colaborador…" autocomplete="off" value="${esc(view.employeeSearch)}">
       </label>
       <section class="gl-dh-directory-card" aria-label="Listado de colaboradores">
         <header><strong>${esc(shop)}</strong><span>${staff.length} colaboradores</span></header>
         <div class="gl-dh-person-list">${list || '<p class="gl-dh-empty">Sin colaboradores con ese nombre.</p>'}</div>
       </section>
       ${detail}
       <p class="gl-dh-note">Los horarios permanecen disponibles en su carpeta, sin agregar una tabla individual de horarios.</p>
      </section>`;
  }
  function html(){
    const shop = document.querySelector('#gl-visitor-shop option:checked')?.textContent?.replace(/^\S+\s/, '') || data.local;
    const tabs = [['semana', 'Semana'], ['resumen', 'Resumen'], ['equipo', 'Equipo'], ['feriados', 'Feriados'], ['como', 'Cómo usar']];
    const section = view.section === 'colaboradores' ? 'colaboradores' : 'horarios';
    const body = view.source === 'propio' ? propio() :
      `<div class="gl-dh-tabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" aria-selected="${view.tab === k}" data-dh-tab="${k}">${n}</button>`).join('')}</div>
       ${view.tab === 'semana' ? semana() : view.tab === 'resumen' ? resumen() : view.tab === 'equipo' ? equipo() : view.tab === 'feriados' ? feriados() : comoUsar()}
       <div class="gl-dh-actions"><a class="btn primary" href="${url('plantillas/GESTLOK-demo-horarios-ficticio.xlsx')}" download="GESTLOK-demo-horarios-ficticio.xlsx">Descargar este Excel de ejemplo</a><a class="btn" href="${url('plantillas/GESTLOK-plantilla-horarios.xlsx')}" download="GESTLOK-plantilla-horarios.xlsx">Descargar plantilla GESTLOK vacía</a><button class="btn" type="button" data-dh-reset>Volver al ejemplo original</button></div>
       <p class="lead gl-dh-note">Podés cambiar horarios y estados: los totales se recalculan como en el Excel. En la demo los cambios quedan solo en esta pestaña${offline() ? ' y, sin conexión, se marcan como pendientes hasta que vuelva internet' : ''}.</p>`;
    return `<div class="gl-dh-wrap">
      <header class="gl-dh-top"><button class="btn sm" type="button" data-dh-close>← Volver al inicio</button><div><p class="eyebrow">Administrar a los empleados · DEMO</p><h2>${esc(shop)}</h2></div></header>
      <nav class="gl-dh-folders" aria-label="Carpetas de empleados">
        <button type="button" data-dh-section="colaboradores" class="${section === 'colaboradores' ? 'on' : ''}" aria-current="${section === 'colaboradores' ? 'page' : 'false'}">👥 Colaboradores</button>
        <button type="button" data-dh-section="horarios" class="${section === 'horarios' ? 'on' : ''}" aria-current="${section === 'horarios' ? 'page' : 'false'}">📁 Horarios</button>
        ${canSeeReceipt() ? '<button type="button" data-dh-receipt>📄 Recibos</button>' : ''}
      </nav>
      ${section === 'colaboradores' ? collaborators(shop) : `<section aria-labelledby="gl-dh-title"><h1 id="gl-dh-title">📁 Horarios</h1>
        <p class="lead">Planilla de turnos del local · semana del ${ddmm(fecha(0))} al ${ddmm(fecha(6))}. <b>Todos los datos son ficticios.</b></p>
        <div class="gl-dh-choice" role="radiogroup" aria-label="Planilla de horarios">
          <label class="${view.source === 'gestlok' ? 'on' : ''}"><input type="radio" name="gl-dh-src" value="gestlok" ${view.source === 'gestlok' ? 'checked' : ''}><b>Plantilla GESTLOK (predeterminada)</b><small>Entradas y salidas de mañana y noche, turnos, OFF, feriados, ausentes y totales automáticos.</small></label>
          <label class="${view.source === 'propio' ? 'on' : ''}"><input type="radio" name="gl-dh-src" value="propio" ${view.source === 'propio' ? 'checked' : ''}><b>Mi propio Excel o Google Sheets</b><small>Si ya tenés tu planilla, usala: cada local elige la de GESTLOK o la suya.</small></label>
        </div>
        ${body}
      </section>`}
      <nav class="gl-dh-mobile-dock" aria-label="Navegación inferior de empleados">
        <button type="button" data-dh-close aria-label="Volver al inicio">⌂<span>Inicio</span></button>
        <button type="button" data-dh-section="colaboradores" aria-current="${section === 'colaboradores' ? 'page' : 'false'}">♙<span>Colaboradores</span></button>
        <button type="button" data-dh-section="horarios" aria-current="${section === 'horarios' ? 'page' : 'false'}">▦<span>Horarios</span></button>
        ${canSeeReceipt() ? '<button type="button" data-dh-receipt>▤<span>Recibos</span></button>' : ''}
      </nav></div>`;
  }
  const STYLE = `#gl-demo-emp{position:fixed;inset:0;z-index:10500;overflow:auto;background:var(--bg,#f5f7fa);color:var(--ink,#11283c);font-family:var(--f-body,system-ui,sans-serif)}
  .gl-visitor-mode #gl-demo-emp{top:var(--gl-tour-header,var(--gl-visitor-h,0px))}
  #gl-demo-emp .gl-dh-wrap{max-width:1180px;margin:0 auto;padding:16px 16px 140px}
  #gl-demo-emp .gl-dh-top{display:flex;gap:14px;align-items:center;margin-bottom:12px}#gl-demo-emp .gl-dh-top h2{margin:0;font-size:20px}#gl-demo-emp .eyebrow{margin:0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#607583)}
  #gl-demo-emp h1{font-size:24px;margin:8px 0 4px}
  #gl-demo-emp .gl-dh-folders{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:6px}#gl-demo-emp .gl-dh-folders button{white-space:nowrap;border:1px solid var(--line,#dde5eb);background:var(--surface,#fff);border-radius:999px;padding:8px 14px;font:inherit;font-size:14px;color:inherit}#gl-demo-emp .gl-dh-folders .on{background:var(--accent,#173b55);color:#fff;border-color:transparent}#gl-demo-emp .gl-dh-folders button:disabled{opacity:.55}
  #gl-demo-emp .gl-dh-choice{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin:14px 0}#gl-demo-emp .gl-dh-choice label{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:start;padding:14px;border:2px solid var(--line,#dde5eb);border-radius:14px;background:var(--surface,#fff);cursor:pointer}#gl-demo-emp .gl-dh-choice label.on{border-color:var(--spark,#087e82);background:#eef8f7}#gl-demo-emp .gl-dh-choice input{grid-row:span 2;margin-top:3px}#gl-demo-emp .gl-dh-choice small{color:var(--muted,#607583);font-size:13px;line-height:1.45}
  #gl-demo-emp .gl-dh-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line,#dde5eb);margin-bottom:10px;overflow-x:auto}#gl-demo-emp .gl-dh-tabs button{border:0;background:none;font:inherit;font-size:14px;padding:9px 12px;border-bottom:3px solid transparent;color:var(--muted,#607583);white-space:nowrap}#gl-demo-emp .gl-dh-tabs [aria-selected=true]{color:var(--accent,#173b55);border-bottom-color:var(--spark,#087e82);font-weight:700}
  #gl-demo-emp .gl-dh-scroll{overflow-x:auto;border:1px solid var(--line,#dde5eb);border-radius:12px;background:var(--surface,#fff)}
  #gl-demo-emp .gl-dh-table{border-collapse:collapse;width:100%;font-size:13px;min-width:860px}#gl-demo-emp .gl-dh-sum{min-width:640px}
  #gl-demo-emp .gl-dh-table th,#gl-demo-emp .gl-dh-table td{border-bottom:1px solid #eef2f6;padding:4px 6px;text-align:center;vertical-align:middle}
  #gl-demo-emp thead th{background:var(--accent,#173b55);color:#fff;font-size:12px;position:sticky;top:0}#gl-demo-emp thead th small{display:block;font-weight:400;opacity:.85}#gl-demo-emp thead th.gl-dh-fer{background:#c88912}
  #gl-demo-emp .gl-dh-who{text-align:left;min-width:130px;background:#f8fafc;position:sticky;left:0}#gl-demo-emp .gl-dh-who small{display:block;color:var(--muted,#607583);font-weight:400;font-size:11px}
  #gl-demo-emp .gl-dh-lbl{color:var(--muted,#607583);font-size:11px;text-align:left;white-space:nowrap}
  #gl-demo-emp .gl-dh-table input[type=text]{width:64px;text-align:center;border:1px solid #d6e4f0;background:#e3f2fd;border-radius:6px;padding:3px;font:inherit;font-size:13px}
  #gl-demo-emp .gl-dh-st{width:94px;font-size:12px;border:1px solid #d6e4f0;background:#e3f2fd;border-radius:6px;padding:3px}#gl-demo-emp .gl-st-off{background:#fce1e0;color:#b42318;font-weight:700}#gl-demo-emp .gl-st-feriado{background:#c88912;color:#fff;font-weight:700}#gl-demo-emp .gl-st-ausente{background:#edeff4;color:#5b6678;font-weight:700}#gl-demo-emp .gl-st-vacaciones{background:#e0f3ea;color:#166534;font-weight:700}
  #gl-demo-emp .gl-dh-hrs td{color:var(--muted,#607583);font-size:12px;border-bottom:2px solid var(--line,#dde5eb)}
  #gl-demo-emp .gl-dh-tot{background:#eaf6ee;min-width:150px}#gl-demo-emp .gl-dh-tot span{display:block}#gl-demo-emp .gl-dh-tot small{display:block;color:var(--muted,#607583);font-size:11px;margin:4px 0}#gl-demo-emp .gl-dh-tot b{font-size:16px}
  #gl-demo-emp .gl-dh-actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 6px}
  #gl-demo-emp .gl-dh-own{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}#gl-demo-emp .gl-dh-own-box{padding:16px;border:1px solid var(--line,#dde5eb);border-radius:14px;background:var(--surface,#fff)}#gl-demo-emp .gl-dh-own-box h3{margin:0 0 6px}#gl-demo-emp .gl-dh-ok{color:#166534;font-weight:600}
  #gl-demo-emp .gl-dh-linkform{display:grid;gap:8px}#gl-demo-emp .gl-dh-linkform input{padding:10px;border:1px solid var(--line-2,#cbd8e0);border-radius:10px;font:inherit}
  #gl-demo-emp .gl-dh-steps{line-height:1.7;padding-left:22px}
  #gl-demo-emp .gl-dh-own-prev td{text-align:left;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}
  @media(max-width:600px){#gl-demo-emp .gl-dh-who{min-width:92px;font-size:12px}#gl-demo-emp .gl-dh-lbl{white-space:normal;max-width:64px;line-height:1.2}#gl-demo-emp .gl-dh-wrap{padding:12px 12px 140px}}`;
  function paint(){
    let box = document.getElementById('gl-demo-emp');
    if (!box){
      if (!document.getElementById('gl-demo-emp-css')){ const s = document.createElement('style'); s.id = 'gl-demo-emp-css'; s.textContent = STYLE; document.head.append(s); }
      box = document.createElement('div'); box.id = 'gl-demo-emp'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'gl-dh-title');
      document.body.append(box);
    }
    const scroll = box.querySelector('.gl-dh-scroll')?.scrollLeft || 0;
    const a = document.activeElement, focus = a && box.contains(a) && a.dataset?.dhP != null ? `[data-dh-p="${a.dataset.dhP}"][data-dh-d="${a.dataset.dhD}"][data-dh-k="${a.dataset.dhK}"]` : '';
    box.innerHTML = html();
    const sc = box.querySelector('.gl-dh-scroll'); if (sc) sc.scrollLeft = scroll;
    if (focus) box.querySelector(focus)?.focus();
  }
  function record(label){ if (offline()) window.GestLokOffline?.demoRecord?.(label); }
  async function open(options={}){
    try { await ready(); } catch { alert('No se pudo abrir el ejemplo ficticio. Probá de nuevo con conexión.'); return; }
    view.section = options.section === 'colaboradores' ? 'colaboradores' : 'horarios';
    view.selectedPerson = -1;
    paint(); document.documentElement.classList.add('gl-demo-emp-open');
    document.getElementById('gl-demo-emp')?.querySelector('[data-dh-close]')?.focus();
  }
  function close(){ document.getElementById('gl-demo-emp')?.remove(); document.documentElement.classList.remove('gl-demo-emp-open'); }

  document.addEventListener('click', e => {
    const box = e.target.closest?.('#gl-demo-emp'); if (!box) return;
    if (e.target.closest('[data-dh-receipt]')){ if (!canSeeReceipt()) return; const old=box.querySelector('#gl-demo-receipt'); if(old){old.remove();return;} const receipt=document.createElement('section');receipt.id='gl-demo-receipt';receipt.className='card pad';receipt.setAttribute('role','region');receipt.setAttribute('aria-label','Recibo ficticio');receipt.innerHTML='<h3>Recibo de sueldo · Ejemplo ficticio</h3><p>Empleado: Alex Demo · Período: octubre 2026</p><p>Haberes: $900.000 · Descuentos: $153.000 · Neto: $747.000</p><p>Datos ilustrativos. Sin validez legal.</p>';box.querySelector('.gl-dh-folders').after(receipt); return; }
    if (e.target.closest('[data-dh-close]')){ close(); return; }
    const sectionButton = e.target.closest('[data-dh-section]');
    if(sectionButton){ view.section=sectionButton.dataset.dhSection==='colaboradores'?'colaboradores':'horarios';view.selectedPerson=-1;paint();return; }
    const detailButton=e.target.closest('[data-dh-legajo]');
    if(detailButton){ view.selectedPerson=Number(detailButton.dataset.dhLegajo);paint();document.getElementById('gl-dh-legajo')?.scrollIntoView({block:'nearest'});return; }
    if(e.target.closest('[data-dh-detail-close]')){view.selectedPerson=-1;paint();return;}
    const tab = e.target.closest('[data-dh-tab]'); if (tab){ view.tab = tab.dataset.dhTab; paint(); return; }
    const sheet = e.target.closest('[data-dh-sheet]'); if (sheet){ view.ownSheet = +sheet.dataset.dhSheet || 0; paint(); return; }
    if (e.target.closest('[data-dh-reset]')){ if (confirm('¿Volver al Excel de ejemplo original? Se pierden los cambios de esta pestaña.')){ data = JSON.parse(JSON.stringify(base)); keep(); paint(); } }
  });
  document.addEventListener('change', async e => {
    if (!e.target.closest?.('#gl-demo-emp')) return;
    const t = e.target;
    if (t.dataset?.dhStatus != null){
      const p=data.equipo[Number(t.dataset.dhStatus)];
      if(p && ['activo','refuerzo','inactivo'].includes(t.value)){employeeStates[p.nombre]=t.value;keep();record('Estado ficticio de '+p.nombre);paint();}
      return;
    }
    if (t.name === 'gl-dh-src'){ view.source = t.value === 'propio' ? 'propio' : 'gestlok'; view.error = ''; keep(); record('Planilla de Horarios elegida'); paint(); return; }
    if (t.dataset.dhP != null){
      const p = data.equipo[+t.dataset.dhP]; if (!p) return;
      const w = data.semana[p.nombre], k = +t.dataset.dhK;
      let v = String(t.value || '').trim();
      if (k < 4 && v){
        /* Igual que en el Excel: horario con formato 10:00 (acepta 9, 930 o 9:30). */
        const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(v.replace('.', ':'));
        if (!m || +m[1] > 23 || +(m[2] || 0) > 59){ alert('Escribí el horario con formato 10:00.'); t.value = w[+t.dataset.dhD][k]; return; }
        v = String(m[1]).padStart(2, '0') + ':' + (m[2] || '00');
      }
      w[+t.dataset.dhD][k] = v;
      // Se redibuja después del cambio de foco (el campo que se edita sigue en pantalla mientras tanto).
      keep(); record('Horario de ' + p.nombre); setTimeout(paint, 0); return;
    }
    if (t.id === 'gl-dh-file'){
      const f = t.files?.[0]; if (!f) return;
      view.error = ''; view.own = null;
      try {
        if (!/\.xlsx$/i.test(f.name)) throw new Error('Elegí un archivo Excel .xlsx.');
        if (f.size > 10 * 1024 * 1024) throw new Error('El archivo es demasiado grande para la demo (máx. 10 MB).');
        if (!window.MGSIngreso){ await new Promise((ok, no) => { const s = document.createElement('script'); s.src = url('stock/ingreso.js?v=1'); s.onload = ok; s.onerror = () => no(new Error('No se pudo abrir el lector de Excel.')); document.head.append(s); }); }
        view.own = {nombre:f.name, hojas:await window.MGSIngreso.leerXLSX(await f.arrayBuffer())};
        view.ownSheet = Math.max(0, view.own.hojas.findIndex(h => /semana|horario/i.test(h.nombre)));
      } catch (err){ view.error = err?.message || 'No se pudo leer el archivo.'; }
      paint();
    }
  });
  document.addEventListener('input', e => {
    if(e.target?.id!=='gl-dh-search')return;
    view.employeeSearch=e.target.value;
    const q=view.employeeSearch.trim().toLocaleLowerCase('es');
    document.querySelectorAll('#gl-demo-emp [data-dh-person]').forEach(row=>{
      const person=row.querySelector('.gl-dh-person-info')?.textContent||'';
      row.hidden=!person.toLocaleLowerCase('es').includes(q);
    });
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'gl-dh-link') return;
    e.preventDefault();
    const v = e.target.querySelector('#gl-dh-url').value.trim();
    if (v && !sheetsOk(v)){ alert('Pegá un enlace válido de Google Sheets (https://docs.google.com/spreadsheets/d/…/edit).'); return; }
    view.link = v; keep(); record('Enlace de Horarios'); paint();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('gl-demo-emp')) close(); });
  window.addEventListener('online', () => { if (document.getElementById('gl-demo-emp')) paint(); });
  window.addEventListener('offline', () => { if (document.getElementById('gl-demo-emp')) paint(); });
  window.GestLokDemoHorarios = Object.freeze({open, close, _totals:p => totals(p), _setData:d => { data = d; }});
})();
