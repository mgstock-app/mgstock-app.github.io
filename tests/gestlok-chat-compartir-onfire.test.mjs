// Mi Gusto · promos para compartir (pizza + empanadas) y Jueves On Fire (último jueves del mes desde las 18:00).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../supabase/functions/gestlok-chat/motor.js';

const emp = total => ({id: 'empanadas', nombre: 'Empanadas', tipo: 'cantidad', total, obligatorio: true, valores: [
  {id: 'carne', nombre: 'Carne', extra: 0, producto_id: 'e1'}, {id: 'pollo', nombre: 'Pollo', extra: 0, producto_id: 'e2'},
  {id: 'humita', nombre: 'Humita', extra: 0, producto_id: 'e3'}]});
const sal = total => ({id: 'salsas', nombre: 'Salsas', tipo: 'cantidad', total, obligatorio: true, valores: [
  {id: 'criolla', nombre: 'Criolla', extra: 0}, {id: 'cheddar', nombre: 'Cheddar', extra: 0}]});
const SUC = {slug: 'mi-gusto-munro', nombre: 'Munro', empresa: 'Mi Gusto', acepta_retiro: true, acepta_envio: true, envio_costo: 4000,
  medios_pago: ['efectivo', 'transferencia', 'debito'], medios_pago_retiro: ['efectivo', 'debito'], medios_pago_envio: ['efectivo', 'transferencia']};
const CAT = {
  categorias: [{id: 'c-emp', nombre: 'Empanadas clásicas'}, {id: 'c-promo', nombre: 'Promociones de empanadas'},
    {id: 'c-comp', nombre: 'Promociones para compartir'}, {id: 'c-pizza', nombre: 'Pizzas de 8 porciones'}, {id: 'c-beb', nombre: 'Bebidas'}],
  productos: [
    {id: 'e1', categoria_id: 'c-emp', nombre: 'Carne', precio: 4900, activo: true, disponible: true, opciones: []},
    {id: 'e2', categoria_id: 'c-emp', nombre: 'Pollo', precio: 4900, activo: true, disponible: true, opciones: []},
    {id: 'e3', categoria_id: 'c-emp', nombre: 'Humita', precio: 4900, activo: true, disponible: false, opciones: []},
    {id: 'p2', categoria_id: 'c-promo', nombre: 'Pack 2 empanadas + 1 salsa', precio: 10900, activo: true, disponible: true, opciones: [emp(2), sal(1)]},
    {id: 'p6', categoria_id: 'c-promo', nombre: 'Pack 6 empanadas + 2 salsas', precio: 31500, activo: true, disponible: true, opciones: [emp(6), sal(2)]},
    {id: 'p12', categoria_id: 'c-promo', nombre: 'Pack 12 empanadas + 3 salsas', precio: 52900, activo: true, disponible: true, opciones: [emp(12), sal(3)]},
    {id: 'fire', categoria_id: 'c-promo', nombre: 'Jueves On Fire · 12 empanadas + 3 salsas', precio: 39500, activo: true, disponible: true, opciones: [emp(12), sal(3)]},
    {id: 'pareja', categoria_id: 'c-comp', nombre: 'Promo Pareja · ½ Muzzarella + ½ Jamón y morrón + 2 empanadas', precio: 32900, activo: true, disponible: true, opciones: [emp(2)]},
    {id: 'clasica', categoria_id: 'c-comp', nombre: 'Promo Clásica · Muzzarella grande + 6 empanadas + 2 salsas', precio: 46900, activo: true, disponible: true, opciones: [emp(6), sal(2)]},
    {id: 'muzza', categoria_id: 'c-pizza', nombre: 'Pizza 8 porciones · Muzzarella', precio: 17900, activo: true, disponible: true, opciones: [
      {id: 'adicional', tipo: 'una', nombre: 'Adicional', obligatorio: false, valores: [{id: 'jamon', nombre: 'Jamón adicional', extra: 3000}]}]},
    {id: 'coca', categoria_id: 'c-beb', nombre: 'Coca-Cola 1.5 L', precio: 4500, activo: true, disponible: true, opciones: []},
  ]};
const NORMAL = new Date('2026-11-24T20:00:00-03:00');
const FIRE = new Date('2026-11-26T20:00:00-03:00');

