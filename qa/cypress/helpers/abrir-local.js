/* global cy */
// Entra a un local desde el inicio: el dueño lo elige en el selector de «Administrar mi empresa»;
// el gerente y los demás roles lo ven directamente en la lista de locales.
export const abrirLocal = id => {
  cy.get('#hub [data-act="local"], #hub .gl-owner-business .gl-owner-arrow', { timeout: 15000 }).first().then($el => {
    if ($el.is('.gl-owner-arrow')) {
      cy.wrap($el).click();
      cy.get(`#pn [data-act="local"][data-id="${id}"]`).first().click();
    } else {
      cy.get(`#hub [data-act="local"][data-id="${id}"]`).first().click();
    }
  });
  // La creadora entra por las dos áreas; los recorridos operativos abren la comercial.
  cy.get('#view .gl-owner-business, #view .gl-home-essential, #view .bar', {timeout:15000}).first().then($view => {
    if ($view.is('.gl-owner-business')) cy.wrap($view).find('[data-owner-nav="business"]').click();
  });
};
