// Alcance del cartel de actualización: una publicación de otra empresa no requiere recarga.
// Ante cambios compartidos o desconocidos se avisa a todos (conservador).
export const TENANTS = Object.freeze({
  miGusto: 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670',
  molino: '6c8717ea-5f78-426b-9458-74a5dcac6e4e',
  zayro: '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'
});

const NON_RUNTIME = /^(?:tests\/|docs\/|supabase\/|\.github\/|scripts\/|README|GESTLOK-GUIA)/i;
const UPDATE_INFRA = new Set(['public/stock/gestlok-pwa-update.js','scripts/version-cache.mjs','scripts/pwa-release-scope.mjs','scripts/sw-template.js']);
const SHARED_LOADERS = new Set(['components/stock-runtime.tsx', 'app/layout.tsx']);

export function fileAudience(path) {
  const p = String(path || '').replaceAll('\\', '/');
  if (NON_RUNTIME.test(p) || UPDATE_INFRA.has(p)) return [];
  if (/^(?:public\/stock\/(?:mi-gusto-|munro-|mg-|gestlok-mg-)|app\/(?:mi-gusto-|munro-)|public\/mi-gusto\/)/i.test(p)) return [TENANTS.miGusto];
  if (/^(?:public\/stock\/gestlok-molino|app\/(?:gestlok-molino|molino-)|public\/molino\/)/i.test(p)) return [TENANTS.molino];
  if (/^(?:public\/stock\/gestlok-(?:zayro|scanner|pilot|mis-productos|tiendanube|cami-|pedidos\.js|precios-stock\.js)|app\/(?:zayro\/|gestlok-(?:scanner|pilot|mis-productos|tiendanube|cami-))|public\/zayro\/)/i.test(p)) return [TENANTS.zayro];
  return ['*'];
}
const referenceAudience = text => {
  // Solo aceptar cambios en rutas/imports: jamás inferir alcance de código de aplicación arbitrario.
  const lines = String(text || '').split('\n')
    .filter(line => /^[+-](?![+-])/.test(line))
    .map(line => line.slice(1).trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const found = new Set();
  for (const line of lines) {
    // Un import a una sección específica o la versión de un script de esa sección.
    const matches = [...line.matchAll(/(?:\/stock\/|\.\/)([a-z0-9./_-]+(?:\.js|\.css))(?:\?[^'"\s]*)?|(?:\/app\/)([a-z0-9./_-]+\.css)/ig)];
    if (matches.length !== 1 || !/^(?:import\s|["']?\/stock\/|["']?\.\/|await load\(|if \(!visitor\) await load\(|"\/stock\/)/.test(line)) return ['*'];
    const part = matches[0][1] || matches[0][2] || '';
    const extension = part.endsWith('.css') ? 'app/' : 'public/stock/';
    const scoped = fileAudience(extension + part.replace(/^.*\//, ''));
    if (scoped.includes('*')) return ['*'];
    scoped.forEach(id => found.add(id));
  }
  return [...found];
};
export function releaseAudience(paths, patches = {}) {
  const audience = new Set();
  for (const path of paths || []) {
    const p = String(path || '');
    const targets = SHARED_LOADERS.has(p) ? referenceAudience(patches[p]) : fileAudience(p);
    for (const t of targets) {
      if (t === '*') return ['*'];
      audience.add(t);
    }
  }
  return [...audience].sort();
}
