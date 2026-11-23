import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {categoriasSugeridas, categoriasElegidas, preguntaSugerida, MENSAJES_BASE} from '../public/chat/motor.js';

const id = n => '00000000-0000-4000-8000-00000000000' + n;
// Ferretería ficticia: no tiene postres ni bebidas.
const catalogo = {
  categorias: [{id: id(1), nombre: 'Herramientas'}, {id: id(2), nombre: 'Tornillos y tarugos'}, {id: id(3), nombre: 'Pinturas'}],
  productos: [
    {id: id(4), categoria_id: id(1), nombre: 'Martillo', precio: 9000, activo: true, disponible: true, opciones: []},
    {id: id(5), categoria_id: id(2), nombre: 'Caja de tarugos', precio: 2500, activo: true, disponible: true, opciones: []},
    {id: id(6), categoria_id: id(3), nombre: 'Látex 4 L', precio: 30000, activo: true, disponible: false, opciones: []},
  ],
};
const carrito = [{producto_id: id(4), cantidad: 1, opciones: {}}];

test('sin categorías elegidas, una ferretería no recibe sugerencias de postres o bebidas', () => {
  assert.deepEqual(categoriasSugeridas(catalogo, carrito, {}), []);
  assert.equal(categoriasElegidas({}), null);
  assert.equal(preguntaSugerida({}), MENSAJES_BASE.sugerencia);
});

test('con categorías elegidas ofrece solo esas, disponibles y que el pedido no tenga', () => {
  const m = {sugerir_categorias: [id(1), id(2), id(3)].join(',')};
  const cats = categoriasSugeridas(catalogo, carrito, m);
  // Herramientas ya está en el pedido y Pinturas no tiene nada disponible.
  assert.deepEqual(cats.map(c => c.nombre), ['Tornillos y tarugos']);
  assert.equal(preguntaSugerida(m), 'Antes de finalizar, ¿desea agregar algo más a su pedido?');
  assert.equal(preguntaSugerida({...m, sugerencia: '¿Le sumamos tarugos?'}), '¿Le sumamos tarugos?');
});

test('«ninguna» apaga la venta sugerida y los códigos inválidos se ignoran', () => {
  assert.deepEqual(categoriasSugeridas(catalogo, [], {sugerir_categorias: 'ninguna'}), []);
  assert.deepEqual(categoriasElegidas({sugerir_categorias: 'x, ' + id(2)}), [id(2)]);
});

test('el motor del chat y el de la función siguen siendo idénticos', () => {
  const a = readFileSync(new URL('../public/chat/motor.js', import.meta.url), 'utf8');
  const b = readFileSync(new URL('../supabase/functions/gestlok-chat/motor.js', import.meta.url), 'utf8');
  assert.equal(a, b);
});

test('el panel ofrece elegir categorías, editar reglas de promos, link de reseñas y cartel QR', () => {
  const panel = readFileSync(new URL('../public/chat/panel/panel.js', import.meta.url), 'utf8');
  assert.match(panel, /Elegir categorías de mi carta/);
  assert.match(panel, /mensajes\.sugerir_categorias = ids\.join\(','\)/);
  assert.match(panel, /function editorReglas\(previas\)/);
  assert.match(panel, /reglas: r\}/);
  assert.match(panel, /Guardar link de reseñas/);
  assert.match(panel, /Imprimir cartel con QR/);
  assert.match(panel, /Ahorro estimado en comisiones/);
  const chat = readFileSync(new URL('../public/chat/chat.js', import.meta.url), 'utf8');
  assert.doesNotMatch(chat, /bien cocida, sin cebolla/);
});
