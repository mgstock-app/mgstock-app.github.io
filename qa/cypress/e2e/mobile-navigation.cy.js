/* global Cypress, describe, it, cy */
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
describe('GESTLOK · Dock inferior móvil y permisos',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 it('gerente puede abrir Colaboradores desde abajo, sin tabla nueva de horarios',()=>{
   setup('gerente.munro@example.com');
   cy.get('#view .gl-manager-landing',{timeout:15000}).should('be.visible');
   cy.get('#view [data-gerente-empleados]',{timeout:15000}).should('be.visible');
   cy.get('#gestlok-mobile-dock').should('be.visible');
   cy.get('#gestlok-mobile-dock [data-dock="staff"]').should('contain.text','Colaboradores').click();
   cy.location('pathname').should('eq','/empleados/');
   cy.get('.gestlok-module-bar').should('be.visible');
   cy.contains('button','Continuar con Google',{timeout:15000}).should('be.visible');
 });
 it('cuenta de solo lectura no recibe acceso nuevo a legajos de gerente',()=>{
   setup('lectura@example.com');
   cy.get('#app').should('be.visible');
   cy.get('#gestlok-mobile-dock').should('be.visible');
   cy.get('#gestlok-mobile-dock [data-dock="staff"]').should('not.exist');
   cy.get('#sb-save').should('be.disabled');
 });
 it('dueño sin módulo habilitado tampoco ve Colaboradores',()=>{
   setup('dueno@example.com');
   cy.get('#hub .gl-owner-employees-locked',{timeout:15000}).should('exist');
   cy.get('#gestlok-mobile-dock').should('be.visible');
   cy.get('#gestlok-mobile-dock [data-dock="staff"]').should('not.exist');
   cy.get('#gestlok-mobile-dock [data-dock="business"]').click();
   cy.get('#pn [data-act="local"]').should('exist');
 });
 it('Torcuato: el panel de inicio no muestra Sin cambios / Guardar conteo; dentro de Stock sí',()=>{
   setup('gerente.torcuato@example.com');
   cy.get('#ttl',{timeout:15000}).should('have.text','Panel del local');
   cy.get('#savebar').should('not.be.visible');
   // En teléfono, el menú lateral está cerrado hasta tocar el botón hamburguesa.
   cy.get('.ham[data-act="menu-open"]').click();
   cy.get('#snav [data-go="stock"]').should('be.visible').click();
   cy.get('#savebar').should('be.visible');
   cy.get('#sb-save').should('be.visible');
 });
 it('Munro: el inicio tampoco muestra la barra de conteo',()=>{
   setup('gerente.munro@example.com');
   cy.get('#ttl',{timeout:15000}).should('have.text','Panel del local');
   cy.get('#savebar').should('not.be.visible');
 });
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
