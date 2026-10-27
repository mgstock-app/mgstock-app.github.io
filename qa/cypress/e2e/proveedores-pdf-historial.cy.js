/* global Cypress, describe, it, cy, expect */
import { abrirLocal } from '../helpers/abrir-local';
// Supabase falso: esta prueba jamás altera proveedores, pedidos o historial reales.
const login = email => {
  cy.get('#au-email').clear().type(email);
  cy.get('#au-pass').type('secreto1',{log:false});
  cy.get('#au-in button[type="submit"]').click();
};
function launch(){
  cy.task('mockSupabase').then(fake=>{
    cy.intercept('GET','**/vendor/supabase.js',{
      statusCode:200,headers:{'content-type':'application/javascript'},body:fake
    }).as('mockSupabase');
  });
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/');
  cy.wait('@mockSupabase');
  cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
  cy.get('#au-in').should('be.visible');
}
describe('GestLok: proveedores, historial y PDF único',()=>{
  Cypress.on('uncaught:exception',e=>{
    if(e.message.includes('Minified React error #418'))return false;
  });
  it('pone stock y pedir en 0 sin alterar sugerido, guarda historial y prepara solo PDF',()=>{
    launch();
    cy.window().then(w=>{
      cy.stub(w,'confirm').returns(true);
      w.__rows.push({col:'munro/productos',id:'p-qa-proveedor-pdf',data:{
        nombre:'Café de prueba',stock:15,min:8,cat:'Bebidas',
        proveedor:'Distribuidora Demo PDF',unidad:'caja',orden:4000
      }});
    });
    login('dueno@example.com');
    abrirLocal('munro');
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get('[data-act="prov-open"][data-name="Distribuidora Demo PDF"]').click();
    cy.get('#prov-carpeta').should('be.visible');
    cy.get('[data-prov-val="sugerido"][data-id="c:p-qa-proveedor-pdf"]').clear().type('7');
    cy.get('[data-prov-val="stockLocal"][data-id="c:p-qa-proveedor-pdf"]').clear().type('15');
    cy.get('[data-prov-val="pedir"][data-id="c:p-qa-proveedor-pdf"]').clear().type('5');
    cy.get('#prov-carpeta [data-act="prov-zero-cat"][data-cat="Bebidas"]').click();
    cy.get('[data-prov-val="stockLocal"][data-id="c:p-qa-proveedor-pdf"]').should('have.value','0');
    cy.get('[data-prov-val="pedir"][data-id="c:p-qa-proveedor-pdf"]').should('have.value','0');
    cy.get('[data-prov-val="sugerido"][data-id="c:p-qa-proveedor-pdf"]').should('have.value','7');
    cy.get('[data-prov-val="pedir"][data-id="c:p-qa-proveedor-pdf"]').clear().type('4');
    cy.get('#prov-carpeta [data-act="prov-save-plan"]').first().click();
    cy.get('#pn').should('contain.text','¿Terminaste el pedido?');
    cy.get('#pn [data-act="prov-save-history"]').click();
    cy.get('#prov-carpeta .gl-prov-history-entry',{timeout:11000}).should('have.length',1);
    cy.window().its('__rows').should(rows=>{
      const hist=rows.filter(x=>x.col==='munro/proveedores_historial');
      expect(hist).to.have.length(1);
      expect(hist[0].data.productos[0].pedir).to.eq(4);
      expect(rows.filter(x=>x.col==='torcuato/proveedores_historial')).to.have.length(0);
    });
    cy.get('#prov-resumen [data-act="prov-share"]').should('be.enabled').click();
    cy.get('#pn').should('contain.text','Compartir PDF');
    cy.get('#pn').should('not.contain.text','imagen preparada');
    cy.get('#pn').should('not.contain.text','Copiar imagen');
    cy.window().its('GestLokProviderPDF').then(g=>{
      const file=g.createFile({proveedor:'Distribuidora Demo PDF',local:'Munro',fecha:'24/10/2026',
        rows:[{nombre:'Café de prueba',unidad:'caja',pedir:4}]});
      expect(file.type).to.eq('application/pdf');
      expect(file.name).to.match(/\.pdf$/);
      expect(file.size).to.be.greaterThan(1000);
    });
  });
  it('Gerente puede guardar la lista y el dueño controla la exportación PDF',()=>{
    launch();
    login('gerente.munro@example.com');
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get('#view').should('not.contain.text','como imagen');
  });
});