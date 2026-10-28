/* global Cypress, describe, it, cy, expect */
describe('Demo GESTLOK: navegación, privacidad y envío', () => {
  Cypress.on('uncaught:exception', e => { if (e.message.includes('Minified React error #418')) return false; });
  function start(role = 'dueno') {
    cy.task('mockSupabase').then(body => cy.intercept('GET', '**/vendor/supabase.js', {headers: {'content-type': 'application/javascript'}, body}));
    cy.intercept('**/*.supabase.co/**', {forceNetworkError: true});
    cy.visit('/?demo=1&shop=mercado&role=' + role);
    cy.get('#gl-tour-controls', {timeout: 20000}).should('be.visible');
  }
  const step = n => cy.get('.gl-tour-nav [data-tour="' + n + '"]').first().click();
  it('permite recorrer las cinco etapas en móvil sin desbordar la pantalla', () => {
    cy.viewport(390, 844); start();
    step(1); cy.get('#view').should('contain.text', 'Stock');
    step(2); cy.get('#view').should('contain.text', 'Proveedores');
    step(3); cy.get('[data-dh-receipt]').click();
    cy.get('#gl-demo-receipt').should('contain.text', 'Sin validez legal');
    cy.get('#gl-demo-emp').then(panel => {
      cy.get('#gl-visitor-bar').then(bar => {
        expect(panel[0].getBoundingClientRect().top).to.be.at.least(bar[0].getBoundingClientRect().bottom);
      });
    });
    step(4); cy.get('#gl-tour-review-form').should('be.visible');
    cy.get('#gl-tour-gift').should('not.exist');
    step(0); cy.get('#hub .gl-owner-landing').should('be.visible');
    step(3); cy.get('[data-dh-close]').click();
    cy.get('#gl-demo-emp').should('not.exist');
    cy.document().then(d => expect(d.documentElement.scrollWidth).to.be.at.most(390));
  });
  it('el gerente no tiene acceso al recibo ni sus montos en la demo', () => {
    start('gerente'); step(3);
    cy.get('#gl-demo-emp').should('be.visible');
    cy.get('[data-dh-receipt]').should('not.exist');
    cy.get('#gl-demo-receipt').should('not.exist');
    cy.get('#gl-demo-emp').should('not.contain.text', '900.000');
  });
  it('conserva borrador, omite contacto sin consentimiento y entrega regalo solo al guardar', () => {
    start(); step(4);
    cy.get('#gl-tour-review-form').submit();
    cy.get('#gl-tour-review-status').should('contain.text', 'Elegí');
    cy.get('[data-review-star="1"]').click();
    cy.get('[name=comment]').type('Opinión ficticia');
    cy.get('[name=contact_consent]').check();
    cy.get('#gl-tour-review-form').submit();
    cy.get('#gl-tour-review-status').should('contain.text', 'email o teléfono');
    cy.get('[name=contact_name]').type('Persona ficticia');
    cy.get('[name=contact_value]').type('prueba@example.com');
    step(0); step(4);
    cy.get('[name=comment]').should('have.value', 'Opinión ficticia');
    cy.get('[name=contact_value]').should('have.value', 'prueba@example.com');
    cy.get('[name=contact_consent]').uncheck();
    cy.window().then(w => {
      let attempt = 0;
      cy.stub(w.supabase, 'createClient').returns({rpc: async (name, payload) => {
        expect(name).eq('gestlok_demo_enviar_resena_cupon');
        expect(payload.p_rating).eq(1);
        expect(payload.p_contact_consent).eq(false);
        expect(payload.p_contact_name).eq(null);
        expect(payload.p_contact_value).eq(null);
        expect(payload.p_publish_consent).eq(false);
        return ++attempt === 1 ? {error: {message: 'Fallo simulado'}} : {data: 'G-123', error: null};
      }});
    });
    cy.get('#gl-tour-review-form').submit();
    cy.get('#gl-tour-review-status').should('contain.text', 'No pudimos');
    cy.get('#gl-tour-gift').should('not.exist');
    cy.get('#gl-tour-review-form').submit();
    cy.get('#gl-tour-gift').should('be.visible').and('contain.text', 'G-123');
  });
});
