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
    cy.contains('a', 'Registrarme').should('have.attr', 'href', '/login/#registrarme');
    cy.contains('h2', 'Así funciona GESTLOK Chat').should('be.visible');
    cy.get('.glh-cuadro').should('have.length', 6);
    cy.get('.glh-cuadro img').first().should('be.visible').and($img => expect($img[0].naturalWidth).to.be.greaterThan(0));
    cy.contains('button', 'Pausar').click();
    cy.contains('button', 'Reanudar').should('have.attr', 'aria-pressed', 'true');
    cy.get('[aria-label="Cuadro siguiente"]').click();
    cy.get('.glh-puntos button').eq(1).should('have.attr', 'aria-current', 'step');
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
    cy.get('#glh-emma-pregunta').type('¿Cuánto cuesta?{enter}');
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

  it('en el celular no se desborda', () => {
    cy.viewport(375, 812);
    cy.visit('/');
    cy.contains('a', 'Registrarme').should('be.visible');
    cy.window().then(win => {
      expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth + 1);
    });
  });
});
