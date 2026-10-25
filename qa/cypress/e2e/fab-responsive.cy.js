/* global Cypress, describe, it, cy, expect */
import { abrirLocal } from '../helpers/abrir-local';
describe('GestLok Stock Local: categorías y planilla responsive',()=>{
  Cypress.on('uncaught:exception',e=>{
    if(e.message.includes('Minified React error #418'))return false;
  });
  it('mantiene categorías, cantidades y controles en tablet, celular y desktop',()=>{
    cy.task('mockSupabase').then(fake=>{
      cy.intercept('GET','**/vendor/supabase.js',{
        statusCode:200,headers:{'content-type':'application/javascript'},body:fake
      }).as('mockSupabase');
    });
    cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
    cy.viewport(1280,900);
    cy.visit('/');
    cy.wait('@mockSupabase');
    cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
    cy.get('#au-email').type('dueno@example.com');
    cy.get('#au-pass').type('secreto1',{log:false});
    cy.get('#au-in button[type="submit"]').click();
    abrirLocal('munro');
    cy.get('#snav [data-go="fabrica"]').click();
    cy.viewport(820,1000);
    cy.get('#view .xl-r.xl-bq').should('have.length.greaterThan',1);
    cy.get('#view .xl-r.xl-bq').first().should('be.visible');
    cy.get('#view .xl-bq .gl-bq-count').first().should('contain.text','productos');
    cy.get('#fr-f-001').should('be.visible').then($row=>{
      expect(getComputedStyle($row[0]).gridTemplateAreas).to.include('product total local factory');
    });
    cy.get('[data-act="fstep"][data-id="f-001"][data-field="l"][data-delta="1"]').click();
    cy.get('#fl-f-001').should('have.value','1');
    cy.get('.xl-bq [data-act="fab-toggle-block"][data-b="1"]').click();
    cy.get('#fr-f-001').should('not.be.visible');
    cy.get('.xl-bq[data-bloque="2"]').should('be.visible');
    cy.get('.xl-bq [data-act="fab-toggle-block"][data-b="1"]').click();
    cy.get('#fr-f-001').should('be.visible');
    cy.get('#fl-f-001').should('have.value','1');
    cy.viewport(390,844);
    cy.get('#fr-f-001').then($row=>{
      expect(getComputedStyle($row[0]).gridTemplateAreas).to.include('product product');
      expect(getComputedStyle($row[0]).gridTemplateAreas).to.include('local factory');
    });
    cy.get('#fr-f-001 .xl-stepper').should('have.length',2);
    cy.get('#fr-f-001 .fq button').should('have.length',3);
    cy.get('.xl-bq').first().should('be.visible');
    cy.viewport(1280,900);
    cy.get('.xl-bq .gl-bq-toggle').first().should('not.be.visible');
    cy.get('#fr-f-001').should('be.visible');
    cy.get('#fl-f-001').should('have.value','1');
  });
});
