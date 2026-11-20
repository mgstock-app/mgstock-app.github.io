// GESTLOK Chat · motor del asistente (sin red ni base).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as M from '../supabase/functions/gestlok-chat/motor.js';

const cat = {
  categorias: [{id: 'c1', nombre: 'Empanadas'}, {id: 'c2', nombre: 'Pizzas'}],
  productos: [
    {id: 'e-carne', nombre: 'Empanada de carne', precio: 1000, activo: true, disponible: true, opciones: []},
    {id: 'e-jyq', nombre: 'Empanada de jamón y queso', precio: 1000, activo: true, disponible: true, opciones: []},
    {id: 'e-pollo', nombre: 'Empanada de pollo', precio: 1100, activo: true, disponible: false, opciones: []},
    {id: 'pizza', nombre: 'Pizza muzzarella', precio: 3000, activo: true, disponible: true, opciones: [
      {id: 'tam', nombre: 'Tamaño', tipo: 'una', obligatorio: true, valores: [{id: 'chica', nombre: 'Chica'}, {id: 'grande', nombre: 'Grande', extra: 2000}]},
      {id: 'ext', nombre: 'Extras', tipo: 'varias', max: 2, valores: [{id: 'acei', nombre: 'Aceitunas', extra: 300}, {id: 'huevo', nombre: 'Huevo', extra: 400}]}]},
    {id: 'flan', nombre: 'Flan casero', precio: 1500, activo: true, disponible: true, opciones: []},
  ],
};
const suc = {nombre: 'Munro', empresa: 'Mi Gusto', horario: 'Todos los días de 11 a 23', direccion: 'Av. Mitre 100',
  acepta_retiro: true, acepta_envio: true, envio_costo: 500, envio_zona: 'Munro y Florida', pedido_minimo: 2500,
  medios_pago: ['efectivo', 'transferencia'], bienvenida: ''};
const turno = (estado, entrada) => M.responder({sucursal: suc, catalogo: cat, estado, entrada});

test('copia del motor para el navegador idéntica', () => {
  assert.equal(readFileSync('public/chat/motor.js', 'utf8'), readFileSync('supabase/functions/gestlok-chat/motor.js', 'utf8'));
});

test('normaliza y formatea pesos', () => {
  assert.equal(M.normalizar('  ¡Jamón  y QUESO! '), 'jamon y queso');
  assert.equal(M.pesos(1234567.4), '$ 1.234.567');
});

test('bienvenida con botones', () => {
  const r = turno(null, {inicio: true});
  assert.match(r.mensajes[0].texto, /asistente de Mi Gusto Munro/);
  assert.equal(r.mensajes[0].botones.length, 4);
});

test('pedido escrito con cantidades y contexto', () => {
  const r = turno(null, {texto: 'Hola quiero 2 empanadas de carne y 1 de jamón y queso'});
  assert.deepEqual(r.estado.carrito.map(l => [l.producto_id, l.cantidad]), [['e-carne', 2], ['e-jyq', 1]]);
  assert.match(r.mensajes[0].texto, /Total estimado: \$ 3\.000/);
});

test('media docena y números en palabras', () => {
  let r = turno(null, {texto: 'media docena de carne'});
  assert.deepEqual(r.estado.carrito.map(l => l.cantidad), [6]);
  r = turno(r.estado, {texto: 'tres de jamon y queso'});
  assert.deepEqual(r.estado.carrito.map(l => [l.producto_id, l.cantidad]), [['e-carne', 6], ['e-jyq', 3]]);
  r = turno(r.estado, {texto: '2 de carne'});
  assert.equal(r.estado.carrito[0].cantidad, 8, 'suma a la línea existente');
});

test('opciones nombradas en el texto, y «sin» no elige', () => {
  let r = turno(null, {texto: 'una pizza grande con aceitunas'});
  assert.deepEqual(r.estado.carrito[0].opciones, {tam: ['grande'], ext: ['acei']});
  assert.equal(M.totalCarrito(cat, r.estado.carrito), 5300);
  r = turno(null, {texto: 'pizza chica sin aceitunas'});
  assert.deepEqual(r.estado.carrito[0].opciones, {tam: ['chica']});
});

