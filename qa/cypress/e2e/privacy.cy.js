/* global describe, beforeEach, it, cy, Cypress */
const signIn = email => {
  cy.get('#au-in').should('be.visible');
  cy.get('#au-email').type(email);
  cy.get('#au-pass').type('secreto1', { log: false });
  cy.get('#au-in button[type=submit]').click();
};
const local = (id, width) => {
  cy.get('#hub').should('be.visible');
  cy.get(`.lcard [data-act="local"][data-id="${id}"]`).click();
  if (width < 700) cy.get('[data-act="menu-open"]').filter(':visible').click();
  cy.get('#snav [data-go="stock"]').click();
};
const signOut = width => {
  if (width < 700) cy.get('[data-act="menu-open"]').click();
  cy.get('#logout-wrap [data-au="out"]').should('be.visible').click();
  cy.wait('@fakeSupabase');
};
describe('Borradores privados en dispositivo compartido', () => {
  Cypress.on('uncaught:exception', error => {
    if (error.message.includes('Minified React error #418')) return false;
  });
  beforeEach(() => {
    cy.task('mockSupabase').then(mock => {
      cy.intercept('GET', '**/vendor/supabase.js', { statusCode: 200, headers: { 'content-type': 'application/javascript' }, body: mock }).as('fakeSupabase');
    });
    cy.intercept('**/*.supabase.co/**', { forceNetworkError: true });
  });
  for (const [id, width] of [['munro', 1280], ['torcuato', 390]]) {
    it(`${id}: conserva el borrador propio al salir y no lo carga en otra cuenta`, () => {
      cy.viewport(width, 844); cy.visit('/');
      cy.wait('@fakeSupabase');
      signIn('dueno@example.com'); local(id, width);
      cy.get('#inc-p-002').click();
      const keyA = `spm-draft-v2:${encodeURIComponent('dueno@example.com')}:${id}`;
      cy.window().then(win => {
        if (!JSON.parse(win.localStorage.getItem(keyA)).draft['p-002']) throw new Error('No se conservó el borrador A');
      });
      signOut(width);
      cy.get('#au-in').should('be.visible');
      signIn('admin@example.com'); local(id, width);
      cy.get('#sb-main').should('have.text', 'Sin cambios');
      cy.window().then(win => {
        if (!win.localStorage.getItem(keyA)) throw new Error('Se perdió el borrador A');
      });
      signOut(width);
      cy.get('#au-in').should('be.visible');
      signIn('dueno@example.com'); local(id, width);
      cy.get('#sb-main').should('contain.text', 'sin guardar');
    });
    it(`${id}: un borrador antiguo no se atribuye automáticamente a la cuenta entrante`, () => {
      cy.viewport(width, 844);
      cy.visit('/', { onBeforeLoad(win) { win.localStorage.setItem('spm-draft-' + id, '{"draft":{"p-002":999}}'); } });
      cy.wait('@fakeSupabase');
      signIn('dueno@example.com'); local(id, width);
      cy.get('#sb-main').should('have.text', 'Sin cambios');
      cy.window().then(win => {
        if (win.localStorage.getItem('spm-draft-' + id) !== null) throw new Error('Quedó la clave compartida');
        if (win.localStorage.getItem('spm-draft-unclaimed:' + id) !== '{"draft":{"p-002":999}}') throw new Error('Se perdió el legado');
      });
    });
  }
  for (const route of ['privacidad', 'terminos', 'almacenamiento']) {
    it(`${route}: documento público accesible en móvil`, () => {
      cy.viewport(390, 844); cy.visit('/' + route + '.html');
      cy.get('h1').should('be.visible');
      cy.document().then(doc => { if (doc.documentElement.scrollWidth > 390) throw new Error('Desborde horizontal'); });
    });
  }
});
