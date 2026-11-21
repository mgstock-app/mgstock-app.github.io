/* global describe, it, cy, expect */
// GESTLOK Chat: chat público (celular) y panel de GESTLOK, sin red real (modo demostración y respuestas simuladas).
const FUNCION = '**/functions/v1/gestlok-chat';
const sinDesborde = () => cy.document().its('documentElement.scrollWidth').should('be.lte', 392);

describe('GESTLOK Chat · chat público', () => {
  it('toma un pedido completo en el celular (demostración)', () => {
    cy.viewport(390, 800);
    cy.visit('/chat/?demo=1');
    cy.get('.burbuja.asistente').should('contain.text', 'Comercio Sucursal Centro'); // el trato formal muestra «Su Comercio»
    cy.get('#texto').type('2 empanadas de carne y 1 de jamón y queso{enter}');
    cy.get('.burbuja.asistente').last().should('contain.text', '2 × Empanada de carne').and('contain.text', '1 × Empanada de jamón y queso');
    cy.get('#barra-texto').should('contain.text', '3 productos');
    cy.get('#btn-carta').click();
    cy.get('#hoja').should('be.visible');
    cy.contains('#hoja .menu-fila', 'Pizza muzzarella').find('button.menu-paso-elegir').click();
    cy.get('#hoja').contains('label', 'Grande').click();
    // El precio del encabezado es base ($ 7.500); el tamaño elegido se suma al total de la línea.
    cy.get('#hoja .menu-producto-detalle:visible').should('contain.text', 'Grande');
    cy.get('#hoja button[type=submit]').should('contain.text', 'Agregar y seguir eligiendo').click();
    cy.get('#hoja .menu-pie-texto').should('contain.text','1 producto seleccionado');
    cy.contains('#hoja .menu-pie button','Revisar selección').click();
    cy.get('#hoja .menu-revision').should('contain.text','Pizza muzzarella')
      .and('contain.text','Tamaño · Grande').and('contain.text','10.500');
    cy.contains('#hoja .menu-revision button','Enviar selección al asistente').click();
    cy.get('.burbuja.asistente').last().should('contain.text', 'Pizza muzzarella (Grande)');
    cy.get('#btn-finalizar').click();
    // Venta sugerida: ofrece un postre concreto con precio. El cliente decide si agregarlo.
    cy.get('.burbuja.asistente').last().should('contain.text', 'postre o una bebida');
    cy.contains('.chip', 'Flan casero · $ 2.500').click();
    cy.get('.burbuja.asistente').last().should('contain.text', 'Flan casero');
    cy.get('#btn-finalizar').click();
    cy.get('#hoja input[name=nombre]').type('Ana');
    cy.get('#hoja input[name=telefono]').type('11 5555 1234');
    cy.get('#hoja').contains('label', 'Envío').click();
    cy.get('#hoja button[type=submit]').click();
    cy.get('#hoja .error-form').should('contain.text', 'dirección');
    cy.get('#hoja input[name=direccion]').type('Mitre 200');
    cy.get('#hoja input[name=efectivo_abona]').should('be.visible').type('50000');
    cy.get('#hoja .cambio-previsto').should('contain.text','Cambio a enviar');
    cy.get('#hoja button[type=submit]').click();
    cy.get('#aviso-pedido').should('be.visible').and('contain.text', 'Pendiente de confirmación').and('not.contain.text','DEMO-0001');
    cy.get('.burbuja.asistente').last().should('contain.text', 'pendiente de revisión y confirmación').and('not.contain.text','DEMO-0001');
    cy.get('#aviso-pedido').should('not.contain.text', '¡Pedido listo!');
    cy.get('#barra-pedido').should('not.be.visible');
    sinDesborde();
  });

  it('agotados no se pueden elegir y los textos no se interpretan como HTML', () => {
    cy.viewport(390, 800);
    cy.visit('/chat/?demo=1');
    cy.get('.burbuja.asistente').should('be.visible');
    cy.get('#btn-carta').should('not.be.disabled').click();
    cy.get('#hoja').contains('button', 'Empanada de humita').should('be.disabled').and('contain.text', 'Agotado');
    cy.get('#hoja-cerrar').click();
    cy.get('#texto').type('<img src=x onerror="window.__xss=1"> hola{enter}');
    cy.get('.burbuja.cliente').last().should('contain.text', '<img src=x');
    cy.window().its('__xss').should('be.undefined');
  });

  it('habla con la función segura con slug, token y acción', () => {
    cy.viewport(390, 800);
    const cuerpos = [];
    cy.intercept('POST', FUNCION, req => {
      cuerpos.push(req.body);
      if (req.body.accion === 'abrir') {
        req.reply({ok: true, sucursal: {slug: 'mi-gusto-munro', nombre: 'Munro', empresa: 'Mi Gusto', horario: 'De 11 a 23', acepta_retiro: true,
          acepta_envio: false, envio_costo: 0, pedido_minimo: 0, medios_pago: ['efectivo']},
          catalogo: {categorias: [], productos: [{id: '9a000000-0000-4000-8000-000000000001', nombre: 'Empanada de carne', precio: 1000, activo: true, disponible: true, opciones: []}]},
          mensajes: [], nuevos: [{texto: '¡Hola! Soy el asistente de Mi Gusto Munro.', botones: [{id: 'carta', texto: 'Ver la carta'}]}], carrito: [], pedidos: []});
      } else {
        req.reply({ok: true, mensajes: [{texto: 'Agregué:\n• 2 × Empanada de carne'}], carrito: [{producto_id: '9a000000-0000-4000-8000-000000000001', cantidad: 2, opciones: {}}], pedido: null});
      }
    }).as('fn');
    cy.visit('/chat/?s=mi-gusto-munro');
    cy.wait('@fn');
    cy.get('#titulo').should('have.text', 'Mi Gusto · Munro');
    cy.get('#texto').type('2 de carne{enter}');
    cy.wait('@fn');
    cy.get('#barra-texto').should('contain.text', '2 productos · $ 2.000');
    cy.wrap(cuerpos).should(c => {
      expect(c[0]).to.include({slug: 'mi-gusto-munro', accion: 'abrir'});
      expect(c[0].token).to.match(/^[A-Za-z0-9_-]{43}$/);
      expect(c[1].token).to.eq(c[0].token);
      expect(c[1].entrada).to.deep.eq({texto: '2 de carne'});
    });
  });

  const abrirConPedido = pedido => ({ok: true, sucursal: {slug: 'mi-gusto-torcuato', nombre: 'Don Torcuato', empresa: 'Mi Gusto', horario: 'De 11 a 23',
    acepta_retiro: true, acepta_envio: true, envio_costo: 0, pedido_minimo: 0, medios_pago: ['efectivo']},
    catalogo: {categorias: [], productos: []}, mensajes: [], nuevos: [], carrito: [], pedidos: [pedido]});

  it('pedido recibido por el cliente: reseña de Google y agradecimiento una sola vez', () => {
    cy.viewport(390, 800);
    const pedido = {creado_at: new Date().toISOString(), recibido_at: new Date().toISOString(), estado: 'terminado', entrega: 'retiro', total: 2000, nombre: 'Ana',
      aviso: 'Ana, su pedido ya está listo para retirar.',
      resena: {texto: 'Nos ayudaría mucho que nos deje su reseña y nos cuente su experiencia.', url: 'https://g.page/r/CT9jkvArEGhFEBM/review'},
      cierre: '¡Gracias por elegirnos! 🥰'};
    cy.intercept('POST', FUNCION, abrirConPedido(pedido)).as('fn');
    cy.visit('/chat/?s=mi-gusto-torcuato');
    cy.wait('@fn');
    cy.get('#aviso-pedido').should('contain.text', 'Pedido recibido por el cliente').find('a')
      .should('have.attr', 'href', pedido.resena.url).and('have.attr', 'rel', 'noopener noreferrer');
    cy.contains('.burbuja.asistente', 'listo para retirar');
    cy.get('.burbuja.resena').should('contain.text', 'nos cuente su experiencia').find('a.resena-link')
      .should('have.attr', 'href', pedido.resena.url).and('have.attr', 'target', '_blank').and('contain.text', 'Dejar mi reseña en Google');
    cy.get('.burbuja.asistente').last().should('have.text', '¡Gracias por elegirnos! 🥰');
    sinDesborde();
    cy.reload();
    cy.wait('@fn');
    cy.get('#aviso-pedido').should('be.visible');
    cy.get('.burbuja.resena').should('not.exist');
  });

  it('ofrece reseña al estar listo y permite confirmar recepción sin duplicarla', () => {
    cy.viewport(390,800);
    const pedido = {creado_at:new Date().toISOString(),estado:'terminado',entrega:'retiro',total:2000,nombre:'Ana',
      aviso:'Su pedido está listo para retirar',resena:{texto:'Déjenos su reseña',url:'https://g.page/r/review'},
      cierre:'¡Gracias por elegirnos!'};
    cy.intercept('POST', FUNCION, req => {
      if (req.body.accion === 'recibido') return req.reply({ok:true,pedido:{...pedido,recibido_at:new Date().toISOString()}});
      return req.reply(abrirConPedido(pedido));
    }).as('fn');
    cy.visit('/chat/?s=mi-gusto-torcuato');
    cy.wait('@fn');
    cy.get('#aviso-pedido').should('contain.text','Ya recibí mi pedido');
    cy.get('.burbuja.resena').should('exist');
    cy.get('#aviso-pedido').contains('button','Ya recibí mi pedido').click();
    cy.wait('@fn');
    cy.get('#aviso-pedido').should('contain.text','Pedido recibido por el cliente');
    cy.get('.burbuja.resena').should('have.length',1);
  });

  it('pedido enviado: «en camino»; un link de reseña que no es de Google no se muestra', () => {
    cy.viewport(390, 800);
    cy.intercept('POST', FUNCION, abrirConPedido({creado_at: new Date().toISOString(), estado: 'terminado', entrega: 'envio', total: 2000,
      aviso: 'Ana, su pedido está en camino 🛵', resena: {texto: 'Déjenos su reseña', url: 'https://estafa.example/review'}, cierre: '¡Gracias por elegirnos!'})).as('fn');
    cy.visit('/chat/?s=mi-gusto-torcuato');
    cy.wait('@fn');
    cy.get('#aviso-pedido').should('contain.text', '¡Pedido en camino!').find('a').should('not.exist');
    cy.get('.burbuja.resena').should('not.exist');
    cy.contains('.burbuja.asistente','¡Gracias por elegirnos!').should('exist');
    cy.get('a[href*="estafa"]').should('not.exist');
  });

  it('muestra la pausa y el chat inexistente', () => {
    cy.intercept('POST', FUNCION, {statusCode: 200, body: {ok: false, motivo: 'pausado', sucursal: {nombre: 'Don Torcuato', empresa: 'Mi Gusto'}}});
    cy.visit('/chat/?s=mi-gusto-torcuato');
    cy.contains('Chat en pausa');
    cy.contains('Ahora no estamos tomando pedidos por chat');
    cy.get('#redactar').should('not.be.visible');
    cy.visit('/chat/');
    cy.contains('Chat no encontrado');
  });
});

