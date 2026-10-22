// Ingreso de mercadería: lectores de archivos y reconocimiento de productos (sin red, sin base real).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deflateRawSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const I = require('../public/stock/ingreso.js');

/* Excel mínimo armado en memoria (ZIP con deflate), para no depender de archivos binarios */
function crc32(buf){ let c, crc = ~0; for (const b of buf){ c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
export function xlsx(hojas){
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const strs = [], si = s => { let i = strs.indexOf(s); if (i < 0){ strs.push(s); i = strs.length - 1; } return i; };
  const col = i => { let s = ''; i++; while (i){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="x" xmlns:r="r"><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships>${hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="ws" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`
  };
  hojas.forEach((h, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0"?><worksheet><sheetData>${h.filas.map((f, r) => `<row r="${r + 1}">${f.map((v, c) => v === '' || v == null ? '' : typeof v === 'number' ? `<c r="${col(c)}${r + 1}"><v>${v}</v></c>` : `<c r="${col(c)}${r + 1}" t="s"><v>${si(v)}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  });
  files['xl/sharedStrings.xml'] = `<?xml version="1.0"?><sst>${strs.map(s => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`;
  const parts = [], cen = []; let off = 0;
  for (const [name, txt] of Object.entries(files)){
    const raw = Buffer.from(txt, 'utf8'), comp = deflateRawSync(raw), nb = Buffer.from(name, 'utf8'), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    parts.push(lh, nb, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    cen.push(ch, nb); off += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(cen), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  const all = Buffer.concat([...parts, cd, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

const PRODS = [
  {key:'p:1', nombre:'Jamón Cocido'}, {key:'p:2', nombre:'Muzzarella'}, {key:'p:3', nombre:'Mix Provolone Hebras 600gr'},
  {key:'c:1', nombre:'Cajas grandes'}, {key:'c:2', nombre:'Cajas chicas'}, {key:'f:1', nombre:'Pepperoni'}, {key:'p:4', nombre:'Pepperoni'},
  {key:'p:5', nombre:'Salsa de Tomate 500gr'}, {key:'p:6', nombre:'Salsa de Tomate 1kg'}
];

test('quantities with decimals and quarters', () => {
  for (const [t, v] of [['2', 2], ['2,5', 2.5], ['2.75', 2.75], ['1/4', 0.25], ['2 3/4', 2.75], ['¾', 0.75], ['2¾', 2.75], ['1.250,5', 1250.5]]) assert.equal(I.cantidadDe(t), v, t);
  for (const t of ['', 'abc', '1/0', '-2']) assert.equal(I.cantidadDe(t), null, t);
});

test('free text lines: name, quantity and unit', () => {
  const r = t => { const x = I.renglon(t); return x && [x.nombre, x.cantidad, x.unidad]; };
  assert.deepEqual(r('Jamón cocido: 2'), ['Jamón cocido', 2, null]);
  assert.deepEqual(r('Muzzarella - 3 u'), ['Muzzarella', 3, 'unidad']);
  assert.deepEqual(r('Cajas grandes x 5'), ['Cajas grandes', 5, null]);
  assert.deepEqual(r('2 1/2 kg de Jamón cocido'), ['Jamón cocido', 2.5, 'kg']);
  assert.deepEqual(r('Mix Provolone Hebras 600gr 3'), ['Mix Provolone Hebras 600gr', 3, null]);
  assert.deepEqual(r('• Pepperoni ¾'), ['Pepperoni', 0.75, null]);
  assert.deepEqual(r('Caja Tex 4'), ['Caja Tex', 4, null]);
  assert.deepEqual(r('Producto sin cantidad'), ['Producto sin cantidad', null, null]);
  assert.equal(I.renglon('1234'), null);
});

test('CSV with semicolons, quotes, BOM and Windows accents', () => {
  const f = I.leerCSV('﻿Producto;Cantidad\n"Jamón; cocido";2\nMuzzarella;"3,5"\n\n');
  assert.deepEqual(f, [['Producto', 'Cantidad'], ['Jamón; cocido', '2'], ['Muzzarella', '3,5']]);
  const latin = Buffer.from([0x4a, 0x61, 0x6d, 0xf3, 0x6e, 0x3b, 0x32]); // "Jamón;2" en Windows-1252
  assert.equal(I.decodificar(latin), 'Jamón;2');
});

test('Excel .xlsx read without external libraries', async () => {
  const buf = xlsx([{nombre:'Remito', filas:[['Remito 123', ''], ['Descripción', 'Cant.', 'U.M.'], ['Jamón cocido', 2, 'kg'], ['Muzzarella', 3.5, 'u'], ['Total', 5.5, '']]}, {nombre:'Otra', filas:[['x']]}]);
  const hojas = await I.leerXLSX(buf);
  assert.deepEqual(hojas.map(h => h.nombre), ['Remito', 'Otra']);
  const col = I.columnas(hojas[0].filas);
  assert.deepEqual(col, {encabezado:1, producto:0, cantidad:1, unidad:2});
  const rs = I.renglonesTabla(hojas[0].filas, col);
  assert.deepEqual(rs.map(r => [r.nombre, r.cantidad, r.unidad]), [['Jamón cocido', 2, 'kg'], ['Muzzarella', 3.5, 'unidad']]);
  await assert.rejects(I.leerXLSX(new TextEncoder().encode('no es un excel').buffer), /xlsx/);
});

test('columns are guessed when there is no header', () => {
  const filas = [['Jamón cocido', '2'], ['Muzzarella', '3'], ['Cajas grandes', '5']];
  assert.deepEqual(I.columnas(filas), {encabezado:-1, producto:0, cantidad:1, unidad:-1});
  const una = [['Jamón cocido 2'], ['Muzzarella: 3']];
  const rs = I.renglonesTabla(una, I.columnas(una));
  assert.deepEqual(rs.map(r => [r.nombre, r.cantidad]), [['Jamón cocido', 2], ['Muzzarella', 3]]);
});

test('matching: exact, plural, accents, typos, numbers, several sheets and unknown', () => {
  const m = n => I.coincidencias([{nombre:n, cantidad:1}], PRODS)[0];
  assert.equal(m('JAMON COCIDO').estado, 'coincide'); assert.equal(m('JAMON COCIDO').key, 'p:1');
  assert.equal(m('Caja grande').key, 'c:1');
  assert.equal(m('Mozzarella').key, 'p:2');
  assert.notEqual(m('Mozzarella').estado, 'ignorado');
  assert.equal(m('Mix provolone hebras 600 gr').estado, 'coincide');
  const st = m('Salsa de tomate 2kg'); assert.ok(st.estado !== 'coincide', 'otro tamaño no coincide solo');
  const pe = m('Pepperoni'); assert.equal(pe.estado, 'hoja'); assert.deepEqual(pe.cands.map(c => c.key).sort(), ['f:1', 'p:4']);
  assert.equal(m('Producto desconocido').estado, 'ignorado');
  assert.equal(m('Cajas').estado, 'elegir');
  assert.ok(I.puntaje(I.prep('Caja pizza grande'), I.prep('Caja pizza chica')) < I.UMBRAL_SI);
});

test('fingerprints are stable', async () => {
  assert.equal(await I.huella('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('PDF and photo words become a table using the header columns', () => {
  const W = (t, x, y, w = 60) => ({t, x, y, w, h:12});
  const pal = [
    W('Remito', 10, 10), W('0001-123', 90, 10),
    W('Código', 10, 40), W('Descripción', 80, 40, 90), W('Cant.', 320, 40, 40), W('Precio', 400, 40),
    W('1023', 10, 70), W('Jamón', 80, 70), W('cocido', 140, 70), W('2', 330, 70, 10), W('15000', 400, 70),
    W('1024', 10, 100), W('Muzzarella', 80, 100, 80), W('3,5', 325, 101, 20), W('9000', 400, 100),
    W('Total', 300, 140), W('24000', 400, 140)
  ];
  const r = I.desdePalabras(pal, 'Foto');
  const filas = r.hojas[0].filas, col = I.columnas(filas);
  assert.equal(col.producto, 1); assert.equal(col.cantidad, 2);
  assert.deepEqual(I.renglonesTabla(filas, col).map(x => [x.nombre, x.cantidad]), [['Jamón cocido', 2], ['Muzzarella', 3.5]]);
  const sin = I.desdePalabras([W('Jamón', 10, 10), W('cocido', 70, 10), W('2', 140, 10, 10), W('Muzzarella:', 10, 40, 80), W('3', 100, 40, 10)], 'Foto');
  assert.deepEqual(I.renglonesTexto(sin.texto).map(x => [x.nombre, x.cantidad]), [['Jamón cocido', 2], ['Muzzarella', 3]]);
});
