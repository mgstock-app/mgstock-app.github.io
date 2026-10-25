/* global Cypress, describe, it, cy */
const {abrirLocal}=require('../helpers/abrir-local');
function start(){
 cy.task('mockSupabase').then(mock=>cy.intercept('GET','**/vendor/supabase.js',{
  statusCode:200,headers:{'content-type':'application/javascript'},body:mock
 }).as('mockSupabase'));
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
 cy.visit('/');
 cy.wait('@mockSupabase');
 cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
}
function login(email){
 cy.get('#au-email').type(email);
 cy.get('#au-pass').type('secreto1',{log:false});
 cy.get('#au-in button[type="submit"]').click();
}
describe('GestLok · Inicio limpio y esencial',()=>{
 Cypress.on('uncaught:exception',error=>{
   if(error.message.includes('Minified React error #418'))return false;
 });
 it('Dueño en celular: sólo tres métricas, acciones y herramientas ocultas',()=>{
  cy.viewport(390,844);start();login('dueno@example.com');
  abrirLocal('munro');
  cy.get('#view .gl-home-essential').should('be.visible').within(()=>{
   cy.contains('Inicio · Munro').should('be.visible');
   cy.get('.gl-home-essential-stat').should('have.length',3);
   cy.get('.gl-home-essential-links button').its('length').should('be.lte',4);
   cy.get('.gl-home-essential-settings').should('not.have.attr','open');
   cy.get('.gl-home-sheet-summaries').should('not.exist');
   cy.get('.dash').should('not.exist');
   cy.get('.gl-home-essential-links [data-go="proveedores"]').should('exist');
  });
  cy.get('#view .gl-home-essential-settings summary').click();
  cy.get('#view .gl-home-essential-settings').should('have.attr','open');
  cy.get('#view .gl-commerce-choice').should('have.length',3);
  cy.get('#view .gl-home-essential-links [data-go="proveedores"]').click();
  cy.get('#view').should('contain.text','Proveedores');
 });
 it('Gerente en Munro: inicio limpio, sin modalidad, con control diario',()=>{
  start();login('gerente.munro@example.com');
  cy.get('#view .gl-home-essential').should('be.visible');
  cy.get('#view .gl-home-essential-stat').should('have.length',3);
  cy.get('#view').should('not.contain.text','Tienda mixta');
  cy.get('#view .gl-commerce-choice').should('not.exist');
  cy.get('#view .gl-home-essential-links [data-go="diario"]').should('exist').click();
  cy.get('#view').should('contain.text','Conteo diario');
 });
 it('Creadora conserva su panel administrativo, sin cambios',()=>{
  start();login('kmu15lopez@gmail.com');
  cy.get('#hub .gl-admin').should('be.visible');
  cy.get('#hub').should('not.contain.text','Inicio · Munro');
 });
});
