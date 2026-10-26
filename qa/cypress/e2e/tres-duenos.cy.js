/* global Cypress, cy, describe, it */
const owners=['owner-one@example.invalid','owner-two@example.invalid','owner-three@example.invalid'];
describe('Tres codueños: mismas tarjetas y ambos locales',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 for(const email of owners)for(const local of ['munro','torcuato'])it(email+' abre '+local+' con permisos de dueño',()=>{
  cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body}).as('fake'));
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});cy.visit('/');cy.wait('@fake');
  cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
  cy.window().then(w=>{
   w.__staffModule=true;
   for(const [i,mail] of owners.entries())w.__rows.push({col:'equipo',id:mail,data:{email:mail,nombre:'Dueño de prueba '+(i+1),rol:'dueno',logoId:'mi-gusto'}});
  });
  cy.get('#au-email').type(email);cy.get('#au-pass').type('secreto1',{log:false});cy.get('#au-in button[type="submit"]').click();
  cy.get('#hub .gl-owner-business').should('be.visible');
  cy.get('#hub .gl-owner-employees').should('be.visible').and('not.have.class','gl-owner-employees-locked');
  cy.get('#hub [data-owner-area-staff]').should('be.visible');
  cy.get('#hub .gl-owner-welcome-logo img').should('have.attr','alt','Mi Gusto');
  cy.get('#hub').should('contain.text','Empanadas de Verdad');
  cy.get('#hub .gl-owner-business .gl-owner-arrow').click();
  cy.get('#pn [data-act="local"][data-id="munro"]').should('be.visible');
  cy.get('#pn [data-act="local"][data-id="torcuato"]').should('be.visible');
  cy.get('#pn [data-act="local"][data-id="'+local+'"]').first().click();
  cy.get('#view .gl-home-essential',{timeout:15000}).should('be.visible');
  cy.get('#brand-local').should('contain.text',local==='munro'?'Munro':'Torcuato');
  cy.get('#view').should('not.contain.text','Modo consulta: solo lectura');
 });
});
