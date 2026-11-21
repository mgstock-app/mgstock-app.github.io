import test from 'node:test';
import assert from 'node:assert/strict';
import {bienvenidaGuiada, botonesBienvenida, guiaBotones, momentoDelDia, responder} from '../public/chat/motor.js';
import {armarSistemaBienvenida} from '../supabase/functions/gestlok-chat/ia.js';

// Carta mínima de Mi Gusto: dos empanadas sueltas y una promo «elegir 3 unidades + 1 salsa».
const promo = {id: 'pk3', nombre: 'Pack 3 empanadas + 1 salsa', precio: 15900, categoria_id: 'promos', activo: true, disponible: true,
  opciones: [
    {id: 'emp', nombre: 'Empanadas', tipo: 'cantidad', total: 3, obligatorio: true, valores: [
      {id: 'v-carne', nombre: 'Carne a cuchillo', producto_id: 'e-carne'}, {id: 'v-jyq', nombre: 'Jamón y queso', producto_id: 'e-jyq'}]},
    {id: 'sal', nombre: 'Salsas', tipo: 'cantidad', total: 1, obligatorio: true, valores: [{id: 'criolla', nombre: 'Criolla'}]}]};
const catalogo = {categorias: [{id: 'promos', nombre: 'Promociones'}, {id: 'emp', nombre: 'Empanadas'}], productos: [
  {id: 'e-carne', nombre: 'Carne a cuchillo', precio: 5600, categoria_id: 'emp', activo: true, disponible: true, opciones: []},
  {id: 'e-jyq', nombre: 'Jamón y queso', precio: 4900, categoria_id: 'emp', activo: true, disponible: true, opciones: []},
  promo]};
const noche = new Date('2026-11-20T21:40:00-03:00');
const local = slug => ({slug, empresa: 'Mi Gusto', nombre: slug === 'mi-gusto-munro' ? 'Munro' : 'Don Torcuato',
  bienvenida: '¡Hola! Le damos la bienvenida a Mi Gusto ' + (slug === 'mi-gusto-munro' ? 'Munro' : 'Don Torcuato') + '.',
  acepta_retiro: true, acepta_envio: true, medios_pago: ['efectivo']});

test('saludo según la hora de Argentina', () => {
  assert.equal(momentoDelDia(new Date('2026-11-20T09:00:00-03:00')), 'Buenos días');
  assert.equal(momentoDelDia(new Date('2026-11-20T15:00:00-03:00')), 'Buenas tardes');
  assert.equal(momentoDelDia(noche), 'Buenas noches');
});

test('Munro y Don Torcuato: el asistente saluda e indica los botones, con «Hacer un pedido» primero', () => {
  for (const slug of ['mi-gusto-munro', 'mi-gusto-torcuato']) {
    const s = local(slug);
    const r = responder({sucursal: s, catalogo, estado: null, entrada: {inicio: true}, ahora: noche});
    const m = r.mensajes[0];
    assert.deepEqual(m.botones.map(b => b.texto), ['Hacer un pedido', 'Ver promociones', 'Horario y envío', 'Medios de pago', 'Ayuda con mi pedido']);
    assert.equal(m.texto, '¡Buenas noches! Le damos la bienvenida a ' + s.empresa + ' ' + s.nombre + '.\n' +
      'Para hacer su pedido, toque «Hacer un pedido» aquí abajo. También puede tocar «Ver promociones», «Horario y envío», «Medios de pago» o «Ayuda con mi pedido».');
    assert.equal(m.guia, guiaBotones(m.botones));
    assert.doesNotMatch(m.texto, /Armar mi pedido|promociones disponibles de este local/);
  }
});

test('otros comercios: sin menú interactivo no aparece «Ver promociones»; texto del dueño se respeta', () => {
  const s = {slug: 'cafe-centro', empresa: 'Café Brío', nombre: 'Centro', bienvenida: 'Hola, soy Sofi y lo ayudo con su pedido.'};
  const botones = botonesBienvenida(s, catalogo);
  assert.deepEqual(botones.map(b => b.id), ['carta', 'horario', 'pago', 'soporte']);
  assert.equal(bienvenidaGuiada(s, botones, noche).split('\n')[0], '¡Buenas noches! Soy Sofi y lo ayudo con su pedido.');
  assert.equal(bienvenidaGuiada({empresa: 'Café Brío', nombre: 'Centro'}, botones, noche).split('\n')[0],
    '¡Buenas noches! Le damos la bienvenida a Café Brío Centro.');
  assert.equal(bienvenidaGuiada({empresa: 'Café Brío', nombre: 'Centro', bienvenida: 'Bienvenido a Café Brío.'}, botones, noche).split('\n')[0],
    '¡Buenas noches! Bienvenido a Café Brío.');
});

test('local cerrado: se mantiene el aviso de próxima apertura con sus botones', () => {
  const s = {...local('mi-gusto-munro'), atencion: {habilitado: true, abierto: false, proximo_texto: 'mañana a las 11:00'}};
  const m = responder({sucursal: s, catalogo, estado: null, entrada: {inicio: true}, ahora: noche}).mensajes[0];
  assert.match(m.texto, /local está cerrado/);
  assert.deepEqual(m.botones.map(b => b.id), ['programar_si', 'programar_no', 'soporte']);
});

test('con IA: la IA saluda y no inventa nombres de botones (los agrega el sistema debajo)', () => {
  const sistema = armarSistemaBienvenida({sucursal: local('mi-gusto-munro'), privado: {}, ahora: noche});
  assert.match(sistema, /Empiece con «Buenas noches»/);
  assert.match(sistema, /No escriba los nombres de los botones/);
  assert.doesNotMatch(sistema, /Ver menú/);
});

test('promo con empanadas sueltas: la ofrece, abre el selector cargado y las sueltas pasan a la promo', () => {
  const s = local('mi-gusto-munro');
  const turno = (estado, entrada) => responder({sucursal: s, catalogo, estado, entrada, mensajes: {}});
  const sueltas = turno(null, {agregar_varios: [{producto_id: 'e-carne', cantidad: 3, opciones: {}, nota: ''}],
    lote_id: '9b0f6b0e-8f9f-4f55-9c1a-0d3c1f9d8a11'});
  const oferta = sueltas.mensajes.find(m => (m.botones || []).some(b => b.id === 'promo:pk3'));
  assert.ok(oferta, 'ofrece la promo');
  assert.match(oferta.texto, /Pack 3 empanadas \+ 1 salsa/);
  const abrir = turno(sueltas.estado, {boton: 'promo:pk3'});
  assert.equal(abrir.mensajes[0].tipo, 'producto');
  assert.deepEqual(abrir.mensajes[0].opciones, {emp: {'v-carne': 3}});
  const armada = turno(abrir.estado, {agregar_varios: [{producto_id: 'pk3', cantidad: 1, opciones: {emp: {'v-carne': 3}, sal: {criolla: 1}}, nota: ''}],
    lote_id: '1c7d9a52-3e44-4f0b-9a7e-5b2f8c6d4e21'});
  assert.deepEqual(armada.estado.carrito.map(l => [l.producto_id, l.cantidad]), [['pk3', 1]]);
  assert.match(armada.mensajes[0].texto, /pasaron a la promoción/);
});
