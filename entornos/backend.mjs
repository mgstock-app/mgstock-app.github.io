// GESTLOK · prepara la parte del servidor de un entorno en la BASE DE PRUEBAS (GitHub Actions).
//   node entornos/backend.mjs --entorno prueba|testing [--sql] [--funciones] [--ajustes] [--carta]
// Necesita SUPABASE_ACCESS_TOKEN. Solo escribe en la base de pruebas: si el destino fuera la base real, se detiene.
// La base real solo se LEE para copiar la carta (categorías, productos y textos del local; nunca clientes ni pedidos).
import {cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(raiz, 'entornos/entornos.json'), 'utf8'));
const args = process.argv.slice(2);
const entorno = args[args.indexOf('--entorno') + 1];
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRUEBAS = cfg.pruebas.ref;
const REAL = cfg.real.ref;
if (!cfg.entornos[entorno]) throw new Error('Entorno inválido: ' + entorno);
if (!TOKEN) throw new Error('Falta el secreto SUPABASE_ACCESS_TOKEN en GitHub.');
if (PRUEBAS === REAL) throw new Error('La base de pruebas no puede ser la base real.');

async function api(ruta, opciones = {}) {
  const r = await fetch('https://api.supabase.com/v1' + ruta, {...opciones,
    headers: {authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json', ...(opciones.headers || {})}});
  const t = await r.text();
  if (!r.ok) throw new Error(ruta + ' → ' + r.status + ' ' + t.slice(0, 800));
  return t ? JSON.parse(t) : null;
}
/** SQL en la base de pruebas (escritura permitida). */
const enPruebas = query => api('/projects/' + PRUEBAS + '/database/query', {method: 'POST', body: JSON.stringify({query})});
/** Lectura de la base real: una sola consulta SELECT (sin «;»), nada más. */
const leerReal = select => {
  if (!/^\s*select\b/i.test(select) || select.includes(';')) throw new Error('Solo lectura de la base real.');
  return api('/projects/' + REAL + '/database/query', {method: 'POST', body: JSON.stringify({query: select})});
};
const pruebasUrl = 'https://' + PRUEBAS + '.supabase.co';
/** Todo lo que apunte a la base real pasa a la de pruebas (los avisos automáticos usan la función de «prueba»). */
const aPruebas = (t, ent) => t.split('https://' + REAL + '.supabase.co').join(pruebasUrl).split(REAL).join(PRUEBAS)
  .replace(/\/functions\/v1\/(gestlok-chat(?:-push)?)(?![\w-])/g, '/functions/v1/$1-' + ent);
const literal = t => { const tag = '$j' + Math.random().toString(36).slice(2, 8) + '$'; return tag + t + tag; };

async function aplicarSql() {
  await enPruebas('create schema if not exists entorno_control; create table if not exists entorno_control.sql_aplicado' +
    ' (archivo text primary key, aplicado_at timestamptz not null default now()); revoke all on schema entorno_control from anon, authenticated;');
  const hechos = new Set((await enPruebas('select archivo from entorno_control.sql_aplicado')).map(f => f.archivo));
  const lista = readFileSync(join(raiz, 'entornos/sql.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  for (const archivo of lista) {
    if (hechos.has(archivo)) continue;
    // Sin BEGIN/COMMIT propios: cada archivo se aplica entero o no se aplica.
    const sql = aPruebas(readFileSync(join(raiz, archivo), 'utf8'), 'prueba').replace(/^\s*(begin|commit)\s*;\s*$/gim, '');
    console.log('SQL → ' + archivo);
    await enPruebas(sql + '\n;\ninsert into entorno_control.sql_aplicado (archivo) values (' + literal(archivo) + ');');
  }
}

function desplegarFunciones() {
  const tmp = mkdtempSync(join(tmpdir(), 'gestlok-entorno-'));
  mkdirSync(join(tmp, 'supabase/functions'), {recursive: true});
  writeFileSync(join(tmp, 'supabase/config.toml'), 'project_id = "' + PRUEBAS + '"\n');
  for (const f of cfg.funciones) {
    const nombre = f.nombre + '-' + entorno;
    const destino = join(tmp, 'supabase/functions', nombre);
    cpSync(join(raiz, 'supabase/functions', f.nombre), destino, {recursive: true});
    for (const a of readdirSync(destino)) {
      if (/\.(ts|js|mjs|json)$/.test(a)) writeFileSync(join(destino, a), aPruebas(readFileSync(join(destino, a), 'utf8'), entorno));
    }
    console.log('Función → ' + nombre);
    execFileSync('npx', ['--yes', 'supabase@2', 'functions', 'deploy', nombre, '--project-ref', PRUEBAS, '--use-api',
      ...(f.verify_jwt ? [] : ['--no-verify-jwt'])], {cwd: tmp, stdio: 'inherit', env: process.env});
  }
}

async function ajustes() {
  const sitios = Object.values(cfg.entornos).map(e => e.sitio);
  await api('/projects/' + PRUEBAS + '/secrets', {method: 'POST', body: JSON.stringify([
    {name: 'GESTLOK_CHAT_ORIGINS', value: sitios.join(',')}])});
  await api('/projects/' + PRUEBAS + '/config/auth', {method: 'PATCH', body: JSON.stringify({
    site_url: cfg.entornos.prueba.sitio + '/ingresar/', uri_allow_list: sitios.map(s => s + '/**').join(',')})});
  console.log('Ajustes → orígenes permitidos y acceso: ' + sitios.join(', '));
}

// Datos del local que NO se copian (contacto, cobros, claves, avisos e IA).
const NO_COPIAR = /^(id|tenant_id|slug|local_id|prefijo|nombre|activa|ultimo_numero|version|actualizada_at|actualizada_por)$|whatsapp|telefono|token|secret|clave|vapid|push|^ia_|resena|mail|cbu|alias|cuit/i;
async function copiarCarta() {
  for (const slug of cfg.sucursales_prueba) {
    const [real] = await leerReal(`select to_jsonb(s) suc,
      (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from gestlok_chat_private.categorias c where c.sucursal_id = s.id) cats,
      (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from gestlok_chat_private.productos p where p.sucursal_id = s.id) prods
      from gestlok_chat_private.sucursales s where s.slug = '${slug.replace(/[^a-z0-9-]/g, '')}'`);
    const [prueba] = await enPruebas(`select id, tenant_id from gestlok_chat_private.sucursales where slug = '${slug.replace(/[^a-z0-9-]/g, '')}'`);
    if (!real || !prueba) { console.log('Carta → ' + slug + ': no está en una de las dos bases, se omite.'); continue; }
    const suc = Object.fromEntries(Object.entries(real.suc).filter(([k]) => !NO_COPIAR.test(k)));
    const cols = Object.keys(suc).map(k => '"' + k.replace(/"/g, '') + '"').join(', ');
    const fijar = o => ({...o, tenant_id: prueba.tenant_id, sucursal_id: prueba.id});
    await enPruebas(`
      update gestlok_chat_private.sucursales s set (${cols}) = (select ${Object.keys(suc).map(k => 'r."' + k.replace(/"/g, '') + '"').join(', ')}
        from jsonb_populate_record(s, ${literal(JSON.stringify(suc))}::jsonb) r) where s.id = '${prueba.id}';
      delete from gestlok_chat_private.productos where sucursal_id = '${prueba.id}';
      delete from gestlok_chat_private.categorias where sucursal_id = '${prueba.id}';
      insert into gestlok_chat_private.categorias select * from jsonb_populate_recordset(null::gestlok_chat_private.categorias,
        ${literal(JSON.stringify(real.cats.map(fijar)))}::jsonb);
      insert into gestlok_chat_private.productos select * from jsonb_populate_recordset(null::gestlok_chat_private.productos,
        ${literal(JSON.stringify(real.prods.map(fijar)))}::jsonb);`);
    console.log('Carta → ' + slug + ': ' + real.cats.length + ' categorías y ' + real.prods.length + ' productos.');
  }
}

if (args.includes('--sql')) await aplicarSql();
if (args.includes('--carta')) await copiarCarta();
if (args.includes('--funciones')) desplegarFunciones();
if (args.includes('--ajustes')) await ajustes();
console.log('Entorno «' + entorno + '» listo en la base de pruebas ' + PRUEBAS + '.');