describe('GESTLOK Chat · panel', () => {
  it('integrado en GESTLOK abre directo el local pedido y sin cabecera propia', () => {
    cy.visit('/chat/panel/?demo=1&embed=1&local=torcuato');
    cy.get('#pestanas').should('be.visible');
  });

  it('sin sesión pide entrar a GESTLOK', () => {
    cy.visit('/chat/panel/');
    cy.contains('Entrá a GESTLOK');
  });

  it('el gerente marca terminado, rechaza con motivo, marca agotado y edita mensajes (demostración)', () => {
    cy.viewport(390, 820);
    cy.visit('/chat/panel/?demo=1');
    cy.get('.tarjeta.pendiente').should('contain.text', 'MM-0007').and('contain.text', 'Ana Pérez');
    cy.get('#globo').should('have.text', '1');
    cy.contains('button', 'Rechazar…').click();
    cy.get('.rechazo .boton.peligro').click();
    cy.get('#aviso').should('contain.text', 'motivo');
    cy.get('.acciones .boton.principal').should('have.text', 'Confirmar y pasar a preparación').click();
    cy.contains('No hay pedidos pendientes de confirmación');
    cy.contains('button', 'En preparación').click();
    cy.get('.tarjeta.confirmado').should('contain.text', 'MM-0007');
    cy.get('.acciones .boton.principal').should('have.text', 'Pedido enviado');
    cy.get('.acciones .boton.principal').click();
    cy.get('#aviso').should('contain.text', 'MM-0007 enviado');
    cy.contains('No hay pedidos para mostrar');
    cy.get('[data-p=stock]').click();
    cy.contains('.stock-cabecera', 'Empanadas').find('button.stock-desplegar').click();
    cy.contains('.stock-item', 'Empanada de carne').find('input[type="checkbox"]').uncheck({force:true});
    cy.get('#aviso').should('contain.text', 'Empanada de carne agotado');
    cy.get('[data-p=mensajes]').click();
    cy.contains('label', 'Listo para retirar').find('textarea').clear().type('Listo {codigo}, pasá cuando quieras', {parseSpecialCharSequences: false});
    cy.get('.vista-previa').eq(0).should('contain.text', 'Listo MM-0012, pasá cuando quieras');
    cy.contains('label', 'Link de reseñas de Google').find('input').type('https://estafa.example/review');
    cy.contains('.vista-previa', 'El link tiene que ser de Google');
    cy.contains('label', 'Link de reseñas de Google').find('input').clear().type('https://g.page/r/CT9jkvArEGhFEBM/review');
    cy.contains('.vista-previa', 'Así lo ve el cliente después del aviso').should('contain.text', '[Dejar mi reseña en Google]').and('contain.text', '¡Gracias por elegirnos!');
    cy.contains('label', 'Indicaciones para la IA').find('textarea').type('Tratá de vos.');
    cy.contains('button', 'Guardar mensajes').click();
    cy.get('#aviso').should('contain.text', 'Mensajes guardados');
    cy.get('[data-p=ajustes]').click();
    cy.get('.enlace-publico a').should('have.attr', 'href', 'https://gestlok.com.ar/chat/?s=mi-gusto-munro');
    cy.get('.qr img').should('be.visible');
    sinDesborde();
  });
});

