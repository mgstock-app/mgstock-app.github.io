import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {categoriaNombrada, fueraDeCarta, responder} from '../public/chat/motor.js';
import {armarSistema} from '../supabase/functions/gestlok-chat/ia.js';

// Dos rubros distintos: la base de conocimiento es la carta de cada local (nada fijo en el código).
const comida = {
  categorias: [{id: 'emp', nombre: 'Empanadas', orden: 0}, {id: 'beb', nombre: 'Bebidas', orden: 10}, {id: 'pos', nombre: 'Postres', orden: 20}],
  productos: [
    {id: 'carne', nombre: 'Empanada de carne', precio: 1200, categoria_id: 'emp', activo: true, disponible: true, opciones: []},
    {id: 'jyq', nombre: 'Empanada jamón y queso', precio: 1200, categoria_id: 'emp', activo: true, disponible: true, opciones: []},
    {id: 'agua-con', nombre: 'Agua con gas', precio: 900, categoria_id: 'beb', activo: true, disponible: true, opciones: []},
    {id: 'agua-sin', nombre: 'Agua sin gas', precio: 900, categoria_id: 'beb', activo: true, disponible: false, opciones: []},
    {id: 'flan', nombre: 'Flan casero', precio: 2500, categoria_id: 'pos', activo: true, disponible: true, opciones: []},
    {id: 'oculto', nombre: 'Tiramisú', precio: 3000, categoria_id: 'pos', activo: false, disponible: true, opciones: []},
  ],
};
const perfumeria = {
  categorias: [{id: 'perf', nombre: 'Perfumes', orden: 0}],
  productos: [{id: 'p1', nombre: 'Perfume Brisa vainilla 100 ml', precio: 30000, categoria_id: 'perf', activo: true, disponible: true, opciones: []}],
};
const local = menu_interactivo => ({empresa: 'Comercio de prueba', slug: 'comercio', nombre: 'Centro', pedido_minimo: 0, menu_interactivo});
const turno = (cat, texto, menu = true) => responder({sucursal: local(menu), catalogo: cat, estado: null, entrada: {texto}, mensajes: {}}).mensajes[0];

test('lo que no está en la carta: «ese producto no lo trabajamos», sin IA ni gerente', () => {
  for (const menu of [true, false]) {
    for (const [texto, nombre] of [['¿tienen sushi?', 'sushi'], ['quiero una hamburguesa', 'hamburguesa'], ['cerveza', 'cerveza'],
      ['¿hacen tortas de cumpleaños?', 'tortas de cumpleaños'], ['tienen tiramisú?', 'tiramisú']]) {
      const m = turno(comida, texto, menu);
      assert.equal(m.texto, 'Lo sentimos, «' + nombre + '» no lo trabajamos. Puede ver todo lo que ofrecemos en el menú.', texto);
      assert.equal(m.botones[0].id, 'carta');
    }
  }
  assert.match(turno(perfumeria, '¿Tienen cremas?').texto, /«cremas» no lo trabajamos/);
});

test('variedad que no existe: avisa y abre la sección que sí tiene', () => {
  const m = turno(comida, '¿Tienen empanadas de atún?');
  assert.equal(m.texto, 'Lo sentimos, «empanadas de atún» no lo trabajamos. Estas son las opciones que tenemos:');
  assert.equal(m.tipo, 'carta');
  assert.equal(m.categoria, 'emp');
  const p = turno(perfumeria, 'perfume de coco');
  assert.match(p.texto, /«perfume de coco» no lo trabajamos/);
  assert.equal(p.categoria, 'perf');
});

test('agotado hoy: lo dice y abre su sección; lo que sí hay sigue igual', () => {
  const m = turno(comida, 'quiero agua sin gas');
  assert.equal(m.texto, 'Lo sentimos, hoy Agua sin gas no está disponible. Puede elegir otra opción del menú.');
  assert.equal(m.categoria, 'beb');
  assert.doesNotMatch(turno(comida, 'quiero agua con gas').texto, /no lo trabajamos|no está disponible/);
  assert.doesNotMatch(turno(comida, 'quiero 2 empanadas de carne bien calientes').texto, /no lo trabajamos/);
  assert.doesNotMatch(turno(comida, 'empanda de carne').texto, /no lo trabajamos/); // error de tipeo
  assert.doesNotMatch(turno(perfumeria, 'perfume de vainilla').texto, /no lo trabajamos/);
});

test('si nombra una sección de la carta, la muestra', () => {
  assert.equal(categoriaNombrada(comida, '¿tienen postres?').id, 'pos');
  const m = turno(comida, '¿qué bebidas tienen?');
  assert.equal(m.tipo, 'carta');
  assert.equal(m.categoria, 'beb');
});

test('lo que no es un producto no se contesta con «no lo trabajamos»', () => {
  for (const texto of ['busco trabajo', 'necesito factura', 'Ayuda', '¿Tienen opciones sin TACC?', 'hola', 'gracias', 'que tienen en el menu', 'algo para comer']) {
    assert.equal(fueraDeCarta(comida, texto), null, texto);
    assert.doesNotMatch(turno(comida, texto).texto, /no lo trabajamos/, texto);
  }
});

test('la IA tiene la carta como base de conocimiento y la regla de no inventar', () => {
  const s = armarSistema({sucursal: local(true), privado: {}, catalogo: comida, estado: {carrito: []}});
  assert.match(s, /Responda SOLO con lo que está en la CARTA/);
  assert.match(s, /no lo trabajamos/);
  assert.match(s, /Agua sin gas · \$ 900 · AGOTADO HOY/);
  assert.doesNotMatch(s, /Tiramisú/); // lo oculto no se le da a la IA
  // El código general no nombra comercios.
  assert.doesNotMatch(readFileSync(new URL('../public/chat/motor.js', import.meta.url), 'utf8').split('Solo la carta del local')[1].split('Interpreta un pedido escrito')[0], /Mi Gusto|Munro|Torcuato/);
});
