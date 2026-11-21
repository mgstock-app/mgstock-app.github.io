/* global describe, it, cy, expect */
// Piloto móvil aislado: NO llama al Supabase real, NO crea pedidos y NO modifica stock.
describe('GESTLOK Chat · piloto seguro Munro y Don Torcuato', () => {
  it('mantiene pedido, sesión y seguimiento independientes al cambiar de sucursal', () => {
    cy.viewport(390, 844);
    const llamadas = [];
    const sucursales = {
      'mi-gusto-munro': {nombre:'Munro', total:2200},
      'mi-gusto-torcuato': {nombre:'Don Torcuato', total:3300},
    };
    cy.intercept('POST', '**/functions/v1/gestlok-chat', req => {
      llamadas.push({slug:req.body.slug, token:req.body.token, accion:req.body.accion});
      const s=sucursales[req.body.slug];
      if (!s) {
        req.reply({statusCode:404,body:{ok:false,error:'Sucursal de prueba inexistente'}});
        return;
      }
      req.reply({statusCode:200,body:{
        ok:true,
        sucursal:{slug:req.body.slug,nombre:s.nombre,empresa:'Mi Gusto',
          horario:'11:00 a 14:40 y 19:00 a 23:15',menu_interactivo:true,
          acepta_retiro:true,acepta_envio:true,pedido_minimo:0,envio_costo:0,
          medios_pago:['efectivo']},
        catalogo:{categorias:[],productos:[]},mensajes:[],nuevos:[],carrito:[],
        pedidos:[{creado_at:new Date().toISOString(),estado:'pendiente',
          entrega:'retiro',total:s.total}]
      }});
    }).as('chatFicticio');
    cy.visit('/chat/?s=mi-gusto-munro');
    cy.wait('@chatFicticio').its('request.body.slug').should('eq','mi-gusto-munro');
    cy.get('#app').should('have.attr','aria-busy','false');
    cy.get('#titulo').should('have.text','Mi Gusto · Munro');
    cy.get('#aviso-pedido').should('contain.text','Pendiente de confirmación')
      .and('contain.text','2.200').and('not.contain.text','3.300');
    cy.get('#aviso-pedido .seguimiento-etapa.completada').should('have.length',1);

    cy.visit('/chat/?s=mi-gusto-torcuato');
    cy.wait('@chatFicticio').its('request.body.slug').should('eq','mi-gusto-torcuato');
    cy.get('#app').should('have.attr','aria-busy','false');
    cy.get('#titulo').should('have.text','Mi Gusto · Don Torcuato');
    cy.get('#aviso-pedido').should('contain.text','Pendiente de confirmación')
      .and('contain.text','3.300').and('not.contain.text','2.200');
    cy.document().its('documentElement.scrollWidth').should('be.lte',392);
    cy.window().then(win => {
      const munro=win.localStorage.getItem('gestlok-chat:token:mi-gusto-munro');
      const torcuato=win.localStorage.getItem('gestlok-chat:token:mi-gusto-torcuato');
      expect(munro).to.match(/^[A-Za-z0-9_-]{43}$/);
      expect(torcuato).to.match(/^[A-Za-z0-9_-]{43}$/);
      expect(torcuato).not.to.equal(munro);
    });

    cy.visit('/chat/?s=mi-gusto-munro');
    cy.wait('@chatFicticio');
    cy.get('#titulo').should('have.text','Mi Gusto · Munro');
    cy.get('#aviso-pedido').should('contain.text','2.200').and('not.contain.text','3.300');
    cy.then(() => {
      const aperturas=llamadas.filter(x=>x.accion==='abrir');
      expect(aperturas.map(x=>x.slug)).to.deep.equal([
        'mi-gusto-munro','mi-gusto-torcuato','mi-gusto-munro'
      ]);
      expect(aperturas[0].token).to.eq(aperturas[2].token);
      expect(aperturas[0].token).not.to.eq(aperturas[1].token);
    });
  });
});
