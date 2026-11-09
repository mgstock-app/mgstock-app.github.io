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
const NO_MOLINO = ['Stock Local', 'Proveedores', 'Chat del local', 'Vencimientos', 'Avisos', 'Ingreso de mercadería', 'Agregar hoja', 'Conteo', 'Pedidos WhatsApp', 'Administración de local', 'Reclamos Internos', 'Editar categorías', 'Más herramientas'];
function menuSoloMolino() {
  cy.get('#snav').should('be.visible');
  cy.get('#snav').should('contain.text', 'Inicio').and('contain.text', 'Vínculo entre sucursales');
  for (const k of ['precios', 'pedidos', 'envios', 'devoluciones', 'historial']) cy.get('#snav [data-mol-nav="' + k + '"]').should('be.visible');
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
    cy.get('#gestlok-mobile-dock [data-dock="mol-pedidos"]').should('be.visible');
    cy.get('#gestlok-mobile-dock [data-dock="mol-envios"]').should('be.visible');
    cy.get('#gestlok-mobile-dock [data-dock="stock"], #gestlok-mobile-dock [data-dock="pagos"]').should('not.exist');
    cy.get('#gestlok-mobile-dock [data-dock="mol-envios"]').click();
    cy.get('#gl-molino-panel').should('be.visible').and('contain.text', 'Productos enviados');
    cy.get('#gl-soporte-whatsapp').should('be.visible');
    cy.document().then(d => { if (d.documentElement.scrollWidth > 390) throw Error('Desborde horizontal'); });
  });


  it('El Molino: menú lateral plegable sin títulos cortados en escritorio',()=>{
    cy.viewport(1366,900);login('dueno@example.com',true);
    cy.get('.gl-oh-top [data-owner-nav="menu"]',{timeout:15000}).click();
    cy.get('#pn [data-owner-nav="business"]').click();
    cy.get('#pn [data-act="local"][data-id="munro"]').first().click();
    cy.get('#gl-molino-css',{timeout:15000}).should('have.prop','sheet').and('not.be.null');
    cy.get('#app').then($app=>{
      if($app.hasClass('gl-sidebar-collapsed'))cy.get('.gl-sidebar-collapse-button').click();
    });
    cy.get('#snav .gl-molino-navgroup').should('be.visible')
      .and('contain.text','Vínculo entre sucursales');
    cy.get('#snav [data-mol-nav="devoluciones"] .nl').should('be.visible')
      .and('contain.text','Devoluciones');
    cy.get('.gl-sidebar-collapse-button').should('be.visible').click();
    cy.get('#app').should('have.class','gl-sidebar-collapsed');
    cy.get('#snav .gl-molino-navgroup').should('have.css','display','none');
    cy.get('#snav [data-mol-nav]').should('have.length',5)
      .each($button=>{
        cy.wrap($button).should('be.visible').and('have.attr','title');
        cy.wrap($button).invoke('attr','title').should('not.be.empty');
        cy.wrap($button).find('svg.i').should('be.visible');
        cy.wrap($button).find('.nl').should('not.be.visible');
      });
    cy.get('#side').should($side=>{
      expect($side[0].getBoundingClientRect().width).to.be.lessThan(90);
    });
    cy.get('.gl-sidebar-collapse-button').click();
    cy.get('#app').should('not.have.class','gl-sidebar-collapsed');
    cy.get('#snav .gl-molino-navgroup').should('be.visible');
    cy.get('#snav [data-mol-nav="envios"] .nl').should('be.visible')
      .and('contain.text','Productos enviados');
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

  it('Pedidos móvil: Acassuso prepara dos productos, San Isidro confirma cada uno por separado',()=>{
    cy.viewport(390,844);
    login('dueno@example.com',true);
    cy.get('.gl-oh-top [data-owner-nav="menu"]',{timeout:15000}).click();
    cy.get('#pn [data-owner-nav="business"]').click();
    cy.get('#pn [data-act="local"][data-id="munro"]').first().click();
    cy.get('#gestlok-mobile-dock [data-dock="mol-pedidos"]').should('be.visible').click();
    cy.get('#gl-molino-panel').should('be.visible').and('contain.text','Pedidos · Acassuso');
    cy.get('#gl-molino-panel [data-mol-order-mode="realizar"]').should('be.visible');
    cy.get('#gl-molino-order-form [name="product"]').type('Medialunas');
    cy.get('#gl-molino-order-form [name="quantity"]').type('24');
    cy.get('#gl-molino-order-form button[type="submit"]').click();
    cy.get('#gl-molino-panel').should('contain.text','Pedido en preparación');
    cy.get('#gl-molino-order-form [name="product"]').type('Café');
    cy.get('#gl-molino-order-form [name="quantity"]').type('2');
    cy.get('#gl-molino-order-form button[type="submit"]').click();
    cy.get('[data-mol-order-send]').should('be.visible').click();
    cy.get('#gl-molino-panel').should('contain.text','Pendiente de OK');
    cy.get('#gl-molino-panel .gl-molino-order-group').should('have.length',1)
      .and('contain.text','Medialunas').and('contain.text','Café');
    cy.get('#gl-molino-panel [data-mol-order-ack]').should('have.length',2);
    cy.get('#gl-molino-panel [data-mol-order-ack]').first().click();
    cy.get('#gl-molino-panel .gl-molino-order-group').should('contain.text','1 de 2 vistos');
    cy.get('#gl-molino-panel [data-mol-tab="precios"]').click();
    cy.get('#gl-molino-panel').should('contain.text','Precios compartidos');
    cy.get('#gl-molino-panel').should('not.contain.text','Pedido en preparación');
    cy.document().then(d=>{if(d.documentElement.scrollWidth>392)throw Error('Desborde horizontal en Pedidos');});
  });

  it('Devoluciones móvil: kilos, gramos, descuento 33%, OK individual y resumen mensual',()=>{
    cy.viewport(390,844);
    login('dueno@example.com',true);
    cy.get('.gl-oh-top [data-owner-nav="menu"]',{timeout:15000}).click();
    cy.get('#pn [data-owner-nav="business"]').click();
    cy.get('#pn [data-act="local"][data-id="munro"]').first().click();
    cy.get('#gestlok-mobile-dock [data-dock="mol-precios"]').should('be.visible').click();
    cy.get('#gl-molino-price-form [name="product"]').type('Pan test');
    cy.get('#gl-molino-price-form [name="amount"]').type('4000');
    cy.get('#gl-molino-price-form [name="basis"]').select('kg');
    cy.get('#gl-molino-price-form button[type="submit"]').click();
    cy.get('#gl-molino-panel').should('contain.text','Pan test');
    cy.get('#gl-molino-panel [data-mol-tab="devoluciones"]').click();
    cy.get('#gl-molino-movement-form-devolucion [name="product"]').type('Pan test');
    cy.get('#gl-molino-movement-form-devolucion [name="quantity"]').type('9.5');
    cy.get('#gl-molino-movement-form-devolucion [name="unit"]').select('kg');
    cy.get('#gl-molino-movement-form-devolucion button[type="submit"]').click();
    cy.get('#gl-molino-panel .gl-molino-return-ledger').should('contain.text','25.460')
      .and('contain.text','12.540').and('contain.text','Monto final');
    cy.get('#gl-molino-panel [data-mol-day-final-summary]').should('contain.text','25.460');
    cy.get('#gl-molino-movement-form-devolucion [name="product"]').type('Pan test');
    cy.get('#gl-molino-movement-form-devolucion [name="quantity"]').type('250');
    cy.get('#gl-molino-movement-form-devolucion [name="unit"]').select('g');
    cy.get('#gl-molino-movement-form-devolucion button[type="submit"]').click();
    cy.get('#gl-molino-panel .gl-molino-return-ledger').should('contain.text','26.130')
      .and('contain.text','12.870');
    cy.get('#gl-molino-panel .gl-molino-ledger-sum').should('contain.text','Total monto final del día').and('contain.text','26.130');
    cy.get('#gl-molino-panel [data-mol-day-final-summary]').should('contain.text','26.130');
    // La recepción de una devolución corresponde a San Isidro, no a Acassuso.
    cy.window().then(w=>{
      w.GestLokMolino.close();
      w.GestLokMolino.attach({S:{me:{tenant_id:MOLINO},local:'loc-6c8717ea5f78426b9458-si'},role:()=> 'dueno'});
      w.GestLokMolino.open('devoluciones');
    });
    cy.get('#gl-molino-panel [data-mol-ack]').should('have.length',2).first().click();
    cy.get('#gl-molino-panel .gl-molino-item.is-confirmed').should('have.length',1);
    cy.get('#gl-molino-panel [data-mol-tab="historial"]').click();
    cy.get('#gl-molino-panel [data-mol-history-mode="mensual"]').click();
    cy.get('#gl-molino-month').should('be.visible');
    cy.get('#gl-molino-panel .gl-molino-month-totals').should('contain.text','26.130')
      .and('contain.text','12.870');
    cy.get('#gl-molino-panel [data-mol-month-final-total]').should('contain.text','26.130');
    cy.get('#gl-molino-panel .gl-molino-month-final').should('contain.text','Total monto final del mes');
    cy.get('#gl-molino-panel .gl-molino-month-day').should('contain.text','Pan test')
      .and('contain.text','kg').and('contain.text','g');
    cy.document().then(d=>{if(d.documentElement.scrollWidth>392)throw Error('Desborde horizontal en devoluciones');});
  });

  it('Productos enviados: San Isidro deja nota sin OK; únicamente Acassuso confirma recepción',()=>{
    cy.viewport(1280,850);
    login('dueno@example.com',true);
    cy.window().then(w=>{
      w.__molinoEnvios=[{
        id:'envio-recepcion-qa',kind:'envio',product:'Medialunas',quantity:3,note:'',
        acknowledgement_note:'',acknowledged_at:null,created_at:new Date().toISOString(),
        day:new Date().toISOString().slice(0,10)
      }];
      w.GestLokMolino.attach({S:{me:{tenant_id:MOLINO},local:'loc-6c8717ea5f78426b9458-si'},role:()=> 'dueno'});
      w.GestLokMolino.open('envios');
    });
    cy.get('#gl-molino-panel .gl-molino-item').should('contain.text','Medialunas');
    cy.get('#gl-molino-panel [data-mol-sender-save]').should('be.visible');
    cy.get('#gl-molino-panel [data-mol-ack]').should('not.exist');
    cy.get('#gl-molino-panel [data-mol-note]').should('not.exist');
    cy.get('#gl-molino-panel [data-mol-sender-note]').type('Se enviaron en buen estado');
    cy.get('#gl-molino-panel [data-mol-sender-save]').click();
    cy.get('#gl-molino-panel').should('contain.text','Se enviaron en buen estado').and('contain.text','Pendiente de recepción');
    cy.window().then(w=>{
      expect(w.__molinoEnvios[0].acknowledged_at).to.equal(null);
      w.GestLokMolino.close();
      w.__molinoBranchOverride='acassuso';
      w.GestLokMolino.attach({S:{me:{tenant_id:MOLINO},local:'loc-6c8717ea5f78426b9458'},role:()=> 'dueno'});
      w.GestLokMolino.open('envios');
    });
    cy.get('#gl-molino-panel [data-mol-sender-save]').should('not.exist');
    cy.get('#gl-molino-panel [data-mol-ack]').should('be.visible');
    cy.get('#gl-molino-panel input[data-mol-ack-note]').type('Recibimos los tres');
    cy.get('#gl-molino-panel [data-mol-ack]').click();
    cy.get('#gl-molino-panel .gl-molino-item.is-confirmed').should('contain.text','Recibido por Acassuso');
    cy.window().then(w=>{
      expect(w.__molinoEnvios[0].acknowledged_at).to.be.a('string');
      expect(w.__molinoEnvios[0].note).to.equal('Se enviaron en buen estado');
      expect(w.__molinoEnvios[0].acknowledgement_note).to.equal('Recibimos los tres');
    });
  });
});