test('opción obligatoria faltante pide elegir sin agregar', () => {
  const r = turno(null, {texto: 'una pizza'});
  assert.equal(r.estado.carrito.length, 0);
  assert.equal(r.mensajes[0].tipo, 'producto');
  assert.deepEqual(r.mensajes[0].productos, ['pizza']);
});

test('ambiguo pregunta cuál', () => {
  const r = turno(null, {texto: '2 empanadas'});
  assert.equal(r.estado.carrito.length, 0);
  assert.ok(r.mensajes[0].botones.some(b => b.id === 'elegir:e-carne:2'));
  const r2 = turno(r.estado, {boton: 'elegir:e-carne:2'});
  assert.deepEqual(r2.estado.carrito.map(l => [l.producto_id, l.cantidad]), [['e-carne', 2]]);
});

test('agotado no se agrega', () => {
  const r = turno(null, {texto: '1 empanada de pollo'});
  assert.equal(r.estado.carrito.length, 0);
  assert.match(r.mensajes.map(m => m.texto).join(' '), /no está disponible/);
});

test('consultas: horario, envío, pago, precio, carta', () => {
  assert.match(turno(null, {texto: 'a qué hora abren?'}).mensajes[0].texto, /11 a 23/);
  assert.match(turno(null, {texto: 'hacen delivery?'}).mensajes[0].texto, /Costo de envío: \$ 500/);
  assert.match(turno(null, {texto: 'se puede pagar con transferencia'}).mensajes[0].texto, /Efectivo, Transferencia/);
  assert.match(turno(null, {texto: 'cuanto sale el flan'}).mensajes[0].texto, /Flan casero: \$ 1\.500/);
  assert.equal(turno(null, {texto: 'que tienen en el menu'}).mensajes[0].tipo, 'carta');
  assert.equal(turno(null, {texto: 'quiero hacer un pedido'}).mensajes[0].tipo, 'carta');
});

test('finalizar: vacío, mínimo y formulario de datos', () => {
  assert.equal(turno(null, {texto: 'listo'}).mensajes[0].tipo, undefined);
  let r = turno(null, {texto: '2 de carne'});
  r = turno(r.estado, {boton: 'finalizar'});
  assert.match(r.mensajes[0].texto, /pedido mínimo es de \$ 2\.500/);
  r = turno(r.estado, {texto: 'un flan'});
  r = turno(r.estado, {boton: 'finalizar'});
  assert.equal(r.mensajes[0].tipo, 'datos');
  const f = turno(r.estado, {datos: {nombre: 'Ana', telefono: '11 5555 1234', entrega: 'envio', direccion: 'Mitre 200', medio_pago: 'efectivo'}});
  assert.equal(f.accion.tipo, 'crear_pedido');
  assert.deepEqual(f.accion.pedido.items.map(i => [i.producto_id, i.cantidad]), [['e-carne', 2], ['flan', 1]]);
  assert.equal(f.accion.pedido.entrega, 'envio');
  assert.ok(!('precio' in f.accion.pedido.items[0]), 'el pedido no lleva precios: los pone la base');
});

test('agregar desde la carta valida opciones', () => {
  let r = turno(null, {agregar: {producto_id: 'pizza', cantidad: 1, opciones: {tam: ['chica', 'grande']}}});
  assert.equal(r.estado.carrito.length, 0);
  r = turno(null, {agregar: {producto_id: 'pizza', cantidad: 1, opciones: {tam: ['grande'], ext: ['acei', 'huevo']}}});
  assert.equal(M.totalCarrito(cat, r.estado.carrito), 5700);
  r = turno(r.estado, {quitar: 0});
  assert.equal(r.estado.carrito.length, 0);
  r = turno(null, {agregar: {producto_id: 'no-existe', cantidad: 1}});
  assert.equal(r.estado.carrito.length, 0);
});

