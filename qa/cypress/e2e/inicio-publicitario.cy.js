/* global describe, it, cy, expect, Cypress */
// Inicio publicitario de gestlok.com.ar: acceso, carrusel, contacto (sin número personal) y Emma.
Cypress.on('uncaught:exception', error => {
  if (/Minified React error #418/.test(error?.message || '') &&
      /react\.dev\/errors\/418/.test(error?.message || '')) return false;
  return undefined;
});

const APPS = ['GESTLOK Chat', 'GESTLOK Caja', 'Plan Scanner', 'Stock y proveedores', 'Precios', 'Empleados',
  'Horarios', 'Reseñas con cupón', 'NFC y QR', 'Vínculo entre sucursales'];

describe('Inicio publicitario', () => {
  it('muestra Ingresar, Registrarme, el carrusel y no expone el número personal', () => {
    cy.visit('/');
    cy.location('pathname').should('eq', '/');
    cy.get('h1').should('contain.text', 'GestLok');
    cy.contains('a', 'Ingresar').should('have.attr', 'href', '/login/');
    cy.contains('a', 'Registrarme').should('have.attr', 'href', '/login/#registrarme');
    APPS.forEach(nombre => cy.get('.glh-app:not([aria-hidden])').contains('h3', nombre).should('exist'));
    cy.get('.glh-app[aria-hidden="true"]').should('have.length', APPS.length);
    cy.contains('button', 'Pausar').click();
    cy.get('.glh-pista').should('have.class', 'glh-pausada');
    cy.contains('button', 'Reanudar').should('have.attr', 'aria-pressed', 'true');
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
    cy.contains('.glh-sugerencias button', '¿Qué micro apps hay?').click();
    cy.get('.glh-emma-lista').should('contain.text', 'Plan Scanner');
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
