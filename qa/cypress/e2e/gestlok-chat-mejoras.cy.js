/* global describe, it, cy, expect */
// Las mejoras funcionan sin pedidos reales y conservan el aislamiento por local.
describe('GESTLOK Chat · seguimiento, recurrencia e indicadores', () => {
  it('permite repetir la selección guardada sin enviar ni confirmar nada automáticamente', () => {
    cy.viewport(390, 820);
    cy.visit('/chat/?demo=1', {onBeforeLoad(win) {
      win.localStorage.setItem('gestlok-chat:ultimo-pedido:demo', JSON.stringify({
        at: Date.now(), lineas: [{producto_id:'d1', cantidad:3, opciones:{}}]
      }));
    }});
    cy.get('#app').should('have.attr','aria-busy','false');
    cy.contains('.chip','Repetir mi último pedido').click();
    cy.get('#hoja').should('be.visible');
    cy.get('#hoja .menu-revision').should('contain.text','3 × Empanada de carne');
    cy.get('#aviso-pedido').should('not.be.visible'); // solo revisión, sin pedido confirmado
    cy.get('#hoja .menu-revision').should('contain.text','Total estimado');
  });

  it('no ofrece repetición cuando el producto quedó agotado', () => {
    cy.viewport(390, 820);
    cy.visit('/chat/?demo=1', {onBeforeLoad(win) {
      win.localStorage.setItem('gestlok-chat:ultimo-pedido:demo', JSON.stringify({
        at: Date.now(), lineas: [{producto_id:'d3', cantidad:1, opciones:{}}]
      }));
    }});
    cy.get('#app').should('have.attr','aria-busy','false');
    cy.contains('.chip','Repetir mi último pedido').should('not.exist');
  });

  const abrir = estado => ({
    ok:true,
    sucursal:{slug:'mi-gusto-munro',nombre:'Munro',empresa:'Mi Gusto',
      horario:'11 a 23',acepta_retiro:true,acepta_envio:false,envio_costo:0,
      pedido_minimo:0,medios_pago:['efectivo']},
    catalogo:{categorias:[],productos:[]}, mensajes:[],nuevos:[],carrito:[],
    pedidos:[{creado_at:new Date().toISOString(),estado,entrega:'retiro',total:2000}]
  });
  for (const [estado, pasos] of [['pendiente',1],['confirmado',2],['terminado',3]]) {
    it('muestra '+pasos+' etapa(s) completada(s) en estado '+estado, () => {
      cy.viewport(390, 820);
      cy.intercept('POST','**/functions/v1/gestlok-chat', abrir(estado));
      cy.visit('/chat/?s=mi-gusto-munro');
      cy.get('#aviso-pedido').should('be.visible');
      cy.get('#aviso-pedido .seguimiento-etapa').should('have.length',3);
      cy.get('#aviso-pedido .seguimiento-etapa.completada').should('have.length',pasos);
      cy.get('#aviso-pedido').should('contain.text','Recibido')
        .and('contain.text','Confirmado');
      cy.document().its('documentElement.scrollWidth').should('be.lte',392);
    });
  }

  it('presenta métricas del negocio en la demo sin consultar la base', () => {
    cy.viewport(390, 820);
    cy.visit('/chat/panel/?demo=1');
    cy.get('[data-p="reporte"]').click();
    cy.contains('Indicadores del período').should('be.visible');
    cy.contains('Pedidos aceptados').should('be.visible');
    cy.contains('Tiempo medio hasta confirmar').should('be.visible');
    cy.contains('Clientes frecuentes').should('be.visible');
    cy.contains('Productos más pedidos').should('be.visible');
    cy.contains('Importe estimado de pedidos aceptados').should('be.visible');
    cy.document().its('documentElement.scrollWidth').should('be.lte',392);
  });
});
