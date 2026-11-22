/* global Cypress, cy, describe, it, expect */
describe('Mi Gusto · categorías laterales en Stock Local',()=>{
 Cypress.on('uncaught:exception',e=>{
   if(e.message.includes('Minified React error #418'))return false;
 });
 function entrar(email,width){
   cy.viewport(width,844);
   cy.task('mockSupabase').then(body=>{
     cy.intercept('GET','**/vendor/supabase.js',{
       statusCode:200,headers:{'content-type':'application/javascript'},body
     }).as('mock');
   });
   cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
   cy.visit('/');cy.wait('@mock');
   cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
   cy.get('#au-email').clear().type(email);
   cy.get('#au-pass').type('secreto1',{log:false});
   cy.get('#au-in button[type="submit"]').click();
   cy.get('#app',{timeout:15000}).should('be.visible');
   if(width<=700)cy.get('.ham[data-act="menu-open"]').click();
   cy.get('#snav [data-go="stock"]').click({force:true});
   cy.get('#view .gl-mg-stock-layout').should('exist');
 }
 for(const [local,email] of [['Munro','gerente.munro@example.com'],['Torcuato','gerente.torcuato@example.com']]){
   it(local+': menú vertical, categorías dinámicas y borrador sin perder cantidades',()=>{
     entrar(email,900);
     cy.get('#brand-local').should('contain.text',local);
     cy.get('.gl-mg-stock-nav').should('be.visible');
     cy.get('.gl-mg-stock-drawer').should('not.be.visible');
     cy.get('.gl-mg-stock-nav .gl-mg-stock-cat').should('have.length.greaterThan',1);
     cy.get('.gl-mg-stock-nav .gl-mg-stock-cat').first().should('have.attr','aria-pressed','true');
     cy.get('#view .gl-mg-stock-main .chips').should('not.exist');
     cy.get('#view .gl-mg-stock-main #q-stock').should('be.visible');
     // El menú es solo navegación: no guarda ni altera datos.
     cy.get('#view .sh-r .adj .in:not([disabled])').first().click();
     cy.get('#sb-cnt').should('be.visible');
     cy.get('.gl-mg-stock-nav .gl-mg-stock-cat').eq(1).invoke('attr','data-cat').then(categoria=>{
       cy.get('.gl-mg-stock-nav .gl-mg-stock-cat').eq(1).click();
       cy.get('.gl-mg-stock-nav .gl-mg-stock-cat[aria-pressed="true"]')
         .should('have.attr','data-cat',categoria);
       cy.get('#view .sh-g b').each($categoria=>{
         expect($categoria.text()).to.eq(categoria);
       });
     });
     cy.get('.gl-mg-stock-nav .gl-mg-stock-cat').first().click();
     cy.get('#sb-cnt').should('be.visible');
     cy.get('#sb-save').should('be.visible');
   });
 }
 it('celular: panel lateral desplegable sin hacer angosta la carga',()=>{
   entrar('gerente.munro@example.com',390);
   cy.get('.gl-mg-stock-nav').should('not.be.visible');
   cy.get('.gl-mg-stock-drawer>summary').should('be.visible').click();
   cy.get('.gl-mg-stock-drawer[open] .gl-mg-stock-cat').should('have.length.greaterThan',1);
   cy.get('.gl-mg-stock-drawer[open] .gl-mg-stock-cat').eq(1).click();
   cy.get('.gl-mg-stock-drawer>summary').should('contain.text','Categorías');
   cy.get('.gl-mg-stock-main #q-stock').should('be.visible');
   cy.document().then(doc=>expect(doc.documentElement.scrollWidth).to.be.at.most(392));
 });
});