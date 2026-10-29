/* global Cypress, describe, it, cy, expect */
describe('GESTLOK: ingreso móvil aprobado',()=>{
  Cypress.on('uncaught:exception',e=>{
    if(e.message.includes('Minified React error #418')) return false;
  });
  const open=()=>{
    cy.task('mockSupabase').then(fake=>{
      cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body:fake}).as('fakeAuth');
    });
    cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
    cy.visit('/');cy.wait('@fakeAuth');
    cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
    cy.get('#au-in').should('be.visible');
  };
  it('celular: logo grande, acceso claro, sin cuadro diminuto ni desborde',()=>{
    cy.viewport(390,844);open();
    cy.get('#auth .au-cover img').should('be.visible').and('have.attr','src','icons/gestlok-wordmark.svg');
    cy.get('#auth .au-cover').should('contain.text','Tu negocio, en orden.');
    cy.get('#au-in h1').should('have.text','Bienvenido a GestLok');
    cy.get('#au-in .gbtn').should('be.visible');
    cy.get('#au-email').should('be.visible').and('have.attr','autocomplete','email');
    cy.get('#au-pass').should('be.visible').and('have.attr','type','password');
    cy.get('#au-in button[type="submit"]').should('be.visible');
    cy.get('#au-demo-link').should('be.visible').and('have.attr','href','/?demo=1');
    cy.get('#auth .au-card').then(el=>{
      const bounds=el[0].getBoundingClientRect();
      expect(bounds.width).to.be.greaterThan(315);
      expect(bounds.top).to.be.lessThan(180);
      expect(bounds.left).to.be.gte(0);
      expect(bounds.right).to.be.lte(390);
    });
    cy.get('#au-email').should('not.be.focused');
    cy.get('#au-pass').should('not.be.focused');
    cy.get('#auth .au-cover').should('not.contain.text','Mi Gusto');
  });
  it('mostrar contraseña es funcional y no envía el formulario',()=>{
    cy.viewport(390,844);open();
    cy.get('#au-pass').type('claveVisual123',{log:false});
    cy.get('[data-au-password-toggle]').click().should('have.attr','aria-pressed','true').and('have.attr','aria-label','Ocultar contraseña');
    cy.get('#au-pass').should('have.attr','type','text').and('have.value','claveVisual123');
    cy.get('[data-au-password-toggle]').click().should('have.attr','aria-pressed','false');
    cy.get('#au-pass').should('have.attr','type','password');
    cy.get('#au-in').should('be.visible');
  });
});
