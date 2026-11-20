describe('GESTLOK Chat · menú interactivo', () => {
  it('arma un pedido visual, lo revisa y recién entonces lo envía al asistente', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.get('#btn-carta').should('not.be.disabled').click();

    cy.get('#hoja .producto').contains('Empanada de carne').click();
    cy.get('#hoja form .cantidad button[aria-label="Más"]').click();
    cy.get('#hoja form button[type=submit]').click();
    cy.get('#hoja .menu-pie-texto').should('contain.text', '2 productos seleccionados');
    cy.get('#hoja .producto').contains('Empanada de jamón y queso').click();
    cy.get('#hoja form button[type=submit]').click();
    cy.get('#hoja .menu-pie-texto').should('contain.text', '3 productos seleccionados');

    // Todavía no se enviaron mensajes de productos al asistente.
    cy.get('.burbuja.cliente').should('not.exist');
    cy.get('#hoja .menu-pie button').contains('Revisar selección').click();
    cy.get('#hoja .menu-revision').should('contain.text','2 × Empanada de carne')
      .and('contain.text', '1 × Empanada de jamón y queso');

    cy.get('#hoja .menu-revision button').contains('Enviar selección al asistente').click();
    cy.contains('.burbuja.asistente', 'Recibí su selección del menú', {timeout: 12000});
    // Con 3 empanadas sueltas el asistente ofrece armar la promo; el cliente puede seguir sin ella.
    cy.get('.burbuja.asistente').last().should('contain.text', 'Tenemos una promoción para usted');
    cy.contains('.chip', 'No, seguir sin promoción').click();
    cy.get('.burbuja.asistente').last().should('contain.text', 'seguimos con su selección');
    cy.get('#barra-texto').should('contain.text', '3 productos');
    cy.get('#hoja').should('not.be.visible');

    // Registrar el pedido requiere una acción posterior y datos del cliente.
    cy.get('#btn-finalizar').should('contain.text', 'Finalizar').click();
    cy.contains('.chip','No, gracias. Finalizar').click();
    cy.get('#hoja').should('be.visible');
    cy.get('#hoja').should('contain.text', 'Sus datos');
    cy.get('#aviso-pedido').should('not.be.visible');
  });
});

describe('GESTLOK Chat · menú interactivo ante un rechazo', () => {
  it('conserva el borrador si el servidor rechaza el lote y permite volver a corregirlo', () => {
    cy.viewport(390, 844);
    const producto = {id:'9a000000-0000-4000-8000-000000000001',categoria_id:'c1',
      nombre:'Empanada de carne',precio:1200,activo:true,disponible:true,opciones:[]};
    cy.intercept('POST','**/functions/v1/gestlok-chat', req => {
      if (req.body.accion === 'abrir') return req.reply({ok:true,sucursal:{
        slug:'mi-gusto-munro',empresa:'Mi Gusto',nombre:'Munro',acepta_retiro:true,
        acepta_envio:false,medios_pago:['efectivo']},catalogo:{
        categorias:[{id:'c1',nombre:'Empanadas'}],productos:[producto]},
        mensajes:[],nuevos:[{texto:'Bienvenido',botones:[]}],carrito:[],pedidos:[]});
      return req.reply({ok:true,carrito:[],lote_aceptado:false,
        mensajes:[{texto:'Producto agotado. No se agregó ningún producto de esta selección.'}]});
    }).as('chat');
    cy.visit('/chat/?s=mi-gusto-munro');
    cy.get('#btn-carta').click();
    cy.contains('#hoja .producto','Empanada de carne').click();
    cy.get('#hoja form button[type=submit]').click();
    cy.contains('#hoja .menu-pie button','Revisar selección').click();
    cy.contains('#hoja .menu-revision button','Enviar selección al asistente').click();
    cy.wait('@chat');
    cy.get('#hoja').should('be.visible').and('contain.text','Tu selección del menú');
    cy.get('#hoja .menu-revision').should('contain.text','1 × Empanada de carne');
    cy.get('#barra-texto').should('contain.text','1 producto');
    cy.reload();
    cy.get('#btn-carrito').click();
    cy.get('#hoja .menu-revision').should('contain.text','1 × Empanada de carne');
  });
});
