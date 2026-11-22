/* GESTLOK Chat · panel / Central de mensajes (dueño, gerente y creadora).
 * Componente montable: página propia (/chat/panel/) o integrado en GESTLOK (Central de mensajes de cada local),
 * dentro de un shadow DOM para que sus estilos no se mezclen. Usa la misma sesión de GESTLOK.
 * Cada acción la autoriza la base: acá solo se muestra lo que el servidor devuelve según el nivel
 * (configurar, gestionar o ver). Nunca innerHTML con datos. Modo demostración sin red: ?demo=1.
 */
(function () {
  'use strict';
  const CFG = window.GESTLOK_CHAT_CONFIG || {
    url: 'https://vgsepaaewbctjsjcpeta.supabase.co',
    key: (window.SPM_CONFIG && window.SPM_CONFIG.key) || ''};
  const VERSION_CSS = '20261121bordes1';
  const el = (tag, props = {}, ...hijos) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) n.append(h instanceof Node ? h : document.createTextNode(String(h)));
    return n;
  };
  // replaceChildren sin «null» sueltos (se ignoran los hijos vacíos).
  const poner = (nodo, ...hijos) => nodo.replaceChildren(...hijos.flat().filter(h => h !== null && h !== undefined && h !== false));
  const pesos = n => '$ ' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const hora = t => { try { return new Date(t).toLocaleString('es-AR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}); } catch { return ''; } };
  const PAGOS = {efectivo: 'Efectivo', transferencia: 'Transferencia', mercado_pago: 'Mercado Pago', debito: 'Débito', credito: 'Crédito'};
  const ESTADOS = {pendiente: 'Pendiente de confirmación', confirmado: 'En preparación', terminado: 'Terminado', rechazado: 'Rechazado', cancelado: 'Cancelado por el cliente'};
  let motor = null; // plantillas de mensajes compartidas con el chat
  import('/chat/motor.js?v=20261121global1').then(m => { motor = m; }).catch(() => {});

  /**
   * Monta el panel en «destino».
   * @param {HTMLElement} destino
   * @param {{sb?:object, local?:string, embebido?:boolean, demo?:boolean, alCambiarPendientes?:Function}} op
   */
  function montar(destino, op = {}) {
  const DEMO = !!op.demo;
  const SHOWROOM = DEMO && window.GestLokChatShowroom?.enabled ? window.GestLokChatShowroom : null;
  const EMBED = !!op.embebido;
  const LOCAL = String(op.local || '').toLowerCase();
  const raiz = EMBED ? (destino.shadowRoot || destino.attachShadow({mode: 'open'})) : destino;
  const marco = el('div', {class: 'panel' + (EMBED ? ' embebido' : ''), id: 'panel', 'aria-busy': 'true'},
    el('header', {class: 'tope'},
      el('a', {class: 'volver', href: DEMO ? '#' : '/',
        onclick: DEMO ? e => e.preventDefault() : undefined,
        'aria-label': DEMO ? 'Demostración de GESTLOK Chat' : 'Volver a GESTLOK', text: '‹'}),
      el('img', {class: 'tope-marca', src: '/chat/gestlok-monograma.svg', alt: '', width: 29, height: 32, 'aria-hidden': 'true'}),
      el('div', {class: 'tope-texto'}, el('h1', {text: 'GESTLOK Chat'}), el('p', {id: 'empresa', text: 'Cargando…'})),
      el('label', {class: 'oculto', for: 'sucursal', text: 'Sucursal'}), el('select', {id: 'sucursal', hidden: true})),
    el('nav', {class: 'pestanas', id: 'pestanas', role: 'tablist', 'aria-label': 'Secciones', hidden: true},
      [['pedidos', 'Pedidos'], ['soporte', 'Soporte'], ['reporte','Historial diario'], ['stock', 'Stock'], ['carta', 'Carta'],
        ['mensajes', 'Mensajes'], ['ajustes', 'Ajustes'], ['clientes','Clientes frecuentes']].map(([k, t], i) =>
        el('button', {role: 'tab', type: 'button', 'data-p': k, 'aria-selected': String(i === 0)}, t,
          k === 'pedidos' ? el('span', {class: 'globo', id: 'globo', hidden: true}) :
          k === 'soporte' ? el('span', {class: 'globo', id: 'globo-soporte', hidden: true}) : null))),
    EMBED ? null : el('aside', {id:'comandas-resumen', class:'comandas-resumen sin-comandas', role:'status', 'aria-live':'polite'},
      el('strong',{text:'Comandas activas'}),
      el('span',{id:'comandas-pendientes',text:'Por confirmar: 0'}),
      el('span',{id:'comandas-preparacion',text:'En preparación: 0'}),
      el('button',{type:'button',class:'boton',id:'activar-sonido-panel',text:'Activar sonido',onclick:()=>habilitarSonidoPanel()})),
    el('main', {id: 'contenido', class: 'contenido', tabindex: '-1'}),
    el('div', {class: 'aviso', id: 'aviso', role: 'status', 'aria-live': 'polite', hidden: true}));
  raiz.replaceChildren(...[EMBED ? el('link', {rel: 'stylesheet', href: '/chat/panel/panel.css?v=' + VERSION_CSS}) : null, marco].filter(Boolean));
  const $ = id => raiz.querySelector('#' + id);
  const S = {sucursales: [], suc: null, pestana: 'pedidos', filtro: 'pendiente', sondeo: 0,
    pendientesVistos: null, reclamosVistos: null, reporteDias:30, ocupado: false};
  let timerComandas=0, ultimoAvisoComandas=0, avisablesAnteriores=null;
  let audioStandalone=null, sonidoStandalone=false;
  function sonarStandalone() {
    if(EMBED||document.hidden||!sonidoStandalone||audioStandalone?.state!=='running')return false;
    try{
      [0,.19,.38].forEach((delay,i)=>{
        const t=audioStandalone.currentTime+delay,o=audioStandalone.createOscillator(),g=audioStandalone.createGain();
        o.type='sine';o.frequency.value=i===1?1100:880;
        g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.23,t+.04);
        g.gain.exponentialRampToValueAtTime(.0001,t+.17);
        o.connect(g);g.connect(audioStandalone.destination);
        o.onended=()=>{o.disconnect();g.disconnect();};o.start(t);o.stop(t+.18);
      });
      return true;
    }catch{return false;}
  }
  async function habilitarSonidoPanel() {
    const b=$('activar-sonido-panel');
    try{
      const C=window.AudioContext||window.webkitAudioContext;
      if(!C)throw new Error('Este navegador no admite sonido del chat.');
      audioStandalone ||= new C();
      await audioStandalone.resume();
      sonidoStandalone=audioStandalone.state==='running';
      if(!sonidoStandalone)throw new Error('El navegador bloqueó el sonido.');
      sonarStandalone();
      if(b)b.textContent='Sonido activado';
    }catch(e){sonidoStandalone=false;if(b)b.textContent='Reintentar sonido';aviso(e.message,true);}
  }
  function pintarComandas(s) {
    if(EMBED)return;
    const resumen=$('comandas-resumen');if(!resumen||!s)return;
    const pend=Math.max(0,Number(s.pendientes)||0),prep=Math.max(0,Number(s.en_preparacion)||0);
    const activas=pend+prep;
    resumen.classList.toggle('sin-comandas',activas===0);
    const titulo=resumen.querySelector('strong');
    if(titulo)titulo.textContent=activas?'Comandas activas':'Sin comandas activas';
    const p=$('comandas-pendientes'),c=$('comandas-preparacion');
    if(p.textContent!=='Por confirmar: '+pend)p.textContent='Por confirmar: '+pend;
    if(c.textContent!=='En preparación: '+prep)c.textContent='En preparación: '+prep;
    S.suc.pendientes=pend;S.suc.en_preparacion=prep;
  }
  async function revisarComandas() {
    if(EMBED||DEMO||document.hidden||!marco.isConnected||!S.suc)return;
    const sucursal=S.suc.id;
    try{
      const data=await rpc('panel_inicio');
      if(!S.suc||S.suc.id!==sucursal||!marco.isConnected)return;
      const suc=(data.sucursales||[]).find(s=>s.id===sucursal);
      if(!suc)return;
      pintarComandas(suc);
      const activas=Math.max(0,Number(suc.pendientes_avisables??suc.pendientes)||0);
      const preparando=Math.max(0,Number(suc.en_preparacion)||0);
      if(avisablesAnteriores!==null&&activas>avisablesAnteriores){
        ultimoAvisoComandas=Date.now();aviso('Llegó una comanda nueva por confirmar');sonarStandalone();
      }
      avisablesAnteriores=activas;
      if(!activas&&!preparando){ultimoAvisoComandas=0;return;}
      if(!ultimoAvisoComandas){ultimoAvisoComandas=Date.now();return;}
      const cada=activas?120000:300000;
      if(Date.now()-ultimoAvisoComandas>=cada){
        ultimoAvisoComandas=Date.now();
        aviso(activas?activas+' comanda(s) pendientes de confirmación':preparando+' comanda(s) en preparación');
        sonarStandalone();
      }
    }catch{/* conservar el último estado hasta recuperar la conexión */}
  }
  let sb = op.sb || null;
  if (!DEMO && !sb) {
    try { sb = window.supabase.createClient(CFG.url, CFG.key, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: false}}); }
    catch { /* se informa abajo */ }
  }
  function avisarAnfitrion(pendientes) {
    try { op.alCambiarPendientes?.(S.suc?.local_id, pendientes); } catch { /* nada */ }
  }
  async function rpc(fn, args) {
    if (DEMO) return demoRpc(fn, args || {});
    let r;
    try { r = await sb.rpc('gestlok_chat_' + fn, args || {}); } catch { throw new Error('Sin conexión. Revisá internet y probá de nuevo.'); }
    if (r.error) {
      const m = r.error.message || '';
      if (r.error.code === '23514') {
        throw new Error('No se pudo guardar: revisá los medios de pago, el costo de envío y el pedido mínimo. Si quitaste un medio de pago, volvé a intentar.');
      }
      if (r.error.code === '42501') throw new Error(m.includes('permiso') ? m : 'No tenés permiso para esta acción.');
      if (['P0001', '22023', '40001', 'P0002'].includes(r.error.code)) throw new Error(m);
      throw new Error('No se pudo completar. Probá de nuevo.');
    }
    return r.data;
  }
  let avisoT = 0;
  function aviso(texto, error) {
    const a = $('aviso'); a.textContent = texto; a.className = 'aviso' + (error ? ' error' : ''); a.hidden = false;
    clearTimeout(avisoT); avisoT = setTimeout(() => { a.hidden = true; }, error ? 6000 : 3000);
  }
  const contenido = $('contenido');
  const nivel = () => S.suc?.nivel;
  const puede = min => min === 'ver' ? !!nivel() : min === 'gestionar' ? ['gestionar', 'configurar'].includes(nivel()) : nivel() === 'configurar';

  // ------------------------------------------------------------------------------------------- inicio
  function fijo(titulo, texto, enlace) {
    $('panel').setAttribute('aria-busy', 'false');
    contenido.replaceChildren(el('div', {class: 'vacio'}, el('h2', {text: titulo}), el('p', {text: texto}),
      enlace ? el('a', {class: 'boton principal', href: enlace[1], text: enlace[0]}) : null));
  }
  async function iniciar() {
    if (!DEMO && !sb) return fijo('No se pudo iniciar', 'Recargá la página.');
    if (!DEMO) {
      const {data} = await sb.auth.getSession();
      if (!data?.session) return fijo('Entrá a GESTLOK', 'Iniciá sesión en GESTLOK con tu cuenta y volvé a abrir el panel.', ['Ir a GESTLOK', '/']);
    }
    let r;
    try { r = await rpc('panel_inicio'); } catch (e) { return fijo('No pudimos abrir el panel', e.message); }
    if (!r.habilitado) return fijo('GESTLOK Chat no está activo', 'GESTLOK Chat no está habilitado para la empresa que tenés elegida en GESTLOK. Si tenés varias empresas, elegí la correcta en GESTLOK y volvé.', ['Ir a GESTLOK', '/']);
    if (!r.sucursales.length) return fijo('Sin sucursales para vos', 'Tu usuario no tiene sucursales con GESTLOK Chat. Pedile acceso al dueño.');
    S.sucursales = r.sucursales;
    $('empresa').textContent = r.empresa;
    const sel = $('sucursal');
    sel.replaceChildren(...r.sucursales.map(s => el('option', {value: s.id,
      text: s.nombre + ((s.pendientes || s.reclamos) ? ' (' + ((s.pendientes||0)+(s.reclamos||0)) + ')' : '')})));
    const sucursalPref = DEMO ? 'gestlok-chat-panel:sucursal-demo' : 'gestlok-chat-panel:sucursal';
    let guardada = null; try { guardada = localStorage.getItem(sucursalPref); } catch { /* sin almacenamiento */ }
    S.suc = (LOCAL && r.sucursales.find(s => s.local_id === LOCAL)) || r.sucursales.find(s => s.id === guardada) || r.sucursales[0];
    if (EMBED && LOCAL && S.suc.local_id !== LOCAL) return fijo('Sin acceso a esta sucursal', 'Tu usuario no tiene la Central de mensajes de este local.');
    sel.value = S.suc.id; sel.hidden = r.sucursales.length < 2 || (EMBED && !!LOCAL);
    sel.onchange = () => {
      S.suc = S.sucursales.find(s => s.id === sel.value); S.pendientesVistos = null;
      avisablesAnteriores=null;ultimoAvisoComandas=0;
      try { localStorage.setItem(sucursalPref, S.suc.id); } catch { /* nada */ }
      mostrar();pintarComandas(S.suc);void revisarComandas();
    };
    $('pestanas').hidden = false;
    $('panel').setAttribute('aria-busy', 'false');
    mostrar();pintarComandas(S.suc);
    if(!EMBED&&!DEMO){
      clearInterval(timerComandas);
      timerComandas=setInterval(revisarComandas,15000);
    }
  }
  $('pestanas').addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    S.pestana = b.dataset.p; mostrar();
  });
  function mostrar() {
    for (const b of $('pestanas').querySelectorAll('[data-p]')) {
      b.setAttribute('aria-selected', String(b.dataset.p === S.pestana));
      if (b.dataset.p === 'ajustes' || b.dataset.p === 'mensajes') b.hidden = !puede('ver');
      if (['charlas','soporte','clientes'].includes(b.dataset.p)) b.hidden = !puede('gestionar');
    }
    clearTimeout(S.sondeo);
    const avisoSoporte = $('globo-soporte');
    if (avisoSoporte) { avisoSoporte.textContent = String(S.suc?.reclamos || 0);
      avisoSoporte.hidden = !(S.suc?.reclamos > 0); }
    ({pedidos: verPedidos, soporte: verSoporte, reporte:verReporte, stock: verStock, carta: verCarta,
      mensajes: verMensajes, ajustes: verAjustes, charlas: verCharlas,clientes:verClientes})[S.pestana]();
  }

  // ------------------------------------------------------------------------------------------- pedidos
  async function verPedidos() {
    const filtros = [['pendiente', 'Por confirmar'], ['confirmado', 'En preparación'], ['terminado', 'Terminados'], ['rechazado', 'Rechazados'], ['todos', 'Todos']];
    const cabeza = el('div', {class: 'filtros', role: 'toolbar', 'aria-label': 'Filtrar pedidos'}, filtros.map(([v, t]) =>
      el('button', {type: 'button', class: 'chip', 'aria-pressed': String(S.filtro === v), text: t, onclick: () => { S.filtro = v; verPedidos(); }})));
    const lista = el('div', {class: 'tarjetas'}, el('p', {class: 'nota', text: 'Cargando pedidos…'}));
    contenido.replaceChildren(cabeza, lista);
    await cargarPedidos(lista);
  }
  async function cargarPedidos(lista) {
    const sucursal = S.suc.id, filtro = S.filtro;
    let r;
    try { r = await rpc('panel_pedidos', {p_sucursal: S.suc.id, p_estado: S.filtro, p_limite: 60}); }
    catch (e) { lista.replaceChildren(el('p', {class: 'error', text: e.message})); return programar(lista); }
    if (S.suc.id !== sucursal || S.filtro !== filtro || !lista.isConnected) return;
    const pend = r.pedidos.filter(p => p.estado === 'pendiente').length;
    if (S.filtro === 'pendiente') {
      $('globo').textContent = String(pend); $('globo').hidden = !pend;
      if (!EMBED) document.title = (pend ? '(' + pend + ') ' : '') + 'GESTLOK Chat · Panel';
      avisarAnfitrion(pend);
      if (S.pendientesVistos !== null && pend > S.pendientesVistos) {
        aviso('Llegó un pedido nuevo');
        try { navigator.vibrate?.([120, 80, 120]); } catch { /* nada */ }
      }
      S.pendientesVistos = pend;
    }
    lista.replaceChildren(...(r.pedidos.length ? r.pedidos.map(tarjetaPedido)
      : [el('p', {class: 'nota', text: S.filtro === 'pendiente' ? 'No hay pedidos pendientes de confirmación.' : 'No hay pedidos para mostrar.'})]));
    programar(lista);
  }
  function programar(lista) {
    clearTimeout(S.sondeo);
    if (S.pestana !== 'pedidos') return;
    S.sondeo = setTimeout(() => {
      if (!marco.isConnected) return; // la sección ya no está en pantalla
      if (document.hidden || S.ocupado || lista.contains(marco.activeElement || document.activeElement)) return programar(lista);
      cargarPedidos(lista);
    }, 15000);
  }
  function tarjetaPedido(p) {
    const tel = String(p.cliente_telefono || '');
    const acciones = el('div', {class: 'acciones'});
    const programadoFuturo=p.estado==='pendiente' && p.programado_para &&
      new Date(p.programado_para).getTime()>Date.now();
    const esperaMin=p.estado==='pendiente' && !programadoFuturo
      ? Math.max(0,Math.floor((Date.now()-new Date(p.creado_at).getTime())/60000)) : 0;
    if (['pendiente', 'confirmado'].includes(p.estado) && puede('gestionar')) {
      const motivo = el('input', {type: 'text', maxlength: '300', placeholder: 'Motivo para el cliente (ej.: sin stock)', 'aria-label': 'Motivo del rechazo'});
      const caja = el('div', {class: 'rechazo', hidden: true}, motivo,
        el('button', {type: 'button', class: 'boton peligro', text: 'Rechazar pedido', onclick: () => decidir(p, 'rechazado', motivo.value)}));
      acciones.append(
        el('button', {type: 'button', class: 'boton principal',
          disabled:!!programadoFuturo,
          text: programadoFuturo?'Disponible al abrir el local':p.estado === 'pendiente' ? 'Confirmar y pasar a preparación' : p.entrega === 'envio' ? 'Pedido enviado' : 'Listo para retirar',
          onclick: () => decidir(p, p.estado === 'pendiente' ? 'confirmado' : 'terminado', '')}),
        el('button', {type: 'button', class: 'boton', text: 'Rechazar…', onclick: () => { caja.hidden = !caja.hidden; if (!caja.hidden) motivo.focus(); }}),
        caja);
    }
    if (p.conversacion_id && puede('gestionar')) {
      acciones.prepend(el('button',{type:'button',class:'boton',text:'Abrir chat del cliente',
        onclick:()=>abrirCharla({id:p.conversacion_id,creada_at:p.creado_at})}));
    }
    return el('article', {class: 'tarjeta ' + p.estado},
      el('header', {}, el('strong', {text: p.codigo}), el('span', {class: 'estado ' + p.estado, text: ESTADOS[p.estado] || p.estado}), el('small', {text: hora(p.creado_at)})),
      el('p', {class: 'cliente'}, el('b', {text: p.cliente_nombre}), ' · ',
        el('a', {href: 'tel:+' + (tel.length === 10 ? '54' + tel : tel), text: tel})),
      Number(p.cliente_pedidos)>=2
        ? el('p',{class:'nota-cliente',text:'Cliente frecuente · '+p.cliente_pedidos+' pedidos en esta sucursal'}) : null,
      esperaMin>=2 ? el('p',{class:'alerta-demora',role:'status',
        text:(esperaMin>=5?'ATENCIÓN PRIORITARIA':'PEDIDO SIN CONFIRMAR')+' · '+esperaMin+' minutos esperando revisión'}) : null,
      programadoFuturo?el('p',{class:'nota-cliente',text:'PEDIDO PROGRAMADO · Próxima apertura '+
        new Date(p.programado_para).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',weekday:'long',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+
        '. El gerente debe confirmar al comenzar el turno.'}):null,
      el('p', {class: 'entrega', text: (p.entrega === 'envio' ? 'Envío a ' + p.direccion : 'Retira en el local') +
        ' · ' + (PAGOS[p.medio_pago] || p.medio_pago) + (p.horario ? ' · Para: ' + p.horario : '')}),
      el('ul', {class: 'items'}, (p.items || []).map(i => el('li', {},
        el('span', {text: i.cantidad + ' × ' + i.nombre + ((i.opciones || []).length ? ' (' + i.opciones.map(o => o.valores.join(', ')).join(' · ') + ')' : '') + (i.nota ? ' — ' + i.nota : '')}),
        el('span', {text: pesos(i.importe)})))),
      p.estado === 'terminado' ? el('p', {class:'nota-cliente', text: p.recibido_at
        ? 'CLIENTE CONFIRMÓ RECEPCIÓN · ' + new Date(p.recibido_at).toLocaleString('es-AR', {timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
        : 'Esperando confirmación de recepción del cliente'}) : null,
      p.nota ? el('p', {class: 'nota-cliente', text: 'Aclaración: ' + p.nota}) : null,
      Number(p.descuento)>0 ? el('p',{class:'nota-cliente',text:'Descuento efectivo 10%: −'+pesos(p.descuento)}) : null,
      el('p', {class: 'totales', text: (Number(p.envio) > 0 ? 'Envío ' + pesos(p.envio) + ' · ' : '') + 'Total ' + pesos(p.total)}),
      p.entrega==='envio' && p.medio_pago==='efectivo' && Number(p.efectivo_abona)>0
        ? el('p',{class:'nota-cliente',text:'Abonará con '+pesos(p.efectivo_abona)+' · Cambio a enviar: '+pesos(p.efectivo_cambio)}) : null,
      p.motivo && p.estado !== 'pendiente' ? el('p', {class: 'nota', text: 'Motivo: ' + p.motivo}) : null,
      acciones);
  }
  async function decidir(p, decision, motivo) {
    if (S.ocupado) return;
    if (decision === 'rechazado' && String(motivo || '').trim().length < 3) return aviso('Escribí el motivo para el cliente.', true);
    S.ocupado = true;
    try {
      await rpc('panel_decidir', {p_pedido: p.id, p_decision: decision, p_motivo: motivo || ''});
      aviso(decision === 'confirmado' ? 'Pedido ' + p.codigo + ' confirmado y enviado a preparación' : decision === 'terminado' ? 'Pedido ' + p.codigo + (p.entrega === 'envio' ? ' enviado' : ' listo para retirar') + ': el cliente ya recibió el aviso' : 'Pedido ' + p.codigo + ' rechazado');
      if (S.pendientesVistos) S.pendientesVistos -= 1;
    } catch (e) { aviso(e.message, true); }
    finally { S.ocupado = false; }
    verPedidos();
    if (!EMBED) void revisarComandas();
  }

  // ------------------------------------------------------------------------------------------- stock operativo, exclusivo del panel interno
  async function verStock() {
    contenido.replaceChildren(el('p', {class: 'nota', text: 'Cargando stock del chat…'}));
    const sucursalId = S.suc.id;
    let c, extras;
    try {
      [c, extras] = await Promise.all([
        rpc('panel_catalogo', {p_sucursal: sucursalId}),
        rpc('panel_stock_adicionales', {p_sucursal: sucursalId}),
      ]);
    } catch (e) { return contenido.replaceChildren(el('p', {class: 'error', text: e.message})); }
    if (S.suc.id !== sucursalId || S.pestana !== 'stock') return;
    const editable = puede('gestionar');
    const bloques = [];
    const encabezado = el('div', {class: 'stock-encabezado'},
      el('div', {}, el('h2', {text: 'Disponibilidad'}), el('p', {class: 'nota', text:
        'Control interno del local. Apagá productos o adicionales agotados; el cliente no ve estos interruptores.'})));
    const categorias = [...c.categorias].sort((a,b) => (a.orden||0)-(b.orden||0));
    if (c.productos.some(p => !p.categoria_id)) categorias.push({id: null, nombre: 'Otros'});
    for (const categoria of categorias) {
      const productos = c.productos.filter(p => (p.categoria_id||null) === categoria.id && p.activo);
      if (!productos.length) continue;
      bloques.push(crearGrupoStock(categoria.nombre, productos.map(p => ({id:p.id, nombre:p.nombre,
        precio:p.precio, disponible: p.disponible, tipo:'producto', categoria_id:categoria.id})),
        categoria.id, editable, sucursalId));
    }
    if (extras?.length) {
      const elementos = extras.map(o => ({id:o.grupo_id + ':' + o.valor_id, nombre:o.nombre,
        precio:o.extra_min, precio_max:o.extra_max, disponible:o.disponible,
        tipo:'adicional', grupo_id:o.grupo_id, valor_id:o.valor_id}));
      bloques.push(crearGrupoStock(categorias.some(k => /^adicionales$/i.test(k.nombre)) ? 'Extras opcionales' : 'Adicionales', elementos, null, editable, sucursalId));
    }
    contenido.replaceChildren(encabezado, ...(bloques.length ? bloques : [el('p', {class:'nota',text:'No hay productos activos para controlar.'})]));
  }

  function crearGrupoStock(titulo, items, categoriaId, editable, sucursalId) {
    const disponibles = items.filter(x => x.disponible).length;
    const bloque = el('section', {class: 'stock-bloque'});
    const desplegar = el('button', {type:'button',class:'stock-desplegar',
      'aria-expanded':'false','aria-label':'Mostrar productos de ' + titulo, text:titulo});
    const lista = el('div', {class: 'stock-lista', hidden:true});
    const cabecera = el('div', {class:'stock-cabecera' + (/empanadas?/i.test(titulo)?' empanadas':'')},
      desplegar, el('span',{class:'stock-conteo',text:disponibles + ' de ' + items.length + ' disponibles'}));
    bloque.append(cabecera, lista);
    desplegar.onclick = () => {
      lista.hidden = !lista.hidden;
      
      desplegar.setAttribute('aria-expanded', String(!lista.hidden));
    };
    function itemFila(i) {
      const precio = i.precio_max && i.precio_max !== i.precio
        ? ' · ' + pesos(i.precio) + '–' + pesos(i.precio_max) : ' · ' + pesos(i.precio);
      const estado = el('span', {class:'stock-estado ' + (i.disponible?'encendido':'apagado'),
        text:i.disponible?'Disponible':'Agotado'});
      const cambio = el('input', {type:'checkbox',checked:i.disponible,
        'aria-label': (i.disponible?'Apagar ':'Encender ') + i.nombre});
      cambio.onchange = async () => {
        const anterior = i.disponible;
        cambio.disabled = true;
        try {
          if (i.tipo === 'producto') {
            await rpc('panel_disponible', {p_producto:i.id,p_disponible:cambio.checked});
          } else {
            await rpc('panel_stock_adicional', {p_sucursal:sucursalId,p_grupo:i.grupo_id,p_valor:i.valor_id,
              p_disponible:cambio.checked});
          }
          i.disponible = cambio.checked;
          estado.className = 'stock-estado ' + (i.disponible?'encendido':'apagado');
          estado.textContent = i.disponible?'Disponible':'Agotado';
          cabecera.querySelector('.stock-conteo').textContent =
            items.filter(x=>x.disponible).length + ' de ' + items.length + ' disponibles';
          cambio.setAttribute('aria-label',(i.disponible?'Apagar ':'Encender ')+i.nombre);
          aviso(i.nombre + (i.disponible ? ' disponible' : ' agotado'));
        } catch(e) { cambio.checked=anterior; aviso(e.message,true); }
        finally { cambio.disabled = false; }
      };
      return el('div', {class:'stock-item'},
        el('span',{class:'stock-led ' + (i.disponible?'encendido':'apagado'),'aria-hidden':'true'}),
        el('div',{class:'stock-item-txt'}, el('strong',{text:i.nombre}),
          el('small',{text:precio.slice(3)})),estado,
        editable?el('label',{class:'stock-switch'},cambio,el('span',{class:'stock-slider','aria-hidden':'true'})):null);
    }
    lista.replaceChildren(...items.map(itemFila));
    if (editable && categoriaId) {
      const todosDisponibles = disponibles === items.length;
      const boton = el('button',{type:'button',class:'stock-grupo-accion',
        text:todosDisponibles?'Apagar categoría':'Encender categoría'});
      boton.onclick = async () => {
        boton.disabled = true;
        const encender = items.some(x=>!x.disponible);
        try {
          await rpc('panel_stock_categoria',{p_sucursal:sucursalId,p_categoria:categoriaId,p_disponible:encender});
          for(const i of items)i.disponible=encender;
          lista.querySelectorAll('.stock-item').forEach(fila => {
            fila.querySelector('.stock-led').className='stock-led ' + (encender?'encendido':'apagado');
            const estado=fila.querySelector('.stock-estado');
            estado.className='stock-estado ' + (encender?'encendido':'apagado');
            estado.textContent=encender?'Disponible':'Agotado';
            const control=fila.querySelector('input[type=checkbox]');
            if (control) { control.checked=encender;control.setAttribute('aria-label',
              (encender?'Apagar ':'Encender ')+fila.querySelector('strong').textContent); }
          });
          cabecera.querySelector('.stock-conteo').textContent=
            items.filter(x=>x.disponible).length + ' de ' + items.length + ' disponibles';
          boton.textContent=encender?'Apagar categoría':'Encender categoría';
          aviso(titulo+(encender?' habilitada':' agotada'));
        }catch(e){aviso(e.message,true);boton.disabled=false;}
      };
      lista.prepend(el('div',{class:'stock-acciones'},boton));
    }
    return bloque;
  }

  // ------------------------------------------------------------------------------------------- carta
  async function verCarta() {
    contenido.replaceChildren(el('p', {class: 'nota', text: 'Cargando la carta…'}));
    let c;
    try { c = await rpc('panel_catalogo', {p_sucursal: S.suc.id}); } catch (e) { return contenido.replaceChildren(el('p', {class: 'error', text: e.message})); }
    // Carta: dueño, administradora y gerente del local (lo valida la base).
    const config = puede('gestionar');
    const porCat = [...c.categorias, {id: null, nombre: 'Sin categoría'}].map(cat => ({cat, prods: c.productos.filter(p => (p.categoria_id || null) === cat.id)}))
      .filter(x => x.prods.length || (x.cat.id && config));
    poner(contenido,
      el('p', {class: 'nota', text: config ? 'Editá productos, precios y categorías. Para prender o apagar por falta de stock usá la pestaña Stock.' : 'Carta en solo lectura.'}),
      config ? el('div', {class: 'fila-botones'},
        el('button', {type: 'button', class: 'boton principal', text: '+ Producto', onclick: () => editarProducto(null, c)}),
        el('button', {type: 'button', class: 'boton', text: '+ Categoría', onclick: () => editarCategoria(null)})) : null,
      porCat.length ? el('div', {}, porCat.map(({cat, prods}) => el('section', {class: 'categoria'},
        el('h3', {}, cat.nombre, cat.id && cat.activa === false ? el('small', {text: ' · oculta'}) : null,
          config && cat.id ? el('button', {type: 'button', class: 'enlace', text: 'Editar', onclick: () => editarCategoria(cat)}) : null),
        prods.map(p => el('div', {class: 'producto' + (p.activo ? '' : ' inactivo')},
          el('div', {class: 'producto-texto'}, el('strong', {text: p.nombre}),
            el('small', {text: pesos(p.precio) + ((p.opciones || []).length ? ' · con opciones' : '') + (p.activo ? '' : ' · no figura en la carta')})),
          el('span', {class: !p.activo ? 'stock-inactivo' : p.disponible ? 'ok' : 'agotado', text: !p.activo ? 'Oculto' : p.disponible ? 'Disponible' : 'Agotado'}),
          config ? el('button', {type: 'button', class: 'enlace', text: 'Editar', onclick: () => editarProducto(p, c)}) : null)))))
        : el('div', {class: 'vacio'}, el('p', {text: 'Todavía no hay productos.'})));
  }

  function editarCategoria(cat) {
    const nombre = el('input', {type: 'text', maxlength: '60', required: true}); nombre.value = cat?.nombre || '';
    const orden = el('input', {type: 'number', min: '0', max: '10000', inputmode: 'numeric'}); orden.value = String(cat?.orden ?? 0);
    const activa = el('input', {type: 'checkbox', checked: cat ? cat.activa : true});
    dialogo(cat ? 'Editar categoría' : 'Nueva categoría', [
      campo('Nombre', nombre), campo('Orden (menor primero)', orden), el('label', {class: 'check'}, activa, ' Se muestra en la carta')],
    async () => {
      await rpc('panel_categoria_guardar', {p_sucursal: S.suc.id, p_id: cat?.id || null, p_nombre: nombre.value.trim(), p_orden: Number(orden.value) || 0, p_activa: activa.checked});
      aviso('Categoría guardada'); verCarta();
    });
  }

  // Editor de opciones: cada grupo con valores «Nombre | extra».
  // Tipo «Promo: elegir N unidades» (cualquier rubro): el cliente reparte N entre las variedades y puede repetir.
  // Una variedad con el mismo nombre que un producto de la carta queda enlazada: si ese producto se agota, no se ofrece.
  function editorOpciones(opciones, c) {
    const caja = el('div', {class: 'opciones'});
    const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const productos = (c?.productos || []).filter(x => x.activo !== false);
    const grupos = (opciones || []).map(g => ({...g, texto: g.valores.map(v => v.nombre + (Number(v.extra) ? ' | ' + v.extra : '')).join('\n')}));
    const pintar = () => caja.replaceChildren(...grupos.map((g, i) => {
      const nombre = el('input', {type: 'text', maxlength: '60', placeholder: 'Ej.: Tamaño'}); nombre.value = g.nombre || '';
      nombre.oninput = () => { g.nombre = nombre.value; };
      const tipo = el('select', {}, el('option', {value: 'una', text: 'Elige una'}), el('option', {value: 'varias', text: 'Elige varias'}),
        el('option', {value: 'cantidad', text: 'Promo: elegir N unidades'}));
      tipo.value = g.tipo || 'una'; tipo.onchange = () => { g.tipo = tipo.value; pintar(); };
      const max = el('input', {type: 'number', min: '1', max: '30', inputmode: 'numeric'}); max.value = String(g.max || 2); max.oninput = () => { g.max = Number(max.value); };
      const total = el('input', {type: 'number', min: '1', max: '50', inputmode: 'numeric'}); total.value = String(g.total || 6); total.oninput = () => { g.total = Number(total.value); };
      // Carga de un toque las variedades de una categoría (por ejemplo, todas las empanadas).
      const desde = el('select', {'aria-label': 'Sumar variedades de una categoría'}, el('option', {value: '', text: 'Sumar variedades de una categoría…'}),
        (c?.categorias || []).map(k => el('option', {value: k.id, text: k.nombre})));
      desde.onchange = () => {
        const ya = new Set(String(g.texto || '').split('\n').map(norm).filter(Boolean));
        const nuevos = productos.filter(x => x.categoria_id === desde.value && !ya.has(norm(x.nombre))).map(x => x.nombre);
        g.texto = [String(g.texto || '').trim(), ...nuevos].filter(Boolean).join('\n'); desde.value = ''; pintar();
      };
      const obl = el('input', {type: 'checkbox', checked: !!g.obligatorio}); obl.onchange = () => { g.obligatorio = obl.checked; };
      const valores = el('textarea', {rows: '3', placeholder: 'Un valor por renglón. Con recargo: Grande | 2000'}); valores.value = g.texto || '';
      valores.oninput = () => { g.texto = valores.value; };
      return el('fieldset', {class: 'grupo'}, el('legend', {text: 'Opción ' + (i + 1)}),
        campo('Nombre', nombre), el('div', {class: 'dos'}, campo('Tipo', tipo), g.tipo === 'varias' ? campo('Máximo', max) : g.tipo === 'cantidad' ? campo('Unidades a elegir', total) : el('span')),
        g.tipo === 'cantidad' ? el('p', {class: 'nota', text: 'El cliente reparte las unidades entre estas variedades y puede repetir. Las que se llaman igual que un producto de la carta se ocultan solas cuando ese producto se agota.'})
          : el('label', {class: 'check'}, obl, ' Obligatoria'),
        campo('Valores', valores), g.tipo === 'cantidad' && (c?.categorias || []).length ? desde : null,
        el('button', {type: 'button', class: 'enlace peligro', text: 'Quitar opción', onclick: () => { grupos.splice(i, 1); pintar(); }}));
    }), el('button', {type: 'button', class: 'boton', text: '+ Agregar opción (tamaño, sabor, extras…)',
      onclick: () => { if (grupos.length < 8) { grupos.push({nombre: '', tipo: 'una', obligatorio: true, texto: ''}); pintar(); } }}));
    pintar();
    const slug = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'x';
    caja.leer = () => grupos.map((g, i) => {
      const usados = new Set();
      const valores = String(g.texto || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const [n, e] = l.split('|').map(x => x.trim());
        // Se conserva el código de antes (así no se pierden los «agotados» del gerente) y se enlaza con la carta por nombre.
        const previo = (g.valores || []).find(v => norm(v.nombre) === norm(n));
        let id = previo?.id || slug(n); while (usados.has(id)) id = (id + '_').slice(0, 30); usados.add(id);
        const prod = productos.find(x => norm(x.nombre) === norm(n));
        return {id, nombre: n.slice(0, 60), extra: Math.max(0, Number(String(e || '0').replace(/[^0-9.]/g, '')) || 0), ...(prod ? {producto_id: prod.id} : {})};
      });
      if (!String(g.nombre || '').trim() || !valores.length) throw new Error('Completá el nombre y los valores de la opción ' + (i + 1) + '.');
      if (valores.length > 40) throw new Error('La opción ' + (i + 1) + ' tiene más de 40 valores.');
      return {id: g.id || (slug(g.nombre) + '_' + i).slice(0, 30), nombre: g.nombre.trim().slice(0, 60), tipo: g.tipo || 'una',
        obligatorio: g.tipo === 'cantidad' ? true : !!g.obligatorio,
        ...(g.tipo === 'varias' ? {max: Math.min(30, Math.max(1, Math.round(Number(g.max) || 1)))} : {}),
        ...(g.tipo === 'cantidad' ? {total: Math.min(50, Math.max(1, Math.round(Number(g.total) || 1)))} : {}), valores};
    });
    return caja;
  }
  function editarProducto(p, c) {
    const nombre = el('input', {type: 'text', maxlength: '120', required: true}); nombre.value = p?.nombre || '';
    const desc = el('input', {type: 'text', maxlength: '300'}); desc.value = p?.descripcion || '';
    const precio = el('input', {type: 'number', min: '1', step: '0.01', inputmode: 'decimal', required: true}); precio.value = p ? String(p.precio) : '';
    const cat = el('select', {}, el('option', {value: '', text: 'Sin categoría'}), c.categorias.map(k => el('option', {value: k.id, text: k.nombre})));
    cat.value = p?.categoria_id || '';
    const orden = el('input', {type: 'number', min: '0', max: '10000', inputmode: 'numeric'}); orden.value = String(p?.orden ?? 0);
    const activo = el('input', {type: 'checkbox', checked: p ? p.activo : true});
    const disp = el('input', {type: 'checkbox', checked: p ? p.disponible : true});
    const ops = editorOpciones(p?.opciones, c);
    dialogo(p ? 'Editar producto' : 'Nuevo producto', [campo('Nombre', nombre), campo('Descripción (opcional)', desc),
      el('div', {class: 'dos'}, campo('Precio', precio), campo('Orden', orden)), campo('Categoría', cat),
      el('label', {class: 'check'}, activo, ' Figura en la carta'), el('label', {class: 'check'}, disp, ' Hay hoy (disponible)'),
      el('h4', {text: 'Opciones'}), ops],
    async () => {
      const opciones = ops.leer();
      await rpc('panel_producto_guardar', {p_sucursal: S.suc.id, p_producto: {id: p?.id, nombre: nombre.value.trim(), descripcion: desc.value.trim(),
        precio: Number(precio.value), categoria_id: cat.value || null, orden: Number(orden.value) || 0, activo: activo.checked, disponible: disp.checked, opciones}});
      aviso('Producto guardado'); verCarta();
    });
  }

  // ------------------------------------------------------------------------------------------- mensajes
  const MENSAJES = [
    ['terminado_retiro', 'Listo para retirar', 'Cuando marcás «Listo para retirar».'],
    ['terminado_envio', 'Pedido enviado', 'Cuando marcás «Pedido enviado».'],
    ['rechazado', 'Pedido rechazado', 'Se agrega el motivo que escribís al rechazar.'],
    ['pausado', 'Chat en pausa', 'Cuando el chat está cerrado.'],
    ['despedida', 'Despedida', 'Cuando el cliente agradece.'],
  ];
  async function verMensajes() {
    contenido.replaceChildren(el('p', {class: 'nota', text: 'Cargando…'}));
    if (!motor) motor = await import('/chat/motor.js?v=20261121global1').catch(() => null);
    let a;
    try { a = await rpc('panel_config', {p_sucursal: S.suc.id}); } catch (e) { return contenido.replaceChildren(el('p', {class: 'error', text: e.message})); }
    // Mensajes del asistente: dueño, administradora y gerente del local (lo valida la base).
    const editable = puede('gestionar');
    const ejemplo = {nombre: 'Ana', codigo: (a.prefijo || 'P') + '-0012', total: '$ 8.400', direccion: 'Av. Mitre 2200', local: a.direccion || ('el local de ' + a.nombre), motivo: 'nos quedamos sin stock'};
    const area = (valor, max, filas, ph) => { const t = el('textarea', {rows: String(filas), maxlength: String(max), placeholder: ph || '', disabled: !editable}); t.value = valor || ''; return t; };
    const activa = el('input', {type: 'checkbox', checked: a.ia_activa !== false, disabled: !editable});
    const nombre = el('input', {type: 'text', maxlength: '40', placeholder: 'Ej.: Sofi', disabled: !editable}); nombre.value = a.ia_nombre || '';
    const bienvenida = area(a.bienvenida, 500, 3, 'Le damos la bienvenida a ' + a.empresa + ' ' + a.nombre + '.');
    const instrucciones = area(a.ia_instrucciones, 2000, 5, 'Ej.: Tratá de vos. Ofrecé un complemento cuando pidan el producto principal. Si preguntan por algo especial, deciles que llamen al local.');
    const info = area(a.ia_info, 4000, 6, 'Ej.: Tiempo de preparación: 30 a 40 minutos. Hay opciones sin TACC: … Promos de la semana: … Formas de retiro y garantía: …');
    const campos = {};
    // Al terminar el pedido: link de reseñas de Google del local (opcional), invitación y cierre.
    const resenaUrl = el('input', {type: 'url', maxlength: '300', inputmode: 'url', placeholder: 'https://g.page/r/…/review', disabled: !editable});
    resenaUrl.value = a.mensajes?.resena_url || '';
    const resenaTexto = area(a.mensajes?.resena, 600, 2, motor?.MENSAJES_BASE?.resena || '');
    const cierreTexto = area(a.mensajes?.cierre, 600, 2, motor?.MENSAJES_BASE?.cierre || '');
    const sugerenciaTexto = area(a.mensajes?.sugerencia, 600, 2, motor?.MENSAJES_BASE?.sugerencia || '');
    const vistaCierre = el('p', {class: 'vista-previa'});
    const pintarCierre = () => {
      const url = motor?.urlResena ? motor.urlResena(resenaUrl.value) : resenaUrl.value.trim();
      const r = (resenaTexto.value.trim() || motor?.MENSAJES_BASE?.resena || '');
      const c = (cierreTexto.value.trim() || motor?.MENSAJES_BASE?.cierre || '');
      vistaCierre.textContent = resenaUrl.value.trim() && !url ? 'El link tiene que ser de Google (g.page, maps.app.goo.gl o google.com) y empezar con https://'
        : 'Así lo ve el cliente después del aviso: ' + (url ? r + ' [Dejar mi reseña en Google] ' : '') + c;
    };
    for (const x of [resenaUrl, resenaTexto, cierreTexto]) x.addEventListener('input', pintarCierre);
    pintarCierre();
    const plantillas = MENSAJES.map(([k, titulo, ayuda]) => {
      const base = motor?.MENSAJES_BASE?.[k] || '';
      const t = area(a.mensajes?.[k], 600, 3, base);
      const vista = el('p', {class: 'vista-previa'});
      const pintar = () => { const txt = (t.value.trim() || base); vista.textContent = 'Así lo ve el cliente: ' + (motor ? motor.plantilla(txt, ejemplo) : txt); };
      t.addEventListener('input', pintar); pintar();
      campos[k] = t;
      return el('div', {class: 'plantilla'}, campo(titulo, t), el('small', {class: 'ayuda', text: ayuda}), vista,
        editable ? el('button', {type: 'button', class: 'enlace', text: 'Usar el texto sugerido', onclick: () => { t.value = ''; pintar(); }}) : null);
    });
    const form = el('form', {class: 'ajustes', onsubmit: async e => {
      e.preventDefault();
      const mensajes = {}; for (const [k, t] of Object.entries(campos)) if (t.value.trim()) mensajes[k] = t.value.trim();
      if (resenaUrl.value.trim() && motor?.urlResena && !motor.urlResena(resenaUrl.value)) return aviso('El link de reseñas tiene que ser de Google y empezar con https://', true);
      // Se mandan siempre (vacío = sin link / texto sugerido) para que la base sepa que se borraron.
      mensajes.resena_url = resenaUrl.value.trim(); mensajes.resena = resenaTexto.value.trim(); mensajes.cierre = cierreTexto.value.trim();
      mensajes.sugerencia = sugerenciaTexto.value.trim();
      try {
        await rpc('panel_config_guardar', {p_sucursal: S.suc.id, p_version: a.version, p_config: {
          ia_activa: activa.checked, ia_nombre: nombre.value.trim(), ia_instrucciones: instrucciones.value, ia_info: info.value,
          bienvenida: bienvenida.value, mensajes}});
        aviso('Mensajes guardados'); verMensajes();
      } catch (err) { aviso(err.message, true); }
    }},
    el('section', {class: 'bloque'}, el('h3', {text: 'Asistente con inteligencia artificial'}),
      el('label', {class: 'check'}, activa, ' Responder con IA (si se apaga, responde el asistente guiado)'),
      campo('Nombre del asistente (opcional)', nombre),
      campo('Mensaje de bienvenida', bienvenida),
      el('small', {class: 'ayuda', text: 'El asistente saluda según la hora (Buenos días, Buenas tardes o Buenas noches), suma este texto y en el mismo mensaje le indica al cliente los botones de abajo («Hacer un pedido», promociones, horario, pagos y ayuda). No hace falta nombrar los botones acá. Con la IA activa, la IA escribe el saludo tomando este texto como base.'}),
      campo('Indicaciones para la IA: tono, qué ofrecer, qué evitar', instrucciones),
      campo('Información del local y preguntas frecuentes', info),
      el('p', {class: 'nota', text: 'La IA solo usa la carta, estos datos y los ajustes del local. No puede cambiar precios, confirmar ni terminar pedidos.'})),
    el('section', {class: 'bloque'}, el('h3', {text: 'Mensajes automáticos'}),
      el('p', {class: 'nota', text: 'Dejalo vacío para usar el texto sugerido. Podés usar: {nombre} {codigo} {total} {direccion} {local} {motivo}.'}),
      plantillas),
    el('section', {class: 'bloque'}, el('h3', {text: 'Antes de finalizar: venta sugerida'}),
      el('p', {class: 'nota', text: 'Cuando el cliente toca «Finalizar pedido» y no lleva postre o bebida, se le ofrece una vez, con botones para ver esas categorías de la carta (solo las que tengan algo disponible).'}),
      campo('Pregunta para ofrecer postre o bebida', sugerenciaTexto)),
    el('section', {class: 'bloque'}, el('h3', {text: 'Al terminar el pedido: reseña y cierre'}),
      el('p', {class: 'nota', text: 'Después de «Listo para retirar» o «Pedido enviado», el cliente recibe la invitación con el botón a Google (solo si cargás el link de este local) y el mensaje de cierre.'}),
      campo('Link de reseñas de Google de este local (opcional)', resenaUrl),
      campo('Invitación a dejar la reseña', resenaTexto),
      campo('Mensaje de cierre', cierreTexto),
      vistaCierre),
    editable ? el('button', {type: 'submit', class: 'boton principal ancho', text: 'Guardar mensajes'})
      : el('p', {class: 'nota', text: 'Mensajes en solo lectura.'}));
    contenido.replaceChildren(form);
  }

  // ------------------------------------------------------------------------------------------- ajustes
  async function verAjustes() {
    contenido.replaceChildren(el('p', {class: 'nota', text: 'Cargando…'}));
    let a;
    try { a = await rpc('panel_config', {p_sucursal: S.suc.id}); } catch (e) { return contenido.replaceChildren(el('p', {class: 'error', text: e.message})); }
    const editable = puede('configurar');
    const enlace = 'https://gestlok.com.ar/chat/?s=' + encodeURIComponent(a.slug);
    const final = 'https://chat.gestlok.com.ar/' + a.slug;
    const qr = el('div', {class: 'qr', 'aria-label': 'Código QR del chat'});
    try { const q = window.qrcode(0, 'M'); q.addData(enlace); q.make(); qr.append(el('img', {alt: 'QR del chat', src: q.createDataURL(5, 2)})); } catch { /* sin QR */ }
    const f = {};
    const inp = (k, attrs) => { const i = el(attrs.tag || 'input', {...attrs, tag: undefined, disabled: !editable}); i.value = a[k] ?? ''; f[k] = i; return i; };
    const chk = (k, texto) => { const i = el('input', {type: 'checkbox', checked: !!a[k], disabled: !editable}); f[k] = i; return el('label', {class: 'check'}, i, ' ' + texto); };
    const medios = Object.entries(PAGOS).map(([v, t]) => { const i = el('input', {type: 'checkbox', value: v, checked: (a.medios_pago || []).includes(v), disabled: !editable}); return el('label', {class: 'check'}, i, ' ' + t); });
    const form = el('form', {class: 'ajustes', onsubmit: async e => {
      e.preventDefault();
      const elegidos = medios.map(l => l.querySelector('input')).filter(i => i.checked).map(i => i.value);
      if (!elegidos.length) return aviso('Elegí al menos un medio de pago.', true);
      if (!f.acepta_retiro.checked && !f.acepta_envio.checked) return aviso('Elegí retiro, envío o ambos.', true);
      const costoEnvio = Number(f.envio_costo.value || 0);
      const pedidoMinimo = Number(f.pedido_minimo.value || 0);
      if (!Number.isFinite(costoEnvio) || costoEnvio < 0 || costoEnvio >= 1000000)
        return aviso('El costo de envío debe estar entre $0 y $999.999.', true);
      if (!Number.isFinite(pedidoMinimo) || pedidoMinimo < 0 || pedidoMinimo >= 10000000)
        return aviso('El pedido mínimo debe estar entre $0 y $9.999.999.', true);
      try {
        await rpc('panel_config_guardar', {p_sucursal: S.suc.id, p_version: a.version, p_config: {
          activa: f.activa.checked, horario: f.horario.value, direccion: f.direccion.value,
          acepta_retiro: f.acepta_retiro.checked, acepta_envio: f.acepta_envio.checked, envio_costo: costoEnvio,
          envio_zona: f.envio_zona.value, pedido_minimo: pedidoMinimo, medios_pago: elegidos}});
        aviso('Ajustes guardados'); verAjustes();
      } catch (err) { aviso(err.message, true); }
    }},
    el('section', {class: 'bloque'}, el('h3', {text: 'Enlace para clientes'}),
      el('p', {class: 'enlace-publico'}, el('a', {href: enlace, target: '_blank', rel: 'noopener', text: enlace})),
      el('div', {class: 'fila-botones'}, el('button', {type: 'button', class: 'boton', text: 'Copiar enlace', onclick: async () => {
        try { await navigator.clipboard.writeText(enlace); aviso('Enlace copiado'); } catch { aviso('No se pudo copiar', true); } }})),
      qr, el('p', {class: 'nota', text: 'Cuando esté listo el subdominio, el enlace será ' + final + '.'})),
    el('section', {class: 'bloque'}, el('h3', {text: 'Estado'}), chk('activa', 'Chat abierto: los clientes pueden escribir y pedir')),
    el('section', {class: 'bloque'}, el('h3', {text: 'Lo que ve el cliente'}),
      campo('Horario', inp('horario', {type: 'text', maxlength: '300', placeholder: 'Ej.: Todos los días de 11 a 15 y de 19 a 23'})),
      campo('Dirección del local', inp('direccion', {type: 'text', maxlength: '200'}))),
    el('section', {class: 'bloque'}, el('h3', {text: 'Entrega y pago'}), chk('acepta_retiro', 'Retiro en el local'), chk('acepta_envio', 'Envío a domicilio'),
      el('div', {class: 'dos'}, campo('Costo de envío', inp('envio_costo', {type: 'number', min: '0', step: '1', inputmode: 'numeric'})),
        campo('Pedido mínimo', inp('pedido_minimo', {type: 'number', min: '0', step: '1', inputmode: 'numeric'}))),
      campo('Zona de envío', inp('envio_zona', {type: 'text', maxlength: '300', placeholder: 'Ej.: barrios o localidades a los que llegás'})),
      el('p', {class: 'etiqueta', text: 'Medios de pago'}),
      el('p', {class: 'nota', text: 'Si quitás un medio, también se quitará de las opciones de retiro y delivery de esta sucursal.'}),
      el('div', {class: 'medios'}, medios)),
    editable ? el('button', {type: 'submit', class: 'boton principal ancho', text: 'Guardar ajustes'})
      : el('p', {class: 'nota', text: 'Los ajustes del local (abrir o pausar el chat, entrega, pagos y horario) los cambia el dueño o la administradora.'}));
    // Contacto externo por sucursal. No sincroniza pedidos ni mensajes con WhatsApp.
    const numeroWhatsApp = el('input', {type:'tel', inputmode:'tel', maxlength:'24',
      placeholder:'Ej.: 5491171446654', disabled:!editable});
    numeroWhatsApp.value = a.whatsapp_local || '';
    const contactoWhatsApp = el('form', {class:'ajustes', onsubmit:async e=>{
      e.preventDefault();
      const telefono = numeroWhatsApp.value.replace(/\D/g,'');
      if (telefono && !/^[1-9][0-9]{7,14}$/.test(telefono))
        return aviso('Ingresá un número internacional válido, por ejemplo 5491171446654.',true);
      try {
        await rpc('panel_whatsapp_guardar', {p_sucursal:S.suc.id,p_whatsapp:telefono,p_version:a.version});
        aviso('WhatsApp del local guardado');verAjustes();
      } catch(err) {aviso(err.message,true);}
    }},
    el('section', {class:'bloque'},
      el('h3', {text:'WhatsApp del local'}),
      el('p', {class:'nota',text:'Solo aparece el ícono en el chat público. Abre el WhatsApp de esta sucursal, sin enviar pedidos ni conectar mensajes externos.'}),
      campo('Número con código de país, sin + ni espacios',numeroWhatsApp),
      editable ? el('button',{type:'submit',class:'boton ancho',text:'Guardar WhatsApp'})
        : el('p',{class:'nota',text:'Solo el dueño o la administradora pueden cambiar este número.'})));
    // Campañas únicamente con consentimiento del cliente. Avisos de estado siempre separados.
    const pushCampanas=el('section',{class:'bloque'},
      el('h3',{text:'Notificaciones a clientes'}),
      el('p',{class:'nota',text:'Los clientes pueden permitir avisos de sus pedidos. Las promociones son opcionales y se envían solamente a quienes también aceptaron recibirlas.'}));
    const pushEstado=el('p',{class:'nota',role:'status','aria-live':'polite',text:'Consultando…'});
    const activo=el('input',{type:'checkbox',disabled:!editable});
    const textoPromo=el('textarea',{rows:'3',maxlength:'150',
      placeholder:'Ej.: Hoy 2 empanadas + 1 salsa a precio especial.',disabled:!editable});
    const enviarPromo=el('button',{type:'button',class:'boton',text:'Enviar promoción a suscriptores',
      disabled:!editable,onclick:async()=>{
        const mensaje=textoPromo.value.trim();
        if(mensaje.length<10)return aviso('Escribí una promoción de al menos 10 caracteres.',true);
        if(!window.confirm('¿Enviar esta promoción a los clientes que aceptaron notificaciones de esta sucursal?'))return;
        try{
          await rpc('panel_push_promociones',{p_sucursal:S.suc.id,p_mensaje:mensaje});
          textoPromo.value='';aviso('Promoción programada para suscriptores.');
        }catch(e){aviso(e.message,true);}
      }});
    activo.addEventListener('change',async()=>{
      try{
        const r=await rpc('panel_push_promociones',{p_sucursal:S.suc.id,p_enabled:activo.checked});
        activo.checked=r.enabled===true;textoPromo.disabled=!editable||!activo.checked;
        enviarPromo.disabled=!editable||!activo.checked;
        pushEstado.textContent=activo.checked?'Promociones habilitadas para esta sucursal.':'Promociones deshabilitadas.';
        aviso('Preferencia guardada');
      }catch(e){activo.checked=!activo.checked;aviso(e.message,true);}
    });
    pushCampanas.append(
      el('label',{class:'check'},activo,' Permitir campañas de promociones'),
      pushEstado,el('label',{class:'campo'},el('span',{text:'Mensaje promocional'}),textoPromo),
      enviarPromo,
      el('p',{class:'nota',text:'Máximo una campaña cada 24 horas. No se envía nada a clientes sin permiso explícito.'}));
    contenido.replaceChildren(form,contactoWhatsApp,pushCampanas);
    try{
      const p=await rpc('panel_push_promociones',{p_sucursal:S.suc.id});
      if(S.pestana!=='ajustes')return;
      activo.checked=p.enabled===true;
      pushEstado.textContent=activo.checked?'Promociones habilitadas.':'Promociones deshabilitadas.';
      textoPromo.disabled=!editable||!activo.checked;
      enviarPromo.disabled=!editable||!activo.checked;
    }catch(e){pushEstado.textContent='No pudimos cargar los permisos promocionales.';activo.disabled=true;}

  }

  // ------------------------------------------------------------------------------------------- historial diario de demanda por sucursal
  async function verReporte() {
    const id=S.suc.id,dias=S.reporteDias;
    contenido.replaceChildren(
      el('h2',{text:'Historial diario · Pedidos por GESTLOK Chat'}),
      el('p',{class:'nota',text:'Pedidos registrados en el sistema, agrupados por día y tipo de entrega. Los cancelados y rechazados se informan por separado.'}),
      el('div',{class:'filtros'},[7,30,90].map(n=>el('button',{type:'button',class:'chip',
        'aria-pressed':String(n===S.reporteDias),text:'Últimos '+n+' días',onclick:()=>{S.reporteDias=n;verReporte();}}))),
      el('p',{class:'nota',text:'Consultando registros…'}));
    let registros;
    try {registros=await rpc('panel_reporte_diario',{p_sucursal:id,p_dias:dias});}
    catch(e){contenido.append(el('p',{class:'error',text:e.message}));return;}
    if(S.pestana!=='reporte'||S.suc.id!==id||S.reporteDias!==dias)return;
    // La base calcula por sucursal y excluye pedidos de prueba; sólo lo ve personal habilitado.
    // Si aún no se publicó la migración, el historial diario sigue funcionando.
    let metricas=null;
    try { metricas=await rpc('panel_metricas',{p_sucursal:id,p_dias:dias}); } catch { /* sin métricas */ }
    if(S.pestana!=='reporte'||S.suc.id!==id||S.reporteDias!==dias)return;
    const acum=(k)=>registros.reduce((s,r)=>s+Number(r[k]||0),0);
    const resumen=el('div',{class:'reporte-resumen'},
      ...[['Pedidos recibidos','total'],['Retiro','retiro'],['Delivery','delivery'],
        ['Programados','programados']].map(([titulo,key])=>el('div',{class:'reporte-cifra'},
          el('small',{text:titulo}),el('strong',{text:String(acum(key))}))));
    const indicadores=metricas?el('section',{class:'reporte-indicadores','aria-label':'Indicadores del local'},
      el('h3',{text:'Indicadores del período'}),
      el('div',{class:'reporte-resumen'},
        ...[
          ['Pedidos aceptados',String(metricas.pedidos_aceptados||0)],
          ['Importe de pedidos aceptados',pesos(metricas.monto_aceptados)],
          ['Tiempo medio hasta confirmar',metricas.tiempo_confirmacion_min == null?'Sin datos':metricas.tiempo_confirmacion_min+' min'],
          ['Clientes frecuentes',String(metricas.clientes_frecuentes||0)]
        ].map(([titulo,valor])=>el('div',{class:'reporte-cifra'},el('small',{text:titulo}),el('strong',{text:valor})))),
      el('p',{class:'nota',text:'Importe estimado de pedidos aceptados, no dinero cobrado en caja.'}),
      el('h3',{text:'Productos más pedidos'}),
      Array.isArray(metricas.productos_top)&&metricas.productos_top.length
        ? el('ol',{class:'reporte-top'},metricas.productos_top.map(p=>
          el('li',{},el('span',{text:p.nombre}),el('strong',{text:p.unidades+' uds.'}))))
        : el('p',{class:'nota',text:'Aún no hay productos en pedidos aceptados.'})) : null;
    const entradas=registros.filter(r=>Number(r.total)>0);
    const fechas=entradas.length?entradas.map(r=>el('article',{class:'reporte-dia'},
      el('header',{},el('strong',{text:new Date(String(r.fecha)+'T12:00:00').toLocaleDateString('es-AR',
       {weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'})}),
       el('span',{class:'estado',text:r.total+' pedido'+(r.total===1?'':'s')})),
      el('div',{class:'reporte-detalle'},
        el('span',{text:'Retiro: '+r.retiro}),
        el('span',{text:'Delivery: '+r.delivery}),
        el('span',{text:'Programados: '+r.programados}),
        el('span',{text:'Por confirmar: '+r.pendientes}),
        el('span',{text:'En preparación: '+r.confirmados}),
        el('span',{text:'Terminados: '+r.terminados}),
        el('span',{text:'Cancelados: '+r.cancelados}),
        el('span',{text:'Rechazados: '+r.rechazados})))) :
      [el('p',{class:'nota',text:'No se registraron pedidos en el período seleccionado.'})];
    const botones=contenido.querySelector('.filtros');
    contenido.replaceChildren(
      el('h2',{text:'Historial diario · Pedidos por GESTLOK Chat'}),
      el('p',{class:'nota',text:'Registros reales de '+S.suc.nombre+'. No incluye consultas sin pedido.'}),
      botones,resumen,...(indicadores?[indicadores]:[]),...fechas);
  }

  // ------------------------------------------------------------------------------------------- soporte humano y reclamos
  async function verSoporte() {
    const sucId = S.suc.id;
    contenido.replaceChildren(el('h2', {text:'Soporte al cliente'}),
      el('p', {class:'nota',text:'Los reclamos llegan desde el chat público. El gerente responde al cliente en la misma conversación.'}),
      el('p',{class:'nota',text:'Cargando reclamos…'}));
    let reclamos;
    try { reclamos = await rpc('panel_soporte',{p_sucursal:sucId}); }
    catch(e){return contenido.replaceChildren(el('p',{class:'error',text:e.message}));}
    if (S.pestana !== 'soporte' || S.suc.id !== sucId) return;
    S.suc.reclamos = reclamos.filter(r=>r.estado==='pendiente').length;
    const badge = $('globo-soporte');
    if (badge) { badge.hidden = !S.suc.reclamos; badge.textContent = String(S.suc.reclamos); }
    contenido.replaceChildren(
      el('h2',{text:'Soporte al cliente'}),
      el('p',{class:'nota',text:'Reclamos pendientes e historial de casos cerrados de esta sucursal.'}),
      ...(reclamos.length ? reclamos.map(r => el('article',{class:'soporte-reclamo'},
        el('header',{},el('strong',{text:({demora:'Demora',faltante:'Producto faltante',otro:'Otro reclamo',consulta:'Consulta para el gerente'})[r.tipo]||'Reclamo'}),
          r.pedido ? el('span',{class:'estado',text:'Pedido '+r.pedido}) : null),
        el('p',{text:r.detalle}),
        r.historial_expirado ? el('small',{text:'El chat cumplió 24 horas. Este reclamo sigue guardado.'}) : null,
        el('small',{text:hora(r.creado_at)+(r.estado==='respondido' ? (r.respondido_at?' · Resuelto':' · Archivado') : r.respondido_at?' · Respondido, pendiente de cierre':' · Esperando respuesta')}),
        ...(r.evidencia_paths||[]).slice(0,10).map((path,i)=>el('button',{
          type:'button',class:'boton',text:'Ver foto adjunta '+(i+1),onclick:async()=>{
            if(DEMO)return aviso('La foto solo está disponible en el panel real.');
            const {data,error}=await sb.storage.from('gestlok-chat-adjuntos').createSignedUrl(path,300);
            if(error||!data?.signedUrl)return aviso('No se pudo abrir la foto.',true);
            window.open(data.signedUrl,'_blank','noopener,noreferrer');
          }})),
        el('div',{class:'acciones'},
          r.estado==='pendiente' && !r.historial_expirado ? el('button',{type:'button',class:'boton principal',text:'Responder reclamo',
            onclick:()=>abrirCharla({id:r.conversacion_id,creada_at:r.creado_at,
              detalle:r.detalle,historial_expirado:r.historial_expirado},r.id)}) : null,
          r.estado==='pendiente' && r.historial_expirado ? el('button',{type:'button',class:'boton',text:'Archivar reclamo',onclick:async()=>{
            if(!confirm('¿Archivar este reclamo? Se conservarán el detalle y las fotos en el historial del gerente.'))return;
            try{await rpc('panel_archivar_reclamo',{p_reclamo:r.id});aviso('Reclamo archivado');verSoporte();}
            catch(e){aviso(e.message,true);}
          }}) : null,
          r.estado==='pendiente' && r.respondido_at ? el('button',{type:'button',class:'boton',text:'Cerrar reclamo',onclick:async()=>{
            try{
              await rpc('panel_cerrar_reclamo',{p_reclamo:r.id});
              aviso('Reclamo cerrado');
              verSoporte();
            }catch(e){aviso(e.message,true);}
          }}) : null))) :
        [el('p',{class:'nota',text:'No hay reclamos registrados.'})]));
    clearTimeout(S.sondeo);
    S.sondeo=setTimeout(()=>{if(S.pestana==='soporte'&&!document.hidden)verSoporte();},15000);
  }

  // ------------------------------------------------------------------------------------------- conversaciones
  async function verCharlas() {
    contenido.replaceChildren(el('p', {class: 'nota', text: 'Cargando…'}));
    let r;
    try { r = await rpc('panel_conversaciones', {p_sucursal: S.suc.id, p_limite: 40}); } catch (e) { return contenido.replaceChildren(el('p', {class: 'error', text: e.message})); }
    contenido.replaceChildren(el('p', {class: 'nota', text: 'Mensajes y comprobantes por sucursal. El gerente puede responder y cerrar manualmente la conversación.'}),
      r.length ? el('div', {class: 'tarjetas'}, r.map(c => el('button', {type: 'button', class: 'charla', onclick: () => abrirCharla(c)},
        el('span', {class: 'charla-cab'}, el('strong', {text: hora(c.ultima_at)}),
          c.cerrada_at ? el('span',{class:'estado',text:'Cerrada'}) : null,
          c.pedido ? el('span', {class: 'estado', text: c.pedido}) : null),
        el('span', {class: 'charla-ult', text: c.ultimo || ''})))) : el('p', {class: 'nota', text: 'Todavía no hay conversaciones.'}));
  }
  async function abrirCharla(c, reclamoId = null) {
    let mensajes, estado;
    try {
      [mensajes,estado]=await Promise.all([
        rpc('panel_conversacion',{p_conversacion:c.id}),
        rpc('panel_estado_conversacion',{p_conversacion:c.id})]);
    } catch(e) {return aviso(e.message,true);}
    const hilo=el('div',{class:'hilo'});
    const pintarMensajes=async (lista) => {
      const nodos=await Promise.all(lista.map(async m=>{
        const item=el('p',{class:'msj '+m.rol,text:m.texto});
        if (m.adjunto?.path && !DEMO) {
          const {data,error}=await sb.storage.from('gestlok-chat-adjuntos').createSignedUrl(m.adjunto.path,300);
          if (!error && data?.signedUrl) item.append(el('a',{href:data.signedUrl,target:'_blank',rel:'noopener noreferrer'},
            el('img',{src:data.signedUrl,alt:'Foto o comprobante del cliente',loading:'lazy'})));
        }
        return item;
      }));
      hilo.replaceChildren(...nodos);
      hilo.scrollTop=hilo.scrollHeight;
    };
    await pintarMensajes(mensajes);
    const respuesta=el('textarea',{rows:3,maxlength:1000,placeholder:'Escribí tu respuesta al cliente',
      'aria-label':'Respuesta al cliente',class:'soporte-texto'});
    const deshabilitado=Boolean(estado.cerrada);
    const botonTransferencia=el('button',{type:'button',class:'boton',text:'Enviar datos para transferencia',
      disabled:deshabilitado || !estado.puede_enviar_transferencia,onclick:async()=>{
        botonTransferencia.disabled=true;
        try {
          await rpc('panel_enviar_transferencia',{p_conversacion:c.id});
          await pintarMensajes(await rpc('panel_conversacion',{p_conversacion:c.id}));
          aviso('Datos de transferencia enviados por este chat');
        } catch(e){aviso(e.message,true);}
        finally{botonTransferencia.disabled=deshabilitado || !estado.puede_enviar_transferencia;}
      }});
    let modal;
    const botonCerrar=el('button',{type:'button',class:'boton',text:'Cerrar conversación',disabled:deshabilitado,
      onclick:async()=>{
        if (!confirm('¿Cerrar esta conversación? El cliente podrá iniciar una nueva.')) return;
        botonCerrar.disabled=true;
        try {
          await rpc('panel_cerrar_conversacion',{p_conversacion:c.id});
          modal.close();
          aviso('Conversación finalizada');
          if (S.pestana==='soporte') verSoporte(); else if(S.pestana==='charlas') verCharlas();
        } catch(e){botonCerrar.disabled=false;aviso(e.message,true);}
      }});
    modal=dialogo('Conversación · '+hora(c.creada_at),[
      reclamoId ? el('p',{class:'nota',text:'Reclamo: '+String(c.detalle||'')}) : null,
      c.historial_expirado ? el('p',{class:'nota',text:'El historial anterior ya se limpió a las 24 horas. Se conserva el reclamo.'}) : null,
      deshabilitado ? el('p',{class:'nota',text:'Conversación finalizada por el gerente.'}) : null,
      hilo,
      puede('gestionar') && !deshabilitado ? campo('Responder por este chat',respuesta) : null,
      puede('gestionar') ? el('div',{class:'acciones'},botonTransferencia,botonCerrar) : null
    ].filter(Boolean),puede('gestionar') && !deshabilitado ? async()=>{
      if (respuesta.value.trim().length<2) throw Error('Escribí una respuesta para el cliente.');
      await rpc('panel_responder',{p_conversacion:c.id,p_texto:respuesta.value.trim(),p_reclamo:reclamoId});
      aviso('Respuesta enviada al cliente por GESTLOK Chat');
      if(S.pestana==='soporte') await verSoporte(); else if(S.pestana==='charlas') await verCharlas();
    }:null,'Enviar mensaje');
  }

  // Clientes frecuentes de ESTA sucursal. Solo personal autorizado; no hay búsquedas públicas por teléfono.
  async function verClientes() {
    contenido.replaceChildren(el('p',{class:'nota',text:'Cargando clientes frecuentes…'}));
    let clientes;
    try {clientes=await rpc('panel_clientes',{p_sucursal:S.suc.id,p_limite:60});}
    catch(e){contenido.replaceChildren(el('p',{class:'error',text:e.message}));return;}
    if (!Array.isArray(clientes) || !clientes.length) {
      contenido.replaceChildren(el('p',{class:'nota',text:'Todavía no hay clientes con más de un pedido en esta sucursal.'}));
      return;
    }
    contenido.replaceChildren(
      el('p',{class:'nota',text:'Clientes con dos o más pedidos en esta sucursal. Datos internos, visibles solo para el personal autorizado.'}),
      el('div',{class:'tarjetas'},clientes.map(c=>el('article',{class:'tarjeta'},
        el('header',{},el('strong',{text:c.nombre}),el('span',{class:'estado',text:c.pedidos+' pedidos'})),
        el('p',{class:'cliente'},el('a',{href:'tel:+'+String(c.telefono||''),text:String(c.telefono||'')})),
        el('p',{class:'nota-cliente',text:'Último pedido: '+hora(c.ultimo_at)}),
        c.direccion ? el('p',{class:'nota-cliente',text:'Última dirección de delivery: '+c.direccion}) : null
      ))));
  }

  // ------------------------------------------------------------------------------------------- utilidades
  function campo(texto, control) { return el('label', {class: 'campo'}, el('span', {text: texto}), control); }
  function dialogo(titulo, cuerpo, guardar, textoGuardar = 'Guardar') {
    const d = el('dialog', {class: 'dialogo', 'aria-label': titulo});
    const error = el('p', {class: 'error', role: 'alert', hidden: true});
    const form = el('form', {method: 'dialog', onsubmit: async e => {
      if (!guardar) return;
      e.preventDefault();
      const b = form.querySelector('[type=submit]'); b.disabled = true; error.hidden = true;
      try { await guardar(); d.close(); } catch (err) { error.textContent = err.message; error.hidden = false; }
      finally { b.disabled = false; }
    }}, el('header', {}, el('h2', {text: titulo}), el('button', {type: 'button', class: 'cerrar', 'aria-label': 'Cerrar', text: '×', onclick: () => d.close()})),
    el('div', {class: 'dialogo-cuerpo'}, cuerpo), error,
    guardar ? el('footer', {}, el('button', {type: 'button', class: 'boton', text: 'Cancelar', onclick: () => d.close()}),
      el('button', {type: 'submit', class: 'boton principal', text: textoGuardar})) : null);
    d.append(form); marco.append(d);
    d.addEventListener('close', () => d.remove());
    d.showModal();
    return d;
  }
  const alVolver = () => { if (!marco.isConnected || document.hidden || !S.suc) return;
    if(S.pestana === 'pedidos') verPedidos(); else if(S.pestana === 'soporte') verSoporte();
    if(!EMBED)void revisarComandas(); };
  document.addEventListener('visibilitychange', alVolver);
  // Los dos iframes del showroom comparten sessionStorage en la misma pestaña.
  // Refrescar sin navegar ni consultar la base cuando el cliente arma un pedido.
  const alCambioShowroom = e => {
    if(!SHOWROOM || e.key!==SHOWROOM.key || !S.suc || !marco.isConnected)return;
    if(S.pestana==='pedidos')void verPedidos();
    else if(S.pestana==='charlas')void verCharlas();
  };
  if(SHOWROOM)window.addEventListener('storage',alCambioShowroom);

  // ------------------------------------------------------------------------------------------- demostración
  const D = {
    nivel: 'configurar',
    reclamos:[{id:'r1',conversacion_id:'v1',tipo:'demora',detalle:'Mi pedido está tardando mucho',
      creado_at:new Date().toISOString(),pedido:'MM-0007',estado:'pendiente'}],
    respuestas:[],
    suc: [{id: 's1', nombre: 'Munro', slug: 'demo', activa: true, nivel: 'configurar', pendientes: 1, reclamos:1}, {id: 's2', nombre: 'Don Torcuato', slug: 'demo-2', activa: false, nivel: 'configurar', pendientes: 0}],
    cats: [{id: 'c1', nombre: 'Empanadas', orden: 1, activa: true}, {id: 'c2', nombre: 'Pizzas', orden: 2, activa: true}],
    adicionales: [{grupo_id:'gratinado',valor_id:'gratinar',nombre:'Gratinada adicional',
      extra_min:900,extra_max:900,disponible:true}],
    prods: [{id: 'p1', categoria_id: 'c1', nombre: 'Empanada de carne', descripcion: '', precio: 1200, activo: true, disponible: true, orden: 0, opciones: []},
      {id: 'p2', categoria_id: 'c1', nombre: 'Empanada de humita', descripcion: '', precio: 1200, activo: true, disponible: false, orden: 0, opciones: []},
      {id: 'p3', categoria_id: 'c2', nombre: 'Pizza muzzarella', descripcion: '', precio: 7500, activo: true, disponible: true, orden: 0, opciones: [
        {id: 'tam_0', nombre: 'Tamaño', tipo: 'una', obligatorio: true, valores: [{id: 'chica', nombre: 'Chica', extra: 0}, {id: 'grande', nombre: 'Grande', extra: 3000}]}]}],
    pedidos: [{id: 'x1', conversacion_id: 'v1', codigo: 'MM-0007', estado: 'pendiente', motivo: '', cliente_nombre: 'Ana Pérez', cliente_telefono: '1155551234', entrega: 'envio',
      direccion: 'Av. Mitre 2200, 3° B', horario: '21:30', medio_pago: 'transferencia', nota: 'Tocar timbre B', subtotal: 13900, envio: 800, total: 14700,
      creado_at: new Date().toISOString(), items: [{cantidad: 6, nombre: 'Empanada de carne', opciones: [], nota: '', importe: 7200},
        {cantidad: 1, nombre: 'Pizza muzzarella', opciones: [{grupo: 'Tamaño', valores: ['Chica']}], nota: 'bien cocida', importe: 7500}]},
      {id: 'x2', codigo: 'MM-0006', estado: 'terminado', motivo: '', cliente_nombre: 'Beto', cliente_telefono: '1144443333', entrega: 'retiro', direccion: '',
        horario: '', medio_pago: 'efectivo', nota: '', subtotal: 3600, envio: 0, total: 3600, creado_at: new Date(Date.now() - 3600e3).toISOString(),
        items: [{cantidad: 3, nombre: 'Empanada de carne', opciones: [], nota: '', importe: 3600}]}],
    config: {slug: 'mi-gusto-munro', nombre: 'Munro', empresa: 'Mi Gusto', bienvenida: '', horario: 'Todos los días de 11 a 23', direccion: 'Av. Mitre 100',
      acepta_retiro: true, acepta_envio: true, envio_costo: 800, envio_zona: 'Munro y Florida', pedido_minimo: 3000, medios_pago: ['efectivo', 'transferencia'],
      activa: true, prefijo: 'MM', version: 3, mensajes: {}, ia_activa: true, ia_nombre: 'Sofi', ia_instrucciones: '', ia_info: ''},
  };
  const SHOWROOM_SUCURSAL = SHOWROOM && ({
    'mi-gusto-munro': 'Munro',
    'mi-gusto-torcuato': 'Don Torcuato',
  })[new URLSearchParams(location.search).get('s')];
  if (SHOWROOM) {
    // Mostrar a futuros comercios un local completamente ficticio. Nunca
    // incrustar la identidad ni los datos bancarios de una tienda real.
    D.suc[0].nombre=SHOWROOM_SUCURSAL || 'Sucursal Centro';
    D.suc[0].slug='demo';
    D.suc[0].local_id='demo';
    D.suc.splice(1);
    Object.assign(D.config,{slug:'demo',nombre:D.suc[0].nombre,empresa:SHOWROOM_SUCURSAL ? 'Mi Gusto · DEMOSTRACIÓN' : 'Comercio de demostración',
      direccion:'Calle Ejemplo 123',envio_zona:'Zona de demostración',prefijo:'DEMO'});
    D.pedidos[0].codigo='DEMO-0007';
    D.pedidos[0].cliente_nombre='Cliente de ejemplo';
    D.pedidos[0].cliente_telefono='1100000000';
    D.pedidos[0].direccion='Calle Ejemplo 456';
    D.pedidos[1].codigo='DEMO-0006';
    D.pedidos[1].cliente_nombre='Otro cliente de ejemplo';
    D.pedidos[1].cliente_telefono='1100000001';
    D.reclamos[0].pedido='DEMO-0007';
  }
  async function demoRpc(fn, a) {
    await new Promise(r => setTimeout(r, 120));
    switch (fn) {
      case 'panel_inicio': return {habilitado: true, empresa: SHOWROOM_SUCURSAL ? 'Mi Gusto · DEMOSTRACIÓN' : 'Comercio de demostración',
        sucursales: SHOWROOM ? [{...D.suc[0],local_id:'demo'}] :
          D.suc.map(s => ({...s, local_id: s.id === 's1' ? 'munro' : 'torcuato'}))};
      case 'panel_pedidos': {
        const compartido=SHOWROOM?.read().order;
        return {nivel:D.nivel,pedidos:[...(compartido?[compartido]:[]),...D.pedidos]
          .filter(p=>a.p_estado==='todos'||p.estado===a.p_estado)};
      }
      case 'panel_decidir': {
        if(SHOWROOM?.read().order?.id===a.p_pedido) {
          if(!SHOWROOM.decide(a.p_pedido,a.p_decision,a.p_motivo))throw new Error('Este pedido ya fue resuelto');
          return {ok:true};
        }
        const p = D.pedidos.find(x => x.id === a.p_pedido); if (!((p.estado === 'pendiente' && ['confirmado','rechazado'].includes(a.p_decision)) || (p.estado === 'confirmado' && ['terminado','rechazado'].includes(a.p_decision)))) throw new Error('Este pedido ya fue resuelto'); p.estado = a.p_decision; p.motivo = a.p_motivo; return {ok: true}; }
      case 'panel_catalogo': return {categorias: D.cats, productos: D.prods, nivel: D.nivel};
      case 'panel_disponible': D.prods.find(p => p.id === a.p_producto).disponible = a.p_disponible; return {ok: true};
      case 'panel_stock_categoria':
        D.prods.filter(p=>p.categoria_id===a.p_categoria&&p.activo).forEach(p=>{p.disponible=a.p_disponible;});
        return {ok:true};
      case 'panel_stock_adicionales': return D.adicionales;
      case 'panel_stock_adicional':
        D.adicionales.find(o=>o.grupo_id===a.p_grupo&&o.valor_id===a.p_valor).disponible=a.p_disponible;
        return {ok:true};
      case 'panel_producto_guardar': { const x = a.p_producto; if (x.id) Object.assign(D.prods.find(p => p.id === x.id), x); else D.prods.push({...x, id: 'n' + Date.now()}); return {ok: true}; }
      case 'panel_categoria_guardar': if (a.p_id) Object.assign(D.cats.find(c => c.id === a.p_id), {nombre: a.p_nombre, orden: a.p_orden, activa: a.p_activa}); else D.cats.push({id: 'k' + Date.now(), nombre: a.p_nombre, orden: a.p_orden, activa: a.p_activa}); return {ok: true};
      case 'panel_config': return {...D.config, nivel: D.nivel};
      case 'panel_config_guardar': Object.assign(D.config, a.p_config, {version: D.config.version + 1}); return {ok: true};
      case 'panel_push_promociones': {
        if(a.p_enabled!==undefined)D.config.cliente_push_promos_activo=!!a.p_enabled;
        return {ok:true,enabled:!!D.config.cliente_push_promos_activo};
      }
      case 'panel_whatsapp_guardar': D.config.whatsapp_local = a.p_whatsapp || ''; D.config.version += 1; return {ok:true};
      case 'panel_clientes': return SHOWROOM
        ? [{nombre:'Cliente frecuente (demo)',telefono:'1100000002',pedidos:3,
            ultimo_at:new Date().toISOString(),direccion:'Calle Ejemplo 123'}]
        : [{nombre:'María (demo)',telefono:'1155551234',pedidos:3,ultimo_at:new Date().toISOString(),direccion:'Mitre 300'}];
      case 'panel_conversaciones': {
        const sh=SHOWROOM?.read(),ultimo=sh?.messages.at(-1);
        return [...(sh?.messages.length?[{id:'showroom-conversacion',creada_at:new Date().toISOString(),
          ultima_at:new Date().toISOString(),mensajes:sh.messages.length,ultimo:ultimo?.texto||'',
          pedido:sh.order?sh.order.codigo+' · '+sh.order.estado:'',cerrada_at:null}]:[]),
          {id:'v1',creada_at:new Date().toISOString(),ultima_at:new Date().toISOString(),mensajes:6,
            ultimo:'¡Listo! Enviamos tu pedido MM-0007 al local.',pedido:'MM-0007 · pendiente',
            cerrada_at:D.cerrada?new Date().toISOString():null}];
      }
      case 'panel_estado_conversacion': return {cerrada:a.p_conversacion==='showroom-conversacion'?false:!!D.cerrada,
        puede_enviar_transferencia:true};
      case 'panel_enviar_transferencia':
        if(D.cerrada)throw Error('La conversación ya está cerrada');
        D.respuestas.push(SHOWROOM
          ? 'Datos ficticios para demostración: Alias comercio.demo · No transferir.'
          : 'Le envio los datos para transferir!\\nAlias: migustomunro\\nTitular: Gisela Alejandra Oppenheimer\\nCuando pueda necesitamos que nos envie el comprobante por este medio! Muchas gracias');
        return {ok:true};
      case 'panel_cerrar_conversacion':
        D.cerrada=true;D.respuestas.push('La conversación fue finalizada por el local. Puede iniciar una nueva consulta cuando lo necesite.');
        D.reclamos.forEach(r=>{r.estado='respondido';});
        return {ok:true,cerrada:true};
      case 'panel_conversacion': if(SHOWROOM&&a.p_conversacion==='showroom-conversacion')
        return SHOWROOM.read().messages;
        return [
        {rol:'asistente',texto:'¡Hola! ¿Qué te gustaría pedir hoy?'},
        {rol:'cliente',texto:'Mi pedido está tardando mucho'},
        {rol:'asistente',texto:'Avisé al gerente. Te responderá por este mismo chat.'},
        ...D.respuestas.map(texto=>({rol:'local',texto}))];
      case 'panel_soporte': return D.reclamos.filter(r=>r.estado==='pendiente');
      case 'panel_metricas': return {pedidos_recibidos:2,pedidos_aceptados:1,
        monto_aceptados:3600,tiempo_confirmacion_min:4,clientes_frecuentes:1,
        productos_top:[{nombre:'Empanada de carne',unidades:3}]};
      case 'panel_reporte_diario': return Array.from({length:a.p_dias||30},(_,i)=>({
        fecha:new Date(Date.now()-i*86400000).toISOString().slice(0,10),total:i?0:2,
        retiro:i?0:1,delivery:i?0:1,programados:i?0:1,pendientes:i?0:1,
        confirmados:0,terminados:i?0:1,rechazados:0,cancelados:0,importe_confirmado:i?0:3600}));
      case 'panel_responder': {
        if (String(a.p_texto||'').trim().length < 2) throw new Error('Escribí una respuesta.');
        if(SHOWROOM&&a.p_conversacion==='showroom-conversacion') {
          SHOWROOM.add('local',a.p_texto);
          return {ok:true};
        }
        D.respuestas.push(a.p_texto);
        if (a.p_reclamo) {
          const r=D.reclamos.find(x=>x.id===a.p_reclamo);
          if(!r || r.estado!=='pendiente')throw new Error('Reclamo cerrado');
          r.respondido_at=new Date().toISOString();
        }
        D.suc[0].reclamos=D.reclamos.filter(x=>x.estado==='pendiente').length;
        return {ok:true};
      }
      case 'panel_cerrar_reclamo': {
        const r=D.reclamos.find(x=>x.id===a.p_reclamo);
        if (!r?.respondido_at) throw new Error('Primero respondé al cliente');
        r.estado='respondido';
        D.suc[0].reclamos=D.reclamos.filter(x=>x.estado==='pendiente').length;
        return {ok:true};
      }
      default: throw new Error('Demostración: ' + fn);
    }
  }

  iniciar();
  return {
    marco,
    refrescar: () => { if (S.suc && S.pestana === 'pedidos') verPedidos(); },
    destruir: () => { clearTimeout(S.sondeo); clearInterval(timerComandas);
      document.removeEventListener('visibilitychange', alVolver);
      if(SHOWROOM)window.removeEventListener('storage',alCambioShowroom);
      raiz.replaceChildren(); },
  };
  }

  window.GestLokChatPanel = Object.freeze({montar});
  // Página propia: <script src="panel.js" data-montar="id-del-contenedor">
  const script = document.currentScript;
  if (script && script.dataset.montar) {
    const Q = new URLSearchParams(location.search);
    montar(document.getElementById(script.dataset.montar), {demo: Q.get('demo') === '1', local: Q.get('local') || ''});
  }
})();
