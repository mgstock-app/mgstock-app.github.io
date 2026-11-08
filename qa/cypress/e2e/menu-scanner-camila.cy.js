/* global Cypress, cy, describe, it */
// Regresión: creadora verificada opera Scanner ZAYRO sin abrir otras microapps ni elevar a otros roles.
// Datos ficticios: el navegador usa Supabase simulado y no modifica empresas.
const CAMI='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
describe('Menú de la perfumería Camila · Plan Scanner y ZAYRO',()=>{
 Cypress.on('uncaught:exception',error=>{
  if(error.message.includes('Minified React error #418'))return false;
 });
 it('al entrar como creadora muestra solo las microapps del Plan Scanner, sin menú de Mi Gusto',()=>{
  cy.viewport(1280,900);
  cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{
   statusCode:200,headers:{'content-type':'application/javascript'},body
  }).as('fake'));
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/');cy.wait('@fake');
  cy.get('.gl-intro',{timeout:14000}).should('not.be.visible');
  cy.window().then(w=>{
   w.__dashboard=true;
   w.__tenantOverride=CAMI;
   w.__companyOverride='Perfumes';
  });
  cy.get('#au-email').type('kmu15lopez@gmail.com');
  cy.get('#au-pass').type('secreto1',{log:false});
  cy.get('#au-in button[type="submit"]').click();
  cy.get('.gl-ch-nav [data-ch-tab="locales"]',{timeout:18000}).click();
  cy.get('#hub .gl-company-folder')
   .filter((_,e)=>!!e.querySelector('[data-act="local"][data-id="munro"]')).first().as('cami');
  cy.get('@cami').find('summary').click();
  cy.get('@cami').find('[data-act="local"][data-id="munro"]').click();
  cy.get('#snav',{timeout:18000}).should('be.visible');
  cy.get('#snav [data-scanner-section="ventas"]').should('be.visible').and('not.be.disabled');
  cy.get('#snav [data-scanner-section="stock"]').should('be.visible');
  cy.get('#snav').should('contain.text','Precios').and('contain.text','Sistema de ventas');
  cy.get('#snav').should('not.contain.text','Proveedores')
    .and('not.contain.text','Reclamos Internos')
    .and('not.contain.text','Vencimientos')
    .and('not.contain.text','Administración de local')
    .and('not.contain.text','Stock Local');
  cy.get('#view .gl-scanner-private-home').should('be.visible')
    .and('contain.text','Plan Scanner').and('contain.text','ZAYRO');
  cy.get('#view').should('not.contain.text','Administrar a los empleados')
    .and('not.contain.text','Administrar mi empresa');
  cy.get('#view .gl-scanner-private-card').should('have.length',6).and('not.be.disabled');
  cy.get('#view a[href="/zayro/"]').should('have.attr','target','_blank');
  cy.get('#gl-edit-menu').should('not.exist');
  cy.get('#btn-ajustes').should('not.be.visible');
  cy.get('#gl-soporte-whatsapp').should('be.visible');
 });
});
