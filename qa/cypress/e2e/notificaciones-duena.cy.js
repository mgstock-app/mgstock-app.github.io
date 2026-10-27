/* global Cypress, describe, it, cy */
import { abrirLocal } from '../helpers/abrir-local';
const start=(email)=>{
  cy.task('mockSupabase').then(mock=>{
    cy.intercept('GET','**/vendor/supabase.js',{
      statusCode:200,headers:{'content-type':'application/javascript'},body:mock
    }).as('fakeSupabase');
  });
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/');
  cy.wait('@fakeSupabase');
  cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
  cy.get('#au-email').clear().type(email);
  cy.get('#au-pass').type('secreto1',{log:false});
  cy.get('#au-in button[type="submit"]').click();
  if(email==='dueno@example.com')abrirLocal('munro');
};
describe('GestLok Dueña: Notificaciones lateral',()=>{
  Cypress.on('uncaught:exception',e=>{
    if(e.message.includes('Minified React error #418'))return false;
  });
  it('Dueña abre desde la derecha, cierra y devuelve el foco; funciona en móvil',()=>{
    cy.viewport(1280,900);
    start('dueno@example.com');
    cy.get('#view .gl-owner-notif-trigger').should('be.visible').click();
    cy.get('#ov').should('be.visible').and('have.class','drawer');
    cy.get('#pn').should('contain.text','Notificaciones').and('have.attr','aria-labelledby','gl-owner-notifications-title');
    cy.get('#pn').should('not.contain.text','Nuevo aviso');
    cy.get('#pn [data-act="close"]').click();
    cy.get('#ov').should('have.attr','hidden');
    cy.focused().should('have.class','gl-owner-notif-trigger');
    cy.viewport(390,844);
    cy.get('#view .gl-owner-notif-trigger').should('be.visible').click();
    cy.get('#ov').should('be.visible').and('have.class','drawer');
    cy.get('#pn [data-act="close"]').should('be.visible');
    cy.get('body').type('{esc}');
    cy.get('#ov').should('have.attr','hidden');
  });
  it('Gerente no recibe el botón exclusivo de Dueña',()=>{
    cy.viewport(1280,900);
    start('gerente.munro@example.com');
    cy.get('#view .gl-manager-landing').should('be.visible');
    cy.get('#view .gl-owner-notif-trigger').should('not.exist');
  });
});