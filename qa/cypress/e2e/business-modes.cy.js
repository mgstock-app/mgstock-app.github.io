/* global Cypress, describe, it, cy, expect */
import { abrirLocal } from '../helpers/abrir-local';
// Nunca escribe datos de producción: Supabase falso interceptado antes de cargar GestLok.
const login = email => {
  cy.get('#au-email').type(email);
  cy.get('#au-pass').type('secreto1', {log:false});
  cy.get('#au-in button[type="submit"]').click();
};
function launch() {
  cy.task('mockSupabase').then(fake => {
    cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body:fake}).as('fakeSupabase');
  });
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/');
  cy.wait('@fakeSupabase');
  cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
  cy.get('#au-in').should('be.visible');
}
const openLocal = id => abrirLocal(id);
const mostrarHerramientas = () => cy.get('#view .gl-home-essential-settings').then(el => {
  if (!el.prop('open')) cy.wrap(el).find('summary').click();
});

describe('GestLok: tienda física, online y mixta',()=>{
  Cypress.on('uncaught:exception',error=>{
    if(error.message.includes('Minified React error #418')) return false;
  });
  it('la dueña configura online y puede gestionar pedidos, sin mezclarlos entre locales',()=>{
    launch();
    login('dueno@example.com');
    cy.get('.gl-owner-tile[data-owner-nav="settings"]').click();
    cy.get('#pn .gl-commerce-choice[data-commerce-mode="fisica"]').should('exist');
    cy.get('#pn [data-act="close"]').click();
    openLocal('munro');
    cy.get('#gl-store-mode-owner').should('have.text','Tienda física');
    cy.get('#gl-store-mode-owner').prev('#live').should('exist');
    mostrarHerramientas();
    cy.get('#view .gl-commerce-choice[data-commerce-mode="online"]').click();
    cy.get('#gl-store-mode-owner').should('have.text','Tienda online');
    cy.get('#snav [data-go="pedidos-online"]').should('exist').click();
    cy.get('#gl-commerce-order-form input[name="cliente"]').type('Pedido de prueba');
    cy.get('#gl-commerce-order-form textarea[name="lineas"]').type('Remera azul | 2 | 12500{enter}Buzo negro | 1 | 22500');
    cy.get('#gl-commerce-order-form button[type="submit"]').click();
    cy.get('.gl-commerce-order-list').should('contain.text','Pedido de prueba');
    cy.get('[data-commerce-status]').first().select('preparando');
    cy.get('[data-commerce-status]').first().should('have.value','preparando');
    cy.get('#snav [data-act="locales"]').click();
    openLocal('torcuato');
    cy.get('#snav [data-go="pedidos-online"]').click();
    cy.get('#view').should('not.contain.text','Pedido de prueba');
    cy.get('#snav [data-act="locales"]').click();
    openLocal('munro');
    cy.get('#snav [data-go="pedidos-online"]').click();
    cy.get('#view').should('contain.text','Pedido de prueba');
    cy.get('#snav [data-go="inicio"]').click();
    mostrarHerramientas();
    cy.get('#view .gl-commerce-choice[data-commerce-mode="fisica"]').click();
    cy.get('#gl-store-mode-owner').should('have.text','Tienda física');
    cy.get('#snav [data-go="pedidos-online"]').should('not.exist');
    // El acordeón conserva su estado tras guardar: no exigir que se cierre.
    mostrarHerramientas();
    cy.get('#view .gl-commerce-choice[data-commerce-mode="mixta"]').should('be.visible').click();
    cy.get('#gl-store-mode-owner').should('have.text','Tienda mixta');
    cy.get('#snav [data-go="pedidos-online"]').should('exist');
    cy.get('#snav [data-go="ingreso"]').should('exist');
    cy.window().its('__rows').should(rows=>{
      expect(rows.filter(r=>r.col==='munro/pedidos_online')).to.have.length(1);
      expect(rows.filter(r=>r.col==='torcuato/pedidos_online')).to.have.length(0);
      expect(rows.find(r=>r.col==='configuracion_negocio').data.tipo).to.eq('mixta');
    });
  });
  it('gerentes pueden operar sus locales, pero no cambiar la modalidad',()=>{
    launch();
    login('gerente.munro@example.com');
    cy.get('#gl-store-mode-owner').should('not.exist');
    cy.get('#view .gl-commerce-choice').should('not.exist');
    cy.get('#view .gl-commerce-current').should('not.exist');
    cy.get('#view').should('not.contain.text','Tienda física');
    cy.get('#view').should('not.contain.text','Tienda mixta');
  });
});
