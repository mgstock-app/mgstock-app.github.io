/* global Cypress, describe, it, cy */
function start(){
 cy.task('mockSupabase').then(mock=>cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body:mock}).as('mockSupabase'));
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});cy.visit('/');cy.wait('@mockSupabase');
 cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
}
function login(email){
 cy.get('#au-email').type(email);cy.get('#au-pass').type('secreto1',{log:false});cy.get('#au-in button[type="submit"]').click();
}
describe('Gerente · tarjeta de Empleados (Horarios) y avisos del local',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 for(const [mail,local] of [['gerente.munro@example.com','Munro'],['gerente.torcuato@example.com','Torcuato']]){
  it('gerente de '+local+': ve avisos, la tarjeta y Horarios en su Inicio sin tocar nada más',()=>{
   start();cy.window().then(w=>{w.__gerenteSlow=true;});login(mail);
   cy.get('#view .gl-manager-landing',{timeout:15000}).should('be.visible').and('contain.text',local);
   cy.get('#view .gl-owner-business').should('be.visible');
   cy.get('#view .gl-owner-employees').should('be.visible').and('not.contain.text','Recibos de sueldo').and('not.contain.text','Empleados y roles');
   cy.get('#view .gl-home-avisos').should('contain.text','Avisos del local');
   // La respuesta del servidor tarda: la tarjeta tiene que aparecer sola, sin otra acción.
   cy.get('#view [data-gerente-empleados]',{timeout:15000}).should('be.visible');
   cy.get('#view').should('contain.text','Administrar a los empleados').and('contain.text','Horarios');
   cy.get('#snav [data-go="avisos"]').should('exist');
   cy.get('#view .gl-home-avisos [data-go="avisos"]').click();
   cy.get('.gl-exp-page h1').should('contain.text','Centro de avisos');
  });
 }
 it('si el servidor no autoriza, no se ofrece la carpeta Horarios',()=>{
  start();cy.window().then(w=>{w.__gerenteFail=true;});login('gerente.munro@example.com');
  cy.get('#view .gl-manager-landing',{timeout:15000}).should('be.visible');
  cy.wait(1800);cy.get('#view [data-gerente-empleados]').should('not.exist');
 });
 it('un usuario de solo lectura sigue sin Avisos ni carpeta Horarios',()=>{
  start();login('lectura@example.com');
  cy.get('#view',{timeout:15000}).should('be.visible');
  cy.wait(1800);cy.get('[data-go="avisos"]').should('not.exist');cy.get('[data-gerente-empleados]').should('not.exist');
 });
});
describe('Gerente: navegación por las dos áreas',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 for(const mail of ['gerente.munro@example.com','gerente.torcuato@example.com'])it('tarjetas funcionales para '+mail,()=>{
  start();cy.viewport(390,844);login(mail);
  cy.get('#view .gl-manager-landing').should('be.visible');
  cy.get('#view [data-gerente-business]').click();
  cy.get('#view .gl-home-essential').should('be.visible');
  cy.get('[data-act="menu-open"]').click();
  cy.get('#snav [data-go="inicio"]').click();
  cy.get('#view .gl-manager-landing').should('be.visible');
  cy.get('#view [data-gerente-empleados]').click();
  cy.location('pathname').should('eq','/empleados/');
  cy.get('.gestlok-module-back').should('have.attr','href','/');
 });
});
