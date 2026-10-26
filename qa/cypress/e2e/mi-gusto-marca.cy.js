/* global Cypress, cy, describe, it, beforeEach */
// Comprobaciones con datos ficticios: la marca es del tenant, no de una ficha personal.
const iniciar=email=>{
  cy.get('#au-email').type(email);
  cy.get('#au-pass').type('secreto1',{log:false});
  cy.get('#au-in button[type="submit"]').click();
};
const verificarMarca=()=>{
  cy.get('#app').should('be.visible');
  cy.get('#side .gestlok-company-identity').should('be.visible')
    .and('contain.text','Empanadas de Verdad');
  cy.get('#side .gestlok-company-identity img')
    .should('have.attr','src','img/mi-gusto-blanco.png')
    .and('have.attr','alt','Mi Gusto');
};
describe('Identidad Mi Gusto para el equipo autorizado',()=>{
  Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
  beforeEach(()=>{
    cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{
      statusCode:200,headers:{'content-type':'application/javascript'},body
    }).as('mockSupabase'));
    cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
    cy.visit('/');cy.wait('@mockSupabase');
    cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
    cy.get('.gestlok-company-identity').should('not.exist');
  });
  it('ambos locales: el dueño ve logo y eslogan en inicio y dentro del local',()=>{
    cy.window().then(w=>{
      w.__rows.find(r=>r.col==='equipo'&&r.id==='dueno@example.com').data.logoId='mi-gusto';
    });
    iniciar('dueno@example.com');
    cy.get('#hub .gl-oh-brand-company').should('contain.text','Empanadas de Verdad');
    cy.get('#hub .gl-owner-welcome-logo img').should('have.attr','alt','Mi Gusto');
    cy.get('#hub .gl-owner-business .gl-owner-arrow').first().click();
    cy.get('#pn [data-act="local"][data-id="torcuato"]').click();
    verificarMarca();
  });
  it('Gerente de Munro ve la marca sin logoId individual',()=>{
    iniciar('gerente.munro@example.com');
    verificarMarca();
    cy.get('#brand-local').should('contain.text','Munro');
    cy.get('#snav [data-act="locales"]').should('not.exist');
  });
  it('Gerente de Torcuato ve la misma marca sin acceder al otro local',()=>{
    iniciar('gerente.torcuato@example.com');
    verificarMarca();
    cy.get('#brand-local').should('contain.text','Torcuato');
    cy.get('#snav [data-act="locales"]').should('not.exist');
  });
  it('Usuario Solo ver de Munro ve el eslogan sin permisos de edición',()=>{
    iniciar('lectura@example.com');
    verificarMarca();
    cy.get('#sb-save').should('be.disabled');
  });
  it('Rol editor se normaliza a gerente y conserva la marca',()=>{
    cy.window().then(w=>{
      w.__rows.find(r=>r.col==='equipo'&&r.id==='gerente.munro@example.com').data.rol='editor';
    });
    iniciar('gerente.munro@example.com');
    verificarMarca();
  });
  it('La creadora conserva la marca neutral en el panel general',()=>{
    iniciar('kmu15lopez@gmail.com');
    cy.get('#hub .gl-admin').should('be.visible');
    cy.get('#hub .gestlok-company-identity').should('not.exist');
    cy.get('#hub').should('not.contain.text','Empanadas de Verdad');
  });
  it('La cuenta no aprobada no ve marca privada ni local',()=>{
    iniciar('otro@example.com');
    cy.get('#auth [data-mode="pend"]').should('be.visible');
    cy.get('#app').should('not.be.visible');
    cy.get('.gestlok-company-identity').should('not.exist');
  });
});
