/* global Cypress, describe, it, cy, expect */
import { abrirLocal } from '../helpers/abrir-local';
// Pruebas aisladas: Supabase falso; nunca consultan ni escriben datos reales.
const TENANT = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const OTRA = '00000000-0000-4000-8000-000000000999';
const login = email => {
  cy.get('#au-email').clear().type(email);
  cy.get('#au-pass').type('secreto1', {log:false});
  cy.get('#au-in button[type="submit"]').click();
};
function launch(tenant = TENANT) {
  cy.task('mockSupabase').then(mock => {
    const fake = tenant === TENANT ? mock : mock.replaceAll(TENANT, tenant);
    cy.intercept('GET', '**/vendor/supabase.js', {statusCode:200, headers:{'content-type':'application/javascript'}, body:fake}).as('fakeSupabase');
  });
  cy.intercept('**/*.supabase.co/**', {forceNetworkError:true});
  cy.visit('/');
  cy.wait('@fakeSupabase');
  cy.get('.gl-intro', {timeout:12000}).should('not.be.visible');
  cy.get('#au-in').should('be.visible');
}
const dia = d => cy.window().then(w => { w.__resenasDia = d; });
const nuevo = (nombre, tel) => {
  cy.get('.rv-page [data-rv="new"]').click();
  cy.get('#rv-form input[name="name"]').type(nombre);
  cy.get('#rv-form input[name="phone"]').type(tel);
  cy.get('#rv-form').submit();
};
const cerrar = () => cy.get('.rv-modal [data-rv="close"]').click();

