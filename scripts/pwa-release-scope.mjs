// Alcance del cartel de actualización: una publicación de otra empresa no requiere recarga.
// Solo cambios compartidos verificados avisan a todos; cambios desconocidos se revisan sin inventar alertas.
export const TENANTS = Object.freeze({
  miGusto: 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670',
  molino: '6c8717ea-5f78-426b-9458-74a5dcac6e4e',
  zayro: '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'
});

export const LOCAL_AUDIENCE = Object.freeze({munro: TENANTS.miGusto + ':munro'});

const NON_RUNTIME = /^(?:tests\/|docs\/|supabase\/|\.github\/|scripts\/|README|GESTLOK-GUIA)/i;
const UPDATE_INFRA = new Set(['public/stock/gestlok-pwa-update.js','scripts/version-cache.mjs','scripts/pwa-release-scope.mjs','scripts/sw-template.js']);
const SHARED_LOADERS = new Set(['components/stock-runtime.tsx', 'app/layout.tsx']);

export function fileAudience(path) {
  const p = String(path || '').replaceAll('\\', '/');
  // Cambios reales del worker (caché, offline y seguridad) requieren aviso general.
  if (p === 'scripts/sw-template.js') return ['*'];
  if (NON_RUNTIME.test(p) || UPDATE_INFRA.has(p)) return [];
  // Conteo y demás pantallas exclusivas de Munro no cambian Torcuato.
  if (/^(?:public\/stock\/(?:mi-gusto-conteo\.js|munro-|gestlok-munro-)|app\/(?:mi-gusto-conteo\.css|munro-))/i.test(p)) {
    return [LOCAL_AUDIENCE.munro];
  }
  // El resto de módulos Mi Gusto sí pueden usarse en ambas sucursales.
  if (/^(?:public\/stock\/(?:mi-gusto-|mg-|gestlok-mg-)|app\/mi-gusto-|public\/mi-gusto\/)/i.test(p)) return [TENANTS.miGusto];
  if (/^(?:public\/stock\/gestlok-molino|app\/(?:gestlok-molino|molino-)|public\/molino\/)/i.test(p)) return [TENANTS.molino];
  if (/^(?:public\/stock\/gestlok-(?:zayro|scanner|pilot|mis-productos|product-white-bg|tiendanube|cami-|pedidos\.js|precios-stock\.js)|app\/(?:zayro\/|gestlok-(?:scanner|pilot|mis-productos|tiendanube|cami-))|public\/zayro\/)/i.test(p)) return [TENANTS.zayro];
  return ['*'];
}
// Un loader puede declarar varios archivos en una línea. No atribuirle a toda
// GESTLOK un módulo compartido si ese módulo NO se modificó en el diff.
const RESOURCE = /(?:\/(?:stock|vendor|app)\/|\.\/)[a-z0-9./_-]+\.(?:js|css)(?:\?[^'"\s,)]*)?/gi;
const refs = line => [...line.matchAll(RESOURCE)].map(x => x[0]);
const normalize = line => line.trim().replace(RESOURCE,'__ASSET__');
function subtract(left,right) {
  const counts=new Map();
  for(const x of right)counts.set(x,(counts.get(x)||0)+1);
  const leftOnly=[];
  for(const x of left) {
    const n=counts.get(x)||0;
    if(n)counts.set(x,n-1);
    else leftOnly.push(x);
  }
  return leftOnly;
}
function assetAudience(asset) {
  const path=String(asset).split('?')[0];
  if(path.startsWith('/stock/'))return fileAudience('public'+path);
  if(path.startsWith('/app/'))return fileAudience(path.slice(1));
  if(path.startsWith('./'))return fileAudience('app/'+path.slice(2));
  return ['*'];
}
function simpleLoader(line) {
  const s=line.trim();
  return /^(?:if\s*\([^;]+\)\s*)?await\s+load\(\s*['"][^'"]+['"]\s*\)\s*;?\s*$/.test(s)
    || /^import\s+['"][^'"]+['"]\s*;?\s*$/.test(s);
}
const referenceAudience = patch => {
  // Líneas añadidas y quitadas, sin encabezados +++/--- del formato git.
  const changes=String(patch||'').split('\n')
    .filter(x => /^[+-](?![+-])/.test(x))
    .map(x => ({sign:x[0],text:x.slice(1).trim()}))
    .filter(x => x.text);
  if(!changes.length)return ['*'];
  const old=changes.filter(x=>x.sign==='-').map(x=>x.text);
  const fresh=changes.filter(x=>x.sign==='+').map(x=>x.text);
  const oldShapes=old.map(normalize),newShapes=fresh.map(normalize);
  const removedShapes=subtract(oldShapes,newShapes),addedShapes=subtract(newShapes,oldShapes);
  // Permitir una línea suelta solo cuando es un import o loader evidente.
  // Si cambia la lógica compartida, no inferir el alcance a partir de nombres.
  if([...old.filter(x=>removedShapes.includes(normalize(x))),
       ...fresh.filter(x=>addedShapes.includes(normalize(x)))]
       .some(x=>!simpleLoader(x)))return ['*'];
  // Restar literalmente los assets intactos, aunque compartan la misma línea.
  const changed=[
    ...subtract(old.flatMap(refs),fresh.flatMap(refs)),
    ...subtract(fresh.flatMap(refs),old.flatMap(refs))
  ];
  if(!changed.length)return [];
  const audience=new Set();
  for(const asset of changed){
    const scoped=assetAudience(asset);
    if(scoped.includes('*'))return ['*'];
    scoped.forEach(x=>audience.add(x));
  }
  return [...audience].sort();
};
// Detectar solo el movimiento de Staff de Munro; cualquier otro cambio en app.js sigue siendo compartido.
function isOnlyMunroStaffNavMove(patch) {
  const changes=String(patch||'').split('\n')
    .filter(x=>/^[+-](?![+-])/.test(x)).map(x=>({sign:x[0],line:x.slice(1)}));
  if(changes.length!==6)return false;
  const removed=changes.filter(x=>x.sign==='-').map(x=>x.line);
  const added=changes.filter(x=>x.sign==='+').map(x=>x.line);
  if(removed.length!==3||added.length!==3)return false;
  if(!removed.includes('  const staffMunro = puedeVerStaffMunro();'))return false;
  const oldTop=removed.find(x=>x.startsWith('  const html = `'));
  const newTop=added.find(x=>x.startsWith('  const html = `'));
  if(!oldTop||!newTop)return false;
  const left=oldTop.indexOf('${staffMunro ? ');
  const right=oldTop.indexOf('${pagosDiarios ? ');
  if(left<0||right<=left)return false;
  const staff=oldTop.slice(left,right);
  if(!staff.includes('data-act="staff-horarios"')||!staff.includes('<span class="nl">Staff</span>')||staff.length>380)return false;
  if(oldTop.slice(0,left)+oldTop.slice(right)!==newTop)return false;
  const nested=added.find(x=>x.startsWith('    (puedeVerStaffMunro() ? '));
  if(!nested||!nested.includes('data-act="staff-horarios"')||!nested.includes('<span class="nl">Staff</span>')||!nested.endsWith(" : '') +"))return false;
  const oldGuard=removed.find(x=>x.trim().startsWith('if (!puedeVerMotos() && '));
  const newGuard=added.find(x=>x.trim().startsWith('if (!puedeVerMotos() && '));
  return !!oldGuard && !!newGuard
    && oldGuard.replace('!puedeVerMotos() && ','!puedeVerMotos() && !puedeVerStaffMunro() && ')===newGuard;
}
export function releaseAudience(paths, patches = {}) {
  const audience = new Set();
  for (const path of paths || []) {
    const p = String(path || '');
    const targets = p === 'public/stock/app.js' ?
      (isOnlyMunroStaffNavMove(patches[p]) ? [LOCAL_AUDIENCE.munro] : ['*']) :
      (SHARED_LOADERS.has(p) ? referenceAudience(patches[p]) : fileAudience(p));
    for (const t of targets) {
      if (t === '*') return ['*'];
      audience.add(t);
    }
  }
  return [...audience].sort();
}
