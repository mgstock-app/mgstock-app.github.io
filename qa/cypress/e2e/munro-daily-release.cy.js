/* global Cypress, describe, beforeEach, it, cy, expect */
// Pruebas aisladas: Supabase falso; nunca consultan ni escriben datos reales.
const TENANT = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const login = email => {
  cy.get('#au-email').type(email);
  cy.get('#au-pass').type('secreto1', {log:false});
  cy.get('#au-in button[type="submit"]').click();
};
const openLocal = local => cy.get(`#hub [data-act="local"][data-id="${local}"]`).first().click();

function launch(tenant = TENANT) {
  cy.task('mockSupabase').then(mock => {
    const fake = tenant === TENANT ? mock : mock.replaceAll(TENANT, tenant);
    cy.intercept('GET', '**/vendor/supabase.js', {
      statusCode:200, headers:{'content-type':'application/javascript'}, body:fake
    }).as('fakeSupabase');
  });
  cy.intercept('**/*.supabase.co/**', {forceNetworkError:true});
  cy.visit('/');
  cy.wait('@fakeSupabase');
  cy.get('.gl-intro', {timeout:12000}).should('not.be.visible');
  cy.get('#au-in').should('be.visible');
}

describe('Munro: cierre diario exclusivo, roles e historial', () => {
  Cypress.on('uncaught:exception', error => {
    if (error.message.includes('Minified React error #418')) return false;
  });
  beforeEach(() => launch());

  it('la dueña no ve Conteo diario ni en Munro ni en Torcuato, tampoco en Inicio', () => {
    login('dueno@example.com');
    openLocal('munro');
    cy.get('#snav [data-go="diario"]').should('not.exist');
    cy.get('.gl-today-action[data-go="diario"]').should('not.exist');
    cy.get('#snav [data-act="locales"]').click();
    openLocal('torcuato');
    cy.get('#snav [data-go="diario"]').should('not.exist');
    cy.get('.gl-today-action[data-go="diario"]').should('not.exist');
  });

  it('gerente de Torcuato y cuenta de lectura no acceden al cierre de Munro', () => {
    login('gerente.torcuato@example.com');
    cy.get('#brand-local').should('contain.text','Torcuato');
    cy.get('#snav [data-go="diario"]').should('not.exist');
    cy.get('.gl-today-action[data-go="diario"]').should('not.exist');
    cy.window().its('__rows').should(rows => {
      expect(rows.some(r => r.col === 'torcuato/munro_control')).to.eq(false);
    });
  });

  it('gerente Munro puede contar; diferencias e historial no alteran stock operativo', () => {
    login('gerente.munro@example.com');
    cy.get('#snav [data-go="diario"]').should('exist').click();
    cy.get('.md-grupo').should('have.length',2);
    cy.get('#view').should('contain.text','Empanadas').and('contain.text','Pizzas');
    cy.get('#diario-fecha').clear().type('2026-10-24').blur();
    cy.get('[data-md-expected="empanadas"]').should('contain.text','2.149');
    cy.get('[data-md-expected="pizza-grande"]').should('contain.text','34');
    cy.get('[data-md-act="edit"]').click();
    cy.get('[data-md-id="empanadas"][data-md-field="contado"]').clear().type('2147');
    cy.get('[data-md-diff="empanadas"]').should('contain.text','-2');
    cy.get('[data-md-act="save"]').click();
    cy.window().its('__rows').should(rows => {
      const logs=rows.filter(r => r.col==='munro/munro_control' && r.data.tipo==='cierre');
      expect(logs).to.have.length(1);
      expect(logs[0].data.filas.find(p=>p.id==='empanadas').contado).to.eq(2147);
      expect(rows.find(r=>r.col==='munro/productos' && r.id==='p-001').data.stock).to.eq(null);
      expect(rows.some(r=>r.col==='torcuato/munro_control')).to.eq(false);
    });
    cy.get('[data-md-act="edit"]').click();
    cy.get('[data-md-id="empanadas"][data-md-field="contado"]').clear().type('2149');
    cy.get('[data-md-act="save"]').click();
    cy.window().its('__rows').should(rows => {
      const logs=rows.filter(r=>r.col==='munro/munro_control' && r.data.tipo==='cierre');
      expect(logs).to.have.length(2);
      expect(logs.map(r=>r.data.filas.find(p=>p.id==='empanadas').contado)).to.include.members([2147,2149]);
    });
    cy.get('.md-hist').should('contain.text','Historial de guardados (2)');
  });

  it('la creadora accede a Munro pero no aparece la herramienta al entrar en Torcuato', () => {
    login('kmu15lopez@gmail.com');
    openLocal('munro');
    cy.get('#snav [data-go="diario"]').should('exist');
    cy.get('.gl-today-action[data-go="diario"]').should('exist');
    cy.get('#snav [data-act="locales"]').click();
    openLocal('torcuato');
    cy.get('#snav [data-go="diario"]').should('not.exist');
    cy.get('.gl-today-action[data-go="diario"]').should('not.exist');
  });
});

describe('Munro: restricción por empresa', () => {
  Cypress.on('uncaught:exception', error => {
    if (error.message.includes('Minified React error #418')) return false;
  });
  it('un gerente de otra empresa no hereda la hoja aunque se llame Munro', () => {
    launch('00000000-0000-4000-8000-000000000111');
    login('gerente.munro@example.com');
    cy.get('#brand-local').should('contain.text','Munro');
    cy.get('#snav [data-go="diario"]').should('not.exist');
    cy.get('.gl-today-action[data-go="diario"]').should('not.exist');
  });
});