test('estado, cancelar y estado inválido', () => {
  assert.equal(turno(null, {texto: 'como va mi pedido?'}).accion.tipo, 'estado');
  assert.equal(turno(null, {texto: 'cancelar'}).accion.tipo, 'cancelar');
  const r = turno({carrito: [{producto_id: 'borrado', cantidad: 1}], paso: 'x'}, {texto: 'ver pedido'});
  assert.equal(r.estado.carrito.length, 0, 'descarta productos que ya no están');
});

test('los ejemplos salen de la carta del local (sirve para cualquier comercio)', () => {
  const m = M.ejemploPedido({productos: [{nombre: 'Café con leche', activo: true, disponible: true}, {nombre: 'Medialuna', activo: true, disponible: true}]});
  assert.equal(m, '«2 café con leche y 1 medialuna»');
  assert.equal(M.ejemploPedido({productos: [{nombre: 'Agotado', disponible: false}]}), '«2 de tal producto»');
  assert.doesNotMatch(M.textoCarrito({productos: [{nombre: 'Corte de pelo', activo: true}]}, []), /empanada/);
});


test('Mi Gusto: bienvenida breve, consulta de pagos y botones responden correctamente', () => {
  const miGusto = {...suc,
    bienvenida: '¡Hola! Soy el asistente de Mi Gusto Munro. ¿En qué puedo ayudarte? Podés escribirme o pedirme el menú.',
    medios_pago: ['debito', 'credito', 'efectivo', 'transferencia'],
    medios_pago_retiro: ['debito', 'credito', 'efectivo', 'transferencia'],
    medios_pago_envio: ['efectivo', 'transferencia']};
  const responder = entrada => M.responder({sucursal: miGusto, catalogo: cat, estado: null, entrada});
  const inicio = responder({inicio: true});
  assert.equal(inicio.mensajes[0].texto, M.formalizar(miGusto.bienvenida));
  assert.deepEqual(inicio.mensajes[0].botones.map(b => b.id), ['carta', 'horario', 'pago', 'soporte']);
  const pagos = responder({boton: 'pago'});
  assert.match(pagos.mensajes[0].texto, /Retiro en el local: Tarjeta de débito, Tarjeta de crédito, Efectivo, Transferencia/);
  assert.match(pagos.mensajes[0].texto, /Delivery: Efectivo, Transferencia/);
  assert.doesNotMatch(pagos.mensajes[0].texto, /Mercado Pago/);
  assert.match(responder({boton: 'horario'}).mensajes[0].texto, /Horario:/);
  assert.match(responder({boton: 'horario'}).mensajes[0].texto, /Envíos/mi);
  assert.equal(responder({boton: 'carta'}).mensajes[0].tipo, 'carta');
  assert.deepEqual(M.pagosDe(miGusto, 'envio'), ['efectivo', 'transferencia']);
  assert.deepEqual(M.pagosDe(miGusto, 'retiro'), ['debito', 'credito', 'efectivo', 'transferencia']);
});

