/* global Cypress, describe, it, cy, expect */
describe('DEMO · rediseño móvil, Colaboradores y legajos sin datos reales',()=>{
  Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
  function enter(role='dueno'){
    cy.task('mockSupabase').then(fake=>cy.intercept('GET','**/vendor/supabase.js',{
      statusCode:200,headers:{'content-type':'application/javascript'},body:fake
    }).as('fakeAuth'));
    cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
    cy.visit('/?demo=1&shop=mercado&role='+role);
    cy.wait('@fakeAuth');
    cy.get('#gl-tour-controls',{timeout:20000}).should('be.visible');
  }
  const stage=n=>cy.get('.gl-tour-nav [data-tour="'+n+'"]').first().click();
  it('celular: cinco etapas, dock blanco, fichas, búsqueda, cambio ficticio y Horarios existente',()=>{
    cy.viewport(390,844);enter();
    cy.get('#gl-visitor-bar').should('have.css','background-color','rgb(255, 255, 255)');
    cy.get('#gestlok-mobile-dock').should('be.visible');
    cy.get('.gl-tour-nav [data-tour]').should('have.length',7);
    stage(3);
    cy.get('#gl-demo-emp .gl-dh-directory',{timeout:10000}).should('be.visible');
    cy.get('#gl-demo-emp .gl-dh-person').should('have.length',8);
    cy.get('#gl-demo-emp .gl-dh-mobile-dock').should('be.visible');
    cy.get('#gl-demo-emp [data-dh-legajo="0"]').click();
    cy.get('#gl-dh-legajo').should('be.visible').and('contain.text','Sofía Ríos').and('contain.text','Encargada');
    cy.get('#gl-dh-status').select('inactivo');
    cy.get('#gl-demo-emp .gl-dh-summary').should('contain.text','Inactivos').and('contain.text','1');
    cy.get('#gl-demo-emp [data-dh-detail-close]').first().click();
    cy.get('#gl-dh-search').type('Nicol');
    cy.get('#gl-demo-emp .gl-dh-person:visible').should('have.length',1).and('contain.text','Nicolás Paz');
    cy.get('#gl-demo-emp [data-dh-match-count]').should('contain.text','1 colaboradores');
    cy.get('#gl-demo-emp .gl-dh-folders [data-dh-section="horarios"]').click();
    cy.get('#gl-demo-emp').should('contain.text','Plantilla GESTLOK (predeterminada)');
    cy.get('#gl-demo-emp .gl-dh-folders [data-dh-section="colaboradores"]').click();
    cy.get('#gl-dh-search').clear();
    cy.get('#gl-demo-emp .gl-dh-person:visible').should('have.length',8);
    cy.get('#gl-demo-emp .gl-dh-status--inactivo').should('have.length',1);
    cy.window().then(w=>expect(JSON.parse(w.sessionStorage.getItem('gestlok:visitor:horarios:v1')).employeeStates['Sofía Ríos']).eq('inactivo'));
    stage(4);
    cy.get('#gl-tour-review-form').should('be.visible');
    cy.get('#gestlok-mobile-dock').should('not.be.visible');
    cy.get('#gl-tour-gift').should('not.exist');
    cy.document().then(d=>expect(d.documentElement.scrollWidth).to.be.at.most(390));
  });
  it('gerente: ve colaboradores ficticios y sus estados, pero no recibos con montos',()=>{
    cy.viewport(390,844);enter('gerente');stage(3);
    cy.get('#gl-demo-emp .gl-dh-directory').should('be.visible');
    cy.get('#gl-demo-emp [data-dh-legajo="1"]').click();
    cy.get('#gl-dh-legajo').should('be.visible').and('contain.text','Lucas Ferreyra');
    cy.get('#gl-demo-emp [data-dh-receipt]').should('not.exist');
    cy.get('#gl-demo-emp').should('not.contain.text','$900.000');
    cy.get('#gl-demo-emp .gl-dh-folders [data-dh-section="horarios"]').click();
    cy.get('#gl-demo-emp').should('contain.text','Planilla de turnos del local');
  });
  it('en computadora se presenta la versión simulada de teléfono; las otras cuentas no cambian',()=>{
    cy.viewport(1240,850);enter();
    cy.get('#hub').should('be.visible').and('have.css','width','420px');
    cy.get('#gestlok-mobile-dock').should('be.visible');
    stage(3);
    cy.get('#gl-demo-emp').should('have.css','width','420px');
  });
});