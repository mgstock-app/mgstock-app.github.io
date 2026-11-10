import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { releaseAudience } from './pwa-release-scope.mjs';
import { createHash } from 'node:crypto';

// Every production build gets a new cache. GitHub run IDs make deployment
// versions traceable; local builds use a timestamp. No other app's caches match.
const version = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
  : new Date().toISOString().replace(/[^0-9]/g, '');
const digest = createHash('sha256').update(version).digest('hex').slice(0, 16);
const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
// Cada despliegue declara qué empresas tienen cambios visibles. Por seguridad,
// archivos compartidos o un diff indeterminado implican aviso global.
let audience = ['*'];
try {
  let previous = 'HEAD^';
  if (process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (/^[a-f0-9]{40}$/.test(String(event.before || '')) && !/^0{40}$/.test(event.before)) previous = event.before;
  }
  const diff = (args) => execFileSync('git', ['diff', ...args, previous, 'HEAD'], {encoding:'utf8', maxBuffer:3_000_000});
  const paths = diff(['--name-only']).trim().split('\n').filter(Boolean);
  const patches = {};
  for (const path of paths) {
    if (path === 'components/stock-runtime.tsx' || path === 'app/layout.tsx' || path === 'public/stock/app.js') {
      patches[path] = execFileSync('git', ['diff', '--unified=0', previous, 'HEAD', '--', path], {encoding:'utf8', maxBuffer:500_000});
    }
  }
  audience = releaseAudience(paths, patches);
} catch (error) {
  console.warn('Alcance PWA no disponible; avisos globales por precaución:', error?.message || error);
}
const SCOPE_MARK = '/*__UPDATE_AUDIENCE__*/["*"]';
if (!template.includes(SCOPE_MARK)) throw new Error('Marcador de alcance PWA ausente');
writeFileSync(new URL('../public/sw.js', import.meta.url), template
  .replace('__BUILD_VERSION__', digest)
  .replace(SCOPE_MARK, JSON.stringify(audience)));
console.log(`mgstock cache: ${digest}; aviso a: ${JSON.stringify(audience)}`);
