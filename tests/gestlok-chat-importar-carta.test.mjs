import test from 'node:test';
import assert from 'node:assert/strict';
import {analizarCarta, lineasDesdePalabras, numeroPrecio} from '../public/chat/panel/importar-carta.js';

test('arma categorías, productos, precios y descripciones de una carta gastronómica', () => {
  const carta = `CARTA
EMPANADAS
Carne a cuchillo ........ $ 1.900
Jugosa, con cebolla de verdeo
Jamón y queso $1.700
PIZZAS:
Muzzarella 8 porciones 12.000 15.500
Fugazzeta
$ 13.000
BEBIDAS
Coca-Cola 2,25 L 4500
Agua 500 ml 1.500`;
  const r = analizarCarta(carta);
  assert.deepEqual(r.map(c => c.nombre), ['EMPANADAS', 'PIZZAS', 'BEBIDAS']);
  const [emp, piz, beb] = r;
  assert.deepEqual(emp.productos.map(p => [p.nombre, p.precio]), [['Carne a cuchillo', 1900], ['Jamón y queso', 1700]]);
  assert.equal(emp.productos[0].descripcion, 'Jugosa, con cebolla de verdeo');
  assert.deepEqual(piz.productos.map(p => [p.nombre, p.precio]), [['Muzzarella 8 porciones', 12000], ['Fugazzeta', 13000]]);
  assert.match(piz.productos[0].descripcion, /Otros precios: \$ 15\.500/);
  assert.deepEqual(beb.productos.map(p => [p.nombre, p.precio]), [['Coca-Cola 2,25 L', 4500], ['Agua 500 ml', 1500]]);
});

test('sirve para otros rubros y no toma cantidades como precios', () => {
  const r = analizarCarta(`Herramientas
Martillo galponero 9.800
Caja de tornillos x 100 3500
Pack x 12`);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].productos.map(p => [p.nombre, p.precio]), [['Martillo galponero', 9800], ['Caja de tornillos x 100', 3500]]);
});

test('lo que no tiene precio no se convierte en producto y los productos sin título van a «General»', () => {
  const r = analizarCarta('Alfajor 1200\nConsultar por tortas\n');
  assert.deepEqual(r, [{nombre: 'General', productos: [{nombre: 'Alfajor', precio: 1200, descripcion: 'Consultar por tortas'}]}]);
  assert.deepEqual(analizarCarta('Bienvenidos\nHorario de 9 a 18'), []);
});

test('agrupa palabras con posición en renglones y lee precios argentinos', () => {
  const txt = lineasDesdePalabras([{t: '$ 1.200', x: 300, y: 10, h: 10}, {t: 'Empanada', x: 10, y: 11, h: 10}, {t: 'Pizza', x: 10, y: 40, h: 10}]);
  assert.equal(txt, 'Empanada $ 1.200\nPizza');
  assert.equal(numeroPrecio('$ 12.500,00'), 12500);
});

import {readFileSync} from 'node:fs';
test('el panel ofrece importar la carta con revisión y sin borrar nada', () => {
  const panel = readFileSync(new URL('../public/chat/panel/panel.js', import.meta.url), 'utf8');
  assert.match(panel, /Importar carta \(PDF, foto o texto\)/);
  assert.match(panel, /importar-carta\.js\?v=20261123importar1/);
  assert.match(panel, /Revisá la propuesta/);
  assert.match(panel, /No se borra nada de la carta actual/);
  assert.doesNotMatch(panel, /panel_producto_eliminar|delete from/i);
});
