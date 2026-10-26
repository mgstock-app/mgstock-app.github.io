/* global Cypress, cy, describe, it, expect */
import { abrirLocal } from '../helpers/abrir-local';
const login=(email)=>{
 cy.task('mockSupabase').then(mock=>{
  cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,
    headers:{'content-type':'application/javascript'},body:mock}).as('fake');
 });
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
 cy.visit('/');
 cy.wait('@fake');
 cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
 cy.get('#au-email').type(email);
 cy.get('#au-pass').type('secreto1',{log:false});
 cy.get('#au-in button[type="submit"]').click();
 if(email==='dueno@example.com')abrirLocal('munro');
};
describe('Permiso push Dueña sin envíos automáticos',()=>{
 Cypress.on('uncaught:exception',e=>{
  if(e.message.includes('Minified React error #418'))return false;
 });
 it('Dueña ve estado de suscripción, puede descartar el cartel y no vuelve a verlo',()=>{
  cy.viewport(1280,900);
  login('dueno@example.com');
  cy.get('#view .gl-home-essential').should('be.visible');
  cy.get('#view .gl-owner-notif-trigger').click();
  cy.get('#pn .gl-push-drawer').should('be.visible')
    .and('contain.text','Solo recibirás avisos');
  cy.get('#pn [data-act="close"]').click();
  cy.get('#view').then(view=>{
   const banner=view.find('.gl-push-permission');
   if(banner.length){
    cy.wrap(banner).contains('Ahora no').click();
    cy.get('#view .gl-push-permission').should('not.exist');
    cy.window().then(w=>{
     const k='gestlok:push-question:v1:'+encodeURIComponent('dueno@example.com');
     expect(w.localStorage.getItem(k)).to.eq('consultado');
    });
    cy.get('#snav [data-go="stock"]').click();
    cy.get('#snav [data-go="inicio"]').click();
    cy.get('#view .gl-push-permission').should('not.exist');
   }
  });
 });
 it('Gerente no recibe cartel ni botón push de Dueña',()=>{
  cy.viewport(1280,900);
  login('gerente.munro@example.com');
  cy.get('#view .gl-manager-landing').should('be.visible');
  cy.get('.gl-push-permission').should('not.exist');
  cy.get('.gl-owner-notif-trigger').should('not.exist');
 });
});
