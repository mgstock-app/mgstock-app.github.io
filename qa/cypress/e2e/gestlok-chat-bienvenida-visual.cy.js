/* global describe, it, cy */
// Regresión visual de la bienvenida; el chat sigue siendo funcional y multiempresa.
describe('GESTLOK Chat · bienvenida simple', () => {
  it('muestra el saludo corto en negrita y destaca el menú sin instrucciones largas', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.get('#app').should('have.attr', 'aria-busy', 'false');
    cy.get('#subtitulo').should('have.text', 'Chat de atención y pedidos');
    cy.get('.chat-bienvenida .bienvenida-titulo')
      .should('have.text', '¡Hola! ¿En qué podemos ayudarte hoy?')
      .and('have.css', 'font-weight', '800');
    cy.get('.chat-bienvenida').should('not.contain', 'Para hacer su pedido, toque');
    cy.get('#texto').should('have.attr', 'placeholder', 'Escribí tu mensaje…');
    cy.get('.chips button.chip-hacer-pedido').first().should('be.visible').click();
    cy.get('#hoja-titulo').should('have.text', 'Menú');
  });

  it('al volver a abrir, transforma solo el primer saludo y conserva el historial', () => {
    cy.viewport(360, 740);
    cy.intercept('POST', '**/functions/v1/gestlok-chat', req => {
      if (req.body.accion !== 'abrir') return req.reply({ok: true, pedidos: [], mensajes_local: []});
      req.reply({ok: true,
        sucursal: {slug: 'mi-gusto-munro', empresa: 'Mi Gusto', nombre: 'Munro', menu_interactivo: true},
        catalogo: {categorias: [], productos: []},
        mensajes: [
          {rol: 'asistente', texto: '¡Buenas tardes! Le damos la bienvenida.\nPara hacer su pedido, toque «Hacer un pedido» aquí abajo.'},
          {rol: 'cliente', texto: 'Hola, quiero hacer una consulta.'},
          {rol: 'local', texto: 'Buenas tardes, ¿en qué podemos ayudarle?'},
        ], nuevos: [], carrito: [], pedidos: []});
    });
    cy.visit('/chat/?s=mi-gusto-munro');
    cy.get('.chat-bienvenida .bienvenida-titulo').should('have.text', '¡Hola! ¿En qué podemos ayudarte hoy?');
    cy.get('.chat-bienvenida').should('not.contain', 'Para hacer su pedido, toque');
    cy.get('.burbuja.cliente').should('contain', 'Hola, quiero hacer una consulta.');
    cy.get('.burbuja.local').should('contain', 'Buenas tardes');
    cy.get('#mensajes').should('not.have.css', 'overflow-x', 'scroll');
  });

  it('si el local está cerrado, no oculta el aviso ni los botones para programar', () => {
    cy.viewport(390, 844);
    cy.intercept('POST', '**/functions/v1/gestlok-chat', req => {
      if (req.body.accion !== 'abrir') return req.reply({ok: true, pedidos: [], mensajes_local: []});
      req.reply({ok: true,
        sucursal: {slug: 'mi-gusto-torcuato', empresa: 'Mi Gusto', nombre: 'Don Torcuato'},
        catalogo: {categorias: [], productos: []}, mensajes: [], carrito: [], pedidos: [],
        nuevos: [{texto: 'Gracias por comunicarse. Por el momento nuestro local está cerrado. Abriremos nuevamente mañana a las 11.',
          botones: [{id: 'programar_si', texto: 'Sí, dejar pedido programado'},
            {id: 'programar_no', texto: 'No, gracias'}]}]});
    });
    cy.visit('/chat/?s=mi-gusto-torcuato');
    cy.get('.chat-bienvenida').should('not.exist');
    cy.get('.burbuja.asistente').should('contain', 'local está cerrado');
    cy.contains('.chip', 'Sí, dejar pedido programado').should('be.visible');
  });
});
