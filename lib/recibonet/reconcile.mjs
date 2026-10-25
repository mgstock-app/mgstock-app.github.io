import { createHash } from 'node:crypto';

// Native ReciboNet backups: {tipo, version:1, ajustes, hojas:[{id,datos,historial}]}.
// Deliberately no Supabase client, writes, restore operation or inferred ID mapping.
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const idOK = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  if (value === undefined || typeof value === 'function' || (typeof value === 'number' && !Number.isFinite(value))) throw Error('Datos no compatibles con JSON.');
  return JSON.stringify(value);
}
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
function indexBackup(backup) {
  if (!object(backup) || typeof backup.tipo !== 'string' || !backup.tipo.trim() || backup.version !== 1 ||
      !object(backup.ajustes) || !Array.isArray(backup.hojas) || !backup.hojas.length) {
    throw Error('Copia de ReciboNet incompleta o versión no admitida.');
  }
  const records = new Map([['ajustes',hash(backup.ajustes)]]), branches = Object.create(null);
  let history = 0;
  for (const sheet of backup.hojas) {
    if (!object(sheet) || !idOK(sheet.id) || !object(sheet.datos) || typeof sheet.datos.nombreHoja !== 'string' ||
        !Array.isArray(sheet.historial)) throw Error('Hoja incompleta: no se descartan registros inválidos.');
    const key = 'hojas/' + sheet.id;
    if (records.has(key)) throw Error('Identificador de hoja duplicado.');
    records.set(key,hash(sheet.datos));
    // ReciboNet's original Torcuato identifier is dt; old sheets omit local.
    const branch = sheet.datos.local || 'dt';
    if (!idOK(branch)) throw Error('Identificador de local inválido.');
    branches[branch] = (Object.hasOwn(branches,branch) ? branches[branch] : 0) + 1;
    for (const entry of sheet.historial) {
      if (!object(entry) || !idOK(entry.id) || !object(entry.datos)) throw Error('Registro de historial incompleto.');
      const historyKey = key + '/historial/' + entry.id;
      if (records.has(historyKey)) throw Error('Identificador de historial duplicado.');
      records.set(historyKey,hash(entry.datos));history++;
    }
  }
  return {records,summary:{sheets:backup.hojas.length,history,branches:{...branches},
    digest:hash([...records].sort(([a],[b])=>a<b?-1:a>b?1:0))}};
}
export function reconcileReportBackups(source, candidate) {
  const before=indexBackup(source),after=indexBackup(candidate);
  if (source.tipo !== candidate.tipo) throw Error('Las copias corresponden a tipos distintos.');
  let missing=0,changed=0,added=0;
  for (const [key,value] of before.records) {
    if (!after.records.has(key)) missing++;
    else if (after.records.get(key)!==value) changed++;
  }
  for (const key of after.records.keys()) if (!before.records.has(key)) added++;
  return {
    scope:'reports-and-report-history-only',
    reportsMatch:missing===0 && changed===0 && added===0,
    source:before.summary,candidate:after.summary,
    differences:{missing,changed,added},
    // A matching report backup is never sufficient to retire the original app.
    readyToRetireReciboNet:false,
    remainingChecks:['schedules-and-comments','branch-sheet-links','organizations-and-memberships',
      'permissions-and-rls','private-images-and-delivery-history','cloud-backups-and-restore','auth-and-cross-company-isolation']
  };
}
