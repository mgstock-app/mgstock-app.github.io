/* global describe, it, cy, expect */
// Las pruebas usan respuestas simuladas: nunca realizan pedidos reales.
describe('GESTLOK Chat · compra rápida, búsqueda y GPS opcional', () => {
  it('filtra empanadas dentro de la promoción y confirma en verde lo elegido', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/?demo=1');
    cy.get('#btn-carta').click();
    cy.contains('#hoja .menu-fila','Pack 6 empanadas + 2 salsas')
      .find('button.menu-paso-elegir').click();
    cy.get('#hoja .menu-grupo-lista').first().find('input.menu-filtro-variedades')
      .should('be.visible').type('carne');
    cy.get('#hoja .menu-grupo-lista').first()
      .find('.menu-variedad-fila:visible').should('have.length',1)
      .and('contain.text','Empanada de carne');
    cy.get('#hoja .menu-grupo-lista').first()
      .find('button[aria-label="Sumar Empanada de carne"]').click().click().click().click().click().click();
    cy.get('#hoja .menu-grupo-lista').last().find('input.menu-filtro-variedades').type('criolla');
    cy.get('#hoja .menu-grupo-lista').last()
      .find('.menu-variedad-fila:visible').should('have.length',1)
      .find('button[aria-label="Sumar Criolla"]').click().click();
    cy.get('#hoja .menu-combo-acciones button[type=submit]').should('not.be.disabled').click();
    cy.contains('#hoja .menu-fila-promo-elegida','Pack 6 empanadas + 2 salsas')
      .should('contain.text','Promoción seleccionada');
    cy.get('#hoja .menu-pie button').contains('Continuar').click();
    cy.get('#hoja .seleccion-linea-promo').should('contain.text','✓ Promoción seleccionada');
  });

  const sucursal = {
    slug:'mi-gusto-munro',empresa:'Mi Gusto',nombre:'Munro',menu_interactivo:true,
    acepta_retiro:true,acepta_envio:true,envio_costo:4000,
    medios_pago:['debito','credito','transferencia','efectivo'],
    medios_pago_retiro:['debito','credito','transferencia','efectivo'],
    medios_pago_envio:['efectivo','transferencia']
  };
  const prod = {id:'9a000000-0000-4000-8000-000000000001',nombre:'Empanada de carne',
    precio:4900,activo:true,disponible:true,opciones:[]};
  const carrito=[{producto_id:prod.id,cantidad:1,opciones:{},nota:''}];
  const abrirFalso = () => {
    cy.intercept('POST','**/functions/v1/gestlok-chat',req=>{
      if(req.body.accion==='abrir') return req.reply({ok:true,sucursal,
        catalogo:{productos:[prod],categorias:[{id:'emp',nombre:'Empanadas'}]},
        carrito,mensajes:[],pedidos:[],nuevos:[{texto:'Hola. ¿En qué podemos ayudarte hoy?',
          botones:[{id:'carta',texto:'Hacer un pedido'}]}]});
      if(req.body.accion==='recordar') return req.reply({ok:true,encontrado:false});
      if(req.body.accion==='mensaje' && req.body.entrada?.boton==='finalizar')
        return req.reply({ok:true,carrito,mensajes:[{texto:'Completá tus datos',tipo:'datos'}]});
      if(req.body.accion==='mensaje' && req.body.entrada?.datos) {
        req.alias='pedidoEnviar';
        return req.reply({ok:true,carrito:[],mensajes:[{texto:'Pedido recibido, pendiente de confirmación del gerente.'}],
          pedido:{estado:'pendiente',total:8900,entrega:'envio',items:[{producto_id:prod.id}]}});
      }
      req.reply({ok:true,carrito,mensajes:[]});
    }).as('chatAPI');
    cy.visit('/chat/?s=mi-gusto-munro');
    cy.get('#btn-finalizar').click();
    cy.get('#hoja-titulo').should('have.text','Sus datos');
  };

  it('permite entrega con GPS de alta precisión, entre calles y observación', () => {
    cy.viewport(390, 844);
    abrirFalso();
    cy.window().then(win=>{
      Object.defineProperty(win.navigator,'geolocation',{configurable:true,value:{
        getCurrentPosition:success=>success({coords:{latitude:-34.501234,longitude:-58.612345,accuracy:12}})
      }});
    });
    cy.get('#hoja input[name=nombre]').type('Cliente prueba');
    cy.get('#hoja input[name=telefono]').type('1123456789');
    cy.get('#hoja input[value=envio]').check({force:true});
    cy.get('#hoja').should('contain.text','Envío a domicilio');
    cy.get('#hoja input[name=entre_calles]').type('Mitre y Belgrano');
    cy.get('#hoja button.ubicacion-boton').click();
    cy.get('#hoja .ubicacion-estado').should('contain.text','Ubicación obtenida')
      .find('a').should('have.attr','href','https://www.google.com/maps?q=-34.501234,-58.612345');
    cy.get('#hoja textarea[name=nota]').should('have.attr','placeholder','Ej.: Portón negro, tocar timbre')
      .type('Portón negro');
    // En delivery el efectivo viene primero: hay que indicar con cuánto abona o elegir pago justo.
    cy.get('#hoja select[name=medio_pago]').should('have.value','efectivo');
    cy.get('#hoja button').contains('Pago justo, sin cambio').click();
    cy.get('#hoja button[type=submit]').contains('Enviar pedido').click();
    cy.wait('@pedidoEnviar').then(r=>{
      const d=r.request.body.entrada.datos;
      expect(d.direccion).to.contain('Mitre y Belgrano');
      expect(d.direccion).to.contain('https://www.google.com/maps?q=-34.501234,-58.612345');
      expect(d.nota).to.eq('Portón negro');
      expect(d.entrega).to.eq('envio');
      expect(d.medio_pago).to.eq('efectivo');
    });
  });

  it('mantiene opción manual y medios correctos para retiro, sin obligar a usar GPS', () => {
    cy.viewport(390, 844);
    abrirFalso();
    cy.get('#hoja select[name=medio_pago]').find('option').should('have.length',4);
    cy.get('#hoja select[name=medio_pago] optgroup').should('have.attr','label','Tarjeta débito/crédito');
    cy.get('#hoja select[name=medio_pago]').find('option').then($o=>{
      expect([...$o].map(x=>x.value)).to.deep.eq(['debito','credito','transferencia','efectivo']);
    });
    cy.get('#hoja input[value=envio]').check({force:true});
    cy.get('#hoja input[name=direccion]').type('Calle Mitre 2500');
    cy.get('#hoja input[name=entre_calles]').type('Belgrano y Moreno');
    cy.get('#hoja .costo-envio').should('contain.text','$ 4.000');
    cy.get('#hoja input[name=nombre]').type('Cliente prueba');
    cy.get('#hoja input[name=telefono]').type('1123456789');
    cy.get('#hoja select[name=medio_pago]').select('transferencia');
    cy.get('#hoja button[type=submit]').contains('Enviar pedido').click();
    cy.wait('@pedidoEnviar').then(r=>{
      const d=r.request.body.entrada.datos;
      expect(d.direccion).to.contain('Calle Mitre 2500');
      expect(d.direccion).to.contain('Entre calles: Belgrano y Moreno');
      expect(d.direccion).not.to.contain('GPS:');
    });
  });
});
