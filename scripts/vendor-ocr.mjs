// Descarga (desde npm, con verificación de integridad de npm) las librerías gratuitas para leer PDF y fotos
// y las copia a public/vendor. Corre en GitHub Actions antes de construir. Versiones fijas.
//   pdf.js (Mozilla, Apache-2.0) · Tesseract.js + núcleo + idioma español (Apache-2.0)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, copyFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

const PKGS = ['pdfjs-dist@4.10.38', 'tesseract.js@5.1.1', 'tesseract.js-core@5.1.1', '@tesseract.js-data/spa@1.0.0'];
const root = new URL('..', import.meta.url).pathname, out = join(root, 'public', 'vendor');
const tmp = mkdtempSync(join(tmpdir(), 'mgs-ocr-'));
const dirs = {};
for (const p of PKGS){
  const tgz = execFileSync('npm', ['pack', p, '--silent', '--pack-destination', tmp], { encoding: 'utf8' }).trim().split('\n').pop();
  const d = join(tmp, basename(tgz, '.tgz')); mkdirSync(d);
  execFileSync('tar', ['-xzf', join(tmp, tgz), '-C', d]);
  dirs[p] = join(d, 'package');
}
const walk = d => readdirSync(d).flatMap(f => { const x = join(d, f); return statSync(x).isDirectory() ? walk(x) : [x]; });
const put = (src, dest) => { mkdirSync(join(out, dest), { recursive: true }); copyFileSync(src, join(out, dest, basename(src))); console.log('vendor:', dest + '/' + basename(src)); };
const need = (f) => { if (!existsSync(f)) throw new Error('Falta ' + f); return f; };

const pdf = dirs['pdfjs-dist@4.10.38'];
put(need(join(pdf, 'legacy/build/pdf.min.mjs')), 'pdfjs'); put(need(join(pdf, 'legacy/build/pdf.worker.min.mjs')), 'pdfjs'); put(need(join(pdf, 'LICENSE')), 'pdfjs');
const tj = dirs['tesseract.js@5.1.1'];
put(need(join(tj, 'dist/tesseract.min.js')), 'ocr'); put(need(join(tj, 'dist/worker.min.js')), 'ocr'); put(need(join(tj, 'LICENSE.md')), 'ocr');
const core = walk(dirs['tesseract.js-core@5.1.1']).filter(f => /tesseract-core.*\.(wasm\.js|wasm)$/.test(basename(f)) && /lstm/.test(basename(f)));
if (!core.length) throw new Error('Sin núcleo de Tesseract');
for (const f of core) put(f, 'ocr');
const spa = walk(dirs['@tesseract.js-data/spa@1.0.0']).filter(f => basename(f) === 'spa.traineddata.gz').sort((a, b) => (/best_int/.test(b) ? 1 : 0) - (/best_int/.test(a) ? 1 : 0))[0];
if (!spa) throw new Error('Sin idioma español');
put(spa, 'ocr');
writeFileSync(join(out, 'ocr', 'VERSIONES.txt'), PKGS.join('\n') + '\n');
console.log('Listo: lectores de PDF y fotos en public/vendor');