test('Jueves On Fire: último jueves de cada mes desde las 18:00 de Argentina', () => {
  assert.equal(M.esNocheOnFire(new Date('2026-11-26T17:59:00-03:00')), false);
  assert.equal(M.esNocheOnFire(new Date('2026-11-26T18:00:00-03:00')), true);
  assert.equal(M.esNocheOnFire(new Date('2026-11-26T23:30:00-03:00')), true);
  assert.equal(M.esNocheOnFire(new Date('2026-11-27T00:10:00-03:00')), false);
  assert.equal(M.esNocheOnFire(new Date('2026-11-19T20:00:00-03:00')), false, 'no es el último jueves');
  assert.equal(M.esNocheOnFire(new Date('2026-12-31T19:00:00-03:00')), true);
  assert.equal(M.esNocheOnFire(new Date('2027-02-25T19:00:00-03:00')), true);
  assert.equal(M.esNocheOnFire(new Date('2027-02-18T19:00:00-03:00')), false);
});

test('fuera del Jueves On Fire la promo On Fire no aparece y el resto sigue igual', () => {
  const c = M.carteleraDelDia(SUC, CAT, NORMAL);
  assert.equal(c.clave, 'normal');
  assert.ok(!c.catalogo.productos.some(M.esPromoOnFire));
  assert.ok(c.catalogo.productos.some(p => p.id === 'p12'));
  assert.deepEqual(M.pagosDe(c.sucursal, 'envio'), ['efectivo', 'transferencia']);
  assert.equal(c.sucursal.especial, undefined);
});

test('Jueves On Fire: solo la promo On Fire, variedades disponibles y pago en efectivo', () => {
  const c = M.carteleraDelDia(SUC, CAT, FIRE);
  assert.equal(c.clave, 'onfire:2026-11-26');
  assert.deepEqual(c.catalogo.productos.map(p => p.id), ['fire']);
  assert.deepEqual(c.catalogo.categorias.map(x => x.id), ['c-promo']);
  assert.deepEqual(c.catalogo.productos[0].opciones[0].valores.map(v => v.id), ['carne', 'pollo'], 'la humita agotada no se ofrece');
  assert.deepEqual(M.pagosDe(c.sucursal, 'retiro'), ['efectivo']);
  assert.deepEqual(M.pagosDe(c.sucursal, 'envio'), ['efectivo']);
  assert.match(c.sucursal.especial.texto, /Jueves On Fire: 12 empanadas \+ 3 salsas a \$ 39\.500.*Envío a domicilio con costo adicional\. Pago solo en efectivo\./);
  const saludo = M.responder({sucursal: c.sucursal, catalogo: c.catalogo, estado: null, entrada: {inicio: true}, ahora: FIRE});
  assert.match(saludo.mensajes[0].texto, /Hoy es Jueves On Fire/);
  assert.match(saludo.mensajes[0].guia, /Hoy es Jueves On Fire/);
  const docena = M.responder({sucursal: c.sucursal, catalogo: c.catalogo, estado: null, entrada: {texto: 'quiero una docena de empanadas'}});
  assert.deepEqual(docena.mensajes[0].botones.map(b => b.id), ['elegir:fire:1', 'carta']);
  // El Pack 12 de precio normal no se puede pedir esa noche.
  const pack = M.responder({sucursal: c.sucursal, catalogo: c.catalogo, estado: null,
    entrada: {agregar_varios: [{producto_id: 'p12', cantidad: 1, opciones: {empanadas: {carne: 12}, salsas: {criolla: 3}}}], lote_id: 'x'}});
  assert.equal(pack.estado.carrito.length, 0);
});

test('Jueves On Fire: rechaza otro medio de pago y crea el pedido en efectivo', () => {
  const c = M.carteleraDelDia(SUC, CAT, FIRE);
  const linea = {producto_id: 'fire', cantidad: 1, opciones: {empanadas: {carne: 6, pollo: 6}, salsas: {criolla: 2, cheddar: 1}}, nota: ''};
  const estado = {...M.estadoInicial(), carrito: [linea], promo_ofrecida: 'x', sugerido: true};
  const datos = {nombre: 'Ana', telefono: '1122334455', entrega: 'envio', direccion: 'Mitre 2500', medio_pago: 'transferencia'};
  const mal = M.responder({sucursal: c.sucursal, catalogo: c.catalogo, estado, entrada: {datos}});
  assert.equal(mal.accion, undefined);
  assert.match(mal.mensajes[0].texto, /solo en efectivo/);
  const bien = M.responder({sucursal: c.sucursal, catalogo: c.catalogo, estado, entrada: {datos: {...datos, medio_pago: 'efectivo'}}});
  assert.equal(bien.accion.tipo, 'crear_pedido');
  assert.equal(bien.accion.pedido.medio_pago, 'efectivo');
  assert.equal(M.totalCarrito(c.catalogo, bien.estado.carrito), 39500);
});

