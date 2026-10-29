/* global Cypress, describe, it, beforeEach, cy */
// UI de GESTLOK con datos ficticios: no consulta ni modifica empresas reales.
const entrar=email=>{
 cy.get('#au-email').clear().type(email);
 cy.get('#au-pass').type('secreto1',{log:false});
 cy.get('#au-in button[type="submit"]').click();
};
describe('GESTLOK: navegación blanca compartida y plegable sin alterar permisos',()=>{
 Cypress.on('uncaught:exception',error=>{
   if(error.message.includes('Minified React error #418'))return false;
 });
 beforeEach(()=>{
   cy.viewport(1240,850);
   cy.task('mockSupabase').then(fake=>{
     cy.intercept('GET','**/vendor/supabase.js',{
       statusCode:200,headers:{'content-type':'application/javascript'},body:fake
     }).as('supabaseFalso');
   });
   cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
   cy.visit('/');cy.wait('@supabaseFalso');
   cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
 });
 const revisarLocal=()=>{
   cy.get('#app').should('be.visible').and('have.css','background-color','rgb(255, 255, 255)');
   cy.get('#app .main').should('have.css','background-color','rgb(255, 255, 255)');
   cy.get('#side').should('have.css','background-color','rgb(255, 255, 255)');
   cy.get('.gl-sidebar-collapse-button').should('be.visible').click();
   cy.get('#app').should('have.class','gl-sidebar-collapsed');
   cy.get('#snav [data-go="proveedores"]').should('be.visible');
   cy.get('.gl-sidebar-collapse-button').click();
   cy.get('#app').should('not.have.class','gl-sidebar-collapsed');
 };
 it('gerente mantiene sus accesos al contraer y expandir la barra blanca',()=>{
   entrar('gerente.munro@example.com');
   revisarLocal();
 });
 it('colaborador de lectura mantiene la barra y continúa sin guardar stock',()=>{
   entrar('lectura@example.com');
   revisarLocal();
   cy.get('#sb-save').should('be.disabled');
 });
 it('la creadora también puede contraer su panel administrativo blanco',()=>{
   entrar('kmu15lopez@gmail.com');
   cy.get('#hub .gl-admin-sidebar').should('be.visible')
     .and('have.css','background-color','rgb(255, 255, 255)');
   cy.get('#hub .gl-admin-collapse').should('be.visible').click();
   cy.get('#hub .gl-admin').should('have.class','gl-admin-collapsed');
   cy.get('#hub .gl-admin-collapse').click();
   cy.get('#hub .gl-admin').should('not.have.class','gl-admin-collapsed');
   cy.get('#hub').should('not.contain.text','Empanadas de Verdad');
 });
});
