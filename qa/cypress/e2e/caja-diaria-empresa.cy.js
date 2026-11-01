/* global describe, it, cy, Cypress */
// Caja diaria exclusiva por empresa (pedido #200) con datos ficticios: el simulador reemplaza a Supabase.
// Solo la cuenta de window.__cajaHabilitada (como la empresa habilitada en el servidor) ve la caja.
const DUENA = 'duena.caja@example.com';
const iniciar = (email, {habilitada = true, viewport = [390, 844]} = {}) => {
  cy.viewport(viewport[0], viewport[1]);
  cy.task('mockSupabase').then((fake) => {
    cy.intercept('GET', '**/vendor/supabase.js', {statusCode: 200, headers: {'content-type': 'application/javascript'}, body: fake}).as('mock');
  });
  cy.intercept('**/*.supabase.co/**', {forceNetworkError: true});
  cy.visit('/');
  cy.wait('@mock');
  cy.get('.gl-intro', {timeout: 15000}).should('not.be.visible');
  cy.window().then((w) => {
    if (!w.__rows.some((r) => r.col === 'equipo' && r.id === DUENA))
      w.__rows.push({col: 'equipo', id: DUENA, data: {email: DUENA, rol: 'dueno', nombre: 'Camila'}});
    w.__cajaHabilitada = habilitada ? [DUENA] : [];
  });
  cy.get('#au-email').clear().type(email);
  cy.get('#au-pass').type('secreto1', {log: false});
  cy.get('#au-in button[type="submit"]').click();
};
const abrirPanel = () => {
  cy.get('#hub .gl-caja-entry [data-caja-open]', {timeout: 15000}).should('be.visible').click();
  cy.get('#gl-caja-panel [role="dialog"]').should('be.visible');
};
const pagar = (monto, metodo = 'efectivo', nota = '') => {
  cy.get(`#gl-caja-venta input[name="metodo"][value="${metodo}"]`).check({force: true});
  cy.get('#gl-caja-venta input[name="monto"]').clear().type(monto);
  if (nota) cy.get('#gl-caja-venta input[name="nota"]').clear().type(nota);
  cy.get('#gl-caja-venta button[type="submit"]').click();
  cy.get('#gl-caja-panel .gl-caja-ok').should('contain.text', 'Pago registrado');
};

