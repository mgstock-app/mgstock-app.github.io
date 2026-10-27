/* global Cypress, describe, it, cy, expect */
import { abrirLocal } from '../helpers/abrir-local';
// Pruebas aisladas: Supabase falso; nunca consultan ni escriben datos reales.
const TENANT = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
const OTRA = '00000000-0000-4000-8000-000000000999';
const login = email => {
  cy.get('#au-email').type(email);
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
const lunes = () => cy.window().then(w => w.GestLokMunroMotos._t.semanaActual());
const hora = (moto, campo, valor) => lunes().then(s =>
  cy.get(`.mo-time[data-moto="${moto}"][data-dia="${s}"][data-campo="${campo}"]`).type(valor).blur());
const docsMotos = rows => rows.filter(r => r.col === 'munro/agencia_motos');

describe('Agencia Motos: exclusiva de Mi Gusto – Munro', () => {
  Cypress.on('uncaught:exception', error => {
    if (error.message.includes('Minified React error #418')) return false;
  });

  it('gerente de Munro carga la semana; ve horas pero no importes, valores ni historial', () => {
    launch(); login('gerente.munro@example.com');
    cy.get('#snav [data-go="motos"]').should('exist').click();
    cy.get('.mo-page h1').should('contain.text', 'Agencia Motos');
    for (const n of ['Lucas', 'Alex', 'Aye']) cy.get('.mo-who').should('contain.text', n);
    hora('lucas', 'tm_e', '08:00'); hora('lucas', 'tm_s', '16:30');
    cy.get('[data-mo-tot="lucas"]').first().should('have.text', '8:30');
    cy.get('[data-mo-sem]').first().should('have.text', '8:30');
    cy.get('[data-mo-pago="lucas"]').should('not.exist');
    cy.get('.mo-hist').should('not.exist');
    cy.get('.mo-rates').should('not.exist');
    cy.get('.mo-nav').should('not.exist');
    lunes().then(s => cy.window().its('__rows').should(rows => {
      const d = docsMotos(rows).find(r => r.id === `d-${s}-lucas-${s}`);
      expect(d.data).to.include({semana:s, moto:'lucas', dia:s, tm_e:'08:00', tm_s:'16:30'});
      expect(rows.some(r => r.col === 'torcuato/agencia_motos')).to.eq(false);
    }));
    cy.get('[data-mo-act="agregar"]').click();
    cy.get('#mo-ref-form input').type('Nico');
    cy.get('#mo-ref-form').submit();
    cy.get('.mo-who').should('contain.text', 'Nico').and('contain.text', 'Refuerzo 1');
    cy.window().its('__rows').should(rows => {
      expect(docsMotos(rows).filter(r => r.data.tipo === 'refuerzo')).to.have.length(1);
    });
  });

  it('dueño fija el valor por hora y ve importes, total semanal e historial', () => {
    launch(); login('dueno@example.com'); abrirLocal('munro');
    cy.get('#snav [data-go="motos"]').click();
    cy.get('.mo-hist').should('contain.text', 'Historial de semanas').and('contain.text', 'Todavía no hay semanas cerradas');
    cy.get('.mo-rates [data-mo-act="tarifas"]').click();
    cy.get('#mo-rates-form input[name="t-aye"]').clear().type('9500');
    cy.get('#mo-rates-form').submit();
    cy.get('.mo-rates').should('contain.text', '$9.500,00');
    hora('aye', 'tt_e', '19:33'); hora('aye', 'tt_s', '00:00');
    cy.get('[data-mo-tot="aye"]').first().should('have.text', '4:27');
    cy.get('[data-mo-pago="aye"]').first().should('have.text', '$42.275,00');
    cy.get('[data-mo-sem-pago]').first().should('have.text', '$42.275,00');
    cy.window().its('__rows').should(rows => {
      const t = docsMotos(rows).find(r => r.id === 'tarifas');
      expect(t.data.valores.aye[0].valor).to.eq(9500);
    });
    cy.get('[data-mo-act="prev"]').click();
    cy.get('.mo-aviso').should('contain.text', 'semana cerrada');
    cy.get('[data-mo-act="hoy"]').click();
    cy.get('.mo-aviso').should('not.exist');
  });

  it('en celular muestra un día por vez, sin desbordes horizontales', () => {
    cy.viewport(390, 844); launch(); login('gerente.munro@example.com');
    cy.get('#snav [data-go="motos"], #view [data-go="motos"]').first().click({force:true});
    cy.get('.mo-tabs .mo-tab').should('have.length', 7);
    cy.get('.mo-card .mo-who').should('have.length', 3);
    cy.get('.mo-tabs .mo-tab').eq(2).click();
    cy.get('.mo-tabs .mo-tab').eq(2).should('have.class', 'on');
    cy.document().then(d => expect(d.documentElement.scrollWidth).to.be.at.most(390));
  });

  it('no aparece para Torcuato, para cuentas de solo lectura ni para otras empresas', () => {
    launch(); login('gerente.torcuato@example.com');
    cy.get('#brand-local').should('contain.text', 'Torcuato');
    cy.get('#snav [data-go="motos"]').should('not.exist');
    cy.get('#view [data-go="motos"]').should('not.exist');

    launch(); login('dueno@example.com'); abrirLocal('torcuato');
    cy.get('#snav [data-go="motos"]').should('not.exist');

    launch(); login('lectura@example.com');
    cy.get('#snav [data-go="motos"]').should('not.exist');

    launch(OTRA); login('dueno@example.com'); abrirLocal('munro');
    cy.get('#snav [data-go="motos"]').should('not.exist');
    cy.window().its('__rows').should(rows => expect(rows.some(r => /agencia_motos$/.test(r.col))).to.eq(false));
  });
});
