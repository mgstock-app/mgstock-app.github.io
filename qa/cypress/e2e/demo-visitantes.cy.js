/* global Cypress, describe, it, cy */
describe('GestLok · demo para visitantes sin registro',()=>{
 Cypress.on('uncaught:exception',e=>{
  if(e.message.includes('Minified React error #418'))return false;
 });
 const bootstrap=(route)=>{
  cy.task('mockSupabase').then(fake=>{
    cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,
      headers:{'content-type':'application/javascript'},body:fake}).as('fakeAuth');
  });
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true}).as('noProduction');
  cy.visit(route);cy.wait('@fakeAuth');
  cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
 };
 it('Invitado usa Dueña en tienda física, modifica stock ficticio y ve notificaciones simuladas',()=>{
  cy.viewport(390,844);
  bootstrap('/?demo=1&shop=mercado&role=dueno');
  cy.get('#gl-visitor-bar').should('be.visible').and('contain.text','DEMO');
  cy.get('#gl-visitor-shop').should('have.value','mercado');
  cy.get('#gl-visitor-role').should('have.value','dueno');
  cy.get('#view .gl-home-essential',{timeout:15000}).should('be.visible');
  cy.get('#view .gl-owner-notif-trigger').click();
  cy.get('#pn .gl-push-settings').should('contain.text','Ajustes simulados');
  cy.get('#pn [data-visitor-notif="due_today"]').click().should('have.attr','aria-checked','false');
  cy.get('#pn [data-act="close"]').click();
  cy.get('#snav [data-go="stock"]').click({force:true});
  cy.get('#view').should('contain.text','Stock');
  cy.window().then(w=>{
   cy.wrap(w.GestLokVisitorDemo.isReady()).should('eq',true);
   cy.wrap(w.GestLokSupabase).should('have.property','rpc');
  });
 });
 it('Invitado cambia a tienda mixta y Gerente sin registro',()=>{
  cy.viewport(1280,900);
  bootstrap('/?demo=1&shop=nova&role=gerente');
  cy.get('#gl-visitor-bar').should('be.visible');
  cy.get('#gl-visitor-shop').should('have.value','nova');
  cy.get('#gl-visitor-role').should('have.value','gerente');
  cy.get('#view .gl-home-essential',{timeout:15000}).should('be.visible');
  cy.get('#view .gl-owner-notif-trigger').should('not.exist');
  cy.get('[data-go="tienda-online"]').first().click({force:true});
  cy.get('#view').should('contain.text','Organización de productos');
  cy.get('#view').should('contain.text','500');
  cy.get('#gl-visitor-role').select('dueno');
  cy.get('#gl-visitor-role',{timeout:15000}).should('have.value','dueno');
  cy.get('#view .gl-home-essential',{timeout:15000}).should('be.visible');
 });
 it('La pantalla de login muestra botón público para entrar a demo',()=>{
  bootstrap('/');
  cy.get('#au-in').should('be.visible');
  cy.get('#au-demo-link').should('be.visible').and('have.attr','href','/?demo=1');
 });
});
