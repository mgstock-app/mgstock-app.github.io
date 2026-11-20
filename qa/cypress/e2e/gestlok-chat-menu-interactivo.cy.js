describe('GESTLOK Chat · menú interactivo', () => {
  it('suma y quita desde el menú sin perder la lista ni la categoría', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.get('#btn-carta').should('not.be.disabled').click();
    cy.get('#hoja-titulo').should('have.text','Menú interactivo');
    const carne=()=>cy.contains('#hoja .menu-fila','Empanada de carne').first();
    carne().find('button[aria-label="Sumar una unidad de Empanada de carne"]').click();
    carne().find('button[aria-label="Sumar una unidad de Empanada de carne"]').click();
    carne().find('output.menu-n').should('contain.text','2');
    cy.get('#hoja-titulo').should('have.text','Menú interactivo');
    cy.get('#hoja .menu-pie-texto').should('contain.text','2 productos seleccionados');
    carne().find('button[aria-label="Quitar una unidad de Empanada de carne"]').click();
    carne().find('output.menu-n').should('contain.text','1');
    cy.get('#hoja .menu-pie-texto').should('contain.text','1 producto seleccionado');
    cy.get('#hoja .categorias').contains('button','Pizzas').click();
    cy.get('#hoja-titulo').should('have.text','Menú interactivo');
    cy.get('#hoja .lista').should('contain.text','Pizza muzzarella');
    cy.get('#hoja .categorias').contains('button','Empanadas').click();
    carne().should('be.visible');
    cy.get('#hoja .menu-pie').should('contain.text','Revisar selección');
  });

  it('despliega promociones y obliga a elegir todas las variedades sin salir del menú', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.get('#btn-carta').should('not.be.disabled').click();
    cy.contains('#hoja .menu-fila','Pack 6 empanadas + 2 salsas')
      .find('button.menu-paso-mas').click();
    cy.get('#hoja-titulo').should('have.text','Menú interactivo');
    cy.get('#hoja .menu-producto-detalle:visible').should('contain.text','Empanadas')
      .and('contain.text','Salsas');
    cy.get('#hoja .menu-producto-detalle:visible img').should('not.exist');
    cy.get('#hoja .menu-producto-detalle:visible .grupo-cantidad').first()
      .find('.grupo-estado').should('contain.text','Faltan 6');
    cy.get('#hoja .menu-producto-detalle:visible .grupo-cantidad').last()
      .find('.grupo-estado').should('contain.text','Faltan 2');
    cy.get('#hoja .menu-producto-detalle:visible button[type=submit]').should('be.disabled');
    cy.get('#hoja .menu-producto-detalle:visible')
      .contains('.opcion-cantidad','Empanada de carne').find('button[aria-label="Sumar Empanada de carne"]')
      .click().click().click().click().click().click();
    cy.get('#hoja .menu-producto-detalle:visible .grupo-cantidad').first()
      .find('.grupo-estado').should('contain.text','Completo');
    cy.get('#hoja .menu-producto-detalle:visible button[type=submit]').should('be.disabled');
    cy.get('#hoja .menu-producto-detalle:visible')
      .contains('.opcion-cantidad','Criolla').find('button[aria-label="Sumar Criolla"]').click().click();
    cy.get('#hoja .menu-producto-detalle:visible .grupo-cantidad').last()
      .find('.grupo-estado').should('contain.text','Completo');
    cy.get('#hoja .menu-producto-detalle:visible button[type=submit]').should('not.be.disabled').click();
    cy.get('#hoja-titulo').should('have.text','Menú interactivo');
    cy.get('#hoja .menu-producto-detalle:visible').should('not.exist');
    cy.get('#hoja .menu-pie-texto').should('contain.text','1 producto seleccionado');
    cy.get('#hoja .menu-pie').contains('button','Revisar selección').click();
    cy.get('#hoja .menu-revision').should('contain.text','Pack 6 empanadas + 2 salsas')
      .and('contain.text','6 Empanada de carne')
      .and('contain.text','2 Criolla');
    // Se envía todo junto; hasta acá no se escribió nada al asistente.
    cy.get('.burbuja.cliente').should('not.exist');
    cy.get('#hoja .menu-revision button').contains('Enviar selección al asistente').click();
    cy.get('#hoja').should('not.be.visible');
    cy.get('#barra-texto').should('contain.text','1 producto');
  });

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
    cy.get('.burbuja.asistente', {timeout: 12000}).last()
      .should('contain.text', 'Recibí su selección del menú');
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
