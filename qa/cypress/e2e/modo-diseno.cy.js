/* global Cypress, cy, describe, it */
// Modo diseño (09/11/2026): la creadora edita un texto, lo ve después de volver a la pantalla
// y agrega un bloque. El dueño no ve el botón. Supabase simulado; sin datos reales.
function login(email) {
  cy.task('mockSupabase').then(body => cy.intercept('GET', '**/vendor/supabase.js', { statusCode: 200, headers: { 'content-type': 'application/javascript' }, body }).as('fake'));
  cy.intercept('**/*.supabase.co/**', { forceNetworkError: true });
  cy.visit('/'); cy.wait('@fake');
  cy.get('.gl-intro', { timeout: 12000 }).should('not.be.visible');
  cy.window().then(w => { w.__dashboard = true; w.__designRows = []; });
  cy.get('#au-email').clear().type(email); cy.get('#au-pass').type('secreto1', { log: false }); cy.get('#au-in button[type="submit"]').click();
}
describe('Modo diseño de la Administradora General', () => {
  Cypress.on('uncaught:exception', e => { if (e.message.includes('Minified React error #418')) return false; });

  it('edita un texto, se mantiene al volver y agrega un bloque nuevo', () => {
    cy.viewport(1280, 900); login('kmu15lopez@gmail.com');
    cy.get('.gl-ch-nav [data-ch-tab="locales"]', { timeout: 15000 }).click();
    cy.get('#hub .gl-company-folder').filter((_, f) => !!f.querySelector('[data-act="local"][data-id="munro"]')).first().as('folder');
    cy.get('@folder').find('summary').click();
    cy.get('@folder').find('[data-act="local"][data-id="munro"]').click();
    cy.get('#snav [data-go="proveedores"]').click({ force: true });
    cy.get('#gl-design-toggle', { timeout: 10000 }).should('be.visible').click();
    cy.get('#gl-design-bar').should('contain.text', 'Modo diseño');
    cy.get('#view h1, #view h2, #view h3, #view p').filter((_, e) => e.children.length === 0 && e.textContent.trim().length > 0).first()
      .invoke('attr', 'id', 'gd-target').click();
    cy.get('[data-gd="edit"]').click();
    cy.get('#gd-target').then($e => { $e[0].textContent = 'Texto de la diseñadora'; });
    cy.get('[data-gd="save-text"]').click();
    cy.get('#gl-design-bar').should('contain.text', 'Texto guardado');
    cy.window().its('__designRows').should('have.length', 1);
    // Mientras diseña, tocar el menú no navega.
    cy.get('#snav [data-go="inicio"]').click({ force: true });
    cy.get('#snav [data-go="proveedores"]').should('have.attr', 'aria-current', 'page');
    cy.get('#gl-design-toggle').click();
    cy.get('#snav [data-go="inicio"]').click({ force: true });
    cy.get('#snav [data-go="proveedores"]').click({ force: true });
    cy.contains('#view *', 'Texto de la diseñadora').should('exist');
    cy.get('#gl-design-toggle').click();
    cy.contains('#view *', 'Texto de la diseñadora').click();
    cy.get('[data-gd="add"]').click();
    cy.get('#gl-design-text').type('Botón Exportar PDF{enter}Que descargue el resumen');
    cy.get('[data-gd="save-block"]').click();
    cy.get('.gl-design-block').should('contain.text', 'Botón Exportar PDF');
    cy.window().its('__designRows').should('have.length', 2);
  });

  it('el dueño no ve el botón de diseño', () => {
    cy.viewport(1280, 900); login('dueno@example.com');
    cy.get('#hub .gl-owner-landing', { timeout: 15000 }).should('be.visible');
    cy.wait(800);
    cy.get('#gl-design-toggle').should('not.exist');
  });
});
