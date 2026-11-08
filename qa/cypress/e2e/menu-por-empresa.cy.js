/* global Cypress, cy, describe, it */
// Menú por empresa (08/11/2026): El Molino Café ve solo su microapp «Vínculo entre sucursales».
// La creadora ve el mismo menú e Inicio que el dueño. Mi Gusto conserva su menú completo.
// Sin datos reales: Supabase simulado y conexiones externas bloqueadas.
const MOLINO = '6c8717ea-5f78-426b-9458-74a5dcac6e4e';
function login(email, molino) {
  cy.task('mockSupabase').then(body => cy.intercept('GET', '**/vendor/supabase.js', { statusCode: 200, headers: { 'content-type': 'application/javascript' }, body }).as('fake'));
  cy.intercept('**/*.supabase.co/**', { forceNetworkError: true });
  cy.visit('/'); cy.wait('@fake');
  cy.get('.gl-intro', { timeout: 12000 }).should('not.be.visible');
  cy.window().then(w => {
    w.__dashboard = true;
    if (molino) { w.__tenantOverride = MOLINO; w.__companyOverride = 'El Molino Café'; }
  });
  cy.get('#au-email').clear().type(email); cy.get('#au-pass').type('secreto1', { log: false }); cy.get('#au-in button[type="submit"]').click();
}
function creadoraEntra(local) {
  cy.get('.gl-ch-nav [data-ch-tab="locales"]', { timeout: 15000 }).click();
  cy.get('#hub .gl-company-folder').filter((_, folder) => !!folder.querySelector('[data-act="local"][data-id="' + local + '"]')).first().as('folder');
  cy.get('@folder').find('summary').click();
  cy.get('@folder').find('[data-act="local"][data-id="' + local + '"]').should('be.visible').click();
}
const NO_MOLINO = ['Stock Local', 'Proveedores', 'Chat del local', 'Vencimientos', 'Avisos', 'Ingreso de mercadería', 'Agregar hoja', 'Conteo', 'Pedido', 'Administración de local', 'Reclamos Internos', 'Editar categorías', 'Más herramientas'];
function menuSoloMolino() {
  cy.get('#snav').should('be.visible');
  cy.get('#snav').should('contain.text', 'Inicio').and('contain.text', 'Vínculo entre sucursales');
  for (const k of ['precios', 'envios', 'devoluciones', 'historial']) cy.get('#snav [data-mol-nav="' + k + '"]').should('be.visible');
  cy.get('#snav [data-go]').should('have.length', 1).and('have.attr', 'data-go', 'inicio');
  for (const t of NO_MOLINO) cy.get('#snav').should('not.contain.text', t);
  cy.get('#gl-edit-menu').should('not.exist');
  cy.get('#snav [data-admin-tools]').should('not.exist');
  cy.get('#btn-ajustes').should('not.be.visible');
}
function inicioMolino() {
  cy.get('#view .gl-empresa-home').should('be.visible');
  cy.get('#view .gl-molino-home').should('contain.text', 'Vínculo entre sucursales');
  cy.get('#view .gl-owner-quick').should('not.exist');
  cy.get('#view').should('not.contain.text', 'Reportes generales').and('not.contain.text', 'Mi cuenta');
  cy.get('#gl-soporte-whatsapp').should('be.visible').and('have.attr', 'href').and('match', /^https:\/\/wa\.me\/5491144715168\?text=/);
}
describe('Menú por empresa · El Molino Café y Mi Gusto', () => {
  Cypress.on('uncaught:exception', e => { if (e.message.includes('Minified React error #418')) return false; });

  it('el dueño de El Molino ve solo el Vínculo entre sucursales en el menú y en Inicio', () => {
    cy.viewport(1280, 900); login('dueno@example.com', true);
    cy.get('.gl-oh-top [data-owner-nav="menu"]', { timeout: 15000 }).click();
    cy.get('#pn [data-owner-nav="business"]').click();
    cy.get('#pn [data-act="local"][data-id="munro"]').first().click();
    menuSoloMolino();
    inicioMolino();
    cy.get('#snav [data-mol-nav="precios"]').click();
    cy.get('#gl-molino-panel').should('be.visible').and('contain.text', 'Precios compartidos');
    // El soporte sigue disponible dentro del Vínculo, con el sector actual en el mensaje.
    cy.get('#gl-soporte-whatsapp').should('be.visible').invoke('attr', 'href').should(url => {
      const text = decodeURIComponent(url);
      if (!text.includes('El Molino Café')) throw Error('Falta la empresa en el mensaje: ' + text);
      if (!text.includes('Vínculo entre sucursales / Precios')) throw Error('Falta el sector: ' + text);
    });
    cy.get('#gl-molino-close').click();
    cy.get('#gl-molino-panel').should('not.exist');
  });

  it('la creadora ve exactamente el mismo menú e Inicio que el dueño de El Molino', () => {
    cy.viewport(1280, 900); login('kmu15lopez@gmail.com', true);
    creadoraEntra('munro');
    menuSoloMolino();
    inicioMolino();
    cy.get('#snav [data-act="locales"]').should('contain.text', 'Locales');
    // Cerrar sesión sigue en el perfil de usuario.
    cy.get('#gl-nav-logout, #gl-profile-switch-trigger').should('exist');
  });

  it('en el celular la barra inferior de El Molino muestra solo sus secciones', () => {
    cy.viewport(390, 844); login('dueno@example.com', true);
    cy.get('.gl-oh-top [data-owner-nav="menu"]', { timeout: 15000 }).click();
    cy.get('#pn [data-owner-nav="business"]').click();
    cy.get('#pn [data-act="local"][data-id="munro"]').first().click();
    cy.get('#gestlok-mobile-dock').should('be.visible');
    cy.get('#gestlok-mobile-dock [data-dock="mol-precios"]').should('be.visible');
    cy.get('#gestlok-mobile-dock [data-dock="mol-envios"]').should('be.visible');
    cy.get('#gestlok-mobile-dock [data-dock="stock"], #gestlok-mobile-dock [data-dock="pagos"]').should('not.exist');
    cy.get('#gestlok-mobile-dock [data-dock="mol-envios"]').click();
    cy.get('#gl-molino-panel').should('be.visible').and('contain.text', 'Productos enviados');
    cy.get('#gl-soporte-whatsapp').should('be.visible');
    cy.document().then(d => { if (d.documentElement.scrollWidth > 390) throw Error('Desborde horizontal'); });
  });

  it('Mi Gusto conserva su menú completo y la creadora lo ve sin «Más herramientas»', () => {
    cy.viewport(1280, 900); login('kmu15lopez@gmail.com', false);
    creadoraEntra('munro');
    cy.get('#view [data-owner-nav="business"]').click();
    cy.get('#snav [data-go="stock"]').should('exist');
    cy.get('#snav [data-go="proveedores"]').should('be.visible');
    cy.get('#snav [data-go="chat"]').should('be.visible');
    cy.get('#snav [data-mol-nav]').should('not.exist');
    cy.get('#snav [data-admin-tools]').should('not.exist');
    cy.get('#gl-edit-menu').should('exist');
    cy.get('#btn-ajustes').should('be.visible');
  });
});
