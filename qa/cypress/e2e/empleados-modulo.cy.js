/* global Cypress, cy, describe, it */
// «Administrar a los empleados»: la carpeta solo aparece con autorización del backend y abre el módulo
// integrado en la misma aplicación. Sin datos reales: Supabase simulado y conexiones externas bloqueadas.
function start(email = 'dueno@example.com', staff = false) {
  cy.task('mockSupabase').then(body => cy.intercept('GET', '**/vendor/supabase.js', { statusCode: 200, headers: { 'content-type': 'application/javascript' }, body }).as('fake'));
  cy.intercept('**/*.supabase.co/**', { forceNetworkError: true });
  cy.visit('/'); cy.wait('@fake');
  cy.get('.gl-intro', { timeout: 12000 }).should('not.be.visible');
  cy.window().then(w => {
    w.__staffModule = staff;
    const me = w.__rows.find(r => r.col === 'equipo' && r.id === 'dueno@example.com');
    if (me) me.data.logoId = 'mi-gusto';
  });
  cy.get('#au-email').type(email); cy.get('#au-pass').type('secreto1', { log: false }); cy.get('#au-in button[type="submit"]').click();
}
describe('GESTLOK · carpeta Administrar a los empleados', () => {
  Cypress.on('uncaught:exception', e => { if (e.message.includes('Minified React error #418')) return false; });
  it('dueño con el módulo habilitado ve las dos carpetas con el logo de su empresa', () => {
    cy.viewport(390, 844); start('dueno@example.com', true);
    cy.get('#hub .gl-owner-landing').should('be.visible').and('contain.text', 'Bienvenido/a a').and('contain.text', 'Todo lo que necesitás, en un solo lugar.');
    cy.get('#hub .gl-owner-welcome-logo img').should('have.attr', 'src', 'img/mi-gusto-blanco.png').and('have.attr', 'alt', 'Mi Gusto');
    cy.get('#hub .gl-owner-business').should('contain.text', 'Administrar mi empresa');
    cy.get('#hub .gl-owner-employees').should('contain.text', 'Administrar a los empleados').and('contain.text', 'Recibos de sueldo');
    cy.get('#hub [data-owner-area-staff]').should('be.visible');
    cy.document().then(d => expect(d.documentElement.scrollWidth).to.be.at.most(390));
  });
  it('sin habilitación de la creadora la carpeta de empleados no existe', () => {
    start('dueno@example.com', false);
    cy.get('#hub .gl-owner-business').should('contain.text', 'Administrar mi empresa');
    cy.get('#hub .gl-owner-employees').should('not.exist');
    cy.get('#hub [data-owner-area-staff]').should('not.exist');
  });
  it('la carpeta abre el módulo integrado en la misma dirección, con barra GESTLOK y regreso al inicio', () => {
    start('dueno@example.com', true);
    cy.get('#hub [data-owner-area-staff]').click();
    cy.location('pathname', { timeout: 15000 }).should('eq', '/empleados/');
    cy.get('.gestlok-module-bar').should('be.visible').and('contain.text', 'Administrar a los empleados');
    cy.get('.gestlok-module-back').should('have.attr', 'href', '/');
    cy.contains('button', 'Continuar con Google', { timeout: 15000 }).should('be.visible');
    cy.get('footer[aria-label="Documentos legales de GESTLOK Empleados"]').should('exist');
  });
  it('la creadora asigna el módulo por empresa con confirmación y queda registrado', () => {
    start('kmu15lopez@gmail.com', false);
    cy.get('[aria-label="Módulos autorizados"]', { timeout: 12000 }).should('contain.text', 'Empresa ficticia').and('contain.text', 'Sin organización de ReciboNet vinculada');
    cy.get('[aria-label="Empresas registradas"] button').should('not.exist');
    cy.on('window:confirm', () => true);
    cy.get('[data-owner-module="cb0dc04a-9a13-434f-a3d0-47f1d8f39670"][data-enable="true"]').click();
    cy.window().its('__staffModule').should('eq', true);
    cy.get('[aria-label="Módulos autorizados"]').should('contain.text', 'Empleados habilitado');
    cy.get('[data-owner-module="cb0dc04a-9a13-434f-a3d0-47f1d8f39670"][data-enable="false"]').should('contain.text', 'Deshabilitar');
  });
});
