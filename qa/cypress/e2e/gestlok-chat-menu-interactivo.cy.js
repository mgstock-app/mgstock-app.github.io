describe('GESTLOK Chat · menú interactivo', () => {
  it('destaca Hacer un pedido antes de los accesos secundarios y abre la carta en celular', () => {
    cy.viewport(320, 740);
    cy.visit('/chat/?demo=1');
    cy.get('.burbuja.asistente').should('exist');
    cy.get('.chips').first().within(() => {
      cy.get('button.chip-hacer-pedido').should('have.text', 'Hacer un pedido')
        .and('be.visible')
        .and('have.css', 'background-color', 'rgb(49, 109, 159)');
      cy.get('button.chip-hacer-pedido').should('have.length', 1);
    });
    cy.get('.chips button.chip-hacer-pedido').first().then($boton => {
      const boton = $boton[0].getBoundingClientRect();
      expect(boton.width).to.be.greaterThan(280);
      expect(boton.height).to.be.at.least(54);
    });
    cy.get('.chips button.chip-hacer-pedido').first().click();
    cy.get('#hoja').should('be.visible');
    cy.get('#hoja-titulo').should('have.text', 'Menú');
    cy.get('#hoja .lista').should('contain.text', 'Empanada de carne');
  });

  ['mi-gusto-munro', 'mi-gusto-torcuato'].forEach(slug => {
    it('destaca el botón de pedido aunque la API todavía envíe Ver menú en ' + slug, () => {
      cy.viewport(390, 844);
      const local = slug === 'mi-gusto-munro' ? 'Munro' : 'Don Torcuato';
      cy.intercept('POST', '**/functions/v1/gestlok-chat', req => {
        if (req.body.accion !== 'abrir') return req.reply({ok:true,carrito:[],mensajes:[]});
        req.reply({ok:true,sucursal:{slug,menu_interactivo:true,empresa:'Mi Gusto',nombre:local,horario:'11:00 a 14:40 y 19:00 a 23:15'},
          catalogo:{categorias:[{id:'c1',nombre:'Empanadas'}],productos:[{
            id:'9a000000-0000-4000-8000-000000000001',categoria_id:'c1',
            nombre:'Empanada de carne',precio:4900,activo:true,disponible:true,opciones:[]}]},
          mensajes:[],nuevos:[{texto:'Para realizar su pedido, toque Hacer un pedido.',
            botones:[{id:'horario',texto:'Horario y envío'},{id:'carta',texto:'Ver menú'},
              {id:'pago',texto:'Medios de pago'}]}],carrito:[],pedidos:[]});
      }).as('chat');
      cy.visit('/chat/?s=' + slug);
      cy.wait('@chat');
      cy.get('.chips button').first().should('have.text','Hacer un pedido').and('have.class','chip-hacer-pedido').click();
      cy.get('#hoja-titulo').should('have.text','Menú');
      cy.get('#hoja').should('contain.text','Empanada de carne');
    });
  });
  it('separa la configuración de la lista y mantiene la selección antes de enviar', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.get('#btn-carta').click();
    cy.get('#hoja .menu-interactivo').should('not.have.class', 'menu-editando');
    cy.get('#hoja .menu-pie').should('be.visible');
    cy.contains('#hoja .menu-fila', 'Pack 6 empanadas + 2 salsas')
      .find('button.menu-paso-elegir').should('have.text', 'Elegir').click();
    cy.get('#hoja .menu-interactivo').should('have.class', 'menu-editando');
    cy.get('#hoja .menu-fila:visible').should('have.length', 1);
    cy.get('#hoja .categorias').should('not.be.visible');
    cy.get('#hoja .menu-pie').should('not.be.visible');
    cy.get('#hoja .menu-producto-detalle').should('contain.text', 'Cantidad de promociones');
    cy.contains('#hoja .menu-personalizar-titulo button', 'Volver al menú').click();
    cy.get('#hoja .menu-interactivo').should('not.have.class', 'menu-editando');
    cy.get('#hoja .menu-pie').should('be.visible');

    cy.contains('#hoja .menu-fila','Empanada de carne')
      .find('button[aria-label="Sumar una unidad de Empanada de carne"]').click();
    cy.get('#hoja .menu-pie-texto').should('contain.text', '1 producto seleccionado');
    cy.contains('#hoja .menu-fila','Empanada de jamón y queso')
      .find('button[aria-label="Sumar una unidad de Empanada de jamón y queso"]').click();
    cy.get('#hoja .menu-pie-texto').should('contain.text', '2 productos seleccionados');
    cy.get('#hoja .menu-pie button').contains('Continuar').click();
    cy.get('#hoja .menu-revision').should('contain.text', 'Empanada de carne')
      .and('contain.text', 'Empanada de jamón y queso');
    cy.get('.burbuja.cliente').should('not.exist');
  });
  it('suma y quita desde el menú sin perder la lista ni la categoría', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.get('#btn-carta').should('not.be.disabled').click();
    cy.get('#hoja-titulo').should('have.text','Menú');
    const carne=()=>cy.contains('#hoja .menu-fila','Empanada de carne').first();
    carne().find('button[aria-label="Sumar una unidad de Empanada de carne"]').click();
    carne().find('button[aria-label="Sumar una unidad de Empanada de carne"]').click();
    carne().find('output.menu-n').should('contain.text','2');
    cy.get('#hoja-titulo').should('have.text','Menú');
    cy.get('#hoja .menu-pie-texto').should('contain.text','2 productos seleccionados');
    carne().find('button[aria-label="Quitar una unidad de Empanada de carne"]').click();
    carne().find('output.menu-n').should('contain.text','1');
    cy.get('#hoja .menu-pie-texto').should('contain.text','1 producto seleccionado');
    cy.get('#hoja .categorias').contains('button','Pizzas').click();
    cy.get('#hoja-titulo').should('have.text','Menú');
    cy.get('#hoja .lista').should('contain.text','Pizza muzzarella');
    cy.get('#hoja .categorias').contains('button','Empanadas').click();
    carne().should('be.visible');
    cy.get('#hoja .menu-pie').should('contain.text','Continuar');
  });

  it('despliega promociones y obliga a elegir todas las variedades sin salir del menú', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.get('#btn-carta').should('not.be.disabled').click();
    cy.contains('#hoja .menu-fila','Pack 6 empanadas + 2 salsas')
      .find('button.menu-paso-mas').click();
    cy.get('#hoja-titulo').should('have.text','Menú');
    cy.get('#hoja .menu-producto-detalle:visible').should('contain.text','Empanadas')
      .and('contain.text','Salsas');
    cy.get('#hoja .menu-form-combo .menu-combo-acciones').should('be.visible')
      .and('contain.text', 'Agregar $ 6.500');
    cy.get('#hoja .menu-form-combo .menu-combo-acciones button').should('be.disabled');
    cy.get('#hoja .menu-grupo-lista').first().find('.menu-variedad-fila').first()
      .find('button[aria-label^="Quitar"]').should('not.be.visible');
    cy.get('#hoja .menu-producto-detalle:visible img').should('not.exist');
    cy.get('#hoja .menu-producto-detalle:visible .grupo-cantidad').first()
      .find('.grupo-estado').should('contain.text','Debe elegir 6');
    cy.get('#hoja .menu-producto-detalle:visible .grupo-cantidad').last()
      .find('.grupo-estado').should('contain.text','Debe elegir 2');
    cy.get('#hoja .menu-producto-detalle:visible button[type=submit]').should('be.disabled');
    cy.get('#hoja .menu-producto-detalle:visible')
      .contains('.opcion-cantidad','Empanada de carne').find('button[aria-label="Sumar Empanada de carne"]')
      .click().click().click().click().click().click();
    cy.get('#hoja .menu-producto-detalle:visible .grupo-cantidad').first()
      .find('.grupo-estado').should('contain.text','Completo');
    cy.get('#hoja .menu-variedad-fila').first().find('button[aria-label^="Quitar"]').should('be.visible');
    cy.get('#hoja .menu-form-combo .menu-combo-acciones button').should('be.disabled');
    cy.get('#hoja .menu-producto-detalle:visible button[type=submit]').should('be.disabled');
    cy.get('#hoja .menu-producto-detalle:visible')
      .contains('.opcion-cantidad','Criolla').find('button[aria-label="Sumar Criolla"]').click().click();
    cy.get('#hoja .menu-producto-detalle:visible .grupo-cantidad').last()
      .find('.grupo-estado').should('contain.text','Completo');
    cy.get('#hoja .menu-form-combo .menu-combo-acciones button[type=submit]')
      .should('not.be.disabled').and('contain.text', 'Agregar $ 6.500').click();
    cy.get('#hoja-titulo').should('have.text','Menú');
    cy.get('#hoja .menu-producto-detalle:visible').should('not.exist');
    cy.get('#hoja .menu-pie-texto').should('contain.text','1 producto seleccionado');
    cy.get('#hoja .menu-pie').contains('button','Continuar').click();
    cy.get('#hoja .menu-revision').should('contain.text','Pack 6 empanadas + 2 salsas')
      .and('contain.text','6 Empanada de carne')
      .and('contain.text','2 Criolla');
    // Se envía todo junto; hasta acá no se escribió nada al asistente.
    cy.get('.burbuja.cliente').should('not.exist');
    cy.get('#hoja .menu-revision button').contains('Continuar').click();
    cy.get('#hoja').should('not.be.visible');
    cy.get('#barra-texto').should('contain.text','1 producto');
  });

  it('selector de promo como la referencia: Debe elegir, + suelto, tacho con 1 y − con más', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.get('#btn-carta').should('not.be.disabled').click();
    cy.contains('#hoja .menu-fila','Pack 6 empanadas + 2 salsas').find('button.menu-paso-mas').click();
    cy.get('#hoja .menu-producto-detalle:visible .grupo-cantidad').first().within(() => {
      cy.get('.grupo-estado').should('have.class', 'pendiente').and('contain.text', 'Debe elegir 6');
      cy.get('.menu-variedad-fila').first().as('fila');
    });
    cy.get('@fila').find('.pasos').should('not.have.class', 'activo');
    cy.get('@fila').find('button[aria-label^="Sumar"]').click();
    cy.get('@fila').find('.pasos').should('have.class', 'activo');
    cy.get('@fila').find('button[aria-label^="Quitar"] svg.icono-tacho').should('exist');
    cy.get('@fila').find('button[aria-label^="Sumar"]').click();
    cy.get('@fila').find('button[aria-label^="Quitar"]').should('contain.text', '−');
    cy.get('#hoja .menu-producto-detalle:visible .grupo-cantidad').first()
      .find('.grupo-estado').should('contain.text', 'Faltan 4');
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
    cy.get('#hoja .menu-pie button').contains('Continuar').click();
    cy.get('#hoja .menu-revision').should('contain.text','2 × Empanada de carne')
      .and('contain.text', '1 × Empanada de jamón y queso');

    cy.get('#hoja .menu-revision button').contains('Continuar').click();
    cy.contains('.burbuja.asistente', 'Recibí su selección del menú', {timeout: 12000});
    // Con 3 empanadas sueltas el asistente ofrece armar la promo; el cliente puede seguir sin ella.
    cy.get('.burbuja.asistente').last().should('contain.text', 'Tenemos una promoción para usted');
    cy.contains('.chip', 'No, seguir sin promoción').click();
    cy.get('.burbuja.asistente').last().should('contain.text', 'seguimos con su selección');
    cy.get('#barra-texto').should('contain.text', '3 productos');
    cy.get('#hoja').should('not.be.visible');

    // Registrar el pedido requiere una acción posterior y datos del cliente.
    cy.get('#btn-finalizar').should('contain.text', 'Enviar pedido').click();
    cy.contains('.chip','No, gracias, enviar').click();
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
        slug:'mi-gusto-munro',menu_interactivo:true,empresa:'Mi Gusto',nombre:'Munro',acepta_retiro:true,
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
    cy.contains('#hoja .menu-pie button','Continuar').click();
    cy.contains('#hoja .menu-revision button','Continuar').click();
    cy.wait('@chat');
    cy.get('#hoja').should('be.visible').and('contain.text','Tu selección del menú');
    cy.get('#hoja .menu-revision').should('contain.text','1 × Empanada de carne');
    cy.get('#barra-texto').should('contain.text','1 producto');
    cy.reload();
    cy.get('#btn-carrito').click();
    cy.get('#hoja .menu-revision').should('contain.text','1 × Empanada de carne');
  });
});
