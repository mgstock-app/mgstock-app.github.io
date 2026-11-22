// Sincroniza SOLO GESTLOK Chat desde main hacia una rama de pruebas.
// No ejecuta SQL ni toca producción. Preserva el constructor y los datos demo del entorno.
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';

const [sourceArg,destArg,entorno]=process.argv.slice(2);
if(!sourceArg||!destArg||!['prueba','testing'].includes(entorno))
 throw Error('Uso: node scripts/sync-gestlok-chat-entornos.mjs MAIN WORKTREE prueba|testing');
const source=resolve(sourceArg),dest=resolve(destArg);
if(source===dest||!existsSync(join(dest,'.git')))throw Error('El destino debe ser otra rama Git existente.');
const cfg=JSON.parse(readFileSync(join(source,'entornos/entornos.json'),'utf8'));
if(!cfg.pruebas?.ref||!cfg.real?.ref||cfg.pruebas.ref===cfg.real.ref)
 throw Error('No se puede sincronizar sin una base de pruebas aislada.');
if(!String(cfg.entornos?.[entorno]?.sitio||'').startsWith('https://'))
 throw Error('Sitio de pruebas no configurado: '+entorno);

function copy(relative,{replace=false}={}){
 const from=join(source,relative),to=join(dest,relative);
 if(!existsSync(from))throw Error('Falta origen obligatorio: '+relative);
 mkdirSync(dirname(to),{recursive:true});
 if(replace)rmSync(to,{recursive:true,force:true});
 cpSync(from,to,{recursive:true,force:true});
}
// Sincronización exacta de los archivos públicos del chat y sus funciones.
// Los recursos compartidos se actualizan sin borrar imágenes adicionales de los demos.
for(const dir of ['public/chat','supabase/functions/gestlok-chat','supabase/functions/gestlok-chat-push'])
 copy(dir,{replace:true});
for(const dir of ['public/icons','public/img','public/vendor'])copy(dir);
for(const file of ['entornos/backend.mjs','entornos/entornos.json'])copy(file);

// La rama de pruebas conserva su propio entornos/construir.mjs y el catálogo ficticio.
// Migraciones Chat nuevas se agregan automáticamente en orden al manifiesto, nunca las
// migraciones generales de GESTLOK ni SQL de producción ajeno a este módulo.
const migrations=readdirSync(join(source,'supabase/migrations'))
 .filter(name=>/^\d{14}_gestlok_chat_.*\.sql$/.test(name)&&name>='20261119210000')
 .sort().map(name=>'supabase/migrations/'+name);
for(const file of migrations)copy(file);
const manifestFile='entornos/sql.txt';
const old=readFileSync(join(dest,manifestFile),'utf8').split(/\r?\n/).map(s=>s.trim());
const lines=readFileSync(join(source,manifestFile),'utf8').trimEnd().split(/\r?\n/);
const present=new Set(lines.map(s=>s.trim()));
const extra=migrations.filter(path=>!present.has(path));
const position=lines.findIndex(line=>line.trim()==='entornos/sql/semilla.sql');
if(position<0)throw Error('Falta la semilla controlada en entornos/sql.txt.');
lines.splice(position,0,...extra);
for(const addon of ['entornos/sql/catalogo-demo.sql']){
 if(old.includes(addon)&&existsSync(join(dest,addon))&&!lines.includes(addon))lines.push(addon);
}
writeFileSync(join(dest,manifestFile),lines.join('\n')+'\n');
console.log('GESTLOK Chat actualizado en '+entorno+': cliente, panel, assets, funciones y '+migrations.length+' migraciones; base real intacta.');
