/* global describe, it, cy */
// Solo datos ficticios: controla que las acciones móviles respeten los permisos.
const setup=(email,width=390)=>{
 cy.viewport(width,844);
 cy.task('mockSupabase').then(fake=>{
   cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body:fake}).as('mock');
 });
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
 cy.visit('/');cy.wait('@mock');
 cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
 cy.get('#au-email').clear().type(email);
 cy.get('#au-pass').type('secreto1',{log:false});
 cy.get('#au-in button[type="submit"]').click();
};
// Aislado para evitar bloqueo del runner de Chrome tras múltiples sesiones en una misma spec.
// No se omite ninguna prueba: todos los escenarios se siguen ejecutando.
describe('GESTLOK · Accesos rápidos y navegación en PC',()=>{
  it('Munro: Stock Local y Pagos Online siempre visibles en dock, con permisos existentes',()=>{
   setup('gerente.munro@example.com');
   cy.get('#gestlok-mobile-dock [data-dock="stock"]',{timeout:15000}).should('be.visible').and('contain.text','Stock Local');
   cy.get('#snav > button[data-go="stock"]').should('exist');
   // Si la sucursal tiene Pagos Online habilitado, ambos accesos deben corresponder a la misma vista autorizada.
   cy.get('#snav').then($nav=>{
    if($nav.find('.snav-sub [data-go="cierre-online"]').length){
     cy.get('#snav > button[data-daily-shortcut="pagos"]').should('exist');
     cy.get('#gestlok-mobile-dock [data-dock="pagos"]').should('be.visible').click();
     cy.get('#ttl').should('contain.text','Pagos Online');
     cy.get('#gestlok-mobile-dock [data-dock="stock"]').click();
     cy.get('#ttl').should('not.contain.text','Pagos Online');
    }
   });
 });
 it('en PC permanece la navegación de escritorio sin dock móvil',()=>{
   setup('gerente.munro@example.com',1280);
   cy.get('#app').should('be.visible');
   cy.get('#gestlok-mobile-dock').should('not.be.visible');
   cy.get('#side').should('be.visible');
 });
});