describe('Reseñas: Mi Gusto, Munro y Torcuato con datos propios', () => {
  Cypress.on('uncaught:exception', error => {
    if (error.message.includes('Minified React error #418')) return false;
  });

  it('gerente de Munro registra un cliente, recibe un cupón único y lo marca usado una sola vez', () => {
    launch(); login('gerente.munro@example.com'); dia('2026-11-03');
    cy.get('#snav .snav-folder [data-go="resenas"]').click();
    cy.get('.rv-page').should('contain.text', 'Sucursal Munro').and('contain.text', 'independiente de publicar reseñas en Google');
    nuevo('Cliente ficticio', '+54 9 11 2233-7788');
    cy.get('.rv-code strong').invoke('text').should('match', /^[A-HJ-NP-Z2-9]{6}$/).then(code => {
      cerrar();
      cy.get('.rv-stats .pending strong').should('have.text', '1');
      cy.get('.rv-badge.pending').should('contain.text', 'Pendiente');
      // Un cupón por teléfono y mes en la sucursal, aunque cambie el formato del número.
      nuevo('Mismo cliente', '011 2233 7788');
      cy.get('.rv-modal [role="alert"]').should('contain.text', 'ya tiene un cupón para este período');
      cerrar();
      // Buscador por nombre, teléfono o cupón.
      cy.get('#rv-search').type(code);
      cy.get('.rv-table tbody tr').should('have.length', 1).and('contain.text', 'Cliente ficticio');
      cy.get('#rv-search').clear().type('2233');
      cy.get('.rv-table tbody tr').should('have.length', 1);
      cy.get('#rv-search').clear().type('nadie');
      cy.get('.rv-table tbody').should('contain.text', 'No hay cupones');
      cy.get('#rv-search').clear();
    });
    // «Modificar» corrige nombre y teléfono; el código no cambia.
    cy.get('.rv-table [data-rv="edit"]').first().should('have.text', 'Ver / Modificar').click();
    cy.get('.rv-code strong').invoke('text').then(codigo => {
      cy.get('#rv-form input[name="name"]').should('have.attr', 'readonly');
      cy.get('.rv-modal [data-rv="modify"]').click();
      cy.get('#rv-form input[name="name"]').should('not.have.attr', 'readonly');
      cy.get('#rv-form input[name="name"]').clear().type('Cliente corregido');
      cy.get('#rv-form').submit();
      cy.get('#rv-form input[name="name"]').should('have.value', 'Cliente corregido');
      cy.get('#rv-form input[name="name"]').should('have.attr', 'readonly');
      cy.get('.rv-code strong').should('have.text', codigo);
    });
    // Marcar usado exige confirmar con la tilde; después no se puede volver a usar.
    cy.get('.rv-modal [data-rv="redeem"]').click();
    cy.get('.rv-modal [role="alert"]').should('contain.text', 'Marcá la tilde');
    cy.get('#rv-form input[name="used"]').check();
    cy.get('.rv-modal [data-rv="redeem"]').click();
    cy.get('.rv-modal').should('contain.text', 'Cupón marcado como usado');
    cy.get('.rv-modal [data-rv="redeem"], .rv-modal [data-rv="modify"]').should('not.exist');
    cy.get('#rv-form button[type="submit"]').should('not.exist');
    cerrar();
    cy.get('.rv-stats .used strong').should('have.text', '1');
    cy.get('.rv-table [data-rv="edit"]').first().should('have.text', 'Ver cupón');
    // Del 13 en adelante los pendientes del mes vencen, pero se sigue registrando: vale el mes siguiente.
    nuevo('Otro cliente', '1144556677');
    cerrar();
    dia('2026-11-27');
    cy.window().trigger('focus');
    cy.get('.rv-badge.expired').should('contain.text', 'Cupón Vencido');
    nuevo('Registrado el 27', '1155667788');
    cy.get('.rv-modal').should('contain.text', 'Válido del 1 al 12 de diciembre 2026').and('contain.text', 'todavía no vigente');
    cy.get('.rv-modal [data-rv="redeem"]').should('not.exist');
    cy.get('.rv-modal [data-rv="modify"]').should('exist');
  });

  it('Torcuato permite marcar manualmente como Usado un cupón aún no vigente, con motivo auditado', () => {
    launch(); login('gerente.torcuato@example.com'); dia('2026-10-28');
    cy.get('#snav [data-go="resenas"]').click();
    nuevo('Canje de prueba', '1122446688');
    cy.get('.rv-modal').should('contain.text','Válido del 1 al 12 de noviembre 2026');
    cerrar();
    cy.get('.rv-stats .pending strong').should('have.text','1');
    cy.get('.rv-table [data-rv="edit"]').first().click();
    cy.get('.rv-modal [data-rv="redeem"]').should('not.exist');
    cy.get('.rv-modal [data-rv="manual-redeem"]').should('be.visible').click();
    cy.get('.rv-modal [role="alert"]').should('contain.text','motivo');
    cy.get('.rv-modal input[name="reason"]').type('Descuento aplicado por la encargada');
    cy.get('.rv-modal input[name="manual-used"]').check();
    cy.get('.rv-modal [data-rv="manual-redeem"]').click();
    cy.get('.rv-modal').should('contain.text','Cupón marcado como usado');
    cy.get('.rv-modal [data-rv="manual-redeem"]').should('not.exist');
    cerrar();
    cy.get('.rv-stats .used strong').should('have.text','1');
    cy.get('.rv-stats .pending strong').should('have.text','0');
    cy.window().its('__resenas').should(rows => {
      expect(rows[0].manual_reason).to.equal('Descuento aplicado por la encargada');
      expect(rows[0].used_at).to.be.a('string');
    });
  });

  it('dueño ve cada sucursal por separado: el cupón de Munro no aparece ni se usa en Torcuato', () => {
    launch(); login('dueno@example.com'); dia('2026-11-05'); abrirLocal('munro');
    cy.get('#snav [data-go="resenas"]').click();
    nuevo('Cliente de Munro', '1122334455'); cerrar();
    cy.get('.rv-stats .total strong').should('have.text', '1');
    cy.get('#snav [data-act="locales"]').click(); abrirLocal('torcuato');
    cy.get('#snav [data-go="resenas"]').click();
    cy.get('.rv-page').should('contain.text', 'Sucursal Torcuato');
    cy.get('.rv-stats .total strong').should('have.text', '0');
    // El mismo cliente puede tener su cupón en Torcuato, con otro código.
    nuevo('Cliente de Munro', '1122334455');
    cy.get('.rv-code strong').invoke('text').should('match', /^[A-HJ-NP-Z2-9]{6}$/);
    cerrar();
    cy.window().its('__resenas').should(st => {
      expect(st.filter(c => c.local === 'munro')).to.have.length(1);
      expect(st.filter(c => c.local === 'torcuato')).to.have.length(1);
      expect(st[0].code).not.to.eq(st[1].code);
    });
    cy.window().then(async w => {
      const r = await w.GestLokSupabase.rpc('gestlok_resenas_redeem', {p_local:'torcuato', p_id:w.__resenas.find(c => c.local === 'munro').id});
      expect(r.error.message).to.match(/otra sucursal/);
    });
  });

  it('gerente de Torcuato usa Reseñas de Torcuato; en celular no hay desbordes', () => {
    cy.viewport(390, 844); launch(); login('gerente.torcuato@example.com'); dia('2026-11-02');
    cy.get('#snav [data-go="resenas"], #view [data-go="resenas"]').first().click({force:true});
    cy.get('.rv-page').should('contain.text', 'Sucursal Torcuato');
    cy.get('.rv-stats article').should('have.length', 4);
    cy.document().then(d => expect(d.documentElement.scrollWidth).to.be.at.most(390));
  });

  it('el lateral de GESTLOK se contrae y expande en escritorio sin perder Reseñas ni permisos', () => {
    cy.viewport(1080, 820); launch(); login('gerente.torcuato@example.com');
    cy.get('#snav [data-go="resenas"]').should('exist');
    cy.get('#app .gl-sidebar-collapse-button').should('be.visible')
      .and('have.attr','aria-label','Contraer menú lateral').click();
    cy.get('#app').should('have.class','gl-sidebar-collapsed');
    cy.get('#app .gl-sidebar-collapse-button').should('have.attr','aria-label','Expandir menú lateral');
    cy.get('#snav [data-go="resenas"]').should('exist');
    cy.get('#app .gl-sidebar-collapse-button').click();
    cy.get('#app').should('not.have.class','gl-sidebar-collapsed');
    cy.get('#snav [data-go="resenas"]').click();
    cy.get('.rv-page').should('contain.text','Sucursal Torcuato');
  });

  it('no aparece para cuentas de solo lectura ni para otras empresas', () => {
    launch(); login('lectura@example.com');
    cy.get('#snav [data-go="resenas"]').should('not.exist');
    launch(OTRA); login('dueno@example.com'); abrirLocal('munro');
    cy.get('#snav [data-go="resenas"]').should('not.exist');
  });
});