test('al empezar el Jueves On Fire se avisa que se quitó lo que no es la promo', () => {
  const antes = {...M.estadoInicial(), carrito: [{producto_id: 'p12', cantidad: 1, opciones: {empanadas: {carne: 12}, salsas: {criolla: 3}}, nota: ''}]};
  const c = M.carteleraDelDia(SUC, CAT, FIRE);
  const r = M.responder({sucursal: c.sucursal, catalogo: c.catalogo, estado: antes, entrada: {boton: 'carrito'}});
  assert.match(r.mensajes[0].texto, /Ahora rige el Jueves On Fire: quitamos de su pedido/);
  assert.equal(r.estado.carrito.length, 0);
});

test('Jueves On Fire solo en Mi Gusto y no para pedidos programados de otro día', () => {
  assert.equal(M.carteleraDelDia({...SUC, slug: 'cafe-demo'}, CAT, FIRE).clave, 'normal');
  const cerradoHastaManana = {...SUC, atencion: {habilitado: true, abierto: false, proxima_apertura: '2026-11-27T14:00:00+00:00'}};
  assert.equal(M.carteleraDelDia(cerradoHastaManana, CAT, new Date('2026-11-26T23:30:00-03:00')).clave, 'normal');
  const abreHoy = {...SUC, atencion: {habilitado: true, abierto: false, proxima_apertura: '2026-11-26T22:00:00+00:00'}};
  assert.equal(M.carteleraDelDia(abreHoy, CAT, new Date('2026-11-26T18:30:00-03:00')).clave, 'onfire:2026-11-26');
});

test('promos para compartir: no se ofrecen por empanadas sueltas; sí cuando se pide pizza', () => {
  const c = M.carteleraDelDia(SUC, CAT, NORMAL);
  assert.ok(M.promoParaCompartir(c.catalogo, CAT.productos.find(p => p.id === 'clasica')));
  assert.ok(!M.promoParaCompartir(c.catalogo, CAT.productos.find(p => p.id === 'p6')));
  const sueltas = [{producto_id: 'e1', cantidad: 1, opciones: {}, nota: ''}, {producto_id: 'e2', cantidad: 1, opciones: {}, nota: ''}];
  assert.deepEqual(M.promosParaCarrito(c.catalogo, sueltas).map(x => x.promo.id), ['p2']);
  const seis = M.responder({sucursal: c.sucursal, catalogo: c.catalogo, estado: null, entrada: {texto: 'quiero 6 empanadas'}});
  assert.deepEqual(seis.mensajes[0].botones.map(b => b.id), ['elegir:p6:1', 'carta']);
  const pizza = M.responder({sucursal: c.sucursal, catalogo: c.catalogo, estado: null, entrada: {texto: 'tienen promo con pizza y empanadas?'}});
  assert.deepEqual(pizza.mensajes[0].botones.map(b => b.id), ['elegir:pareja:1', 'elegir:clasica:1', 'carta']);
  assert.equal(M.validarLinea(c.catalogo, {producto_id: 'clasica', cantidad: 1,
    opciones: {empanadas: {carne: 3, pollo: 3}, salsas: {criolla: 1, cheddar: 1}}}), '');
  assert.equal(M.importeLinea(c.catalogo, {producto_id: 'pareja', cantidad: 1, opciones: {empanadas: {carne: 2}}}), 32900);
});

test('pizza con adicional opcional se puede sumar con + (sin elegir adicional)', () => {
  assert.equal(M.validarLinea(CAT, {producto_id: 'muzza', cantidad: 2, opciones: {}}), '');
  assert.equal(M.importeLinea(CAT, {producto_id: 'muzza', cantidad: 1, opciones: {adicional: ['jamon']}}), 20900);
});