describe('GESTLOK · Caja diaria exclusiva de la empresa habilitada', () => {
  Cypress.on('uncaught:exception', (error) => {
    if (error.message.includes('Minified React error #418')) return false;
  });

  it('abre con responsable, suma efectivo y transferencia, no duplica y cierra una sola vez sin reabrir', () => {
    iniciar(DUENA);
    abrirPanel();
    // Responsable obligatorio y sin foto en ningún paso.
    cy.get('#gl-caja-abrir input[name="responsable"]').should('have.attr', 'required');
    cy.get('#gl-caja-panel input[type="file"]').should('not.exist');
    cy.get('#gl-caja-abrir input[name="responsable"]').type('Camila López');
    cy.get('#gl-caja-abrir button[type="submit"]').click();
    cy.get('#gl-caja-panel [data-caja-responsable]').should('have.text', 'Camila López');

    pagar('1.500,50', 'efectivo', 'Perfume 100 ml');
    cy.get('#gl-caja-venta input[name="monto"]').should('have.value', '');
    cy.get('#gl-caja-venta input[name="nota"]').should('have.value', '');
    pagar('2000', 'transferencia');
    cy.get('[data-caja-total="efectivo"]').should('contain.text', '1.500,50');
    cy.get('[data-caja-total="transferencia"]').should('contain.text', '2.000,00');
    cy.get('[data-caja-total="total"]').should('contain.text', '3.500,50');

    // Doble toque en «Registrar pago»: se guarda una sola venta.
    cy.get('#gl-caja-venta input[name="monto"]').type('100');
    cy.get('#gl-caja-venta button[type="submit"]').dblclick();
    cy.get('#gl-caja-panel .gl-caja-ok').should('contain.text', 'Pago registrado');
    cy.window().its('__caja.turnos.0.movimientos').should('have.length', 3);

    // Anular descuenta del total y queda la constancia.
    cy.get('[data-caja-anular="venta-3"]').click();
    cy.get('#gl-caja-panel .gl-caja-ok').should('contain.text', 'Venta anulada');
    cy.get('[data-caja-total="total"]').should('contain.text', '3.500,50');
    cy.get('#gl-caja-panel .gl-caja-list li.is-void').should('contain.text', 'Anulada');

    // Cerrar día: responsable obligatorio y doble clic = un solo cierre.
    cy.get('#gl-caja-panel [data-caja-cerrar]').click();
    cy.get('#gl-caja-cerrar input[name="responsable"]').should('have.value', 'Camila López').clear();
    cy.get('#gl-caja-cerrar button[type="submit"]').click();
    cy.get('#gl-caja-panel .gl-caja-closed').should('not.exist');
    cy.get('#gl-caja-cerrar input[name="responsable"]').type('Camila López');
    cy.get('#gl-caja-cerrar button[type="submit"]').dblclick();
    cy.get('#gl-caja-panel .gl-caja-closed').should('contain.text', 'Caja cerrada').and('contain.text', 'no se reabre');
    cy.window().then((w) => {
      expect(w.__caja.auditoria.filter((a) => a.accion === 'cierre_manual')).to.have.length(1);
      expect(w.__caja.turnos).to.have.length(1);
    });
    cy.get('#gl-caja-venta, #gl-caja-abrir, [data-caja-cerrar]').should('not.exist');

    // No se reabre el mismo día, ni llamando directo al servidor.
    cy.window().then(async (w) => {
      const {data} = await w.GestLokSupabase.rpc('gestlok_caja_abrir', {p_responsable: 'Otra persona'});
      expect(data.nuevo).to.equal(false);
      expect(data.turno.estado).to.equal('cerrado');
    });

    // Historial con fecha, responsable, totales por medio y total general.
    cy.get('#gl-caja-panel [data-caja-tab="historial"]').click();
    cy.get('#gl-caja-panel .gl-caja-table tbody tr').should('have.length', 1).first()
      .should('contain.text', 'Camila López').and('contain.text', '1.500,50').and('contain.text', '2.000,00').and('contain.text', '3.500,50').and('contain.text', 'Manual');
    cy.get('#gl-caja-panel [data-caja-detalle]').click();
    cy.get('#gl-caja-panel').should('contain.text', 'Perfume 100 ml');
    cy.document().its('documentElement.scrollWidth').should('be.lte', 390);
  });

  it('el cierre automático del servidor (23:59) y el cambio de día se ven sin reabrir la caja anterior', () => {
    iniciar(DUENA, {viewport: [1280, 900]});
    abrirPanel();
    cy.get('#gl-caja-abrir input[name="responsable"]').type('Turno tarde');
    cy.get('#gl-caja-abrir button[type="submit"]').click();
    pagar('700', 'transferencia');
    cy.window().then((w) => {
      const hoy = w.__caja.turnos[0].dia;
      expect(w.__cajaCron()).to.equal(1); // 23:59: el servidor la cierra aunque nadie tenga la app abierta
      const d = new Date(hoy + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
      w.__cajaDia = d.toISOString().slice(0, 10); // 00:00 del día siguiente
    });
    cy.get('#gl-caja-panel [data-caja-close]').click();
    abrirPanel();
    cy.get('#gl-caja-abrir').should('be.visible'); // caja nueva para el día nuevo
    cy.get('#gl-caja-panel [data-caja-tab="historial"]').click();
    cy.get('#gl-caja-panel .gl-caja-table tbody tr').first().should('contain.text', 'Turno tarde').and('contain.text', '700,00').and('contain.text', 'Automático 23:59');
  });

  it('si se corta la conexión al registrar, lo escrito queda y el reintento no duplica', () => {
    iniciar(DUENA);
    abrirPanel();
    cy.get('#gl-caja-abrir input[name="responsable"]').type('Ana');
    cy.get('#gl-caja-abrir button[type="submit"]').click();
    cy.window().then((w) => { w.__cajaFalla = true; });
    cy.get('#gl-caja-venta input[name="monto"]').type('2.500');
    cy.get('#gl-caja-venta button[type="submit"]').click();
    cy.get('#gl-caja-panel .gl-caja-error').should('contain.text', 'probá de nuevo');
    cy.get('#gl-caja-venta input[name="monto"]').should('have.value', '2.500');
    cy.get('#gl-caja-venta button[type="submit"]').click();
    cy.get('#gl-caja-panel .gl-caja-ok').should('contain.text', '2.500,00');
    cy.window().its('__caja.turnos.0.movimientos').should('have.length', 1);
  });

  for (const email of ['dueno@example.com', 'gerente.munro@example.com']) {
    it(`${email}: Mi Gusto no ve la caja ni puede usarla`, () => {
      iniciar(email);
      cy.get('#hub, #view', {timeout: 15000}).should('exist');
      cy.wait(1500);
      cy.get('.gl-caja-entry, #gl-caja-panel').should('not.exist');
      cy.window().then(async (w) => {
        // La app solo consultó el permiso; nunca intentó leer ni escribir la caja.
        expect((w.__cajaLlamadas || []).every(([fn]) => fn === 'gestlok_caja_acceso')).to.equal(true);
        const {error} = await w.GestLokSupabase.rpc('gestlok_caja_estado');
        expect(error.code).to.equal('42501');
      });
    });
  }
});
