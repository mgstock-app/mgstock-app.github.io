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
};
