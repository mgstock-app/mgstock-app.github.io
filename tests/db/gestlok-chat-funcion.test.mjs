// GESTLOK Chat · función segura de punta a punta: función (index.ts) + motor + base, sobre PostgreSQL local.
//   CHAT_PG_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node --test tests/db/gestlok-chat-funcion.test.mjs
// (con Node 22 agregar --experimental-strip-types)
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {register} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const URL_BASE = process.env.CHAT_PG_URL;
const root = fileURLToPath(new URL('../../', import.meta.url));
const DB = 'gestlok_chat_fn_' + process.pid;
const skip = !URL_BASE && 'Definí CHAT_PG_URL para correr las pruebas sobre PostgreSQL';
const urlFor = db => { const u = new URL(URL_BASE); u.pathname = '/' + db; return u.toString(); };
const psql = (db, args, input) => spawnSync('psql', [urlFor(db), '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {cwd: root, encoding: 'utf8', input});
const ok = (db, args, input) => { const r = psql(db, args, input); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };

const SEMILLA = `
insert into gestlok_chat_private.empresas(tenant_id, nombre_publico) values ('a0000000-0000-4000-8000-00000000000a', 'Mi Gusto');
insert into gestlok_chat_private.sucursales(id, tenant_id, local_id, slug, nombre, activa, prefijo, acepta_envio, envio_costo, horario, medios_pago)
values ('5a000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'munro', 'mi-gusto-munro', 'Munro', true, 'MM', true, 500, 'De 11 a 23', array['efectivo','transferencia']),
       ('5a000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'torcuato', 'mi-gusto-torcuato', 'Don Torcuato', false, 'MT', false, 0, '', array['efectivo']);
insert into gestlok_chat_private.productos(id, tenant_id, sucursal_id, nombre, precio) values
 ('9a000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', '5a000000-0000-4000-8000-000000000001', 'Empanada de carne', 1000),
 ('9a000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', '5a000000-0000-4000-8000-000000000001', 'Empanada de jamón y queso', 1100);
`;

test('función gestlok-chat de punta a punta', {skip}, async t => {
  ok('postgres', ['-c', `drop database if exists ${DB}`, '-c', `create database ${DB}`]);
  t.after(() => psql('postgres', ['-c', `drop database if exists ${DB} with (force)`]));
  ok(DB, ['-f', 'tests/fixtures/chat/base.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261119210000_gestlok_chat_base.sql']);
  ok(DB, [], SEMILLA);
  process.env.CHAT_PG_DB = urlFor(DB);

  let handler;
  const ENV = {SUPABASE_URL: 'http://local', SUPABASE_SERVICE_ROLE_KEY: 'x'};
  globalThis.Deno = {env: {get: k => ENV[k]}, serve: h => { handler = h; }};
  ok(DB, [], `update gestlok_chat_private.sucursales set mensajes = '{"recibido":"Recibimos {codigo}, {nombre}. Total {total}."}', ia_instrucciones = 'Instrucción secreta del dueño' where slug = 'mi-gusto-munro'`);
  register(pathToFileURL(root + 'tests/fixtures/chat/loader.mjs'));
  await import(pathToFileURL(root + 'supabase/functions/gestlok-chat/index.ts').href);
  assert.ok(handler, 'la función registra su handler');

  const ORIGEN = 'https://chat.gestlok.com.ar';
  const TOKEN = 'tokenDePruebaDelClienteNumero0001abcdEFGH';
  const llamar = async (body, {origen = ORIGEN, metodo = 'POST', ip = '200.1.1.1'} = {}) => {
    const res = await handler(new Request('http://local/gestlok-chat', {method: metodo,
      headers: {'content-type': 'application/json', origin: origen, 'x-forwarded-for': ip}, body: metodo === 'POST' ? JSON.stringify(body) : undefined}));
    return {status: res.status, cors: res.headers.get('access-control-allow-origin'), body: res.status === 204 ? null : await res.json()};
  };

  // CORS y validaciones de entrada
  assert.equal((await llamar(null, {metodo: 'OPTIONS'})).status, 204);
  assert.equal((await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'abrir'}, {origen: 'https://malo.example'})).status, 403);
  assert.equal((await llamar({slug: 'mi-gusto-munro', token: 'corto', accion: 'abrir'})).status, 400);
  assert.equal((await llamar({slug: 'no-existe', token: TOKEN, accion: 'abrir'})).status, 404);
  const pausa = await llamar({slug: 'mi-gusto-torcuato', token: TOKEN, accion: 'abrir'});
  assert.equal(pausa.body.motivo, 'pausado');

  // Abrir: saludo inicial guardado
  let r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'abrir'});
  assert.equal(r.status, 200); assert.equal(r.cors, ORIGEN);
  assert.equal(r.body.catalogo.productos.length, 2);
  assert.match(r.body.nuevos[0].texto, /asistente de Mi Gusto Munro/);
  assert.ok(!JSON.stringify(r.body).includes('tenant_id'), 'no expone identificadores internos');
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'abrir'});
  assert.equal(r.body.mensajes.length, 1, 'retoma la misma conversación');

  // Pedido escrito → carrito → datos → pedido pendiente
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {texto: '2 empanadas de carne y 1 de jamón y queso'}});
  assert.equal(r.body.carrito.length, 2); assert.equal(r.body.total, 3100);
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {boton: 'finalizar'}});
  assert.equal(r.body.mensajes.at(-1).tipo, 'datos');
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {datos: {nombre: 'Ana', telefono: '11 5555-1234', entrega: 'envio', direccion: '', medio_pago: 'efectivo'}}});
  assert.match(r.body.mensajes.at(-1).texto, /Falta la dirección/, 'error de la base mostrado al cliente');
  assert.equal(r.body.carrito.length, 2, 'el carrito se conserva si falla');
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {datos: {nombre: 'Ana', telefono: '11 5555-1234', entrega: 'envio', direccion: 'Mitre 200', medio_pago: 'efectivo'}}});
  assert.equal(r.body.pedido.codigo, 'MM-0001'); assert.equal(Number(r.body.pedido.total), 3600);
  assert.equal(r.body.mensajes.at(-1).texto, 'Recibimos MM-0001, Ana. Total $ 3.600.', 'usa el mensaje configurado por el local');
  assert.equal(r.body.carrito.length, 0);
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'estado'});
  assert.equal(r.body.pedidos[0].estado, 'pendiente');
  assert.ok(!JSON.stringify(r.body).includes('Instrucción secreta'), 'las instrucciones de la IA nunca llegan al cliente');
  // El gerente marca terminado → el cliente recibe el aviso de «listo» (envío)
  ok(DB, [], `update gestlok_chat_private.pedidos set estado = 'terminado', decidido_at = now() where codigo = 'MM-0001'`);
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'estado'});
  assert.equal(r.body.pedidos[0].estado, 'terminado');
  assert.equal(r.body.pedidos[0].aviso, '¡Tu pedido MM-0001 está listo y sale para Mitre 200!');

  // El chat no guarda datos personales en los mensajes
  const msgs = ok(DB, ['-At', '-c', 'select string_agg(texto, \' | \') from gestlok_chat_private.mensajes']);
  assert.ok(!/5555|Mitre 200/.test(msgs), 'sin teléfono ni dirección en el historial del chat');

  // Entrada maliciosa: se recorta y no rompe
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {boton: "'; drop table x; --"}});
  assert.equal(r.status, 400);
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {texto: 'x'.repeat(5000)}});
  assert.equal(r.status, 200);

  // Otro teléfono no ve el pedido del primero
  r = await llamar({slug: 'mi-gusto-munro', token: 'otroTokenDeOtroCliente000000000000000002', accion: 'estado'});
  assert.equal(r.body.pedidos.length, 0);

  // Asistente con IA (API simulada): responde con herramientas; si falla, responde el motor.
  ENV.GESTLOK_CHAT_IA_PROVEEDOR = 'openai'; ENV.GESTLOK_CHAT_IA_CLAVE = 'clave-de-prueba';
  let iaPedidos = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    iaPedidos.push(JSON.parse(init.body));
    if (String(url).includes('falla')) return {ok: false, status: 503, json: async () => ({})};
    const ultimo = JSON.parse(init.body).messages.at(-1);
    const body = ultimo.role === 'tool'
      ? {choices: [{message: {content: 'Listo, sumé 3 de jamón y queso. ¿Algo más?'}}]}
      : {choices: [{message: {content: null, tool_calls: [{id: 't1', type: 'function', function: {name: 'agregar_producto', arguments: '{"producto":"P2","cantidad":3}'}}]}}]};
    return {ok: true, status: 200, json: async () => body};
  };
  t.after(() => { globalThis.fetch = fetchOriginal; });
  let handlerIA;
  globalThis.Deno.serve = h => { handlerIA = h; };
  await import(pathToFileURL(root + 'supabase/functions/gestlok-chat/index.ts').href + '?ia=1');
  const TOKEN_IA = 'tokenDelClienteConInteligenciaArtificial01';
  const llamarIA = async body => { const res = await handlerIA(new Request('http://local/gestlok-chat', {method: 'POST',
    headers: {'content-type': 'application/json', origin: ORIGEN, 'x-forwarded-for': '200.5.5.5'}, body: JSON.stringify(body)})); return res.json(); };
  await llamarIA({slug: 'mi-gusto-munro', token: TOKEN_IA, accion: 'abrir'});
  r = {body: await llamarIA({slug: 'mi-gusto-munro', token: TOKEN_IA, accion: 'mensaje', entrada: {texto: 'tres de jamón y queso porfa'}})};
  assert.equal(r.body.motor, 'ia');
  assert.equal(r.body.mensajes[0].texto, 'Listo, sumé 3 de jamón y queso. ¿Algo más?');
  assert.deepEqual(r.body.carrito.map(l => l.cantidad), [3]);
  assert.match(iaPedidos[0].messages[0].content, /Instrucción secreta del dueño/, 'la IA recibe las indicaciones del dueño');
  assert.ok(!iaPedidos[0].messages[0].content.includes('5a000000'), 'la IA no recibe identificadores internos');
  ENV.GESTLOK_CHAT_IA_URL = 'https://falla.example/v1/chat';
  globalThis.Deno.serve = h => { handlerIA = h; };
  await import(pathToFileURL(root + 'supabase/functions/gestlok-chat/index.ts').href + '?ia=2');
  r = {body: await llamarIA({slug: 'mi-gusto-munro', token: TOKEN_IA, accion: 'mensaje', entrada: {texto: '1 de carne'}})};
  assert.equal(r.body.motor, 'guiado', 'si la IA falla responde el motor');
  assert.deepEqual(r.body.carrito.map(l => l.cantidad).sort(), [1, 3]);
  delete ENV.GESTLOK_CHAT_IA_URL;
  ok(DB, [], `update gestlok_chat_private.sucursales set ia_activa = false where slug = 'mi-gusto-munro'`);
  iaPedidos = [];
  globalThis.Deno.serve = h => { handlerIA = h; };
  await import(pathToFileURL(root + 'supabase/functions/gestlok-chat/index.ts').href + '?ia=3');
  r = {body: await llamarIA({slug: 'mi-gusto-munro', token: TOKEN_IA, accion: 'mensaje', entrada: {texto: 'hola'}})};
  assert.equal(r.body.motor, 'guiado'); assert.equal(iaPedidos.length, 0, 'con la IA apagada en la sucursal no se llama a la API');

  // Topes: muchos mensajes seguidos desde la misma conexión se frenan
  let frenado = false;
  for (let i = 0; i < 25 && !frenado; i++) {
    const x = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {texto: 'hola'}}, {ip: '200.9.9.9'});
    frenado = x.status === 409;
  }
  assert.ok(frenado, 'el tope por minuto corta');
});
