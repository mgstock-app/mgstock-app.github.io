/* global Cypress, describe, it, cy, expect */
// Demo pública: «Administrar a los empleados» › Horarios con un Excel ficticio, elección entre la
// plantilla GESTLOK o una propia, y el modo sin conexión simulado (sin servidor ni datos reales).
describe('GESTLOK · demo de Horarios y modo sin conexión', () => {
  Cypress.on('uncaught:exception', e => { if (e.message.includes('Minified React error #418')) return false; });
  const bootstrap = route => {
    cy.task('mockSupabase').then(fake => {
      cy.intercept('GET', '**/vendor/supabase.js', {statusCode:200, headers:{'content-type':'application/javascript'}, body:fake}).as('fakeAuth');
    });
    cy.intercept('**/*.supabase.co/**', {forceNetworkError:true});
    cy.visit(route); cy.wait('@fakeAuth');
    cy.get('.gl-intro', {timeout:12000}).should('not.be.visible');
  };
  const setOnline = (w, on) => {
    Object.defineProperty(w.navigator, 'onLine', {configurable:true, get:() => on});
    w.dispatchEvent(new w.Event(on ? 'online' : 'offline'));
  };

  it('Dueña: abre Horarios con el Excel ficticio y elige la plantilla GESTLOK o la propia', () => {
    cy.viewport(1280, 900);
    bootstrap('/?demo=1&shop=mercado&role=dueno');
    cy.get('#hub [data-owner-area-staff]', {timeout:15000}).should('be.visible').click();
    cy.get('#gl-demo-emp', {timeout:10000}).should('be.visible')
      .and('contain.text', 'Plantilla GESTLOK (predeterminada)')
      .and('contain.text', 'Mi propio Excel o Google Sheets')
      .and('contain.text', 'Todos los datos son ficticios');
    cy.get('#gl-demo-emp').should('contain.text', 'Nicolás Paz').and('contain.text', '42:30 hs').and('contain.text', '12 turnos');
    cy.get('#gl-demo-emp a[download="GESTLOK-demo-horarios-ficticio.xlsx"]').should('have.attr', 'href').and('include', 'plantillas/GESTLOK-demo-horarios-ficticio.xlsx');
    cy.get('#gl-demo-emp a[download="GESTLOK-plantilla-horarios.xlsx"]').should('exist');
    cy.request('/plantillas/GESTLOK-demo-horarios-ficticio.xlsx').its('status').should('eq', 200);
    cy.get('#gl-demo-emp [data-dh-tab="resumen"]').click();
    cy.get('#gl-demo-emp').should('contain.text', '39:30 hs').and('contain.text', '3 días');
    cy.get('#gl-demo-emp input[value="propio"]').check({force:true});
    cy.get('#gl-demo-emp').should('contain.text', 'Subir mi Excel (.xlsx)').and('contain.text', 'Usar mi Google Sheets');
    cy.get('#gl-dh-file').selectFile('../public/plantillas/GESTLOK-plantilla-horarios.xlsx', {force:true});
    cy.get('#gl-demo-emp .gl-dh-ok', {timeout:10000}).should('contain.text', '5 hojas');
    cy.get('#gl-dh-url').type('https://docs.google.com/spreadsheets/d/EJEMPLO_123/edit');
    cy.get('#gl-dh-link button[type=submit]').click();
    cy.get('#gl-demo-emp').should('contain.text', 'Enlace guardado en esta demo');
    cy.get('#gl-demo-emp .gl-dh-top [data-dh-close]').click();
    cy.get('#gl-demo-emp').should('not.exist');
  });

  it('Sin conexión: lo que se guarda queda pendiente y se envía solo al volver internet', () => {
    cy.viewport(390, 844);
    bootstrap('/?demo=1&shop=mercado&role=dueno');
    cy.get('#hub [data-owner-area-staff]', {timeout:15000}).click();
    cy.get('#gl-demo-emp .gl-dh-table', {timeout:10000}).should('be.visible');
    cy.window().then(w => setOnline(w, false));
    cy.get('[data-dh-p="3"][data-dh-d="4"][data-dh-k="4"]').select('', {force:true});
    cy.get('#gl-offline-sync').should('be.visible').and('contain.text', 'guardado').and('contain.text', 'Se envían solos');
    cy.window().then(w => setOnline(w, true));
    cy.get('#gl-offline-sync').should('contain.text', 'enviado');
    cy.window().then(w => w.GestLokOffline.pending()).then(n => expect(n).to.eq(0));
  });

  it('Gerente: abre Horarios de su propio local', () => {
    bootstrap('/?demo=1&shop=nova&role=gerente');
    cy.get('#view [data-gerente-empleados]', {timeout:15000}).click();
    cy.get('#gl-demo-emp', {timeout:10000}).should('contain.text', 'Plantilla GESTLOK (predeterminada)');
  });

  it('Las dos áreas cargan el modo sin conexión', () => {
    cy.request('/stock/gestlok-offline.js').its('status').should('eq', 200);
    cy.request('/empleados/').its('body').should('include', 'stock/gestlok-offline.js');
    cy.request('/sw.js').its('body').should(body => {
      expect(body).to.include('/stock/gestlok-offline.js');
      expect(body).to.include('/empleados/horarios/');
      expect(body).not.to.include('__EMPLEADOS_PRECACHE__');
    });
  });
});
