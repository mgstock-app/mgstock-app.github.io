/* global Cypress, cy, describe, it */
import { abrirLocal } from '../helpers/abrir-local';
// Panel de creadora: consulta en solo lectura por defecto; la edición se habilita con motivo y por tiempo limitado.
function login(email) {
  cy.task('mockSupabase').then(body => cy.intercept('GET', '**/vendor/supabase.js', { statusCode: 200, headers: { 'content-type': 'application/javascript' }, body }).as('fake'));
  cy.intercept('**/*.supabase.co/**', { forceNetworkError: true });
  cy.visit('/'); cy.wait('@fake');
  cy.get('.gl-intro', { timeout: 12000 }).should('not.be.visible');
  cy.get('#au-email').type(email); cy.get('#au-pass').type('secreto1', { log: false }); cy.get('#au-in button[type="submit"]').click();
}
describe('Creadora: edición permanente e inicio actualizado', () => {
  Cypress.on('uncaught:exception', e => { if (e.message.includes('Minified React error #418')) return false; });
  for(const local of ['munro','torcuato']) it('tarjetas y edición permanente en '+local, () => {
    login('kmu15lopez@gmail.com');
    cy.window().then(w=>{w.__staffModule=true;});
    cy.get('#hub [data-act="local"][data-id="'+local+'"]').first().click();
    cy.get('.gl-creator-mode').should('contain.text','Edición sin límite de tiempo');
    cy.get('#me').should('not.contain.text','Solo ver');
    cy.get('#view .gl-owner-business').should('be.visible');
    cy.get('#view [data-owner-area-staff]').should('be.visible');
    cy.get('[data-creator-mode]').should('not.exist');
    cy.get('#view [data-owner-nav="business"]').click();
    cy.get('#view .gl-home-essential').should('be.visible');
    cy.get('#snav [data-go="inicio"]').click();
    cy.get('#view .gl-owner-business').should('be.visible');
    cy.get('#view [data-owner-area-staff]').click();
    cy.location('pathname').should('eq','/empleados/');
    cy.get('.gestlok-module-back').should('have.attr','href','/');
  });
  it('la dueña sigue editando como siempre y no ve el aviso de la creadora', () => {
    login('dueno@example.com');
    abrirLocal('munro');
    cy.get('#snav').should('be.visible');
    cy.get('.gl-creator-mode').should('not.exist');
    cy.get('#me').should('not.contain.text', 'Solo ver');
  });
});
