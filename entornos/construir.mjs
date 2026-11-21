// GESTLOK · construye el sitio de un entorno (prueba o testing) para Cloudflare Pages. Sin dependencias.
//   Cloudflare: comando «node entornos/construir.mjs», carpeta de salida «dist-entorno».
//   Local: ENTORNO=prueba node entornos/construir.mjs
// Toma las micro apps de public/ tal cual están en la rama y las apunta a la BASE DE PRUEBAS
// (nunca a la real). Si quedara una referencia a la base real, la construcción falla.
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(raiz, 'entornos/entornos.json'), 'utf8'));
const nombre = process.env.ENTORNO || process.env.CF_PAGES_BRANCH || '';
const ent = cfg.entornos[nombre];
const salida = resolve(raiz, process.argv[2] || 'dist-entorno');
const URL_REAL = 'https://' + cfg.real.ref + '.supabase.co';
const URL_PRUEBAS = 'https://' + cfg.pruebas.ref + '.supabase.co';
const ACCIONES = 'https://github.com/' + cfg.repo + '/actions/workflows/entornos.yml';

// Micro apps que existen en los entornos (se suman acá cuando se agregan otras).
const MICROAPPS = [{
  nombre: 'GESTLOK Chat', carpetas: ['chat'],
  enlaces: [['Chat de clientes · Munro', '/chat/?s=mi-gusto-munro'], ['Chat de clientes · Torcuato', '/chat/?s=mi-gusto-torcuato'],
    ['Panel del local (gerente y dueño)', '/chat/panel/']],
}];
const COMPARTIDAS = ['vendor', 'icons', 'img'];

const esc = t => String(t).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
function pagina(titulo, cuerpo, extra = '') {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow"><title>' + esc(titulo) + '</title><style>' +
    'body{font-family:system-ui,sans-serif;margin:0;background:#f6f7f9;color:#16202c}main{max-width:560px;margin:0 auto;padding:56px 18px 32px}' +
    'h1{font-size:1.4rem;margin:.2em 0}h2{font-size:1.05rem;margin:1.4em 0 .5em}a.b,button{display:block;width:100%;box-sizing:border-box;text-align:left;' +
    'padding:13px 14px;margin:8px 0;border:1px solid #d5dbe3;border-radius:10px;background:#fff;color:#16202c;text-decoration:none;font:inherit;cursor:pointer}' +
    'button.p{background:#16202c;color:#fff;text-align:center}input{width:100%;box-sizing:border-box;padding:12px;margin:6px 0;border:1px solid #c9d1db;border-radius:10px;font:inherit}' +
    '.nota{color:#5b6775;font-size:.9rem}</style>' + extra + '<script src="/entorno.js" defer></script></head><body><main>' + cuerpo + '</main></body></html>';
}

rmSync(salida, {recursive: true, force: true});
mkdirSync(salida, {recursive: true});
if (!ent) {
  // Otras ramas (main, cambios en curso): no se publica nada que pueda confundirse con GESTLOK.
  writeFileSync(join(salida, 'index.html'), pagina('Sin entorno', '<h1>Esta rama no es un entorno</h1>' +
    '<p class="nota">Solo las ramas «prueba» y «testing» se publican en estos sitios.</p>').replace('<script src="/entorno.js" defer></script>', ''));
  console.log('Rama «' + nombre + '» sin entorno: página vacía.');
  process.exit(0);
}

const realKey = (readFileSync(join(raiz, 'public/chat/config.js'), 'utf8').match(/key:\s*'([^']+)'/) || [])[1];
function adaptar(texto, ruta) {
  let t = texto;
  if (realKey) t = t.split(realKey).join(cfg.pruebas.anon);
  t = t.split(URL_REAL).join(URL_PRUEBAS);
  // Cada entorno usa sus propias funciones en la base de pruebas: gestlok-chat-prueba, gestlok-chat-testing…
  t = t.replace(/\/functions\/v1\/(gestlok-chat(?:-push)?)(?![\w-])/g, '/functions/v1/$1-' + nombre);
  if (/\.html?$/.test(ruta)) {
    t = t.replace(/<head([^>]*)>/i, '<head$1><meta name="robots" content="noindex,nofollow"><script src="/entorno.js" defer></script>');
  }
  return t;
}
const TEXTO = new Set(['.js', '.mjs', '.html', '.css', '.json', '.webmanifest']);
function copiar(origen, destino) {
  if (!existsSync(origen)) return;
  if (statSync(origen).isDirectory()) {
    mkdirSync(destino, {recursive: true});
    for (const n of readdirSync(origen)) copiar(join(origen, n), join(destino, n));
  } else if (TEXTO.has(extname(origen))) {
    writeFileSync(destino, adaptar(readFileSync(origen, 'utf8'), origen));
  } else cpSync(origen, destino);
}
for (const app of MICROAPPS) for (const c of app.carpetas) copiar(join(raiz, 'public', c), join(salida, c));
for (const c of COMPARTIDAS) copiar(join(raiz, 'public', c), join(salida, c));