test('soporte: informa demoras y no afirma que el pedido esté confirmado', () => {
 const local={...suc,demora_retiro:'15 a 20 minutos',demora_envio:'35 a 40 minutos'};
 const r=M.responder({sucursal:local,catalogo:cat,estado:null,entrada:{boton:'demora'}});
 assert.match(r.mensajes[0].texto,/15 a 20 minutos/);
 assert.match(r.mensajes[0].texto,/35 a 40 minutos/);
 assert.doesNotMatch(r.mensajes[0].texto,/pedido confirmado/i);
 assert.ok(r.mensajes[0].botones.some(b=>b.id==='reclamo_demora'));
 const help=M.responder({sucursal:local,catalogo:cat,estado:null,entrada:{boton:'soporte'}});
 assert.ok(help.mensajes[0].botones.some(b=>b.id==='reclamo_faltante'));
});
test('soporte: consultas no crean reclamo; faltante, demora real y otros reclamos sí',()=>{
 assert.equal(M.clasificarSoporte({texto:'¿Cuánto tarda el delivery?'}),'consulta_demora');
 assert.equal(M.clasificarSoporte({texto:'Mi pedido se demora, hace una hora que espero'}),'demora');
 assert.equal(M.clasificarSoporte({texto:'Me falta una empanada del pedido'}),'faltante');
 assert.equal(M.clasificarSoporte({texto:'Me cobraron mal'}),'otro');
 assert.equal(M.clasificarSoporte({boton:'reclamo_faltante'}),'faltante');
 assert.equal(M.clasificarSoporte({boton:'hablar_gerente'}),'otro');
 assert.equal(M.clasificarSoporte({texto:'Quiero 3 empanadas de carne'}),null);
});

test('Mi Gusto fuera de horario ofrece próximo turno y acepta pedido programado',()=>{
  const cerrado={...suc,atencion:{habilitado:true,abierto:false,proximo_texto:'hoy a las 19:00'}};
  const inicio=M.responder({sucursal:cerrado,catalogo:cat,estado:null,entrada:{inicio:true}});
  assert.match(inicio.mensajes[0].texto,/cerrado/i);
  assert.match(inicio.mensajes[0].texto,/hoy a las 19:00/);
  assert.ok(inicio.mensajes[0].botones.some(b=>b.id==='programar_si'));
  assert.doesNotMatch(inicio.mensajes[0].texto,/\\btu\\b|\\bpodés\\b/i);
  let r=M.responder({sucursal:cerrado,catalogo:cat,estado:inicio.estado,entrada:{boton:'programar_si'}});
  assert.equal(r.estado.programado,true);
  r=M.responder({sucursal:cerrado,catalogo:cat,estado:r.estado,entrada:{texto:'3 empanadas de carne'}});
  r=M.responder({sucursal:cerrado,catalogo:cat,estado:r.estado,entrada:{boton:'finalizar'}});
  assert.equal(r.mensajes[0].tipo,'datos');
  r=M.responder({sucursal:cerrado,catalogo:cat,estado:r.estado,entrada:{datos:{
    nombre:'María López',telefono:'1155551234',entrega:'retiro',medio_pago:'efectivo'}}});
  assert.equal(r.accion.tipo,'crear_pedido');
  assert.equal(r.accion.pedido.programar,true);
});
test('sin autorización no se envía un pedido fuera de horario',()=>{
 const cerrado={...suc,atencion:{habilitado:true,abierto:false,proximo_texto:'mañana a las 11:00'}};
 let r=M.responder({sucursal:cerrado,catalogo:cat,estado:null,entrada:{texto:'3 empanadas de carne'}});
 r=M.responder({sucursal:cerrado,catalogo:cat,estado:r.estado,entrada:{boton:'finalizar'}});
 assert.match(r.mensajes[0].texto,/mañana a las 11:00/);
 assert.equal(r.accion,undefined);
});
test('no expone código interno y comunica retiro por nombre',()=>{
 const p={codigo:'MM-0452',estado:'terminado',nombre:'Ana',entrega:'retiro',total:12000};
 const t=M.textoEstadoPedido(p,{nombre:'Munro',direccion:'Av. Mitre 100'},null);
 assert.doesNotMatch(t,/MM-0452|código/i);
 assert.match(t,/nombre/i);
 assert.doesNotMatch(t,/\\btu\\b|\\bpodés\\b/i);
});
test('consulta ajena deriva al gerente y pedido gastronómico no',()=>{
 assert.equal(M.consultaAjena('¿Quién ganó el partido de fútbol?'),true);
 assert.equal(M.consultaAjena('Quiero 2 pizzas muzzarella'),false);
 assert.equal(M.consultaAjena('¿Cuánto demora mi pedido?'),false);
});
