/* global describe, it, cy */
// «Ver menú» es de la micro app (todos los locales): carta completa con precios, solo para mirar.
// El precio en amarillo con descuento en efectivo es exclusivo de Mi Gusto Munro y Don Torcuato:
// en cualquier otro local (como la demostración) no aparece.
describe('GESTLOK Chat · Ver menú', () => {
  it('muestra la carta sin empezar un pedido y sin el precio exclusivo de Mi Gusto', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.contains('button', 'Ver menú').click();
    cy.contains('.menu-fila', 'Pack 6 empanadas').contains('.precio', '6.500').should('be.visible');
    cy.get('.precio-efectivo').should('not.exist');
    cy.get('.menu-nota-efectivo').should('not.exist');
    cy.get('.menu-fila .menu-pasos').should('not.exist');
    cy.contains('.menu-pie button', 'Hacer un pedido').click();
    cy.get('.menu-fila .menu-pasos').should('have.length.greaterThan', 0);
  });
});