// Conexión de las micro apps: base de pruebas y función del entorno.
writeFileSync(join(salida, 'chat/config.js'), '/* ' + ent.nombre + ': base de pruebas (no es la base real). */\n' +
  'window.GESTLOK_CHAT_CONFIG = ' + JSON.stringify({url: URL_PRUEBAS, funcion: URL_PRUEBAS + '/functions/v1/gestlok-chat-' + nombre,
    key: cfg.pruebas.anon, entorno: nombre}, null, 2) + ';\n');

// Aviso fijo en todas las pantallas y botón para pasar a la etapa siguiente.
writeFileSync(join(salida, 'entorno.js'), `(function(){
  if (document.getElementById('gestlok-entorno')) return;
  var b = document.createElement('div'); b.id = 'gestlok-entorno';
  b.setAttribute('style','position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;gap:8px;align-items:center;' +
    'background:${ent.color};color:#fff;font:600 12px/1.2 system-ui,sans-serif;padding:6px 10px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap');
  var t = document.createElement('span'); t.textContent = ${JSON.stringify(ent.nombre.toUpperCase() + ' · base de pruebas')};
  var a = document.createElement('a'); a.href = ${JSON.stringify(ACCIONES)}; a.target = '_blank'; a.rel = 'noopener';
  a.textContent = ${JSON.stringify(ent.boton)};
  a.setAttribute('style','color:${ent.color};background:#fff;border-radius:999px;padding:3px 8px;text-decoration:none');
  b.append(t, a); (document.body || document.documentElement).append(b);
})();
`);

const lista = MICROAPPS.map(m => '<h2>' + esc(m.nombre) + '</h2>' + m.enlaces.map(([n, h]) => '<a class="b" href="' + esc(h) + '">' + esc(n) + '</a>').join('')).join('');
writeFileSync(join(salida, 'index.html'), pagina(ent.nombre, '<h1>' + esc(ent.nombre) + '</h1>' +
  '<p class="nota">Entorno aislado de GESTLOK Chat con base de pruebas. Los demás módulos de GESTLOK aún no se publican aquí. Nada de lo que hagas acá llega a dueños, gerentes ni clientes reales.</p>' +
  '<a class="b" href="/ingresar/">Ingresar (cuenta de prueba)</a>' + lista +
  '<h2>Etapas</h2><p class="nota">Prueba → Testing → gestlok.com.ar. Con el botón «' + esc(ent.boton) + '» se abre la acción en GitHub: tocá «Run workflow» y elegí la acción.</p>'));

mkdirSync(join(salida, 'ingresar'), {recursive: true});
writeFileSync(join(salida, 'ingresar/index.html'), pagina('Ingresar · ' + ent.nombre,
  '<h1>Ingresar</h1><p class="nota">Usuario de la base de pruebas (no es tu clave de gestlok.com.ar).</p>' +
  '<form id="f"><input id="e" type="email" autocomplete="email" placeholder="Email" required>' +
  '<input id="c" type="password" autocomplete="current-password" placeholder="Contraseña (mínimo 8)" minlength="8" required>' +
  '<button class="p" type="submit">Entrar</button><button type="button" id="n">Crear usuario de prueba</button></form><p id="m" class="nota" role="status"></p>' +
  '<script>(function(){var C=window.GESTLOK_CHAT_CONFIG,sb=window.supabase.createClient(C.url,C.key,{auth:{persistSession:true}}),m=document.getElementById("m");' +
  'function d(){return{email:document.getElementById("e").value.trim(),password:document.getElementById("c").value}}' +
  'document.getElementById("f").onsubmit=async function(ev){ev.preventDefault();m.textContent="Entrando…";var r=await sb.auth.signInWithPassword(d());' +
  'if(r.error){m.textContent="No se pudo entrar: "+r.error.message;return}location.href="/chat/panel/"};' +
  'document.getElementById("n").onclick=async function(){var x=d();if(!x.email||x.password.length<8){m.textContent="Completá email y una contraseña de 8 o más.";return}' +
  'var r=await sb.auth.signUp(x);m.textContent=r.error?"No se pudo crear: "+r.error.message:"Listo. Confirmá el email que te llegó y después tocá Entrar."}})();</script>',
  '<script src="/vendor/supabase.js"></script><script src="/chat/config.js"></script>'));

writeFileSync(join(salida, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  X-Frame-Options: SAMEORIGIN\n');
writeFileSync(join(salida, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

// Control: ninguna referencia a la base real.
const restos = [];
(function revisar(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) revisar(p);
    else if (TEXTO.has(extname(p)) && readFileSync(p, 'utf8').includes(cfg.real.ref)) restos.push(p);
  }
})(salida);
if (restos.length) { console.error('Quedaron referencias a la base real en: ' + restos.join(', ')); process.exit(1); }
console.log('Entorno «' + nombre + '» listo en ' + salida + ' (base de pruebas ' + cfg.pruebas.ref + ').');
