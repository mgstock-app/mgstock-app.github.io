/* global Cypress, cy, describe, it */
// Inicio del dueño según la referencia aprobada: cabecera, dos carpetas y accesos generales, todos con función real.
// Sin datos reales: Supabase simulado y conexiones externas bloqueadas.
function start(email = 'dueno@example.com', setup) {
  cy.task('mockSupabase').then(body => cy.intercept('GET', '**/vendor/supabase.js', { statusCode: 200, headers: { 'content-type': 'application/javascript' }, body }).as('fake'));
  cy.intercept('**/*.supabase.co/**', { forceNetworkError: true });
  cy.visit('/'); cy.wait('@fake');
  cy.get('.gl-intro', { timeout: 12000 }).should('not.be.visible');
  cy.window().then(w => {
    w.__staffModule = true;
    const me = w.__rows.find(r => r.col === 'equipo' && r.id === 'dueno@example.com');
    if (me) me.data.logoId = 'mi-gusto';
    if (setup) setup(w);
  });
  cy.get('#au-email').type(email); cy.get('#au-pass').type('secreto1', { log: false }); cy.get('#au-in button[type="submit"]').click();
}
describe('Inicio del dueño · cabecera, carpetas y accesos generales', () => {
  Cypress.on('uncaught:exception', e => { if (e.message.includes('Minified React error #418')) return false; });
  it('muestra la cabecera de GESTLOK y los cuatro accesos generales', () => {
    cy.viewport(1280, 900); start();
    cy.get('.gl-oh-top').should('be.visible').and('contain.text', 'GESTLOK').and('contain.text', 'ORGANIZA · CONTROLA · HACE CRECER');
    cy.get('.gl-oh-top [data-owner-nav="menu"]').should('be.visible');
    cy.get('.gl-oh-top [data-owner-nav="bell"]').should('be.visible');
    cy.get('.gl-oh-who').should('contain.text', 'Hola').and('contain.text', 'Dueño');
    cy.get('.gl-owner-quick .gl-owner-tile').should('have.length', 4);
    cy.get('.gl-owner-quick').should('contain.text', 'Reportes generales').and('contain.text', 'Mi cuenta').and('contain.text', 'Ajustes').and('contain.text', 'Soporte');
  });
  it('Reportes generales resume los dos locales y permite abrir cada uno', () => {
    start();
    cy.get('.gl-owner-tile[data-owner-nav="reports"]').click();
    cy.get('#pn table').should('contain.text', 'Munro').and('contain.text', 'Torcuato').and('contain.text', 'A pedir');
    cy.get('#pn [data-act="local"][data-id="torcuato"]').click();
    cy.get('#snav').should('be.visible');
  });
  it('Mi cuenta, Ajustes y el menú de usuario funcionan', () => {
    start();
    cy.get('.gl-oh-user').click();
    cy.get('.gl-oh-menu').should('be.visible'); cy.get('body').type('{esc}'); cy.get('.gl-oh-menu').should('not.exist');
    cy.get('.gl-owner-tile[data-owner-nav="account"]').click();
    cy.get('#pn').should('contain.text', 'dueno@example.com').and('contain.text', 'Munro'); cy.get('#pn [data-act="close"]').click();
    cy.get('.gl-owner-tile[data-owner-nav="settings"]').click();
    cy.get('#pn').should('contain.text', 'Equipo y accesos').and('contain.text', 'Modalidad').and('contain.text', 'Notificaciones');
    cy.get('#pn [data-owner-nav="bell"]').click(); cy.get('#pn').should('contain.text', 'Stock de tus locales');
  });
  it('el menú lateral lista las áreas y Soporte avisa si aún no hay número configurado', () => {
    start();
    cy.get('.gl-oh-top [data-owner-nav="menu"]').click();
    cy.get('#pn').should('contain.text', 'Administrar mi empresa').and('contain.text', 'Administrar a los empleados').and('contain.text', 'Salir');
    cy.get('#pn [data-owner-nav="home"]').click(); cy.get('#pn .gl-owner-navlist').should('not.exist');
    cy.get('.gl-owner-tile[data-owner-nav="support"]').click(); cy.get('#toast').should('contain.text', 'soporte');
  });
  it('un dueño nuevo de la misma empresa ve el logo y el nombre de la empresa', () => {
    start('nuevo-dueno@example.com', w => {
      w.__rows.push({ col: 'equipo', id: 'nuevo-dueno@example.com', data: { email: 'nuevo-dueno@example.com', rol: 'dueno' } });
    });
    cy.get('#hub .gl-owner-company-logo').should('have.attr', 'src', 'img/mi-gusto-blanco.png');
    cy.get('#hub .gl-owner-employees').should('exist');
  });
  it('en celular no hay desbordes horizontales', () => {
    cy.viewport(390, 844); start();
    cy.get('.gl-owner-quick').should('be.visible');
    cy.document().then(d => expect(d.documentElement.scrollWidth).to.be.at.most(390));
  });
});
