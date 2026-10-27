/* global Cypress, describe, it, cy, expect */
import { abrirLocal } from '../helpers/abrir-local';
// Pruebas aisladas: Supabase falso; nunca consultan ni escriben datos reales.
function launch() {
  cy.task('mockSupabase').then(mock => {
    cy.intercept('GET', '**/vendor/supabase.js', {statusCode:200, headers:{'content-type':'application/javascript'}, body:mock}).as('fakeSupabase');
  });
  cy.intercept('**/*.supabase.co/**', {forceNetworkError:true});
  cy.visit('/');
  cy.wait('@fakeSupabase');
  cy.get('.gl-intro', {timeout:12000}).should('not.be.visible');
}
const login = email => {
  cy.get('#au-in').should('be.visible');
  cy.get('#au-email').clear().type(email);
  cy.get('#au-pass').type('secreto1', {log:false});
  cy.get('#au-in button[type="submit"]').click();
};

describe('Inicio compacto, «Regresar» y email recordado', () => {
  Cypress.on('uncaught:exception', error => {
    if (error.message.includes('Minified React error #418')) return false;
  });

  it('en una PC de 1920×1080 se ven las tarjetas y los accesos generales sin desplazarse', () => {
    cy.viewport(1920, 1080); launch(); login('dueno@example.com');
    cy.get('#hub .gl-owner-quick').should('be.visible').then($q => {
      expect($q[0].getBoundingClientRect().bottom).to.be.at.most(1080);
    });
  });

  it('desde una tarjeta, «Regresar» vuelve al inicio de tarjetas', () => {
    launch(); login('dueno@example.com'); abrirLocal('munro');
    cy.get('#hub').should('not.be.visible');
    cy.get('#btn-regresar').should('be.visible').click();
    cy.get('#hub .gl-owner-areas').should('be.visible');
    abrirLocal('munro');
    cy.get('#snav [data-act="locales"]').should('contain.text', 'Regresar').click({force:true});
    cy.get('#hub .gl-owner-areas').should('be.visible');
  });

  it('el gerente de un solo local también puede regresar', () => {
    launch(); login('gerente.munro@example.com');
    cy.get('#btn-regresar').click();
    cy.get('#hub').should('be.visible');
  });

  it('al volver a entrar, el email de la última sesión ya está completo (la contraseña no)', () => {
    launch(); login('gerente.munro@example.com');
    cy.window().its('localStorage').invoke('getItem', 'gestlok:ultimo-email').should('eq', 'gerente.munro@example.com');
    cy.visit('/');
    cy.get('#au-in', {timeout:15000}).should('be.visible');
    cy.get('#au-email').should('have.value', 'gerente.munro@example.com');
    cy.get('#au-pass').should('have.value', '');
  });
});
