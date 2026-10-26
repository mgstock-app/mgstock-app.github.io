/* global Cypress, describe, it, cy */
// «Instalar en el celular»: en Android abre la ventana del sistema con un toque; en iPhone muestra los
// pasos de Safari (Apple no deja instalar desde la página). Funciona igual en la demo.
describe('GESTLOK · Instalar en el celular', () => {
  Cypress.on('uncaught:exception', e => { if (e.message.includes('Minified React error #418')) return false; });
  const UA = {
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  };
  const open = ua => {
    cy.viewport(390, 844);
    cy.task('mockSupabase').then(fake => {
      cy.intercept('GET', '**/vendor/supabase.js', {statusCode:200, headers:{'content-type':'application/javascript'}, body:fake}).as('fakeAuth');
    });
    cy.intercept('**/*.supabase.co/**', {forceNetworkError:true});
    cy.visit('/?demo=1&shop=mercado&role=dueno', {onBeforeLoad: w => Object.defineProperty(w.navigator, 'userAgent', {configurable:true, get:() => ua})});
    cy.wait('@fakeAuth');
    cy.get('.gl-intro', {timeout:12000}).should('not.be.visible');
    cy.get('#hub [data-owner-nav="menu"]', {timeout:15000}).should('be.visible');
  };
  const nativePrompt = w => {
    const e = new w.Event('beforeinstallprompt', {cancelable:true});
    e.prompt = () => { w.__prompts = (w.__prompts || 0) + 1; return Promise.resolve(); };
    e.userChoice = Promise.resolve({outcome:'accepted'});
    w.dispatchEvent(e);
  };

  it('Android: un toque abre la ventana «Instalar app», sin guía', () => {
    open(UA.android);
    cy.window().then(nativePrompt);
    cy.window().its('__glInstall.evt').should('exist');
    cy.get('#hub [data-owner-nav="menu"]').click();
    cy.get('#pn [data-owner-install]').should('contain.text', 'Instalar en el celular').click();
    cy.window().its('__prompts').should('eq', 1);
    cy.get('#ov').should('not.be.visible');
    cy.get('#toast').should('contain.text', 'Instalando GestLok');
    // También desde el menú de cada local.
    cy.get('#hub [data-owner-nav="business"]').click();
    cy.get('.ham').click();
    cy.get('#inst').should('be.visible').click();
    cy.get('#pn [data-gl-install-state]').should('contain.text', 'Preparando la instalación');
    cy.window().then(nativePrompt);
    cy.get('#pn [data-gl-install-now]').should('contain.text', 'Instalar GestLok').click();
    cy.window().its('__prompts').should('eq', 2);
  });

  it('iPhone: pasos de Safari (iOS 26: ⋯ › Compartir › Agregar a pantalla de inicio)', () => {
    open(UA.iphone);
    cy.get('#hub [data-owner-nav="menu"]').click();
    cy.get('#pn [data-owner-install]').click();
    cy.get('#pn [data-gl-install="ios-safari"]').should('be.visible')
      .and('contain.text', 'Compartir').and('contain.text', 'Agregar a pantalla de inicio').and('contain.text', 'Abrir como app web');
    cy.get('#pn [data-act="close"]').click();
    cy.get('#ov').should('not.be.visible');
  });
});
