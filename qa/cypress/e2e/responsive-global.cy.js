/* global Cypress, describe, it, cy, expect */
describe('GESTLOK · diseño adaptativo global',()=>{
  Cypress.on('uncaught:exception',e=>{
    if(e.message.includes('Minified React error #418'))return false;
  });
  const visitLogin=(width,height=844)=>{
    cy.viewport(width,height);
    cy.task('mockSupabase').then(mock=>{
      cy.intercept('GET','**/vendor/supabase.js',{
        statusCode:200,headers:{'content-type':'application/javascript'},body:mock
      }).as('supabaseMock');
    });
    cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
    cy.visit('/');cy.wait('@supabaseMock');
    cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
    cy.get('#au-in').should('be.visible');
  };
  for(const width of [360,390,430]){
    it('teléfono '+width+'px: login casi a ancho completo, legible y sin zoom',()=>{
      visitLogin(width);
      cy.get('#auth .au-card').then($el=>{
        const rect=$el[0].getBoundingClientRect();
        expect(rect.width).to.be.greaterThan(width-45);
        expect(rect.width).to.be.lessThan(width+1);
        expect(rect.left).to.be.gte(0);
        expect(rect.right).to.be.lte(width);
      });
      cy.get('#au-in h1').should('be.visible').and('contain.text','Bienvenido');
      cy.get('#au-email').should('have.css','font-size','16px');
      cy.get('#au-pass').should('have.css','font-size','16px');
      cy.get('#au-in .gbtn').should('have.css','min-height','54px');
      cy.get('#au-in .gl-visitor-entry').should('be.visible');
      cy.document().then(doc=>{
        expect(doc.documentElement.scrollWidth).to.be.at.most(width+1);
      });
    });
  }
  it('tablet 768px: formulario centrado, no estirado y sin scroll horizontal',()=>{
    visitLogin(768,1024);
    cy.get('#auth .au-card').then($el=>{
      const rect=$el[0].getBoundingClientRect();
      expect(rect.width).to.be.greaterThan(480);
      expect(rect.width).to.be.lessThan(610);
      expect(Math.abs(rect.left-(768-rect.right))).to.be.lessThan(5);
    });
  });
  it('PC 1280px: formulario equilibrado y sin ocupar toda la pantalla',()=>{
    visitLogin(1280,900);
    cy.get('#auth .au-card').then($el=>{
      const rect=$el[0].getBoundingClientRect();
      expect(rect.width).to.be.lessThan(600);
      expect(rect.width).to.be.greaterThan(400);
    });
  });
  it('gerente en celular: dos carpetas principales apiladas en vez de reducidas',()=>{
    cy.viewport(390,844);
    cy.task('mockSupabase').then(mock=>{
      cy.intercept('GET','**/vendor/supabase.js',{
        statusCode:200,headers:{'content-type':'application/javascript'},body:mock
      }).as('supabaseMock');
    });
    cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
    cy.visit('/');cy.wait('@supabaseMock');
    cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
    cy.get('#au-email').clear().type('gerente.munro@example.com');
    cy.get('#au-pass').type('secreto1',{log:false});
    cy.get('#au-in button[type="submit"]').click();
    cy.get('#view .gl-manager-landing',{timeout:15000}).should('be.visible');
    cy.get('.gl-owner-areas .gl-owner-area').then($els=>{
      expect($els.length).to.be.greaterThan(0);
      const bounds=$els[0].getBoundingClientRect();
      expect(bounds.width).to.be.greaterThan(300);
      expect(bounds.width).to.be.lessThan(390);
    });
    cy.get('#gestlok-mobile-dock').should('be.visible');
  });
});