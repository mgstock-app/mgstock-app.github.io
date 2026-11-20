describe('GESTLOK Chat · menú interactivo', () => {
  it('arma un pedido visual, lo revisa y recién entonces lo envía al asistente', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.get('#btn-carta').should('not.be.disabled').click();

    cy.get('#hoja .producto').contains('Empanada de carne').click();
    cy.get('#hoja form .cantidad button[aria-label="Más"]').click();
    cy.get('#hoja form button[type=submit]').click();
    cy.get('#hoja .menu-pie-texto').should('contain.text', '2 productos seleccionados');
    cy.get('#hoja .producto').contains('Empanada de jamón y queso').click();
    cy.get('#hoja form button[type=submit]').click();
    cy.get('#hoja .menu-pie-texto').should('contain.text', '3 productos seleccionados');

    // Todavía no se enviaron mensajes de productos al asistente.
    cy.get('.burbuja.cliente').should('not.exist');
    cy.get('#hoja .menu-pie button').contains('Revisar selección').click();
    cy.get('#hoja .menu-revision').should('contain.text','2 × Empanada de carne')
      .and('contain.text', '1 × Empanada de jamón y queso');

    cy.get('#hoja .menu-revision button').contains('Enviar selección al asistente').click();
    cy.get('.burbuja.asistente', {timeout: 12000}).last()
      .should('contain.text', 'Recibí tu selección del menú');
    cy.get('#barra-texto').should('contain.text', '3 productos');
    cy.get('#hoja').should('not.be.visible');

    // Registrar el pedido requiere una acción posterior y datos del cliente.
    cy.get('#btn-finalizar').should('contain.text', 'Finalizar').click();
    cy.get('#hoja').should('be.visible');
    cy.get('#hoja').should('contain.text', 'Tus datos');
    cy.get('#aviso-pedido').should('not.be.visible');
  });
});