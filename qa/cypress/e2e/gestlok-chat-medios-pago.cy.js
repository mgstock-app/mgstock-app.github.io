const API = '**/functions/v1/gestlok-chat';
const sucursal = {
  slug: 'mi-gusto-munro', empresa: 'Mi Gusto', nombre: 'Munro',
  bienvenida: '¡Hola! Soy el asistente de Mi Gusto Munro. ¿En qué puedo ayudarte? Podés escribirme o pedirme el menú.',
  horario: 'Todos los días de 11:00 a 14:40 y de 19:00 a 23:15', direccion: 'Av. Mitre 2510',
  acepta_retiro: true, acepta_envio: true, envio_costo: 4000,
  envio_zona: 'Munro, Florida Oeste, Villa Martelli, Carapachay y alrededores',
  medios_pago: ['debito','credito','efectivo','transferencia'],
  medios_pago_retiro: ['debito','credito','efectivo','transferencia'],
  medios_pago_envio: ['efectivo','transferencia']};
const btns = [{id:'carta',texto:'Ver menú'},{id:'horario',texto:'Horario y envío'},{id:'pago',texto:'Medios de pago'}];
const producto = {id:'9a000000-0000-4000-8000-000000000001',nombre:'Empanada',precio:4900,activo:true,disponible:true,opciones:[]};
const carrito = [{producto_id:producto.id,cantidad:1,opciones:{},nota:''}];
describe('GESTLOK Chat · mensajes y medios de pago', () => {
  it('botones responden correctamente y el formulario filtra pagos por retiro o delivery', () => {
    cy.viewport(390,844);
    cy.intercept('POST',API, req => {
      if(req.body.accion==='abrir') return req.reply({ok:true,sucursal,catalogo:{categorias:[],productos:[producto]},
        mensajes:[],nuevos:[{texto:sucursal.bienvenida,botones:btns}],carrito,pedidos:[]});
      const boton = req.body.entrada?.boton;
      if(boton==='pago') return req.reply({ok:true,carrito,mensajes:[{texto:'Retiro en el local: Tarjeta de débito, Tarjeta de crédito, Efectivo, Transferencia.\nDelivery: Efectivo, Transferencia.',botones:btns}]});
      if(boton==='horario') return req.reply({ok:true,carrito,mensajes:[{texto:sucursal.horario+' · Envío: $ 4.000',botones:btns}]});
      if(boton==='finalizar') return req.reply({ok:true,carrito,mensajes:[{texto:'Completá tus datos',tipo:'datos'}]});
      return req.reply({ok:true,carrito,mensajes:[{texto:'Te ayudo con tu consulta',botones:btns}]});
    }).as('chat');
    cy.visit('/chat/?s=mi-gusto-munro');
    cy.contains('.burbuja.asistente','¿En qué puedo ayudarte?').should('be.visible');
    cy.contains('.chip','Medios de pago').click();
    cy.wait('@chat');
    cy.contains('.burbuja.asistente','Retiro en el local: Tarjeta de débito, Tarjeta de crédito, Efectivo, Transferencia.').should('be.visible');
    cy.contains('.burbuja.asistente','Delivery: Efectivo, Transferencia.').should('be.visible');
    cy.contains('.chip','Horario y envío').click();
    cy.wait('@chat');
    cy.contains('.burbuja.asistente','11:00 a 14:40').should('be.visible');
    cy.get('#btn-info').click();
    cy.get('#hoja').should('contain.text','Pago · retiro en local').and('contain.text','Pago · delivery')
      .and('contain.text','Tarjeta de crédito, Efectivo, Transferencia');
    cy.get('#hoja-cerrar').click();
    cy.get('#btn-finalizar').click();
    cy.wait('@chat');
    cy.get('#hoja select[name=medio_pago] option').should('have.length',4);
    cy.get('#hoja input[type=radio][value=envio]').check({force:true});
    cy.get('#hoja select[name=medio_pago] option').should('have.length',2);
    cy.get('#hoja select[name=medio_pago]').should('have.value','efectivo');
    cy.get('#hoja select[name=medio_pago]').select('transferencia');
    cy.get('#hoja input[type=radio][value=retiro]').check({force:true});
    cy.get('#hoja select[name=medio_pago] option').should('have.length',4);
  });
  it('si el local pausa la atención, no muestra un error genérico ni reintentos infinitos', () => {
    cy.viewport(390,844);
    cy.intercept('POST',API, req => {
      if(req.body.accion==='abrir') return req.reply({ok:true,sucursal,catalogo:{categorias:[],productos:[producto]},
        mensajes:[],nuevos:[{texto:sucursal.bienvenida,botones:btns}],carrito:[],pedidos:[]});
      return req.reply({ok:false,motivo:'pausado',sucursal:{empresa:'Mi Gusto',nombre:'Munro',mensaje:'Volvé a intentar más tarde.'}});
    });
    cy.visit('/chat/?s=mi-gusto-munro');
    cy.contains('.chip','Medios de pago').click();
    cy.contains('.pausado','Chat en pausa').should('be.visible');
    cy.contains('No pudimos enviar tu mensaje').should('not.exist');
    cy.contains('Reintentar').should('not.exist');
  });
});
