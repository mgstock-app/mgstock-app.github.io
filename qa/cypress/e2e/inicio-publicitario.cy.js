/* global describe, it, cy, expect, Cypress */
// Inicio publicitario de gestlok.com.ar: acceso, carrusel, contacto (sin número personal) y Emma.
Cypress.on('uncaught:exception', error => {
  if (/Minified React error #418/.test(error?.message || '') &&
      /react\.dev\/errors\/418/.test(error?.message || '')) return false;
  return undefined;
});


describe('Inicio publicitario', () => {
  it('publicita GESTLOK Chat con cuadros reales y no expone el número personal', () => {
    cy.visit('/');
    cy.location('pathname').should('eq', '/');
    cy.get('h1').should('contain.text', 'Tus clientes piden solos por chat');
    cy.contains('a', 'Ingresar').should('have.attr', 'href', '/login/');
    cy.contains('a', 'Registrarme').should('have.attr', 'href', '/login/#registrarme').and('have.css', 'color', 'rgb(255, 255, 255)');
    cy.contains('a', 'Ver cómo funciona').should('have.css', 'color', 'rgb(255, 255, 255)');
    cy.contains('h2', 'Así funciona GESTLOK Chat').should('be.visible');
    // Se mueve solo: a los 6 s pasa al segundo cuadro.
    cy.get('.glh-puntos button').eq(0).should('have.attr', 'aria-current', 'step');
    cy.get('.glh-puntos button', {timeout: 9000}).eq(1).should('have.attr', 'aria-current', 'step');
    cy.contains('button', 'Pausar').click();
    cy.contains('button', 'Reanudar').should('have.attr', 'aria-pressed', 'true');
    cy.get('.glh-progreso').should('exist');
    cy.get('.glh-cuadro').should('have.length', 6);
    cy.get('.glh-cuadro img').first().should('be.visible').and($img => expect($img[0].naturalWidth).to.be.greaterThan(0));
    // En pausa no avanza; «siguiente» pasa al próximo cuadro.
    cy.get('.glh-puntos button[aria-current="step"]').invoke('index').then(i => {
      cy.get('[aria-label="Cuadro siguiente"]').click();
      cy.get('.glh-puntos button').eq((i + 1) % 6).should('have.attr', 'aria-current', 'step');
      cy.wait(7000);
      cy.get('.glh-puntos button').eq((i + 1) % 6).should('have.attr', 'aria-current', 'step');
    });
    cy.contains('Plan Scanner').should('not.exist');
    cy.contains('Sobre mí').should('not.exist');
    cy.get('a[href*="wa.me"]').should('not.exist');
    cy.get('body').should('not.contain.text', '4471');
  });

  it('valida y envía el formulario de contacto a la base', () => {
    cy.intercept('POST', '**/rest/v1/rpc/gestlok_contacto_enviar', {statusCode: 200, body: {ok: true}}).as('enviar');
    cy.visit('/');
    cy.contains('button', 'Enviar mensaje').click();
    cy.get('[role="alert"]').should('contain.text', 'nombre');
    cy.get('#glh-nombre').type('Ana Prueba');
    cy.get('#glh-email').type('ana@example.com');
    cy.get('#glh-telefono').type('11 1234-5678');
    cy.get('#glh-mensaje').type('Quiero conocer GESTLOK para mi local.');
    cy.contains('button', 'Enviar mensaje').click();
    cy.get('[role="alert"]').should('contain.text', 'aceptar');
    cy.get('.glh-acepto input').check();
    cy.contains('button', 'Enviar mensaje').click();
    cy.wait('@enviar').its('request.body').should('deep.equal', {
      p_nombre: 'Ana Prueba', p_telefono: '11 1234-5678', p_email: 'ana@example.com',
      p_mensaje: 'Quiero conocer GESTLOK para mi local.', p_consentimiento: true
    });
    cy.contains('¡Gracias, Ana!').should('be.visible');
  });

  it('muestra el aviso del servidor si rechaza el mensaje', () => {
    cy.intercept('POST', '**/rest/v1/rpc/gestlok_contacto_enviar',
      {statusCode: 400, body: {message: 'Ya recibimos tus mensajes. Probá de nuevo más tarde.'}}).as('enviar');
    cy.visit('/');
    cy.get('#glh-nombre').type('Ana');
    cy.get('#glh-email').type('ana@example.com');
    cy.get('#glh-mensaje').type('Hola, consulta.');
    cy.get('.glh-acepto input').check();
    cy.contains('button', 'Enviar mensaje').click();
    cy.wait('@enviar');
    cy.get('[role="alert"]').should('contain.text', 'Ya recibimos tus mensajes');
  });

  it('Emma responde y deriva al formulario', () => {
    cy.visit('/');
    cy.contains('button', 'Hablá con Emma').click();
    cy.get('[role="dialog"]').should('contain.text', 'Soy Emma');
    cy.contains('.glh-sugerencias button', '¿Cómo funciona?').click();
    cy.get('.glh-emma-lista').should('contain.text', 'Hacer un pedido');
    // El precio ya no se deriva: Emma lo dice e invita a registrarse.
    cy.get('#glh-emma-pregunta').type('¿Cuánto cuesta?{enter}');
    cy.get('.glh-emma-lista').should('contain.text', '$ 70.000 por mes por local').and('contain.text', '$ 59.500');
    cy.contains('a', 'Registrarme y empezar').should('have.attr', 'href', '/login/#registrarme');
    cy.get('#glh-emma-pregunta').type('Hablar con una persona{enter}');
    cy.contains('button', 'Ir al formulario de contacto').click();
    cy.get('[role="dialog"]').should('not.exist');
    cy.get('#contacto').should('be.visible');
    cy.contains('button', 'Hablá con Emma').click();
    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('los enlaces de la app que llegan a la raíz siguen yendo a /login/', () => {
    cy.visit('/?invitacion=ABC123');
    cy.location('pathname').should('eq', '/login/');
    cy.location('search').should('eq', '?invitacion=ABC123');
  });

  it('la demo se abre desde el inicio y muestra cliente y panel con datos ficticios', () => {
    cy.visit('/');
    cy.get('.glh-nav').contains('a', 'Demo').should('have.attr', 'href', '/demo/');
    cy.get('#demo').contains('h2', 'Probalo antes de contratar');
    cy.get('#demo').contains('a', 'Abrir la demo').should('have.attr', 'href', '/demo/').click();
    cy.location('pathname').should('eq', '/demo/');
    cy.get('h1').should('contain.text', 'Probá GESTLOK Chat');
    cy.contains('No se envía nada a ningún comercio').should('be.visible');
    cy.get('.glh-nav a[aria-current="page"]').should('have.text', 'Demo');
    cy.get('iframe[title*="Vista del cliente"]').should('have.attr', 'src', '/chat/?demo=1&showroom=1').and('be.visible');
    cy.get('iframe[title*="Panel del local"]').should('have.attr', 'src', '/chat/panel/?demo=1&showroom=1').and('be.visible');
    cy.contains('button', 'Empezar de nuevo').click();
    cy.get('.glh-demo-aviso').should('contain.text', 'empezó de nuevo');
    cy.get('body').should('not.contain.text', 'Mi Gusto').and('not.contain.text', '70.000');
  });

  it('en el celular la demo usa pestañas y volver lleva al inicio, no a la app', () => {
    cy.viewport(375, 812);
    cy.visit('/demo/');
    cy.get('#glh-demo-cliente').should('be.visible');
    cy.get('#glh-demo-local').should('not.be.visible');
    cy.contains('[role="tab"]', 'Panel del local').click().should('have.attr', 'aria-selected', 'true');
    cy.get('#glh-demo-local').should('be.visible');
    cy.get('#glh-demo-cliente').should('not.be.visible');
    cy.window().then(win => {
      expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth + 1);
    });
    // Navegación completa desde /demo/ hacia la raíz: queda en el inicio publicitario.
    cy.window().then(win => { win.location.href = '/'; });
    cy.location('pathname').should('eq', '/');
    cy.get('h1').should('contain.text', 'Tus clientes piden solos por chat');
  });

  it('en el celular no se desborda', () => {
    cy.viewport(375, 812);
    cy.visit('/');
    cy.contains('a', 'Registrarme').should('be.visible');
    cy.window().then(win => {
      expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth + 1);
    });
  });
});
