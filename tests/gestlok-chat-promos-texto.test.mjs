import test from 'node:test';
import assert from 'node:assert/strict';
import {botonesBienvenida, pidePromociones, responder} from '../public/chat/motor.js';

// Local genérico (no Mi Gusto): dos secciones de promociones, otra sección común y un producto oculto.
const catalogo = {
  categorias: [
    {id: 'perf', nombre: 'Perfumes', orden: 0},
    {id: 'combos', nombre: 'Combos de perfumes', orden: 10},
    {id: 'regalo', nombre: 'Promos para regalar', orden: 20},
  ],
  productos: [
    {id: 'p1', nombre: 'Perfume Brisa 100 ml', precio: 30000, categoria_id: 'perf', activo: true, disponible: true, opciones: []},
    {id: 'c12', nombre: 'Combo 12 muestras', precio: 18000, categoria_id: 'combos', activo: true, disponible: true, opciones: []},
    {id: 'c2', nombre: 'Combo 2 perfumes', precio: 52000, categoria_id: 'combos', activo: true, disponible: true, opciones: []},
    {id: 'r1', nombre: 'Caja regalo + perfume', precio: 41000, categoria_id: 'regalo', activo: true, disponible: true, opciones: []},
    {id: 'x', nombre: 'Combo oculto', precio: 1, categoria_id: 'combos', activo: false, disponible: true, opciones: []},
  ],
};
const local = extra => ({empresa: 'Aroma Nube', slug: 'aroma-nube', nombre: 'Centro', pedido_minimo: 0, ...extra});
const turno = (s, entrada, cat = catalogo) => responder({sucursal: s, catalogo: cat, estado: null, entrada, mensajes: {}});
const ids = r => (r.mensajes[0].botones || []).map(b => b.id);

test('«Promos» y variantes ofrecen las promos del local con botones, en el orden de la carta', () => {
  for (const menu_interactivo of [true, false]) {
    for (const texto of ['Promos', 'promociones', 'Promociones', '¿Tienen promos?', 'Hola, ¿tienen promociones?', 'ofertas', 'combos']) {
      const r = turno(local({menu_interactivo}), {texto});
      assert.deepEqual(ids(r), ['elegir:c2:1', 'elegir:c12:1', 'elegir:r1:1', 'carta'], texto + ' / menú ' + menu_interactivo);
      assert.match(r.mensajes[0].texto, /Combos de perfumes y Promos para regalar/);
      assert.deepEqual(r.estado.carrito, []);
    }
  }
});

test('si el cliente nombra una sección, solo muestra esa sección', () => {
  const r = turno(local({menu_interactivo: true}), {texto: 'promos para regalar'});
  assert.deepEqual(ids(r), ['elegir:r1:1', 'carta']);
  assert.match(r.mensajes[0].texto, /: Promos para regalar\./);
  const p = turno(local({menu_interactivo: false}), {texto: 'combos de perfume'});
  assert.deepEqual(ids(p), ['elegir:c2:1', 'elegir:c12:1', 'carta']);
});

test('el botón «Ver promociones» (menú interactivo) muestra lo mismo; sin promos, se avisa', () => {
  assert.ok(botonesBienvenida(local({menu_interactivo: true}), catalogo).some(b => b.id === 'promociones'));
  for (const menu_interactivo of [true, false]) {
    assert.deepEqual(ids(turno(local({menu_interactivo}), {boton: 'promociones'})), ['elegir:c2:1', 'elegir:c12:1', 'elegir:r1:1', 'carta']);
  }
  const sinPromos = {categorias: [catalogo.categorias[0]], productos: [catalogo.productos[0]]};
  assert.ok(!botonesBienvenida(local({menu_interactivo: true}), sinPromos).some(b => b.id === 'promociones'));
  const r = turno(local({menu_interactivo: false}), {texto: 'Promos'}, sinPromos);
  assert.match(r.mensajes[0].texto, /no tiene promociones disponibles/);
  assert.deepEqual(ids(r), ['carta']);
});

test('sin pedir promos, el texto sigue igual: un local sin menú interactivo agrega lo que el cliente nombra', () => {
  assert.equal(pidePromociones('Quiero el perfume Brisa'), false);
  const r = turno(local({menu_interactivo: false}), {texto: 'quiero 1 perfume brisa'});
  assert.deepEqual(r.estado.carrito.map(l => [l.producto_id, l.cantidad]), [['p1', 1]]);
  // Un saludo sin promos sigue siendo saludo.
  assert.doesNotMatch(turno(local({menu_interactivo: true}), {texto: 'Hola'}).mensajes[0].texto, /promociones/);
});

test('tocar una promo abre su selección; las agotadas u ocultas no se ofrecen', () => {
  const agotada = {...catalogo, productos: catalogo.productos.map(p => p.id === 'c2' ? {...p, disponible: false} : p)};
  assert.deepEqual(ids(turno(local({menu_interactivo: true}), {texto: 'Promos'}, agotada)), ['elegir:c12:1', 'elegir:r1:1', 'carta']);
  const r = turno(local({menu_interactivo: true}), {boton: 'elegir:c12:1'});
  assert.equal(r.mensajes[0].tipo, 'producto');
  assert.deepEqual(r.mensajes[0].productos, ['c12']);
});
