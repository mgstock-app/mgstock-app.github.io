/* global describe, it, cy, Cypress */
import { abrirLocal } from '../helpers/abrir-local';
// Todo GESTLOK, con datos ficticios: el navegador no ofrece listas de valores anteriores,
// salvo el email y la contraseña del ingreso (gestor de contraseñas).
describe('GESTLOK · sin sugerencias del navegador en los formularios', () => {
  Cypress.on('uncaught:exception', (error) => {
    if (error.message.includes('Minified React error #418')) return false;
  });
  it('ingreso conserva email y contraseña; los formularios de carga quedan sin sugerencias', () => {
    cy.task('mockSupabase').then((fake) => {
      cy.intercept('GET', '**/vendor/supabase.js', { statusCode: 200, headers: { 'content-type': 'application/javascript' }, body: fake }).as('mock');
    });
    cy.intercept('**/*.supabase.co/**', { forceNetworkError: true });
    cy.visit('/');
    cy.wait('@mock');
    cy.get('.gl-intro', { timeout: 15000 }).should('not.be.visible');
    cy.get('#au-email').should('have.attr', 'autocomplete', 'email');
    cy.get('#au-pass').should('have.attr', 'autocomplete', 'current-password');
    cy.get('#au-in').should('not.have.attr', 'autocomplete');
    cy.get('#au-email').clear().type('dueno@example.com');
    cy.get('#au-pass').type('secreto1', { log: false });
    cy.get('#au-in button[type="submit"]').click();
    abrirLocal('munro');
    // Vencimientos: formulario de carga nueva.
    cy.get('#snav [data-go="vencimientos"]').click();
    cy.get('[data-up-action="new"]').click();
    cy.get('#gl-exp-form').should('have.attr', 'autocomplete', 'off');
    cy.get('#gl-exp-name').should('have.attr', 'autocomplete', 'off');
    // Pagos Online en Munro y en Torcuato.
    for (const local of ['munro', 'torcuato']) {
      if (local === 'torcuato') { cy.get('#snav [data-act="locales"]').click(); abrirLocal('torcuato'); }
      cy.get('#snav > button[data-go="cierre-online"]', { timeout: 15000 }).click();
      cy.get('#mg-online-form', { timeout: 15000 }).should('have.attr', 'autocomplete', 'off');
      cy.get('#mg-online-form input[name="comanda"]').should('have.attr', 'autocomplete', 'off');
      cy.get('#mg-online-form input[name="amount"]').should('have.attr', 'autocomplete', 'off');
    }
  });
});