describe('GESTLOK Chat · historial de demanda del local',()=>{
  it('muestra pedidos diarios por retiro, delivery y programación sin datos de clientes',()=>{
    cy.viewport(390,844);
    cy.visit('/chat/panel/?demo=1');
    cy.get('[data-p="reporte"]').click();
    cy.contains('Historial diario · Pedidos por GESTLOK Chat').should('be.visible');
    cy.contains('.reporte-cifra','Pedidos recibidos').should('contain.text','2');
    cy.contains('.reporte-cifra','Retiro').should('contain.text','1');
    cy.contains('.reporte-cifra','Delivery').should('contain.text','1');
    cy.contains('.reporte-cifra','Programados').should('contain.text','1');
    cy.get('.reporte-dia').first().should('contain.text','Retiro: 1').and('contain.text','Delivery: 1');
    cy.contains('button','Últimos 7 días').click();
    cy.get('.reporte-dia').should('have.length',1);
  });

  it('promo en el celular: reparte 6 empanadas y 2 salsas con − y +, sin poder pasarse (demostración)', () => {
    cy.viewport(320, 740);
    cy.visit('/chat/?demo=1');
    cy.get('.burbuja.asistente', {timeout: 15000}).should('exist');
    cy.get('#btn-carta').should('not.be.disabled').click();
    cy.get('#hoja').should('be.visible');
    cy.contains('#hoja .menu-fila', 'Pack 6 empanadas + 2 salsas').find('button.menu-paso-elegir').click();
    cy.get('#hoja .grupo-cantidad').should('have.length', 2);
    cy.get('#hoja .grupo-cantidad').first().find('.opcion-cantidad').should('have.length', 2); // humita agotada
    cy.get('#hoja button[type=submit]').should('be.disabled').and('contain.text', 'Agregar $ 6.500');
    cy.get('#hoja .grupo-cantidad').first().should('contain.text', 'Faltan 6');
    cy.get('#hoja [aria-label="Sumar Empanada de carne"]').click().click().click().click();
    cy.get('#hoja [aria-label="Sumar Empanada de jamón y queso"]').click().click();
    cy.get('#hoja [aria-label="Sumar Empanada de carne"]').should('be.disabled');
    cy.get('#hoja .grupo-cantidad').first().should('contain.text', '6 de 6');
    cy.get('#hoja [aria-label="Sumar Criolla"]').click();
    cy.get('#hoja .grupo-cantidad').last().should('contain.text', 'Falta 1');
    cy.get('#hoja button[type=submit]').should('be.disabled');
    cy.get('#hoja [aria-label="Sumar Crema de ajo"]').click();
    cy.get('#hoja .menu-producto-detalle:visible .precio').should('contain.text', '6.500');
    cy.get('#hoja button[type=submit]').should('not.be.disabled').and('contain.text', 'Agregar $ 6.500').click();
    cy.contains('#hoja .menu-pie button','Revisar selección').click();
    cy.get('#hoja .menu-revision').should('contain.text','4 Empanada de carne').and('contain.text','1 Crema de ajo');
    cy.get('.seleccion-linea').should($linea => {
      const fila = $linea[0];
      const nombre = fila.querySelector('.seleccion-nombre').getBoundingClientRect();
      const precio = fila.querySelector('.precio').getBoundingClientRect();
      const quitar = fila.querySelector('button').getBoundingClientRect();
      expect(nombre.right).to.be.lessThan(precio.left);
      expect(quitar.top).to.be.greaterThan(precio.bottom);
      expect(fila.scrollWidth).to.be.at.most(fila.clientWidth);
    });
    cy.contains('#hoja .menu-revision button','Enviar selección al asistente').click();
    cy.get('.burbuja.asistente').last().should('contain.text', '4 Empanada de carne').and('contain.text', '1 Crema de ajo');
    cy.window().then(w => expect(w.document.documentElement.scrollWidth).to.be.at.most(320));
  });
});

