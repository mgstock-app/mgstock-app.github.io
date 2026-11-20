/* global cy, describe, it, expect */
describe('Prueba GESTLOK Chat · circuito ficticio vinculado',()=>{
  it('cliente hace pedido, gerente confirma y cliente ve el cambio sin escribir en Supabase',()=>{
    cy.viewport(390,820);
    let red=0;
    cy.intercept('POST','**/functions/v1/gestlok-chat',req=>{
      red++;req.reply({statusCode:503,body:{error:'Bloqueado en prueba'}});
    });
    cy.visit('/chat/?demo=1&showroom=1');
    cy.window().then(win=>win.sessionStorage.removeItem('gestlok:chat-showroom:v1'));
    cy.reload();
    cy.get('#app').should('have.attr','aria-busy','false');
    cy.get('.demo').should('contain.text','demostración');
    cy.get('#texto').type('3 empanadas de carne{enter}');
    cy.get('#barra-texto').should('contain.text','3 productos');
    cy.get('#btn-finalizar').click();
    // Esperar la respuesta del motor antes de decidir si aparece la venta sugerida.
    cy.get('body').should($body=>{
      const sugerencia=$body.find('.chip').toArray().some(x=>x.textContent.includes('No, gracias. Finalizar'));
      expect(sugerencia||$body.find('#hoja').is(':visible')).to.eq(true);
    });
    cy.get('body').then($body=>{
      if($body.find('.chip').toArray().some(x=>x.textContent.includes('No, gracias. Finalizar')))
        cy.contains('.chip','No, gracias. Finalizar').click();
    });
    cy.get('#hoja').should('be.visible');
    cy.get('#hoja input[name=nombre]').type('Ana Demostración');
    cy.get('#hoja input[name=telefono]').type('11 5555 1234');
    cy.get('#hoja button[type=submit]').click();
    cy.get('#aviso-pedido').should('contain.text','Pendiente de confirmación');
    cy.window().then(win=>{
      const o=JSON.parse(win.sessionStorage.getItem('gestlok:chat-showroom:v1')).order;
      expect(o.estado).to.eq('pendiente');
      expect(o.items[0].nombre).to.eq('Empanada de carne');
      expect(o.codigo).to.match(/^DEMO-/);
    });
    cy.visit('/chat/panel/?demo=1&showroom=1');
    cy.get('#panel').should('have.attr','aria-busy','false');
    cy.get('#empresa').should('contain.text','Comercio de demostración');
    cy.contains('#contenido .tarjeta','DEMO-').should('contain.text','Ana Demostración')
      .contains('button','Confirmar y pasar a preparación').click();
    // Confirmar es una acción asíncrona: reintentar hasta recibir el acuse del gerente,
    // en lugar de leer sessionStorage inmediatamente después del clic.
    cy.window().should(win=>{
      const o=JSON.parse(win.sessionStorage.getItem('gestlok:chat-showroom:v1')).order;
      expect(o.estado).to.eq('confirmado');
      expect(o.confirmado_at).to.be.a('string');
    });
    cy.visit('/chat/?demo=1&showroom=1');
    cy.get('#aviso-pedido').should('contain.text','Pedido confirmado');
    cy.then(()=>expect(red,'ninguna solicitud de pedido al servidor real').to.eq(0));
  });
});
