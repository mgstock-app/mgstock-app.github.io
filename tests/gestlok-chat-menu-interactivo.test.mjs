import test from 'node:test';
import assert from 'node:assert/strict';
import {promocionesVigentes, responder} from '../public/chat/motor.js';

const catalogo = {categorias: [], productos: [
  {id: 'e1', nombre: 'Empanada JyQ', precio: 4900, activo: true, disponible: true, opciones: []},
  {id: 'e2', nombre: 'Empanada carne', precio: 4900, activo: true, disponible: true, opciones: []},
  {id: 'p1', nombre: 'Pizza muzzarella', precio: 17900, activo: true, disponible: true,
    opciones: [{id: 'extra', nombre: 'Adicional', tipo: 'una', obligatorio: false,
      valores: [{id: 'jamon', nombre: 'Jamón', extra: 3000}]}]},
]};
const sucursal = {empresa: 'Mi Gusto', nombre: 'Munro', pedido_minimo: 0};
const lote = 'c879b229-650a-41e0-83eb-3034f96819d8';
const seleccion = [
  {producto_id: 'e1', cantidad: 4, opciones: {}, nota: ''},
  {producto_id: 'e2', cantidad: 6, opciones: {}, nota: ''},
  {producto_id: 'p1', cantidad: 1, opciones: {extra: ['jamon']}, nota: ''},
];
const turno = (estado, entrada) => responder({sucursal, catalogo, estado, entrada, mensajes: {}});

test('menú: manda varias variedades y cantidades juntas, sin confirmar automáticamente', () => {
  const r = turno(null, {agregar_varios: seleccion, lote_id: lote});
  assert.deepEqual(r.estado.carrito.map(l => [l.producto_id, l.cantidad]), [['e1',4],['e2',6],['p1',1]]);
  assert.match(r.mensajes[0].texto, /4 × Empanada JyQ/);
  assert.match(r.mensajes[0].texto, /6 × Empanada carne/);
  assert.match(r.mensajes[0].texto, /Jamón/);
  assert.equal(r.accion, undefined);
  assert.equal(r.estado.ultimo_lote, lote);
});

test('menú: reintentar el mismo envío no duplica productos', () => {
  const inicial = turno(null, {agregar_varios: seleccion, lote_id: lote});
  const r = turno(inicial.estado, {agregar_varios: seleccion, lote_id: lote});
  assert.deepEqual(r.estado.carrito, inicial.estado.carrito);
  assert.match(r.mensajes[0].texto, /ya fue recibida/);
});

test('menú: un error invalida toda la selección, sin cargar parcialmente', () => {
  const r = turno(null, {agregar_varios: [seleccion[0], {producto_id: 'p1', cantidad: 1, opciones: {extra:['falso']}, nota:''}], lote_id: lote});
  assert.equal(r.estado.carrito.length, 0);
  assert.match(r.mensajes[0].texto, /No se agregó ningún producto/);
});

test('menú: no permite exceder 50 unidades en reenvíos distintos', () => {
  const x = turno(null, {agregar_varios:[{producto_id:'e1',cantidad:40,opciones:{},nota:''}],lote_id:lote});
  const r = turno(x.estado, {agregar_varios:[{producto_id:'e1',cantidad:20,opciones:{},nota:''}],lote_id:'dde41c36-6d22-4c59-9db7-954c1c5932e1'});
  assert.equal(r.estado.carrito[0].cantidad,40);
  assert.match(r.mensajes[0].texto,/cantidad máxima/);
});

test('menú: el asistente pide datos antes de registrar pedido', () => {
  const r = turno(null, {agregar_varios: seleccion, lote_id: lote});
  const datos = turno(r.estado, {boton:'finalizar'});
  assert.equal(datos.accion, undefined);
  assert.ok(datos.mensajes.some(m => m.tipo === 'datos'));
});

test('cada sucursal ofrece solo sus promociones disponibles y lleva al selector', () => {
  for (const slug of ['mi-gusto-munro', 'mi-gusto-torcuato']) {
    const grupo = {id: 'emp', nombre: 'Empanadas', tipo: 'cantidad', total: 6, obligatorio: true,
      valores: [{id: 'carne', nombre: 'Carne', producto_id: 'e2'}]};
    const promo = {id: 'pack-' + slug, nombre: 'Pack de 6 empanadas', precio: 32000, opciones: [grupo]};
    const carta = {...catalogo, productos: [...catalogo.productos, promo,
      {...promo, id: 'oculto', activo: false}, {...promo, id: 'agotado', disponible: false},
      {...promo, id: 'sin-variedades', opciones: [{...grupo, valores: []}]}]};
    const responderLocal = entrada => responder({sucursal: {...sucursal, slug}, catalogo: carta, entrada});
    assert.deepEqual(promocionesVigentes(carta), [promo]);
    for (const texto of ['¿Qué promociones tienen?', 'Quiero seis empanadas', '¿Cuánto sale el pack de 6?']) {
      const r = responderLocal({texto});
      assert.deepEqual(r.estado.carrito, []);
      assert.deepEqual(r.mensajes[0].botones.map(b => b.id), ['elegir:' + promo.id + ':1', 'carta']);
    }
    const r = responderLocal({boton: 'elegir:' + promo.id + ':1'});
    assert.equal(r.mensajes[0].tipo, 'producto');
    assert.equal(r.mensajes[0].opciones, undefined);
    assert.deepEqual(r.estado.carrito, []);
  }
});
