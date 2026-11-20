/* global describe, it, cy, expect */
// GESTLOK Chat: chat público (celular) y panel de GESTLOK, sin red real (modo demostración y respuestas simuladas).
const FUNCION = '**/functions/v1/gestlok-chat';
const sinDesborde = () => cy.document().its('documentElement.scrollWidth').should('be.lte', 392);

describe('GESTLOK Chat · chat público', () => {
  it('toma un pedido completo en el celular (demostración)', () => {
    cy.viewport(390, 800);
    cy.visit('/chat/?demo=1');
    cy.get('.burbuja.asistente').should('contain.text', 'asistente de Tu Comercio');
    cy.get('#texto').type('2 empanadas de carne y 1 de jamón y queso{enter}');
    cy.get('.burbuja.asistente').last().should('contain.text', '2 × Empanada de carne').and('contain.text', '1 × Empanada de jamón y queso');
    cy.get('#barra-texto').should('contain.text', '3 productos');
    cy.get('#btn-carta').click();
    cy.get('#hoja').should('be.visible').contains('button', 'Pizza muzzarella').click();
    cy.get('#hoja').contains('label', 'Grande').click();
    cy.get('#hoja button[type=submit]').should('contain.text', '10.500').click();
    cy.get('.burbuja.asistente').last().should('contain.text', 'Pizza muzzarella (Grande)');
    cy.get('#btn-finalizar').click();
    cy.get('#hoja input[name=nombre]').type('Ana');
    cy.get('#hoja input[name=telefono]').type('11 5555 1234');
    cy.get('#hoja').contains('label', 'Envío').click();
    cy.get('#hoja button[type=submit]').click();
    cy.get('#hoja .error-form').should('contain.text', 'dirección');
    cy.get('#hoja input[name=direccion]').type('Mitre 200');
    cy.get('#hoja button[type=submit]').click();
    cy.get('#aviso-pedido').should('be.visible').and('contain.text', 'Pendiente de confirmación').and('not.contain.text','DEMO-0001');
    cy.get('.burbuja.asistente').last().should('contain.text', 'pendiente de revisión y confirmación').and('not.contain.text','DEMO-0001');
    cy.get('#aviso-pedido').should('not.contain.text', '¡Pedido listo!');
    cy.get('#barra-pedido').should('not.be.visible');
    sinDesborde();
  });

  it('agotados no se pueden elegir y los textos no se interpretan como HTML', () => {
    cy.viewport(390, 800);
    cy.visit('/chat/?demo=1');
    cy.get('.burbuja.asistente').should('be.visible');
    cy.get('#btn-carta').should('not.be.disabled').click();
    cy.get('#hoja').contains('button', 'Empanada de humita').should('be.disabled').and('contain.text', 'Agotado');
    cy.get('#hoja-cerrar').click();
    cy.get('#texto').type('<img src=x onerror="window.__xss=1"> hola{enter}');
    cy.get('.burbuja.cliente').last().should('contain.text', '<img src=x');
    cy.window().its('__xss').should('be.undefined');
  });

  it('habla con la función segura con slug, token y acción', () => {
    cy.viewport(390, 800);
    const cuerpos = [];
    cy.intercept('POST', FUNCION, req => {
      cuerpos.push(req.body);
      if (req.body.accion === 'abrir') {
        req.reply({ok: true, sucursal: {slug: 'mi-gusto-munro', nombre: 'Munro', empresa: 'Mi Gusto', horario: 'De 11 a 23', acepta_retiro: true,
          acepta_envio: false, envio_costo: 0, pedido_minimo: 0, medios_pago: ['efectivo']},
          catalogo: {categorias: [], productos: [{id: '9a000000-0000-4000-8000-000000000001', nombre: 'Empanada de carne', precio: 1000, activo: true, disponible: true, opciones: []}]},
          mensajes: [], nuevos: [{texto: '¡Hola! Soy el asistente de Mi Gusto Munro.', botones: [{id: 'carta', texto: 'Ver la carta'}]}], carrito: [], pedidos: []});
      } else {
        req.reply({ok: true, mensajes: [{texto: 'Agregué:\n• 2 × Empanada de carne'}], carrito: [{producto_id: '9a000000-0000-4000-8000-000000000001', cantidad: 2, opciones: {}}], pedido: null});
      }
    }).as('fn');
    cy.visit('/chat/?s=mi-gusto-munro');
    cy.wait('@fn');
    cy.get('#titulo').should('have.text', 'Mi Gusto · Munro');
    cy.get('#texto').type('2 de carne{enter}');
    cy.wait('@fn');
    cy.get('#barra-texto').should('contain.text', '2 productos · $ 2.000');
    cy.wrap(cuerpos).should(c => {
      expect(c[0]).to.include({slug: 'mi-gusto-munro', accion: 'abrir'});
      expect(c[0].token).to.match(/^[A-Za-z0-9_-]{43}$/);
      expect(c[1].token).to.eq(c[0].token);
      expect(c[1].entrada).to.deep.eq({texto: '2 de carne'});
    });
  });

  it('muestra la pausa y el chat inexistente', () => {
    cy.intercept('POST', FUNCION, {statusCode: 200, body: {ok: false, motivo: 'pausado', sucursal: {nombre: 'Don Torcuato', empresa: 'Mi Gusto'}}});
    cy.visit('/chat/?s=mi-gusto-torcuato');
    cy.contains('Chat en pausa');
    cy.contains('Ahora no estamos tomando pedidos por chat');
    cy.get('#redactar').should('not.be.visible');
    cy.visit('/chat/');
    cy.contains('Chat no encontrado');
  });
});