describe('GESTLOK Chat · transferencia y cierre del gerente', () => {
  it('envía los datos al cliente por el botón y cierra manualmente el hilo', () => {
    cy.viewport(390, 844);
    cy.visit('/chat/panel/?demo=1');
    cy.get('.tarjeta.pendiente').contains('button','Abrir chat del cliente').click();
    cy.get('dialog').should('be.visible');
    cy.contains('dialog button','Enviar datos para transferencia').click();
    cy.get('dialog .hilo').should('contain.text','Alias: migustomunro')
      .and('contain.text','Gisela Alejandra Oppenheimer');
    cy.contains('dialog button','Cerrar conversación').click();
    cy.get('#aviso').should('contain.text','Conversación finalizada');
    cy.get('[data-p=charlas]').click();
    cy.get('.charla').should('contain.text','Cerrada');
  });
});

describe('GESTLOK Chat · clientes frecuentes y continuidad sin registro',()=>{
  const empezarPedido=()=>{
    // El pedido demo mínimo es $3.000; 3 empanadas de $1.200 permiten finalizar.
    cy.get('#texto').type('3 empanadas de carne{enter}');
    cy.get('#btn-finalizar').click();
    // Si hay venta sugerida permite rechazar; si no, abre directamente los datos.
    cy.get('body').should($body => {
      const sugerencia = $body.find('.chip').toArray().some(x => x.textContent.includes('No, gracias. Finalizar'));
      expect(sugerencia || $body.find('#hoja').is(':visible')).to.eq(true);
    });
    cy.get('body').then($body => {
      if ($body.find('.chip').toArray().some(x => x.textContent.includes('No, gracias. Finalizar'))) {
        cy.contains('.chip','No, gracias. Finalizar').click();
      }
    });
    cy.get('#hoja').should('be.visible').and('contain.text','Sus datos');
  };

  it('conserva el texto que todavía no fue enviado al refrescar',()=>{
    cy.viewport(390,800);
    cy.visit('/chat/?demo=1');
    cy.get('#texto').type('Quería consultar por una promoción');
    cy.reload();
    cy.get('#texto').should('have.value','Quería consultar por una promoción');
    cy.get('#btn-enviar').should('not.be.disabled');
  });

  it('conserva el formulario incompleto después de salir y volver al chat',()=>{
    cy.viewport(390,800);
    cy.visit('/chat/?demo=1');
    empezarPedido();
    cy.get('#hoja input[name=nombre]').type('María de prueba');
    cy.get('#hoja input[name=telefono]').type('11 5555 2244');
    cy.contains('#hoja label','Envío').click();
    cy.get('#hoja input[name=direccion]').type('Belgrano 1254');
    cy.reload();
    empezarPedido();
    cy.get('#hoja input[name=nombre]').should('have.value','María de prueba');
    cy.get('#hoja input[name=telefono]').should('have.value','11 5555 2244');
    cy.get('#hoja input[name=direccion]').should('have.value','Belgrano 1254');
  });

  it('pregunta el nombre y la dirección guardada antes de reutilizarlos',()=>{
    cy.viewport(390,800);
    cy.visit('/chat/?demo=1&frecuente=1');
    empezarPedido();
    cy.get('#hoja input[name=telefono]').type('11 5555 3344').blur();
    cy.get('#hoja .recuerdo-cliente').should('be.visible')
      .and('contain.text','¿El pedido es a nombre de María Pérez?');
    cy.get('#hoja .recuerdo-cliente').contains('button','Sí, es correcto').click();
    cy.get('#hoja input[name=nombre]').should('have.value','María Pérez');
    cy.contains('#hoja label','Envío').click();
    cy.get('#hoja .recuerdo-cliente').should('be.visible')
      .and('contain.text','¿El envío sigue siendo a Av. Siempre Viva 742?');
    cy.get('#hoja .recuerdo-cliente').contains('button','Sí, es correcto').click();
    cy.get('#hoja input[name=direccion]').should('have.value','Av. Siempre Viva 742');
  });
});

describe('GESTLOK Chat · gerencia de clientes frecuentes',()=>{
  it('lista compras recurrentes sin registro en la Central de esa sucursal',()=>{
    cy.viewport(390,820);
    cy.visit('/chat/panel/?demo=1');
    cy.get('[data-p=clientes]').click();
    cy.get('#contenido').should('contain.text','María (demo)')
      .and('contain.text','3 pedidos')
      .and('contain.text','Última dirección de delivery');
  });
});
