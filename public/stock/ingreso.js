/* MG Stock · Ingreso de mercadería: lectura de archivos y reconocimiento de productos.
   Todo corre en el dispositivo de la dueña: los archivos no se suben a ningún lado.
   CSV, texto y Excel (.xlsx) con un lector propio; PDF con pdf.js y fotos o PDF escaneados con Tesseract.js
   (librerías gratuitas alojadas en la misma web, en /vendor, que se cargan solo al usarlas). */
(() => {
  'use strict';
  const VENDOR = (() => { try { return new URL('../vendor/', (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || location.href).href; } catch { return 'vendor/'; } })();

  /* ---------- Texto ---------- */
  const FRQ = {'¼':' 1/4', '½':' 1/2', '¾':' 3/4'};
  const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'y', 'en', 'para', 'por', 'al', 'a']);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d),(\d)/g, '$1.$2').replace(/[^a-z0-9./ ]+/g, ' ').replace(/(^|\s)[./]+|[./]+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const stem = t => (t.length > 4 && /[^aeiou]es$/.test(t)) ? t.slice(0, -2) : (t.length > 3 && t.endsWith('s')) ? t.slice(0, -1) : t;

  /* Unidades: se reconocen, nunca se convierten */
  const UNI = {
    unidad:['u', 'un', 'uni', 'unid', 'unids', 'unidad', 'unidades', 'und', 'uds', 'ud'], caja:['cj', 'cja', 'caja', 'cajas', 'cjs'],
    kg:['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'], gr:['g', 'gr', 'grs', 'gramo', 'gramos'],
    docena:['doc', 'docena', 'docenas', 'dz'], paquete:['paq', 'paquete', 'paquetes', 'pq'], bolsa:['bolsa', 'bolsas', 'bls'],
    bulto:['bulto', 'bultos', 'blt'], pack:['pack', 'packs'], balde:['balde', 'baldes'], botella:['botella', 'botellas', 'bot'],
    lata:['lata', 'latas'], rollo:['rollo', 'rollos'], litro:['l', 'lt', 'lts', 'litro', 'litros'], pieza:['pieza', 'piezas', 'pza', 'pzas'], horma:['horma', 'hormas']
  };
  const UMAP = new Map(); for (const [k, vs] of Object.entries(UNI)) for (const v of vs) UMAP.set(v, k);
  const unidadDe = s => { const t = norm(s).replace(/\./g, ''); return t ? (UMAP.get(t) || null) : null; };
  const UN_RE = [...UMAP.keys()].sort((a, b) => b.length - a.length).map(u => u.replace('.', '\\.')).join('|');

  /* Cantidad: 2 · 2,5 · 2.75 · 1/4 · 2 3/4 · ¾ · 2¾ */
  function cantidadDe(txt){
    const t = String(txt ?? '').replace(/[¼½¾]/g, m => FRQ[m]).replace(/\s+/g, ' ').trim();
    if (!t) return null;
    let m = t.match(/^(\d+) (\d+)\/(\d+)$/); if (m && +m[3]) return +m[1] + (+m[2]) / (+m[3]);
    m = t.match(/^(\d+)\/(\d+)$/); if (m && +m[2]) return (+m[1]) / (+m[2]);
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
    if (/^\d*[.,]?\d+$/.test(t)) return parseFloat(t.replace(',', '.'));
    return null;
  }
  const NUM = '(\\d+ \\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?)';
  const RE_FIN = new RegExp(`^(.*?\\S)\\s*(?:[:=\\-–—|]|\\s[x×]|\\s)\\s*${NUM}\\s*(${UN_RE})?\\.?\\s*$`, 'i');
  const RE_INI = new RegExp(`^${NUM}\\s*(${UN_RE})?\\.?\\s*(?:[x×]\\s+|de\\s+|[-–—:]\\s*)?(\\D.*)$`, 'i');
  /* Renglón de texto libre (CSV de una columna, .txt; más adelante PDF y fotos) */
  function renglon(linea){
    let s = String(linea ?? '').replace(/[¼½¾]/g, m => FRQ[m]).replace(/\s+/g, ' ').trim().replace(/^[-•*·]+\s*/, '');
    if (!s || s.length > 200) return null;
    let m = s.match(RE_FIN);
    if (m && /[a-záéíóúñ]/i.test(m[1])) return {nombre:m[1].replace(/\s+[x×]$/i, '').replace(/[\s:=\-–—|]+$/, '').trim(), cantidad:cantidadDe(m[2]), unidad:m[3] ? unidadDe(m[3]) : null, unidadTxt:m[3] || ''};
    m = s.match(RE_INI);
    if (m && /[a-záéíóúñ]/i.test(m[3])) return {nombre:m[3].trim(), cantidad:cantidadDe(m[1]), unidad:m[2] ? unidadDe(m[2]) : null, unidadTxt:m[2] || ''};
    return /[a-záéíóúñ]/i.test(s) ? {nombre:s, cantidad:null, unidad:null, unidadTxt:''} : null;
  }

  /* ---------- CSV ---------- */
  function decodificar(buf){
    const b = new Uint8Array(buf);
    try { return new TextDecoder('utf-8', {fatal:true}).decode(b).replace(/^﻿/, ''); }
    catch { return new TextDecoder('windows-1252').decode(b); }
  }
  function leerCSV(texto){
    const t = String(texto).replace(/\r\n?/g, '\n');
    const muestra = t.split('\n').slice(0, 20).join('\n').replace(/"[^"]*"/g, '');
    const sep = [';', '\t', ',', '|'].map(c => [c, muestra.split(c).length]).sort((a, b) => b[1] - a[1])[0];
    const d = sep[1] > 1 ? sep[0] : null;
    const filas = []; let fila = [], campo = '', q = false;
    for (let i = 0; i < t.length; i++){
      const c = t[i];
      if (q){ if (c === '"'){ if (t[i + 1] === '"'){ campo += '"'; i++; } else q = false; } else campo += c; continue; }
      if (c === '"' && campo === ''){ q = true; continue; }
      if (d && c === d){ fila.push(campo); campo = ''; continue; }
      if (c === '\n'){ fila.push(campo); filas.push(fila); fila = []; campo = ''; continue; }
      campo += c;
    }
    if (campo !== '' || fila.length){ fila.push(campo); filas.push(fila); }
    return filas.map(f => f.map(x => x.trim())).filter(f => f.some(x => x !== ''));
  }

  /* ---------- Excel (.xlsx): ZIP + XML, sin librerías ---------- */
  const LIM = 40 * 1024 * 1024;
  async function inflar(bytes){
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede abrir Excel. Guardalo como CSV.');
    const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
    w.write(bytes).catch(() => {}); w.close().catch(() => {});
    const r = ds.readable.getReader(), partes = []; let n = 0;
    for (;;){ const {value, done} = await r.read(); if (done) break; n += value.length; if (n > LIM) { r.cancel().catch(() => {}); throw new Error('El Excel es demasiado grande.'); } partes.push(value); }
    const out = new Uint8Array(n); let o = 0; for (const p of partes){ out.set(p, o); o += p.length; } return out;
  }
  async function zipLeer(buf){
    const b = new Uint8Array(buf), v = new DataView(buf instanceof ArrayBuffer ? buf : b.buffer, b.byteOffset, b.byteLength);
    if (b.length < 22 || v.getUint32(0, true) !== 0x04034b50) throw new Error('El archivo no es un Excel .xlsx válido.');
    let e = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50){ e = i; break; }
    if (e < 0) throw new Error('El archivo no es un Excel .xlsx válido.');
    const total = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
    if (total > 2000) throw new Error('El Excel tiene demasiados archivos internos.');
    const dec = new TextDecoder(), ent = new Map();
    for (let k = 0; k < total; k++){
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const met = v.getUint16(p + 10, true), csz = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      ent.set(dec.decode(b.subarray(p + 46, p + 46 + nl)), {met, csz, off}); p += 46 + nl + xl + cl;
    }
    return async nombre => {
      const x = ent.get(nombre); if (!x) return null;
      if (v.getUint32(x.off, true) !== 0x04034b50) throw new Error('El Excel está dañado.');
      const ini = x.off + 30 + v.getUint16(x.off + 26, true) + v.getUint16(x.off + 28, true), datos = b.subarray(ini, ini + x.csz);
      const raw = x.met === 0 ? datos : x.met === 8 ? await inflar(datos) : null;
      if (!raw) throw new Error('El Excel usa una compresión que no se puede leer.');
      return new TextDecoder('utf-8').decode(raw);
    };
  }
  const xmlTxt = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, c) => c[0] === '#' ? String.fromCodePoint(c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10)) : {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'"}[c.toLowerCase()]);
  const tTxt = s => [...String(s).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => xmlTxt(m[1])).join('');
  const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  async function leerXLSX(buf){
    const get = await zipLeer(buf);
    const wb = await get('xl/workbook.xml'); if (!wb) throw new Error('El archivo no es un Excel .xlsx válido.');
    const rels = (await get('xl/_rels/workbook.xml.rels')) || '';
    const rmap = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => [(/\bId="([^"]+)"/.exec(m[0]) || [])[1], (/\bTarget="([^"]+)"/.exec(m[0]) || [])[1]]));
    const ss = ((await get('xl/sharedStrings.xml')) || '').match(/<si\b[\s\S]*?<\/si>/g) || [];
    const strs = ss.map(tTxt);
    const hojas = [];
    for (const m of wb.matchAll(/<sheet\b[^>]*>/g)){
      const nombre = xmlTxt((/\bname="([^"]*)"/.exec(m[0]) || [])[1] || 'Hoja'), rid = (/\br:id="([^"]+)"/.exec(m[0]) || [])[1];
      let tg = rmap.get(rid) || ''; tg = tg.replace(/^\/?(xl\/)?/, ''); if (!tg) continue;
      const xml = await get('xl/' + tg); if (!xml) continue;
      const filas = [];
      for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
        const fila = [];
        for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
          const at = cm[1], body = cm[2] || '', i = colIdx((/\br="([^"]+)"/.exec(at) || [])[1]), t = (/\bt="([^"]+)"/.exec(at) || [])[1] || 'n';
          const vv = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
          let val = '';
          if (t === 's') val = strs[+vv] ?? ''; else if (t === 'inlineStr') val = tTxt(body); else if (t === 'b') val = vv === '1' ? 'VERDADERO' : 'FALSO'; else if (vv != null) val = xmlTxt(vv);
          if (t === 'n' && val !== '' && Number.isFinite(+val)) val = String(Math.round(+val * 10000) / 10000);
          if (i >= 0 && i < 200){ while (fila.length < i) fila.push(''); fila[i] = String(val).trim(); }
        }
        if (fila.some(x => x !== '')) filas.push(fila);
        if (filas.length > 5000) break;
      }
      hojas.push({nombre, filas});
      if (hojas.length >= 30) break;
    }
    if (!hojas.length) throw new Error('El Excel no tiene hojas con datos.');
    return hojas;
  }

  /* ---------- De una tabla a renglones ---------- */
  const H_PROD = /^(producto|productos|descripcion|detalle|articulo|item|nombre|mercaderia|concepto|insumo)/;
  const H_CANT = /^(cantidad|cant|cantidades|unidades|bultos|qty|cajas|piezas|total unidades)$/;
  const H_UNI = /^(unidad|unidades de medida|um|u m|medida|presentacion|unid)$/;
  function columnas(filas){
    for (let r = 0; r < Math.min(10, filas.length); r++){
      const f = filas[r].map(norm); let p = -1, c = -1, u = -1;
      f.forEach((x, i) => { const y = x.replace(/\./g, ' ').replace(/\s+/g, ' ').trim(); if (p < 0 && H_PROD.test(y)) p = i; else if (c < 0 && H_CANT.test(y)) c = i; else if (u < 0 && H_UNI.test(y)) u = i; });
      if (p >= 0 && c >= 0) return {encabezado:r, producto:p, cantidad:c, unidad:u};
    }
    const n = Math.max(...filas.map(f => f.length), 0);
    if (n <= 1) return {encabezado:-1, producto:0, cantidad:-1, unidad:-1};
    const txt = Array(n).fill(0), nro = Array(n).fill(0);
    for (const f of filas.slice(0, 200)) f.forEach((x, i) => { if (!x) return; if (cantidadDe(x) != null) nro[i]++; else if (/[a-z]/i.test(x)) txt[i]++; });
    const p = txt.indexOf(Math.max(...txt));
    let c = -1, best = 0; nro.forEach((k, i) => { if (i !== p && k > best){ best = k; c = i; } });
    return {encabezado:-1, producto:p, cantidad:c, unidad:-1};
  }
  function renglonesTabla(filas, col){
    const out = [];
    filas.forEach((f, r) => {
      if (r <= col.encabezado) return;
      const texto = f.filter(x => x !== '').join(' · ');
      if (col.cantidad < 0){ for (const x of f){ const g = renglon(x); if (g) out.push({fila:r + 1, texto:x, ...g}); } return; }
      const nombre = String(f[col.producto] ?? '').trim(); if (!nombre || !/[a-záéíóúñ]/i.test(nombre)) return;
      if (/^(sub ?)?total(es)?\b/i.test(norm(nombre))) return;
      let cTxt = String(f[col.cantidad] ?? '').trim(), uTxt = col.unidad >= 0 ? String(f[col.unidad] ?? '').trim() : '';
      const m = cTxt.match(new RegExp(`^${NUM}\\s*(${UN_RE})\\.?$`, 'i'));
      if (m){ cTxt = m[1]; if (!uTxt) uTxt = m[2]; }
      out.push({fila:r + 1, texto, nombre, cantidad:cantidadDe(cTxt), cantTxt:cTxt, unidad:uTxt ? unidadDe(uTxt) : null, unidadTxt:uTxt});
    });
    return out;
  }
  function renglonesTexto(texto){
    return String(texto).split(/\r?\n/).map((x, i) => { const g = renglon(x); return g ? {fila:i + 1, texto:x.trim(), ...g} : null; }).filter(Boolean);
  }

  /* ---------- Coincidencias con los productos de la sucursal ---------- */
  const bigr = s => { const t = s.replace(/ /g, ''), m = new Map(); for (let i = 0; i < t.length - 1; i++){ const k = t.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  function dice(a, b){ if (!a.size || !b.size) return 0; let n = 0, ta = 0, tb = 0; for (const v of a.values()) ta += v; for (const v of b.values()) tb += v; for (const [k, v] of a) n += Math.min(v, b.get(k) || 0); return 2 * n / (ta + tb); }
  function prep(nombre){
    const n = norm(nombre), toks = n.split(' ').filter(t => t && !STOP.has(t)).map(stem);
    return {n, toks, nums:toks.filter(t => /\d/.test(t)).sort().join(' '), bi:bigr(n)};
  }
  const tokIgual = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) || (a.length >= 5 && b.length >= 5 && dice(bigr(a), bigr(b)) >= 0.75);
  function puntaje(a, b){
    if (!a.n || !b.n) return 0;
    if (a.n === b.n || a.toks.join(' ') === b.toks.join(' ')) return 1;
    const usados = new Set(); let comun = 0;
    for (const t of a.toks){ const j = b.toks.findIndex((u, k) => !usados.has(k) && tokIgual(t, u)); if (j >= 0){ usados.add(j); comun++; } }
    const tok = a.toks.length + b.toks.length ? 2 * comun / (a.toks.length + b.toks.length) : 0;
    let s = 0.6 * tok + 0.4 * dice(a.bi, b.bi);
    if (a.nums && b.nums && a.nums !== b.nums) s = Math.min(s, 0.7);
    return Math.round(s * 1000) / 1000;
  }
  const UMBRAL_SI = 0.92, UMBRAL_TAL_VEZ = 0.6;
  /* productos: [{key, nombre, ...}] → para cada renglón: estado y candidatos */
  function coincidencias(renglones, productos){
    const P = productos.map(p => ({p, k:prep(p.nombre)}));
    return renglones.map(r => {
      const a = prep(r.nombre);
      const cands = P.map(x => ({key:x.p.key, s:puntaje(a, x.k), n:x.k.n})).filter(x => x.s >= UMBRAL_TAL_VEZ).sort((x, y) => y.s - x.s);
      if (!cands.length) return {...r, estado:'ignorado', motivo:'No coincide con ningún producto de la sucursal', cands:[]};
      const top = cands[0].s, cerca = cands.filter(x => x.s >= top - 0.04);
      if (cerca.length > 1){
        const mismoNombre = cerca.every(x => x.n === cerca[0].n);
        return {...r, estado:mismoNombre ? 'hoja' : 'elegir', motivo:mismoNombre ? 'Está en más de una hoja: elegí el destino' : 'Se parece a varios productos: elegí cuál', cands:cerca.slice(0, 8)};
      }
      return {...r, estado:top >= UMBRAL_SI ? 'coincide' : 'parecido', motivo:top >= UMBRAL_SI ? '' : 'Nombre parecido: revisalo', cands:cands.slice(0, 5), key:cands[0].key, s:top};
    });
  }

  /* ---------- PDF y fotos: de palabras con posición a tabla o renglones ---------- */
  const W_PROD = /^(producto|productos|descripcion|detalle|articulo|item|mercaderia|concepto|insumo|nombre)$/;
  const W_CANT = /^(cantidad|cant|cantidades|unidades|unid|bultos|qty|cajas|piezas)$/;
  const W_UNI = /^(unidad|um|medida|presentacion)$/;
  const wn = t => norm(t).replace(/\./g, ' ').trim().split(' ')[0] || '';
  function lineasDe(palabras){
    const ws = palabras.filter(w => String(w.t).trim()).map(w => ({...w, yc:w.y + w.h / 2})).sort((a, b) => a.yc - b.yc);
    const hs = ws.map(w => w.h).sort((a, b) => a - b), mh = hs[Math.floor(hs.length / 2)] || 10;
    const out = [];
    for (const w of ws){ const l = out[out.length - 1]; if (l && Math.abs(w.yc - l.y) <= mh * 0.6){ l.ws.push(w); l.y = (l.y * (l.ws.length - 1) + w.yc) / l.ws.length; } else out.push({y:w.yc, ws:[w]}); }
    for (const l of out) l.ws.sort((a, b) => a.x - b.x);
    return out;
  }
  function desdePalabras(palabras, nombre){
    const ls = lineasDe(palabras);
    const hi = ls.findIndex(l => l.ws.some(w => W_PROD.test(wn(w.t))) && l.ws.some(w => W_CANT.test(wn(w.t))));
    if (hi >= 0){
      const hd = ls[hi].ws, cortes = hd.map((w, i) => i ? (hd[i - 1].x + hd[i - 1].w + w.x) / 2 : -Infinity);
      const col = w => { const c = w.x + w.w / 2; let k = 0; for (let i = 0; i < cortes.length; i++) if (c >= cortes[i]) k = i; return k; };
      const filas = [hd.map(w => String(w.t))];
      for (const l of ls.slice(hi + 1)){ const f = Array(hd.length).fill(''); for (const w of l.ws){ const k = col(w); f[k] = (f[k] ? f[k] + ' ' : '') + String(w.t).trim(); } if (f.some(Boolean)) filas.push(f); }
      return {hojas:[{nombre, filas}]};
    }
    return {texto:ls.map(l => l.ws.map(w => String(w.t).trim()).join(' ')).join('\n')};
  }
  function cargarScript(url){
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.async = true; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('No se pudo cargar el lector. Revisá la conexión.')); }; document.head.appendChild(s); });
  }
  /* OCR en el dispositivo (Tesseract.js, español). Devuelve palabras con posición. */
  async function ocr(canvases, prog){
    if (!window.Tesseract) await cargarScript(VENDOR + 'ocr/tesseract.min.js');
    prog && prog('Preparando la lectura de la imagen…');
    const wk = await window.Tesseract.createWorker('spa', 1, {workerPath:VENDOR + 'ocr/worker.min.js', corePath:VENDOR + 'ocr/', langPath:VENDOR + 'ocr/', logger:m => { if (prog && m && m.status === 'recognizing text') prog(`Leyendo la imagen… ${Math.round((m.progress || 0) * 100)}%`); }});
    const pal = [];
    try {
      for (let k = 0; k < canvases.length; k++){
        const {data} = await wk.recognize(canvases[k], {}, {tsv:true, text:true});
        const dy = k * 100000;
        if (data && data.tsv){
          for (const ln of String(data.tsv).split('\n')){ const c = ln.split('\t'); if (c[0] !== '5' || c.length < 12) continue; const t = c.slice(11).join(' ').trim(); if (!t || +c[10] < 0) continue; pal.push({t, x:+c[6], y:+c[7] + dy, w:+c[8], h:+c[9]}); }
        } else if (data && data.text){ String(data.text).split('\n').forEach((t, i) => { if (t.trim()) pal.push({t, x:0, y:dy + i * 20, w:10, h:10}); }); }
      }
    } finally { try { await wk.terminate(); } catch {} }
    return pal;
  }
  function lienzo(src, w, h){
    const max = 2400, k = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const x = c.getContext('2d', {willReadFrequently:true}); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height);
    const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4){ const g = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114); d[i] = d[i + 1] = d[i + 2] = g; }
    x.putImageData(im, 0, 0); return c;
  }
  async function leerImagen(file, prog){
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch { throw new Error('No se pudo abrir la imagen. Si es una foto HEIC de iPhone, sacala desde «Ingresar remito» con la cámara o compartila como JPG.'); }
    const c = lienzo(bmp, bmp.width, bmp.height); if (bmp.close) bmp.close();
    return desdePalabras(await ocr([c], prog), 'Foto');
  }
  async function leerPDF(buf, prog){
    prog && prog('Abriendo el PDF…');
    let pdfjs;
    try { pdfjs = await import(VENDOR + 'pdfjs/pdf.min.mjs'); } catch { throw new Error('No se pudo cargar el lector de PDF. Revisá la conexión.'); }
    pdfjs.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs/pdf.worker.min.mjs';
    let doc; try { doc = await pdfjs.getDocument({data:new Uint8Array(buf), isEvalSupported:false}).promise; } catch { throw new Error('El PDF está dañado o tiene contraseña.'); }
    const n = Math.min(doc.numPages, 10), pal = [], escan = [];
    for (let i = 1; i <= n; i++){
      const pg = await doc.getPage(i), vp = pg.getViewport({scale:1}), tc = await pg.getTextContent(), dy = (i - 1) * 100000;
      const its = tc.items.filter(it => it.str && it.str.trim());
      if (its.map(it => it.str).join('').replace(/\s/g, '').length < 15){ escan.push(pg); continue; }
      for (const it of its){ const h = Math.abs(it.height || it.transform[3] || 10); pal.push({t:it.str, x:it.transform[4], y:vp.height - it.transform[5] - h + dy, w:it.width || it.str.length * h * 0.5, h}); }
    }
    if (escan.length && !pal.length){
      const cs = [];
      for (const pg of escan.slice(0, 5)){ prog && prog('El PDF es escaneado: preparando la imagen…'); const v0 = pg.getViewport({scale:1}), vp = pg.getViewport({scale:Math.min(3, 2000 / v0.width)}); const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); await pg.render({canvasContext:c.getContext('2d'), viewport:vp}).promise; cs.push(lienzo(c, c.width, c.height)); }
      return {...desdePalabras(await ocr(cs, prog), 'PDF escaneado'), ocr:true};
    }
    return desdePalabras(pal, 'PDF');
  }

  /* ---------- Huellas para detectar importaciones repetidas ---------- */
  async function huella(datos){
    const b = typeof datos === 'string' ? new TextEncoder().encode(datos) : new Uint8Array(datos);
    const h = await crypto.subtle.digest('SHA-256', b);
    return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- Entrada principal: un archivo → tablas o renglones ---------- */
  async function leerArchivo(file, prog){
    const nombre = String(file.name || 'archivo'), ext = (nombre.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
    if (file.size > 15 * 1024 * 1024) throw new Error('El archivo pesa más de 15 MB.');
    const buf = await file.arrayBuffer(), hash = await huella(buf);
    if (ext === 'xlsx' || /spreadsheetml/.test(file.type || '')) return {tipo:'xlsx', hash, hojas:await leerXLSX(buf)};
    if (ext === 'xls') throw new Error('Los Excel viejos (.xls) no se pueden leer. Abrilo y guardalo como .xlsx o CSV.');
    if (ext === 'csv' || /csv/.test(file.type || '')) return {tipo:'csv', hash, hojas:[{nombre:'CSV', filas:leerCSV(decodificar(buf))}]};
    if (ext === 'txt' || /^text\//.test(file.type || '')) return {tipo:'txt', hash, texto:decodificar(buf)};
    if (ext === 'pdf' || /pdf/.test(file.type || '')) return {tipo:'pdf', hash, ...(await leerPDF(buf, prog))};
    if (/^image\//.test(file.type || '') || ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'bmp'].includes(ext)) return {tipo:'foto', hash, ocr:true, ...(await leerImagen(file, prog))};
    throw new Error('Formato no admitido. Usá una foto, un PDF, Excel (.xlsx) o CSV.');
  }

  const api = {desdePalabras, lineasDe, norm, unidadDe, cantidadDe, renglon, leerCSV, leerXLSX, columnas, renglonesTabla, renglonesTexto, prep, puntaje, coincidencias, huella, leerArchivo, decodificar, UMBRAL_SI, UMBRAL_TAL_VEZ};
  if (typeof window !== 'undefined') window.MGSIngreso = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
