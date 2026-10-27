/* global Cypress, cy, describe, it, expect */
import { abrirLocal } from '../helpers/abrir-local';
describe('Observaciones internas de Proveedores · ambos locales',()=>{
  Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
  for(const local of ['munro','torcuato'])it(`muestra, guarda y recupera la observación en ${local}`,()=>{
    cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body}).as('fake'));
    cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
    cy.visit('/');cy.wait('@fake');
    cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
    cy.window().then(w=>w.__rows.push({col:local+'/productos',id:'p-note',data:{nombre:'Producto ficticio',proveedor:'Proveedor Demo Notas',cat:'General',stock:5,orden:1000}}));
    cy.get('#au-email').clear().type('dueno@example.com');
    cy.get('#au-pass').type('secreto1',{log:false});
    cy.get('#au-in button[type="submit"]').click();
    abrirLocal(local);
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get('[data-act="prov-open"][data-name="Proveedor Demo Notas"]').click();
    cy.get('[data-prov-note="c:p-note"]').should('be.visible').type('Mensaje interno ficticio');
    cy.contains('button','Guardar stock').click();
    cy.window().its('__rows').should(rows=>{
      const provider=rows.find(r=>r.col===local+'/proveedores'&&r.data.nombre==='Proveedor Demo Notas');
      expect(provider.data.catalogo['p-note'].observacion).to.eq('Mensaje interno ficticio');
      expect(rows.filter(r=>r.col===(local==='munro'?'torcuato':'munro')+'/proveedores').some(r=>r.data.nombre==='Proveedor Demo Notas')).to.eq(false);
    });
    cy.get('#snav [data-go="inicio"]').click();
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get('[data-act="prov-open"][data-name="Proveedor Demo Notas"]').click();
    cy.get('[data-prov-note="c:p-note"]').should('have.value','Mensaje interno ficticio');
    cy.get('#prov-resumen').should('not.contain.text','Mensaje interno ficticio');
  });
});
