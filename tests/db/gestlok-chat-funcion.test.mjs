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
  ok(DB, ['-f', 'supabase/migrations/20261120000406_gestlok_chat_confirmacion_manual.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120010751_gestlok_chat_pagos_por_entrega.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120010908_gestlok_chat_pagos_retiro_delivery_columnas.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120013358_gestlok_chat_stock_interno_permisos_gerente.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120014204_gestlok_chat_gerente_no_ampliar_editor.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120020052_gestlok_chat_soporte_reclamos_gerente.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120021122_gestlok_chat_soporte_seguimiento_hasta_cierre.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120024146_gestlok_chat_turnos_programacion_reportes.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120024820_gestlok_chat_reportes_fecha_local.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120024908_gestlok_chat_turnos_privilegios_privados.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120060000_gestlok_chat_promos_cantidad.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120070000_gestlok_chat_resena_cierre.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120073000_gestlok_chat_venta_sugerida.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120134000_gestlok_chat_delivery_fotos_cierre.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261120141000_gestlok_chat_clientes_recurrentes_sesion.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261121040000_gestlok_chat_on_fire_sin_descuento.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261121050000_gestlok_chat_on_fire_solo_ultimo_jueves.sql']);
  ok(DB, ['-f', 'supabase/migrations/20261121060000_gestlok_chat_global_y_reglas_por_local.sql']);
  ok(DB, ['-f', 'supabase/operaciones/gestlok-chat-recepcion-conciliada-20261120.sql']);
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

  for (const body of [null, [], 1, 'texto']) assert.equal((await llamar(body)).status, 400);
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
  // Saludo según la hora + bienvenida + guía de los botones de abajo («Hacer un pedido» primero).
  assert.match(r.body.nuevos[0].texto, /^¡Buen(os días|as tardes|as noches)! [\s\S]*Mi Gusto Munro[\s\S]*toque «Hacer un pedido» aquí abajo\./);
  assert.equal(r.body.nuevos[0].botones[0].texto, 'Hacer un pedido');
  assert.ok(!JSON.stringify(r.body).includes('tenant_id'), 'no expone identificadores internos');
  // Reabrir: la conversación conserva su historial y sus productos anteriores.
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'abrir'});
  assert.equal(r.body.mensajes.length, 1, 'retoma la misma conversación');

  // Test real de la función segura: combo de 6 empanadas + 2 salsas en un lote.
  // Antes se rechazaba por aceptar solo arreglos y no mapas de cantidades.
  const promoId = '9a000000-0000-4000-8000-000000000003';
  ok(DB, [], `insert into gestlok_chat_private.productos(id, tenant_id, sucursal_id, nombre, precio, opciones)
    values ('${promoId}', 'a0000000-0000-4000-8000-00000000000a',
      '5a000000-0000-4000-8000-000000000001','Pack 6 empanadas + 2 salsas',6500,
      '[{"id":"emp","nombre":"Empanadas","tipo":"cantidad","obligatorio":true,"total":6,
         "valores":[{"id":"carne","nombre":"Carne","extra":0},{"id":"jyq","nombre":"Jamón y queso","extra":0}]},
        {"id":"sal","nombre":"Salsas","tipo":"cantidad","obligatorio":true,"total":2,
         "valores":[{"id":"criolla","nombre":"Criolla","extra":0},{"id":"ajo","nombre":"Crema de ajo","extra":0}]}]'::jsonb)`);
  const TOKEN_PROMO = 'tokenDePruebaParaComboEmpanadas0002ABCD';
  const llamarPromo = body => llamar({slug:'mi-gusto-munro',token:TOKEN_PROMO,...body},{ip:'192.0.2.10'});
  const lotePromo = 'dde41c36-6d22-4c59-9db7-954c1c5932e1';
  const entradaPromo = {agregar_varios:[{producto_id:promoId,cantidad:1,nota:'',
    opciones:{emp:{carne:4,jyq:2},sal:{criolla:1,ajo:1}}}],lote_id:lotePromo};
  r = await llamarPromo({accion:'abrir'});
  assert.equal(r.status,200);
  r = await llamarPromo({accion:'mensaje',entrada:{texto:'¿Tienen el pack de seis empanadas?'}});
  assert.ok(r.body.mensajes[0].botones.some(b => b.id === 'elegir:' + promoId + ':1'));
  assert.deepEqual(r.body.carrito, []);
  r = await llamarPromo({accion:'mensaje',entrada:{boton:'elegir:' + promoId + ':1'}});
  assert.equal(r.body.mensajes[0].tipo, 'producto');
  const incompleto = await llamarPromo({accion:'mensaje',entrada:{...entradaPromo,
    agregar_varios:[{...entradaPromo.agregar_varios[0], opciones:{emp:{carne:4,jyq:2}, sal:{ajo:1}}}]}});
  assert.equal(incompleto.body.lote_aceptado, false);
  assert.deepEqual(incompleto.body.carrito, []);
  r = await llamarPromo({accion:'mensaje',entrada:entradaPromo});
  assert.equal(r.status,200,'la función acepta el mapa de cantidades del combo');
  assert.equal(r.body.lote_aceptado,true,'el servidor confirma la aceptación del lote');
  assert.equal(r.body.carrito.length,1);
  assert.equal(r.body.carrito[0].opciones.emp.carne,4);
  assert.equal(r.body.carrito[0].opciones.sal.ajo,1);
  r = await llamarPromo({accion:'mensaje',entrada:entradaPromo});
  assert.equal(r.body.lote_aceptado,true,'un reintento obtiene acuse sin duplicar');
  assert.equal(r.body.carrito.length,1,'el combo se agregó una sola vez');
  const rechazado = await llamarPromo({accion:'mensaje',
    entrada:{agregar_varios:[{producto_id:promoId,cantidad:1,opciones:{emp:{carne:'4'},sal:{criolla:2}}}],lote_id:'c879b229-650a-41e0-83eb-3034f96819d8'}});
  assert.equal(rechazado.status,400,'no se aceptan cantidades falsas en un combo');
  ok(DB, [], `update gestlok_chat_private.productos set activo=false where id='${promoId}'`);

  // Pedido escrito → menú interactivo → carrito → datos → pedido pendiente
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {texto: '2 empanadas de carne y 1 de jamón y queso'}});
  assert.equal(r.body.mensajes[0].tipo, 'carta');
  assert.deepEqual(r.body.carrito, []);
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {
    lote_id: '152be738-6038-4614-be55-2985e270984f', agregar_varios: [
      {producto_id: '9a000000-0000-4000-8000-000000000001', cantidad: 2},
      {producto_id: '9a000000-0000-4000-8000-000000000002', cantidad: 1},
    ]}});
  assert.equal(r.body.carrito.length, 2); assert.equal(r.body.total, 3100);
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {boton: 'finalizar'}});
  assert.equal(r.body.mensajes.at(-1).tipo, 'datos');
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {datos: {nombre: 'Ana', telefono: '11 5555-1234', entrega: 'envio', direccion: '', medio_pago: 'efectivo'}}});
  assert.match(r.body.mensajes.at(-1).texto, /Falta la dirección/, 'error de la base mostrado al cliente');
  assert.equal(r.body.carrito.length, 2, 'el carrito se conserva si falla');
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {datos: {nombre: 'Ana', telefono: '11 5555-1234', entrega: 'envio', direccion: 'Mitre 200', medio_pago: 'efectivo'}}});
  assert.ok(!('codigo' in r.body.pedido),'el código es interno del gerente'); assert.equal(Number(r.body.pedido.total), 3600);
  assert.match(r.body.mensajes.at(-1).texto, /pendiente de revisión y confirmación del gerente/i, 'no confirma con plantillas anteriores');
  assert.equal(r.body.carrito.length, 0);
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'estado'});
  assert.equal(r.body.pedidos[0].estado, 'pendiente');
  assert.ok(!JSON.stringify(r.body).includes('Instrucción secreta'), 'las instrucciones de la IA nunca llegan al cliente');
  // El gerente marca terminado → el cliente recibe el aviso de «listo» (envío)
  ok(DB, [], `update gestlok_chat_private.pedidos set estado = 'terminado', decidido_at = now() where codigo = 'MM-0001'`);
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'estado'});
  assert.equal(r.body.pedidos[0].estado, 'terminado');
  assert.match(r.body.pedidos[0].aviso, /sal|entreg|listo|pedido/i);
  assert.match(r.body.pedidos[0].aviso, /Mitre 200/);
  assert.doesNotMatch(JSON.stringify(r.body), /MM-0001/, 'el código no llega al cliente');
  // Pedido listo/enviado: cierre inmediato aunque el cliente todavía no confirmó recepción.
  assert.equal(r.body.pedidos[0].recibido_at, null);
  assert.equal(r.body.pedidos[0].cierre, '¡Gracias por elegirnos!');
  assert.equal(r.body.pedidos[0].resena, null, 'sin URL de Google configurada no hay enlace');
  r = await llamar({slug:'mi-gusto-munro', token:TOKEN, accion:'recibido'});
  assert.equal(r.status,200);
  assert.ok(r.body.pedido.recibido_at, 'registra entrega confirmada por el cliente');
  assert.equal(r.body.pedido.cierre,'¡Gracias por elegirnos!');
  const marca = r.body.pedido.recibido_at;
  r = await llamar({slug:'mi-gusto-munro', token:TOKEN, accion:'recibido'});
  assert.equal(r.body.pedido.recibido_at,marca, 'confirmación idempotente');
  ok(DB, [], `update gestlok_chat_private.sucursales set mensajes = mensajes || '{"resena_url":"https://g.page/r/CT9jkvArEGhFEBM/review","resena":"Nos ayudaría mucho que nos deje su reseña y nos cuente su experiencia.","cierre":"¡Gracias por elegirnos! 🥰"}' where slug = 'mi-gusto-munro'`);
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'estado'});
  assert.deepEqual(r.body.pedidos[0].resena, {texto: 'Nos ayudaría mucho que nos deje su reseña y nos cuente su experiencia.', url: 'https://g.page/r/CT9jkvArEGhFEBM/review'});
  assert.equal(r.body.pedidos[0].cierre, '¡Gracias por elegirnos! 🥰');
  const enCamino = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'abrir'});
  assert.match(enCamino.body.pedidos[0].aviso, /en camino a Mitre 200/, 'envío terminado = en camino');
  assert.equal(enCamino.body.pedidos[0].resena.url, 'https://g.page/r/CT9jkvArEGhFEBM/review', 'al volver a abrir el chat también llega');
  assert.notEqual(psql(DB, [], `update gestlok_chat_private.sucursales set mensajes = mensajes || '{"resena_url":"https://evil.example/x"}' where slug = 'mi-gusto-munro'`).status, 0,
    'la base no guarda links de reseñas que no son de Google');

  // El chat no guarda datos personales en los mensajes
  const msgs = ok(DB, ['-At', '-c', 'select string_agg(texto, \' | \') from gestlok_chat_private.mensajes']);
  assert.ok(!/5555|Mitre 200/.test(msgs), 'sin teléfono ni dirección en el historial del chat');

  // Entrada maliciosa: se recorta y no rompe
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {boton: "'; drop table x; --"}});
  assert.equal(r.status, 400);
  r = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {texto: 'x'.repeat(5000)}});
  assert.equal(r.status, 200);

  // Otro navegador sin el token no puede confirmar la entrega ajena.
  r = await llamar({slug:'mi-gusto-munro',token:'otroTokenDeOtroCliente000000000000000002',accion:'recibido'});
  assert.equal(r.body.ok,false);
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
    // Pedido sin herramientas = bienvenida.
    if (!JSON.parse(init.body).tools) return {ok: true, status: 200, json: async () => ({choices: [{message: {content: 'Buenas noches, bienvenido a Mi Gusto Munro. Puede ver el menú con los botones de abajo.'}}]})};
    const ultimo = JSON.parse(init.body).messages.at(-1);
    const body = ultimo.role === 'tool'
      ? {choices: [{message: {content: 'Complete su selección de jamón y queso en el menú.'}}]}
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
  // Bienvenida: la escribe la IA; los botones siguen siendo los del sistema.
  r = {body: await llamarIA({slug: 'mi-gusto-munro', token: TOKEN_IA, accion: 'abrir'})};
  // La IA saluda y, en el mismo mensaje, el sistema indica los botones de abajo.
  assert.match(r.body.nuevos[0].texto, /^Buenas noches, bienvenido a Mi Gusto Munro\. Puede ver el menú con los botones de abajo\.\nPara hacer su pedido, toque «Hacer un pedido» aquí abajo\./);
  assert.ok(r.body.nuevos[0].botones.some(b => b.id === 'carta'), 'la bienvenida conserva los botones del sistema');
  assert.equal(iaPedidos.length, 1); assert.ok(!('tools' in iaPedidos[0]));
  // Retomar la conversación no vuelve a llamar a la IA.
  r = {body: await llamarIA({slug: 'mi-gusto-munro', token: TOKEN_IA, accion: 'abrir'})};
  assert.equal(iaPedidos.length, 1, 'la bienvenida se pide una sola vez por conversación');
  assert.equal(r.body.nuevos.length, 0);
  assert.match(r.body.mensajes.at(-1).texto, /^Buenas noches, bienvenido a Mi Gusto Munro\. Puede ver el menú con los botones de abajo\.\nPara hacer su pedido, toque «Hacer un pedido»/, 'al recargar se ve la misma bienvenida');
  iaPedidos = [];
  // Prioridad botones y carrito: un pedido escrito lo resuelve el asistente guiado, sin llamar a la IA.
  r = {body: await llamarIA({slug: 'mi-gusto-munro', token: TOKEN_IA, accion: 'mensaje', entrada: {texto: 'tres de jamón y queso porfa'}})};
  assert.equal(r.body.motor, 'guiado');
  assert.equal(iaPedidos.length, 0, 'lo que el guiado entiende no gasta IA');
  assert.deepEqual(r.body.carrito, []);
  assert.equal(r.body.mensajes[0].tipo, 'producto');
  assert.equal(r.body.mensajes[0].cantidad, 3);
  // Solo lo que el guiado no entiende pasa a la IA.
  r = {body: await llamarIA({slug: 'mi-gusto-munro', token: TOKEN_IA, accion: 'mensaje', entrada: {texto: 'aceptan perros adentro'}})};
  assert.equal(r.body.motor, 'ia');
  assert.equal(r.body.mensajes[0].texto, 'Complete su selección de jamón y queso en el menú.');
  assert.equal(r.body.mensajes[0].tipo, 'producto');
  assert.deepEqual(r.body.carrito, []);
  assert.ok(iaPedidos.length > 0);
  assert.match(iaPedidos[0].messages[0].content, /Instrucción secreta del dueño/, 'la IA recibe las indicaciones del dueño');
  assert.ok(!iaPedidos[0].messages[0].content.includes('5a000000'), 'la IA no recibe identificadores internos');
  ENV.GESTLOK_CHAT_IA_URL = 'https://falla.example/v1/chat';
  globalThis.Deno.serve = h => { handlerIA = h; };
  await import(pathToFileURL(root + 'supabase/functions/gestlok-chat/index.ts').href + '?ia=2');
  r = {body: await llamarIA({slug: 'mi-gusto-munro', token: TOKEN_IA, accion: 'mensaje', entrada: {texto: '1 de carne'}})};
  assert.equal(r.body.motor, 'guiado', 'el pedido escrito sigue por el guiado');
  assert.equal(r.body.mensajes[0].tipo, 'producto');
  assert.deepEqual(r.body.carrito, []);
  r = {body: await llamarIA({slug: 'mi-gusto-munro', token: TOKEN_IA, accion: 'mensaje', entrada: {texto: 'hacen facturas tipo A'}})};
  assert.equal(r.body.soporte_pendiente, true, 'si la IA falla, la consulta pasa al gerente');
  r = {body: await llamarIA({slug: 'mi-gusto-munro', token: 'tokenDeOtroClienteConLaIACaida0000000003', accion: 'abrir'})};
  assert.match(r.body.nuevos[0].texto, /^¡Buen(os días|as tardes|as noches)! [\s\S]*Mi Gusto Munro[\s\S]*«Hacer un pedido»/, 'si la IA falla, queda la bienvenida guiada');
  delete ENV.GESTLOK_CHAT_IA_URL;
  ok(DB, [], `update gestlok_chat_private.sucursales set ia_activa = false where slug = 'mi-gusto-munro'`);
  iaPedidos = [];
  globalThis.Deno.serve = h => { handlerIA = h; };
  await import(pathToFileURL(root + 'supabase/functions/gestlok-chat/index.ts').href + '?ia=3');
  r = {body: await llamarIA({slug: 'mi-gusto-munro', token: TOKEN_IA, accion: 'mensaje', entrada: {texto: 'hola'}})};
  assert.equal(r.body.motor, 'guiado'); assert.equal(iaPedidos.length, 0, 'con la IA apagada en la sucursal no se llama a la API');

  // Delivery: descuento real en la base, monto entregado y cambio para el repartidor.
  ok(DB, [], "update gestlok_chat_private.sucursales set descuento_efectivo_pct=10 where slug='mi-gusto-munro'");
  const TOKEN_CASH='tokenDePruebaMontoEfectivo00000000000004';
  const seleccionCarne = {lote_id:'152be738-6038-4614-be55-2985e270984f',
    agregar_varios:[{producto_id:'9a000000-0000-4000-8000-000000000001',cantidad:2}]};
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_CASH,accion:'abrir'});
  assert.equal(r.status,200);
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_CASH,accion:'mensaje',entrada:seleccionCarne});
  assert.equal(r.body.carrito.length,1);
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_CASH,accion:'mensaje',entrada:{boton:'finalizar'}});
  assert.ok(r.body.mensajes.some(m=>m.tipo==='datos'));
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_CASH,accion:'mensaje',
    entrada:{datos:{nombre:'Cliente efectivo',telefono:'1155550010',entrega:'envio',direccion:'Mitre 300',
      medio_pago:'efectivo',efectivo_abona:'3000'}}});
  assert.equal(r.status,200);
  assert.equal(Number(r.body.pedido.subtotal),2000);
  assert.equal(Number(r.body.pedido.descuento),200);
  assert.equal(Number(r.body.pedido.total),2300);
  assert.equal(Number(r.body.pedido.efectivo_abona),3000);
  assert.equal(Number(r.body.pedido.efectivo_cambio),700);
  ok(DB, [], "update gestlok_chat_private.sucursales set descuento_efectivo_pct=0 where slug='mi-gusto-munro'");

  // Foto: la sube el cliente por el token de SU conversación y Storage privado.
  const TOKEN_FOTO='tokenDePruebaFotosCliente000000000000005';
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_FOTO,accion:'abrir'});
  assert.equal(r.status,200);
  const jpg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,255,217]).toString('base64');
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_FOTO,accion:'adjuntar',mime:'image/jpeg',imagen:jpg});
  assert.equal(r.status,200);
  assert.equal(r.body.soporte_pendiente,true);
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_FOTO,accion:'abrir'});
  assert.equal(r.body.fotos.length,1);
  assert.match(r.body.fotos[0].url,/^https:\/\/test-storage\.example\/private\//);
  const otro=await llamar({slug:'mi-gusto-munro',token:'tokenFotografiasDeOtroCliente00000000006',accion:'abrir'});
  assert.equal(otro.body.fotos.length,0,'un cliente ajeno no ve comprobantes');
  const mala=await llamar({slug:'mi-gusto-munro',token:TOKEN_FOTO,accion:'adjuntar',
    mime:'image/jpeg',imagen:Buffer.from('no-es-una-foto-real').toString('base64')});
  assert.equal(mala.status,400,'el servidor rechaza archivos disfrazados de JPEG');

  // Al cerrar manualmente, no se reciben pedidos ni nuevos mensajes desde el token anterior.
  ok(DB, [], "update gestlok_chat_private.conversaciones set cerrada_at=now() where id=(select conversacion_id from gestlok_chat_private.adjuntos limit 1)");
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_FOTO,accion:'estado'});
  assert.equal(r.body.cerrada,true);
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_FOTO,accion:'mensaje',entrada:{texto:'hola'}});
  assert.equal(r.status,409,'el cliente no escribe en una charla cerrada');

  // Un cliente puede volver sin registrarse. El teléfono NO basta para revelar su dirección.
  const BROWSER='claveEstableDeUnNavegadorAnonimo00000000001';
  const BROWSER_EXTRA='claveDeOtroNavegadorAnonimo000000000002';
  const TOKEN_FREQ1='tokenClienteFrecuentePrimeraCharla00001';
  const TOKEN_FREQ2='tokenClienteFrecuenteSegundaCharla00002';
  const TEL_FREQ='1155550111';
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_FREQ1,cliente_token:BROWSER,accion:'abrir'});
  assert.equal(r.status,200);
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_FREQ1,cliente_token:BROWSER,
    accion:'recordar',telefono:TEL_FREQ});
  assert.equal(r.body.encontrado,false,'no hay registro automático por conocer un teléfono');
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_FREQ1,cliente_token:BROWSER,
    accion:'mensaje',entrada:seleccionCarne});
  assert.equal(r.body.carrito.length,1);
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_FREQ1,cliente_token:BROWSER,accion:'mensaje',
    entrada:{datos:{nombre:'María Frecuente',telefono:TEL_FREQ,entrega:'envio',
      direccion:'Mitre 300, Munro',medio_pago:'transferencia'}}});
  assert.equal(r.status,200,'el primer pedido se recibe sin registro');
  assert.equal(r.body.pedido.estado,'pendiente','no se confirma solo');
  ok(DB, [], "update gestlok_chat_private.conversaciones set cerrada_at=now() where id=(select conversacion_id from gestlok_chat_private.pedidos where cliente_telefono='"+TEL_FREQ+"' limit 1)");
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_FREQ2,cliente_token:BROWSER,accion:'abrir'});
  assert.equal(r.status,200,'nuevo chat y misma clave anónima');
  r=await llamar({slug:'mi-gusto-munro',token:TOKEN_FREQ2,cliente_token:BROWSER,
    accion:'recordar',telefono:TEL_FREQ});
  assert.equal(r.body.encontrado,true);
  assert.equal(r.body.nombre,'María Frecuente');
  assert.equal(r.body.direccion,'Mitre 300, Munro');
  assert.equal(r.body.visitas,1);
  const otroTelefono=await llamar({slug:'mi-gusto-munro',token:TOKEN_FREQ2,cliente_token:BROWSER,
    accion:'recordar',telefono:'1155550998'});
  assert.equal(otroTelefono.body.encontrado,false,'no se consulta otro teléfono con igual navegador');
  const otroDispositivo=await llamar({slug:'mi-gusto-munro',token:TOKEN_FREQ2,cliente_token:BROWSER_EXTRA,
    accion:'recordar',telefono:TEL_FREQ});
  assert.equal(otroDispositivo.body.encontrado,false,'mismo teléfono sin secreto del navegador nunca revela dirección');
  const perfilGuardado=ok(DB,['-At','-c', "select count(*) from gestlok_chat_private.clientes_frecuentes where telefono='"+TEL_FREQ+"'"]).trim();
  assert.equal(perfilGuardado,'1');

  // Topes: muchos mensajes seguidos desde la misma conexión se frenan
  let frenado = false;
  for (let i = 0; i < 25 && !frenado; i++) {
    const x = await llamar({slug: 'mi-gusto-munro', token: TOKEN, accion: 'mensaje', entrada: {texto: 'hola'}}, {ip: '200.9.9.9'});
    frenado = x.status === 409;
  }
  assert.ok(frenado, 'el tope por minuto corta');
});
