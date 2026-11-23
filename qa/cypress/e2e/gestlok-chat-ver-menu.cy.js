/* global describe, it, cy */
// «Ver menú»: carta completa con precios, solo para mirar. Las promos muestran además,
// en amarillo, el precio pagando en efectivo con envío (descuento del local).
describe('GESTLOK Chat · Ver menú y precio en efectivo de las promos', () => {
  it('muestra la carta sin empezar un pedido y ambos precios en las promos', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.contains('button', 'Ver menú').click();
    cy.contains('.menu-nota-efectivo', 'efectivo con envío').should('be.visible');
    cy.contains('.menu-fila', 'Pack 6 empanadas').within(() => {
      cy.contains('.precio', '6.500').should('be.visible');
      cy.contains('.precio-efectivo', '5.850').should('be.visible');
    });
    cy.contains('.menu-fila', 'Flan casero').find('.precio-efectivo').should('not.exist');
    cy.get('.menu-fila .menu-pasos').should('not.exist');
    cy.contains('.menu-pie button', 'Hacer un pedido').click();
    cy.get('.menu-fila .menu-pasos').should('have.length.greaterThan', 0);
    cy.contains('.menu-fila', 'Pack 6 empanadas').contains('button', 'Elegir').click();
    cy.contains('.precio-efectivo', 'pagando en efectivo con envío').should('be.visible');
  });
});
