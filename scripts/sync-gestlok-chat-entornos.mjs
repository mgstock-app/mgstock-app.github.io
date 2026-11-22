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
for(const file of ['entornos/backend.mjs','entornos/entornos.json','vercel.json','scripts/vercel-ignore-entornos.mjs'])copy(file);

// Conservar el selector de sucursal de la demo DIVIDIDA. Es una personalización
// de Prueba/Testing exclusivamente bajo ?demo=1&showroom=1, sin tocar la app real.
// Si main incorpora nativamente esta funcionalidad, no se vuelve a inyectar.
function replaceUnique(code,before,after){
 if(code.split(before).length!==2)throw Error('La estructura de la demo cambió: revisar sincronización antes de publicar.');
 return code.replace(before,after);
}
function adaptDemo(){
 const cliente=join(dest,'public/chat/chat.js');
 if(existsSync(cliente)){
  let t=readFileSync(cliente,'utf8');
  if(!t.includes('const SHOWROOM_SUCURSAL')){
   const hook='let demoEstado = null; let demoPedido = null;';
   const addon=[
    '// Identidad exclusiva de la demo dividida; nunca alcanza una sesión real.',
    "const SHOWROOM_SUCURSAL = SHOWROOM && ({",
    "  'mi-gusto-munro': 'Munro',",
    "  'mi-gusto-torcuato': 'Don Torcuato',",
    "})[params.get('s')];",
    "if (SHOWROOM_SUCURSAL) {",
    "  DEMO_DATOS.sucursal.nombre = SHOWROOM_SUCURSAL;",
    "  DEMO_DATOS.sucursal.empresa = 'Mi Gusto · DEMOSTRACIÓN';",
    "  DEMO_DATOS.sucursal.slug = 'demo-' + params.get('s');",
    "}"
   ].join('\n');
   t=replaceUnique(t,hook,addon+'\n'+hook);
   writeFileSync(cliente,t);
  }
 }
 const panel=join(dest,'public/chat/panel/panel.js');
 if(existsSync(panel)){
  let t=readFileSync(panel,'utf8');
  if(!t.includes('const SHOWROOM_SUCURSAL')){
   const hook="  if (SHOWROOM) {\n    // Mostrar a futuros comercios un local completamente ficticio.";
   const addon=[
    "  const SHOWROOM_SUCURSAL = SHOWROOM && ({",
    "    'mi-gusto-munro': 'Munro',",
    "    'mi-gusto-torcuato': 'Don Torcuato',",
    "  })[new URLSearchParams(location.search).get('s')];"
   ].join('\n');
   t=replaceUnique(t,hook,addon+'\n'+hook);
   t=replaceUnique(t,"D.suc[0].nombre='Sucursal Centro';",
    "D.suc[0].nombre=SHOWROOM_SUCURSAL || 'Sucursal Centro';");
   t=replaceUnique(t,"nombre:'Sucursal Centro',empresa:'Comercio de demostración'",
    "nombre:D.suc[0].nombre,empresa:SHOWROOM_SUCURSAL ? 'Mi Gusto · DEMOSTRACIÓN' : 'Comercio de demostración'");
   t=replaceUnique(t,"case 'panel_inicio': return {habilitado: true, empresa: 'Comercio de demostración',",
    "case 'panel_inicio': return {habilitado: true, empresa: SHOWROOM_SUCURSAL ? 'Mi Gusto · DEMOSTRACIÓN' : 'Comercio de demostración',");
   t=replaceUnique(t,"sucursales: SHOWROOM ? [{...D.suc[0],nombre:'Sucursal Centro',local_id:'demo'}]",
    "sucursales: SHOWROOM ? [{...D.suc[0],local_id:'demo'}]");
   writeFileSync(panel,t);
  }
 }
}
adaptDemo();

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
