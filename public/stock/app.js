
(() => {
'use strict';

/* ---------- Constantes ---------- */
const APP_URL = 'https://mgstock-app.github.io/';
/* Carpeta de los scripts (para cargar el lector de Ingreso de mercadería solo cuando se usa) */
const JS_BASE = (document.currentScript && document.currentScript.src) || ((document.querySelector('script[src*="stock/app.js"]') || {}).src) || location.href;
/* Hojas fijas. Se pueden renombrar, ordenar y quitar del menú; las hojas nuevas se guardan en la colección "hojas". */
const BASE = [
  {id:'stock', nombre:'Stock', tipo:'stock', ic:'box', desc:'Cantidades por categoría y sin stock', orden:1},
  {id:'conteo', nombre:'Conteo', tipo:'conteo', ic:'clip', desc:'Contar producto por producto con diferencias', orden:2},
  {id:'fabrica', nombre:'Conteo Fábrica', tipo:'fabrica', ic:'fab', desc:'Local + ingreso de mañana = total', orden:3},
  {id:'pedido', nombre:'Pedido', tipo:'pedido', ic:'cart', desc:'Lo que hay que reponer', orden:4},
  {id:'historial', nombre:'Historial', tipo:'historial', ic:'clock', desc:'Todos los conteos guardados', orden:5}
];
const TIPOS = {
  lista:{nombre:'Lista de stock', ic:'list', desc:'Cantidades por categoría, sin stock y conteo', largo:'Productos por categoría con cantidad, casilla Sin stock y Guardar conteo. Como la hoja Stock.'},
  fabrica:{nombre:'Local + Fábrica', ic:'fab', desc:'Local + Fábrica = total', largo:'Producto, Total stock, Local y Fábrica (ingreso mañana). Como Conteo Fábrica.'},
  ingreso:{nombre:'Local + Ingreso', ic:'in', desc:'Local + remitos = stock real', largo:'Producto, Local (lo carga el gerente), Ingreso (se suma con Ingresar remito) y Stock real.'}
};
const UNIDADES = ['unidad','caja','docena','kg','bolsa','paquete','botella','lata','rollo','balde','pack'];
const IC = {
  check:'<path d="m5 12 5 5 9-10"/>',
  in:'<path d="M12 3v11m0 0-4-4m4 4 4-4"/><path d="M4 14v5h16v-5"/>',
  msg:'<path d="M4 5h16v11H10l-6 4z"/>',
  box:'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  clip:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 12.5l2 2 4-4"/>',
  cart:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11.5l2-8H6.2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  share:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  down:'<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  userplus:'<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6"/>',
  save:'<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  fab:'<path d="M3 21V10l5 3V10l5 3V6l8 4v11z"/><path d="M7 17h2M12 17h2M17 17h1"/>',
  zero:'<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  home:'<rect x="3.5" y="3.5" width="7" height="8" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="14.5" width="7" height="6" rx="1.5"/>',
  list:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  up:'<path d="m6 15 6-6 6 6"/>',
  dn:'<path d="m6 9 6 6 6-6"/>',
  chev:'<path d="m9 6 6 6-6 6"/>',
  store:'<path d="M4 10v10h16V10"/><path d="M3 10 5 4h14l2 6"/><path d="M3 10c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"/><path d="M10 20v-5h4v5"/>',
  logo:'<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9.5h17M3.5 15h17M9.5 9.5v11"/>',
  print:'<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  shield:'<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  grip:'<circle cx="9" cy="6" r=".9"/><circle cx="15" cy="6" r=".9"/><circle cx="9" cy="12" r=".9"/><circle cx="15" cy="12" r=".9"/><circle cx="9" cy="18" r=".9"/><circle cx="15" cy="18" r=".9"/>',
  phone:'<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[n]||''}</svg>`;

/* ---------- Utilidades ---------- */
const $ = (s, r=document) => r.querySelector(s);
const has = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).trim().replace(',', '.')); return Number.isFinite(n) ? n : null; };
const isHalf = v => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
/* Cuartos de unidad (¼, ½, ¾) para el stock del local y Conteo Fábrica */
const isQuarter = v => Math.abs(v * 4 - Math.round(v * 4)) < 1e-9;
const FRQ = {'¼':'1/4', '½':'1/2', '¾':'3/4'};
/* Cantidad escrita: acepta 2,75 · 2.75 · 2 3/4 · 3/4 · 2¾ · ¾ */
function numQ(v){
  const t = String(v ?? '').trim().replace(/(\d)\s*([¼½¾])/g, (m, d, f) => `${d} ${FRQ[f]}`).replace(/[¼½¾]/g, f => FRQ[f]).replace(/\s+/g, ' ');
  if (!t) return null;
  const m = t.match(/^(?:(\d+) )?(\d+)\/(\d+)$/);
  if (m) return +m[3] ? (m[1] ? +m[1] : 0) + (+m[2]) / (+m[3]) : null;
  return /^\d*[.,]?\d+$|^\d+[.,]$/.test(t) ? num(t) : null;
}
const fracOf = q => q == null ? 0 : round(q - Math.floor(q + 1e-9));
const round = n => Math.round(n * 100) / 100;
const fmt = n => (n == null || !Number.isFinite(Number(n))) ? '—' : Number(n).toLocaleString('es-AR', {maximumFractionDigits:2});
const fmtIn = n => n == null ? '' : String(round(n)).replace('.', ',');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const fechaHora = ts => { const d = new Date(ts); return d.toLocaleDateString('es-AR', {weekday:'short', day:'2-digit', month:'2-digit'}) + ' · ' + d.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'}); };
const fechaCorta = ts => new Date(ts).toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'numeric'});
const horaCorta = ts => new Date(ts).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
const fechaLarga = () => { const s = new Date().toLocaleDateString('es-AR', {weekday:'long', day:'numeric', month:'long'}); return s.charAt(0).toUpperCase() + s.slice(1); };
const rel = ts => { const m = Math.round((Date.now() - ts) / 60000); if (m < 1) return 'recién'; if (m < 60) return `hace ${m} min`; const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`; const d = Math.round(h / 24); return d === 1 ? 'ayer' : `hace ${d} días`; };
const emailOK = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const docIdFromEmail = e => e.toLowerCase().replace(/[^a-z0-9._~:@+-]/g, '_').slice(0, 190);
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/* ---------- Estado ---------- */
const S = {
  db:null, user:null, dl:null, uid:null, me:null, ro:false, booted:false, live:'wait',
  loaded:{p:false, c:false, e:false, f:false, h:false},
  allProds:[], allFab:[], hojasDB:[], conteos:[], chat:[], diarios:[], vencimientos:[], avisos:[], provInfo:[], provHist:[], equipo:[], sol:[], names:{}, rn:new Map(), cc:new Map(),
  draft:{}, notas:{}, editing:null, fdraft:{}, legacyDraft:false,
  view:'inicio', diarioDia:'', diarioProd:'', unreadChat:0, provOpen:'', provAdding:false, provDrafts:{}, provEnvio:null, q:'', cat:'', filtro:'todos', cfiltro:'todos', pedAdj:{}, histQ:'', histOpen:{}, histN:30,
  pedGrp:lsGet('spm-pedgrp', 'cat') === 'prov' ? 'prov' : 'cat', histHoja:'', histPer:'todo', offline:!navigator.onLine, queued:null,
  panel:null, aj:{tab:'productos', q:'', cat:'', editId:null, delId:null, catEdit:null, busy:false, paste:''}, eqDel:null,
  hj:{editId:null, delId:null, add:false, busy:false},
  local:null, localesDB:[], hub:{}, unsubs:[], started:false, demoTienda:false, creatorSetup:false
};
S.loaded.l = false;

/* ---------- Hojas ---------- */
const isCustom = id => /^h-/.test(String(id || ''));
const isBase = id => BASE.some(b => b.id === id);
function hojas(){
  const ov = new Map(S.hojasDB.map(h => [h.id, h]));
  const list = BASE.map(b => { const o = ov.get(b.id) || {}; const n = String(o.nombre || '').trim(); return {...b, nombre:n || b.nombre, oculta:!!o.oculta, orden:num(o.orden) ?? b.orden, base:true}; });
  for (const h of S.hojasDB){
    if (!isCustom(h.id) || !TIPOS[h.tipo]) continue;
    const t = TIPOS[h.tipo];
    list.push({id:h.id, tipo:h.tipo, nombre:String(h.nombre || '').trim() || 'Hoja nueva', ic:t.ic, desc:t.desc, orden:num(h.orden) ?? 100, oculta:false, base:false});
  }
  return list.sort((a,b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, 'es'));
}
const visibles = () => hojas().filter(h => !h.oculta && !(window.GestLokCommerce?.mode() === 'online' && (h.id === 'fabrica' || h.tipo === 'fabrica' || h.tipo === 'ingreso')));
const hojaById = id => hojas().find(h => h.id === id) || null;
function nombreHoja(id){ if (id === 'inicio') return 'Inicio'; const h = hojaById(id); return h ? h.nombre : 'Hoja'; }
const hojaLabel = (c, def) => (c.hoja === 'inicio' ? 'Inicio' : (c.hoja && hojaById(c.hoja)?.nombre) || c.nombreHoja || def);
function tipoVista(v){ if (v === 'inicio') return 'inicio'; const b = BASE.find(x => x.id === v); if (b) return b.tipo; const c = S.hojasDB.find(x => x.id === v); return c && TIPOS[c.tipo] ? c.tipo : null; }
const isFabV = v => esFabT(tipoVista(v));
/* Contexto: cada hoja nueva tiene sus propios productos (campo "hoja"). Las hojas fijas usan los de siempre. */
let CTX = null;
const ctxView = () => CTX ?? S.view;
function withCtx(v, fn){ const o = CTX; CTX = v; try { return fn(); } finally { CTX = o; } }
function listaCtx(){ const v = ctxView(); if (!isCustom(v)) return ''; const h = S.hojasDB.find(x => x.id === v); return h && h.tipo === 'lista' ? v : ''; }
const esFabT = t => t === 'fabrica' || t === 'ingreso';
function fabCtx(){ const v = ctxView(); if (isCustom(v)){ const h = S.hojasDB.find(x => x.id === v); if (h && esFabT(h.tipo)) return v; } return 'fabrica'; }
/* Hoja «Local + Ingreso»: la segunda columna es lo ingresado por remito y el total se llama «Stock real» (renombrable) */
const ingHoja = () => { const v = fabCtx(); const h = S.hojasDB.find(x => x.id === v); return h && h.tipo === 'ingreso' ? h : null; };
const totalNombre = h => String((h && h.total) || '').trim() || 'Stock real';
const ctxKey = v => withCtx(v, () => listaCtx() + '|' + fabCtx());
Object.defineProperty(S, 'prods', {get(){ const c = listaCtx(); return S.allProds.filter(p => (p.hoja || '') === c); }, set(v){ S.allProds = v; }});
Object.defineProperty(S, 'fab', {get(){ const c = fabCtx(); return S.allFab.filter(it => (it.hoja || 'fabrica') === c); }, set(v){ S.allFab = v; }});
const hojaField = () => listaCtx() ? {hoja:listaCtx()} : {};
const fHojaField = () => fabCtx() !== 'fabrica' ? {hoja:fabCtx()} : {};
const draftCount = () => S.prods.filter(p => has(S.draft, p.id)).length;
const editingCtx = () => listaCtx() ? null : S.editing;
function clearDraftCtx(){ for (const p of S.prods){ delete S.draft[p.id]; delete S.notas[p.id]; } if (!listaCtx()) S.editing = null; saveDraft(); }
function clearFDraftCtx(){ for (const it of S.fab) delete S.fdraft[it.id]; saveDraft(); }
const rid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 10);
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hoja';
/* Borradores aislados por usuario Y local, sin compartir entradas sin confirmar. 
   Los borradores antiguos quedan disponibles para recuperación explícita. */
const legacyDraftKey = () => 'spm-draft-' + (S.local || '_');
const draftKey = () => 'spm-draft-v2-' + encodeURIComponent(String(S.uid || S.me?.email || '').toLowerCase()) + ':' + (S.local || '_');
const queuedKey = () => 'spm-pending-save-v1-' + encodeURIComponent(String(S.uid || S.me?.email || '').toLowerCase()) + ':' + (S.local || '_');
const hasLocalDraft = d => !!(d && typeof d === 'object' && 
  (Object.keys(d.draft || {}).length || Object.keys(d.notas || {}).length ||
   Object.keys(d.fdraft || {}).length || d.editing));
function saveDraft(){
  if (S.local && (S.uid || S.me?.email)) lsSet(draftKey(), {draft:S.draft, notas:S.notas, editing:S.editing, fdraft:S.fdraft});
  const chatText = S.view === 'chat' && S.local ? $('#gestlok-chat-text') : null;
  if (chatText && !chatPending()) lsSet(chatDraftKey(), chatText.value.slice(0, 1000));
}
function restoreDraft(){
  S.draft = {}; S.notas = {}; S.editing = null; S.fdraft = {}; S.legacyDraft = false;
  const d = S.local && (S.uid || S.me?.email) ? lsGet(draftKey(), null) : null;
  if (d && typeof d === 'object'){ S.draft = d.draft || {}; S.notas = d.notas || {}; S.editing = d.editing || null; S.fdraft = d.fdraft || {}; }
  if (S.local && !hasLocalDraft(d) && hasLocalDraft(lsGet(legacyDraftKey(), null))) S.legacyDraft = true;
  const q = S.local && (S.uid || S.me?.email) ? lsGet(queuedKey(), null) : null;
  S.queued = q && typeof q.view === 'string' && typeof q.fab === 'boolean' ? q : null;
}
function recoverLegacyDraft(){
  if (!S.local || !S.legacyDraft || !canW()) return;
  if (hasLocalDraft({draft:S.draft, notas:S.notas, editing:S.editing, fdraft:S.fdraft})){
    toast('Primero guardá o descartá los cambios nuevos antes de recuperar el borrador anterior.', true); return;
  }
  const d = lsGet(legacyDraftKey(), null);
  if (!hasLocalDraft(d)){ S.legacyDraft = false; render(); return; }
  try {
    localStorage.setItem(draftKey(), JSON.stringify(d));
    localStorage.removeItem(legacyDraftKey());
  } catch { toast('No se pudo trasladar el borrador. Revisá el almacenamiento del teléfono.', true); return; }
  restoreDraft(); render(); toast('Borrador recuperado. Revisalo y confirmá Guardar al volver internet.');
}

/* ---------- Locales y permisos ---------- */
/* Cada local guarda sus datos aparte: "munro/productos", "torcuato/conteos", etc. Equipo, pedidos de acceso y locales son comunes. */
const LOCAL_COLS = ['productos', 'fabrica', 'conteos', 'hojas', 'chat', 'proveedores', 'proveedores_historial', 'pedidos_online', 'diario', 'vencimientos', 'avisos', 'munro_control'];
const C = name => S.db.collection(LOCAL_COLS.includes(name) ? `${S.local}/${name}` : name);

const ROLN = r => r === 'editor' ? 'gerente' : (r || null);
function miEquipo(){ const em = String((S.me && S.me.email) || S.uid || '').toLowerCase(); return S.equipo.find(e => String(e.email || '').toLowerCase() === em) || null; }
function miRol(){ const e = miEquipo(); return ROLN(e ? e.rol : S.me && S.me.rol); }
function misLocales(){ const e = miEquipo(); const l = e ? e.locales : S.me && S.me.locales; return Array.isArray(l) ? l : []; }
const esTotal = () => ['creadora', 'dueno'].includes(miRol());
const puedeAdministrarEquipo = () => ['creadora', 'dueno'].includes(miRol());
/* Aislado para el conteo especial de Munro. No se habilita para Torcuato ni otras empresas. */
const puedeVerDiarioMunro = () => S.me?.tenant_id === 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' && S.local === 'munro' && (miRol() === 'creadora' || (miRol() === 'gerente' && misLocales().includes('munro')));
const localesTodos = () => [...S.localesDB].sort((a,b) => (num(a.orden) ?? 99) - (num(b.orden) ?? 99) || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
const localesMios = () => esTotal() ? localesTodos() : localesTodos().filter(l => misLocales().includes(l.id));
const puedeEditarLocal = id => esTotal() || (miRol() === 'gerente' && misLocales().includes(id));
const localNombre = id => { const k = id || S.local; const l = S.localesDB.find(x => x.id === k); return (l && l.nombre) || (k ? k.charAt(0).toUpperCase() + k.slice(1) : ''); };

/* ---------- Datos derivados ---------- */
function sorted(){ return [...S.prods].sort((a,b) => (a.orden ?? 1e9) - (b.orden ?? 1e9) || String(a.nombre||'').localeCompare(String(b.nombre||''), 'es')); }
const catOf = p => (p.cat && String(p.cat).trim()) || 'Sin categoría';
const stockOf = p => num(p.stock);
const qty = p => has(S.draft, p.id) ? S.draft[p.id] : stockOf(p);
const minOf = p => { const m = num(p.min); return m && m > 0 ? m : null; };
/* Stock sugerido: lo cargan la administradora o el dueño; el resto lo ve para comparar con lo que hay en el local */
const sugOf = p => { const m = num(p.sugerido); return m != null && m >= 0 ? m : null; };
/* Poco stock: hasta cuánto se marca en amarillo. La dueña lo puede fijar; si no, es la mitad del sugerido */
const pocoDef = p => { const s = sugOf(p); return s == null ? null : Math.floor(s) / 2; };
const pocoOf = p => { const m = num(p.poco); return m != null && m >= 0 ? m : pocoDef(p); };
/* Exceso: a partir de cuánto se marca en naranja. La dueña lo puede fijar; si no, es más que el sugerido */
const excOf = p => { const m = num(p.exceso); return m != null && m >= 0 ? m : sugOf(p); };
function rangoTxt(p){
  if (sugOf(p) == null) return '';
  const pc = pocoOf(p), ex = excOf(p);
  return `Sin stock: 0 · Poco stock: hasta ${fmt(pc)} · Stock ideal: más de ${fmt(pc)} hasta ${fmt(ex)} · Exceso: más de ${fmt(ex)}`;
}
/* Stock sugerido por hoja: lo activan o desactivan la dueña o la administradora. La hoja Stock lo trae activado; las hojas nuevas, desactivado. */
const sugHoja = () => listaCtx() || 'stock';
function sugActivo(){ const id = sugHoja(), h = S.hojasDB.find(x => x.id === id); return h && typeof h.sugerido === 'boolean' ? h.sugerido : id === 'stock'; }
/* Estado en la hoja Stock: con sugerido cargado manda el sugerido; sin sugerido, el estado de siempre */
function estadoSug(p){
  const s = sugOf(p); if (s == null) return estado(p);
  if (p.sinStock) return 'sin';
  const q = qty(p); if (q == null) return 'nc';
  if (q <= 0) return 'sin';
  if (q > excOf(p)) return 'exc';
  if (q <= pocoOf(p)) return 'poco';
  return 'ideal';
}
const uTxt = p => (p.unidad && p.unidad !== 'unidad') ? String(p.unidad) : '';
const provOf = p => (p.proveedor && String(p.proveedor).trim()) || '';
const SINPROV = 'Sin proveedor';
const provKey = p => provOf(p) || SINPROV;
function provs(){ const m = new Map(); for (const p of S.allProds){ const v = provOf(p); if (v) m.set(v, (m.get(v) || 0) + 1); } return [...m].sort((a,b) => a[0].localeCompare(b[0], 'es')); }
function estado(p){ if (p.sinStock) return 'sin'; const q = qty(p); if (q == null) return 'nc'; if (q <= 0) return 'sin'; const m = minOf(p); if (m != null && q < m) return 'bajo'; return 'ok'; }
const ESTADO = {ok:'En stock', bajo:'Stock bajo', sin:'Sin stock', nc:'Sin contar', poco:'Poco stock', ideal:'Stock ideal', exc:'Exceso de stock'};
const alerta = p => { const e = estado(p); return e === 'sin' || e === 'bajo'; };
function metaTxt(p){ const m = minOf(p), u = uTxt(p); return [u && esc(u), m != null ? `mín ${fmt(m)}` : ''].filter(Boolean).join(' · '); }
function cats(){ const m = new Map(); for (const p of sorted()){ const c = catOf(p); m.set(c, (m.get(c)||0) + 1); } return [...m]; }
const ccOf = c => S.cc.get(c) || 'var(--muted)';
function catOK(p){ return !S.cat || catOf(p) === S.cat; }
function qOK(p){ const q = norm(S.q); if (!q) return true; return norm(p.nombre).includes(q) || norm(catOf(p)).includes(q) || norm(p.obs).includes(q); }
function groups(list, key = catOf){ const m = new Map(); for (const p of list){ const c = key(p); if (!m.has(c)) m.set(c, []); m.get(c).push(p); } return [...m]; }
const provGroupSort = (a, b) => (a[0] === SINPROV) - (b[0] === SINPROV) || a[0].localeCompare(b[0], 'es');
function pendientes(){
  const out = [];
  for (const p of sorted()){
    const hasQ = has(S.draft, p.id); const nota = String(S.notas[p.id] || '').trim();
    if (!hasQ && !nota) continue;
    const antes = stockOf(p); const despues = hasQ ? S.draft[p.id] : antes;
    if (despues === antes && !nota) continue;
    out.push({p, antes, despues, nota});
  }
  return out;
}
function pedidoItems(){
  return sorted().filter(alerta).map(p => {
    const base = p.sinStock ? 0 : (qty(p) ?? 0); const m = minOf(p);
    const sug = m != null ? Math.max(round(m - base), 0) : 0;
    const v = has(S.pedAdj, p.id) ? S.pedAdj[p.id] : sug;
    return {p, base, sug, v};
  });
}
const whoName = c => (c.responsable && String(c.responsable).trim()) || (c.autor && S.names[c.autor]) || (c.autor && String(c.autor).includes('@') ? String(c.autor).split('@')[0] : '') || 'Alguien del equipo';
const lastStock = () => S.conteos.find(c => c.tipo !== 'fabrica' && !isCustom(c.hoja));
const lastStockCtx = () => { const l = listaCtx(); return l ? S.conteos.find(c => c.tipo !== 'fabrica' && c.hoja === l) : lastStock(); };
const lastFab = () => { const f = fabCtx(); return S.conteos.find(c => c.tipo === 'fabrica' && (c.hoja || 'fabrica') === f); };
/* Conteo Fábrica */
const fItems = () => [...S.fab].sort((a,b) => (a.orden ?? 1e9) - (b.orden ?? 1e9) || String(a.nombre||'').localeCompare(String(b.nombre||''), 'es'));
function fVal(it, k){ const d = S.fdraft[it.id]; if (d && has(d, k)) return d[k]; return num(k === 'l' ? it.local : it.fabrica); }
const fTot = it => round((fVal(it, 'l') || 0) + (fVal(it, 'f') || 0));
function fPend(){ return fItems().filter(it => { const d = S.fdraft[it.id]; if (!d) return false; return (has(d, 'l') && d.l !== num(it.local)) || (has(d, 'f') && d.f !== num(it.fabrica)); }); }
const fSin = it => { const l = fVal(it, 'l'); return l != null ? l === 0 : !!it.sinStock; };
const bloqueOf = it => Math.max(1, Math.round(num(it.bloque) || 1));
const canW = () => !!S.db && !S.ro;
const isCreadora = () => !!(S.me && S.me.isOwner);
function needWrite(){
  if (!S.db){ toast('Iniciá sesión para guardar.', true); return false; }
  if (S.ro){ toast(`En ${localNombre()} tu acceso es Solo ver. Pedile a la administradora que te cambie a Gerente.`, true); return false; }
  return true;
}

/* ---------- Escritura ---------- */
async function w(fn){
  try { return await fn(); }
  catch(e){ if (e && e.code === 'unavailable'){ await sleep(400 + Math.random() * 600); return await fn(); } throw e; }
}
function fail(e){
  const c = e && e.code;
  if (!navigator.onLine){ toast('Sin internet: este cambio no se guardó. Probá de nuevo cuando vuelva la conexión.', true); return; }
  if (c === 'invalid_argument'){ toast('No se pudo guardar: tu usuario no tiene permiso para este cambio. Pedile a la administradora que revise tu acceso en Equipo.', true); return; }
  if (c === 'quota_exceeded'){ toast('La base está llena: borrá conteos viejos o productos que no uses.', true); return; }
  if (c === 'resource_exhausted'){ toast('Demasiados cambios seguidos. Esperá unos segundos y probá de nuevo.', true); return; }
  if (c === 'revoked'){ toast('Se cambió tu acceso a esta app. Recargá la página.', true); return; }
  toast('No se pudo guardar. Revisá la conexión y probá de nuevo.', true);
}
async function batchRun(items, fn, size=5){ for (let i = 0; i < items.length; i += size){ await Promise.all(items.slice(i, i + size).map(x => w(() => fn(x)))); } }

/* ---------- Render general ---------- */
function render(){
  window.GestLokSupport?.render();
  if (!S.local){ renderHub(); return; }
  const ae = document.activeElement; const fid = ae && ae.id && $('#view').contains(ae) ? ae.id : null;
  let sel = null; try { if (fid && ae.selectionStart != null) sel = [ae.selectionStart, ae.selectionEnd]; } catch {}
  const srt = sorted(); S.rn = new Map(srt.map((p,i) => [p.id, i + 1]));
  S.cc = new Map(cats().map(([c], i) => [c, `var(--c${i % 6 + 1})`]));
  renderChrome();
  $('#view').innerHTML = viewHTML();
  if (fid){ const el = document.getElementById(fid); if (el){ el.focus({preventScroll:true}); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch {} } }
}
function viewHTML(){
  if (window.GestLokCommerce?.mode() === 'online' && (S.view === 'ingreso' || esFabT(tipoVista(S.view)))) return V.inicio();
  if (S.view === 'ingreso') return esTotal() ? V.ingreso() : V.inicio();
  if (S.view === 'chat') return V.chat();
  if (S.view === 'proveedores') return V.proveedores();
  if (S.view === 'pedidos-online') return window.GestLokCommerce?.online() ? window.GestLokCommerce.view() : V.inicio();
  if (S.view === 'tienda-online') return window.GestLokCommerce?.online() ? window.GestLokTienda?.view() : V.inicio();
  if (S.view === 'diario') return puedeVerDiarioMunro() ? window.GestLokMunroDaily.view() : V.inicio();
  if (S.view === 'vencimientos') return window.GestLokUpdates.viewDue();
  if (S.view === 'avisos') return window.GestLokUpdates.viewAlerts();
  const t = tipoVista(S.view);
  if (t === 'stock' || t === 'lista') return V.stock();
  if (esFabT(t)) return V.fabrica();
  if (t && V[S.view]) return V[S.view]();
  if (isCustom(S.view) && !S.loaded.h) return loadingList();
  return V.inicio();
}
function renderChrome(){
  renderNav();
  document.querySelectorAll('#snav [data-go]').forEach(b => { if (b.dataset.go === S.view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  const ln = esc(localNombre());
  $('#brand-local').textContent = localNombre();
  const ing = S.view === 'ingreso', chat = S.view === 'chat';
  $('#ttl').textContent = S.view === 'inicio' ? 'Panel del local' : chat ? 'Chat del local' : S.view === 'proveedores' ? 'Proveedores' : S.view === 'pedidos-online' ? 'Pedidos online' : S.view === 'tienda-online' ? 'Mi tienda' : S.view === 'diario' ? 'Conteo diario' : S.view === 'vencimientos' ? 'Vencimientos' : S.view === 'avisos' ? 'Avisos' : ing ? 'Ingreso de mercadería' : nombreHoja(S.view);
  $('#crumb').innerHTML = S.view === 'inicio' ? `${ln} <span aria-hidden="true">/</span> <b>Inicio</b>` : ing ? `<b>Dueña</b>` : `<span class="cm">${ln} <span aria-hidden="true">/</span></span> <b>Hojas</b>`;
  $('#savebar').hidden = ing || chat || S.view === 'proveedores' || S.view === 'pedidos-online' || S.view === 'tienda-online' || S.view === 'diario' || S.view === 'vencimientos' || S.view === 'avisos';
  renderLive(); window.GestLokCommerce?.renderOwnerBadge(); renderSavebar(); renderMe();
}
/* Cantidad que se muestra al lado de cada hoja: rojo = sin stock o bajo mínimo, amarillo = cambios sin guardar */
function hojaBadge(h){
  let n = 0, acc = false;
  if (h.tipo === 'stock' || h.tipo === 'lista') n = withCtx(h.id, () => S.prods.filter(alerta).length);
  else if (h.tipo === 'pedido') n = withCtx(h.id, () => pedidoItems().length);
  else if (h.tipo === 'conteo'){ n = withCtx(h.id, () => pendientes().length); acc = true; }
  else if (esFabT(h.tipo)){ n = withCtx(h.id, () => fPend().length); acc = true; }
  return n ? `<span class="badge${acc ? ' acc' : ''}">${n}</span>` : '';
}
function renderNav(){
  const nav = $('#snav'), edit = canW();
  const varios = localesMios().length > 1;
  const html = `${varios ? `<button class="snav-loc" data-act="locales">${ic('store')}<span class="nl">Locales</span><small>Cambiar</small></button>` : ''}<button data-go="inicio">${ic('home')}<span class="nl">Inicio</span></button><button data-go="proveedores">${ic('box')}<span class="nl">Proveedores</span></button>${window.GestLokCommerce?.online() ? `<button data-go="pedidos-online">${ic('cart')}<span class="nl">Pedidos online</span></button><button data-go="tienda-online">${ic('box')}<span class="nl">Mi tienda</span></button>` : ''}<button data-go="chat">${ic('msg')}<span class="nl">Chat del local</span>${S.unreadChat ? `<span class="gl-chat-badge" aria-label="${S.unreadChat} mensajes nuevos"><span class="gl-chat-dot" aria-hidden="true"></span><span class="gl-chat-count">${Math.min(99,S.unreadChat)}</span></span>` : ''}</button>${puedeVerDiarioMunro() ? `<button data-go="diario">${ic('clip')}<span class="nl">Conteo diario</span></button>` : ''}<button data-go="vencimientos">${ic('clock')}<span class="nl">Vencimientos</span></button>${esTotal() ? `<button data-go="avisos">${ic('msg')}<span class="nl">Avisos</span></button>` : ''}
    ${esTotal() && window.GestLokCommerce?.mode() !== 'online' ? `<button data-go="ingreso" class="snav-ing">${ic('in')}<span class="nl">Ingreso de mercadería</span></button>` : ''}
    <div class="snav-l"><span>Hojas</span>${edit ? `<button class="snav-e" data-act="hojas" title="Editar, agregar o borrar hojas">${ic('edit')}Editar</button>` : ''}</div>
    ${visibles().map(h => `<button data-go="${esc(h.id)}">${ic(h.ic)}<span class="nl">${esc(h.nombre)}</span>${hojaBadge(h)}</button>`).join('')}
    ${edit ? `<button class="snav-add" data-act="hoja-new">${ic('plus')}<span class="nl">Agregar hoja</span></button>` : ''}`;
  if (nav._h !== html){ nav.innerHTML = html; nav._h = html; }
}
function renderLive(){
  const st = S.offline ? 'net' : S.live;
  const txt = {wait:'Conectando', on:'En vivo', off:'Sin conexión', err:'Reconectando', net:'Sin internet'}[st];
  const cls = 'dot' + (st === 'on' ? ' on' : (st === 'err' || st === 'off' || st === 'net') ? ' err' : '');
  $('#kdot').className = cls;
  $('#ktxt').innerHTML = st === 'on' ? `<b>En vivo</b> · todo el equipo ve los cambios` : st === 'net' ? `<b>Sin internet</b> · lo cargado queda en este equipo` : esc(txt);
  const l = $('#live'); l.querySelector('.dot').className = cls; l.querySelector('span').textContent = txt;
}
function renderSavebar(){
  const enCola = S.queued && S.queued.view === S.view;
  if (isFabV(S.view)){
    const fp = fPend().length, lf = lastFab();
    $('#sb-main').textContent = enCola ? (S.offline ? 'Borrador local: guardar al volver internet' : 'Borrador pendiente: revisá y guardá')  : fp ? `${plural(fp, 'fila cambiada', 'filas cambiadas')} sin guardar` : 'Sin cambios';
    $('#sb-sub').textContent = lf ? `${nombreHoja(fabCtx())} guardado ${rel(lf.fecha)} · ${whoName(lf)}` : (S.loaded.c ? 'Esta planilla todavía no se guardó' : 'Cargando…');
    $('#savebar').classList.toggle('dirty', !!fp);
    const c = $('#sb-cnt'); c.hidden = !fp; c.textContent = fp;
    $('#sb-desc').hidden = !S.fab.some(it => has(S.fdraft, it.id));
    $('#sb-save').disabled = !canW();
    return;
  }
  const ed = editingCtx(), pend = pendientes().length, cont = draftCount(), last = lastStockCtx();
  const lastTxt = last ? `Último conteo ${rel(last.fecha)} · ${whoName(last)}` : (S.loaded.c ? 'Todavía no hay conteos guardados' : 'Cargando…');
  let main;
  if (enCola) main = S.offline ? 'Borrador local: guardar al volver internet' : 'Borrador pendiente: revisá y guardá';
  else if (ed) main = `Corrigiendo el conteo del ${fechaHora(ed.fecha)}`;
  else if (pend) main = `${plural(pend, 'cambio', 'cambios')} sin guardar`;
  else if (cont) main = `${cont} contados, sin diferencias`;
  else main = 'Sin cambios';
  $('#sb-main').textContent = main;
  $('#sb-sub').textContent = (cont ? `${cont} de ${S.prods.length} productos contados · ` : '') + lastTxt;
  $('#savebar').classList.toggle('dirty', !!(pend || ed));
  const c = $('#sb-cnt'); c.hidden = !pend; c.textContent = pend;
  $('#sb-desc').hidden = !(pend || cont || ed);
  $('#sb-save').disabled = !canW();
}
function renderMe(){
  const m = $('#me'); if (!S.me){ m.hidden = true; return; }
  const rol = rolLabel(miRol()) + (S.ro && miRol() !== 'lectura' ? ' · Solo ver' : '');
  m.hidden = false;
  m.innerHTML = `<img alt="" src="${esc(S.me.avatarUrl)}"><div><b></b><small></small></div>`;
  m.querySelector('b').textContent = S.me.name || 'Vos';
  m.querySelector('small').textContent = rol;
  // Marca comercial asignada expresamente a esta cuenta, nunca por rol o email incrustado.
  const perfil = miEquipo();
  if (perfil && perfil.logoId === 'mi-gusto') {
    const p = document.createElement('div');
    p.className = 'gestlok-tenant-mark';
    const logo = document.createElement('img'); logo.src = 'img/mi-gusto-negro.png'; logo.alt = 'Mi Gusto';
    p.append(logo); m.append(p);
  }
}

/* ---------- Piezas compartidas ---------- */
function banners(){
  let h = '';
  if (S.legacyDraft && canW()) h += '<p class="note warn"><b>Borrador anterior encontrado en este equipo.</b> Si te pertenece, podés recuperarlo antes de cargar un conteo nuevo. <button class="btn sm" data-act="recover-draft">Recuperar borrador anterior</button></p>';
  if (S.offline) h += `<p class="note warn"><b>Sin internet.</b> Podés seguir cargando: lo que cargues queda guardado en este equipo${S.queued ? `; revisá y confirmá el guardado del conteo cuando vuelva la conexión` : '. Cuando vuelva la conexión, tocá Guardar conteo'}.</p>`;
  else if (S.booted && !S.db) h += `<p class="note warn"><b>Sin conexión con la base.</b> Revisá internet y recargá la página.</p>`;
  if (S.ro) h += `<p class="note warn"><b>En ${esc(localNombre())} tu acceso es Solo ver.</b> Para cargar y guardar, pedile a la administradora que te cambie a Gerente.</p>`;
  if (S.editing && S.view !== 'conteo' && !isCustom(S.view)) h += `<div class="editbar"><span>Estás corrigiendo el conteo del <b>${esc(fechaHora(S.editing.fecha))}</b>.</span><span class="bar-a"><button class="btn sm" data-go="conteo">Ir a Conteo</button><button class="btn sm" data-act="edit-cancel">Cancelar corrección</button></span></div>`;
  return h;
}
function tools(id, val, ph){
  const cs = cats();
  return `<div class="tools"><div class="search">${ic('search')}<input id="${id}" type="search" placeholder="${esc(ph)}" value="${esc(val)}" autocomplete="off" aria-label="${esc(ph)}"></div>
  ${cs.length > 1 ? `<div class="chips" role="group" aria-label="Categorías"><button class="chip" data-act="cat" data-cat="" aria-pressed="${!S.cat}">Todas<span class="c">${S.prods.length}</span></button>${cs.map(([c,n]) => `<button class="chip" data-act="cat" data-cat="${esc(c)}" aria-pressed="${S.cat === c}" style="--cc:${ccOf(c)}"><i></i>${esc(c)}<span class="c">${n}</span></button>`).join('')}</div>` : ''}</div>`;
}
function ssBox(p, pref){ return `<label class="ss"><input type="checkbox" id="${pref}-${esc(p.id)}" data-ss="${esc(p.id)}" ${p.sinStock ? 'checked' : ''} ${canW() ? '' : 'disabled'} aria-label="Sin stock: ${esc(p.nombre)}"><span>Sin stock</span></label>`; }
function loadingList(){ return `<div class="sheet">${'<div class="sk"></div>'.repeat(5)}</div>`; }
function noProducts(){
  return `<div class="sheet"><div class="empty"><b>Todavía no hay productos cargados</b>Abrí Ajustes para agregarlos uno por uno o pegá la lista completa de una vez.<div class="bar-a"><button class="btn primary" data-act="aj-open" data-tab="agregar">${ic('plus')}Agregar productos</button><button class="btn" data-act="aj-open" data-tab="pegar">Pegar lista</button></div></div></div>`;
}
const HEADS = {
  stock:`<span class="ar">N°</span><span class="ac">Sin stock</span><span>Producto</span><span>Estado</span><span class="ar">Local</span><span class="ar">Ajustar</span><span class="ar">Sugerido</span>`,
  stock0:`<span class="ar">N°</span><span class="ac">Sin stock</span><span>Producto</span><span>Estado</span><span class="ar">Local</span><span class="ar">Ajustar</span>`,
  conteo:`<span class="ar">N°</span><span class="ac">Sin stock</span><span>Producto</span><span class="ar">Sistema</span><span>Contado</span><span class="ar">Diferencia</span>`,
  pedido:`<span class="ar">N°</span><span class="ac">Sin stock</span><span>Producto</span><span class="ar">Hay</span><span class="ar">Mínimo</span><span class="ar">A pedir</span>`
};
function sheet(kind, list, rowFn, o = {}){
  const gs = groups(list, o.key || catOf); if (o.sort) gs.sort(o.sort);
  const color = o.color || ccOf;
  return `<div class="sheet k-${kind}${o.cls ? ' ' + o.cls : ''}"><div class="sh-h">${o.head || HEADS[kind]}</div>${gs.map(([c, items]) => {
    const sin = items.filter(p => estado(p) === 'sin').length, nc = items.filter(p => estado(p) === 'nc').length;
    return `<div class="sh-g" style="--cc:${color(c)}"><i></i><b>${esc(c)}</b><span class="num">${items.length}</span><span class="gs">${sin ? `<span class="st sin">${sin} sin stock</span>` : ''}${nc && kind !== 'pedido' ? `<span class="st nc">${nc} sin contar</span>` : ''}${o.extra ? o.extra(c, items) : ''}</span></div>` + items.map(rowFn).join('');
  }).join('')}</div>`;
}
const noMatch = (t, s) => `<div class="sheet"><div class="empty"><b>${t}</b>${s}</div></div>`;

/* ---------- Hojas ---------- */
const V = {};
const proveedorId = nombre => 'p-' + encodeURIComponent(String(nombre).normalize('NFC').trim().toLowerCase());
const proveedorFicha = nombre => S.provInfo.find(p => p.id === proveedorId(nombre)) || null;
const telWa = telefono => {
  const raw = String(telefono || '').trim();
  const digits = raw.replace(/\D/g,'');
  return /^\+?[0-9()\s-]{8,24}$/.test(raw) && digits.length >= 8 && digits.length <= 15 ? digits : '';
};
function proveedorPedido(nombre){
  const products = S.allProds.filter(p => provOf(p) === nombre && alerta(p));
  const list = products.map(p => {
    const n = minOf(p), qtyNow = p.sinStock ? 0 : qty(p);
    const sugerido = n != null ? Math.max(0,round(n - (qtyNow || 0))) : null;
    return '- ' + p.nombre + ': ' + (sugerido != null && sugerido > 0 ? fmt(sugerido) + ' ' + (uTxt(p) || 'unidades') : 'cantidad a confirmar');
  });
  return ['PEDIDO · ' + nombre,'Local: ' + localNombre(),fechaLarga(),'',...list].join('\n').trim();
}
function editarProveedor(nombre){
  if (!canW()) { toast('Tu acceso es de solo lectura.', true); return; }
  const actual = proveedorFicha(nombre) || {};
  S.panel = 'proveedor';
  openPanel(`<div class="pn-h"><div><small>${esc(localNombre())}</small><h3>Datos de proveedor</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
    <div class="pn-b"><p class="lead"><b>${esc(nombre)}</b> · Esta ficha es privada de este local.</p>
    <form id="prov-form" data-name="${esc(nombre)}" class="frow">
      <div class="fld"><label for="prov-contact">Persona de contacto</label><input id="prov-contact" maxlength="100" autocomplete="off" value="${esc(actual.contacto || '')}"></div>
      <div class="fld"><label for="prov-phone">WhatsApp / teléfono con código de país</label><input id="prov-phone" inputmode="tel" maxlength="24" autocomplete="off" placeholder="Ej.: 5491123456789" value="${esc(actual.telefono || '')}"></div>
      <div class="fld"><label for="prov-delivery">Días o condiciones de entrega</label><input id="prov-delivery" maxlength="160" autocomplete="off" value="${esc(actual.entrega || '')}"></div>
      <div class="fld"><label for="prov-note">Observaciones</label><textarea id="prov-note" maxlength="450" rows="3">${esc(actual.nota || '')}</textarea></div>
      <button class="btn primary" type="submit">Guardar ficha</button>
    </form></div>`, 'dlg');
}
async function guardarProveedor(f){
  if (!S.db || !S.local || !canW() || S.offline){toast('Necesitás acceso de edición e internet para guardar.',true);return;}
  const nombre = f.dataset.name, local = S.local;
  if (!nombre || (!S.allProds.some(p=>provOf(p)===nombre) && !proveedorFicha(nombre))){toast('El proveedor no existe en este local.',true);return;}
  const contacto = f.querySelector('#prov-contact').value.trim();
  const telefono = f.querySelector('#prov-phone').value.trim();
  const entrega = f.querySelector('#prov-delivery').value.trim();
  const nota = f.querySelector('#prov-note').value.trim();
  if (telefono && !telWa(telefono)){toast('Ingresá un teléfono con código de país y de 8 a 15 dígitos.',true);return;}
  const btn = f.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try{
    const ref=C('proveedores').doc(proveedorId(nombre));
    const snap=await ref.get();
    const payload={nombre,contacto,telefono,entrega,nota,actualizado:Date.now()};
    await w(() => snap.exists ? ref.update(payload) : ref.set(payload));
    if (S.local !== local) return;
    closePanel(); toast('Ficha del proveedor guardada');
  } catch(e) { fail(e); if(btn.isConnected){btn.disabled=false;btn.textContent='Guardar ficha';} }
}


/* Hoja de proveedores: carpetas por local, borrador por persona y pedido confirmado por la dueña. */
function proveedorNombres(){
  const map=new Map(provs());
  for (const ficha of S.provInfo) if (String(ficha.nombre||'').trim() && !map.has(ficha.nombre)) map.set(ficha.nombre,0);
  return [...map].sort((a,b)=>a[0].localeCompare(b[0],'es'));
}
const proveedorDraftKey = nombre => 'gestlok-prov-v1:' + encodeURIComponent(String(S.uid || S.me?.email || '').toLowerCase()) + ':' + S.local + ':' + encodeURIComponent(proveedorId(nombre));
function proveedorBase(nombre){
  const ficha=proveedorFicha(nombre)||{};
  const key=proveedorId(nombre);
  if(!S.provDrafts[key]){
    const version=Number(ficha.pedidoActualizado)||0;
    const cached=lsGet(proveedorDraftKey(nombre),null);
    const draft=cached && cached.base===version ? cached : {
      base:version, items:Array.isArray(ficha.items)?ficha.items.map(it=>({...it})):[],
      catalogo:{...(ficha.catalogo||{})},dirty:false,stale:!!(cached && cached.base!==version)
    };
    S.provDrafts[key]=draft;
  }
  return S.provDrafts[key];
}
function proveedorFilas(nombre){
  const draft=proveedorBase(nombre);
  const catalogo=S.allProds.filter(p=>provOf(p)===nombre).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
  const filas=catalogo.map(p=>{
    const stored=draft.catalogo[p.id]||{};
    const stock=stored.stockLocal ?? stockOf(p);
    const objetivo=sugOf(p) ?? minOf(p);
    const sugerido=stored.sugerido ?? (objetivo!=null && stock!=null ? Math.max(0,round(objetivo-stock)):null);
    return {
      id:'c:'+p.id,productoId:p.id,origen:'catalogo',
      nombre:p.nombre||'',categoria:p.cat||p.categoria||'General',unidad:p.unidad||'unidad',
      stockLocal:stock,sugerido,pedir:stored.pedir??0
    };
  });
  for(const x of draft.items||[]){
    if(!x?.id || !x.nombre)continue;
    filas.push({...x,categoria:x.categoria||'General',origen:'manual',stockLocal:x.stockLocal??null,sugerido:x.sugerido??null,pedir:x.pedir??0});
  }
  return filas;
}
const proveedorCantidad = valor => {
  const txt=String(valor??'').trim();
  if (!txt) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(txt))return NaN;
  const n=Number(txt.replace(',','.'));
  return Number.isFinite(n) && n<=1000000 ? n : NaN;
};
function proveedorGuardarBorrador(nombre){
  const d=proveedorBase(nombre);
  d.dirty=true;
  lsSet(proveedorDraftKey(nombre),d);
}
function abrirCarpetaProveedor(nombre){
  if(!proveedorNombres().some(([n])=>n===nombre))return;
  S.provOpen=nombre;S.provAdding=false;
  proveedorBase(nombre);
  render();
  document.querySelector('#prov-carpeta')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function actualizarValorProveedor(input){
  if(!canW() || !S.provOpen)return;
  const field=input.dataset.provVal,id=input.dataset.id;
  if(!['stockLocal','pedir','sugerido'].includes(field))return;
  const n=proveedorCantidad(input.value);
  const invalid=Number.isNaN(n);
  input.classList.toggle('bad',invalid);
  if(invalid){
    const error=document.getElementById('prov-err');
    if(error)error.textContent='Revisá las cantidades: usá números positivos con hasta dos decimales.';
    return;
  }
  const name=S.provOpen,d=proveedorBase(name),row=proveedorFilas(name).find(x=>x.id===id);
  if(!row)return;
  if(row.origen==='manual'){
    const x=d.items.find(x=>x.id===row.id);if(x)x[field]=n;
  }else{
    const old=d.catalogo[row.productoId]||{};
    d.catalogo[row.productoId]={
      stockLocal:field==='stockLocal'?n:(old.stockLocal??row.stockLocal),
      sugerido:field==='sugerido'?n:(old.sugerido??row.sugerido),
      pedir:field==='pedir'?n:(old.pedir??row.pedir)
    };
  }
  proveedorGuardarBorrador(name);
  mostrarResumenProveedor();
}
function usarSugeridoProveedor(id){
  if(!canW() || !S.provOpen)return;
  const name=S.provOpen,row=proveedorFilas(name).find(x=>x.id===id);
  if(!row || row.sugerido==null || Number(row.sugerido)<0)return;
  const d=proveedorBase(name);
  if(row.origen==='manual')d.items.find(x=>x.id===id).pedir=row.sugerido;
  else d.catalogo[row.productoId]={...(d.catalogo[row.productoId]||{}),stockLocal:row.stockLocal,sugerido:row.sugerido,pedir:row.sugerido};
  proveedorGuardarBorrador(name);render();
}
function nuevoProveedor(){
  if(!canW() || S.offline){toast('Necesitás permiso de edición e internet.',true);return;}
  S.panel='prov-new';
  openPanel(`<div class="pn-h"><h3>Nueva carpeta de proveedor</h3><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
   <div class="pn-b"><form id="prov-create-form" class="frow">
   <div class="fld"><label for="prov-new-name">Nombre del proveedor</label><input id="prov-new-name" maxlength="90" autocomplete="off" required placeholder="Ej.: Distribuidora Central"></div>
   <button class="btn primary" type="submit">${ic('plus')}Crear carpeta</button></form></div>`,'dlg');
}
async function crearCarpetaProveedor(form){
  if(!canW() || S.offline || !S.local)return;
  const nombre=form.querySelector('#prov-new-name').value.trim().replace(/\s+/g,' ');
  if(!nombre || nombre.length>90){toast('Ingresá un nombre de hasta 90 caracteres.',true);return;}
  if(proveedorNombres().some(([n])=>proveedorId(n)===proveedorId(nombre))){toast('Ese proveedor ya tiene una carpeta.',true);return;}
  const btn=form.querySelector('button[type="submit"]');btn.disabled=true;
  const loc=S.local;
  try{
    const doc=C('proveedores').doc(proveedorId(nombre));
    const check=await doc.get();
    if(check.exists){toast('Ese proveedor ya existe.',true);return;}
    await w(()=>doc.set({nombre,contacto:'',telefono:'',entrega:'',nota:'',items:[],catalogo:{},pedidoActualizado:0,actualizado:Date.now()}));
    if(S.local!==loc)return;
    closePanel();S.provOpen=nombre;render();toast('Carpeta creada. Agregá los productos.');
  }catch(e){fail(e);}finally{if(btn.isConnected)btn.disabled=false;}
}
function agregarProductoProveedor(form){
  if(!canW() || !S.provOpen)return;
  const nombre=form.querySelector('#prov-item-name').value.trim().replace(/\s+/g,' ');
  const unidad=form.querySelector('#prov-item-unit').value.trim().slice(0,30)||'unidad';
  const categoria=form.querySelector('#prov-item-category')?.value.trim().slice(0,70)||'General';
  if(!nombre || nombre.length>100){toast('Ingresá un nombre válido de producto.',true);return;}
  if(proveedorFilas(S.provOpen).some(x=>norm(x.nombre)===norm(nombre))){toast('Ese producto ya existe en esta carpeta.',true);return;}
  const id='m-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const d=proveedorBase(S.provOpen);
  d.items.push({id,nombre,categoria,unidad,stockLocal:null,pedir:0,sugerido:null});
  proveedorGuardarBorrador(S.provOpen);S.provAdding=false;render();toast('Producto agregado al borrador. Guardá la planilla.');
}
function quitarProductoProveedor(id){
  if(!canW() || !S.provOpen)return;
  const d=proveedorBase(S.provOpen);
  d.items=d.items.filter(x=>x.id!==id);
  proveedorGuardarBorrador(S.provOpen);render();
}
function proveedorSeleccionados(nombre){
  return proveedorFilas(nombre).filter(x=>Number(x.pedir)>0 && Number.isFinite(Number(x.pedir)));
}
function pedidoProveedorTexto(nombre){
  const pedidos=proveedorSeleccionados(nombre);
  return [
    'GESTLOK · PEDIDO A PROVEEDOR',
    'Proveedor: '+nombre,'Local: '+localNombre(),'Fecha: '+fechaLarga(),
    '',...pedidos.map(x=>'• '+x.nombre+' — '+fmt(x.pedir)+' '+x.unidad),
    '', 'Productos: '+pedidos.length
  ].join('\n');
}
function proveedorResumenHTML(nombre){
  const rows=proveedorSeleccionados(nombre);
  const draft=proveedorBase(nombre);
  const footer=rows.length?
   `<div class="gl-prov-table-wrap"><table class="gl-prov-summary-table">
     <thead><tr><th>Proveedor</th><th>Producto</th><th>La dueña va a pedir</th></tr></thead>
     <tbody>${rows.map(x=>`<tr><td>${esc(nombre)}</td><td>${esc(x.nombre)}</td><td><b>${fmt(x.pedir)}</b> ${esc(x.unidad)}</td></tr>`).join('')}</tbody>
     </table></div>` :
   '<p class="gl-prov-empty">Todavía no hay productos para pedir. Completá la columna <b>Pedir</b> y aparecerán automáticamente acá.</p>';
  return `<div class="gl-provider-summary-head"><h3>Pedido a proveedor</h3>
     <span class="gl-provider-count">${rows.length} ${rows.length===1?'producto':'productos'}</span></div>
     <p class="lead">${draft.dirty ? 'Hay cambios sin guardar. Cuando termines, tocá Guardar para registrar el pedido en el historial.' : 'El pedido se prepara desde la columna Pedir. Guardalo en el historial antes de exportarlo como PDF.'}</p>
     ${footer}
     <div id="prov-err" class="gl-prov-err" role="status"></div>
     <div class="bar-a">
       ${canW()? `<button class="btn" data-act="prov-save-plan" ${S.offline||!rows.length?'disabled':''}>${ic('save')}Guardar</button>`:''}
       ${esTotal()? `<button class="btn primary" data-act="prov-share" ${!rows.length||draft.dirty?'disabled':''}>${ic('share')}Compartir PDF por WhatsApp</button>`:''}
       
     </div>
     ${S.offline?'<p class="note warn">Sin conexión: podés completar el borrador, pero no guardarlo en la nube.</p>':''}
     ${!esTotal()?'<p class="lead">El envío del PDF está reservado a la dueña o la administradora.</p>':''}`;
}
function mostrarResumenProveedor(){
  if(!S.provOpen)return;
  const wrap=document.getElementById('prov-resumen');
  if(wrap)wrap.innerHTML=proveedorResumenHTML(S.provOpen);
}
async function guardarPlanProveedor(){
  if(!canW() || S.offline || !S.db || !S.local || !S.provOpen){toast('Necesitás internet y permiso de edición para guardar.',true);return;}
  if(document.querySelector('.gl-prov-table .bad')){toast('Revisá las cantidades marcadas.',true);return;}
  const nombre=S.provOpen,local=S.local,d=proveedorBase(nombre);
  const btn=document.querySelector('[data-act="prov-save-plan"]');
  if(btn)btn.disabled=true;
  try{
    const ref=C('proveedores').doc(proveedorId(nombre));
    const snap=await ref.get();
    const ver=snap.exists ? Number(snap.data()?.pedidoActualizado)||0 : 0;
    if(ver!==d.base){
      d.stale=true;
      toast('Otra persona cambió este pedido. Copiá tu lista antes de recargar para evitar reemplazar sus datos.',true);
      return;
    }
    const stamp=Date.now();
    const payload={items:d.items.map(x=>({...x})),catalogo:{...d.catalogo},pedidoActualizado:stamp,pedidoPor:S.uid};
    await w(()=>snap.exists ? ref.update(payload) : ref.set({nombre,...payload,contacto:'',telefono:'',entrega:'',nota:''}));
    if(local!==S.local)return;
    delete S.provDrafts[proveedorId(nombre)];
    try{localStorage.removeItem(proveedorDraftKey(nombre));}catch{}
    toast('Lista y pedido guardados sin cambiar el stock real.');
  }catch(e){fail(e);}finally{if(btn?.isConnected)btn.disabled=false;}
}
function crearImagenPedido(nombre,productos,pagina,total){
  const W=1000, H=310+productos.length*64;
  const canvas=document.createElement('canvas');
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  if(!ctx)return Promise.reject(new Error('canvas'));
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#0c2034';ctx.fillRect(0,0,W,150);
  ctx.fillStyle='#ffffff';ctx.font='bold 40px Arial, sans-serif';ctx.fillText('GESTLOK',50,75);
  ctx.font='22px Arial, sans-serif';ctx.fillText('PEDIDO A PROVEEDOR',50,112);
  ctx.fillStyle='#14354b';ctx.font='bold 25px Arial, sans-serif';ctx.fillText(nombre.slice(0,55),50,205);
  ctx.font='18px Arial, sans-serif';ctx.fillText('Local: '+localNombre().slice(0,40)+'   |   '+hoyISO()+'   |   Página '+pagina+'/'+total,50,240);
  ctx.fillStyle='#eff5f7';ctx.fillRect(42,263,W-84,42);
  ctx.fillStyle='#17394f';ctx.font='bold 19px Arial, sans-serif';ctx.fillText('PRODUCTO',55,290);ctx.fillText('PEDIR',755,290);
  ctx.font='19px Arial, sans-serif';
  productos.forEach((p,i)=>{
    const y=332+i*64;
    if(i%2===0){ctx.fillStyle='#f6f9fb';ctx.fillRect(42,y-24,W-84,58);}
    ctx.fillStyle='#1a364b';
    const product=String(p.nombre).length>53?String(p.nombre).slice(0,50)+'…':String(p.nombre);
    ctx.fillText(product,55,y,670);
    ctx.font='bold 19px Arial, sans-serif';
    ctx.fillText(fmt(p.pedir)+' '+String(p.unidad||'').slice(0,16),755,y,200);
    ctx.font='19px Arial, sans-serif';
  });
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('imagen')),'image/png'));
}
async function compartirPedidoProveedor(){
  if(!esTotal() || !S.provOpen)return;
  const nombre=S.provOpen,rows=proveedorSeleccionados(nombre);
  if(!rows.length){toast('Completá primero las cantidades de Pedir.',true);return;}
  if(document.querySelector('.gl-prov-table .bad')){toast('Corregí las cantidades antes de compartir.',true);return;}
  const texto=pedidoProveedorTexto(nombre),telefono=telWa(proveedorFicha(nombre)?.telefono);
  const wa='https://wa.me/'+telefono+'?text='+encodeURIComponent(texto);
  if(!navigator.share){
    window.open(wa,'_blank','noopener,noreferrer');
    toast('WhatsApp abierto con el pedido escrito. Confirmá el envío.');
    return;
  }
  const btn=document.querySelector('[data-act="prov-share"]');if(btn)btn.disabled=true;
  try{
    const chunks=[];for(let i=0;i<rows.length;i+=28)chunks.push(rows.slice(i,i+28));
    const archivos=[];
    for(let i=0;i<chunks.length;i++){
      const blob=await crearImagenPedido(nombre,chunks[i],i+1,chunks.length);
      archivos.push(new File([blob],`pedido-${slug(nombre)}-${hoyISO()}-${i+1}.png`,{type:'image/png'}));
    }
    if(S.provOpen!==nombre)return;
    S.provEnvio={nombre,local:S.local,texto,wa,archivos};
    S.panel='prov-share';
    const filesAllowed=!!navigator.canShare?.({files:archivos});
    openPanel(`<div class="pn-h"><h3>Compartir pedido</h3><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
      <div class="pn-b gl-prov-sharing">
        <p class="lead"><b>${esc(nombre)}</b> · ${plural(rows.length,'producto','productos')} · ${plural(archivos.length,'imagen preparada','imágenes preparadas')}.</p>
        <p class="lead">Elegí WhatsApp en el menú de compartir y confirmá el destinatario. GestLok no envía nada sin tu confirmación.</p>
        <button class="btn primary" type="button" data-act="prov-share-ready">${ic('share')}${filesAllowed?'Enviar imagen por WhatsApp':'Compartir pedido como texto'}</button>
        ${navigator.clipboard?.write && window.ClipboardItem && archivos.length===1?`<button class="btn" type="button" data-act="prov-copy-image">${ic('copy')}Copiar imagen</button>`:''}
        <a class="btn" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${ic('msg')}Abrir WhatsApp con el pedido escrito</a>
        <small>Si tu dispositivo no admite adjuntar la imagen, podés compartir el texto completo.</small>
      </div>`,'dlg');
  }catch(e){toast('No se pudo generar la imagen. Usá Copiar pedido o WhatsApp.',true);}
  finally{if(btn?.isConnected)btn.disabled=false;}
}
/* El usuario toca una segunda vez: mantiene la activación requerida por Web Share. */
function enviarProveedorPreparado(){
  const p=S.provEnvio;
  if(!p || p.local!==S.local || !esTotal() || !navigator.share)return;
  const filesAllowed=!!navigator.canShare?.({files:p.archivos});
  let promise;
  try{promise=navigator.share(filesAllowed?{title:'Pedido · '+p.nombre,text:p.texto,files:p.archivos}:{title:'Pedido · '+p.nombre,text:p.texto});}
  catch(e){if(e?.name!=='AbortError')toast('No se pudo compartir. Usá WhatsApp con el texto.',true);return;}
  Promise.resolve(promise).then(()=>{
    if(S.provEnvio===p){closePanel();toast('El pedido se entregó al menú de compartir. Confirmá el envío en WhatsApp.');}
  }).catch(e=>{if(e?.name!=='AbortError')toast('No se pudo compartir. Usá WhatsApp con el texto.',true);});
}
function copiarImagenProveedor(){
  const p=S.provEnvio;
  if(!p || p.archivos.length!==1 || !navigator.clipboard?.write || !window.ClipboardItem)return;
  navigator.clipboard.write([new window.ClipboardItem({'image/png':p.archivos[0]})])
    .then(()=>toast('Imagen copiada. Abrí WhatsApp y pegala en el chat.'))
    .catch(()=>toast('Este navegador no permite copiar la imagen.',true));
}

/* Control diario: registros adicionales por producto, sin modificar el stock operativo.
   Cada confirmación es un registro nuevo, para conservar revisiones y autoría. */
const diarioVal = v => {
  const t = String(v ?? '').trim();
  if (!t) return null;
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(t)) return NaN;
  return Number(t.replace(',','.'));
};
function diarioResumen(data){
  const esperado = round(data.inicio + data.ingresos - data.ventas - data.consumo - data.merma + data.ajustes);
  const diferencia = round(data.final - esperado);
  return {esperado,diferencia};
}
const diarioRegistros = () => {
  const dia = S.diarioDia || hoyISO();
  const m = new Map();
  for(const d of S.diarios) {
    if(d.dia !== dia || !S.allProds.some(p=>p.id===d.producto))continue;
    if(!m.has(d.producto))m.set(d.producto,d);
  }
  return [...m.values()];
};
function diarioNuevo(){
  S.diarioProd = '';
  render();
}
V.diario = () => {
  const dia = S.diarioDia || hoyISO();
  const prods = S.allProds.filter(p=> !p.hoja).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
  const r = diarioRegistros();
  const faltantes = r.filter(d=>Math.abs(Number(d.diferencia)||0)>0.001);
  const p = prods.find(x=>x.id===S.diarioProd) || prods[0];
  const prev = p && r.find(d=>d.producto===p.id);
  const fields = [
    ['inicio','Stock inicial'],['ingresos','Ingresos'],['ventas','Ventas'],
    ['consumo','Consumo interno'],['merma','Merma'],['ajustes','Ajustes (+/−)'],['final','Conteo físico final']
  ];
  return `<section class="sheet gl-daily">
    <div class="bar"><div><p class="eyebrow">Movimientos · ${esc(localNombre())}</p><h1>Control diario</h1>
      <p class="lead">Registrá los movimientos reales de cada producto y compará el conteo físico con el stock esperado. No modifica el stock de las otras planillas.</p></div>
      <div class="fld"><label for="diario-fecha">Fecha</label><input id="diario-fecha" type="date" max="${hoyISO()}" value="${esc(dia)}"></div>
    </div>
    <div class="gl-daily-kpis"><div><b>${r.length}</b><small>Productos revisados</small></div><div><b>${faltantes.length}</b><small>Con diferencias</small></div><div><b>${prods.length-r.length}</b><small>Sin registrar</small></div></div>
    ${!prods.length ? '<div class="note warn">Todavía no hay productos en la hoja principal.</div>' : `
      <div class="gl-daily-layout">
        <section class="card pad gl-daily-entry">
          <h2>Registrar producto</h2>
          <div class="fld"><label for="diario-producto">Producto</label><select id="diario-producto">${prods.map(x=>`<option value="${esc(x.id)}" ${x.id===p.id?'selected':''}>${esc(x.nombre)} · ${esc(x.unidad||'unidad')}</option>`).join('')}</select></div>
          <p class="lead">${prev ? `Último registro: ${esc(fechaHora(prev.creado))} · ${esc(prev.autor||'equipo')}. Podés agregar una corrección sin borrar el anterior.` : 'Los campos de movimientos vacíos se interpretan como cero. El inicial y el conteo físico son obligatorios.'}</p>
          <form id="diario-form">
            <div class="gl-daily-fields">${fields.map(([k,label])=>`<div class="fld"><label for="diario-${k}">${label}</label><input id="diario-${k}" data-diario-num="${k}" inputmode="decimal" autocomplete="off" placeholder="${k==='ajustes'?'0 (puede ser negativo)':'0'}" ${!canW() || S.offline ? 'disabled' : ''}></div>`).join('')}</div>
            <div class="fld"><label for="diario-nota">Observación / motivo</label><textarea id="diario-nota" maxlength="250" rows="2" placeholder="Ej.: consumo de personal, rotura, diferencia de conteo" ${!canW() || S.offline ? 'disabled' : ''}></textarea></div>
            <div id="diario-preview" class="gl-daily-result" role="status">Completá el stock inicial y el conteo final para calcular la diferencia.</div>
            <div class="bar-a"><button class="btn primary" type="submit" ${!canW() || S.offline ? 'disabled' : ''}>${ic('save')}Guardar registro diario</button></div>
            ${S.offline ? '<p class="note warn">Sin conexión. No se puede guardar este registro; volvé a abrirlo cuando haya internet.</p>' : ''}
            ${!canW() ? '<p class="note">Tu cuenta tiene permiso de lectura, no de edición.</p>' : ''}
          </form>
        </section>
        <section class="card pad gl-daily-history">
          <h2>Resumen del día</h2>
          ${r.length ? `<div class="gl-daily-list">${r.map(d=>{
            const prod=S.allProds.find(x=>x.id===d.producto);
            const n=Number(d.diferencia)||0;
            return `<div class="gl-daily-item"><div><b>${esc(prod?.nombre||d.nombre||'Producto')}</b><small>${esc(fechaHora(d.creado))}</small></div><span class="${n?'gl-daily-alert':'gl-daily-ok'}">${n>0?'+':''}${fmt(n)}</span></div>`;
          }).join('')}</div>` : '<p class="lead">Todavía no hay registros para esta fecha.</p>'}
          <p class="lead">Las cantidades se expresan en la unidad de cada producto; no sumamos litros, kilos y unidades entre sí.</p>
        </section>
      </div>`}
  </section>`;
};
function diarioCalcularDesdeForm(f){
  const keys=['inicio','ingresos','ventas','consumo','merma','ajustes','final'];
  const data={};
  for(const key of keys) {
    const v=diarioVal(f.querySelector('#diario-'+key)?.value);
    if(!Number.isFinite(v) && v!==null) return {error:'Revisá las cantidades. Usá números con hasta dos decimales.'};
    if(v!==null && (Math.abs(v)>100000000 || (key!=='ajustes' && v<0))) return {error:'Las cantidades deben ser positivas (excepto los ajustes) y razonables.'};
    if(v===null && (key==='inicio' || key==='final')) return {error:'Completá stock inicial y conteo físico final.'};
    data[key]=v??0;
  }
  return {data,...diarioResumen(data)};
}
function refrescarDiarioPreview(f){
  const el=document.getElementById('diario-preview');if(!el)return;
  const result=diarioCalcularDesdeForm(f);
  el.textContent=result.error || ('Stock esperado: '+fmt(result.esperado)+' · Conteo físico: '+fmt(result.data.final)+' · Diferencia: '+(result.diferencia>0?'+':'')+fmt(result.diferencia));
  el.classList.toggle('gl-daily-alert',!result.error && Math.abs(result.diferencia)>0.001);
}
async function guardarDiario(f){
  if(!S.db || !S.local || !canW() || S.offline){toast('Necesitás internet y permiso de edición.',true);return;}
  const date=S.diarioDia || hoyISO();
  const prod=S.allProds.find(x=>x.id===S.diarioProd) || S.allProds.filter(x=>!x.hoja)[0];
  const result=diarioCalcularDesdeForm(f);
  if(!prod || prod.hoja || result.error || !/^\d{4}-\d\d-\d\d$/.test(date) || date>hoyISO()){toast(result.error||'Revisá el producto y la fecha.',true);return;}
  const local=S.local, btn=f.querySelector('button[type="submit"]');
  if(btn){btn.disabled=true;btn.textContent='Guardando…';}
  const record={dia:date,producto:prod.id,nombre:prod.nombre||'',unidad:prod.unidad||'unidad',
    ...result.data,esperado:result.esperado,diferencia:result.diferencia,
    nota:f.querySelector('#diario-nota').value.trim().slice(0,250),creado:Date.now(),autor:S.uid};
  try {
    await w(()=>C('diario').add(record));
    if(S.local===local){toast('Registro guardado. No se modificó el stock operativo.');render();}
  }catch(e){fail(e);if(btn?.isConnected){btn.disabled=false;btn.textContent='Guardar registro diario';}}
}

V.proveedores = () => {
  const lista=proveedorNombres();
  const carpetas=lista.map(([nombre])=>{
    const ficha=proveedorFicha(nombre)||{};
    const pendientes=S.allProds.filter(p=>provOf(p)===nombre && alerta(p));
    const telefono=telWa(ficha.telefono);
    const rows=proveedorFilas(nombre);
    const porPedir=rows.filter(x=>Number(x.pedir)>0).length;
    const wa=telefono?'https://wa.me/'+telefono+'?text='+encodeURIComponent(porPedir?pedidoProveedorTexto(nombre):'Hola, quisiera hacer un pedido para '+localNombre()):'';
    const meta=[ficha.contacto,ficha.entrega].filter(Boolean);
    const abierto=S.provOpen===nombre;
    return `<article class="card pad gl-provider-card ${abierto?'is-open':''}">
      <div class="gl-provider-head">
        <div class="gl-prov-folder-head"><span class="gl-prov-folder-icon" aria-hidden="true">${ic('box')}</span>
          <div><p class="eyebrow">Carpeta de proveedor</p><h2>${esc(nombre)}</h2></div>
        </div>
        <span class="gl-provider-count">${plural(rows.length,'producto','productos')}</span>
      </div>
      <p class="lead">${pendientes.length?`<b>${pendientes.length} para reponer</b> · Revisá las cantidades antes de enviarlas.`:'Sin faltantes detectados.'}
        ${porPedir?`<b> · ${plural(porPedir,'producto en el pedido','productos en el pedido')}</b>`:''}</p>
      ${meta.length?`<p class="gl-provider-meta">${meta.map(m=>esc(m)).join(' · ')}</p>`:'<p class="gl-provider-meta">Carpeta para cargar los productos y preparar pedidos.</p>'}
      <div class="bar-a">
        <button class="btn sm ${abierto?'primary':''}" data-act="prov-open" data-name="${esc(nombre)}">${ic('box')}${abierto?'Carpeta abierta':'Abrir carpeta'}</button>
        ${porPedir || pendientes.length?`<button class="btn sm" data-act="prov-copy" data-name="${esc(nombre)}">${ic('copy')}Copiar pedido</button>`:''}
        
        ${canW()?`<button class="btn sm" data-act="prov-edit" data-name="${esc(nombre)}">${ic('edit')}${ficha.contacto||ficha.telefono?'Editar ficha':'Completar ficha'}</button>`:''}
      </div>
    </article>`;
  }).join('');
  const nombre=S.provOpen && lista.some(([n])=>n===S.provOpen)?S.provOpen:'';
  const draft=nombre?proveedorBase(nombre):null;
  const rows=nombre?proveedorFilas(nombre):[];
  const filaHTML=rows.map(p=>{
    const disabled=!canW()?'disabled':'';
    const manual=p.origen==='manual';
    return `<tr data-prov-row="${esc(p.id)}"><td class="gl-prov-product">
        <b>${esc(p.nombre)}</b><small>${esc(p.unidad)}</small>
        ${manual && canW()?`<button class="gl-prov-remove" data-act="prov-del-manual" data-id="${esc(p.id)}" aria-label="Quitar ${esc(p.nombre)} de la carpeta">Quitar</button>`:''}
      </td>
      ${['stockLocal','pedir','sugerido'].map(field=>`<td data-label="${field==='stockLocal'?'Stock local':field==='pedir'?'Pedir':'Sugerido'}">
        <input data-prov-val="${field}" data-id="${esc(p.id)}" inputmode="decimal" autocomplete="off"
        aria-label="${field==='stockLocal'?'Stock local':field==='pedir'?'Pedir':'Sugerido'} de ${esc(p.nombre)}"
        value="${p[field]==null?'':esc(fmtIn(p[field]))}" placeholder="0" ${disabled}>
        ${field==='pedir' && canW() && p.sugerido!=null?`<button class="gl-prov-sug" data-act="prov-use-suggested" data-id="${esc(p.id)}" type="button">Usar sugerido</button>`:''}
      </td>`).join('')}
    </tr>`;
  }).join('');
  const details=nombre?`<section id="prov-carpeta" class="gl-prov-workspace card pad">
    <div class="gl-prov-workspace-head">
      <div><p class="eyebrow">Carpeta abierta · ${esc(localNombre())}</p><h2>${esc(nombre)}</h2>
        <p class="lead">Completá Stock local, Pedir y Sugerido. Los valores de esta hoja no cambian el stock real de las planillas.</p></div>
      <button class="btn sm" data-act="prov-close">${ic('x')}Cerrar carpeta</button>
    </div>
    ${draft.stale?'<p class="note warn">Encontramos un borrador anterior, pero el pedido de la nube cambió. Los últimos datos de la nube se mantienen para evitar reemplazarlos.</p>':''}
    <div class="gl-prov-toolbar">
      <b>Lista de productos</b>
      ${canW()?`<button class="btn sm" data-act="prov-add-open">${ic('plus')}Agregar producto manual</button>`:''}
    </div>
    ${S.provAdding && canW()?`<form id="prov-add-form" class="gl-prov-add-form">
      <div class="fld"><label for="prov-item-name">Producto</label><input id="prov-item-name" required maxlength="100" placeholder="Ej.: Café en granos"></div>
      <div class="fld"><label for="prov-item-category">Categoría</label><input id="prov-item-category" maxlength="70" placeholder="Ej.: Bebidas, Envases"></div>
      <div class="fld"><label for="prov-item-unit">Unidad</label><input id="prov-item-unit" maxlength="30" placeholder="kg, caja, unidad"></div>
      <button class="btn primary" type="submit">Agregar a la lista</button>
    </form>`:''}
    ${rows.length?`<div class="gl-prov-table-scroll"><table class="gl-prov-table">
       <thead><tr><th>Producto</th><th>Stock local</th><th>Pedir</th><th>Sugerido</th></tr></thead>
       <tbody>${filaHTML}</tbody>
      </table></div>`:'<p class="note">Esta carpeta está vacía. Agregá productos manualmente o asigná este proveedor a productos del catálogo.</p>'}
    <div id="prov-resumen" class="gl-prov-summary">${proveedorResumenHTML(nombre)}</div>
    </section>`:'<div class="card pad gl-prov-prompt"><b>Elegí una carpeta</b><p class="lead">Abrí el proveedor para cargar sus cantidades. El pedido aparecerá automáticamente debajo de la lista.</p></div>';
  return `<section class="sheet gl-proveedores">
    <div class="gl-prov-title"><div><p class="eyebrow">Hoja · ${esc(localNombre())}</p><h1>Proveedores</h1>
    <p class="lead">Una carpeta por proveedor. Guardá los pedidos terminados en el historial y compartí únicamente el PDF por WhatsApp.</p></div>
    ${canW()?`<button class="btn primary" data-act="prov-new">${ic('plus')}Crear proveedor</button>`:''}
    </div>
    ${!S.loaded.p?loadingList():`<div class="gl-provider-grid">${carpetas||'<div class="card pad">Todavía no hay proveedores. Creá una carpeta para comenzar.</div>'}</div>`}
    ${details}
  </section>`;
};

const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;
const chatRecent = m => {
  const ts = Number(m?.fecha);
  return Number.isFinite(ts) && ts > 0 && ts > Date.now() - CHAT_RETENTION_MS;
};
const chatSeenKey = () => 'gestlok-chat-seen:' + encodeURIComponent(String(S.uid || S.me?.email || '').toLowerCase()) + ':' + S.local;
/* Borradores y reintentos separados por cuenta y local. Nunca reenviar automáticamente. */
const chatDraftKey = () => 'gestlok-chat-draft-v1:' + encodeURIComponent(String(S.uid || S.me?.email || '').toLowerCase()) + ':' + S.local;
const chatPendingKey = () => 'gestlok-chat-pending-v1:' + encodeURIComponent(String(S.uid || S.me?.email || '').toLowerCase()) + ':' + S.local;
const chatDraftText = () => String(lsGet(chatDraftKey(), '') || '').slice(0, 1000);
function chatPending(){
  const p = lsGet(chatPendingKey(), null);
  return p && /^[a-z0-9]{10,40}$/.test(String(p.id || '')) &&
    typeof p.texto === 'string' && p.texto.length <= 1000 &&
    p.autor === S.uid && p.local === S.local && chatRecent(p) ? p : null;
}
function markChatRead(){
  if (!S.local || !S.uid) return;
  const latest = Date.now();
  lsSet(chatSeenKey(),latest);
  S.unreadChat = 0;
}
function refreshChatAges(){
  const current = S.chat.filter(chatRecent);
  if (current.length !== S.chat.length){
    S.chat = current;
    const since = Number(lsGet(chatSeenKey(), 0)) || 0;
    S.unreadChat = current.filter(m => m.autor !== S.uid && Number(m.fecha) > since).length;
    if (S.view === 'chat') render();
    else renderNav();
  }
}
V.chat = () => {
  const mensajes = S.chat.filter(chatRecent).map(m => {
    const own = !!(m.autor && m.autor === S.uid);
    const ts = Number(m.fecha);
    const fecha = Number.isFinite(ts) && ts > 0 ? fechaHora(ts) : '';
    return `<article class="gestlok-chat-message${own ? ' mine' : ''}"><strong>${esc(m.nombre || 'Equipo')}</strong><small>${esc(fecha)}</small><p>${esc(m.texto || '')}</p></article>`;
  }).join('');
  const pending = chatPending();
  const puedeEnviar = canW() && !S.offline;
  return `<section class="sheet gestlok-chat"><p class="eyebrow">Comunicación interna · ${esc(localNombre())}</p><h1>Chat del local</h1><p class="lead">Solo las personas autorizadas para este local pueden leer los mensajes. Los mensajes duran 24 horas y se eliminan automáticamente. Podés navegar por otras secciones y volver sin perder la conversación vigente.</p>
    <div class="gestlok-chat-list" role="log" aria-label="Mensajes del local">${mensajes || '<p class="lead">Todavía no hay mensajes.</p>'}</div>
    ${S.offline ? '<p class="note warn">Sin conexión. Podés leer los mensajes cargados y escribir un borrador, pero necesitás internet para enviarlo.</p>' : ''}
    ${pending ? '<p class="note warn">No pudimos confirmar el envío anterior. Reintentá el mismo mensaje; no se duplicará.</p>' : ''}
    ${!canW() ? '<p class="note warn">Tu acceso es de solo lectura.</p>' : ''}
    <form id="gestlok-chat-form" class="gestlok-chat-form"><label for="gestlok-chat-text">Nuevo mensaje</label><textarea id="gestlok-chat-text" maxlength="1000" required placeholder="Escribí un mensaje para tu equipo…" ${canW() && !pending ? '' : 'disabled'}>${esc(pending ? pending.texto : chatDraftText())}</textarea>
      <button class="btn primary" type="submit" ${puedeEnviar ? '' : 'disabled'}>${pending ? 'Reintentar envío' : 'Enviar mensaje'}</button></form>
  </section>`;
};

async function sendGestlokChat(form){
  if (!S.db || !S.local || S.offline || !canW()){ toast('Necesitás conexión y permiso de edición para enviar mensajes.', true); return; }
  const local = S.local, author = S.uid, input = form.querySelector('#gestlok-chat-text');
  const pending = chatPending(), txt = (pending ? pending.texto : input?.value || '').trim();
  if (!txt || txt.length > 1000){ toast('Escribí un mensaje de hasta 1000 caracteres.', true); return; }
  const payload = pending || {id:rid() + rid(), texto:txt, autor:author, local, nombre:S.me?.name || 'Equipo', fecha:Date.now()};
  const pendingKey = chatPendingKey(), draftKey = chatDraftKey();
  // Identificador fijo de mensaje: si la respuesta se pierde, reintentar no crea otro registro.
  try { localStorage.setItem(pendingKey, JSON.stringify(payload)); }
  catch { toast('No se pudo guardar el reintento en este dispositivo. Revisá el espacio disponible.', true); return; }
  const btn = form.querySelector('[type="submit"]');
  if (btn) btn.disabled = true;
  if (input) input.disabled = true;
  try {
    await w(() => S.db.collection(local + '/chat').doc(payload.id).set({
      texto:payload.texto, autor:payload.autor, nombre:payload.nombre, fecha:payload.fecha
    }));
    if (lsGet(pendingKey, null)?.id === payload.id) localStorage.removeItem(pendingKey);
    if (lsGet(draftKey, '') === payload.texto || lsGet(draftKey, '') === '') localStorage.removeItem(draftKey);
    toast('Mensaje enviado');
  } catch (error){
    if (error?.code === 'invalid_argument') localStorage.removeItem(pendingKey);
    fail(error);
  } finally {
    if (S.local === local && S.view === 'chat') render();
  }
}


/* El panel usa datos guardados de cada hoja independiente.
   Stock y Conteo comparten productos, por eso no se duplican. */
function resumenHojasInicio(){
  if (!S.loaded.h || !S.loaded.p || !S.loaded.f || !S.loaded.c)
    return '<section class="card pad"><h4>Resumen de hojas</h4><p class="lead">Cargando información guardada del local…</p></section>';
  const inventarios = visibles().filter(h => ['stock', 'conteo', 'lista', 'fabrica', 'ingreso'].includes(h.tipo));
  const vistos = new Set(), filas = [];
  for (const h of inventarios){
    const principal = h.tipo === 'stock' || h.tipo === 'conteo';
    const key = principal ? 'principal' : h.id;
    if (vistos.has(key)) continue;
    vistos.add(key);
    const datos = withCtx(h.id, () => {
      if (esFabT(h.tipo)){
        const items = S.fab, total = items.length;
        const conLocal = items.filter(it => num(it.local) != null).length;
        const conIngreso = items.filter(it => num(it.fabrica) != null).length;
        const sin = items.filter(it => it.sinStock || (num(it.local) != null && num(it.local) <= 0)).length;
        const ultimo = S.conteos.find(c => c.tipo === 'fabrica' && (c.hoja || 'fabrica') === h.id);
        return {total, detalle:`Local guardado: ${conLocal}/${total} · ${h.tipo === 'ingreso' ? 'Ingreso' : 'Fábrica'}: ${conIngreso}/${total} · Sin stock: ${sin}`, ultimo};
      }
      const items = S.prods, total = items.length;
      const cargados = items.filter(p => stockOf(p) != null || p.sinStock).length;
      const sin = items.filter(p => p.sinStock || (stockOf(p) != null && stockOf(p) <= 0)).length;
      const bajo = items.filter(p => !p.sinStock && stockOf(p) != null && stockOf(p) > 0 && minOf(p) != null && stockOf(p) < minOf(p)).length;
      const ultimo = S.conteos.find(c => c.tipo !== 'fabrica' && (principal ? !isCustom(c.hoja) : c.hoja === h.id));
      return {total, detalle:`Con cantidad guardada: ${cargados}/${total} · Sin stock: ${sin} · Bajo mínimo: ${bajo}`, ultimo};
    });
    const ultima = datos.ultimo ? `Último conteo: ${fechaHora(datos.ultimo.fecha)}` : 'Sin conteos históricos en esta hoja';
    filas.push(`<button class="gl-home-sheet-summary" data-go="${esc(h.id)}"><span class="six">${ic(h.ic)}</span><span><b>${esc(h.nombre)}</b><small>${datos.total} productos · ${esc(datos.detalle)}</small><small>${esc(ultima)}</small></span><span class="chev">${ic('chev')}</span></button>`);
  }
  return `<section class="card pad" aria-label="Resumen de hojas" style="margin-bottom:16px">
    <div class="ch"><h4>Resumen de todas tus hojas</h4><span class="num">Datos guardados · ${filas.length} hojas de inventario</span></div>
    <p class="lead" style="margin:0 0 12px">Cada hoja muestra sus cantidades guardadas por separado. Los borradores sin guardar no se cuentan; Stock y Conteo comparten el catálogo.</p>
    <div class="sheets gl-home-sheet-summaries">${filas.join('') || '<p class="lead">No hay hojas de inventario visibles.</p>'}</div>
  </section>`;
}

V.inicio = () => {
  const ps = sorted(), n = ps.length;
  const cnt = {ok:0, bajo:0, sin:0, nc:0}; ps.forEach(p => cnt[estado(p)]++);
  const ped = pedidoItems().length, last = S.conteos[0] || null, flagged = ps.filter(p => estado(p) === 'sin');
  const pct = k => n ? Math.max(cnt[k] / n * 100, cnt[k] ? 1.5 : 0) : 0;
  const ncats = cats();
  /* Los accesos de Inicio llevan solo a hojas que están en el menú */
  const vis = id => visibles().some(h => h.id === id), pedV = vis('pedido');
  const cg = vis('conteo') ? 'conteo' : vis('stock') ? 'stock' : '';
  const cgB = (cls, txt) => cg ? `<button class="${cls}" data-go="${cg}">${txt}</button>` : '';
  const cgL = cg === 'conteo' ? 'Nuevo conteo' : 'Cargar stock';
  const catRows = ncats.map(([c, total]) => { const it = ps.filter(p => catOf(p) === c); const cont = it.filter(p => estado(p) !== 'nc').length; return {c, total, cont, sin:it.filter(p => estado(p) === 'sin').length}; });
  const lastCard = last
    ? `<div class="lc"><span class="big">${esc(fechaHora(last.fecha))}</span><small>${esc(hojaLabel(last, last.tipo === 'fabrica' ? 'Conteo Fábrica' : 'Stock'))} · ${esc(whoName(last))} · ${plural((last.cambios||[]).length, 'cambio', 'cambios')} · ${rel(last.fecha)}</small><div class="bar-a"><button class="btn sm" data-go="historial">Ver historial</button>${cgB('btn sm primary', cgL)}</div></div>`
    : `<div class="lc"><span class="big">Sin conteos todavía</span><small>${S.loaded.c ? 'Cuando guardes el primero, aparece acá con fecha y hora.' : 'Cargando…'}</small><div class="bar-a">${cgB('btn sm primary', cg === 'conteo' ? 'Empezar a contar' : 'Cargar stock')}</div></div>`;
  return `${banners()}
  <section class="hello">
    <div><p class="eyebrow">${esc(fechaLarga())}</p><h3 class="h1">Stock de ${esc(localNombre())}</h3><p class="lead">Abajo podés consultar los registros de todas las hojas. Las estadísticas principales corresponden a ${esc(nombreHoja('stock'))}.</p></div>
    <div class="bar-a">${esTotal() && window.GestLokCommerce?.mode() !== 'online' ? `<button class="btn" data-go="ingreso" id="ini-remito">${ic('in')}Ingresar remito</button>` : ''}<button class="btn" data-act="share">${ic('userplus')}Equipo</button>${cgB('btn primary', ic(cg === 'conteo' ? 'clip' : 'box') + cgL)}</div>
  </section>
  ${window.GestLokCommerce?.card() || ''}
  ${window.GestLokCommerce?.summary() || ''}
  ${['creadora','dueno','gerente'].includes(miRol()) ? (window.GestLokUpdates?.homeDue?.() || '') : ''}
  ${isCreadora() && S.sol.length ? `<section class="card pad" style="margin-bottom:16px;display:grid;gap:10px;border-color:var(--warn)">${solRows()}</section>` : ''}
  ${S.loaded.p && !n ? `<section class="onb gl-setup"><p class="eyebrow">Configuración inicial · 1 de 3</p><b>Cargá tus primeros productos</b><span class="lead" style="margin:0">Podés agregarlos uno por uno o pegar la lista entera.</span><div class="bar-a"><button class="btn primary sm" data-act="aj-open" data-tab="agregar">${ic('plus')}Agregar productos</button><button class="btn sm" data-act="aj-open" data-tab="pegar">Pegar lista</button></div><small>Después asigná un proveedor y un mínimo, y realizá tu primer conteo.</small></section>` : ''}
  ${resumenHojasInicio()}
  <section class="gl-today card pad" aria-label="Acciones para hoy">
    <div class="gl-today-head"><div><p class="eyebrow">Acciones para hoy</p><h4>¿Qué necesitás resolver?</h4></div><small>${S.offline ? 'Sin conexión · los conteos quedan pendientes' : 'Datos actualizados del local'}</small></div>
    <div class="gl-today-grid">
      ${cg ? `<button class="gl-today-action" data-go="${cg}">${ic('clip')}<b>${cgL}</b><small>${cnt.nc ? plural(cnt.nc,'producto pendiente','productos pendientes') : 'Revisar cantidades'}</small></button>` : ''}
      ${pedV ? `<button class="gl-today-action" data-go="pedido">${ic('cart')}<b>Revisar faltantes</b><small>${plural(ped,'producto para pedir','productos para pedir')}</small></button>` : ''}
      <button class="gl-today-action" data-go="proveedores">${ic('store')}<b>Proveedores</b><small>Contactos y pedidos</small></button>
      ${puedeVerDiarioMunro() ? `<button class="gl-today-action" data-go="diario">${ic('clock')}<b>Control diario</b><small>Ventas, consumo y diferencias</small></button>` : ''}
    </div>
  </section>
  <div class="kpis${pedV ? '' : ' k3'}">
    <button class="kpi" data-act="kpi" data-k="todos" style="--kc:var(--accent)"><span class="k-l"><i></i>Productos</span><span class="k-v">${n}</span><span class="k-s">en ${plural(ncats.length, 'categoría', 'categorías')}</span></button>
    <button class="kpi" data-act="kpi" data-k="sin" style="--kc:var(--crit)"><span class="k-l"><i></i>Sin stock</span><span class="k-v" style="color:var(--crit)">${cnt.sin}</span><span class="k-s">tildados o en cero</span></button>
    <button class="kpi" data-act="kpi" data-k="nc" style="--kc:var(--nc)"><span class="k-l"><i></i>Sin contar · ${esc(nombreHoja("stock"))}</span><span class="k-v">${cnt.nc}</span><span class="k-s">todavía sin cantidad</span></button>
    ${pedV ? `<button class="kpi" data-go="pedido" style="--kc:var(--spark)"><span class="k-l"><i></i>A pedir</span><span class="k-v">${ped}</span><span class="k-s">sin stock o bajo mínimo</span></button>` : ''}
  </div>
  <div class="dash">
    <div class="col">
      <section class="card pad"><div class="ch"><h4>Estado de ${esc(nombreHoja('stock'))}</h4><span class="num">${n} productos</span></div>
        <div class="dist" role="img" aria-label="En stock ${cnt.ok}, stock bajo ${cnt.bajo}, sin stock ${cnt.sin}, sin contar ${cnt.nc}">${cnt.ok ? `<i style="width:${pct('ok')}%;background:var(--ok)"></i>` : ''}${cnt.bajo ? `<i style="width:${pct('bajo')}%;background:var(--warn)"></i>` : ''}${cnt.sin ? `<i style="width:${pct('sin')}%;background:var(--crit)"></i>` : ''}${cnt.nc ? `<i style="width:${pct('nc')}%;background:var(--nc)"></i>` : ''}</div>
        <div class="legend">
          <div><span><i style="background:var(--ok)"></i>En stock</span><b>${cnt.ok}</b></div>
          <div><span><i style="background:var(--warn)"></i>Stock bajo</span><b>${cnt.bajo}</b></div>
          <div><span><i style="background:var(--crit)"></i>Sin stock</span><b>${cnt.sin}</b></div>
          <div><span><i style="background:var(--nc)"></i>Sin contar</span><b>${cnt.nc}</b></div>
        </div>
      </section>
      <section class="card pad"><div class="ch"><h4>Por categoría</h4><span class="num">contados / total</span></div>
        ${catRows.length ? `<div class="ctab"><div class="ctr hd"><div>Categoría</div><span>Total</span><span>Sin stock</span><span>Contado</span></div>${catRows.map(r => `<div class="ctr" style="--cc:${ccOf(r.c)}"><button class="cn-n" data-act="cat-go" data-cat="${esc(r.c)}" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:9px;font-weight:600;min-width:0"><i style="width:10px;height:10px;border-radius:3px;background:var(--cc);flex:none"></i>${esc(r.c)}</button><span>${r.total}</span><span style="color:${r.sin ? 'var(--crit)' : 'var(--muted)'}">${r.sin}</span><div class="cbar"><em>${r.cont}/${r.total}</em><div><i style="width:${r.total ? r.cont / r.total * 100 : 0}%"></i></div></div></div>`).join('')}</div>` : `<p class="lead" style="margin:0">Las categorías aparecen cuando cargás productos.</p>`}
      </section>
      <section class="card pad"><div class="ch"><h4>Hojas</h4>${canW() ? `<button class="btn sm" data-act="hojas">${ic('edit')}Editar hojas</button>` : ''}</div>
        <div class="sheets">${visibles().map(h => `<button data-go="${esc(h.id)}"><span class="six">${ic(h.ic)}</span><span><b>${esc(h.nombre)}</b><small>${esc(h.desc)}</small></span><span class="chev">${ic('chev')}</span></button>`).join('') || `<p class="lead" style="margin:0">No hay hojas en el menú. Tocá Editar hojas para agregar una.</p>`}</div>
        ${S.dl && S.db ? `<div class="bar-a" style="margin-top:12px"><button class="btn sm" data-act="backup" title="Descarga todos los datos en un Excel">${ic('shield')}Copia de seguridad</button></div>` : ''}
      </section>
    </div>
    <div class="col">
      ${fabCard()}
      <section class="card pad"><div class="ch"><h4>Último conteo de cualquier hoja</h4></div>${lastCard}</section>
      <section class="card pad"><div class="ch"><h4>Sin stock · ${esc(nombreHoja("stock"))}</h4><span class="num">${flagged.length}</span></div>
        ${flagged.length ? `<div class="mini">${flagged.slice(0, 8).map(p => `<div class="mini-r">${ssBox(p,'hs')}<div><b>${esc(p.nombre)}</b><small style="--cc:${ccOf(catOf(p))}"><i></i>${esc(catOf(p))}</small></div><span class="st sin">Sin stock</span></div>`).join('')}</div>${flagged.length > 8 ? `<div class="bar-a" style="margin-top:8px"><button class="btn sm" data-act="kpi" data-k="sin">Ver los ${flagged.length}</button></div>` : ''}`
          : `<p class="lead" style="margin:0">Ningún producto sin stock. Tildá la casilla al lado de cada producto en cualquier hoja.</p>`}
      </section>
      <section class="card pad"><div class="ch"><h4>Equipo</h4><span class="num">${equipoList().length}${isCreadora() && S.sol.length ? ` · ${S.sol.length} pendientes` : ''}</span></div>
        <div class="eq">${equipoRows(false)}</div>
        <div class="bar-a" style="margin-top:12px"><button class="btn sm primary" data-act="share">${ic('userplus')}${puedeAdministrarEquipo() ? 'Agregar o quitar' : 'Ver equipo'}</button></div>
      </section>
    </div>
  </div>`;
};

V.stock = () => {
  const sg = sugActivo();
  const tg = esTotal() ? `<button class="btn sm sg-tg" id="sg-tg" role="switch" aria-checked="${sg}" data-act="sug-tg" title="${sg ? 'Ocultar' : 'Mostrar'} el stock sugerido y sus estados para todo el equipo"><span class="tk" aria-hidden="true"></span>Stock sugerido</button>` : '';
  const txt = sg
    ? (esTotal() ? 'Cargá el <b>Sugerido</b> de cada producto en la última columna y, con <b>Estados</b>, desde qué número aparece cada estado.' : 'El <b>Sugerido</b> lo carga la dueña: compará con lo que hay en el local.')
    : (esTotal() ? 'Activá <b>Stock sugerido</b> para cargar un número de referencia por producto y ver los estados por color.' : '');
  const acts = tg + (S.prods.length ? `${canW() ? `<button class="btn sm danger" data-act="borrar">${ic('trash')}Borrar datos</button>` : ''}<button class="btn sm" data-act="print">${ic('print')}Imprimir</button>` : '');
  const head = `${banners()}<div class="bar"><p class="lead">${listaCtx() ? 'Cantidades en unidades enteras o medias. Corregí con − y +' : 'Cantidades en unidades enteras o con <b>¼ ½ ¾</b>. Corregí con − y +, elegí la fracción con ¼ ½ ¾'}, tildá <b>Sin stock</b> cuando se termine algo y confirmá con Guardar conteo. ${txt}${listaCtx() ? ' Los productos de esta hoja son solo de esta hoja.' : ''}</p>${acts ? `<div class="bar-a">${acts}</div>` : ''}</div>`;
  if (!S.loaded.p) return head + loadingList();
  if (!S.prods.length) return head + noProducts();
  const base = sorted().filter(p => catOK(p) && qOK(p));
  const btn = (c, fil) => (k, l, kc) => `<button data-act="filtro" data-f="${k}" aria-pressed="${fil === k}" style="--kc:${kc}"><span class="l"><i></i>${l}</span><span class="v">${c[k]}</span></button>`;
  const vacio = noMatch('Nada para mostrar', 'Probá con otra búsqueda, categoría o filtro.');
  if (!sg){
    const fil = S.filtro === 'poco' ? 'bajo' : ['ideal', 'exc'].includes(S.filtro) ? 'todos' : S.filtro;
    const c = {todos:base.length, sin:0, bajo:0, nc:0}; base.forEach(p => { const e = estado(p); if (has(c, e)) c[e]++; });
    const list = base.filter(p => fil === 'todos' || estado(p) === fil), f = btn(c, fil);
    return head + `<div class="statf">${f('todos','Todos','var(--accent)')}${f('sin','Sin stock','var(--crit)')}${f('bajo','Stock bajo','var(--warn)')}${f('nc','Sin contar','var(--nc)')}</div>
    ${tools('q-stock', S.q, 'Buscar producto')}
    ${list.length ? sheet('stock', list, p => rowStock(p, false), {cls:'nosug', head:HEADS.stock0}) : vacio}`;
  }
  const grp = e => e === 'bajo' ? 'poco' : e;
  const fil = S.filtro === 'bajo' ? 'poco' : S.filtro;
  const c = {todos:base.length, sin:0, poco:0, ideal:0, exc:0, nc:0}; base.forEach(p => { const e = grp(estadoSug(p)); if (has(c, e)) c[e]++; });
  const list = base.filter(p => fil === 'todos' || grp(estadoSug(p)) === fil), f = btn(c, fil);
  return head + `<div class="statf st6">${f('todos','Todos','var(--accent)')}${f('sin','Sin stock','var(--crit)')}${f('poco','Poco stock','var(--yel)')}${f('ideal','Stock ideal','var(--ok)')}${f('exc','Exceso','var(--exc)')}${f('nc','Sin contar','var(--nc)')}</div>
    ${tools('q-stock', S.q, 'Buscar producto')}
    ${list.length ? sheet('stock', list, p => rowStock(p, true)) : vacio}`;
};
function rowStock(p, sg = sugActivo()){
  const st = sg ? estadoSug(p) : estado(p), q = qty(p), chg = has(S.draft, p.id) && q !== stockOf(p), meta = metaTxt(p), id = esc(p.id);
  return `<div class="sh-r ${st}">
    <span class="r-n">${S.rn.get(p.id) || ''}</span>
    <div class="r-ss">${ssBox(p,'ss')}</div>
    <div class="r-name"><button class="r-nb" data-act="aj-item" data-id="${id}" title="Modificar en Ajustes"><b>${esc(p.nombre)}</b>${meta ? `<small>${meta}</small>` : ''}${p.obs ? `<small class="obs">${esc(p.obs)}</small>` : ''}</button>${notaCell(p, 'p')}</div>
    <div class="r-st"><span class="st ${st}" ${sg && sugOf(p) != null ? `title="${esc(rangoTxt(p))}"` : ''}>${ESTADO[st]}</span></div>
    <div class="r-q"><small class="ql">Local</small><span class="q">${fmt(q)}</span>${chg ? `<small>antes ${fmt(stockOf(p))}</small>` : ''}</div>
    <div class="r-adj"><div class="adj"><button class="out" id="dec-${id}" data-act="dec" data-id="${id}" aria-label="Restar 1 a ${esc(p.nombre)}" ${!(q > 0) || !canW() ? 'disabled' : ''}>−</button><button class="in" id="inc-${id}" data-act="inc" data-id="${id}" aria-label="Sumar 1 a ${esc(p.nombre)}" ${canW() ? '' : 'disabled'}>+</button></div>${listaCtx() ? '' : fracBtns(p, q)}</div>
    ${sg ? `<div class="r-sug">${sugCell(p, q)}</div>` : ''}
  </div>`;
}
/* ¼ ½ ¾: eligen la fracción de la cantidad (tocar la misma otra vez la saca). − y + cambian de a 1. */
function fracBtns(p, q){
  const id = esc(p.id), fr = fracOf(q), dis = canW() ? '' : 'disabled';
  return `<div class="fq" role="group" aria-label="Fracción de ${esc(p.nombre)}">${[[1, '¼'], [2, '½'], [3, '¾']].map(([k, l]) => `<button id="fq${k}-${id}" data-act="frac" data-id="${id}" data-f="${k / 4}" aria-pressed="${Math.abs(fr - k / 4) < 1e-9}" aria-label="${l} de ${esc(p.nombre)}" ${dis}>${l}</button>`).join('')}</div>`;
}
function sugCell(p, q){
  const s = sugOf(p), id = esc(p.id), edit = S.sgEdit && has(S.sgEdit, p.id) ? S.sgEdit[p.id] : null;
  const d = s != null && q != null ? round(q - s) : null;
  const dif = d == null ? '' : d < 0 ? `<small class="sg-d neg">faltan ${fmt(-d)}</small>` : d > 0 ? `<small class="sg-d pos">sobran ${fmt(d)}</small>` : `<small class="sg-d eq">justo</small>`;
  const val = esTotal()
    ? `<input class="sg-in" id="sg-${id}" data-sg="${id}" inputmode="decimal" autocomplete="off" value="${esc(edit ?? fmtIn(s))}" placeholder="—" aria-label="Stock sugerido de ${esc(p.nombre)}">`
    : `<span class="q">${fmt(s)}</span>`;
  const est = esTotal() ? `<button class="sg-e" id="se-${id}" data-act="est" data-id="${id}" title="Elegir desde qué número aparece cada estado">${ic('edit')}Estados</button>` : '';
  return `<span class="sg-l">Sugerido</span>${val}${est}${dif}`;
}
/* Estados de un producto: sugerido, hasta cuánto es poco stock y desde cuánto es exceso (solo dueña y administradora) */
function estPrev(sg, pc, ex){
  if (sg == null) return `<span class="st nc">Cargá el sugerido para ver los estados</span>`;
  const p0 = pc ?? Math.floor(sg) / 2, e0 = ex ?? sg;
  return `<span class="st sin">Sin stock: 0</span><span class="st poco">Poco stock: hasta ${fmt(p0)}</span><span class="st ideal">Stock ideal: más de ${fmt(p0)} hasta ${fmt(e0)}</span><span class="st exc">Exceso: más de ${fmt(e0)}</span>`;
}
function openEstados(id){
  if (!esTotal()){ toast('Los estados los configuran la dueña o la administradora.', true); return; }
  const p = S.allProds.find(x => x.id === id); if (!p) return;
  S.panel = 'est';
  const sg = sugOf(p), pc = num(p.poco), ex = num(p.exceso), sid = esc(p.id);
  openPanel(`<div class="pn-h"><div><small>Estados por stock sugerido</small><h3>${esc(p.nombre)}</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="pn-b"><p class="lead">Elegí desde qué número aparece cada estado. Si dejás vacío <b>Poco stock</b>, es la mitad del sugerido; si dejás vacío <b>Exceso</b>, es más que el sugerido.</p>
    <form id="est-form" data-id="${sid}" novalidate><div class="frow">
      <div class="fld"><label for="es-sug">Stock sugerido</label><input id="es-sug" inputmode="decimal" autocomplete="off" value="${esc(fmtIn(sg))}" placeholder="—"></div>
      <div class="fld"><label for="es-poco">Poco stock hasta</label><input id="es-poco" inputmode="decimal" autocomplete="off" value="${esc(fmtIn(pc))}" placeholder="${esc(sg == null ? 'mitad' : fmtIn(Math.floor(sg) / 2))}"></div>
      <div class="fld"><label for="es-exc">Exceso desde más de</label><input id="es-exc" inputmode="decimal" autocomplete="off" value="${esc(fmtIn(ex))}" placeholder="${esc(sg == null ? 'sugerido' : fmtIn(sg))}"></div>
    </div></form>
    <div class="est-prev" id="es-prev">${estPrev(sg, pc, ex)}</div>
  </div>
  <div class="pn-f"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit" form="est-form" id="es-ok">${ic('save')}Guardar</button></div>`, 'dlg');
  setTimeout(() => $('#es-sug')?.focus(), 40);
}
function estLeer(sel){ const el = $(sel), raw = el.value.trim(); if (!raw){ el.classList.remove('bad'); return {v:null}; } const v = num(raw); const bad = v == null || v < 0 || !isHalf(v); el.classList.toggle('bad', bad); return bad ? {bad:true} : {v:round(v)}; }
function estRefresh(){ const pv = $('#es-prev'); if (!pv) return; const a = estLeer('#es-sug'), b = estLeer('#es-poco'), c = estLeer('#es-exc'); if (!a.bad && !b.bad && !c.bad) pv.innerHTML = estPrev(a.v, b.v, c.v); }
async function guardarEstados(id){
  if (!esTotal()) return;
  const p = S.allProds.find(x => x.id === id); if (!p) return;
  const a = estLeer('#es-sug'), b = estLeer('#es-poco'), c = estLeer('#es-exc');
  if (a.bad || b.bad || c.bad){ toast('Usá unidades enteras o medias (ej. 3 o 3,5).', true); return; }
  const sg = a.v, pc = b.v, ex = c.v;
  if (sg == null && (pc != null || ex != null)){ toast('Primero cargá el stock sugerido.', true); return; }
  if (sg != null && pc != null && pc >= sg){ $('#es-poco').classList.add('bad'); toast('Poco stock tiene que ser menor que el sugerido.', true); return; }
  if (sg != null && ex != null && ex < sg){ $('#es-exc').classList.add('bad'); toast('Exceso tiene que ser igual o mayor que el sugerido.', true); return; }
  try {
    await w(() => C('productos').doc(id).update({sugerido:sg, poco:pc, exceso:ex, actualizado:Date.now()}));
    if (S.sgEdit) delete S.sgEdit[id];
    closePanel(); toast(`Estados de ${p.nombre} guardados`);
  } catch(err){ fail(err); }
}
/* Observación por producto: un mensaje corto del gerente para la dueña. Se borra con Borrar datos. */
const fechaNota = ts => { const d = new Date(ts), z = n => String(n).padStart(2, '0'); return `${z(d.getDate())}/${z(d.getMonth() + 1)} ${z(d.getHours())}:${z(d.getMinutes())}`; };
const notaItem = (k, id) => (k === 'f' ? S.allFab : S.allProds).find(x => x.id === id);
function notaCell(x, k){ return `<div class="nw" id="nw-${k}-${esc(x.id)}">${notaInner(x, k)}</div>`; }
function notaInner(x, k){
  const key = k + ':' + x.id, id = esc(x.id), n = String(x.nota || '').trim();
  if (S.ntEdit && has(S.ntEdit, key)) return `<input class="cn" id="nt-${k}-${id}" data-nt="${esc(key)}" maxlength="200" autocomplete="off" enterkeyhint="done" value="${esc(S.ntEdit[key])}" placeholder="Mensaje para la dueña (opcional)" aria-label="Observación de ${esc(x.nombre)}">`;
  if (n){
    const meta = [x.notaPor, x.notaFecha ? fechaNota(x.notaFecha) : ''].filter(Boolean).join(' · ');
    const body = `${ic('msg')}<span class="nt-t">${esc(n)}${meta ? `<small>${esc(meta)}</small>` : ''}</span>`;
    return canW() ? `<button class="nt" data-act="nota" data-k="${k}" data-id="${id}" title="Tocá para cambiar o borrar la observación">${body}</button>` : `<span class="nt">${body}</span>`;
  }
  return canW() ? `<button class="addnote" data-act="nota" data-k="${k}" data-id="${id}">+ Observación</button>` : '';
}
function refreshNota(key){
  const k = key.slice(0, 1), id = key.slice(2), x = notaItem(k, id), el = document.getElementById(`nw-${k}-${id}`);
  if (el && x) el.innerHTML = notaInner(x, k);
}
function abrirNota(k, id){
  if (!needWrite()) return;
  const x = notaItem(k, id); if (!x) return;
  S.ntEdit = S.ntEdit || {}; S.ntEdit[k + ':' + id] = String(x.nota || '');
  refreshNota(k + ':' + id);
  const el = document.getElementById(`nt-${k}-${id}`); if (el){ el.focus(); const L = el.value.length; try { el.setSelectionRange(L, L); } catch {} }
}
async function cerrarNota(key, el){
  const k = key.slice(0, 1), id = key.slice(2), x = notaItem(k, id);
  const v = String(el.value || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (S.ntEdit) delete S.ntEdit[key];
  if (x && v !== String(x.nota || '').trim() && canW()){
    const patch = v ? {nota:v, notaPor:(S.me && S.me.name) || S.uid || null, notaFecha:Date.now()} : {nota:null, notaPor:null, notaFecha:null};
    try { await w(() => C(k === 'f' ? 'fabrica' : 'productos').doc(id).update(patch)); Object.assign(x, patch); toast(v ? 'Observación guardada' : 'Observación borrada'); } catch(e){ fail(e); }
  }
  refreshNota(key);
}
/* Borrar datos: deja la hoja lista para el día siguiente. Borra cantidades, Sin stock y observaciones; no toca productos, categorías ni stock sugerido. */
function pedirBorrar(){
  if (!needWrite()) return;
  const fab = isFabV(S.view), n = fab ? S.fab.length : S.prods.length;
  const que = fab ? 'las cantidades de <b>Local</b> y <b>Fábrica</b>' : 'las cantidades';
  openConfirm(`Borrar datos de ${nombreHoja(S.view)}`, `Se borran ${que}, las casillas <b>Sin stock</b> y las observaciones de ${plural(n, 'producto', 'productos')}, para volver a usar la hoja. <b>No se tocan</b> los productos, las categorías ni el stock sugerido. Los conteos ya guardados siguen en el Historial.`, 'Borrar datos', 'borrar-ok', true);
}
async function borrarDatos(){
  if (!needWrite()) return;
  const fab = isFabV(S.view), now = Date.now(), nom = nombreHoja(S.view);
  const btn = document.querySelector('#pn [data-act="borrar-ok"]'); if (btn){ btn.disabled = true; btn.textContent = 'Borrando…'; }
  const sinNota = {nota:null, notaPor:null, notaFecha:null};
  try {
    if (fab){
      const its = S.fab.filter(it => it.local != null || it.fabrica != null || it.sinStock || it.nota);
      await batchRun(its, it => C('fabrica').doc(it.id).update({local:null, fabrica:null, sinStock:false, ...sinNota, actualizado:now}));
      for (const it of its) Object.assign(it, {local:null, fabrica:null, sinStock:false, ...sinNota});
      clearFDraftCtx();
    } else {
      const ps = S.prods.filter(p => p.stock != null || p.sinStock || p.nota);
      await batchRun(ps, p => C('productos').doc(p.id).update({stock:null, sinStock:false, ...sinNota, actualizado:now}));
      for (const p of ps) Object.assign(p, {stock:null, sinStock:false, ...sinNota});
      clearDraftCtx();
    }
    S.ntEdit = {}; closePanel(); render(); toast(`Datos borrados en ${nom}`);
  } catch(e){ if (btn){ btn.disabled = false; btn.textContent = 'Borrar datos'; } fail(e); }
}
function openTotNombre(){
  const h = ingHoja(); if (!h || !esTotal()) return;
  S.panel = 'totn';
  openPanel(`<div class="pn-h"><div><small>${esc(h.nombre)}</small><h3>Nombre de la columna total</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="pn-b"><form id="tn-form" class="frow" novalidate><div class="fld wide"><label for="tn-nombre">Nombre (Local + Ingreso)</label><input id="tn-nombre" maxlength="30" value="${esc(totalNombre(h))}" autocomplete="off"></div></form></div>
  <div class="pn-f"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit" form="tn-form" id="tn-ok">${ic('save')}Guardar</button></div>`, 'dlg');
  setTimeout(() => $('#tn-nombre')?.select(), 40);
}
async function guardarTotNombre(){
  const h = ingHoja(); if (!h || !esTotal()) return;
  const v = limpiarNombre($('#tn-nombre').value).slice(0, 30) || 'Stock real';
  try { await guardarHoja(h.id, {total:v}); closePanel(); render(); toast(`La columna se llama «${v}»`); } catch(e){ fail(e); }
}
async function toggleSug(){
  if (!esTotal()){ toast('El stock sugerido lo activan la dueña o la administradora.', true); return; }
  const id = sugHoja(), on = !sugActivo();
  try { await guardarHoja(id, {sugerido:on}); render(); toast(`Stock sugerido ${on ? 'activado' : 'desactivado'} en ${nombreHoja(id)}`); } catch(e){ fail(e); }
}
async function guardarSugerido(id, el){
  if (!esTotal()){ toast('El sugerido lo cambian la dueña o la administradora.', true); return; }
  const p = S.allProds.find(x => x.id === id); if (!p) return;
  const raw = el.value.trim(); let v = num(raw);
  if (raw && (v == null || v < 0 || !isHalf(v))){ el.classList.add('bad'); toast('El sugerido va en unidades enteras o medias (ej. 3 o 3,5).', true); return; }
  el.classList.remove('bad'); v = raw ? round(v) : null;
  if (sugOf(p) === v){ if (S.sgEdit) delete S.sgEdit[id]; return; }
  try {
    await w(() => C('productos').doc(id).update({sugerido:v, actualizado:Date.now()}));
    if (S.sgEdit) delete S.sgEdit[id];
    el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 1000);
  } catch(err){ fail(err); }
}

V.conteo = () => {
  const head = `${banners()}${S.editing ? `<div class="editbar"><span>Estás corrigiendo el conteo del <b>${esc(fechaHora(S.editing.fecha))}</b>. Cambiá lo que haga falta y tocá Guardar conteo.</span><button class="btn sm" data-act="edit-cancel">Cancelar corrección</button></div>` : ''}<p class="lead">Contá cada producto por unidad: entero, medio (<b>+½</b>) o tildá <b>Sin stock</b>. Usá <b>=</b> si coincide con el sistema.</p>`;
  if (!S.loaded.p) return head + loadingList();
  if (!S.prods.length) return head + noProducts();
  const base = sorted().filter(p => catOK(p) && qOK(p));
  const list = base.filter(p => {
    if (S.cfiltro === 'todos') return true;
    const c = has(S.draft, p.id);
    if (S.cfiltro === 'sin') return !c;
    return c && S.draft[p.id] !== stockOf(p);
  });
  const fc = (k, l) => `<button class="chip" data-act="cfiltro" data-f="${k}" aria-pressed="${S.cfiltro === k}">${l}</button>`;
  return head + progHTML() + `<div class="tools"><div class="chips" role="group" aria-label="Filtro">${fc('todos','Todos')}${fc('sin','Sin contar')}${fc('dif','Con diferencia')}</div></div>
    ${tools('q-conteo', S.q, 'Buscar producto')}
    ${list.length ? sheet('conteo', list, rowConteo) : noMatch(S.cfiltro === 'sin' ? 'Ya contaste todo lo que se ve' : 'Nada para mostrar', S.cfiltro === 'sin' ? 'Tocá Guardar conteo para registrarlo.' : 'Probá con otra búsqueda o filtro.')}`;
};
function progHTML(){
  const n = S.prods.length, c = S.prods.filter(p => has(S.draft, p.id)).length, d = pendientes().length;
  const pc = n ? Math.round(c / n * 100) : 0;
  return `<div class="prog" id="cprog"><div class="prog-t">Contados <b>${c}</b> de <b>${n}</b> · ${d ? `<b>${d}</b> con cambios` : 'sin cambios todavía'}</div><span class="prog-p">${pc}%</span><div class="prog-b"><i style="width:${pc}%"></i></div></div>`;
}
function difInfo(p){
  if (!has(S.draft, p.id)) return {t:'', c:''};
  if (stockOf(p) == null) return {t:'Primer conteo', c:'eq'};
  const d = round(S.draft[p.id] - stockOf(p));
  if (d === 0) return {t:'Igual', c:'eq'};
  return {t:(d > 0 ? '+' : '−') + fmt(Math.abs(d)), c:d > 0 ? 'pos' : 'neg'};
}
function rowConteo(p){
  const st = estado(p), done = has(S.draft, p.id), di = difInfo(p), meta = metaTxt(p), id = esc(p.id), nota = S.notas[p.id], sys = stockOf(p), dis = canW() ? '' : 'disabled';
  return `<div class="sh-r ${st} ${done ? 'done' : ''}" id="cc-${id}">
    <span class="r-n">${S.rn.get(p.id) || ''}</span>
    <div class="r-ss">${ssBox(p,'cs')}</div>
    <div class="r-name"><b>${esc(p.nombre)}</b><small class="mo">Sistema: ${sys == null ? 'sin contar' : fmt(sys)}${meta ? ` · ${meta}` : ''}</small>${meta ? `<small class="dk">${meta}</small>` : ''}${p.obs ? `<small class="obs">${esc(p.obs)}</small>` : ''}
      <div id="cn-w-${id}">${nota != null ? `<input class="cn" id="cn-${id}" data-cn="${id}" value="${esc(nota)}" placeholder="Nota (ej. vence el viernes)" aria-label="Nota de ${esc(p.nombre)}">` : `<button class="addnote" data-act="addnote" data-id="${id}" ${dis}>+ Nota</button>`}</div>
    </div>
    <span class="r-sys">${sys == null ? '—' : fmt(sys)}</span>
    <div class="r-cnt"><div class="stp">
      <button data-act="cdec" data-id="${id}" aria-label="Restar 1" ${dis}>−</button>
      <input id="cq-${id}" data-cq="${id}" inputmode="decimal" autocomplete="off" placeholder="${sys == null ? 'Contar' : esc(fmtIn(sys))}" value="${done ? esc(fmtIn(S.draft[p.id])) : ''}" class="${done && S.draft[p.id] !== sys ? 'changed' : ''}" aria-label="Cantidad contada de ${esc(p.nombre)}" ${dis}>
      <button data-act="cinc" data-id="${id}" aria-label="Sumar 1" ${dis}>+</button>
      <button class="half" data-act="chalf" data-id="${id}" aria-label="Sumar media unidad" ${dis}>+½</button>
      <button class="eqb" data-act="ceq" data-id="${id}" aria-label="Igual al sistema" title="Igual al sistema" ${canW() && sys != null ? '' : 'disabled'}>=</button>
    </div></div>
    <div class="r-dif"><span class="dif ${di.c}" id="dif-${id}">${di.t}</span></div>
  </div>`;
}
function refreshCC(id){
  const p = S.prods.find(x => x.id === id); if (!p) return;
  const row = document.getElementById('cc-' + id); if (!row) return;
  const st = estado(p);
  row.classList.toggle('done', has(S.draft, id)); row.classList.remove('ok','bajo','sin','nc'); row.classList.add(st);
  const di = difInfo(p), d = document.getElementById('dif-' + id); if (d){ d.textContent = di.t; d.className = 'dif ' + di.c; }
  const inp = document.getElementById('cq-' + id); if (inp){ inp.classList.toggle('changed', has(S.draft, id) && S.draft[id] !== stockOf(p)); }
  const pr = $('#cprog'); if (pr) pr.outerHTML = progHTML();
  renderChrome();
}
function setCount(id, v){
  const p = S.prods.find(x => x.id === id); if (!p) return;
  v = Math.max(0, Math.round(v * 4) / 4); S.draft[id] = v; saveDraft();
  const inp = document.getElementById('cq-' + id); if (inp){ inp.value = fmtIn(v); inp.classList.remove('bad'); }
  refreshCC(id);
}

V.pedido = () => {
  const all = pedidoItems(), byProv = S.pedGrp === 'prov';
  const head = `${banners()}<div class="bar"><p class="lead">Productos sin stock o por debajo del mínimo. Ajustá la cantidad a pedir y copiá el pedido para mandarlo.</p>
    <div class="bar-a">${all.length ? `<button class="btn sm" data-act="print">${ic('print')}Imprimir</button>` : ''}${all.length ? `<button class="btn primary sm" data-act="copiar-pedido">${ic('copy')}Copiar pedido</button>` : ''}</div></div>`;
  if (!S.loaded.p) return head + loadingList();
  if (!S.prods.length) return head + noProducts();
  const sinMin = !S.prods.some(p => minOf(p) != null);
  const tip = sinMin ? `<div class="note warn tipmin"><span><b>Ningún producto tiene mínimo.</b> Cargalos y el pedido se arma solo con lo que queda por debajo.</span><button class="btn sm" data-act="aj-open" data-tab="rapido">Cargar mínimos y proveedores</button></div>` : '';
  const items = all.filter(x => catOK(x.p) && qOK(x.p));
  const byId = new Map(all.map(x => [x.p.id, x]));
  const pc = new Map(provs().map(([v], i) => [v, `var(--c${i % 6 + 1})`]));
  const grp = `<div class="seg pgrp" role="tablist" aria-label="Agrupar el pedido"><button role="tab" data-act="ped-grp" data-g="cat" aria-selected="${!byProv}">Por categoría</button><button role="tab" data-act="ped-grp" data-g="prov" aria-selected="${byProv}">Por proveedor</button></div>`;
  const opts = byProv ? {key:provKey, sort:provGroupSort, color:c => pc.get(c) || 'var(--muted)', extra:(c) => c === SINPROV ? '' : `<button class="btn sm" data-act="copiar-prov" data-prov="${esc(c)}">${ic('copy')}Copiar</button>`} : {};
  return head + tip + grp + tools('q-pedido', S.q, 'Buscar producto') +
    (items.length ? sheet('pedido', items.map(x => x.p), p => rowPedido(byId.get(p.id)), opts)
      : noMatch('Todo en orden', all.length ? 'Ningún producto de esta búsqueda o categoría para pedir.' : 'Ningún producto está sin stock ni por debajo del mínimo.'));
};
function rowPedido(x){
  const p = x.p, st = estado(p), m = minOf(p), id = esc(p.id);
  return `<div class="sh-r ${st}">
    <span class="r-n">${S.rn.get(p.id) || ''}</span>
    <div class="r-ss">${ssBox(p,'ps')}</div>
    <div class="r-name"><b>${esc(p.nombre)}</b><small class="mo">${p.sinStock ? 'Marcado sin stock' : `Hay ${fmt(x.base)}`}${m != null ? ` · mín ${fmt(m)}` : ''}</small>${S.pedGrp === 'prov' ? `<small>${esc(catOf(p))}</small>` : provOf(p) ? `<small>${esc(provOf(p))}</small>` : ''}${p.obs ? `<small class="obs">${esc(p.obs)}</small>` : ''}</div>
    <span class="r-hay">${p.sinStock ? '0' : fmt(x.base)}</span>
    <span class="r-min">${m != null ? fmt(m) : '—'}</span>
    <div class="r-ped"><div class="pst"><button data-act="pdec" data-id="${id}" aria-label="Pedir uno menos">−</button><input id="pq-${id}" data-pq="${id}" inputmode="decimal" value="${esc(fmtIn(x.v))}" aria-label="Cantidad a pedir de ${esc(p.nombre)}"><button data-act="pinc" data-id="${id}" aria-label="Pedir uno más">+</button></div></div>
  </div>`;
}
function pedidoTexto(prov){
  const items = pedidoItems().filter(x => prov == null || provKey(x.p) === prov); const d = new Date();
  const byProv = prov == null && S.pedGrp === 'prov';
  let t = `PEDIDO${prov ? ' · ' + prov : ''} · ${localNombre()}\n${fechaLarga()} ${d.getFullYear()}\n`;
  const gs = groups(items.map(x => x.p), byProv ? provKey : catOf); if (byProv) gs.sort(provGroupSort);
  for (const [c, ps] of gs){
    t += `\n${c.toUpperCase()}\n`;
    for (const p of ps){ const x = items.find(i => i.p.id === p.id); t += `- ${p.nombre}: ${x.v > 0 ? fmt(x.v) + ' ' + (uTxt(p) || (x.v === 1 ? 'unidad' : 'unidades')) : 'a definir'}${p.sinStock ? ' (sin stock)' : ''}\n`; }
  }
  return t.trim();
}

function fabCard(){
  const hf = hojaById('fabrica'); if (!hf || hf.oculta) return '';
  return withCtx('fabrica', () => {
    const its = fItems(), lf = lastFab();
    const conL = its.filter(it => fVal(it, 'l') != null).length, ing = its.filter(it => (fVal(it, 'f') || 0) > 0).length, sin = its.filter(fSin).length;
    return `<section class="card pad"><div class="ch"><h4>${esc(hf.nombre)}</h4><span class="num">${its.length} productos</span></div>
      <div class="lc"><span class="big">${lf ? esc(fechaHora(lf.fecha)) : 'Sin guardar todavía'}</span><small>${lf ? `${esc(whoName(lf))} · ${rel(lf.fecha)}` : 'Cargá Local y Fábrica y tocá Guardar conteo.'}</small></div>
      <div class="fsum"><div><span>Con local</span><b>${conL}</b></div><div><span>Ingresan mañana</span><b>${ing}</b></div><div><span>Sin stock</span><b style="color:${sin ? 'var(--crit)' : 'inherit'}">${sin}</b></div></div>
      <div class="bar-a" style="margin-top:14px"><button class="btn sm primary" data-go="fabrica">${ic('fab')}Abrir ${esc(hf.nombre)}</button></div></section>`;
  });
}
V.fabrica = () => {
  const its = fItems(), lf = lastFab(), d = new Date(), nom = nombreHoja(fabCtx());
  const hoy = d.toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit'});
  const manana = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit'});
  const IH = ingHoja(), TN = esc(totalNombre(IH));
  const head = `${banners()}<div class="bar"><p class="lead">${IH ? `El gerente carga lo que hay en el <b>Local</b>. El <b>Ingreso</b> se carga a mano o con <b>Ingresar remito</b> (foto o PDF). <b>${TN}</b> = Local + Ingreso, se calcula solo.` : `Cargá el stock del <b>Local</b> y lo que entra de <b>Fábrica</b> mañana. El <b>Total stock</b> se suma solo.`} Unidades enteras, medias o cuartos: tocá <b>− o +</b> para restar o sumar una unidad en Local e Ingreso/Fábrica. En Local usá también <b>¼ ½ ¾</b> o escribí 0,25 · 0,5 · 0,75.${canW() ? ' Tocá el nombre de un producto para modificarlo o eliminarlo.' : ''}</p>
    <div class="bar-a">${IH && esTotal() ? `<button class="btn sm primary" data-go="ingreso">${ic('in')}Ingresar remito</button><button class="btn sm" data-act="tot-nombre">${ic('edit')}Nombre de «${TN}»</button>` : ''}${its.length && canW() ? `<button class="btn sm" data-act="f-add-dlg">${ic('plus')}Agregar producto</button>` : ''}${its.length ? `<button class="btn sm" data-act="f-zero" ${canW() ? '' : 'disabled'}>${ic('zero')}Poner todo en 0</button>${canW() ? `<button class="btn sm danger" data-act="borrar">${ic('trash')}Borrar datos</button>` : ''}<button class="btn sm" data-act="print">${ic('print')}Imprimir</button><button class="btn sm primary" data-act="f-copy">${ic('copy')}Copiar planilla</button>` : ''}</div></div>`;
  if (!S.loaded.f) return head + loadingList();
  if (!its.length) return head + `<div class="xl"><div class="empty"><b>La planilla está vacía</b>Agregá los productos de ${esc(nom)} uno por uno o pegá la lista completa.<div class="bar-a"><button class="btn primary" data-act="f-add-dlg">${ic('plus')}Agregar productos</button><button class="btn" data-act="aj-open" data-tab="f-paste">Pegar lista</button></div></div></div>`;
  let rows = '', n = 0, prev = null;
  for (const it of its){
    const b = bloqueOf(it);
    if (b !== prev) rows += `<div class="xl-r xl-bq" data-bloque="${b}"><div class="xbq"><b>${esc(bloqueNombre(b))}</b>${canW() ? `<button class="btn sm" data-act="bq-edit" data-b="${b}" id="bq-e-${b}" aria-label="Nombre de ${esc(bloqueNombre(b))}">${ic('edit')}Nombre</button>` : ''}</div></div>`;
    prev = b; n++; rows += rowFab(it, n);
  }
  return head + `<div class="xl" role="table" aria-label="${esc(nom)}">
    <div class="xl-top"><b>Planilla<span class="num">${esc(hoy)}</span></b><small>${lf ? `Último guardado ${esc(fechaHora(lf.fecha))}` : 'Sin guardar todavía'} · <label class="ss" aria-hidden="true"><input type="checkbox" tabindex="-1"></label> = sin stock</small></div>
    <div class="xl-r xl-h" role="row"><span class="xn"></span><span class="xh-p">Producto</span>${IH ? `<span class="xh-t">${TN}<small>local + ingreso</small></span><span>Local<small>stock local</small></span><span class="xh-f">Ingreso<small>remitos</small></span>` : `<span class="xh-t">Total stock<small>local + fábrica</small></span><span>Local<small>stock local</small></span><span class="xh-f">Fábrica<small>ingreso mañana ${esc(manana)}</small></span>`}</div>
    ${rows}
    ${canW() ? `<div class="xl-add"><button class="btn sm" data-act="f-add-dlg">${ic('plus')}Agregar producto</button></div>` : ''}
  </div>`;
};
function rowFab(it, n){
  const id = esc(it.id), l = fVal(it, 'l'), f = fVal(it, 'f'), d = S.fdraft[it.id] || {}, dis = canW() ? '' : 'disabled';
  const chgL = has(d, 'l') && d.l !== num(it.local), chgF = has(d, 'f') && d.f !== num(it.fabrica);
  return `<div class="xl-r ${fSin(it) ? 'sin' : ''}" id="fr-${id}" role="row">
    <span class="xn">${n}</span>
    <span class="xp ${it.resaltar ? 'hl' : ''}"><label class="ss"><input type="checkbox" data-fss="${id}" ${fSin(it) ? 'checked' : ''} ${dis} aria-label="Sin stock: ${esc(it.nombre)}"><span>Sin stock</span></label><span class="xpn">${canW() ? `<button class="xpb" data-act="f-item" data-id="${id}" title="Modificar o eliminar"><b>${esc(it.nombre)}</b></button>` : `<b>${esc(it.nombre)}</b>`}${notaCell(it, 'f')}</span></span>
    <span class="xt"><small class="xl-mob-label">Total</small><strong id="ft-${id}">${fmt(fTot(it))}</strong></span>
    <span class="xc xcl"><small class="xl-mob-label">Local</small><span class="xl-stepper" role="group" aria-label="Ajustar Local de ${esc(it.nombre)}"><button type="button" data-act="fstep" data-id="${id}" data-field="l" data-delta="-1" aria-label="Restar 1 a Local de ${esc(it.nombre)}" ${!canW() || !(l > 0) ? 'disabled' : ''}>−</button><input id="fl-${id}" data-fl="${id}" inputmode="decimal" autocomplete="off" value="${esc(fmtIn(l))}" placeholder="0" class="${chgL ? 'chg' : ''}" aria-label="Local de ${esc(it.nombre)}" ${dis}><button type="button" data-act="fstep" data-id="${id}" data-field="l" data-delta="1" aria-label="Sumar 1 a Local de ${esc(it.nombre)}" ${dis}>+</button></span>${fracFab(it, l)}</span>
    <span class="xc fab"><small class="xl-mob-label">${ingHoja() ? 'Ingreso' : 'Fábrica'}</small><span class="xl-stepper" role="group" aria-label="Ajustar ${ingHoja() ? 'Ingreso' : 'Fábrica'} de ${esc(it.nombre)}"><button type="button" data-act="fstep" data-id="${id}" data-field="f" data-delta="-1" aria-label="Restar 1 a ${ingHoja() ? 'Ingreso' : 'Fábrica'} de ${esc(it.nombre)}" ${!canW() || !(f > 0) ? 'disabled' : ''}>−</button><input id="ff-${id}" data-ff="${id}" inputmode="decimal" autocomplete="off" value="${esc(fmtIn(f))}" placeholder="0" class="${chgF ? 'chg' : ''}" aria-label="${ingHoja() ? 'Ingreso' : 'Fábrica'} de ${esc(it.nombre)}" ${dis}><button type="button" data-act="fstep" data-id="${id}" data-field="f" data-delta="1" aria-label="Sumar 1 a ${ingHoja() ? 'Ingreso' : 'Fábrica'} de ${esc(it.nombre)}" ${dis}>+</button></span></span>
  </div>`;
}
/* ¼ ½ ¾ debajo de Local: eligen la fracción (tocar la misma otra vez la saca) */
function fracFab(it, l){
  const id = esc(it.id), fr = fracOf(l), dis = canW() ? '' : 'disabled';
  return `<span class="fq" role="group" aria-label="Fracción de Local de ${esc(it.nombre)}">${[[1, '¼'], [2, '½'], [3, '¾']].map(([k, t]) => `<button id="ffq${k}-${id}" data-act="ffrac" data-id="${id}" data-f="${k / 4}" aria-pressed="${Math.abs(fr - k / 4) < 1e-9}" aria-label="${t} en Local de ${esc(it.nombre)}" ${dis}>${t}</button>`).join('')}</span>`;
}
/* Agregar, modificar o eliminar productos desde la misma planilla */
function fBloqueOpts(sel){
  const bs = bloques(), last = bs.length ? bs[bs.length - 1] : 1, v = sel ?? last;
  return `${(bs.length ? bs : [1]).map(b => `<option value="${b}" ${b === v ? 'selected' : ''}>${esc(bloqueNombre(b))}</option>`).join('')}<option value="${last + 1}">Bloque nuevo (${last + 1})</option>`;
}
const fDlgHead = t => `<div class="pn-h"><div><small>${esc(nombreHoja(fabCtx()))}</small><h3>${t}</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>`;
function openFAdd(){
  if (!needWrite()) return;
  S.panel = 'fadd';
  openPanel(`${fDlgHead('Agregar producto')}<div class="pn-b"><form id="afa-form" class="frow" novalidate>
    <div class="fld wide"><label for="afa-nombre">Nombre del producto</label><input id="afa-nombre" required autocomplete="off" placeholder="Ej. Caja Ketchup"></div>
    <div class="fld"><label for="afa-bloque">Bloque</label><select id="afa-bloque">${fBloqueOpts()}</select></div>
    <label class="fld fchk"><input type="checkbox" id="afa-hl"><span>Resaltar en amarillo</span></label>
  </form><p class="lead" style="margin:0">Podés agregar varios seguidos: después de cada uno queda listo para el próximo. Para pegar una lista entera, usá Ajustes → Pegar lista.</p></div>
  <div class="pn-f"><button class="btn" data-act="close">Listo</button><button class="btn primary" type="submit" form="afa-form" id="afa-ok">${ic('plus')}Agregar</button></div>`, 'dlg');
  setTimeout(() => $('#afa-nombre')?.focus(), 40);
}
function openFEdit(id, del){
  if (!needWrite()) return;
  const it = S.fab.find(x => x.id === id); if (!it) return;
  S.panel = 'fedit'; const sid = esc(id);
  if (del){
    openPanel(`${fDlgHead('Eliminar producto')}<div class="pn-b"><p class="lead" style="margin:0">¿Eliminar <b>${esc(it.nombre)}</b> de la planilla? Los conteos ya guardados lo siguen mostrando en el Historial.</p></div>
    <div class="pn-f"><button class="btn" data-act="f-item" data-id="${sid}">Cancelar</button><button class="btn danger solid" data-act="af-del-ok" data-id="${sid}" id="afd-ok">${ic('trash')}Eliminar</button></div>`, 'dlg');
    return;
  }
  openPanel(`${fDlgHead('Modificar producto')}<div class="pn-b"><form id="afe-form" data-id="${sid}" class="frow" novalidate>
    <div class="fld wide"><label for="afe-nombre">Nombre</label><input id="afe-nombre" value="${esc(it.nombre)}" required autocomplete="off"></div>
    <div class="fld"><label for="afe-bloque">Bloque</label><select id="afe-bloque">${fBloqueOpts(bloqueOf(it))}</select></div>
    <label class="fld fchk"><input type="checkbox" id="afe-hl" ${it.resaltar ? 'checked' : ''}><span>Resaltar en amarillo</span></label>
  </form></div>
  <div class="pn-f"><button class="btn danger" data-act="f-del-ask" data-id="${sid}" id="afe-del" style="margin-right:auto">${ic('trash')}Eliminar</button><button class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit" form="afe-form" id="afe-ok">${ic('save')}Guardar</button></div>`, 'dlg');
  setTimeout(() => $('#afe-nombre')?.focus(), 40);
}
function refreshF(id){
  const it = S.fab.find(x => x.id === id); if (!it) return;
  const t = document.getElementById('ft-' + id); if (t) t.textContent = fmt(fTot(it));
  const d = S.fdraft[id] || {};
  const li = document.getElementById('fl-' + id); if (li) li.classList.toggle('chg', has(d, 'l') && d.l !== num(it.local));
  const fi = document.getElementById('ff-' + id); if (fi) fi.classList.toggle('chg', has(d, 'f') && d.f !== num(it.fabrica));
  const row = document.getElementById('fr-' + id); if (row) row.classList.toggle('sin', fSin(it));
  const fr = fracOf(fVal(it, 'l')); if (row) row.querySelectorAll('[data-act="ffrac"]').forEach(b => b.setAttribute('aria-pressed', Math.abs(fr - +b.dataset.f) < 1e-9));
  const cb = row && row.querySelector('[data-fss]'); if (cb) cb.checked = fSin(it);
  if (row) row.querySelectorAll('[data-act="fstep"][data-delta="-1"]').forEach(b => {
    b.disabled = !canW() || !((fVal(it, b.dataset.field === 'f' ? 'f' : 'l') ?? 0) > 0);
  });
  renderChrome();
}
function setF(id, k, v){
  const it = S.fab.find(x => x.id === id); if (!it) return;
  const d = S.fdraft[id] || (S.fdraft[id] = {}); d[k] = v;
  const base = num(k === 'l' ? it.local : it.fabrica);
  if (d[k] === base) delete d[k];
  if (!Object.keys(d).length) delete S.fdraft[id];
  saveDraft();
}
function openSaveF(){
  if (!needWrite()) return;
  const pend = fPend(); S.panel = 'save';
  const lista = pend.length ? `<div class="sum">${pend.map(it => `<div><span>${esc(it.nombre)}</span><span class="num">L ${fmt(fVal(it,'l') ?? 0)} + F ${fmt(fVal(it,'f') ?? 0)} = <b class="dif eq" style="font-family:var(--f-num);font-size:13px">${fmt(fTot(it))}</b></span></div>`).join('')}</div>`
    : `<p class="note">No cambiaste ninguna fila. Se guarda igual la planilla completa con fecha y hora, como control.</p>`;
  openPanel(`<div class="pn-h"><div><small>${esc(nombreHoja(fabCtx()))}</small><h3>Guardar conteo</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="pn-b">${pend.length ? `<p class="lead">${pend.length === 1 ? 'Esta fila cambia:' : `Estas ${pend.length} filas cambian:`}</p>` : ''}${lista}<p class="lead">Se guardan las ${S.fab.length} filas de la planilla en el Historial.</p></div>
  <div class="pn-f"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" id="sv-ok" data-act="save-f-ok">${ic('save')}Guardar conteo</button></div>`, 'dlg');
  setTimeout(() => $('#sv-ok')?.focus(), 40);
}
async function doSaveF(v = S.view){
  if (S.offline){ queueSave(v, true); return; }
  const btn = $('#sv-ok'); if (btn){ btn.disabled = true; btn.textContent = 'Guardando…'; }
  const now = Date.now();
  const plan = withCtx(v, () => {
    const pend = fPend(), pids = new Set(pend.map(it => it.id)), hoja = fabCtx();
    const ups = pend.map(it => { const l = fVal(it, 'l'), f = fVal(it, 'f'); return {id:it.id, data:{local:l, fabrica:f, sinStock:l != null ? l === 0 : !!it.sinStock, actualizado:now}}; });
    const filas = fItems().map(it => ({pid:it.id, nombre:it.nombre || '', bloque:bloqueOf(it), local:fVal(it, 'l'), fabrica:fVal(it, 'f'), total:fTot(it), sin:fSin(it), cambio:pids.has(it.id)}));
    return {n:pend.length, ups, filas, hoja, nom:nombreHoja(hoja)};
  });
  try {
    await batchRun(plan.ups, u => C('fabrica').doc(u.id).update(u.data));
    await w(() => C('conteos').add({tipo:'fabrica', fecha:now, autor:S.uid || null, responsable:'', nota:'', hoja:plan.hoja, nombreHoja:plan.nom, filas:plan.filas, cambiadas:plan.n, total:plan.filas.length, sinStock:plan.filas.filter(x => x.sin).map(x => x.nombre)}));
    withCtx(v, clearFDraftCtx); if (S.queued && S.queued.view === v){ S.queued = null; localStorage.removeItem(queuedKey()); }
    if (S.panel === 'save') closePanel(); render();
    toast(`${plan.nom} guardado${plan.n ? ` · ${plural(plan.n, 'fila', 'filas')}` : ''}`);
  } catch(e){
    if (btn){ btn.disabled = false; btn.textContent = 'Guardar conteo'; }
    if (!navigator.onLine){ S.offline = true; queueSave(v, true); } else fail(e);
  }
}
/* Sin internet: conserva el borrador hasta que la persona confirme guardarlo con conexión. */
function queueSave(v, fab){
  S.queued = {view:v, fab:!!fab};
  if (S.local && (S.uid || S.me?.email)) lsSet(queuedKey(), S.queued);
  saveDraft(); // el borrador persiste aunque se cierre la aplicación
  if (S.panel === 'save') closePanel();
  render();
  toast('Sin conexión: borrador guardado en este equipo. Si cerrás la app, al volver revisá y guardá el conteo.', true);
}
function onOnline(){
  if (!S.offline) return;
  const q = S.queued;
  S.offline = false; render();
  if (q && S.db) toast('Volvió internet. Tu borrador sigue pendiente: revisalo y tocá Guardar conteo.');
  else toast('Volvió la conexión');
}
function onOffline(){ if (S.offline) return; S.offline = true; render(); toast('Sin internet. Podés seguir cargando: queda guardado en este equipo.', true); }
window.addEventListener('online', onOnline);
window.addEventListener('offline', onOffline);
window.addEventListener('pagehide', saveDraft);
function fabTexto(){
  const d = new Date();
  const man = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit'});
  const IH = ingHoja();
  let t = `${nombreHoja(fabCtx()).toUpperCase()} · ${localNombre()} ${d.toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit'})}\n${IH ? `Producto: ${totalNombre(IH).toLowerCase()} (local + ingreso)` : `Producto: total (local + fábrica, ingreso ${man})`}\n`;
  let prev = null;
  for (const it of fItems()){ const b = bloqueOf(it); if (b !== prev){ t += `${prev != null ? '\n' : ''}${bloqueNombre(b).toUpperCase()}\n`; } prev = b; t += `- ${it.nombre}: ${fmt(fTot(it))} (${fmt(fVal(it,'l') ?? 0)} + ${fmt(fVal(it,'f') ?? 0)})${fSin(it) ? ' · sin stock' : ''}\n`; }
  return t.trim();
}
async function toggleFSS(id, val, el){
  if (!needWrite()){ el.checked = !val; return; }
  const it = S.fab.find(x => x.id === id); if (!it) return;
  if (val) setF(id, 'l', 0);
  else if (fVal(it, 'l') === 0) setF(id, 'l', null);
  const inp = document.getElementById('fl-' + id); if (inp) inp.value = fmtIn(fVal(it, 'l'));
  refreshF(id);
  try { await w(() => C('fabrica').doc(id).update({sinStock:val})); toast(val ? `${it.nombre}: sin stock` : `${it.nombre}: vuelve a tener stock`); }
  catch(e){ el.checked = !val; fail(e); }
}

/* Filtros del Historial: por hoja (los datos de Stock y Conteo son los mismos) y por período */
const histKey = c => c.tipo === 'fabrica' ? (c.hoja || 'fabrica') : isCustom(c.hoja) ? c.hoja : 'principal';
function histKeyLabel(k){
  if (k === 'principal') return `${nombreHoja('stock')} y ${nombreHoja('conteo')}`;
  if (isBase(k)) return nombreHoja(k);
  const h = S.hojasDB.find(x => x.id === k); if (h) return nombreHoja(k);
  const c = S.conteos.find(x => histKey(x) === k); return (c && c.nombreHoja ? c.nombreHoja : 'Hoja') + ' (borrada)';
}
const PERIODOS = [['todo','Todas las fechas'], ['hoy','Hoy'], ['ayer','Ayer'], ['7','Últimos 7 días'], ['30','Últimos 30 días'], ['mes','Este mes'], ['mesant','Mes pasado']];
function enPeriodo(ts, per){
  if (!per || per === 'todo') return true;
  const now = new Date(), d = new Date(ts), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), dia = 864e5;
  if (per === 'hoy') return ts >= d0;
  if (per === 'ayer') return ts >= d0 - dia && ts < d0;
  if (per === '7') return ts >= d0 - 6 * dia;
  if (per === '30') return ts >= d0 - 29 * dia;
  if (per === 'mes') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (per === 'mesant'){ const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getFullYear() === pm.getFullYear() && d.getMonth() === pm.getMonth(); }
  return true;
}
function histList(){
  const q = norm(S.histQ);
  return S.conteos.filter(c => (!S.histHoja || histKey(c) === S.histHoja) && enPeriodo(c.fecha, S.histPer)
    && (!q || (c.cambios || c.filas || []).some(x => norm(x.nombre).includes(q)) || norm(whoName(c)).includes(q) || norm(c.nota).includes(q)));
}
V.historial = () => {
  const head = `${banners()}<div class="bar"><p class="lead">Cada vez que se toca Guardar conteo queda registrado acá, con fecha, hora y qué cambió.</p></div>`;
  if (!S.loaded.c) return head + loadingList();
  if (!S.conteos.length) return head + noMatch('Todavía no hay conteos guardados', 'Cuando alguien toque Guardar conteo en cualquier hoja, aparece acá.');
  const q = norm(S.histQ), list = histList();
  const keys = [...new Set(S.conteos.map(histKey))].map(k => [k, histKeyLabel(k)]).sort((a,b) => a[1].localeCompare(b[1], 'es'));
  const filtrado = S.histHoja || S.histPer !== 'todo' || q;
  return head + `<div class="tools hist-f"><div class="search">${ic('search')}<input id="q-hist" type="search" placeholder="Buscar por producto o persona" value="${esc(S.histQ)}" autocomplete="off" aria-label="Buscar por producto o persona"></div>
      <div class="fld"><select id="h-hoja" aria-label="Hoja"><option value="">Todas las hojas</option>${keys.map(([k, l]) => `<option value="${esc(k)}" ${S.histHoja === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="fld"><select id="h-per" aria-label="Período">${PERIODOS.map(([k, l]) => `<option value="${k}" ${S.histPer === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    ${filtrado ? `<div class="hist-n"><span>${plural(list.length, 'conteo', 'conteos')}${list.length !== S.conteos.length ? ` de ${S.conteos.length}` : ''}</span><button class="btn sm ghost" data-act="hist-clear">Sacar filtros</button></div>` : ''}` +
    (list.length ? `<div class="hlist">${list.slice(0, S.histN).map(c => histCard(c, q)).join('')}</div>${list.length > S.histN ? `<div class="bar-a" style="justify-content:center;margin-top:14px"><button class="btn" data-act="hist-more">Ver más conteos</button></div>` : ''}`
      : noMatch('Sin resultados', 'No hay conteos con estos filtros.'));
};
function histCardF(c, q){
  const fl = c.filas || [], open = !!S.histOpen[c.id] || (!!q && fl.some(x => norm(x.nombre).includes(q)));
  const shown = q ? fl.filter(x => norm(x.nombre).includes(q)) : fl, d = new Date(c.fecha);
  const dia = d.toLocaleDateString('es-AR', {day:'2-digit'}), mes = d.toLocaleDateString('es-AR', {month:'short'}).replace('.', '');
  const ing = fl.filter(x => (x.fabrica || 0) > 0).length, sinN = fl.filter(x => x.sin).length;
  return `<article class="card hc" id="hc-${esc(c.id)}">
    <div class="hc-h"><div class="hc-d" style="background:var(--fab-bg);color:var(--fab-ink)"><b>${esc(dia)}</b><small style="color:inherit">${esc(mes)}</small></div>
      <div class="hc-m"><b>${esc(hojaLabel(c, 'Conteo Fábrica'))} de las ${esc(horaCorta(c.fecha))}</b><small>${esc(whoName(c))} · ${plural(fl.length, 'fila', 'filas')}${c.cambiadas ? ` · ${c.cambiadas} cambiadas` : ''}</small></div>
      <div class="hc-k"><span class="pill ok">${ing} ingresan mañana</span>${sinN ? `<span class="pill crit">${sinN} sin stock</span>` : ''}</div></div>
    ${open ? `<div class="hc-t"><div class="mv hd mvf"><div>Producto</div><span>Local</span><span>Fábrica</span><span>Total</span></div>${shown.map(x => `<div class="mv mvf"><div><b style="${x.sin ? 'color:var(--crit)' : ''}">${esc(x.nombre)}</b></div><span>${fmt(x.local ?? 0)}</span><span>${fmt(x.fabrica ?? 0)}</span><span><b>${fmt(x.total)}</b></span></div>`).join('')}</div>` : ''}
    <div class="hc-a"><button class="btn sm" data-act="hist-toggle" data-id="${esc(c.id)}">${open ? 'Ocultar planilla' : 'Ver planilla'}</button></div>
  </article>`;
}
function histCard(c, q){
  if (c.tipo === 'fabrica') return histCardF(c, q);
  const ch = c.cambios || [], open = !!S.histOpen[c.id] || (!!q && ch.some(x => norm(x.nombre).includes(q)));
  const isLast = lastStock() && lastStock().id === c.id;
  const shown = q ? ch.filter(x => norm(x.nombre).includes(q)) : ch;
  const sinN = (c.sinStock || []).length, d = new Date(c.fecha);
  const dia = d.toLocaleDateString('es-AR', {day:'2-digit'}), mes = d.toLocaleDateString('es-AR', {month:'short'}).replace('.', '');
  return `<article class="card hc" id="hc-${esc(c.id)}">
    <div class="hc-h"><div class="hc-d"><b>${esc(dia)}</b><small>${esc(mes)}</small></div>
      <div class="hc-m"><b>Conteo de las ${esc(horaCorta(c.fecha))}${c.modificado ? '<span class="tagmod">Corregido</span>' : ''}</b><small>${esc(whoName(c))} · desde ${esc(hojaLabel(c, 'Conteo'))}${c.contados ? ` · ${c.contados} contados` : ''}</small></div>
      <div class="hc-k"><span class="pill ${ch.length ? 'acc' : ''}">${plural(ch.length, 'cambio', 'cambios')}</span>${sinN ? `<span class="pill crit">${sinN} sin stock</span>` : ''}</div></div>
    ${c.nota ? `<p class="hc-n">${esc(c.nota)}</p>` : ''}
    ${open ? `<div class="hc-t">${shown.length ? `<div class="mv hd"><div>Producto</div><span class="m-a">Antes</span><span>Después</span><span>Dif.</span></div>${shown.map(mvRow).join('')}` : `<div class="mv"><div><b>Sin diferencias</b><small>El conteo coincidió con el stock.</small></div></div>`}${sinN ? `<div class="mv"><div><b style="color:var(--crit)">Sin stock en ese momento</b><small>${esc((c.sinStock||[]).join(', '))}</small></div></div>` : ''}</div>` : ''}
    <div class="hc-a"><button class="btn sm" data-act="hist-toggle" data-id="${esc(c.id)}">${open ? 'Ocultar detalle' : 'Ver detalle'}</button>${isLast && canW() ? `<button class="btn sm" data-act="corregir" data-id="${esc(c.id)}">${ic('edit')}Corregir</button>` : ''}</div>
  </article>`;
}
function mvRow(x){
  const d = round((x.despues ?? 0) - (x.antes ?? 0));
  return `<div class="mv"><div><b>${esc(x.nombre)}</b><small>${esc(x.cat || 'Sin categoría')}</small>${x.nota ? `<small class="obs">${esc(x.nota)}</small>` : ''}</div><span class="m-a">${x.antes == null ? '—' : fmt(x.antes)}</span><span>${fmt(x.despues)}</span><span><span class="dif ${x.antes == null ? 'eq' : d > 0 ? 'pos' : d < 0 ? 'neg' : 'eq'}">${x.antes == null ? 'Nuevo' : d === 0 ? 'Nota' : (d > 0 ? '+' : '−') + fmt(Math.abs(d))}</span></span></div>`;
}

/* ---------- Equipo / Compartir ---------- */
/* Roles: Administradora (aprueba y asigna), Dueño (todos los locales), Gerente (carga y guarda en sus locales), Solo ver */
const ROL = {creadora:['Administradora','acc'], dueno:['Dueño','acc'], gerente:['Gerente','ok'], editor:['Gerente','ok'], lectura:['Solo ver','']};
const rolLabel = r => (ROL[r] || ROL.gerente)[0];
const RANGO = {creadora:0, dueno:1, gerente:2, editor:2, lectura:3};
function equipoList(){
  const list = [...S.equipo];
  return list.sort((a,b) => (RANGO[a.rol] ?? 9) - (RANGO[b.rol] ?? 9) || (a.agregado || 0) - (b.agregado || 0));
}
const fijo = e => ['creadora', 'dueno'].includes(ROLN(e.rol));
const localesTxt = e => fijo(e) ? 'Todos los locales' : ((e.locales || []).filter(id => S.localesDB.some(l => l.id === id)).map(localNombre).join(' · ') || 'Sin local asignado');
function locChecks(attr, sel, dis){
  return `<div class="lchk" role="group" aria-label="Locales">${localesTodos().map(l => `<label><input type="checkbox" ${attr} data-loc="${esc(l.id)}" ${sel.includes(l.id) ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${esc(l.nombre)}</span></label>`).join('')}</div>`;
}
const rolSelect = (attr, rol) => `<select class="rolsel" ${attr}><option value="gerente" ${ROLN(rol) !== 'lectura' ? 'selected' : ''}>Gerente</option><option value="lectura" ${ROLN(rol) === 'lectura' ? 'selected' : ''}>Solo ver</option></select>`;
function equipoRows(actions){
  if (S.db && !S.loaded.e) return `<p class="lead" style="margin:0">Cargando…</p>`;
  return equipoList().map(e => {
    const r = ROL[ROLN(e.rol)] || ROL.gerente, confirm = actions && S.eqDel === e.id, edita = actions && puedeAdministrarEquipo() && !fijo(e) && !e._local, id = esc(e.id);
    const info = edita
      ? `<div class="eq-ed">${rolSelect(`data-rolsel="${id}" aria-label="Rol de ${esc(e.email)}"`, e.rol)}${locChecks(`data-eqloc="${id}"`, e.locales || [], false)}</div>`
      : `<small><span class="pill ${r[1]}">${r[0]}</span><span class="eq-l">${esc(localesTxt(e))}</span></small>`;
    const acts = !actions ? '' : `<div class="eq-a">${confirm ? `<button class="btn sm" data-act="eq-del-no">No</button><button class="btn sm danger solid" data-act="eq-del-ok" data-id="${id}">Quitar</button>` : `<button class="ib" data-act="copy" data-text="${esc(e.email)}" aria-label="Copiar ${esc(e.email)}" title="Copiar email">${ic('copy')}</button>${edita ? `<button class="ib danger" data-act="eq-del" data-id="${id}" aria-label="Quitar ${esc(e.email)}" title="Quitar del equipo">${ic('trash')}</button>` : ''}`}</div>`;
    return `<div class="eq-r ${fijo(e) ? 'creadora' : ''}"><span class="av">${esc((e.email || '?').charAt(0))}</span><div style="min-width:0"><div class="em">${esc(e.email)}</div>${info}</div>${acts}</div>`;
  }).join('');
}
function solRows(){
  if (!isCreadora() || !S.sol.length) return '';
  const solo = localesTodos().length === 1 ? [localesTodos()[0].id] : [];
  return `<div class="note warn" style="margin:0;display:grid;gap:4px"><b>${plural(S.sol.length, 'pedido de acceso pendiente', 'pedidos de acceso pendientes')}</b><span>Elegí el rol y el local de cada persona y aprobala.</span></div>
  <div class="eq">${S.sol.map(x => { const id = esc(x.id); return `<div class="eq-r sol"><span class="av">${esc((x.email || '?').charAt(0))}</span><div style="min-width:0"><div class="em">${esc(x.email)}</div><small>${x.nombre ? esc(x.nombre) + ' · ' : ''}${x.proveedor === 'google' ? 'Google · ' : ''}${x.fecha ? rel(x.fecha) : ''}</small>
    <div class="eq-ed">${rolSelect(`id="sol-rol-${id}" aria-label="Rol para ${esc(x.email)}"`, 'gerente')}${locChecks(`data-solloc="${id}"`, solo, false)}</div></div>
    <div class="eq-a sol-a"><button class="btn sm primary" data-act="sol-ok" data-id="${id}">Aprobar</button><button class="btn sm" data-act="sol-no" data-id="${id}">Rechazar</button></div></div>`; }).join('')}</div>`;
}
const checkedLocs = attr => [...document.querySelectorAll(`[${attr}]:checked`)].map(x => x.dataset.loc);
async function aprobar(id){
  if (!isCreadora()) return;
  const x = S.sol.find(s => s.id === id); if (!x) return;
  const sel = document.getElementById('sol-rol-' + id), rol = sel && sel.value === 'lectura' ? 'lectura' : 'gerente';
  const locales = checkedLocs(`data-solloc="${CSS.escape(id)}"`);
  if (!locales.length){ toast('Elegí al menos un local para esta persona.', true); return; }
  try {
    await w(() => S.db.collection('equipo').doc(docIdFromEmail(x.email)).set({email:x.email, rol, locales, agregado:Date.now(), por:S.uid || null}));
    await w(() => S.db.collection('solicitudes').doc(id).delete());
    toast(`${x.email} aprobado: ${rolLabel(rol)} en ${locales.map(localNombre).join(' y ')}`);
  } catch(e){ fail(e); }
}
async function rechazar(id){
  if (!isCreadora()) return;
  const x = S.sol.find(s => s.id === id);
  try { await w(() => S.db.collection('solicitudes').doc(id).delete()); toast(`Pedido de ${x ? x.email : 'acceso'} rechazado`); } catch(e){ fail(e); }
}
async function cambiarRol(id, rol){
  if (!puedeAdministrarEquipo()) return;
  const e = S.equipo.find(x => x.id === id); if (!e || fijo(e)) return;
  try { await w(() => S.db.collection('equipo').doc(id).update({rol})); toast(`${e.email}: ${rolLabel(rol)}`); } catch(err){ fail(err); }
}
async function cambiarLocales(id){
  if (!puedeAdministrarEquipo()) return;
  const e = S.equipo.find(x => x.id === id); if (!e || fijo(e)) return;
  const locales = checkedLocs(`data-eqloc="${CSS.escape(id)}"`);
  try { await w(() => S.db.collection('equipo').doc(id).update({locales})); toast(locales.length ? `${e.email}: ${locales.map(localNombre).join(' y ')}` : `${e.email} quedó sin local: no va a poder ver ninguna planilla`, !locales.length); } catch(err){ fail(err); }
}
function refreshShare(){ const l = $('#eq-list'); if (l) l.innerHTML = equipoRows(true); const sl = $('#sol-list'); if (sl) sl.innerHTML = solRows(); }
function openShare(){
  S.panel = 'share'; S.eqDel = null;
  const adm = puedeAdministrarEquipo();
  openPanel(`<div class="pn-h"><div><small>GestLok</small><h3>Equipo</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="pn-b">
    <p class="lead">Solo entran los emails de esta lista. El <b>Dueño</b> ve y edita todos los locales. Cada <b>Gerente</b> carga y guarda en los locales que tenga asignados; <b>Solo ver</b> mira sin cambiar nada. ${adm ? 'Quien entra y no está en la lista queda <b>Pendiente</b> hasta que lo apruebes acá con su rol y su local.' : `La lista la maneja la administradora.`}</p>
    ${adm ? `<form id="eq-form" class="eq-add" novalidate>
      <div class="frow"><div class="fld wide"><label for="eq-email">Email</label><input id="eq-email" type="email" inputmode="email" autocomplete="email" placeholder="nombre@gmail.com" required></div>
      <div class="fld"><label for="eq-rol">Rol</label><select id="eq-rol"><option value="gerente">Gerente</option><option value="lectura">Solo ver</option></select></div></div>
      <div class="fld"><label>Local</label>${locChecks('data-newloc', localesTodos().length === 1 ? [localesTodos()[0].id] : [], false)}</div>
      <div class="bar-a" style="justify-content:flex-end"><button class="btn primary" type="submit">${ic('userplus')}Agregar al equipo</button></div>
    </form>` : ''}
    <div id="sol-list" style="display:grid;gap:10px">${solRows()}</div>
    <div class="eq" id="eq-list">${equipoRows(true)}</div>
    <div class="fld"><label>Enlace de la app</label><div class="linkrow"><code>${esc(APP_URL)}</code><button class="btn sm" data-act="copy" data-text="${esc(APP_URL)}">${ic('copy')}Copiar</button></div></div>
  </div>`, 'dlg');
  if (adm) setTimeout(() => $('#eq-email')?.focus(), 40);
}
async function addEquipo(email, rol){
  email = email.trim().toLowerCase();
  if (!emailOK(email)){ toast('Revisá el email: falta el @ o el dominio.', true); return; }
  if (!puedeAdministrarEquipo()){ toast('Solo la creadora o el dueño puede agregar personas al equipo.', true); return; }
  if (equipoList().some(e => String(e.email || '').toLowerCase() === email)){ toast('Ese email ya está en el equipo.'); return; }
  const locales = checkedLocs('data-newloc');
  if (!locales.length){ toast('Elegí al menos un local.', true); return; }
  rol = rol === 'lectura' ? 'lectura' : 'gerente';
  try {
    await w(() => S.db.collection('equipo').doc(docIdFromEmail(email)).set({email, rol, locales, agregado:Date.now(), por:S.uid || null}));
    $('#eq-email').value = ''; document.querySelectorAll('[data-newloc]').forEach(x => { x.checked = false; });
    toast(`${email} agregado como ${rolLabel(rol)}. Ya puede crear su cuenta y entrar.`);
  } catch(e){ fail(e); }
}

/* ---------- Pantalla Locales (inicio del Dueño y de quien tiene más de un local) ---------- */
function estadoGuardado(p){ if (p.sinStock) return 'sin'; const q = stockOf(p); if (q == null) return 'nc'; if (q <= 0) return 'sin'; const m = minOf(p); return m != null && q < m ? 'bajo' : 'ok'; }
function hubStats(id){
  const h = S.hub[id] || {}, ps = (h.prods || []).filter(p => !p.hoja);
  const c = {ok:0, bajo:0, sin:0, nc:0}; ps.forEach(p => c[estadoGuardado(p)]++);
  return {...c, n:ps.length, cats:new Set(ps.map(catOf)).size, ped:c.sin + c.bajo, last:(h.conteos || [])[0] || null, loaded:!!h.lp, lc:!!h.lc};
}
function lcard(l){
  const s = hubStats(l.id), last = s.last, hoy = last && new Date(last.fecha).toDateString() === new Date().toDateString();
  const pill = !s.lc ? '' : last ? (hoy ? `<span class="lpill ok">Contado hoy</span>` : `<span class="lpill warn">Último conteo ${esc(rel(last.fecha))}</span>`) : `<span class="lpill">Sin conteos</span>`;
  const edita = puedeEditarLocal(l.id);
  return `<article class="lcard" data-act="local" data-id="${esc(l.id)}">
    <div class="lc-top"><div><small class="lc-k">Local</small><h2>${esc(l.nombre)}</h2><p>${s.loaded ? `${plural(s.n, 'producto', 'productos')} · ${plural(s.cats, 'categoría', 'categorías')}` : 'Cargando…'}</p></div>${pill}</div>
    <div class="lc-m">
      <div><span><i style="background:var(--crit)"></i>Sin stock</span><b>${s.sin}</b></div>
      <div><span><i style="background:var(--warn)"></i>Stock bajo</span><b>${s.bajo}</b></div>
      <div><span><i style="background:var(--nc)"></i>Sin contar</span><b>${s.nc}</b></div>
      <div class="lc-sep"><span>A pedir</span><b>${s.ped}</b></div>
    </div>
    <div class="lc-f"><small>${last ? `${esc(last.nombreHoja || (last.tipo === 'fabrica' ? 'Conteo Fábrica' : 'Conteo'))} · ${esc(fechaHora(last.fecha))} · ${esc(whoName(last))}` : 'Todavía no se guardó ningún conteo'}${edita ? '' : ' · Solo ver'}</small><button class="lc-open" data-act="local" data-id="${esc(l.id)}">Abrir local <span aria-hidden="true">→</span></button></div>
  </article>`;
}
function renderHub(){
  window.GestLokSupport?.render();
  const hub = $('#hub'); if (!hub || hub.hidden) return;
  const adm = isCreadora(), listo = S.booted && (!S.db || (S.loaded.e && S.loaded.l)), mios = listo ? localesMios() : [];
  if (adm && listo && S.db && S.creatorSetup) {
    const creatorHTML=window.GestLokCreator?.view() || '';
    if(hub._h!==creatorHTML){hub.innerHTML=creatorHTML;hub._h=creatorHTML;}
    return;
  }
  if (adm && listo && S.db && S.demoTienda) {
    const demoHTML = window.GestLokDemo?.view() || '';
    if (hub._h !== demoHTML) { hub.innerHTML=demoHTML; hub._h=demoHTML; }
    return;
  }
  let body;
  if (!listo) body = `<div class="lcards">${'<div class="lcard sk-card" aria-hidden="true"></div>'.repeat(2)}</div>`;
  else if (!S.db) body = `<p class="note warn"><b>Sin conexión con la base.</b> Revisá internet y recargá la página.</p>`;
  else if (!mios.length) body = `<div class="card pad hub-empty"><b>Todavía no tenés un local asignado</b><p class="lead">La administración debe asignarte uno o más locales. Cuando lo haga, aparece acá.</p></div>`;
  else body = `<div class="lcards">${mios.map(lcard).join('')}</div>`;

  // Panel privado: únicamente la cuenta con rol creadora concedido por Supabase.
  // No es un panel de pagos: GestLok sigue gratuito y todas las altas requieren aprobación.
  if (adm && listo && S.db) {
    const usuarios = equipoList();
    const totalProductos = mios.reduce((n,l) => n + ((S.hub[l.id]?.lp) ? S.hub[l.id].prods.length : 0), 0);
    const ready = mios.every(l => S.hub[l.id]?.lp);
    const puestos = mios.map(l => {
      const st = hubStats(l.id);
      return `<article class="gl-admin-location">
        <div class="gl-admin-location-icon">${ic('store')}</div>
        <div class="gl-admin-location-text"><b>${esc(l.nombre)}</b><small>${st.loaded ? plural(st.n,'producto','productos') + ' · ' + st.sin + ' sin stock' : 'Cargando información…'}</small></div>
        <button class="btn sm" data-act="local" data-id="${esc(l.id)}">Abrir local →</button>
      </article>`;
    }).join('');
    const members = usuarios.map(u => `<tr>
      <td><b>${esc(u.nombre || u.name || u.email || 'Usuario')}</b><small>${esc(u.email || '')}</small></td>
      <td>${esc(rolLabel(ROLN(u.rol)))}</td>
      <td>${esc(localesTxt(u))}</td>
      <td><span class="gl-admin-good">Autorizado</span></td>
    </tr>`).join('');
    const adminHTML = `<div class="gl-admin">
      <aside class="gl-admin-sidebar" aria-label="Administración GestLok">
        <div class="gl-admin-logo"><img src="icons/gestlok-wordmark.svg" alt="GestLok" width="170" height="48"><small>Administración privada</small></div>
        <div class="gl-admin-nav"><span aria-current="page">${ic('home')} Resumen</span>
        <button data-act="admin-locales">${ic('store')} Locales</button>
        <button data-act="share">${ic('userplus')} Equipo y autorizaciones ${S.sol.length ? `<b>${S.sol.length}</b>` : ''}</button></div>
        <div class="gl-admin-footer">Acceso exclusivo de la administradora<br><small>GestLok · Uso gratuito con autorización</small></div>
      </aside>
      <main class="gl-admin-main">
        <header class="gl-admin-heading">
          <div><p class="eyebrow">GESTLOK / ADMINISTRACIÓN</p><h1>Panel administrativo</h1><p>Control de los locales y usuarios autorizados.</p></div>
          <div class="gl-admin-person"><span class="gl-admin-avatar">${esc((S.me?.name || 'A').trim().charAt(0).toUpperCase())}</span><span><b>${esc(S.me?.name || 'Administradora')}</b><small>Rol: creadora</small></span><button class="btn sm" data-au="out">Salir</button></div>
        </header>
        <section class="gl-admin-stats" aria-label="Resumen administrativo">
          <article><span>${ic('store')} Locales habilitados</span><strong>${mios.length}</strong><small>Accesibles desde tu cuenta</small></article>
          <article><span>${ic('userplus')} Usuarios autorizados</span><strong>${usuarios.length}</strong><small>Miembros del equipo</small></article>
          <article><span>${ic('clock')} Solicitudes pendientes</span><strong>${S.sol.length}</strong><small>Esperando tu autorización</small></article>
          <article><span>${ic('box')} Productos registrados</span><strong>${ready ? totalProductos : '…'}</strong><small>En los locales autorizados</small></article>
        </section>
        <section class="gl-admin-card gl-demo-launch" aria-label="Preparar una empresa">
          <header><h2>Preparar empresa para un cliente</h2><small>Exclusivo de la creadora</small></header>
          <p>Elegí física, online o mixta y dejá creados el local, las carpetas y el catálogo a partir de un CSV. Todo queda separado de las empresas existentes.</p>
          <button class="btn primary" data-act="admin-preparar-empresa">Preparar empresa nueva →</button>
        </section>
        <section class="gl-admin-card gl-demo-launch" aria-label="Demo de gestión online">
          <header><h2>Explorar gestión de tienda online</h2><small>Ejemplo independiente · Sin crear empresas</small></header>
          <p>Probá un panel administrativo ficticio con productos, stock mínimo, pedidos, proveedores y reportes. No publica una tienda ni modifica la empresa de Gisela.</p>
          <button class="btn primary" data-act="admin-demo-online">Ver demo de gestión online →</button>
        </section>
        ${window.GestLokSupport?.adminCard() || ''}
        ${window.GestLokCommerce?.card() || ''}
        <section class="gl-admin-notice"><div><b>GestLok es gratuito</b><p>Las nuevas cuentas solo ingresan cuando las autorizás. No existen planes de pago, tarjetas ni vencimientos.</p></div><button class="btn primary" data-act="share">Revisar solicitudes ${S.sol.length ? '(' + S.sol.length + ')' : ''}</button></section>
        <div class="gl-admin-panels">
          <section class="gl-admin-card" id="gl-admin-locales"><header><h2>Locales autorizados</h2><small>Entrá sin modificar las existencias</small></header>${puestos || '<p class="lead">No hay locales habilitados.</p>'}</section>
          <section class="gl-admin-card"><header><h2>Acceso y privacidad</h2><small>Protección de información</small></header>
            <p>Los registros de Munro y Torcuato se mantienen separados. El ingreso requiere una cuenta aprobada.</p>
            <p>Los datos de cada comercio se mostrarán únicamente a usuarios de ese comercio, tras finalizar la separación multiempresa.</p>
            <button class="btn" data-act="share">Administrar equipo</button>
          </section>
        </div>
        <section class="gl-admin-card gl-admin-team"><header><h2>Usuarios aprobados</h2><button class="btn" data-act="share">Ver equipo completo</button></header>
          <div class="gl-admin-tablewrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Locales</th><th>Acceso</th></tr></thead><tbody>${members}</tbody></table></div>
        </section>
        <footer class="gl-admin-bottom">GestLok · Panel privado · Sin servicios de pago</footer>
      </main>
    </div>`;
    if (hub._h !== adminHTML) { hub.innerHTML = adminHTML; hub._h = adminHTML; }
    return;
  }
  const html = `<div class="hub-top"><header class="hub-h">
      <div class="hub-brand"><img class="hub-logo" src="icons/gestlok-wordmark.svg" alt="GestLok" width="340" height="76"><div class="hb-t"><b>Inventario</b><span>Locales y equipo</span></div></div>
      <div class="hub-a">${S.db && listo ? `<button class="btn" data-act="share">${ic('userplus')}Equipo${adm && S.sol.length ? `<span class="badge">${S.sol.length}</span>` : ''}</button>` : ''}${S.me ? `<button class="btn" data-au="out">Salir</button>` : ''}</div>
    </header></div>
    <main class="hub-in">
      <p class="eyebrow">${esc(fechaLarga())}</p>
      <h1 class="hub-t">Locales</h1>
      <p class="lead hub-lead">Elegí un local para cargar, revisar y guardar el stock, los conteos y los pedidos.</p>
      ${adm && S.sol.length ? `<section class="card pad hub-sol">${solRows()}</section>` : ''}
      ${window.GestLokCommerce?.card() || ''}
      ${body}
      ${S.me && listo ? `<p class="hub-me">Entraste como <b>${esc(S.me.email || '')}</b> · ${esc(rolLabel(miRol()))}</p>` : ''}
    </main>`;
  if (hub._h !== html){
    const ae = document.activeElement, keep = !!(ae && hub.contains(ae) && ae.matches('input,select'));
    if (!keep){ hub.innerHTML = html; hub._h = html; }
  }
}

/* ---------- Guardar conteo ---------- */
function openSave(){
  if (isFabV(S.view)) return openSaveF();
  if (!needWrite()) return;
  const ed = editingCtx(), pend = pendientes(), cont = draftCount(), sin = S.prods.filter(p => p.sinStock).length;
  S.panel = 'save';
  const lista = pend.length ? `<div class="sum">${pend.map(c => { const d = round(c.despues - (c.antes ?? 0)); return `<div><span>${esc(c.p.nombre)}${c.nota ? ` <small style="color:var(--muted);font-style:italic">· ${esc(c.nota)}</small>` : ''}</span><span class="num">${c.antes == null ? 'sin contar' : fmt(c.antes)} → ${fmt(c.despues)} <b class="dif ${c.antes == null ? 'eq' : d > 0 ? 'pos' : d < 0 ? 'neg' : 'eq'}">${c.antes == null ? 'Nuevo' : d === 0 ? 'Nota' : (d > 0 ? '+' : '−') + fmt(Math.abs(d))}</b></span></div>`; }).join('')}</div>`
    : `<p class="note">${cont ? `Contaste ${cont} productos y todos coinciden con el stock.` : 'No hay cambios.'} Se guarda igual como control, con fecha, hora y la lista de productos sin stock.</p>`;
  openPanel(`<div class="pn-h"><div><small>${esc(nombreHoja(S.view))}</small><h3>${ed ? 'Guardar corrección' : 'Guardar conteo'}</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="pn-b">
    ${ed ? `<p class="note">Se actualiza el conteo del <b>${esc(fechaHora(ed.fecha))}</b> y queda marcado como corregido.</p>` : ''}
    ${pend.length ? `<p class="lead">${pend.length === 1 ? 'Este producto cambia de cantidad:' : `Estos ${pend.length} productos cambian de cantidad:`}</p>` : ''}
    ${lista}
    ${sin ? `<p class="lead">${sin} ${sin === 1 ? 'producto queda registrado' : 'productos quedan registrados'} como sin stock.</p>` : ''}
  </div>
  <div class="pn-f"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" id="sv-ok" data-act="save-ok">${ic('save')}${ed ? 'Guardar corrección' : 'Guardar conteo'}</button></div>`, 'dlg');
  setTimeout(() => $('#sv-ok')?.focus(), 40);
}
async function doSave(v = S.view){
  if (S.offline){ queueSave(v, false); return; }
  const btn = $('#sv-ok'); if (btn){ btn.disabled = true; btn.textContent = 'Guardando…'; }
  const now = Date.now();
  const entry = c => ({pid:c.p.id, nombre:c.p.nombre || '', cat:catOf(c.p), unidad:c.p.unidad || '', antes:c.antes, despues:c.despues, dif:round(c.despues - (c.antes ?? 0)), nota:c.nota || ''});
  const plan = withCtx(v, () => {
    const pend = pendientes(), changed = pend.filter(c => c.despues !== c.antes);
    return {
      pend, changed, ed:editingCtx(), nom:nombreHoja(v), contados:draftCount(), total:S.prods.length,
      foto:sorted().map(p => [p.id, p.nombre || '', qty(p)]),
      sinStock:sorted().filter(p => { const c = changed.find(x => x.p.id === p.id); return c ? c.despues <= 0 : !!p.sinStock; }).map(p => p.nombre || '')
    };
  });
  try {
    await batchRun(plan.changed, c => C('productos').doc(c.p.id).update({stock:c.despues, sinStock:c.despues <= 0, actualizado:now}));
    const ed = plan.ed;
    if (ed){
      const orig = S.conteos.find(c => c.id === ed.id);
      const map = new Map((orig?.cambios || []).map(x => [x.pid, x]));
      for (const c of plan.pend){ const o = map.get(c.p.id); const antes = o ? o.antes : c.antes; map.set(c.p.id, {...entry(c), antes, dif:round(c.despues - (antes ?? 0))}); }
      const cambios = [...map.values()].filter(x => x.dif !== 0 || x.nota || x.antes == null);
      await w(() => C('conteos').doc(ed.id).update({cambios, modificado:true, modificadoEn:now, modificadoPor:S.uid || null, foto:plan.foto, sinStock:plan.sinStock}));
    } else {
      await w(() => C('conteos').add({fecha:now, autor:S.uid || null, responsable:'', nota:'', hoja:v, nombreHoja:plan.nom, cambios:plan.pend.map(entry), contados:plan.contados, total:plan.total, sinStock:plan.sinStock, foto:plan.foto}));
    }
    withCtx(v, clearDraftCtx); if (S.queued && S.queued.view === v){ S.queued = null; localStorage.removeItem(queuedKey()); }
    if (S.panel === 'save') closePanel(); render();
    toast(ed ? 'Corrección guardada' : `Conteo guardado${plan.pend.length ? ` · ${plural(plan.pend.length, 'cambio', 'cambios')}` : ''}`);
  } catch(e){
    if (btn){ btn.disabled = false; btn.textContent = 'Guardar conteo'; }
    if (!navigator.onLine){ S.offline = true; queueSave(v, false); } else fail(e);
  }
}
function openConfirm(title, text, okLabel, act, danger){
  S.panel = 'confirm';
  openPanel(`<div class="pn-h"><div><h3>${esc(title)}</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div><div class="pn-b"><p class="lead">${text}</p></div><div class="pn-f"><button class="btn" data-act="close">Cancelar</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-act="${act}">${esc(okLabel)}</button></div>`, 'dlg');
}
function corregir(id, force){
  const c = S.conteos.find(x => x.id === id); if (!c || !needWrite()) return;
  const main = withCtx('conteo', () => ({pend:pendientes().length, cont:draftCount()}));
  if (!force && (main.pend || main.cont)){ S._corr = id; openConfirm('Corregir conteo', 'Tenés productos contados sin guardar. Si corregís el conteo anterior, ese avance se descarta.', 'Descartar y corregir', 'corr-ok', true); return; }
  withCtx('conteo', clearDraftCtx);
  for (const x of c.cambios || []){ const p = S.prods.find(p => p.id === x.pid); if (!p) continue; if (stockOf(p) != null) S.draft[x.pid] = stockOf(p); if (x.nota) S.notas[x.pid] = x.nota; }
  S.editing = {id, fecha:c.fecha}; S.cfiltro = 'todos'; saveDraft(); closePanel(); go('conteo');
  toast('Cambiá las cantidades que estaban mal y tocá Guardar conteo');
}

/* ---------- Sin stock ---------- */
async function toggleSS(id, val, el){
  if (!needWrite()){ el.checked = !val; return; }
  const p = S.prods.find(x => x.id === id);
  if (p){
    if (val && stockOf(p) !== 0) S.draft[id] = 0;
    else if (!val && S.draft[id] === 0) delete S.draft[id];
    saveDraft();
  }
  try {
    await w(() => C('productos').doc(id).update({sinStock:val, sinStockEn:val ? Date.now() : null, sinStockPor:val ? (S.uid || null) : null}));
    toast(val ? `${p?.nombre || 'Producto'}: marcado sin stock` : `${p?.nombre || 'Producto'}: vuelve a tener stock`);
  } catch(e){ el.checked = !val; fail(e); }
}

/* ---------- Ajustes ---------- */
function openAjustes(tab, pid){
  S.panel = 'ajustes';
  const fabScope = isFabV(S.view) || /^f-/.test(tab || '');
  S.aj.tab = tab || (fabScope ? 'f-items' : 'productos'); S.aj.cat = S.cat; S.aj.q = ''; S.aj.editId = pid || null; S.aj.delId = null; S.aj.catEdit = null;
  openPanel('', 'drawer'); renderAjustes();
  if (pid) setTimeout(() => { document.getElementById('ar-' + pid)?.scrollIntoView({block:'center'}); $('#ae-nombre')?.focus(); }, 60);
}
function renderAjustes(){
  const t = S.aj.tab;
  const fab = /^f-/.test(t);
  const tabs = fab ? [['f-items', `Productos (${S.fab.length})`], ['f-add', 'Agregar'], ['f-paste', 'Pegar lista']] : [['productos', `Productos (${S.prods.length})`], ['rapido', 'Mínimos y proveedores'], ['agregar', 'Agregar'], ['pegar', 'Pegar lista'], ['categorias', 'Categorías']];
  $('#pn').innerHTML = `<div class="pn-h"><div><small>${esc(S.view === 'inicio' ? 'Inicio' : nombreHoja(S.view))}</small><h3>Ajustes</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="pn-b">
    <p class="lead">${fab ? `Productos de la planilla ${esc(nombreHoja(fabCtx()))}: agregá, modificá, eliminá, ordená por bloque y resaltá en amarillo.` : listaCtx() ? 'Agregá, modificá o eliminá los productos de esta hoja. Los cambios se ven al instante para todo el equipo.' : 'Agregá, modificá o eliminá productos. Los cambios se ven al instante en Stock, Conteo y Pedido, y para todo el equipo.'}</p>
    ${canW() ? '' : `<p class="note warn">${S.db ? 'Tu acceso es Solo ver: no podés cambiar productos.' : 'Iniciá sesión para editar productos.'}</p>`}
    <div class="seg" role="tablist">${tabs.map(([k,l]) => `<button role="tab" data-act="aj-tab" data-tab="${k}" aria-selected="${t === k}">${l}</button>`).join('')}</div>
    <div id="aj-body">${AJ[t]()}</div>
  </div>`;
}
function catDatalist(){ return `<datalist id="dl-cats">${cats().map(([c]) => `<option value="${esc(c)}">`).join('')}</datalist><datalist id="dl-units">${UNIDADES.map(u => `<option value="${u}">`).join('')}</datalist><datalist id="dl-prov">${provs().map(([v]) => `<option value="${esc(v)}">`).join('')}</datalist>`; }
const AJ = {};
AJ.productos = () => {
  if (!S.loaded.p) return '<p class="lead">Cargando…</p>';
  if (!S.prods.length) return `<div class="empty"><b>No hay productos todavía</b>Usá la pestaña Agregar o Pegar lista.</div>`;
  const q = norm(S.aj.q);
  const list = sorted().filter(p => (!S.aj.cat || catOf(p) === S.aj.cat) && (!q || norm(p.nombre).includes(q) || norm(catOf(p)).includes(q)));
  return `<div class="frow"><div class="search">${ic('search')}<input id="aj-q" type="search" placeholder="Buscar" value="${esc(S.aj.q)}" aria-label="Buscar producto"></div>
    <div class="fld"><select id="aj-cat" aria-label="Categoría"><option value="">Todas las categorías</option>${cats().map(([c,n]) => `<option value="${esc(c)}" ${S.aj.cat === c ? 'selected' : ''}>${esc(c)} (${n})</option>`).join('')}</select></div></div>
    ${catDatalist()}
    <div class="alist">${list.length ? list.map(ajRow).join('') : '<p class="lead">Ningún producto coincide.</p>'}</div>`;
};
function ajRow(p){
  const id = esc(p.id), m = minOf(p);
  if (S.aj.editId === p.id) return `<div class="ar editing" id="ar-${id}"><form id="ae-form" data-id="${id}" class="frow">
      <div class="fld wide"><label for="ae-nombre">Nombre</label><input id="ae-nombre" value="${esc(p.nombre)}" required></div>
      <div class="fld"><label for="ae-cat">Categoría</label><input id="ae-cat" list="dl-cats" value="${esc(p.cat || '')}" placeholder="Elegí o escribí una nueva"></div>
      <div class="fld"><label for="ae-unidad">Unidad</label><input id="ae-unidad" list="dl-units" value="${esc(p.unidad || '')}"></div>
      <div class="fld"><label for="ae-min">Mínimo</label><input id="ae-min" inputmode="decimal" value="${esc(fmtIn(m))}" placeholder="Sin mínimo"></div>
      <div class="fld"><label for="ae-prov">Proveedor</label><input id="ae-prov" list="dl-prov" value="${esc(p.proveedor || '')}" placeholder="Opcional"></div>
      <div class="fld wide"><label for="ae-obs">Observación</label><input id="ae-obs" value="${esc(p.obs || '')}" placeholder="Ej. proveedor, vencimiento"></div>
      <p class="lead wide" style="margin:0">El stock (${fmt(stockOf(p))}) se cambia desde Stock o Conteo, con Guardar conteo.</p>
      <div class="bar-a wide"><button type="button" class="btn" data-act="aj-cancel">Cancelar</button><button type="submit" class="btn primary">Guardar cambios</button></div>
    </form></div>`;
  if (S.aj.delId === p.id) return `<div class="ar deleting" id="ar-${id}"><div><b>¿Eliminar «${esc(p.nombre)}»?</b><small>${listaCtx() ? 'Se borra de esta hoja' : 'Se borra de Stock, Conteo y Pedido'}. Los conteos ya guardados lo siguen mostrando en el historial.</small></div><div class="bar-a"><button class="btn" data-act="aj-cancel">Cancelar</button><button class="btn danger solid" data-act="aj-del-ok" data-id="${id}">${ic('trash')}Eliminar</button></div></div>`;
  return `<div class="ar${canW() ? ' dr' : ''}" id="ar-${id}" data-rid="${id}">${canW() ? dragHandle(p.id, p.nombre) : ''}<div><b>${esc(p.nombre)}</b><small style="--cc:${ccOf(catOf(p))}"><i></i>${esc(catOf(p))} · ${esc(p.unidad || 'unidad')} · mín ${m != null ? fmt(m) : '—'}${provOf(p) ? ` · ${esc(provOf(p))}` : ''} · stock ${fmt(stockOf(p))}${p.sinStock ? ' · <span style="color:var(--crit)">sin stock</span>' : ''}</small></div>
    <div class="ar-a"><button class="btn sm" data-act="aj-edit" data-id="${id}" ${canW() ? '' : 'disabled'}>${ic('edit')}Modificar</button><button class="btn sm danger" data-act="aj-del" data-id="${id}" ${canW() ? '' : 'disabled'} aria-label="Eliminar ${esc(p.nombre)}">${ic('trash')}</button></div></div>`;
}
/* Categoría sugerida al agregar: la elegida o la última usada, solo si existe en esta hoja */
function catIni(){ if (S.aj.cat) return S.aj.cat; const c = lsGet('spm-lastcat', ''); return cats().some(([x]) => x === c) ? c : ''; }
AJ.agregar = () => `${catDatalist()}<form id="aa-form" class="frow">
    <div class="fld wide"><label for="aa-nombre">Nombre del producto</label><input id="aa-nombre" required placeholder="Ej. Mix Provolone Hebras 600gr"></div>
    <div class="fld"><label for="aa-cat">Categoría</label><input id="aa-cat" list="dl-cats" value="${esc(catIni())}" placeholder="Elegí o escribí una nueva"></div>
    <div class="fld"><label for="aa-unidad">Unidad</label><input id="aa-unidad" list="dl-units" value="${esc(lsGet('spm-lastunit', 'unidad'))}"></div>
    <div class="fld"><label for="aa-min">Mínimo</label><input id="aa-min" inputmode="decimal" placeholder="Opcional"></div>
    <div class="fld"><label for="aa-stock">Stock actual</label><input id="aa-stock" inputmode="decimal" placeholder="Sin contar"></div>
    <div class="fld"><label for="aa-prov">Proveedor</label><input id="aa-prov" list="dl-prov" value="${esc(lsGet('spm-lastprov', ''))}" placeholder="Opcional"></div>
    <div class="fld wide"><label for="aa-obs">Observación</label><input id="aa-obs" placeholder="Opcional"></div>
    <div class="bar-a wide" style="justify-content:flex-end"><button type="submit" class="btn primary" ${canW() ? '' : 'disabled'}>${ic('plus')}Agregar producto</button></div>
  </form>`;
AJ.pegar = () => `<p class="lead">Pegá la lista completa, por ejemplo copiada de Excel, Google Sheets o WhatsApp. Una línea por producto. Si escribís una categoría terminada en dos puntos, los productos de abajo van a esa categoría.</p>
  <pre class="cfmt">FIAMBRES:
Pepperoni Condimentado
Mix Rockefort
SALSAS:
Crema de Ajo; ; unidad; 4; 6; Distribuidora Sur

Columnas (separadas por ; o tabulación):
Nombre; Categoría; Unidad; Mínimo; Stock; Proveedor</pre>
  <div class="fld"><label for="ap-txt">Lista</label><textarea id="ap-txt" placeholder="Pegá acá tu lista">${esc(S.aj.paste || '')}</textarea></div>
  <p class="prev" id="ap-prev">${pastePreview()}</p>
  <div class="bar-a" style="justify-content:flex-end"><button class="btn primary" data-act="ap-import" id="ap-btn" ${canW() ? '' : 'disabled'}>Importar productos</button></div>`;
AJ.rapido = () => {
  if (!S.loaded.p) return '<p class="lead">Cargando…</p>';
  if (!S.prods.length) return `<div class="empty"><b>No hay productos todavía</b>Usá la pestaña Agregar o Pegar lista.</div>`;
  const list = sorted().filter(p => !S.aj.cat || catOf(p) === S.aj.cat), dis = canW() ? '' : 'disabled';
  return `<p class="lead">Cargá el mínimo y el proveedor de cada producto: se guarda solo al pasar a la casilla siguiente. Con mínimo, el producto pasa a <b>Stock bajo</b> y entra en <b>Pedido</b> cuando queda por debajo.</p>
    <div class="fld"><select id="aj-cat" aria-label="Categoría"><option value="">Todas las categorías</option>${cats().map(([c,n]) => `<option value="${esc(c)}" ${S.aj.cat === c ? 'selected' : ''}>${esc(c)} (${n})</option>`).join('')}</select></div>
    ${catDatalist()}
    <div class="qt"><div class="qt-h"><span>Producto</span><span>Mínimo</span><span>Proveedor</span></div>${list.map(p => { const id = esc(p.id); return `<div class="qt-r"><div><b>${esc(p.nombre)}</b><small>${esc(catOf(p))}</small></div><input id="qm-${id}" data-qmin="${id}" inputmode="decimal" autocomplete="off" value="${esc(fmtIn(minOf(p)))}" placeholder="—" aria-label="Mínimo de ${esc(p.nombre)}" ${dis}><input id="qp-${id}" data-qprov="${id}" list="dl-prov" autocomplete="off" value="${esc(p.proveedor || '')}" placeholder="—" aria-label="Proveedor de ${esc(p.nombre)}" ${dis}></div>`; }).join('')}</div>`;
};
async function qGuardar(id, k, el){
  if (!needWrite()) return;
  const p = S.allProds.find(x => x.id === id); if (!p) return;
  let v;
  if (k === 'min'){
    const raw = el.value.trim(); v = num(raw);
    if (raw && (v == null || v < 0 || !isHalf(v))){ el.classList.add('bad'); toast('El mínimo va en unidades enteras o medias (ej. 3 o 3,5).', true); return; }
    el.classList.remove('bad'); if (!v) v = null; if (minOf(p) === v) return;
  } else { v = limpiarNombre(el.value); if (v === provOf(p)) return; }
  try {
    await w(() => C('productos').doc(id).update({[k]:v, actualizado:Date.now()}));
    el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 1000);
    if (k === 'proveedor'){ const dl = $('#dl-prov'); if (dl && v && ![...dl.options].some(o => o.value === v)) dl.insertAdjacentHTML('beforeend', `<option value="${esc(v)}">`); }
  } catch(e){ fail(e); }
}
AJ.categorias = () => {
  const nueva = 'Para crear una categoría nueva, escribí su nombre en <b>Categoría</b> al agregar o modificar un producto.';
  const cs = cats(); if (!cs.length) return `<p class="lead">Las categorías aparecen cuando cargás productos. ${nueva}</p><div class="bar-a"><button class="btn primary sm" data-act="aj-tab" data-tab="agregar">${ic('plus')}Agregar producto</button></div>`;
  return `<p class="lead">Renombrá una categoría y se actualizan todos sus productos. Para borrar una categoría, eliminá o mové sus productos. ${nueva}</p><div class="alist">${cs.map(([c,n]) => S.aj.catEdit === c
    ? `<div class="ar editing"><form id="ac-form" data-cat="${esc(c)}" class="frow"><div class="fld wide"><label for="ac-name">Nuevo nombre para «${esc(c)}»</label><input id="ac-name" value="${esc(c)}" required></div><div class="bar-a wide"><button type="button" class="btn" data-act="aj-cancel">Cancelar</button><button type="submit" class="btn primary">Renombrar</button></div></form></div>`
    : `<div class="ar"><div><b>${esc(c)}</b><small style="--cc:${ccOf(c)}"><i></i>${plural(n, 'producto', 'productos')}</small></div><div class="ar-a"><button class="btn sm" data-act="ac-edit" data-cat="${esc(c)}" ${canW() ? '' : 'disabled'}>${ic('edit')}Renombrar</button></div></div>`).join('')}</div>`;
};
/* Ajustes de Conteo Fábrica */
const bloques = () => [...new Set(fItems().map(bloqueOf))].sort((a,b) => a - b);
AJ['f-items'] = () => {
  if (!S.loaded.f) return '<p class="lead">Cargando…</p>';
  if (!S.fab.length) return `<div class="empty"><b>No hay productos todavía</b>Usá la pestaña Agregar o Pegar lista.</div>`;
  let h = '', prev = null;
  for (const it of fItems()){ const b = bloqueOf(it); if (b !== prev){ h += `<div class="ar bq" data-bloque="${b}"><small>${esc(bloqueNombre(b))}</small></div>`; prev = b; } h += afRow(it); }
  return `<div class="alist">${h}</div>`;
};
function afRow(it){
  const id = esc(it.id);
  if (S.aj.editId === it.id) return `<div class="ar editing" id="ar-${id}"><form id="afe-form" data-id="${id}" class="frow">
      <div class="fld wide"><label for="afe-nombre">Nombre</label><input id="afe-nombre" value="${esc(it.nombre)}" required></div>
      <div class="fld"><label for="afe-bloque">Bloque</label><input id="afe-bloque" inputmode="numeric" value="${bloqueOf(it)}"></div>
      <label class="fld wide" style="display:flex;align-items:center;gap:10px;cursor:pointer"><input type="checkbox" id="afe-hl" ${it.resaltar ? 'checked' : ''} style="width:20px;height:20px;accent-color:#C99A00"><span style="font-size:14px;font-weight:600">Resaltar en amarillo</span></label>
      <div class="bar-a wide"><button type="button" class="btn" data-act="aj-cancel">Cancelar</button><button type="submit" class="btn primary">Guardar cambios</button></div>
    </form></div>`;
  if (S.aj.delId === it.id) return `<div class="ar deleting" id="ar-${id}"><div><b>¿Eliminar «${esc(it.nombre)}»?</b><small>Se borra de la planilla ${esc(nombreHoja(fabCtx()))}. Los conteos ya guardados lo siguen mostrando en el historial.</small></div><div class="bar-a"><button class="btn" data-act="aj-cancel">Cancelar</button><button class="btn danger solid" data-act="af-del-ok" data-id="${id}">${ic('trash')}Eliminar</button></div></div>`;
  return `<div class="ar${canW() ? ' dr' : ''}" id="ar-${id}" data-rid="${id}">${canW() ? dragHandle(it.id, it.nombre) : ''}<div><b style="${it.resaltar ? 'background:var(--hl);color:var(--hl-ink);padding:0 4px;border-radius:3px' : ''}">${esc(it.nombre)}</b><small>Local ${fmt(num(it.local))} · Fábrica ${fmt(num(it.fabrica))}</small></div>
    <div class="ar-a"><button class="btn sm" data-act="af-edit" data-id="${id}" ${canW() ? '' : 'disabled'}>${ic('edit')}Modificar</button><button class="btn sm danger" data-act="af-del" data-id="${id}" ${canW() ? '' : 'disabled'} aria-label="Eliminar ${esc(it.nombre)}">${ic('trash')}</button></div></div>`;
}
AJ['f-add'] = () => { const bs = bloques(), last = bs.length ? bs[bs.length - 1] : 1; return `<form id="afa-form" class="frow">
    <div class="fld wide"><label for="afa-nombre">Nombre del producto</label><input id="afa-nombre" required placeholder="Ej. Caja Ketchup"></div>
    <div class="fld"><label for="afa-bloque">Bloque</label><select id="afa-bloque">${bs.map(b => `<option value="${b}" ${b === last ? 'selected' : ''}>${esc(bloqueNombre(b))}</option>`).join('')}<option value="${last + 1}">Bloque nuevo (${last + 1})</option></select></div>
    <label class="fld" style="display:flex;align-items:center;gap:10px;cursor:pointer;align-self:end;height:42px"><input type="checkbox" id="afa-hl" style="width:20px;height:20px;accent-color:#C99A00"><span style="font-size:14px;font-weight:600">Resaltar en amarillo</span></label>
    <div class="bar-a wide" style="justify-content:flex-end"><button type="submit" class="btn primary" ${canW() ? '' : 'disabled'}>${ic('plus')}Agregar a la planilla</button></div>
  </form>`; };
AJ['f-paste'] = () => `<p class="lead">Una línea por producto. Dejá una línea vacía o escribí <b>---</b> para empezar un bloque nuevo. Empezá la línea con <b>*</b> para resaltarla en amarillo.</p>
  <pre class="cfmt">*Manteca de Ajo
*Pepperoni
---
Caja Ketchup
Caja Chimi</pre>
  <div class="fld"><label for="afp-txt">Lista</label><textarea id="afp-txt" placeholder="Pegá acá la lista">${esc(S.aj.fpaste || '')}</textarea></div>
  <p class="prev" id="afp-prev">${fPastePreview()}</p>
  <div class="bar-a" style="justify-content:flex-end"><button class="btn primary" data-act="afp-import" id="afp-btn" ${canW() ? '' : 'disabled'}>Agregar a la planilla</button></div>`;
function fParse(){
  const out = [], bs = bloques(); let b = (bs.length ? bs[bs.length - 1] : 0) + 1, any = false;
  for (const raw of String(S.aj.fpaste || '').split(/\r?\n/)){
    const line = raw.trim();
    if (!line || /^-{3,}$/.test(line)){ if (any){ b++; any = false; } continue; }
    const hl = /^\*/.test(line), nombre = line.replace(/^\*\s*/, '').trim();
    if (!nombre) continue;
    if (S.fab.some(x => norm(x.nombre) === norm(nombre)) || out.some(x => norm(x.nombre) === norm(nombre))) continue;
    out.push({nombre, bloque:b, resaltar:hl}); any = true;
  }
  return out;
}
function fPastePreview(){
  if (!S.aj.fpaste || !S.aj.fpaste.trim()) return 'Cuando pegues la lista, acá ves cuántos productos se agregan.';
  const r = fParse(), nb = new Set(r.map(x => x.bloque)).size;
  return `Se van a agregar <b>${r.length}</b> ${r.length === 1 ? 'producto' : 'productos'} en <b>${nb}</b> ${nb === 1 ? 'bloque' : 'bloques'}. Los que ya están se saltean.`;
}
async function fImportar(){
  if (!needWrite() || S.aj.busy) return;
  const rows = fParse(); if (!rows.length){ toast('No hay productos nuevos para agregar.'); return; }
  S.aj.busy = true; let orden = Math.max(0, ...S.fab.map(x => num(x.orden) || 0));
  try {
    const hf = fHojaField();
    await batchRun(rows, r => C('fabrica').doc().set({nombre:r.nombre, bloque:r.bloque, resaltar:r.resaltar, orden:++orden, local:null, fabrica:null, sinStock:false, creado:Date.now(), ...hf}));
    S.aj.fpaste = ''; S.aj.tab = 'f-items'; S.aj.busy = false; renderAjustes(); toast(`${rows.length} productos agregados`);
  } catch(e){ S.aj.busy = false; fail(e); }
}
/* Orden para dejar un producto al final de su bloque sin pasarse al bloque siguiente */
function fOrdenFin(bloque, exceptId){
  const os = fItems().filter(x => x.id !== exceptId), o = x => num(x.orden) || 0;
  const antes = os.filter(x => bloqueOf(x) <= bloque).map(o), despues = os.filter(x => bloqueOf(x) > bloque).map(o);
  const a = antes.length ? Math.max(...antes) : (despues.length ? Math.min(...despues) - 1 : 0), d = despues.length ? Math.min(...despues) : null;
  return d == null || d <= a ? a + 1 : (a + d) / 2;
}
/* Nombre de cada bloque de una planilla (Conteo Fábrica, Stock…): se guarda en la hoja, campo «bloques» */
const hojaDocF = () => S.hojasDB.find(x => x.id === fabCtx()) || {};
const bloqueNombre = (b, h) => { const m = (h || hojaDocF()).bloques; const n = m && String(m[b] || '').trim(); return n || `Bloque ${b}`; };
function openBloque(b){
  if (!needWrite()) return;
  S.panel = 'bq';
  const n = (hojaDocF().bloques || {})[b] || '';
  openPanel(`<div class="pn-h"><div><small>${esc(nombreHoja(fabCtx()))}</small><h3>Nombre del bloque ${b}</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="pn-b"><form id="bq-form" data-b="${b}" class="frow" novalidate><div class="fld wide"><label for="bq-nombre">Nombre (ej. Fiambres, Mangas)</label><input id="bq-nombre" maxlength="40" value="${esc(n)}" placeholder="Bloque ${b}" autocomplete="off"></div></form><p class="lead" style="margin:0">Vacío vuelve a «Bloque ${b}».</p></div>
  <div class="pn-f"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit" form="bq-form" id="bq-ok">${ic('save')}Guardar</button></div>`, 'dlg');
  setTimeout(() => $('#bq-nombre')?.focus(), 40);
}
async function guardarBloque(b){
  if (!needWrite()) return;
  const v = limpiarNombre($('#bq-nombre').value).slice(0, 40), hid = fabCtx();
  const modo = await preguntarTodos(`Nombre del bloque ${b}: «${v || `Bloque ${b}`}»`); if (!modo) return;
  try {
    const cur = {...(hojaDocF().bloques || {})}; if (v) cur[b] = v; else delete cur[b];
    await guardarHoja(hid, {bloques:cur}); closePanel(); render(); toast(v ? `Bloque ${b}: ${v}` : `Bloque ${b} sin nombre`);
    if (modo === 'todos') replicar({tipo:'bloque', hoja:hid, b, nombre:v});
  } catch(e){ fail(e); }
}

/* ---------- Aplicar a todos los locales (solo administradora y dueña) ---------- */
function duenaNombre(){
  const d = S.equipo && S.equipo.find ? S.equipo.find(e => ROLN(e.rol) === 'dueno') : null;
  if (!d) return '';
  const n = String(d.nombre || S.names[d.email] || '').trim() || String(d.email || '').split('@')[0];
  return n.charAt(0).toUpperCase() + n.slice(1);
}
function preguntarTodos(que){
  const otros = localesTodos().filter(l => l.id !== S.local);
  if (!esTotal() || !otros.length) return Promise.resolve('uno');
  const dn = duenaNombre(), todos = localesTodos().map(l => l.nombre || l.id);
  return new Promise(res => {
    const d = document.createElement('div'); d.className = 'ask-ov'; d.id = 'ask-todos';
    d.innerHTML = `<div class="ask" role="dialog" aria-modal="true" aria-labelledby="ask-t"><h3 id="ask-t">¿Aplicar a todos los locales${dn ? ` de ${esc(dn)}` : ''}?</h3>
      <p class="lead">${esc(que)}</p><p class="lead" style="margin:0">Todos los locales: <b>${esc(todos.join(' y '))}</b>. En los otros locales se busca la misma hoja y el producto por su nombre; las cantidades no se copian.</p>
      <div class="ask-a"><button class="btn" data-r="">Cancelar</button><button class="btn" data-r="uno" id="ask-uno">Solo ${esc(localNombre())}</button><button class="btn primary" data-r="todos" id="ask-todos-ok">Todos los locales</button></div></div>`;
    const fin = r => { d.remove(); document.removeEventListener('keydown', esc_); res(r); };
    const esc_ = e => { if (e.key === 'Escape'){ e.stopPropagation(); fin(null); } };
    d.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) fin(b.dataset.r || null); else if (e.target === d) fin(null); });
    document.addEventListener('keydown', esc_, true);
    document.body.appendChild(d); setTimeout(() => $('#ask-todos-ok')?.focus(), 20);
  });
}
/* Copia el cambio a la misma hoja de los otros locales (por tipo y nombre de hoja; producto por nombre). Nunca copia cantidades. */
async function replicar(c){
  const otros = localesTodos().filter(l => l.id !== S.local), ok = [], no = [];
  const hojaLocal = S.hojasDB.find(x => x.id === c.hoja);
  for (const L of otros){
    try {
      let hid = c.hoja;
      if (isCustom(c.hoja)){
        const hs = (await S.db.collection(`${L.id}/hojas`).get()).docs.map(d => ({id:d.id, ...d.data()}));
        const m = hojaLocal && hs.find(x => x.tipo === hojaLocal.tipo && norm(x.nombre) === norm(hojaLocal.nombre));
        if (!m){ no.push(`${L.nombre}: no tiene la hoja «${hojaLocal ? hojaLocal.nombre : c.hoja}»`); continue; }
        hid = m.id;
      }
      if (c.tipo === 'bloque'){
        const ref = S.db.collection(`${L.id}/hojas`).doc(hid), cur = await ref.get(), data = cur.exists ? cur.data() : {};
        const bq = {...(data.bloques || {})}; if (c.nombre) bq[c.b] = c.nombre; else delete bq[c.b];
        await ref.set({...data, bloques:bq, actualizado:Date.now()}); ok.push(L.nombre); continue;
      }
      const col = c.col, enHoja = col === 'fabrica' ? (x => (x.hoja || 'fabrica') === hid) : (x => (x.hoja || '') === (hid === 'stock' ? '' : hid));
      const items = (await S.db.collection(`${L.id}/${col}`).get()).docs.map(d => ({id:d.id, ...d.data()})).filter(enHoja);
      const igual = items.find(x => norm(x.nombre) === norm(c.antes || c.data.nombre));
      if (c.tipo === 'agregar'){
        if (items.some(x => norm(x.nombre) === norm(c.data.nombre))){ no.push(`${L.nombre}: «${c.data.nombre}» ya estaba`); continue; }
        const extra = col === 'fabrica'
          ? {local:null, fabrica:null, sinStock:false, orden:(items.filter(x => bloqueOf(x) <= c.data.bloque).reduce((m, x) => Math.max(m, num(x.orden) || 0), 0)) + 0.5, ...(hid !== 'fabrica' ? {hoja:hid} : {})}
          : {stock:null, sinStock:false, orden:items.reduce((m, x) => Math.max(m, num(x.orden) || 0), 0) + 1, ...(hid !== 'stock' ? {hoja:hid} : {})};
        await S.db.collection(`${L.id}/${col}`).doc().set({...c.data, ...extra, creado:Date.now()}); ok.push(L.nombre); continue;
      }
      if (!igual){ no.push(`${L.nombre}: no tiene «${c.antes || c.data.nombre}»`); continue; }
      if (c.tipo === 'eliminar') await S.db.collection(`${L.id}/${col}`).doc(igual.id).delete();
      else await S.db.collection(`${L.id}/${col}`).doc(igual.id).update({...c.data, actualizado:Date.now()});
      ok.push(L.nombre);
    } catch { no.push(`${L.nombre}: no se pudo guardar`); }
  }
  if (no.length) toast(`${ok.length ? `También en ${ok.join(' y ')}. ` : ''}${no.join(' · ')}`, true);
  else if (ok.length) toast(`Aplicado también en ${ok.join(' y ')}`);
}
async function fAgregar(){
  if (!needWrite()) return;
  const nombre = $('#afa-nombre').value.trim(); if (!nombre){ toast('Escribí el nombre del producto.', true); return; }
  if (S.fab.some(x => norm(x.nombre) === norm(nombre))){ toast('Ese producto ya está en la planilla.', true); return; }
  const bloque = Math.max(1, parseInt($('#afa-bloque').value, 10) || 1), resaltar = $('#afa-hl').checked;
  const orden = fOrdenFin(bloque), hid = fabCtx();
  const modo = await preguntarTodos(`Agregar «${nombre}» a ${nombreHoja(hid)} (${bloqueNombre(bloque)})`); if (!modo) return;
  try {
    const hf = fHojaField();
    await w(() => C('fabrica').doc().set({nombre, bloque, resaltar, orden, local:null, fabrica:null, sinStock:false, creado:Date.now(), ...hf}));
    const el = $('#afa-nombre'); if (el){ el.value = ''; el.focus(); } toast(`${nombre} agregado a ${bloqueNombre(bloque)}`);
    if (modo === 'todos') replicar({tipo:'agregar', col:'fabrica', hoja:hid, data:{nombre, bloque, resaltar}});
  } catch(e){ fail(e); }
}
async function fGuardarEdicion(id){
  if (!needWrite()) return;
  const nombre = $('#afe-nombre').value.trim(); if (!nombre){ toast('El nombre no puede quedar vacío.', true); return; }
  const data = {nombre, bloque:Math.max(1, parseInt($('#afe-bloque').value, 10) || 1), resaltar:$('#afe-hl').checked, actualizado:Date.now()};
  const it = S.fab.find(x => x.id === id);
  if (it && bloqueOf(it) !== data.bloque) data.orden = fOrdenFin(data.bloque, id);
  const hid = fabCtx(), antes = it ? it.nombre : nombre;
  const modo = await preguntarTodos(`Modificar «${antes}» en ${nombreHoja(hid)}`); if (!modo) return;
  try {
    await w(() => C('fabrica').doc(id).update(data)); S.aj.editId = null; renderAjustesBody(); if (S.panel === 'fedit') closePanel(); toast('Cambios guardados');
    if (modo === 'todos') replicar({tipo:'modificar', col:'fabrica', hoja:hid, antes, data:{nombre:data.nombre, bloque:data.bloque, resaltar:data.resaltar}});
  } catch(e){ fail(e); }
}
async function fEliminar(id){
  if (!needWrite()) return;
  const it = S.fab.find(x => x.id === id), hid = fabCtx();
  const modo = await preguntarTodos(`Eliminar «${it?.nombre || 'Producto'}» de ${nombreHoja(hid)}`); if (!modo) return;
  try {
    await w(() => C('fabrica').doc(id).delete()); delete S.fdraft[id]; saveDraft(); S.aj.delId = null; renderAjustesBody(); if (S.panel === 'fedit') closePanel(); toast(`${it?.nombre || 'Producto'} eliminado`);
    if (modo === 'todos' && it) replicar({tipo:'eliminar', col:'fabrica', hoja:hid, antes:it.nombre, data:{nombre:it.nombre}});
  } catch(e){ fail(e); }
}
function parseLista(txt){
  const out = []; let cat = '';
  for (const raw of String(txt || '').split(/\r?\n/)){
    const line = raw.trim(); if (!line || /^-{3,}$/.test(line)) continue;
    const parts = line.split(/\t|;|\|/).map(s => s.trim());
    if (parts.length === 1){
      const s = parts[0].replace(/^[-•*·]\s*/, '');
      if (/:$/.test(s) || /^#/.test(s)){ cat = s.replace(/:$/, '').replace(/^#+\s*/, '').trim(); continue; }
      if (s) out.push({nombre:s, cat, unidad:'', min:null, stock:null, proveedor:''});
      continue;
    }
    const [nombre, c, unidad, min, stock, prov] = parts;
    if (!nombre || /^(producto|nombre|item)$/i.test(nombre)) continue;
    out.push({nombre:nombre.replace(/^[-•*·]\s*/, ''), cat:c || cat, unidad:unidad || '', min:num(min), stock:num(stock), proveedor:prov || ''});
  }
  return out;
}
function pasteSplit(){
  const items = parseLista(S.aj.paste); const ex = new Set(S.prods.map(p => norm(p.nombre) + '|' + norm(catOf(p))));
  const seen = new Set(), nuevos = [], dup = [];
  for (const it of items){ const k = norm(it.nombre) + '|' + norm(it.cat || 'Sin categoría'); if (ex.has(k) || seen.has(k)) dup.push(it); else { seen.add(k); nuevos.push(it); } }
  return {nuevos, dup};
}
function pastePreview(){
  if (!S.aj.paste || !S.aj.paste.trim()) return 'Cuando pegues la lista, acá ves cuántos productos se van a cargar.';
  const {nuevos, dup} = pasteSplit(); const nc = new Set(nuevos.map(x => x.cat || 'Sin categoría')).size;
  return `Se van a agregar <b>${nuevos.length}</b> ${nuevos.length === 1 ? 'producto' : 'productos'} en <b>${nc}</b> ${nc === 1 ? 'categoría' : 'categorías'}${dup.length ? ` · ${dup.length} ya existían y se saltean` : ''}.`;
}
async function importar(){
  if (!needWrite() || S.aj.busy) return;
  const {nuevos} = pasteSplit(); if (!nuevos.length){ toast('No hay productos nuevos para importar.'); return; }
  S.aj.busy = true; const btn = $('#ap-btn');
  let orden = Math.max(0, ...S.prods.map(p => num(p.orden) || 0));
  const hf = hojaField();
  const rows = nuevos.map(it => ({nombre:it.nombre, cat:it.cat || '', unidad:it.unidad || 'unidad', min:it.min, stock:it.stock ?? null, sinStock:false, obs:'', proveedor:it.proveedor || '', orden:++orden, creado:Date.now(), ...hf}));
  try {
    for (let i = 0; i < rows.length; i += 5){
      await Promise.all(rows.slice(i, i + 5).map(r => w(() => C('productos').doc().set(r))));
      if (btn) btn.textContent = `Importando ${Math.min(rows.length, i + 5)} de ${rows.length}…`;
    }
    S.aj.paste = ''; S.aj.tab = 'productos'; S.aj.busy = false; renderAjustes();
    toast(`${rows.length} productos importados`);
  } catch(e){ S.aj.busy = false; if (btn) btn.textContent = 'Importar productos'; fail(e); }
}
async function agregar(){
  if (!needWrite()) return;
  const nombre = $('#aa-nombre').value.trim(); if (!nombre){ toast('Escribí el nombre del producto.', true); $('#aa-nombre').focus(); return; }
  const cat = $('#aa-cat').value.trim(), unidad = $('#aa-unidad').value.trim() || 'unidad';
  const min = num($('#aa-min').value), stock = num($('#aa-stock').value), obs = $('#aa-obs').value.trim(), proveedor = limpiarNombre($('#aa-prov').value);
  if (stock != null && (stock < 0 || !isHalf(stock))){ toast('El stock va en unidades enteras o medias (ej. 3 o 3,5).', true); return; }
  if (S.prods.some(p => norm(p.nombre) === norm(nombre) && norm(catOf(p)) === norm(cat || 'Sin categoría'))){ toast('Ya hay un producto con ese nombre en esa categoría.', true); return; }
  const orden = Math.max(0, ...S.prods.map(p => num(p.orden) || 0)) + 1, hid = listaCtx() || 'stock';
  const modo = await preguntarTodos(`Agregar «${nombre}» a ${nombreHoja(hid)}`); if (!modo) return;
  try {
    const hf = hojaField();
    await w(() => C('productos').doc().set({nombre, cat, unidad, min, stock, sinStock:false, obs, proveedor, orden, creado:Date.now(), ...hf}));
    if (modo === 'todos') replicar({tipo:'agregar', col:'productos', hoja:hid, data:{nombre, cat, unidad, min, obs, proveedor}});
    lsSet('spm-lastcat', cat); lsSet('spm-lastunit', unidad); lsSet('spm-lastprov', proveedor);
    $('#aa-nombre').value = ''; $('#aa-min').value = ''; $('#aa-stock').value = ''; $('#aa-obs').value = ''; $('#aa-nombre').focus();
    toast(`${nombre} agregado`);
  } catch(e){ fail(e); }
}
async function guardarEdicion(id){
  if (!needWrite()) return;
  const nombre = $('#ae-nombre').value.trim(); if (!nombre){ toast('El nombre no puede quedar vacío.', true); return; }
  const data = {nombre, cat:$('#ae-cat').value.trim(), unidad:$('#ae-unidad').value.trim() || 'unidad', min:num($('#ae-min').value), proveedor:limpiarNombre($('#ae-prov').value), obs:$('#ae-obs').value.trim(), actualizado:Date.now()};
  const p0 = S.allProds.find(x => x.id === id), antes = p0 ? p0.nombre : nombre, hid = listaCtx() || 'stock';
  const modo = await preguntarTodos(`Modificar «${antes}» en ${nombreHoja(hid)}`); if (!modo) return;
  try {
    await w(() => C('productos').doc(id).update(data)); S.aj.editId = null; renderAjustesBody(); toast('Cambios guardados');
    if (modo === 'todos'){ const {actualizado:_a, ...rest} = data; replicar({tipo:'modificar', col:'productos', hoja:hid, antes, data:rest}); }
  } catch(e){ fail(e); }
}
async function eliminar(id){
  if (!needWrite()) return;
  const p = S.prods.find(x => x.id === id), hid = listaCtx() || 'stock';
  const modo = await preguntarTodos(`Eliminar «${p?.nombre || 'Producto'}» de ${nombreHoja(hid)}`); if (!modo) return;
  try {
    await w(() => C('productos').doc(id).delete()); delete S.draft[id]; delete S.notas[id]; saveDraft(); S.aj.delId = null; renderAjustesBody(); toast(`${p?.nombre || 'Producto'} eliminado`);
    if (modo === 'todos' && p) replicar({tipo:'eliminar', col:'productos', hoja:hid, antes:p.nombre, data:{nombre:p.nombre}});
  } catch(e){ fail(e); }
}
async function renombrarCat(oldC, nuevo){
  if (!needWrite()) return; nuevo = nuevo.trim(); if (!nuevo || nuevo === oldC){ S.aj.catEdit = null; renderAjustesBody(); return; }
  const ps = S.prods.filter(p => catOf(p) === oldC);
  try { await batchRun(ps, p => C('productos').doc(p.id).update({cat:nuevo})); if (S.cat === oldC) S.cat = nuevo; S.aj.catEdit = null; renderAjustesBody(); toast(`Categoría renombrada a ${nuevo}`); } catch(e){ fail(e); }
}
function renderAjustesBody(){
  const b = $('#aj-body'); if (!b) return;
  const ae = document.activeElement, fid = ae && ae.id && b.contains(ae) ? ae.id : null;
  let sel = null; try { if (fid && ae.selectionStart != null) sel = [ae.selectionStart, ae.selectionEnd]; } catch {}
  b.innerHTML = AJ[S.aj.tab]();
  document.querySelectorAll('#pn .seg [data-tab]').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === S.aj.tab));
  const t0 = document.querySelector('#pn .seg [data-tab="productos"]'); if (t0) t0.textContent = `Productos (${S.prods.length})`;
  const t1 = document.querySelector('#pn .seg [data-tab="f-items"]'); if (t1) t1.textContent = `Productos (${S.fab.length})`;
  if (fid){ const el = document.getElementById(fid); if (el){ el.focus({preventScroll:true}); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch {} } }
}

/* ---------- Imprimir / PDF: con fecha ---------- */
window.addEventListener('beforeprint', () => { const c = $('#crumb'); if (c) c.dataset.pdate = 'Impreso el ' + fechaHora(Date.now()); });

/* ---------- Instalar como app ---------- */
let installEvt = null;
const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
function renderInstall(){ const b = $('#inst'); if (b) b.hidden = standalone(); }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderInstall(); });
window.addEventListener('appinstalled', () => { installEvt = null; renderInstall(); toast('App instalada. Ya la tenés en la pantalla de inicio.'); });
function openInstall(){
  $('#app').classList.remove('open'); $('#scrim').hidden = true;
  if (installEvt){ const ev = installEvt; ev.prompt(); ev.userChoice.finally(() => { installEvt = null; renderInstall(); }); return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const pIos = `<div class="steps"><b>iPhone o iPad (Safari)</b><ol><li>Tocá el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li><li>Elegí <b>Agregar a pantalla de inicio</b>.</li><li>Tocá <b>Agregar</b>.</li></ol></div>`;
  const pAnd = `<div class="steps"><b>Android (Chrome)</b><ol><li>Tocá el menú <b>⋮</b> arriba a la derecha.</li><li>Elegí <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</li><li>Confirmá con <b>Instalar</b>.</li></ol></div>`;
  S.panel = 'install';
  openPanel(`<div class="pn-h"><div><small>Celular</small><h3>Instalar como app</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="pn-b"><p class="lead">Queda el ícono de GestLok en la pantalla de inicio y se abre a pantalla completa, como cualquier app. Se entra con la misma cuenta.</p>${ios ? pIos + pAnd : pAnd + pIos}</div>`, 'dlg');
}

/* ---------- Ordenar arrastrando (Ajustes) ---------- */
const dragHandle = (id, nombre) => `<button type="button" class="grip" data-drag="${esc(id)}" aria-label="Mover ${esc(nombre)}: arrastrá o usá las flechas del teclado" title="Arrastrá para ordenar">${ic('grip')}</button>`;
let DR = null;
function dragOrder(list){
  const out = []; let bq = null;
  for (const el of list.children){
    if (el.dataset.bloque) bq = Number(el.dataset.bloque);
    else if (el.dataset.rid) out.push({id:el.dataset.rid, bloque:bq});
  }
  return out;
}
async function guardarOrden(list){
  if (!needWrite()) return;
  const fab = /^f-/.test(S.aj.tab), seq = dragOrder(list);
  S.aj.ordering = true;
  try {
    if (fab){
      const first = seq.find(x => x.bloque != null), b0 = first ? first.bloque : 1;
      const cambios = seq.map((x, i) => ({it:S.fab.find(f => f.id === x.id), orden:i + 1, bloque:x.bloque ?? b0})).filter(c => c.it && (num(c.it.orden) !== c.orden || bloqueOf(c.it) !== c.bloque));
      if (!cambios.length) return;
      await batchRun(cambios, c => C('fabrica').doc(c.it.id).update({orden:c.orden, bloque:c.bloque}));
    } else {
      const all = sorted(), ids = seq.map(x => x.id), set = new Set(ids);
      const slots = all.map((p, i) => set.has(p.id) ? i : -1).filter(i => i >= 0), out = [...all];
      slots.forEach((slot, k) => { out[slot] = all.find(p => p.id === ids[k]) || out[slot]; });
      const cambios = out.map((p, i) => ({p, orden:i + 1})).filter(c => num(c.p.orden) !== c.orden);
      if (!cambios.length) return;
      await batchRun(cambios, c => C('productos').doc(c.p.id).update({orden:c.orden}));
    }
    toast('Orden guardado');
  } catch(e){ fail(e); }
  finally { S.aj.ordering = false; if (S.panel === 'ajustes') renderAjustesBody(); }
}
document.addEventListener('pointerdown', e => {
  const h = e.target.closest && e.target.closest('[data-drag]'); if (!h || !canW() || (e.button != null && e.button > 0)) return;
  const row = h.closest('[data-rid]'), list = row && row.parentElement; if (!list) return;
  e.preventDefault();
  DR = {row, list, id:h.dataset.drag, y:e.clientY, moved:false, start:dragOrder(list).map(x => x.id + ':' + x.bloque).join()};
  row.classList.add('dragging'); list.classList.add('sorting');
  try { h.setPointerCapture(e.pointerId); } catch {}
});
document.addEventListener('pointermove', e => {
  if (!DR) return;
  const y = e.clientY; if (Math.abs(y - DR.y) > 3) DR.moved = true;
  const sibs = [...DR.list.children].filter(el => el !== DR.row);
  let before = null;
  for (const el of sibs){ const r = el.getBoundingClientRect(); if (y < r.top + r.height / 2){ before = el; break; } }
  if (before !== DR.row.nextElementSibling) DR.list.insertBefore(DR.row, before);
  const sc = $('#pn'), r = sc.getBoundingClientRect();
  if (y < r.top + 70) sc.scrollTop -= 14; else if (y > r.bottom - 70) sc.scrollTop += 14;
});
function dragEnd(){
  if (!DR) return;
  const d = DR; DR = null;
  d.row.classList.remove('dragging'); d.list.classList.remove('sorting');
  const now = dragOrder(d.list).map(x => x.id + ':' + x.bloque).join();
  if (now !== d.start) guardarOrden(d.list);
}
document.addEventListener('pointerup', dragEnd);
document.addEventListener('pointercancel', dragEnd);
document.addEventListener('input', e => { if(e.target.matches('[data-diario-num]')) { const f=e.target.closest('#diario-form');if(f)refrescarDiarioPreview(f); } if(e.target.matches('[data-prov-val]')) actualizarValorProveedor(e.target); });
document.addEventListener('keydown', e => {
  const h = e.target.closest && e.target.closest('[data-drag]'); if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const row = h.closest('[data-rid]'), list = row.parentElement;
  if (e.key === 'ArrowUp'){ const prev = row.previousElementSibling; if (!prev) return; list.insertBefore(row, prev); }
  else { const next = row.nextElementSibling; if (!next) return; list.insertBefore(row, next.nextElementSibling); }
  h.focus(); clearTimeout(DR_T); DR_T = setTimeout(() => guardarOrden(list), 700);
});
let DR_T = null;

/* ---------- Ingreso de mercadería (solo dueña y administradora) ---------- */
/* La dueña elige la sucursal y la operación, carga un archivo y revisa. Nada cambia hasta Confirmar importación:
   ahí la base (importar_mercaderia) vuelve a verificar rol, sucursal, productos y valores, y guarda todo junto. */
let ingP = null;
function cargarIngreso(){
  if (window.MGSIngreso) return Promise.resolve(window.MGSIngreso);
  if (!ingP) ingP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = new URL('ingreso.js?v=1', JS_BASE).href; s.async = true;
    s.onload = () => window.MGSIngreso ? res(window.MGSIngreso) : rej(new Error('ingreso'));
    s.onerror = () => { ingP = null; s.remove(); rej(new Error('No se pudo cargar el lector de archivos. Revisá la conexión.')); };
    document.head.appendChild(s);
  });
  return ingP;
}
const ingNuevo = () => ({local:'', op:'', fabCampo:'fabrica', datos:null, cargando:false, err:'', arch:null, leyendo:false, hojaSel:0, col:null, lineas:[], dec:{}, cant:{}, on:{}, campo:{}, clave:'', msg:null, res:null, hist:null, histOpen:{}, busy:false});
const ING_OP = {ingreso:'Ingreso', conteo:'Conteo'};
/* Hojas y productos de la sucursal elegida, leídos una sola vez (solo lectura) */
function hojasDe(hdb){
  const ov = new Map(hdb.map(h => [h.id, h]));
  const base = BASE.map(b => { const o = ov.get(b.id) || {}; return {id:b.id, tipo:b.tipo, nombre:String(o.nombre || '').trim() || b.nombre, oculta:!!o.oculta}; });
  const nuevas = hdb.filter(h => isCustom(h.id) && TIPOS[h.tipo]).map(h => ({id:h.id, tipo:h.tipo, nombre:String(h.nombre || '').trim() || 'Hoja nueva', oculta:false}));
  return [...base, ...nuevas];
}
function armarDestinos(ps, fs, hdb){
  const hs = hojasDe(hdb), by = id => hs.find(h => h.id === id);
  const dest = [];
  /* Los remitos solo van a hojas «Local + Ingreso» (columna Ingreso): las demás hojas no se tocan */
  for (const it of fs){
    const h = by(it.hoja || 'fabrica');
    if (!h || h.oculta || h.tipo !== 'ingreso') continue;
    dest.push({key:'f:' + it.id, col:'fabrica', id:it.id, nombre:String(it.nombre || ''), hoja:it.hoja || 'fabrica', hojaNombre:h.nombre, unidad:'', cat:'', vals:{local:num(it.local), fabrica:num(it.fabrica)}});
  }
  return {dest, map:new Map(dest.map(d => [d.key, d])), hojas:hs.filter(h => !h.oculta)};
}
async function ingCargar(quieto){
  const I = S.ing, loc = I.local; if (!loc) return;
  if (!quieto){ I.cargando = true; I.err = ''; render(); }
  try {
    const [ps, fs, hs] = await Promise.all(['productos', 'fabrica', 'hojas'].map(c => S.db.collection(`${loc}/${c}`).get()));
    if (S.ing !== I || I.local !== loc) return;
    I.datos = armarDestinos(ps.docs.map(d => ({id:d.id, ...d.data()})), fs.docs.map(d => ({id:d.id, ...d.data()})), hs.docs.map(d => ({id:d.id, ...d.data()})));
    if (I.arch && !I.arch.error && !I.leyendo && (I.arch.hojas || I.arch.texto != null) && window.MGSIngreso) ingProcesar(true);
  } catch(e){ if (S.ing === I) I.err = `No se pudieron leer los productos de ${localNombre(loc)}. Revisá la conexión y volvé a elegir la sucursal.`; }
  if (S.ing === I){ I.cargando = false; render(); ingHist(); }
}
async function ingHist(){
  const I = S.ing; if (!I || !I.local) return;
  try {
    const snap = await S.db.collection('importaciones').get();
    if (S.ing !== I) return;
    I.hist = snap.docs.map(d => ({id:d.id, ...d.data()})).filter(h => h.local === I.local).sort((a, b) => (b.fecha || 0) - (a.fecha || 0)).slice(0, 15);
  } catch { if (S.ing === I) I.hist = []; }
  if (S.view === 'ingreso') render();
}
async function ingArchivo(file){
  const I = S.ing; if (!I || !file) return;
  I.arch = {nombre:String(file.name || 'archivo').slice(0, 200), tam:file.size, tipo:String(file.type || '').slice(0, 80)}; I.lineas = []; I.res = null; I.msg = null; I.leyendo = true; render();
  try {
    const M = await cargarIngreso(), r = await M.leerArchivo(file, t => { I.prog = t; const el = document.getElementById('ing-prog'); if (el) el.textContent = t; });
    Object.assign(I.arch, {hash:r.hash, kind:r.tipo, hojas:r.hojas || null, texto:r.texto ?? null, ocr:!!r.ocr});
    I.hojaSel = 0; I.col = r.hojas ? M.columnas(r.hojas[0].filas) : null;
    if (I.datos) ingProcesar();
  } catch(e){ I.arch.error = e && e.message ? e.message : 'No se pudo leer el archivo.'; }
  I.leyendo = false; I.prog = ''; render();
}
function ingProcesar(mantener){
  const M = window.MGSIngreso, I = S.ing; if (!M || !I.arch || !I.datos) return;
  const ren = I.arch.texto != null ? M.renglonesTexto(I.arch.texto) : M.renglonesTabla((I.arch.hojas[I.hojaSel] || {filas:[]}).filas, I.col);
  I.lineas = M.coincidencias(ren.slice(0, 1000), I.datos.dest).map((r, i) => ({...r, i}));
  if (!mantener){ I.dec = {}; I.cant = {}; I.on = {}; I.campo = {}; }
  I.clave = ''; I.msg = null;
  const firma = JSON.stringify(ren.map(r => [M.norm(r.nombre), r.cantidad, r.unidad]).sort());
  M.huella(firma).then(h => { if (S.ing === I && I.arch) I.arch.contenido = h; });
}
/* Destino final de cada renglón: elegido por la dueña o sugerido por el reconocimiento ('' = no importar) */
function ingDestino(r){
  const I = S.ing;
  if (has(I.dec, r.i)) return I.dec[r.i];
  return r.estado === 'coincide' || r.estado === 'parecido' ? r.key : (r.estado === 'ignorado' ? '' : undefined);
}
function ingPlan(){
  const I = S.ing, M = window.MGSIngreso, D = I.datos ? I.datos.map : new Map();
  const grupos = new Map(), pend = [], ign = [];
  for (const r of I.lineas){
    const k = ingDestino(r);
    if (k === undefined){ pend.push(r); continue; }
    if (!k || !D.has(k)){ ign.push(r); continue; }
    if (!grupos.has(k)) grupos.set(k, {key:k, d:D.get(k), rs:[]});
    grupos.get(k).rs.push(r);
  }
  const filas = [...grupos.values()].map(g => {
    const d = g.d, campo = d.col === 'fabrica' ? (I.campo[g.key] || I.fabCampo) : 'stock';
    const qs = g.rs.map(r => r.cantidad), conCant = qs.filter(q => q != null);
    let det = null, valores = false;
    if (conCant.length === qs.length && qs.length){
      if (I.op === 'conteo'){ valores = new Set(qs).size > 1; det = valores ? null : qs[0]; }
      else det = round(qs.reduce((a, b) => a + b, 0));
    }
    const raw = has(I.cant, g.key) ? I.cant[g.key] : (det == null ? '' : fmtIn(det));
    const cant = numQ(raw), cantOk = cant != null && cant >= 0 && isQuarter(cant) && cant <= 100000;
    const du = d.col === 'productos' ? (M ? M.unidadDe(d.unidad || 'unidad') : null) : null;
    const uniDist = !!(du && g.rs.some(r => r.unidad && r.unidad !== du));
    /* Un renglón elegido por la dueña (destino o producto) cuenta como revisado */
    const elegido = g.rs.some(r => has(I.dec, r.i)), parecido = g.rs.some(r => r.estado !== 'coincide' && !has(I.dec, r.i));
    const estado = (valores && !has(I.cant, g.key)) ? 'valores' : !cantOk ? 'cantidad' : uniDist ? 'unidad' : parecido ? 'parecido' : elegido ? 'elegido' : 'coincide';
    const on = has(I.on, g.key) ? !!I.on[g.key] && cantOk : !(I.arch && I.arch.ocr) && (estado === 'coincide' || estado === 'elegido');
    const antes = d.vals[campo] ?? null, despues = cantOk ? (I.op === 'ingreso' ? round((antes || 0) + cant) : cant) : null;
    return {...g, campo, det, raw, cant, cantOk, estado, on, antes, despues, valores, uniDist};
  }).sort((a, b) => a.d.hojaNombre.localeCompare(b.d.hojaNombre, 'es') || a.d.nombre.localeCompare(b.d.nombre, 'es'));
  const elegidas = filas.filter(f => f.on && f.cantOk);
  const items = elegidas.map(f => ({col:f.d.col, id:f.d.id, campo:f.campo, cantidad:f.cant, antes:f.antes, nombre:f.d.nombre, nombreHoja:f.d.hojaNombre, lineas:f.rs.map(r => String(r.texto || r.nombre).slice(0, 160))}));
  const ignorados = [...ign, ...filas.filter(f => !f.on).flatMap(f => f.rs)].map(r => String(r.texto || r.nombre).slice(0, 160));
  return {filas, pend, ign, items, ignorados};
}
const ING_EST = {coincide:['ok', 'Coincide'], elegido:['ok', 'Elegido'], parecido:['bajo', 'Revisar'], unidad:['bajo', 'Unidad distinta'], valores:['bajo', 'Valores distintos'], cantidad:['sin', 'Falta cantidad']};
function ingOpts(cands, sel, conNo){
  const D = S.ing.datos.map, ks = [...new Set([...(cands || []).map(c => c.key), ...(sel && D.has(sel) ? [sel] : [])])];
  return `${conNo ? `<option value="" ${sel === '' ? 'selected' : ''}>No importar</option>` : ''}${ks.map(k => { const d = D.get(k); return d ? `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(d.nombre)} — ${esc(d.hojaNombre)}</option>` : ''; }).join('')}`;
}
function ingTodos(sel){
  const D = S.ing.datos, por = new Map();
  for (const d of D.dest){ if (!por.has(d.hojaNombre)) por.set(d.hojaNombre, []); por.get(d.hojaNombre).push(d); }
  return `<option value="" ${!sel ? 'selected' : ''}>No importar</option>${[...por].map(([h, ds]) => `<optgroup label="${esc(h)}">${ds.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(d => `<option value="${esc(d.key)}" ${d.key === sel ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</optgroup>`).join('')}`;
}
const ingTam = n => n > 1048576 ? `${fmt(round(n / 1048576))} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
V.ingreso = () => {
  if (!esTotal()) return V.inicio();
  const I = S.ing || (S.ing = ingNuevo());
  const locs = localesTodos(), loc = I.local, nomLoc = loc ? localNombre(loc) : '';
  const paso1 = `<section class="card pad ing-c"><div class="ch"><h4>1. Sucursal</h4></div>
    <p class="lead" style="margin:0 0 10px">Los cambios se aplican solo en la sucursal que elijas.</p>
    <div class="ing-ops" role="radiogroup" aria-label="Sucursal">${locs.map(l => `<button class="ing-op" role="radio" aria-checked="${loc === l.id}" data-act="ing-local" data-id="${esc(l.id)}" id="ing-loc-${esc(l.id)}"><b>${esc(l.nombre || l.id)}</b></button>`).join('')}</div>
    ${I.cargando ? `<p class="lead" style="margin:10px 0 0">Leyendo los productos de ${esc(nomLoc)}…</p>` : ''}${I.err ? `<p class="note warn" style="margin:10px 0 0">${esc(I.err)}</p>` : ''}
    ${I.datos && !I.cargando ? (I.datos.dest.length ? `<p class="lead" style="margin:10px 0 0">Se carga en la columna Ingreso de ${esc(I.datos.hojas.filter(h => h.tipo === 'ingreso').map(h => `«${h.nombre}»`).join(', '))} (${plural(I.datos.dest.length, 'producto', 'productos')}). Las demás hojas no se tocan.</p>` : `<p class="note warn" style="margin:10px 0 0" id="ing-sinhoja">${esc(localNombre(loc))} no tiene una hoja «Local + Ingreso». Creala desde Hojas → Agregar hoja (tipo «Local + Ingreso») y cargale los productos.</p>`) : ''}</section>`;
  const paso2 = `<section class="card pad ing-c"><div class="ch"><h4>2. Operación</h4></div>
    <div class="ing-ops" role="radiogroup" aria-label="Operación">
      <button class="ing-op" role="radio" aria-checked="${I.op === 'ingreso'}" data-act="ing-op" data-op="ingreso" id="ing-op-ingreso"><b>Ingreso</b><small>Suma lo del remito a la columna Ingreso</small></button>
      <button class="ing-op" role="radio" aria-checked="${I.op === 'conteo'}" data-act="ing-op" data-op="conteo" id="ing-op-conteo"><b>Reemplazar</b><small>La columna Ingreso queda con la cantidad del remito</small></button>
    </div>
</section>`;
  const listo = !!(loc && I.op && I.datos && !I.cargando && I.datos.dest.length);
  let archTxt = '';
  if (I.arch){
    const A = I.arch, hojasSel = A.hojas && A.hojas.length > 1 ? `<div class="fld"><label for="ing-hoja">Hoja del Excel</label><select id="ing-hoja">${A.hojas.map((h, i) => `<option value="${i}" ${i === I.hojaSel ? 'selected' : ''}>${esc(h.nombre)} (${h.filas.length} filas)</option>`).join('')}</select></div>` : '';
    let cols = '';
    if (A.hojas && I.col && !A.error){
      const f = (A.hojas[I.hojaSel] || {filas:[]}).filas, n = Math.max(1, ...f.slice(0, 50).map(x => x.length)), hdr = I.col.encabezado >= 0 ? f[I.col.encabezado] : null;
      const letra = i => String.fromCharCode(65 + (i % 26)), op = (k, conNo) => `${conNo ? `<option value="-1" ${I.col[k] < 0 ? 'selected' : ''}>${k === 'cantidad' ? 'En el mismo renglón' : 'No hay'}</option>` : ''}${Array.from({length:n}, (_, i) => `<option value="${i}" ${I.col[k] === i ? 'selected' : ''}>Columna ${letra(i)}${hdr && hdr[i] ? ` · ${esc(String(hdr[i]).slice(0, 24))}` : ''}</option>`).join('')}`;
      cols = `<div class="frow ing-cols"><div class="fld"><label for="ing-col-producto">Producto</label><select id="ing-col-producto" data-ingcol="producto">${op('producto', false)}</select></div><div class="fld"><label for="ing-col-cantidad">Cantidad</label><select id="ing-col-cantidad" data-ingcol="cantidad">${op('cantidad', true)}</select></div><div class="fld"><label for="ing-col-unidad">Unidad</label><select id="ing-col-unidad" data-ingcol="unidad">${op('unidad', true)}</select></div></div>`;
    }
    archTxt = `<div class="ing-file"><span class="six">${ic('list')}</span><div><b>${esc(A.nombre)}</b><small id="ing-prog-w">${ingTam(A.tam || 0)}${I.leyendo ? ` · <span id="ing-prog">${esc(I.prog || 'Leyendo…')}</span>` : A.error ? '' : I.lineas.length ? ` · ${plural(I.lineas.length, 'renglón leído', 'renglones leídos')}` : ''}</small></div><button class="btn sm" data-act="ing-quitar" ${I.busy ? 'disabled' : ''}>${ic('x')}Quitar</button></div>
      ${A.error ? `<p class="note warn" id="ing-err">${esc(A.error)}</p>` : ''}${A.ocr && !A.error && !I.leyendo ? `<p class="note warn" id="ing-ocr">Leído de ${A.kind === 'pdf' ? 'un PDF escaneado' : 'una foto'}: <b>revisá cada renglón</b> y tildá los correctos. La lectura de imágenes puede confundir letras o números.</p>` : ''}${hojasSel}${cols}`;
  }
  const paso3 = `<section class="card pad ing-c"><div class="ch"><h4>3. Remito</h4></div>
    ${listo ? (I.arch ? archTxt : `<label class="ing-drop" id="ing-drop" for="ing-file"><span class="btn primary ing-rem">${ic('in')}Ingresar remito</span><small>Sacá una foto del remito o elegí un PDF, Excel (.xlsx) o CSV. Se lee en este dispositivo; no se sube a ningún lado.</small></label><input type="file" id="ing-file" class="ing-inp" accept="image/*,.pdf,application/pdf,.xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">`)
      : `<p class="lead" style="margin:0">Primero elegí la sucursal y la operación.</p>`}</section>`;
  let paso4 = '';
  if (listo && I.arch && !I.arch.error && !I.leyendo && I.res){
    const R = I.res;
    paso4 = `<section class="card pad ing-c ing-ok" id="ing-listo"><div class="ch"><h4>Listo: ${plural(R.aplicados, 'producto actualizado', 'productos actualizados')} en ${esc(localNombre(R.local))}</h4></div>
      <p class="lead">${R.repetida ? 'Esta importación ya estaba guardada: no se sumó dos veces. ' : ''}Operación: <b>${ING_OP[R.op]}</b>. Quedó registrado en el historial de abajo.</p>
      ${R.repetida ? '' : `<div class="ing-t ing-res">${R.items.map(it => `<div class="ing-r"><div class="ing-p"><b>${esc(it.nombre)}</b><small>${esc(it.nombreHoja)}${it.col === 'fabrica' ? ` · ${it.campo === 'local' ? 'Local' : 'Ingreso'}` : ''}</small></div><span class="num">${fmt(it.antes)} → <b>${fmt(R.op === 'ingreso' ? round((it.antes || 0) + it.cantidad) : it.cantidad)}</b></span></div>`).join('')}</div>`}
      <div class="bar-a" style="margin-top:12px"><button class="btn primary" data-act="ing-otro">${ic('plus')}Cargar otro archivo</button></div></section>`;
  } else if (listo && I.arch && !I.arch.error && !I.leyendo){
    const P = ingPlan(), F = P.filas;
    const fila = f => {
      const [cls, txt] = ING_EST[f.estado], k = esc(f.key), sel = f.rs.map(r => ingDestino(r))[0];
      const cands = f.rs.flatMap(r => r.cands || []);
      return `<div class="ing-r ${f.on ? 'on' : ''}" id="ing-g-${k}">
        <label class="ing-ck"><input type="checkbox" data-ingon="${k}" ${f.on ? 'checked' : ''} ${f.cantOk ? '' : 'disabled'} aria-label="Importar ${esc(f.d.nombre)}"></label>
        <div class="ing-p"><b>${esc(f.d.nombre)}</b><small title="${esc(f.rs.map(r => r.texto).join(' | '))}">Archivo: «${esc(String(f.rs[0].texto || f.rs[0].nombre).slice(0, 70))}»${f.rs.length > 1 ? ` y ${f.rs.length - 1} más` : ''}${f.rs[0].fila ? ` · fila ${f.rs.map(r => r.fila).join(', ')}` : ''}</small></div>
        <div class="ing-h"><select data-ingdest="${k}" aria-label="Destino de ${esc(f.d.nombre)}">${ingOpts(cands, sel, true)}</select></div>
        <span class="ing-n"><small>Detectado</small>${f.det == null ? (f.valores ? f.rs.map(r => fmt(r.cantidad)).join(' / ') : '—') : fmt(f.det)}${f.rs.some(r => r.unidadTxt) ? ` <small>${esc(f.rs.find(r => r.unidadTxt).unidadTxt)}</small>` : ''}</span>
        <span class="ing-n ing-q"><small>Cantidad</small><input data-ingcant="${k}" id="ing-q-${k}" inputmode="decimal" autocomplete="off" value="${esc(f.raw)}" class="${f.cantOk ? '' : 'bad'}" aria-label="Cantidad de ${esc(f.d.nombre)}"></span>
        <span class="ing-n"><small>Actual</small>${fmt(f.antes)}</span>
        <span class="ing-n ing-res-c"><small>Resultado</small><b>${f.despues == null ? '—' : fmt(f.despues)}</b></span>
        <span class="ing-e"><span class="st ${cls}">${txt}</span>${f.uniDist ? `<small>Producto en ${esc(f.d.unidad)}; el archivo dice ${esc(f.rs.find(r => r.unidad).unidadTxt)}</small>` : f.valores && !has(I.cant, f.key) ? `<small>El archivo trae ${f.rs.map(r => fmt(r.cantidad)).join(' y ')}: escribí la correcta</small>` : f.estado === 'parecido' ? `<small>Nombre parecido: revisalo</small>` : ''}</span>
      </div>`;
    };
    const pendHTML = P.pend.length ? `<div class="ing-sec" id="ing-pend"><h5>Necesitan tu decisión (${P.pend.length})</h5>${P.pend.map(r => `<div class="ing-d"><div><b>«${esc(String(r.texto || r.nombre).slice(0, 80))}»</b><small>${esc(r.motivo)} · cantidad ${r.cantidad == null ? '—' : fmt(r.cantidad)}</small></div><select data-ingdec="${r.i}" id="ing-dec-${r.i}" aria-label="Destino de ${esc(r.nombre)}"><option value="" disabled selected>Elegí el destino…</option>${ingOpts(r.cands, null, false)}<option value="-">No importar</option></select></div>`).join('')}</div>` : '';
    const ignHTML = P.ign.length ? `<details class="ing-sec" id="ing-ign" ${P.ign.length <= 8 ? 'open' : ''}><summary><h5>Ignorados (${P.ign.length})</h5></summary><p class="lead" style="margin:4px 0 8px">No se importan. Si alguno es un producto que ya existe, elegilo; nunca se crean productos nuevos.</p>${P.ign.map(r => `<div class="ing-d"><div><b>«${esc(String(r.texto || r.nombre).slice(0, 80))}»</b><small>${esc(r.cantidad == null ? 'Sin cantidad' : r.motivo || 'Sin destino')}${r.cantidad != null ? ` · cantidad ${fmt(r.cantidad)}` : ''}</small></div><select data-ingdec="${r.i}" id="ing-dec-${r.i}" aria-label="Asignar ${esc(r.nombre)}">${ingTodos(ingDestino(r))}</select></div>`).join('')}</details>` : '';
    const n = P.items.length, bloqueo = P.pend.length ? `Elegí el destino de ${plural(P.pend.length, 'renglón', 'renglones')} (o «No importar»).` : !n ? 'Tildá al menos un producto para importar.' : S.offline ? 'Sin internet: conectate para confirmar.' : '';
    const msg = I.msg ? `<div class="note ${I.msg.t === 'ok' ? '' : 'warn'} ing-msg" id="ing-msg"><b>${esc(I.msg.h)}</b> ${I.msg.b}${I.msg.t === 'net' ? `<div class="bar-a" style="margin-top:8px"><button class="btn sm primary" data-act="ing-confirmar" id="ing-retry">Reintentar</button></div>` : ''}</div>` : '';
    paso4 = `<section class="card pad ing-c" id="ing-vista"><div class="ch"><h4>4. Revisar y confirmar</h4><span class="num">${esc(nomLoc)} · ${ING_OP[I.op]}</span></div>
      <p class="lead">${I.op === 'ingreso' ? 'Se <b>suma</b> la cantidad al stock actual.' : 'La cantidad <b>reemplaza</b> el valor actual.'} Podés corregir cantidades y destinos. Solo se guardan los tildados.</p>
      <div class="ing-sum">${I.arch.ocr && F.some(f => !f.on && f.cantOk && (f.estado === 'coincide' || f.estado === 'elegido')) ? `<button class="btn sm" data-act="ing-tildar" id="ing-tildar">${ic('check')}Tildar los que coinciden</button>` : ''}<span class="pill ok">${n} para importar</span>${P.pend.length ? `<span class="pill warn">${P.pend.length} para decidir</span>` : ''}<span class="pill">${P.ign.length} ignorados</span></div>
      ${F.length ? `<div class="ing-t" id="ing-tabla"><div class="ing-r ing-hd"><span></span><span>Producto</span><span>Hoja de destino</span><span class="ing-n">Detectado</span><span class="ing-n">Cantidad</span><span class="ing-n">Actual</span><span class="ing-n">Resultado</span><span>Estado</span></div>${F.map(fila).join('')}</div>` : `<p class="note warn" id="ing-nada">Ningún renglón coincide con productos de ${esc(nomLoc)}. No se va a modificar nada.</p>`}
      ${pendHTML}${ignHTML}${msg}
      <div class="ing-pie">${bloqueo ? `<small id="ing-bloqueo">${bloqueo}</small>` : '<span></span>'}<div class="bar-a"><button class="btn" data-act="ing-cancelar" ${I.busy ? 'disabled' : ''}>Cancelar</button><button class="btn primary" data-act="ing-confirmar" id="ing-ok" ${bloqueo || I.busy ? 'disabled' : ''}>${ic('save')}${I.busy ? 'Guardando…' : `Confirmar importación${n ? ` (${n})` : ''}`}</button></div></div></section>`;
  }
  const H = I.hist;
  const hist = loc ? `<section class="card pad ing-c" id="ing-hist"><div class="ch"><h4>Últimos ingresos en ${esc(nomLoc)}</h4></div>${H == null ? '<p class="lead" style="margin:0">Cargando…</p>' : !H.length ? '<p class="lead" style="margin:0">Todavía no hay ingresos de mercadería en esta sucursal.</p>' : `<div class="alist">${H.map(h => `<div class="ar ing-hr"><div><b>${esc(ING_OP[h.operacion] || h.operacion)} · ${esc(fechaHora(h.fecha))}</b><small>${esc((h.archivo && h.archivo.nombre) || 'archivo')} · ${plural((h.items || []).length, 'producto', 'productos')} · ${esc(String(h.por || '').split('@')[0])}${h.forzada ? ' · importado de nuevo' : ''}</small>${I.histOpen[h.id] ? `<div class="ing-hd2">${(h.items || []).map(it => `<div><span>${esc(it.nombre)} <small>${esc(it.nombreHoja || '')}${it.col === 'fabrica' ? ` · ${it.campo === 'local' ? 'Local' : 'Ingreso'}` : ''}</small></span><span class="num">${fmt(it.antes)} → ${fmt(it.despues)}</span></div>`).join('')}${(h.ignorados || []).length ? `<small>Ignorados: ${esc(h.ignorados.slice(0, 20).join(' · '))}</small>` : ''}</div>` : ''}</div><div class="ar-a"><button class="btn sm" data-act="ing-hist" data-id="${esc(h.id)}">${I.histOpen[h.id] ? 'Ocultar' : 'Ver detalle'}</button></div></div>`).join('')}</div>`}</section>` : '';
  return `${banners()}<div class="bar"><p class="lead">Ingresá un remito (foto, PDF, Excel o CSV) de una sucursal y revisá las coincidencias. <b>Nada cambia hasta que toques Confirmar importación.</b> Solo la dueña y la administradora ven esta pantalla.</p></div>
    <div class="ing">${paso1}${paso2}${paso3}${paso4}${hist}</div>`;
};
async function ingConfirmar(forzar){
  const I = S.ing; if (!esTotal() || !I || I.busy) return;
  const P = ingPlan(); if (!P.items.length || P.pend.length) return;
  if (!navigator.onLine){ I.msg = {t:'net', h:'Sin internet.', b:'Lo revisado sigue en pantalla. Cuando vuelva la conexión, tocá Reintentar.'}; render(); return; }
  if (!I.clave) I.clave = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12));
  I.busy = true; I.msg = null; render();
  let r = null;
  try {
    r = await S.db.rpc('importar_mercaderia', {p_local:I.local, p_operacion:I.op, p_items:P.items, p_archivo:{nombre:I.arch.nombre, tipo:I.arch.kind || I.arch.tipo, hash:I.arch.hash || '', contenido:I.arch.contenido || '', ignorados:P.ignorados.slice(0, 300)}, p_clave:I.clave, p_forzar:!!forzar});
  } catch(e){
    I.busy = false;
    const c = e && e.code;
    I.msg = c === 'unavailable' ? {t:'net', h:'No llegó la respuesta.', b:'Puede que se haya guardado o no. Tocá <b>Reintentar</b>: si ya se guardó, no se suma dos veces.'}
      : c === 'sin_permiso' ? {t:'err', h:'Sin permiso.', b:'Solo la dueña o la administradora pueden importar mercadería.'}
      : {t:'err', h:'No se guardó nada.', b:'Revisá los datos y probá de nuevo. ' + esc(c === 'cantidad' ? 'Hay una cantidad inválida.' : c === 'sucursal' ? 'La sucursal no existe.' : '')};
    render(); return;
  }
  I.busy = false;
  if (r && r.estado === 'ok'){ I.res = {...r, items:P.items, local:I.local, op:I.op}; I.clave = ''; I.msg = null; render(); toast(`Ingreso guardado en ${localNombre(I.local)}`); ingCargar(true); return; }
  if (r && r.estado === 'duplicado'){
    render();
    openConfirm('Este archivo ya se importó', `En ${esc(localNombre(I.local))} ya se importó ${r.archivo ? `«${esc(r.archivo)}» ` : 'este contenido '}el ${esc(fechaHora(r.fecha))}${r.por ? ` (${esc(String(r.por).split('@')[0])})` : ''}. Si lo importás de nuevo, ${I.op === 'ingreso' ? 'las cantidades se <b>suman otra vez</b>' : 'se vuelve a cargar el conteo'}.`, 'Importar igual', 'ing-forzar', true);
    return;
  }
  if (r && (r.estado === 'conflicto' || r.estado === 'faltan')){
    const lista = r.estado === 'conflicto' ? (r.cambios || []).map(c => `${esc(c.nombre)} (${fmt(c.antes)} → ahora ${fmt(c.ahora)})`) : (r.productos || []).map(esc);
    I.msg = {t:'warn', h:r.estado === 'conflicto' ? 'No se guardó nada: algunos productos cambiaron mientras revisabas.' : 'No se guardó nada: algunos productos ya no existen.', b:`${lista.join(' · ')}. Actualicé la vista previa; revisala y confirmá de nuevo.`};
    const keep = I.msg; await ingCargar(true); I.msg = keep; render(); return;
  }
  I.msg = {t:'err', h:'No se guardó nada.', b:'Respuesta inesperada. Probá de nuevo.'}; render();
}
/* Un cambio en la revisión pide una confirmación nueva, salvo que la anterior haya quedado sin respuesta (así un reintento no suma dos veces) */
function ingCambio(){ const I = S.ing; if (I && !(I.msg && I.msg.t === 'net')) I.clave = ''; }
function ingQuitar(){ const I = S.ing; I.arch = null; I.lineas = []; I.dec = {}; I.cant = {}; I.on = {}; I.campo = {}; I.clave = ''; I.msg = null; I.res = null; render(); }

/* ---------- Editar hojas ---------- */
function openHojas(add){
  $('#app').classList.remove('open'); $('#scrim').hidden = true;
  S.panel = 'hojas'; S.hj = {editId:null, delId:null, add:!!add, busy:false, tipo:'lista'};
  openPanel('', 'dlg'); renderHojas();
  setTimeout(() => { if (add) $('#hn-nombre')?.focus(); }, 40);
}
function renderHojas(){
  $('#pn').innerHTML = `<div class="pn-h"><div><small>Menú</small><h3>Hojas</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="pn-b">
    <p class="lead">Ordená con las flechas, renombrá, borrá o agregá hojas. Los cambios se ven al instante para todo el equipo.</p>
    ${canW() ? '' : `<p class="note warn">Tu acceso es Solo ver: no podés cambiar las hojas.</p>`}
    <div class="alist" id="hj-list">${hojasList()}</div>
    <div id="hj-new">${hojaNew()}</div>
    <div class="hj-oc" id="hj-oc">${hojasOcultas()}</div>
  </div>`;
}
function refreshHojas(){
  const l = $('#hj-list'); if (l) l.innerHTML = hojasList();
  const o = $('#hj-oc'); if (o) o.innerHTML = hojasOcultas();
}
function hojaItems(h){
  if (h.tipo === 'lista') return S.allProds.filter(p => p.hoja === h.id).length;
  if (esFabT(h.tipo) && !h.base) return S.allFab.filter(it => it.hoja === h.id).length;
  return 0;
}
function hojasList(){
  const vis = visibles();
  if (!vis.length) return `<p class="lead" style="margin:0">No queda ninguna hoja en el menú.</p>`;
  return vis.map((h, i) => hojaRow(h, i, vis.length)).join('');
}
function hojaRow(h, i, n){
  const id = esc(h.id), dis = canW() ? '' : 'disabled';
  if (S.hj.editId === h.id) return `<div class="ar editing"><form id="hr-form" data-id="${id}" class="frow" novalidate>
      <div class="fld wide"><label for="hr-nombre">Nombre de la hoja</label><input id="hr-nombre" value="${esc(h.nombre)}" maxlength="40" required autocomplete="off"></div>
      <div class="bar-a wide"><button type="button" class="btn" data-act="hoja-cancel">Cancelar</button><button type="submit" class="btn primary">Guardar nombre</button></div>
    </form></div>`;
  if (S.hj.delId === h.id){
    const k = hojaItems(h);
    return h.base
      ? `<div class="ar deleting"><div><b>¿Quitar «${esc(h.nombre)}» del menú?</b><small>Sus datos no se borran. La podés volver a mostrar desde acá cuando quieras.</small></div><div class="bar-a"><button class="btn" data-act="hoja-cancel">Cancelar</button><button class="btn danger solid" data-act="hoja-del-ok" data-id="${id}">${ic('trash')}Quitar del menú</button></div></div>`
      : `<div class="ar deleting"><div><b>¿Borrar la hoja «${esc(h.nombre)}»?</b><small>Se borran la hoja y ${k === 1 ? 'su producto' : k ? `sus ${k} productos` : 'su contenido'}. Los conteos ya guardados siguen en el Historial.</small></div><div class="bar-a"><button class="btn" data-act="hoja-cancel">Cancelar</button><button class="btn danger solid" data-act="hoja-del-ok" data-id="${id}">${ic('trash')}Borrar hoja</button></div></div>`;
  }
  const sub = h.base ? h.desc : `${TIPOS[h.tipo].nombre} · ${plural(hojaItems(h), 'producto', 'productos')}`;
  return `<div class="ar hj-r"><span class="hj-ic">${ic(h.ic)}</span><div><b>${esc(h.nombre)}</b><small>${esc(sub)}</small></div>
    <div class="ar-a">
      <button class="ib" data-act="hoja-up" data-id="${id}" aria-label="Subir ${esc(h.nombre)}" title="Subir" ${i === 0 || dis ? 'disabled' : ''}>${ic('up')}</button>
      <button class="ib" data-act="hoja-down" data-id="${id}" aria-label="Bajar ${esc(h.nombre)}" title="Bajar" ${i === n - 1 || dis ? 'disabled' : ''}>${ic('dn')}</button>
      <button class="ib" data-act="hoja-edit" data-id="${id}" aria-label="Renombrar ${esc(h.nombre)}" title="Renombrar" ${dis}>${ic('edit')}</button>
      <button class="ib danger" data-act="hoja-del" data-id="${id}" aria-label="${h.base ? 'Quitar del menú' : 'Borrar'} ${esc(h.nombre)}" title="${h.base ? 'Quitar del menú' : 'Borrar hoja'}" ${dis}>${ic('trash')}</button>
    </div></div>`;
}
function hojasOcultas(){
  const oc = hojas().filter(h => h.oculta); if (!oc.length) return '';
  return `<div class="ml">Quitadas del menú</div><div class="alist">${oc.map(h => `<div class="ar hj-r"><span class="hj-ic">${ic(h.ic)}</span><div><b>${esc(h.nombre)}</b><small>Sus datos siguen guardados</small></div><div class="ar-a"><button class="btn sm" data-act="hoja-show" data-id="${esc(h.id)}" ${canW() ? '' : 'disabled'}>Volver a mostrar</button></div></div>`).join('')}</div>`;
}
function copiaOpts(tipo){
  const src = esFabT(tipo)
    ? [['fabrica', nombreHoja('fabrica'), S.allFab.filter(it => (it.hoja || 'fabrica') === 'fabrica').length], ...hojas().filter(h => !h.base && esFabT(h.tipo)).map(h => [h.id, h.nombre, hojaItems(h)])]
    : [['stock', nombreHoja('stock'), S.allProds.filter(p => !p.hoja).length], ...hojas().filter(h => h.tipo === 'lista').map(h => [h.id, h.nombre, hojaItems(h)])];
  return `<option value="">Empezar vacía</option>${src.filter(s => s[2]).map(([id, n, k]) => `<option value="${esc(id)}">Copiar los productos de ${esc(n)} (${k})</option>`).join('')}`;
}
function hojaNew(){
  if (!S.hj.add) return `<button class="btn primary" data-act="hoja-add" ${canW() ? '' : 'disabled'}>${ic('plus')}Agregar hoja</button>`;
  const t = S.hj.tipo || 'lista';
  return `<form id="hn-form" class="hj-new" novalidate>
    <div class="fld"><label for="hn-nombre">Nombre de la hoja</label><input id="hn-nombre" maxlength="40" required autocomplete="off" placeholder="Ej. Bebidas, Depósito, Freezer"></div>
    <fieldset class="tpick"><legend>Tipo de hoja</legend>${Object.entries(TIPOS).map(([k, x]) => `<label><input type="radio" name="hn-tipo" value="${k}" ${k === t ? 'checked' : ''}><span class="tp-c">${ic(x.ic)}<b>${esc(x.nombre)}</b><small>${esc(x.largo)}</small></span></label>`).join('')}</fieldset>
    <div class="fld"><label for="hn-copia">Productos</label><select id="hn-copia">${copiaOpts(t)}</select></div>
    <div class="bar-a"><button type="button" class="btn" data-act="hoja-add-cancel">Cancelar</button><button type="submit" class="btn primary" id="hn-ok">${ic('plus')}Crear hoja</button></div>
  </form>`;
}
const limpiarNombre = s => String(s || '').trim().replace(/\s+/g, ' ');
function nombreLibre(nombre, exceptId){ const n = norm(nombre); if (n === 'inicio') return false; return !hojas().some(h => h.id !== exceptId && norm(h.nombre) === n); }
async function guardarHoja(id, patch){
  const cur = S.hojasDB.find(h => h.id === id) || {};
  const {id:_omit, ...rest} = cur;
  const data = {...rest, ...patch, actualizado:Date.now()};
  await w(() => C('hojas').doc(id).set(data));
  S.hojasDB = [...S.hojasDB.filter(h => h.id !== id), {id, ...data}];
}
async function crearHoja(){
  if (!needWrite() || S.hj.busy) return;
  const inp = $('#hn-nombre'), nombre = limpiarNombre(inp.value);
  if (!nombre){ toast('Escribí el nombre de la hoja.', true); inp.focus(); return; }
  if (!nombreLibre(nombre)){ toast('Ya hay una hoja con ese nombre.', true); inp.focus(); return; }
  const tv = document.querySelector('[name="hn-tipo"]:checked')?.value, tipo = TIPOS[tv] ? tv : 'lista';
  const src = $('#hn-copia').value, id = 'h-' + rid(), now = Date.now();
  const orden = Math.max(0, ...hojas().map(h => num(h.orden) || 0)) + 1;
  S.hj.busy = true; const btn = $('#hn-ok'); if (btn){ btn.disabled = true; btn.textContent = 'Creando…'; }
  try {
    const data = {nombre, tipo, orden, creado:now, por:S.uid || null};
    await w(() => C('hojas').doc(id).set(data));
    S.hojasDB = [...S.hojasDB.filter(h => h.id !== id), {id, ...data}];
    if (src && tipo === 'lista'){
      const from = S.allProds.filter(p => (p.hoja || 'stock') === src);
      await batchRun(from, p => C('productos').doc().set({nombre:p.nombre || '', cat:p.cat || '', unidad:p.unidad || 'unidad', min:p.min ?? null, stock:null, sinStock:false, obs:p.obs || '', orden:p.orden ?? null, creado:now, hoja:id}));
    } else if (src){
      const from = S.allFab.filter(it => (it.hoja || 'fabrica') === src);
      await batchRun(from, it => C('fabrica').doc().set({nombre:it.nombre || '', bloque:bloqueOf(it), resaltar:!!it.resaltar, orden:it.orden ?? null, local:null, fabrica:null, sinStock:false, creado:now, hoja:id}));
    }
    S.hj.busy = false; closePanel(); go(id);
    toast(src ? `Hoja «${nombre}» creada` : `Hoja «${nombre}» creada. Tocá Ajustes para cargar los productos.`);
  } catch(e){ S.hj.busy = false; if (btn){ btn.disabled = false; btn.innerHTML = `${ic('plus')}Crear hoja`; } fail(e); }
}
async function renombrarHoja(id, nombre){
  if (!needWrite()) return;
  nombre = limpiarNombre(nombre);
  if (!nombre){ toast('El nombre no puede quedar vacío.', true); return; }
  if (!nombreLibre(nombre, id)){ toast('Ya hay una hoja con ese nombre.', true); return; }
  try { await guardarHoja(id, {nombre}); S.hj.editId = null; refreshHojas(); render(); toast(`Hoja renombrada: ${nombre}`); } catch(e){ fail(e); }
}
async function moverHoja(id, dir){
  if (!needWrite() || S.hj.busy) return;
  const vis = visibles(), i = vis.findIndex(h => h.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= vis.length) return;
  const arr = [...vis]; [arr[i], arr[j]] = [arr[j], arr[i]];
  const cambios = arr.map((h, k) => ({h, orden:k + 1})).filter(x => x.h.orden !== x.orden);
  S.hj.busy = true;
  try {
    for (const x of cambios) await guardarHoja(x.h.id, {orden:x.orden});
    refreshHojas(); render();
    const sel = `#hj-list [data-act="hoja-${dir < 0 ? 'up' : 'down'}"][data-id="${CSS.escape(id)}"]`;
    setTimeout(() => { const b = document.querySelector(sel); if (b && !b.disabled) b.focus(); }, 30);
  } catch(e){ fail(e); }
  S.hj.busy = false;
}
async function borrarHoja(id){
  if (!needWrite() || S.hj.busy) return;
  const h = hojaById(id); if (!h) return;
  S.hj.busy = true;
  try {
    if (h.base) await guardarHoja(id, {oculta:true});
    else {
      if (h.tipo === 'lista'){
        const its = S.allProds.filter(p => p.hoja === id);
        await batchRun(its, p => C('productos').doc(p.id).delete());
        for (const p of its){ delete S.draft[p.id]; delete S.notas[p.id]; }
      } else {
        const its = S.allFab.filter(it => it.hoja === id);
        await batchRun(its, it => C('fabrica').doc(it.id).delete());
        for (const it of its) delete S.fdraft[it.id];
      }
      saveDraft();
      await w(() => C('hojas').doc(id).delete());
      S.hojasDB = S.hojasDB.filter(x => x.id !== id);
    }
    S.hj.delId = null; S.hj.busy = false;
    if (S.view === id) go('inicio'); else render();
    refreshHojas();
    toast(h.base ? `«${h.nombre}» se quitó del menú` : `Hoja «${h.nombre}» borrada`);
  } catch(e){ S.hj.busy = false; fail(e); }
}
async function mostrarHoja(id){
  if (!needWrite()) return;
  const orden = Math.max(0, ...visibles().map(h => num(h.orden) || 0)) + 1;
  try { await guardarHoja(id, {oculta:false, orden}); refreshHojas(); render(); toast(`«${nombreHoja(id)}» vuelve al menú`); } catch(e){ fail(e); }
}

/* ---------- Paneles y avisos ---------- */
let lastFocus = null;
function openPanel(html, kind){
  lastFocus = document.activeElement;
  const ov = $('#ov'); ov.className = 'ov' + (kind === 'drawer' ? ' drawer' : ''); ov.hidden = false;
  $('#pn').innerHTML = html;
}
function closePanel(){
  $('#ov').hidden = true; $('#pn').innerHTML = ''; S.panel = null; S.aj.editId = null; S.aj.delId = null; S.aj.catEdit = null; S.eqDel = null; S.hj.editId = null; S.hj.delId = null; S.hj.add = false;
  S.provEnvio = null;
  if (lastFocus && document.contains(lastFocus)) try { lastFocus.focus({preventScroll:true}); } catch {}
}
let toastT = null;
function toast(msg, err){
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, err ? 4200 : 2600);
}
async function copyText(text, okMsg){
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copiado'); }
  catch {
    S.panel = 'copy';
    openPanel(`<div class="pn-h"><div><h3>Copiar</h3></div><button class="ib" data-act="close" aria-label="Cerrar">${ic('x')}</button></div><div class="pn-b"><p class="lead">Seleccioná el texto y copialo.</p><div class="fld"><textarea id="cp-txt" readonly>${esc(text)}</textarea></div></div>`, 'dlg');
    setTimeout(() => { const ta = $('#cp-txt'); if (ta){ ta.focus(); ta.select(); } }, 40);
  }
}

/* ---------- Descargas ---------- */
function toCSV(rows){ return '﻿' + rows.map(r => r.map(v => { const s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n'); }
async function bajar(filename, rows){
  if (!S.dl) return;
  try { await S.dl.save({filename, data:toCSV(rows)}); }
  catch(e){ if (e && e.code !== 'declined') toast('No se pudo preparar el archivo.', true); }
}
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/* Excel (.xlsx) con SheetJS, que se carga solo cuando hace falta. Si no carga, se baja en CSV. */
let xlsxP = null;
function loadXLSX(){
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxP) xlsxP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.async = true;
    s.onload = () => window.XLSX ? res(window.XLSX) : rej(new Error('xlsx')); s.onerror = () => { xlsxP = null; s.remove(); rej(new Error('xlsx')); };
    document.head.appendChild(s);
  });
  return xlsxP;
}
const n0 = v => (v == null || v === '' || !Number.isFinite(Number(v))) ? '' : Number(v);
const sheetName = s => String(s || 'Hoja').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
async function bajarExcel(filename, sheets){
  sheets = sheets.filter(sh => sh.rows.length > 1 || sheets.length === 1);
  try {
    const X = await loadXLSX(), wb = X.utils.book_new(), used = new Set();
    for (const sh of sheets){
      const ws = X.utils.aoa_to_sheet(sh.rows);
      ws['!cols'] = sh.rows[0].map((_, i) => ({wch: Math.min(42, Math.max(8, ...sh.rows.map(r => String(r[i] ?? '').length + 2)))}));
      if (sh.rows.length > 1) ws['!autofilter'] = {ref: ws['!ref']};
      let n = sheetName(sh.name), k = 2; while (used.has(n.toLowerCase())) n = sheetName(sh.name).slice(0, 28) + ' ' + k++;
      used.add(n.toLowerCase()); X.utils.book_append_sheet(wb, ws, n);
    }
    X.writeFile(wb, filename, {compression:true});
    toast('Excel descargado');
  } catch {
    toast('No se pudo armar el Excel (revisá internet). Se descarga en CSV.', true);
    bajar(filename.replace(/\.xlsx$/, '.csv'), sheets[0].rows);
  }
}
function filasStock(list){ return [['N°','Categoría','Producto','Unidad','Mínimo','Proveedor','Stock','Sin stock','Estado','Observación'], ...list.map((p,i) => [i + 1, catOf(p), p.nombre || '', p.unidad || 'unidad', n0(minOf(p)), provOf(p), n0(stockOf(p)), p.sinStock ? 'Sí' : 'No', ESTADO[estado(p)], p.obs || ''])]; }
function filasFab(list){ return [['Bloque','Producto','Total stock','Local','Fábrica (ingreso mañana)','Sin stock','Resaltado'], ...list.map(it => [bloqueOf(it), it.nombre || '', n0(fTot(it)), n0(fVal(it, 'l')), n0(fVal(it, 'f')), fSin(it) ? 'Sí' : 'No', it.resaltar ? 'Sí' : 'No'])]; }
function filasHist(list){
  const rows = [['Fecha','Hora','Hoja','Cuenta','Producto','Categoría','Antes','Después','Diferencia','Nota del producto','Corregido']];
  for (const c of list.filter(x => x.tipo !== 'fabrica')){
    const base = [fechaCorta(c.fecha), horaCorta(c.fecha), hojaLabel(c, 'Conteo'), whoName(c)], ch = c.cambios || [], mod = c.modificado ? 'Sí' : 'No';
    if (!ch.length) rows.push([...base, '(sin diferencias)', '', '', '', '', '', mod]);
    for (const x of ch) rows.push([...base, x.nombre || '', x.cat || '', n0(x.antes), n0(x.despues), n0(round((x.despues ?? 0) - (x.antes ?? 0))), x.nota || '', mod]);
  }
  return rows;
}
function filasHistF(list){
  const rows = [['Fecha','Hora','Hoja','Cuenta','Bloque','Producto','Local','Fábrica','Total','Sin stock','Cambió']];
  for (const c of list.filter(x => x.tipo === 'fabrica')){
    const base = [fechaCorta(c.fecha), horaCorta(c.fecha), hojaLabel(c, 'Conteo Fábrica'), whoName(c)];
    for (const x of c.filas || []) rows.push([...base, x.bloque ?? '', x.nombre || '', n0(x.local), n0(x.fabrica), n0(x.total), x.sin ? 'Sí' : 'No', x.cambio ? 'Sí' : 'No']);
  }
  return rows;
}
function xlsStock(){ const nom = nombreHoja(listaCtx() || 'stock'); bajarExcel(`${slug(nom)}-${slug(localNombre())}-${hoyISO()}.xlsx`, [{name:nom, rows:filasStock(sorted())}]); }
function xlsFab(){ const nom = nombreHoja(fabCtx()); bajarExcel(`${slug(nom)}-${slug(localNombre())}-${hoyISO()}.xlsx`, [{name:nom, rows:filasFab(fItems())}]); }
function xlsPedido(){
  const byProv = S.pedGrp === 'prov', items = pedidoItems();
  if (byProv) items.sort((a,b) => provGroupSort([provKey(a.p)], [provKey(b.p)]));
  bajarExcel(`pedido-${slug(localNombre())}-${hoyISO()}.xlsx`, [{name:'Pedido', rows:[['Proveedor','Categoría','Producto','Unidad','Hay','Mínimo','A pedir'], ...items.map(x => [provOf(x.p), catOf(x.p), x.p.nombre || '', x.p.unidad || 'unidad', n0(x.base), n0(minOf(x.p)), n0(x.v)])]}]);
}
function xlsHist(){ const list = histList(); bajarExcel(`historial-${slug(localNombre())}-${hoyISO()}.xlsx`, [{name:'Conteos', rows:filasHist(list)}, {name:'Local + Fábrica', rows:filasHistF(list)}]); }
/* Copia de seguridad: todo lo que hay en la base, en un solo Excel */
function backup(){
  const hojaDe = p => p.hoja ? nombreHoja(p.hoja) : nombreHoja('stock');
  const prods = [...S.allProds].sort((a,b) => String(a.hoja || '').localeCompare(String(b.hoja || '')) || (a.orden ?? 1e9) - (b.orden ?? 1e9));
  const fabs = [...S.allFab].sort((a,b) => String(a.hoja || '').localeCompare(String(b.hoja || '')) || (a.orden ?? 1e9) - (b.orden ?? 1e9));
  bajarExcel(`copia-de-seguridad-stock-${slug(localNombre())}-${hoyISO()}.xlsx`, [
    {name:'Productos', rows:[['Hoja','Categoría','Producto','Unidad','Mínimo','Proveedor','Stock','Sugerido','Sin stock','Observación','Orden'], ...prods.map(p => [hojaDe(p), catOf(p), p.nombre || '', p.unidad || 'unidad', n0(minOf(p)), provOf(p), n0(stockOf(p)), n0(sugOf(p)), p.sinStock ? 'Sí' : 'No', p.obs || '', n0(p.orden)])]},
    {name:'Local + Fábrica', rows:[['Hoja','Bloque','Orden','Producto','Resaltado','Local','Fábrica','Total','Sin stock'], ...fabs.map(it => [nombreHoja(it.hoja || 'fabrica'), bloqueOf(it), n0(it.orden), it.nombre || '', it.resaltar ? 'Sí' : 'No', n0(num(it.local)), n0(num(it.fabrica)), n0(round((num(it.local) || 0) + (num(it.fabrica) || 0))), it.sinStock ? 'Sí' : 'No'])]},
    {name:'Historial', rows:filasHist(S.conteos)},
    {name:'Historial Fábrica', rows:filasHistF(S.conteos)},
    {name:'Control diario', rows:[['Fecha','Producto','Unidad','Inicio','Ingresos','Ventas','Consumo interno','Merma','Ajustes','Esperado','Conteo físico','Diferencia','Nota','Autor','Guardado'],
      ...S.diarios.map(d => [d.dia||'',d.nombre||'',d.unidad||'',n0(d.inicio),n0(d.ingresos),n0(d.ventas),n0(d.consumo),n0(d.merma),n0(d.ajustes),n0(d.esperado),n0(d.final),n0(d.diferencia),d.nota||'',d.autor||'',fechaHora(d.creado)])]},
    {name:'Proveedores', rows:[['Proveedor','Contacto','Teléfono','Entrega','Observaciones'],
      ...S.provInfo.map(p=>[p.nombre||'',p.contacto||'',p.telefono||'',p.entrega||'',p.nota||''])]},
    {name:'Pedidos por proveedor', rows:[['Proveedor','Producto','Unidad','Stock local (planilla)','Pedir','Sugerido'],
      ...proveedorNombres().flatMap(([nombre])=>proveedorFilas(nombre).map(p=>[nombre,p.nombre,p.unidad,n0(p.stockLocal),n0(p.pedir),n0(p.sugerido)]))]},
    {name:'Hojas', rows:[['Hoja','Tipo','En el menú','Orden'], ...hojas().map(h => [h.nombre, h.base ? 'Fija' : TIPOS[h.tipo].nombre, h.oculta ? 'No' : 'Sí', h.orden])]},
    {name:'Equipo', rows:[['Email','Acceso'], ...equipoList().map(e => [e.email, (ROL[e.rol] || ROL.editor)[0]])]}
  ]);
}

/* ---------- Navegación y tema ---------- */
function go(v, silent){
  const ok = v === 'inicio' || v === 'chat' || v === 'proveedores' || (v === 'pedidos-online' && window.GestLokCommerce?.online()) || (v === 'tienda-online' && window.GestLokCommerce?.online()) || (v === 'diario' && puedeVerDiarioMunro()) || v === 'vencimientos' || (v === 'avisos' && esTotal()) || (v === 'ingreso' && esTotal() && window.GestLokCommerce?.mode() !== 'online') || (isBase(v) && (v !== 'fabrica' || window.GestLokCommerce?.mode() !== 'online')) || (isCustom(v) && (!S.loaded.h || S.hojasDB.some(h => h.id === v)));
  if (!ok || (window.GestLokCommerce?.mode() === 'online' && (v === 'ingreso' || esFabT(tipoVista(v))))) v = 'inicio';
  if (ctxKey(v) !== ctxKey(S.view)){ S.cat = ''; S.q = ''; S.filtro = 'todos'; S.cfiltro = 'todos'; }
  S.view = v; if(v === 'chat') markChatRead(); $('#app').classList.remove('open'); $('#scrim').hidden = true;
  render(); if (!silent) window.scrollTo({top:0});
}
function applySkin(){ document.documentElement.removeAttribute('data-skin'); }

/* ---------- Eventos ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-go]'); if (!t) return;
  if (t.dataset.go){ if (S.panel) closePanel(); go(t.dataset.go); return; }
  const a = t.dataset.act, id = t.dataset.id;
  if (t.tagName === 'INPUT') return;
  switch (a){
    case 'menu-open': $('#app').classList.add('open'); $('#scrim').hidden = false; $('#snav button')?.focus(); break;
    case 'menu-close': $('#app').classList.remove('open'); $('#scrim').hidden = true; break;
    case 'close': closePanel(); break;
    case 'diario-nuevo': diarioNuevo(); break;
    case 'prov-new': nuevoProveedor(); break;
    case 'prov-open': abrirCarpetaProveedor(t.dataset.name); break;
    case 'prov-close': S.provOpen = ''; S.provAdding = false; render(); break;
    case 'prov-add-open': S.provAdding = true; render(); break;
    case 'prov-del-manual': quitarProductoProveedor(t.dataset.id); break;
    case 'prov-use-suggested': usarSugeridoProveedor(t.dataset.id); break;
    case 'prov-save-plan': confirmarGuardadoProveedor(); break;
    case 'prov-confirm-save': guardarPlanProveedor(); break;
    case 'prov-zero-cat': ponerEnCeroCategoriaProveedor(t.dataset.cat); break;
    case 'prov-history-pdf': descargarHistorialProveedor(t.dataset.id); break;
    case 'prov-share': compartirPedidoProveedor(); break;
    case 'prov-share-ready': enviarProveedorPreparado(); break;
    case 'prov-pdf-download': descargarPdfProveedor(); break;
    case 'prov-whatsapp-open': abrirWhatsappProveedor(); break;
    case 'prov-edit': editarProveedor(t.dataset.name); break;
    case 'prov-copy': copyText(proveedorSeleccionados(t.dataset.name).length ? pedidoProveedorTexto(t.dataset.name) : proveedorPedido(t.dataset.name), 'Pedido copiado. Revisalo antes de enviarlo.'); break;
    case 'ajustes': openAjustes(); break;
    case 'aj-open': openAjustes(t.dataset.tab); break;
    case 'est': openEstados(id); break;
    case 'sug-tg': toggleSug(); break;
    case 'tot-nombre': openTotNombre(); break;
    case 'bq-edit': openBloque(+t.dataset.b || 1); break;
    case 'nota': abrirNota(t.dataset.k === 'f' ? 'f' : 'p', id); break;
    case 'borrar': pedirBorrar(); break;
    case 'borrar-ok': borrarDatos(); break;
    case 'aj-item': if (canW()) openAjustes('productos', id); else toast('Para modificar productos necesitás acceso de Editor.'); break;
    case 'share': openShare(); break;
    case 'admin-locales': document.getElementById('gl-admin-locales')?.scrollIntoView({behavior:'smooth',block:'start'}); break;
    case 'admin-preparar-empresa': if(isCreadora() && !S.local){ S.creatorSetup=true; window.GestLokCreator?.open(); } break;
    case 'admin-demo-online': if(isCreadora() && !S.local){ S.demoTienda=true; window.GestLokDemo?.reset(); renderHub(); window.scrollTo({top:0}); } break;
    case 'admin-demo-close': if(S.demoTienda){ S.demoTienda=false; renderHub(); window.scrollTo({top:0}); } break;
    case 'local': abrirLocal(id); break;
    case 'locales': mostrarHub(); break;
    case 'guardar': openSave(); break;
    case 'recover-draft': recoverLegacyDraft(); break;
    case 'save-ok': doSave(); break;
    case 'descartar': if (isFabV(S.view)) openConfirm('Descartar cambios', 'Se borran los valores de Local y Fábrica que todavía no guardaste. La planilla vuelve al último guardado.', 'Descartar', 'desc-f-ok', true); else openConfirm('Descartar cambios', `Se borran las cantidades contadas y las notas que todavía no guardaste${editingCtx() ? ', y se cancela la corrección' : ''}.`, 'Descartar', 'desc-ok', true); break;
    case 'desc-ok': clearDraftCtx(); closePanel(); render(); toast('Cambios descartados'); break;
    case 'desc-f-ok': clearFDraftCtx(); closePanel(); render(); toast('Cambios descartados'); break;
    case 'save-f-ok': doSaveF(); break;
    case 'f-zero': if (!needWrite()) break; openConfirm('Poner todo en 0', 'Local y Fábrica quedan en 0 en todas las filas, para empezar la planilla del día. No se guarda hasta que toques Guardar conteo.', 'Poner en 0', 'f-zero-ok', false); break;
    case 'f-zero-ok': for (const it of S.fab){ setF(it.id, 'l', 0); setF(it.id, 'f', 0); } closePanel(); render(); toast('Planilla en 0. Cargá los valores y guardá.'); break;
    case 'f-copy': copyText(fabTexto(), 'Planilla copiada'); break;
    case 'f-xls': xlsFab(); break;
    case 'xls-stock': xlsStock(); break;
    case 'xls-pedido': xlsPedido(); break;
    case 'xls-hist': xlsHist(); break;
    case 'backup': backup(); break;
    case 'print': window.print(); break;
    case 'install': openInstall(); break;
    case 'ped-grp': S.pedGrp = t.dataset.g === 'prov' ? 'prov' : 'cat'; lsSet('spm-pedgrp', S.pedGrp); render(); break;
    case 'copiar-prov': copyText(pedidoTexto(t.dataset.prov), `Pedido de ${t.dataset.prov} copiado`); break;
    case 'hist-clear': S.histHoja = ''; S.histPer = 'todo'; S.histQ = ''; S.histN = 30; render(); break;
    case 'edit-cancel': withCtx('conteo', clearDraftCtx); render(); toast('Corrección cancelada'); break;
    case 'hojas': openHojas(false); break;
    case 'hoja-new': openHojas(true); break;
    case 'hoja-add': if (!needWrite()) break; S.hj.add = true; S.hj.tipo = 'lista'; $('#hj-new').innerHTML = hojaNew(); $('#hn-nombre')?.focus(); break;
    case 'hoja-add-cancel': S.hj.add = false; $('#hj-new').innerHTML = hojaNew(); break;
    case 'hoja-up': moverHoja(id, -1); break;
    case 'hoja-down': moverHoja(id, 1); break;
    case 'hoja-edit': S.hj.editId = id; S.hj.delId = null; refreshHojas(); setTimeout(() => $('#hr-nombre')?.select(), 20); break;
    case 'hoja-del': S.hj.delId = id; S.hj.editId = null; refreshHojas(); break;
    case 'hoja-cancel': S.hj.editId = null; S.hj.delId = null; refreshHojas(); break;
    case 'hoja-del-ok': borrarHoja(id); break;
    case 'hoja-show': mostrarHoja(id); break;
    case 'cat': S.cat = t.dataset.cat; render(); break;
    case 'cat-go': S.cat = t.dataset.cat; S.filtro = 'todos'; S.q = ''; go('stock'); break;
    case 'filtro': S.filtro = t.dataset.f; render(); break;
    case 'cfiltro': S.cfiltro = t.dataset.f; render(); break;
    case 'kpi': S.filtro = t.dataset.k; S.cat = ''; S.q = ''; go('stock'); break;
    case 'f-add-dlg': openFAdd(); break;
    case 'ing-local': { const I = S.ing || (S.ing = ingNuevo()); if (I.busy || I.local === id || !localesTodos().some(l => l.id === id)) break; Object.assign(I, {local:id, datos:null, hist:null, res:null, msg:null, clave:'', dec:{}, cant:{}, on:{}, campo:{}}); ingCargar(); break; }
    case 'ing-op': { const I = S.ing; if (!I || I.busy) break; I.op = t.dataset.op === 'conteo' ? 'conteo' : 'ingreso'; ingCambio(); render(); break; }
    case 'ing-quitar': if (!S.ing.busy) ingQuitar(); break;
    case 'ing-cancelar': if (!S.ing.busy){ ingQuitar(); toast('Importación cancelada: no se guardó nada'); } break;
    case 'ing-otro': ingQuitar(); break;
    case 'ing-tildar': { const I = S.ing; for (const f of ingPlan().filas) if (f.cantOk && (f.estado === 'coincide' || f.estado === 'elegido')) I.on[f.key] = true; ingCambio(); render(); break; }
    case 'ing-confirmar': ingConfirmar(false); break;
    case 'ing-forzar': closePanel(); ingConfirmar(true); break;
    case 'ing-hist': S.ing.histOpen[id] = !S.ing.histOpen[id]; render(); break;
    case 'f-item': openFEdit(id); break;
    case 'f-del-ask': openFEdit(id, true); break;
    case 'fstep': {
      if (!needWrite()) break;
      const it = S.fab.find(x => x.id === id); if (!it) break;
      const k = t.dataset.field === 'f' ? 'f' : 'l';
      const step = Number(t.dataset.delta);
      if (step !== 1 && step !== -1) break;
      const current = fVal(it, k) ?? 0;
      const value = Math.max(0, round(current + step));
      if (current === value) break;
      setF(id, k, value);
      const inp = document.getElementById((k === 'l' ? 'fl-' : 'ff-') + id);
      if (inp) { inp.value = fmtIn(value); inp.classList.remove('bad'); }
      refreshF(id);
      break;
    }
    case 'ffrac': { if (!needWrite()) break; const it = S.fab.find(x => x.id === id); if (!it) break; const l = fVal(it, 'l') ?? 0, ent = Math.floor(l + 1e-9), f = +t.dataset.f, v = round(ent + (Math.abs(fracOf(l) - f) < 1e-9 ? 0 : f)); setF(id, 'l', v); const inp = document.getElementById('fl-' + id); if (inp){ inp.value = fmtIn(v); inp.classList.remove('bad'); } refreshF(id); break; }
    case 'frac': { if (!needWrite()) break; const p = S.prods.find(x => x.id === id); if (!p) break; const q = qty(p) ?? 0, ent = Math.floor(q + 1e-9), f = +t.dataset.f; S.draft[id] = round(ent + (Math.abs(fracOf(q) - f) < 1e-9 ? 0 : f)); saveDraft(); render(); break; }
    case 'dec': case 'inc': { if (!needWrite()) break; const p = S.prods.find(x => x.id === id); if (!p) break; S.draft[id] = Math.max(0, round((qty(p) ?? 0) + (a === 'inc' ? 1 : -1))); saveDraft(); render(); break; }
    case 'cdec': case 'cinc': case 'chalf': { if (!needWrite()) break; const p = S.prods.find(x => x.id === id); if (!p) break; const b = has(S.draft, id) ? S.draft[id] : (stockOf(p) ?? 0); setCount(id, b + (a === 'cinc' ? 1 : a === 'chalf' ? .5 : -1)); break; }
    case 'ceq': { if (!needWrite()) break; const p = S.prods.find(x => x.id === id); if (p && stockOf(p) != null) setCount(id, stockOf(p)); break; }
    case 'addnote': { if (!needWrite()) break; S.notas[id] = ''; saveDraft(); const wr = document.getElementById('cn-w-' + id); if (wr){ wr.innerHTML = `<input class="cn" id="cn-${esc(id)}" data-cn="${esc(id)}" value="" placeholder="Nota (ej. vence el viernes)" aria-label="Nota">`; wr.querySelector('input').focus(); } break; }
    case 'pdec': case 'pinc': { const x = pedidoItems().find(i => i.p.id === id); if (!x) break; S.pedAdj[id] = Math.max(0, round(x.v + (a === 'pinc' ? 1 : -1))); const inp = document.getElementById('pq-' + id); if (inp) inp.value = fmtIn(S.pedAdj[id]); break; }
    case 'copiar-pedido': copyText(pedidoTexto(), 'Pedido copiado. Pegalo en WhatsApp o en el mail al proveedor.'); break;
    case 'copy': copyText(t.dataset.text, 'Copiado'); break;
    case 'hist-toggle': S.histOpen[id] = !S.histOpen[id]; render(); break;
    case 'hist-more': S.histN += 30; render(); break;
    case 'corregir': corregir(id); break;
    case 'corr-ok': corregir(S._corr, true); break;
    case 'sol-ok': aprobar(id); break;
    case 'sol-no': rechazar(id); break;
    case 'eq-del': S.eqDel = id; $('#eq-list').innerHTML = equipoRows(true); break;
    case 'eq-del-no': S.eqDel = null; $('#eq-list').innerHTML = equipoRows(true); break;
    case 'eq-del-ok': (async () => { if (!puedeAdministrarEquipo()) return; try { await w(() => S.db.collection('equipo').doc(id).delete()); S.eqDel = null; toast('Quitado del equipo. Ya no puede entrar.'); } catch(err){ fail(err); } })(); break;
    case 'aj-tab': S.aj.tab = t.dataset.tab; S.aj.editId = null; S.aj.delId = null; S.aj.catEdit = null; renderAjustesBody(); break;
    case 'aj-edit': S.aj.editId = id; S.aj.delId = null; renderAjustesBody(); setTimeout(() => $('#ae-nombre')?.focus(), 20); break;
    case 'aj-del': S.aj.delId = id; S.aj.editId = null; renderAjustesBody(); break;
    case 'aj-cancel': S.aj.editId = null; S.aj.delId = null; S.aj.catEdit = null; renderAjustesBody(); break;
    case 'aj-del-ok': eliminar(id); break;
    case 'ac-edit': S.aj.catEdit = t.dataset.cat; renderAjustesBody(); setTimeout(() => $('#ac-name')?.select(), 20); break;
    case 'ap-import': importar(); break;
    case 'af-edit': S.aj.editId = id; S.aj.delId = null; renderAjustesBody(); setTimeout(() => $('#afe-nombre')?.focus(), 20); break;
    case 'af-del': S.aj.delId = id; S.aj.editId = null; renderAjustesBody(); break;
    case 'af-del-ok': fEliminar(id); break;
    case 'afp-import': fImportar(); break;
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-ss]')) toggleSS(t.dataset.ss, t.checked, t);
  else if (t.id === 'diario-fecha') { S.diarioDia = t.value; render(); }
  else if (t.id === 'diario-producto') { S.diarioProd = t.value; render(); }
  else if (t.matches('[data-fss]')) toggleFSS(t.dataset.fss, t.checked, t);
  else if (t.matches('[data-rolsel]')) cambiarRol(t.dataset.rolsel, t.value === 'lectura' ? 'lectura' : 'gerente');
  else if (t.matches('[data-eqloc]')) cambiarLocales(t.dataset.eqloc);
  else if (t.id === 'aj-cat'){ S.aj.cat = t.value; renderAjustesBody(); }
  else if (t.name === 'hn-tipo'){ S.hj.tipo = t.value; const s = $('#hn-copia'); if (s) s.innerHTML = copiaOpts(t.value); }
  else if (t.matches('[data-qmin]')) qGuardar(t.dataset.qmin, 'min', t);
  else if (t.matches('[data-sg]')) guardarSugerido(t.dataset.sg, t);
  else if (t.matches('[data-qprov]')) qGuardar(t.dataset.qprov, 'proveedor', t);
  else if (t.id === 'h-hoja'){ S.histHoja = t.value; S.histN = 30; render(); }
  else if (t.id === 'h-per'){ S.histPer = t.value; S.histN = 30; render(); }
  else if (t.id === 'ing-file'){ const f = t.files && t.files[0]; if (f) ingArchivo(f); }
  else if (t.id === 'ing-fab'){ S.ing.fabCampo = t.value === 'fabrica' ? 'fabrica' : 'local'; ingCambio(); render(); }
  else if (t.id === 'ing-hoja'){ const I = S.ing; I.hojaSel = +t.value || 0; I.col = window.MGSIngreso.columnas((I.arch.hojas[I.hojaSel] || {filas:[]}).filas); ingProcesar(); render(); }
  else if (t.matches('[data-ingcol]')){ const I = S.ing; I.col = {...I.col, [t.dataset.ingcol]:+t.value}; ingProcesar(); render(); }
  else if (t.matches('[data-ingdec]')){ if (t.value === '' && t.selectedOptions[0] && t.selectedOptions[0].disabled) return; S.ing.dec[+t.dataset.ingdec] = t.value === '-' ? '' : t.value; ingCambio(); render(); }
  else if (t.matches('[data-ingdest]')){ const I = S.ing, k = t.dataset.ingdest; for (const r of I.lineas) if (ingDestino(r) === k) I.dec[r.i] = t.value; ingCambio(); render(); }
  else if (t.matches('[data-ingcampo]')){ S.ing.campo[t.dataset.ingcampo] = t.value === 'fabrica' ? 'fabrica' : 'local'; ingCambio(); render(); }
  else if (t.matches('[data-ingon]')){ S.ing.on[t.dataset.ingon] = t.checked; ingCambio(); render(); }
  else if (t.matches('[data-ingcant]')){ S.ing.cant[t.dataset.ingcant] = t.value; ingCambio(); render(); }
});
let qT = null;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'gestlok-chat-text'){
    if (S.local && canW() && !chatPending()) lsSet(chatDraftKey(), t.value.slice(0, 1000));
    return;
  }
  if (t.matches('[data-cq]')){
    const id = t.dataset.cq, raw = t.value.trim();
    if (!raw){ delete S.draft[id]; t.classList.remove('bad'); saveDraft(); refreshCC(id); return; }
    const v = numQ(raw); if (v == null || v < 0 || !isQuarter(v)){ t.classList.add('bad'); t.title = 'Unidades enteras, medias o cuartos (ej. 3, 3,5 o 3 3/4)'; if (v != null && !isQuarter(v)) toast('Unidades enteras, medias o cuartos (ej. 3, 3,5 o 3 3/4)', true); return; }
    t.classList.remove('bad'); S.draft[id] = round(v); saveDraft(); refreshCC(id); return;
  }
  if (t.matches('[data-fl],[data-ff]')){
    const id = t.dataset.fl || t.dataset.ff, k = t.dataset.fl ? 'l' : 'f', raw = t.value.trim();
    if (!raw){ t.classList.remove('bad'); setF(id, k, null); refreshF(id); return; }
    const v = numQ(raw); if (v == null || v < 0 || !isQuarter(v)){ t.classList.add('bad'); if (v != null && !isQuarter(v)) toast('Unidades enteras, medias o cuartos (ej. 3, 3,5 o 3 3/4)', true); return; }
    t.classList.remove('bad'); setF(id, k, round(v)); refreshF(id); return;
  }
  if (t.matches('[data-cn]')){ S.notas[t.dataset.cn] = t.value; saveDraft(); renderChrome(); const pr = $('#cprog'); if (pr) pr.outerHTML = progHTML(); return; }
  if (t.matches('[data-pq]')){ const v = num(t.value); if (v != null && v >= 0) S.pedAdj[t.dataset.pq] = round(v); return; }
  if (t.matches('[data-sg]')){ S.sgEdit = S.sgEdit || {}; S.sgEdit[t.dataset.sg] = t.value; return; }
  if (t.matches('[data-nt]')){ S.ntEdit = S.ntEdit || {}; S.ntEdit[t.dataset.nt] = t.value; return; }
  if (t.matches('[data-ingcant]')){ S.ing.cant[t.dataset.ingcant] = t.value; return; }
  if (['es-sug', 'es-poco', 'es-exc'].includes(t.id)){ estRefresh(); return; }
  if (['q-stock','q-conteo','q-pedido'].includes(t.id)){ S.q = t.value; clearTimeout(qT); qT = setTimeout(render, 120); return; }
  if (t.id === 'q-hist'){ S.histQ = t.value; clearTimeout(qT); qT = setTimeout(render, 150); return; }
  if (t.id === 'aj-q'){ S.aj.q = t.value; clearTimeout(qT); qT = setTimeout(renderAjustesBody, 120); return; }
  if (t.id === 'afp-txt'){ S.aj.fpaste = t.value; const pv = $('#afp-prev'); if (pv) pv.innerHTML = fPastePreview(); return; }
  if (t.id === 'ap-txt'){ S.aj.paste = t.value; const pv = $('#ap-prev'); if (pv) pv.innerHTML = pastePreview(); return; }
});
document.addEventListener('focusout', e => {
  const t = e.target;
  if (t.matches && t.matches('[data-cn]') && !String(t.value).trim()){ delete S.notas[t.dataset.cn]; saveDraft(); renderChrome(); }
  /* Si la vista se volvió a dibujar y el campo sigue con el foco, no se cierra */
  if (t.matches && t.matches('[data-nt]')){ const fid = t.id; setTimeout(() => { const el = document.getElementById(fid); if (el && document.activeElement !== el && el.dataset.nt) cerrarNota(el.dataset.nt, el); }, 0); }
});
document.addEventListener('submit', e => {
  const f = e.target; e.preventDefault();
  if (f.id === 'prov-create-form') crearCarpetaProveedor(f);
  else if (f.id === 'prov-add-form') agregarProductoProveedor(f);
  else if (f.id === 'diario-form') guardarDiario(f);
  else if (f.id === 'prov-form') guardarProveedor(f);
  else if (f.id === 'gestlok-chat-form') sendGestlokChat(f);
  else if (f.id === 'eq-form') addEquipo($('#eq-email').value, $('#eq-rol').value);
  else if (f.id === 'aa-form') agregar();
  else if (f.id === 'ae-form') guardarEdicion(f.dataset.id);
  else if (f.id === 'ac-form') renombrarCat(f.dataset.cat, $('#ac-name').value);
  else if (f.id === 'afa-form') fAgregar();
  else if (f.id === 'afe-form') fGuardarEdicion(f.dataset.id);
  else if (f.id === 'hn-form') crearHoja();
  else if (f.id === 'hr-form') renombrarHoja(f.dataset.id, $('#hr-nombre').value);
  else if (f.id === 'est-form') guardarEstados(f.dataset.id);
  else if (f.id === 'tn-form') guardarTotNombre();
  else if (f.id === 'bq-form') guardarBloque(+f.dataset.b || 1);
});
document.addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('[data-nt]')){
    if (e.key === 'Enter'){ e.preventDefault(); e.target.blur(); return; }
    if (e.key === 'Escape'){ const k = e.target.dataset.nt; if (S.ntEdit) delete S.ntEdit[k]; refreshNota(k); return; }
  }
  if (e.key === 'Escape'){
    if (!$('#ov').hidden) closePanel();
    else if ($('#app').classList.contains('open')){ $('#app').classList.remove('open'); $('#scrim').hidden = true; }
  }
  if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-cq],[data-fl],[data-ff]')){
    const rows = [...document.querySelectorAll(e.target.matches('[data-cq]') ? '[data-cq]' : '[data-fl],[data-ff]')]; const i = rows.indexOf(e.target);
    if (i >= 0 && rows[i + 1]){ e.preventDefault(); rows[i + 1].focus(); rows[i + 1].select?.(); }
  }
});
$('#ov').addEventListener('click', e => { if (e.target.id === 'ov') closePanel(); });

/* ---------- Conexión ---------- */
function setLive(s){ S.live = s; if (S.local) renderLive(); }
function onSnapRefresh(){
  render();
  if (S.panel === 'ajustes' && !DR && !S.aj.ordering){ if (!S.aj.editId && !S.aj.delId && !S.aj.catEdit && ['productos','categorias','f-items'].includes(S.aj.tab)) renderAjustesBody(); else if (S.aj.tab === 'pegar'){ const pv = $('#ap-prev'); if (pv) pv.innerHTML = pastePreview(); } }
  if (S.panel === 'share') refreshShare();
  if (S.panel === 'hojas' && !S.hj.editId && !S.hj.delId && !S.hj.busy) refreshHojas();
}
const errLive = e => { setLive(e && e.code === 'revoked' ? 'off' : 'err'); };
/* Equipo, pedidos de acceso y lista de locales: para todos */
function subscribeGlobal(){
  S.db.collection('equipo').onSnapshot(snap => {
    S.equipo = snap.docs.map(d => ({id:d.id, ...d.data()}));
    S.loaded.e = true; afterAccess(); onSnapRefresh();
  }, errLive);
  S.db.collection('solicitudes').onSnapshot(snap => {
    S.sol = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => (b.fecha || 0) - (a.fecha || 0));
    onSnapRefresh();
  }, () => {});
  S.db.collection('locales').onSnapshot(snap => {
    S.localesDB = snap.docs.map(d => ({id:d.id, ...d.data()}));
    S.loaded.l = true; afterAccess(); onSnapRefresh();
  }, errLive);
  let previousCommerceMode = 'fisica';
  S.db.collection('configuracion_negocio').onSnapshot(snap => {
    const configId = window.GestLokCommerce?.configId();
    const c = configId ? snap.docs.find(d => d.id === configId) : null;
    window.GestLokCommerce?.config(c ? c.data() : null);
    const mode = window.GestLokCommerce?.mode() || 'fisica';
    // The adapter polls periodically: an unchanged result must never erase an active form.
    if (mode === previousCommerceMode) return;
    previousCommerceMode = mode;
    if (((S.view === 'pedidos-online' || S.view === 'tienda-online') && mode === 'fisica') || (mode === 'online' && (S.view === 'ingreso' || esFabT(tipoVista(S.view))))) S.view='inicio';
    onSnapRefresh();
  }, () => {
    window.GestLokCommerce?.config(null);
    if (previousCommerceMode !== 'fisica') { previousCommerceMode = 'fisica'; onSnapRefresh(); }
  });
}
/* Resumen de cada local para la pantalla Locales */
function subscribeHub(id){
  const h = S.hub[id] = {prods:[], conteos:[], lp:false, lc:false};
  S.db.collection(id + '/productos').onSnapshot(snap => { h.prods = snap.docs.map(d => ({id:d.id, ...d.data()})); h.lp = true; if (!S.local) renderHub(); }, () => {});
  S.db.collection(id + '/conteos').orderBy('fecha', 'desc').limit(1).onSnapshot(snap => { h.conteos = snap.docs.map(d => ({id:d.id, ...d.data()})); h.lc = true; if (!S.local) renderHub(); }, () => {});
}
/* Qué puede ver cada persona: se decide con su fila del Equipo */
function afterAccess(){
  if (!S.loaded.e || !S.loaded.l) return;
  const mios = localesMios();
  for (const l of mios) if (!S.hub[l.id]) subscribeHub(l.id);
  if (!S.started){
    S.started = true;
    if (!isCreadora() && mios.length === 1) abrirLocal(mios[0].id); else mostrarHub();
    return;
  }
  if (S.local){
    if (!mios.some(l => l.id === S.local)){ mostrarHub(); toast('Ya no tenés acceso a ese local.', true); }
    else S.ro = !puedeEditarLocal(S.local);
  }
}
function subscribeLocal(){
  const loc = S.local, mine = fn => snap => { if (S.local === loc) fn(snap); };
  const push = u => { if (typeof u === 'function') S.unsubs.push(u); };
  if (puedeVerDiarioMunro()) {
    window.GestLokMunroDaily?.subscribe(loc,push);
    // El historial del formulario anterior queda disponible en modo consulta; no se borra.
    push(C('diario').onSnapshot(mine(snap => {
      S.diarios = snap.docs.map(d => ({id:d.id,...d.data()})).sort((a,b)=>(b.creado||0)-(a.creado||0));
      if (S.view === 'diario') render();
    }),errLive));
  }
  push(C('vencimientos').onSnapshot(mine(snap => {
    S.vencimientos = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (S.view === 'inicio' || S.view === 'vencimientos' || S.view === 'avisos') render();
  }), errLive));
  push(C('avisos').orderBy('fecha','desc').limit(100).onSnapshot(mine(snap => {
    S.avisos = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (S.view === 'avisos') render();
  }), () => {}));
  let lastOnlineOrders = '';
  push(C('pedidos_online').onSnapshot(mine(snap => {
    const rows = snap.docs.map(d => ({id:d.id, ...d.data()}));
    const signature = JSON.stringify(rows);
    // No rerender for the same data returned by a periodic Supabase poll.
    if (signature === lastOnlineOrders) return;
    lastOnlineOrders = signature;
    window.GestLokCommerce?.orders(loc, rows);
    if (S.view === 'pedidos-online' || S.view === 'inicio') render();
  }), errLive));
  push(C('proveedores').onSnapshot(mine(snap => {
    S.provInfo = snap.docs.map(d => ({id:d.id, ...d.data()}));
    if(S.view === 'proveedores') render();
  }), errLive));
  push(C('proveedores_historial').orderBy('fecha','desc').limit(250).onSnapshot(mine(snap => {
    S.provHist = snap.docs.map(d=>({id:d.id,...d.data()}));
    if(S.view === 'proveedores')render();
  }),errLive));
  push(C('chat').orderBy('fecha', 'desc').limit(150).onSnapshot(mine(snap => {
    S.chat = snap.docs.map(d => ({id:d.id, ...d.data()}))
      .filter(chatRecent).sort((a,b) => (a.fecha || 0) - (b.fecha || 0));
    // Lo leído se guarda por usuario y por sucursal, nunca por sección.
    // La primera vez también debe mostrarse el punto si hay mensajes pendientes.
    const since = Number(lsGet(chatSeenKey(), 0)) || 0;
    if (S.view === 'chat') markChatRead();
    else S.unreadChat = S.chat.filter(m => m.autor !== S.uid && Number(m.fecha) > since).length;
    if (S.view === 'chat') render();
    else renderNav();
  }), errLive));
  push(C('hojas').onSnapshot(mine(snap => {
    S.hojasDB = snap.docs.map(d => ({id:d.id, ...d.data()}));
    S.loaded.h = true;
    if (isCustom(S.view) && !S.hojasDB.some(h => h.id === S.view)) S.view = 'inicio';
    onSnapRefresh();
  }), e => { if (S.local !== loc) return; S.loaded.h = true; errLive(e); render(); }));
  push(C('productos').onSnapshot(mine(snap => {
    S.allProds = snap.docs.map(d => ({id:d.id, ...d.data()}));
    for (const k of Object.keys(S.draft)) if (!S.allProds.some(p => p.id === k)) delete S.draft[k];
    S.loaded.p = true; setLive('on'); onSnapRefresh();
  }), errLive));
  push(C('conteos').orderBy('fecha', 'desc').limit(400).onSnapshot(mine(snap => {
    S.conteos = snap.docs.map(d => ({id:d.id, ...d.data()}));
    S.loaded.c = true; onSnapRefresh(); resolveNames();
  }), errLive));
  push(C('fabrica').onSnapshot(mine(snap => {
    S.allFab = snap.docs.map(d => ({id:d.id, ...d.data()}));
    for (const k of Object.keys(S.fdraft)) if (!S.allFab.some(x => x.id === k)) delete S.fdraft[k];
    S.loaded.f = true; onSnapRefresh();
  }), errLive));
}
function cerrarLocal(){
  saveDraft();
  for (const u of S.unsubs) try { u(); } catch {}
  S.unsubs = []; S.local = null; S.queued = null;
  window.GestLokCommerce?.orders('',[]);
  window.GestLokTienda?.reset();
}
function abrirLocal(id){
  if (!localesMios().some(l => l.id === id)) return;
  if (S.panel) closePanel();
  if (S.local !== id){
    if (S.local) cerrarLocal();
    S.local = id;
    window.GestLokMunroDaily?.reset();
    S.allProds = []; S.allFab = []; S.hojasDB = []; S.conteos = []; S.chat = []; S.diarios = []; S.vencimientos = []; S.avisos = []; window.GestLokUpdates?.reset(); S.provInfo = []; S.provHist = []; S.provOpen = ''; S.provAdding = false; S.provDrafts = {}; S.unreadChat = 0;
    S.loaded.p = S.loaded.c = S.loaded.f = S.loaded.h = false;
    S.ntEdit = {}; S.view = 'inicio'; S.diarioDia = ''; S.diarioProd = ''; S.cat = ''; S.q = ''; S.filtro = 'todos'; S.cfiltro = 'todos'; S.histHoja = ''; S.histPer = 'todo'; S.histQ = ''; S.pedAdj = {};
    restoreDraft(); subscribeLocal();
  }
  S.ro = !puedeEditarLocal(id);
  $('#hub').hidden = true; $('#app').hidden = false;
  render(); window.scrollTo({top:0});
}
function mostrarHub(){
  if (S.panel) closePanel();
  if (S.local) cerrarLocal();
  $('#app').classList.remove('open'); $('#scrim').hidden = true;
  $('#app').hidden = true; $('#hub').hidden = false;
  renderHub(); window.scrollTo({top:0});
}
async function resolveNames(){
  if (!S.user) return;
  const ids = [...new Set(S.conteos.map(c => c.autor).filter(Boolean))]; if (!ids.length) return;
  try { const ps = await S.user.profiles(ids); let ch = false; for (const id of ids){ const n = (ps[id] && ps[id].name) || ''; if (S.names[id] !== n){ S.names[id] = n; ch = true; } } if (ch) render(); } catch {}
}
async function boot(){
  const c = window.claude;
  if (!c || typeof c.use !== 'function'){ S.booted = true; render(); return; }
  const [db, user, dl] = await Promise.all([c.use('db'), c.use('user'), c.use('downloads')]);
  S.db = db; S.user = user; S.dl = dl; S.booted = true;
  if (user){ try { S.me = await user.me(); S.uid = S.me.id; } catch {} }
  if (!db){ render(); return; }
  render(); subscribeGlobal();
}

/* ---------- Inicio ---------- */
function start(){
  applySkin(); render(); renderInstall(); boot();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // Keep the existing installed PWA: request SW revalidation on launch and
    // when returning to GestLok. Never force a reload while editing stock.
    navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}).then(reg => {
      let lastCheck = 0;
      const refresh = () => {
        if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
        if (Date.now() - lastCheck < 30 * 60 * 1000) return;
        lastCheck = Date.now();
        reg.update().catch(() => {});
      };
      refresh();
      document.addEventListener('visibilitychange', refresh);
      window.addEventListener('online', refresh);
    }).catch(() => {});
  }
}
window.GestLokUpdates?.attach({S,C,w,render,canW,toast,fail,localNombre,miRol:()=>miRol()});
window.GestLokMunroDaily?.attach({S,C,w,render,canW,toast,fail,miRol,misLocales,hoyISO});
window.GestLokCommerce?.attach({S,C,render,canW,toast,fail,miRol,localNombre,go});
window.GestLokTienda?.attach({S,C,render,canW,toast,fail,miRol,localNombre,go});
window.GestLokDemo?.attach({isCreadora,render});
window.GestLokCreator?.attach({isCreadora,renderHub,toast,onClose:()=>{S.creatorSetup=false;renderHub();}});
window.GestLokSupport?.attach({S,miRol,isCreadora,localNombre,nombreHoja,renderHub,toast});
start();
let alertDay = window.GestLokUpdates?.todayISO?.() || '';
setInterval(() => {
  if (!S.panel && S.local) renderSavebar();
  if (S.local) refreshChatAges();
  const today = window.GestLokUpdates?.todayISO?.() || '';
  if (today && today !== alertDay) {
    alertDay = today;
    if (S.local && ['inicio','vencimientos','avisos'].includes(S.view)) render();
  }
}, 60000);
})();
