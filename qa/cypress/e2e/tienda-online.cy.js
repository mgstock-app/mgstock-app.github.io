/* global Cypress, describe, it, cy, expect */
// Base de prueba interceptada: la demo se ejecuta sin cambios en producción.
const login = email => {
  cy.get('#au-email').type(email);
  cy.get('#au-pass').type('secreto1',{log:false});
  cy.get('#au-in button[type="submit"]').click();
};
function launch(){
  cy.task('mockSupabase').then(fake=>{
    cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body:fake}).as('fakeSupabase');
  });
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/');
  cy.wait('@fakeSupabase');
  cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
  cy.get('#au-in').should('be.visible');
}
describe('GestLok: demo privada de organización online',()=>{
  Cypress.on('uncaught:exception',error=>{
    if(error.message.includes('Minified React error #418'))return false;
  });
  it('creadora explora, simula y reinicia sin alterar empresas reales',()=>{
    cy.viewport(390,844);
    launch();login('kmu15lopez@gmail.com');
    cy.get('#hub [data-act="admin-demo-online"]').should('be.visible');
    cy.window().then(w=>{
      const before=JSON.stringify(w.__rows);
      cy.get('[data-act="admin-demo-online"]').click();
      cy.get('#gl-admin-demo').should('be.visible');
      cy.get('#gl-admin-demo').should('contain.text','DEMO FICTICIA');
      cy.get('#gl-admin-demo').should('contain.text','Productos organizados');
      cy.get('[data-demo-tab="productos"]').first().click();
      cy.get('#gl-demo-search').type('Chocolate');
      cy.get('#gl-demo-table').should('contain.text','Chocolate');
      cy.get('#gl-demo-search').clear();
      cy.get('[data-demo-stock="p2"]').clear().type('20').blur();
      cy.get('[data-demo-tab="pedidos"]').first().click();
      cy.get('[data-demo-order="DEM-104"]').select('Entregado');
      cy.get('[data-demo-tab="proveedores"]').first().click();
      cy.get('#gl-admin-demo').should('contain.text','Distribuidora Norte');
      cy.get('[data-demo-tab="reportes"]').first().click();
      cy.get('#gl-admin-demo').should('contain.text','Pedidos por estado');
      cy.get('[data-demo-reset]').click();
      cy.get('#gl-admin-demo').should('contain.text','3</strong>');
      cy.get('[data-act="admin-demo-close"]').click();
      cy.get('#gl-admin-demo').should('not.exist');
      cy.get('#hub').should('contain.text','Panel administrativo');
      cy.window().its('__rows').should(rows=>expect(JSON.stringify(rows)).to.equal(before));
    });
  });
  it('gerente no recibe acceso al demo de la creadora',()=>{
    launch();login('gerente.munro@example.com');
    cy.get('#hub [data-act="admin-demo-online"]').should('not.exist');
  });
});
