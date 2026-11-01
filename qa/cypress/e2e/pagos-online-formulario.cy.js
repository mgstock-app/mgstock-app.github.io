/* global describe, it, cy, Cypress */
// Pagos Online (Munro y Torcuato) con datos ficticios: el simulador reemplaza a Supabase.
// Después de guardar una comanda, el formulario queda vacío para cargar la siguiente
// y el navegador no ofrece comandas, montos ni observaciones anteriores.
const entrar = (email) => {
  cy.viewport(1280, 900);
  cy.task('mockSupabase').then((fake) => {
    cy.intercept('GET', '**/vendor/supabase.js', { statusCode: 200, headers: { 'content-type': 'application/javascript' }, body: fake }).as('mock');
  });
  cy.intercept('**/*.supabase.co/**', { forceNetworkError: true });
  cy.visit('/');
  cy.wait('@mock');
  cy.get('.gl-intro', { timeout: 15000 }).should('not.be.visible');
  cy.get('#au-email').clear().type(email);
  cy.get('#au-pass').type('secreto1', { log: false });
  cy.get('#au-in button[type="submit"]').click();
  // Si el gerente entra por la portada de áreas, abrir la comercial.
  cy.get('#view .gl-owner-business, #view .gl-home-essential, #view .bar', { timeout: 15000 }).first().then(($view) => {
    if ($view.is('.gl-owner-business')) cy.get('#view [data-owner-nav="business"], #view [data-gerente-business]').first().click();
  });
  cy.get('#snav > button[data-go="cierre-online"]', { timeout: 15000 }).click();
  cy.get('#ttl').should('contain.text', 'Pagos Online');
  cy.get('#mg-online-form', { timeout: 15000 }).should('be.visible');
};
const cargar = ({ comanda, monto, metodo, app, nota }) => {
  cy.get('#mg-online-form input[name="comanda"]').clear().type(comanda);
  cy.get('#mg-online-form input[name="amount"]').clear().type(monto);
  if (metodo) cy.get('#mg-online-form select[name="method"]').select(metodo);
  if (app) cy.get('#mg-online-form input[name="app"]').check({ force: true });
  if (nota) {
    cy.get('#mg-online-form .mg-on-observation-details summary').click();
    cy.get('#mg-online-form textarea[name="observacion"]').clear().type(nota);
  }
  cy.get('#mg-online-form button.mg-on-save').click();
};
const formularioVacio = () => {
  cy.get('#mg-online-form input[name="comanda"]').should('have.value', '');
  cy.get('#mg-online-form input[name="amount"]').should('have.value', '');
  cy.get('#mg-online-form select[name="method"]').should('have.value', 'transferencia');
  cy.get('#mg-online-form input[name="app"]').should('not.be.checked');
  cy.get('#mg-online-form textarea[name="observacion"]').should('have.value', '');
  cy.get('#mg-online-form .mg-on-observation-details').should('not.have.attr', 'open');
};

describe('GESTLOK · Pagos Online: formulario limpio después de guardar', () => {
  Cypress.on('uncaught:exception', (error) => {
    if (error.message.includes('Minified React error #418')) return false;
  });

  for (const [local, email] of [['munro', 'gerente.munro@example.com'], ['torcuato', 'gerente.torcuato@example.com']]) {
    it(`${local}: guarda, vacía todos los campos y no sugiere comandas anteriores`, () => {
      entrar(email);
      // Sin autocompletado del navegador en el formulario ni en sus campos.
      cy.get('#mg-online-form').should('have.attr', 'autocomplete', 'off');
      for (const field of ['input[name="comanda"]', 'input[name="amount"]', 'textarea[name="observacion"]'])
        cy.get('#mg-online-form ' + field).should('have.attr', 'autocomplete', 'off');

      cargar({ comanda: '36', monto: '1500', metodo: 'mercado_pago', app: true, nota: 'Retira más tarde' });
      cy.get('.mg-on-success').should('be.visible');
      formularioVacio();
      cy.get('.mg-on-recent').should('contain.text', '36');
      cy.window().its('__mgOnlineSaved').should((saved) => {
        expect(saved).to.have.length(1);
        expect(saved[0]).to.include({ local, comanda: '36', amount: 1500, method: 'mercado_pago', app: true, observacion: 'Retira más tarde' });
      });

      // La siguiente comanda arranca de cero y se guarda con sus propios datos.
      cargar({ comanda: '37', monto: '200' });
      cy.get('.mg-on-success').should('be.visible');
      formularioVacio();
      cy.window().its('__mgOnlineSaved').should((saved) => {
        expect(saved).to.have.length(2);
        expect(saved[1]).to.include({ local, comanda: '37', amount: 200, method: 'transferencia', app: false, observacion: '' });
      });
    });
  }

  it('si el guardado falla, los datos escritos se conservan para reintentar', () => {
    entrar('gerente.munro@example.com');
    cy.window().then((w) => { w.__mgOnlineSaveFail = true; });
    cargar({ comanda: '38', monto: '300' });
    cy.get('.mg-on-error').should('be.visible');
    cy.get('#mg-online-form input[name="comanda"]').should('have.value', '38');
    cy.get('#mg-online-form input[name="amount"]').should('have.value', '300');
    cy.window().then((w) => { expect(w.__mgOnlineSaved || []).to.have.length(0); });
  });
});
