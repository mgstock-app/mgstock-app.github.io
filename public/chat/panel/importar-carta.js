/* GESTLOK Chat · Importar carta (cualquier rubro).
 * Lee una carta en PDF, una foto o texto pegado y arma una propuesta de categorías, productos, precios y
 * descripciones. Todo corre en el dispositivo (pdf.js y Tesseract en español, gratis): no se envía el archivo a
 * ningún servidor. La propuesta siempre se revisa en el panel antes de guardar; la base valida cada producto.
 */
const VENDOR = '/vendor/';
const MAX_PRODUCTOS = 300;

const limpiar = t => String(t || '').replace(/\s+/g, ' ').trim();
export const normalizar = t => limpiar(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Agrupa palabras con posición ({t, x, y, h}) en renglones de texto, de arriba hacia abajo. */
export function lineasDesdePalabras(palabras) {
  const ps = (palabras || []).filter(p => limpiar(p.t)).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const lineas = [];
  for (const p of ps) {
    const l = lineas[lineas.length - 1];
    const tol = Math.max(4, (p.h || 10) * 0.6);
    if (l && Math.abs(l.y - p.y) <= tol) l.ws.push(p);
    else lineas.push({y: p.y, ws: [p]});
  }
  return lineas.map(l => l.ws.sort((a, b) => a.x - b.x).map(w => limpiar(w.t)).join(' ')).join('\n');
}

// Precio al final del renglón: «$ 1.200», «1200», «12.500,00», «$9000». Se ignoran números chicos (cantidades).
const RE_PRECIO = /(?:\$\s*)?(\d{1,3}(?:[.\s]\d{3})+|\d{2,7})(?:,\d{1,2})?\s*$/;
const RE_RELLENO = /[\s.·…_\-–—:|]+$/;

/** Número de un precio escrito a la argentina. */
export function numeroPrecio(t) {
  const m = String(t || '').replace(/,\d{1,2}\s*$/, '').replace(/[^0-9]/g, '');
  return m ? Number(m) : NaN;
}

function separarPrecios(linea) {
  // Puede haber más de un precio (por ejemplo, chica y grande): se toman todos los del final.
  const precios = [];
  let resto = linea;
  for (let i = 0; i < 3; i++) {
    const m = resto.match(RE_PRECIO);
    if (!m) break;
    const tieneSigno = /\$\s*[\d.\s,]+$/.test(m[0]);
    const n = numeroPrecio(m[0]);
    // «x 100», «por 12», «de 500»: es una cantidad o medida, no un precio.
    if (/\b(x|por|de)\s*$/i.test(resto.slice(0, m.index))) break;
    // Sin «$», un número de 2 dígitos suele ser una cantidad («x 12», «6 unidades»), no un precio.
    if (!Number.isFinite(n) || n < 50 || (!tieneSigno && n < 100)) break;
    precios.unshift(n);
    resto = resto.slice(0, m.index).replace(RE_RELLENO, '');
  }
  return {nombre: limpiar(resto.replace(RE_RELLENO, '')), precios};
}

const esTitulo = t => {
  const s = limpiar(t);
  if (!s || s.length > 40 || /\d{3,}/.test(s)) return false;
  if (/:$/.test(s)) return true;
  const letras = s.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
  return letras.length >= 3 && letras === letras.toUpperCase();
};
const pareceDescripcion = t => /^[a-záéíóúñ(]/.test(t) || t.length > 45 || /,/.test(t);

/**
 * Propuesta a partir del texto de la carta: [{nombre, productos: [{nombre, precio, descripcion}]}].
 * No inventa nada: lo que no tiene precio no se guarda como producto.
 */
export function analizarCarta(texto) {
  const categorias = [];
  let actual = null, ultimo = null, pendiente = '';
  const categoria = nombre => {
    const n = limpiar(nombre).replace(/:$/, '').slice(0, 60) || 'General';
    actual = categorias.find(c => normalizar(c.nombre) === normalizar(n));
    if (!actual) { actual = {nombre: n, productos: []}; categorias.push(actual); }
    ultimo = null; pendiente = '';
  };
  const total = () => categorias.reduce((s, c) => s + c.productos.length, 0);
  // Un renglón suelto sin precio que no fue nombre de nada: era la descripción del producto anterior.
  const descargarPendiente = () => {
    if (pendiente && ultimo && !ultimo.descripcion) ultimo.descripcion = pendiente.slice(0, 300);
    pendiente = '';
  };
  for (const crudo of String(texto || '').split(/\r?\n/)) {
    const linea = limpiar(crudo);
    if (!linea || /^(menu|menú|carta|precios?)$/i.test(linea)) continue;
    if (total() >= MAX_PRODUCTOS) break;
    const {nombre, precios} = separarPrecios(linea);
    if (precios.length) {
      // El nombre puede venir en el renglón anterior y el precio solo, en este.
      if (nombre) descargarPendiente();
      const nom = (nombre || pendiente).slice(0, 120);
      pendiente = '';
      if (!nom) continue;
      if (!actual) categoria('General');
      ultimo = {nombre: nom, precio: precios[0],
        descripcion: precios.length > 1 ? 'Otros precios: ' + precios.slice(1).map(p => '$ ' + p.toLocaleString('es-AR')).join(' / ') : ''};
      actual.productos.push(ultimo);
      continue;
    }
    if (esTitulo(linea)) { descargarPendiente(); categoria(linea); continue; }
    if (ultimo && !pendiente && pareceDescripcion(linea)) {
      ultimo.descripcion = limpiar((ultimo.descripcion ? ultimo.descripcion + ' · ' : '') + linea).slice(0, 300);
      continue;
    }
    pendiente = pendiente ? limpiar(pendiente + ' ' + linea).slice(0, 120) : linea;
  }
  descargarPendiente();
  return categorias.filter(c => c.productos.length);
}

function cargarScript(url) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = url; s.async = true; s.onload = res;
    s.onerror = () => { s.remove(); rej(new Error('No se pudo cargar el lector. Revisá la conexión.')); };
    document.head.appendChild(s);
  });
}
function lienzo(src, w, h) {
  const max = 2400, k = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const x = c.getContext('2d', {willReadFrequently: true}); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
async function ocr(canvases, prog) {
  if (!window.Tesseract) await cargarScript(VENDOR + 'ocr/tesseract.min.js');
  prog?.('Preparando la lectura de la imagen…');
  const wk = await window.Tesseract.createWorker('spa', 1, {workerPath: VENDOR + 'ocr/worker.min.js', corePath: VENDOR + 'ocr/',
    langPath: VENDOR + 'ocr/', logger: m => { if (m?.status === 'recognizing text') prog?.('Leyendo la imagen… ' + Math.round((m.progress || 0) * 100) + '%'); }});
  const palabras = [];
  try {
    for (let k = 0; k < canvases.length; k++) {
      const {data} = await wk.recognize(canvases[k], {}, {tsv: true, text: true});
      const dy = k * 100000;
      if (data?.tsv) {
        for (const ln of String(data.tsv).split('\n')) {
          const c = ln.split('\t'); if (c[0] !== '5' || c.length < 12) continue;
          const t = c.slice(11).join(' ').trim(); if (!t || +c[10] < 0) continue;
          palabras.push({t, x: +c[6], y: +c[7] + dy, h: +c[9]});
        }
      } else if (data?.text) String(data.text).split('\n').forEach((t, i) => { if (t.trim()) palabras.push({t, x: 0, y: dy + i * 20, h: 10}); });
    }
  } finally { try { await wk.terminate(); } catch { /* ya cerrado */ } }
  return lineasDesdePalabras(palabras);
}

/** Texto de un archivo de carta: PDF (con texto o escaneado, hasta 10 páginas) o foto (JPG, PNG, WEBP). */
export async function leerArchivo(file, prog) {
  if (!file) throw new Error('Elegí un archivo.');
  if (file.size > 15 * 1024 * 1024) throw new Error('El archivo pesa más de 15 MB.');
  const esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!esPdf) {
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch { throw new Error('No se pudo abrir la imagen. Si es una foto HEIC de iPhone, compartila como JPG.'); }
    const c = lienzo(bmp, bmp.width, bmp.height); bmp.close?.();
    return ocr([c], prog);
  }
  prog?.('Abriendo el PDF…');
  let pdfjs;
  try { pdfjs = await import(VENDOR + 'pdfjs/pdf.min.js'); } catch { throw new Error('No se pudo cargar el lector de PDF. Revisá la conexión.'); }
  pdfjs.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs/pdf.worker.min.js';
  let doc;
  try { doc = await pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false}).promise; }
  catch { throw new Error('El PDF está dañado o tiene contraseña.'); }
  const n = Math.min(doc.numPages, 10), palabras = [], escaneadas = [];
  for (let i = 1; i <= n; i++) {
    const pg = await doc.getPage(i), vp = pg.getViewport({scale: 1}), tc = await pg.getTextContent(), dy = (i - 1) * 100000;
    const its = tc.items.filter(it => it.str && it.str.trim());
    if (its.map(it => it.str).join('').replace(/\s/g, '').length < 15) { escaneadas.push(pg); continue; }
    for (const it of its) {
      const h = Math.abs(it.height || it.transform[3] || 10);
      palabras.push({t: it.str, x: it.transform[4], y: vp.height - it.transform[5] - h + dy, h});
    }
  }
  if (palabras.length) return lineasDesdePalabras(palabras);
  const cs = [];
  for (const pg of escaneadas.slice(0, 5)) {
    prog?.('El PDF es escaneado: preparando la imagen…');
    const v0 = pg.getViewport({scale: 1}), vp = pg.getViewport({scale: Math.min(3, 2000 / v0.width)});
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await pg.render({canvasContext: c.getContext('2d'), viewport: vp}).promise;
    cs.push(lienzo(c, c.width, c.height));
  }
  return cs.length ? ocr(cs, prog) : '';
}
