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
describe('Creadora: solo lectura por defecto', () => {
  Cypress.on('uncaught:exception', e => { if (e.message.includes('Minified React error #418')) return false; });
  it('entra a un local en modo consulta y no puede guardar hasta habilitar la edición', () => {
    login('kmu15lopez@gmail.com');
    cy.get('#hub .gl-admin', { timeout: 12000 }).should('be.visible');
    cy.get('#hub [data-act="local"][data-id="munro"]').first().click();
    cy.get('.gl-creator-mode').should('contain.text', 'Modo consulta: solo lectura');
    cy.get('#me').should('contain.text', 'Solo ver');
    cy.window().then(async w => {
      const r = await w.supabase.createClient().from('docs').upsert({ col: 'munro/productos', id: 'p-001', data: { nombre: 'Intento' } });
      expect(r.error, 'la base rechaza la escritura en modo consulta').to.not.equal(null);
    });
    cy.window().then(w => cy.stub(w, 'prompt').returns('Corrección pedida por la dueña'));
    cy.get('[data-creator-mode="on"]').click();
    cy.get('.gl-creator-mode-on').should('contain.text', 'Edición habilitada hasta las');
    cy.get('#me').should('not.contain.text', 'Solo ver');
    cy.window().its('__audit').should(a => expect(a.map(x => x.action)).to.include('editing_enabled'));
    cy.get('[data-creator-mode="off"]').click();
    cy.get('.gl-creator-mode').should('contain.text', 'Modo consulta: solo lectura');
    cy.window().its('__audit').should(a => expect(a.map(x => x.action)).to.include('editing_disabled'));
  });
  it('la dueña sigue editando como siempre y no ve el aviso de la creadora', () => {
    login('dueno@example.com');
    abrirLocal('munro');
    cy.get('#snav').should('be.visible');
    cy.get('.gl-creator-mode').should('not.exist');
    cy.get('#me').should('not.contain.text', 'Solo ver');
  });
});
