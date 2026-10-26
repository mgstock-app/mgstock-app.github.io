// Después de copiar el módulo de Empleados a out/empleados, lista sus páginas y recursos
// dentro de out/sw.js para que el service worker los guarde y se puedan abrir sin conexión.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const out = process.argv[2] || 'out';
const root = join(out, 'empleados');
const swPath = join(out, 'sw.js');
const MARK = '/*__EMPLEADOS_PRECACHE__*/[]';
const OK = /\.(html|txt|js|css|json|woff2?|svg|png|ico|webmanifest)$/i;
const MAX = 1_500_000;

if (!existsSync(swPath)) throw new Error(`No existe ${swPath}`);
const sw = readFileSync(swPath, 'utf8');
if (!sw.includes(MARK)) throw new Error('El service worker no tiene el marcador de Empleados');

const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name), info = statSync(full);
    if (info.isDirectory()) walk(full);
    else if (OK.test(name) && info.size <= MAX) files.push(full);
  }
}
if (existsSync(root)) walk(root);
const paths = new Set();
for (const f of files) {
  const rel = '/' + relative(out, f).split(sep).join('/');
  // GitHub Pages sirve /carpeta/ con su index.html: se guarda la dirección que usa el navegador.
  paths.add(rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel);
}
const list = [...paths].sort();
writeFileSync(swPath, sw.replace(MARK, JSON.stringify(list)));
console.log(`Empleados sin conexión: ${list.length} archivos en el service worker`);
