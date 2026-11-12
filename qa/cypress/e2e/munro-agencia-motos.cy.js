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
const lunes = () => cy.window().then(w => w.GestLokMunroMotos._t.semanaActual());
// Se vuelve a buscar el campo antes de salir: la planilla puede redibujarse entre un paso y otro.
const hora = (moto, campo, valor) => lunes().then(s => {
  const sel = `.mo-time[data-moto="${moto}"][data-dia="${s}"][data-campo="${campo}"]`;
  cy.get(sel).type(valor);
  cy.get(sel).blur();
});
// En la fila vacía, cargar un horario redibuja la planilla: no se hace blur sobre el campo reemplazado.
const horaNueva = valor => lunes().then(s =>
  cy.get(`.mo-time[data-moto="nuevo"][data-dia="${s}"][data-campo="tm_e"]`).type(valor));
const docsMotos = rows => rows.filter(r => r.col === 'munro/agencia_motos');

describe('Motos Agencia: exclusiva de Mi Gusto – Munro', () => {
  Cypress.on('uncaught:exception', error => {
    if (error.message.includes('Minified React error #418')) return false;
  });

  it('gerente de Munro carga y corrige semanas cerradas sin importes ni valores', () => {
    launch(); login('gerente.munro@example.com');
    cy.get('#snav [data-go="motos"]').should('exist').click();
    cy.get('.mo-page h1').should('contain.text', 'Motos Agencia');
    cy.get('#snav .snav-folder[open] summary').should('contain.text', 'Administración de local');
    cy.get('#snav .snav-folder [data-go="diario"]').should('not.exist');
    cy.get('#crumb').should('contain.text', 'Administración de local');
    for (const n of ['Lucas', 'Alex', 'Aye']) cy.get('.mo-who').should('contain.text', n);
    cy.get('.mo-time[data-moto="lucas"]').first().should('be.disabled');
    cy.get('[data-mo-act="modificar"]').click();
    cy.get('.mo-sheet.editando').should('exist');
    hora('lucas', 'tm_e', '08:00'); hora('lucas', 'tm_s', '16:30');
    cy.get('[data-mo-tot="lucas"]').first().should('have.text', '8:30');
    cy.get('[data-mo-sem]').first().should('have.text', '8:30');
    cy.get('.mo-pend').should('contain.text', '1 cambio sin guardar');
    cy.window().its('__rows').should(rows => expect(docsMotos(rows).filter(r => r.id.startsWith('d-'))).to.have.length(0));
    cy.get('[data-mo-act="guardar"]').click();
    cy.get('.mo-sheet.editando').should('not.exist');
    cy.get('.mo-pend').should('contain.text', 'Planilla guardada');
    cy.get('[data-mo-pago="lucas"]').should('not.exist');
    cy.get('[data-mo-sem-pago]').should('not.exist');
    // Historial: los gerentes pueden editar horarios de semanas cerradas, pero nunca ver importes.
    cy.get('.mo-hist').should('not.exist');
    cy.get('[data-mo-act="pestana"][data-p="historial"]').should('be.visible').click();
    cy.get('.mo-sheet').should('not.exist');
    cy.get('.mo-hist').should('contain.text', 'Historial de semanas').and('contain.text', 'podés corregir semanas anteriores')
      .and('contain.text', 'Todavía no hay semanas cerradas').and('not.contain.text', 'Total pago');
    cy.get('[data-mo-act="tarifas"]').should('not.exist');
    cy.get('[data-mo-act="pestana"][data-p="semana"]').click();
    cy.get('.mo-sheet').should('exist');
    // Puede modificar una semana cerrada, guardar y volver al mismo detalle desde Historial.
    cy.get('[data-mo-act="prev"]').click();
    cy.get('.mo-aviso').should('contain.text', 'semana cerrada');
    cy.get('[data-mo-act="modificar"]').should('exist').click();
    cy.get('.mo-time[data-moto="lucas"][data-campo="tm_e"]').first().type('09:00').blur();
    cy.get('.mo-time[data-moto="lucas"][data-campo="tm_s"]').first().type('17:00').blur();
    cy.get('[data-mo-act="guardar"]').click();
    cy.get('.mo-estado').should('contain.text', 'podés corregir horarios');
    cy.get('[data-mo-act="pestana"][data-p="historial"]').click();
    cy.get('.mo-hist').should('contain.text', '8:00');
    cy.get('.mo-hist [data-mo-act="ver"]').first().should('contain.text', 'Ver y editar').click();
    cy.get('[data-mo-act="modificar"]').should('exist');
    cy.get('[data-mo-act="hoy"]').click();
    cy.get('.mo-aviso').should('not.exist');
    lunes().then(s => cy.window().its('__rows').should(rows => {
      const d = docsMotos(rows).find(r => r.id === `d-${s}-lucas-${s}`);
      expect(d.data).to.include({semana:s, moto:'lucas', dia:s, tm_e:'08:00', tm_s:'16:30'});
      expect(rows.some(r => r.col === 'torcuato/agencia_motos')).to.eq(false);
    }));
    cy.get('[data-mo-act="agregar"]').click();
    cy.get('#mo-ref-form input').type('Nico');
    cy.get('#mo-ref-form').submit();
    cy.get('.mo-who').should('contain.text', 'Nico').and('contain.text', 'Refuerzo 1');
    // La fila vacía sigue disponible: con «Modificar», cargar un horario ahí crea otro refuerzo.
    cy.get('[data-mo-act="modificar"]').click();
    horaNueva('10:00');
    cy.get('.mo-who').should('contain.text', 'Refuerzo 2');
    horaNueva('12:00');
    cy.get('.mo-who').should('contain.text', 'Refuerzo 3');
    lunes().then(s => {
      cy.contains('.mo-who', 'Refuerzo 2').closest('.mo-row')
        .find('.mo-time[data-dia="' + s + '"][data-campo="tm_s"]').type('11:00').blur();
      cy.contains('.mo-who', 'Refuerzo 3').closest('.mo-row')
        .find('.mo-time[data-dia="' + s + '"][data-campo="tm_s"]').type('13:00').blur();
    });
    cy.get('[data-mo-act="guardar"]').click();
    cy.window().its('__rows').should(rows => {
      const refs = docsMotos(rows).filter(r => r.data.tipo === 'refuerzo');
      expect(refs).to.have.length(3);
      const otro = refs.find(r => r.data.nombre === 'Refuerzo 2');
      expect(docsMotos(rows).some(r => r.data.moto === otro.data.moto && r.data.tm_e === '10:00')).to.eq(true);
    });
    cy.get('[data-mo-act="nombre"][data-moto="lucas"]').first().click();
    cy.get('#mo-name-form input[name="nombre"]').clear().type('Lucas P.');
    cy.get('#mo-name-form input[name="etiqueta"]').clear().type('Moto 1 (roja)');
    cy.get('#mo-name-form').submit();
    cy.get('#mo-name-form').should('not.exist');
    cy.get('.mo-who').should('contain.text', 'Lucas P.').and('contain.text', 'Moto 1 (roja)');
    lunes().then(s => cy.window().its('__rows').should(rows => {
      const n = docsMotos(rows).find(r => r.id === 'motos');
      expect(n.data.valores.lucas[0]).to.include({desde:s, nombre:'Lucas P.', etiqueta:'Moto 1 (roja)'});
    }));
  });

  it('dueño fija el valor por hora y ve importes, total semanal e historial', () => {
    launch(); login('dueno@example.com'); abrirLocal('munro');
    cy.get('#snav [data-go="motos"]').click();
    // El historial está en su propia pestaña, arriba de todo.
    cy.get('.mo-hist').should('not.exist');
    cy.get('[data-mo-act="pestana"][data-p="historial"]').should('be.visible').click();
    cy.get('.mo-sheet').should('not.exist');
    cy.get('.mo-hist').should('contain.text', 'Historial de semanas').and('contain.text', 'Todavía no hay semanas cerradas');
    cy.get('#snav .snav-folder [data-go="diario"]').should('not.exist');
    cy.get('.mo-hist [data-mo-act="tarifas"]').click();
    cy.get('#mo-rates-form input[name="t-aye"]').clear().type('9500');
    cy.get('#mo-rates-form').submit();
    cy.get('#mo-rates-form').should('not.exist');
    cy.get('.mo-hist [data-mo-act="tarifas"]').should('have.attr', 'title').and('contain', '$9.500,00');
    cy.get('[data-mo-act="pestana"][data-p="semana"]').click();
    cy.get('[data-mo-act="modificar"]').click();
    hora('aye', 'tt_e', '19:33'); hora('aye', 'tt_s', '00:00');
    cy.get('[data-mo-act="guardar"]').click();
    cy.get('[data-mo-tot="aye"]').first().should('have.text', '4:27');
    cy.get('[data-mo-pago="aye"]').first().should('have.text', '$42.275,00');
    cy.get('[data-mo-sem-pago]').first().should('have.text', '$42.275,00');
    cy.window().its('__rows').should(rows => {
      const t = docsMotos(rows).find(r => r.id === 'tarifas');
      expect(t.data.valores.aye[0].valor).to.eq(9500);
    });
    cy.get('[data-mo-act="modificar"]').click();
    hora('alex', 'tm_e', '09:00');
    cy.get('[data-mo-act="prev"]').click();
    cy.get('.mo-aviso').should('not.exist');
    cy.on('window:confirm', () => true);
    cy.get('[data-mo-act="cancelar"]').click();
    cy.get('[data-mo-act="prev"]').click();
    cy.get('.mo-aviso').should('contain.text', 'semana cerrada');
    cy.get('[data-mo-act="hoy"]').click();
    cy.get('.mo-aviso').should('not.exist');
  });

  it('detecta turnos superpuestos, marca en rojo y no guarda hasta corregirlos', () => {
    launch(); login('gerente.munro@example.com');
    cy.get('#snav [data-go="motos"]').click();
    cy.get('[data-mo-act="modificar"]').click();
    hora('lucas', 'tm_e', '11:30');
    cy.get('.mo-error-summary').should('not.be.visible');
    cy.get('.mo-parcial-nota').should('be.visible').and('contain.text','Podés guardar ahora');
    hora('lucas', 'tm_s', '15:00');
    hora('lucas', 'tt_e', '11:30');
    hora('lucas', 'tt_s', '23:00');
    lunes().then(s => {
      cy.get('.mo-time[data-moto="lucas"][data-dia="' + s + '"][data-campo="tt_e"]')
        .should('have.class', 'mo-time-error').and('have.attr', 'aria-invalid', 'true');
      cy.get('.mo-time[data-moto="lucas"][data-dia="' + s + '"][data-campo="tm_s"]')
        .should('have.class', 'mo-time-error');
    });
    cy.get('.mo-error-summary').should('contain.text', 'se superponen');
    cy.get('[data-mo-dia="lucas-0"]').should('contain.text', 'Revisar');
    cy.get('[data-mo-tot="lucas"]').should('contain.text', 'Revisar');
    cy.get('[data-mo-act="guardar"]').click();
    cy.get('.mo-sheet.editando').should('exist');
    cy.window().its('__rows').should(rows => {
      expect(docsMotos(rows).filter(r => r.id.startsWith('d-'))).to.have.length(0);
    });
    lunes().then(s => cy.get('.mo-time[data-moto="lucas"][data-dia="' + s + '"][data-campo="tt_e"]')
      .clear().type('19:00').blur());
    cy.get('.mo-time[data-moto="lucas"][data-campo="tt_e"]').first().should('not.have.class', 'mo-time-error');
    cy.get('.mo-error-summary').should('not.be.visible');
    cy.get('[data-mo-dia="lucas-0"]').should('contain.text', '7:30');
    cy.get('[data-mo-act="guardar"]').click();
    cy.get('.mo-sheet.editando').should('not.exist');
    lunes().then(s => cy.window().its('__rows').should(rows => {
      const d = docsMotos(rows).find(r => r.id === 'd-' + s + '-lucas-' + s);
      expect(d.data).to.include({tm_e:'11:30', tm_s:'15:00', tt_e:'19:00', tt_s:'23:00'});
    }));
  });

  it('permite guardar una única entrada de turno tarde durante la semana y completarla después',()=>{
    launch();login('gerente.munro@example.com');
    cy.clock(new Date('2026-11-12T15:00:00Z').getTime(),['Date']);
    cy.get('#snav [data-go="motos"]').click();
    cy.get('[data-mo-act="modificar"]').click();
    hora('lucas','tt_e','19:00');
    cy.get('.mo-error-summary').should('not.be.visible');
    cy.get('.mo-parcial-nota').should('be.visible').and('contain.text','Podés guardar ahora');
    cy.get('[data-mo-act="guardar"]').click();
    cy.get('.mo-sheet.editando').should('not.exist');
    lunes().then(s=>cy.window().its('__rows').should(rows=>{
      const d=docsMotos(rows).find(r=>r.id==='d-'+s+'-lucas-'+s);
      expect(d.data.tt_e).to.eq('19:00');
      expect(d.data.tt_s||'').to.eq('');
    }));
    cy.get('[data-mo-tot="lucas"]').first().should('have.text','0:00');
    cy.get('[data-mo-act="modificar"]').click();
    hora('lucas','tt_s','23:00');
    cy.get('.mo-parcial-nota').should('not.be.visible');
    cy.get('[data-mo-act="guardar"]').click();
    cy.get('[data-mo-tot="lucas"]').first().should('have.text','4:00');
  });

  it('el domingo 23:30 AR exige revisar turnos guardados antes de cerrar la semana',()=>{
    launch();login('gerente.munro@example.com');
    cy.clock(new Date('2026-11-16T02:29:00Z').getTime(),['Date','setInterval']);
    cy.get('#snav [data-go="motos"]').click();
    cy.get('[data-mo-act="modificar"]').click();
    hora('lucas','tt_e','19:00');
    cy.get('.mo-error-summary').should('not.be.visible');
    cy.get('[data-mo-act="guardar"]').click();
    cy.get('.mo-sheet.editando').should('not.exist');
    cy.get('.mo-aviso-cierre').should('not.exist');

    cy.tick(60*1000);
    cy.get('.mo-aviso-cierre').should('be.visible').and('contain.text','domingo 23:30');
    cy.get('.mo-error-summary').should('be.visible').and('contain.text','Completá la entrada y la salida');
    cy.get('[data-mo-tot="lucas"]').first().should('contain.text','Revisar');
    cy.get('[data-mo-act="modificar"]').click();
    cy.get('[data-mo-act="guardar"]').click();
    cy.get('.mo-sheet.editando').should('exist','el cierre no se permite con datos incompletos');
    hora('lucas','tt_s','23:30');
    cy.get('.mo-error-summary').should('not.be.visible');
    cy.get('[data-mo-act="guardar"]').click();
    cy.get('.mo-sheet.editando').should('not.exist');
    cy.get('[data-mo-tot="lucas"]').first().should('have.text','4:30');
  });

  it('rechaza 19:00 a 15:00, no lo suma ni guarda y permite el turno tarde hasta medianoche', () => {
    launch(); login('gerente.munro@example.com');
    cy.get('#snav [data-go="motos"]').click();
    cy.get('[data-mo-act="modificar"]').click();
    hora('lucas', 'tm_e', '19:00');
    hora('lucas', 'tm_s', '15:00');
    cy.get('.mo-error-summary').should('be.visible').and('contain.text', 'salida del turno mañana');
    cy.get('[data-mo-dia="lucas-0"]').should('contain.text', 'Revisar');
    cy.get('[data-mo-tot="lucas"]').first().should('contain.text', 'Revisar');
    cy.get('[data-mo-act="guardar"]').click();
    cy.get('.mo-sheet.editando').should('exist');
    cy.window().its('__rows').should(rows =>
      expect(docsMotos(rows).filter(r => r.id.startsWith('d-'))).to.have.length(0));

    lunes().then(s => cy.get('.mo-time[data-moto="lucas"][data-dia="' + s + '"][data-campo="tm_e"]')
      .clear().type('09:00').blur());
    hora('lucas', 'tt_e', '19:00');
    hora('lucas', 'tt_s', '15:00');
    cy.get('.mo-error-summary').should('contain.text', 'supera 16 horas');
    cy.get('[data-mo-act="guardar"]').click();
    cy.window().its('__rows').should(rows =>
      expect(docsMotos(rows).filter(r => r.id.startsWith('d-'))).to.have.length(0));
    lunes().then(s => cy.get('.mo-time[data-moto="lucas"][data-dia="' + s + '"][data-campo="tt_s"]')
      .clear().type('00:00').blur());
    cy.get('.mo-error-summary').should('not.be.visible');
    cy.get('[data-mo-dia="lucas-0"]').should('contain.text', '11:00');
    cy.get('[data-mo-act="guardar"]').click();
    lunes().then(s => cy.window().its('__rows').should(rows => {
      const d = docsMotos(rows).find(r => r.id === 'd-' + s + '-lucas-' + s);
      expect(d.data).to.include({tm_e:'09:00', tm_s:'15:00', tt_e:'19:00', tt_s:'00:00'});
    }));
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