describe('GESTLOK Chat · panel', () => {
  it('integrado en GESTLOK abre directo el local pedido y sin cabecera propia', () => {
    cy.visit('/chat/panel/?demo=1&embed=1&local=torcuato');
    cy.get('#pestanas').should('be.visible');
  });

  it('sin sesión pide entrar a GESTLOK', () => {
    cy.visit('/chat/panel/');
    cy.contains('Entrá a GESTLOK');
  });

  it('el gerente marca terminado, rechaza con motivo, marca agotado y edita mensajes (demostración)', () => {
    cy.viewport(390, 820);
    cy.visit('/chat/panel/?demo=1');
    cy.get('.tarjeta.pendiente').should('contain.text', 'MM-0007').and('contain.text', 'Ana Pérez');
    cy.get('#globo').should('have.text', '1');
    cy.contains('button', 'Rechazar…').click();
    cy.get('.rechazo .boton.peligro').click();
    cy.get('#aviso').should('contain.text', 'motivo');
    cy.get('.acciones .boton.principal').should('have.text', 'Confirmar y pasar a preparación').click();
    cy.contains('No hay pedidos pendientes de confirmación');
    cy.contains('button', 'En preparación').click();
    cy.get('.tarjeta.confirmado').should('contain.text', 'MM-0007');
    cy.get('.acciones .boton.principal').should('have.text', 'Pedido terminado');
    cy.get('.acciones .boton.principal').click();
    cy.get('#aviso').should('contain.text', 'MM-0007 terminado');
    cy.contains('No hay pedidos para mostrar');
    cy.get('[data-p=stock]').click();
    cy.contains('.stock-cabecera', 'Empanadas').find('button.stock-desplegar').click();
    cy.contains('.stock-item', 'Empanada de carne').find('input[type="checkbox"]').uncheck({force:true});
    cy.get('#aviso').should('contain.text', 'Empanada de carne agotado');
    cy.get('[data-p=mensajes]').click();
    cy.contains('label', 'Pedido terminado · retiro').find('textarea').clear().type('Listo {codigo}, pasá cuando quieras', {parseSpecialCharSequences: false});
    cy.get('.vista-previa').eq(0).should('contain.text', 'Listo MM-0012, pasá cuando quieras');
    cy.contains('label', 'Indicaciones para la IA').find('textarea').type('Tratá de vos.');
    cy.contains('button', 'Guardar mensajes').click();
    cy.get('#aviso').should('contain.text', 'Mensajes guardados');
    cy.get('[data-p=ajustes]').click();
    cy.get('.enlace-publico a').should('have.attr', 'href', 'https://gestlok.com.ar/chat/?s=mi-gusto-munro');
    cy.get('.qr img').should('be.visible');
    sinDesborde();
  });
});

describe('GESTLOK Chat · historial de demanda del local',()=>{
  it('muestra pedidos diarios por retiro, delivery y programación sin datos de clientes',()=>{
    cy.viewport(390,844);
    cy.visit('/chat/panel/?demo=1');
    cy.get('[data-p="reporte"]').click();
    cy.contains('Historial diario · Pedidos por GESTLOK Chat').should('be.visible');
    cy.contains('.reporte-cifra','Pedidos recibidos').should('contain.text','2');
    cy.contains('.reporte-cifra','Retiro').should('contain.text','1');
    cy.contains('.reporte-cifra','Delivery').should('contain.text','1');
    cy.contains('.reporte-cifra','Programados').should('contain.text','1');
    cy.get('.reporte-dia').first().should('contain.text','Retiro: 1').and('contain.text','Delivery: 1');
    cy.contains('button','Últimos 7 días').click();
    cy.get('.reporte-dia').should('have.length',1);
  });
});
