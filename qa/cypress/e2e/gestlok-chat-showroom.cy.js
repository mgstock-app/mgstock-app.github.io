/* global cy, describe, it, expect */
describe('Prueba GESTLOK Chat · circuito ficticio vinculado',()=>{
  for(const ancho of [390,1100]){
    it('WhatsApp abajo a la derecha sin tapar el editor ('+ancho+' px)',()=>{
      cy.viewport(ancho,800);
      cy.visit('/chat/?demo=1&showroom=1');
      cy.get('#app').should('have.attr','aria-busy','false');
      // La demo oculta el contacto externo; mostrar el elemento solo para probar el CSS.
      cy.get('#whatsapp-local')
        .invoke('attr','href','https://wa.me/5491155551234')
        .invoke('removeAttr','hidden')
        .should('be.visible')
        .then($link=>{
          const rect=$link[0].getBoundingClientRect();
          const app=$link[0].ownerDocument.querySelector('#app').getBoundingClientRect();
          const editor=$link[0].ownerDocument.querySelector('.redactar').getBoundingClientRect();
          expect(rect.width).to.eq(44);
          expect(rect.height).to.eq(44);
          expect(rect.left).to.be.greaterThan(app.left);
          expect(rect.right).to.be.at.most(app.right);
          expect(app.right-rect.right).to.be.lessThan(50);
          expect(rect.bottom).to.be.at.most(editor.top-4);
        });
      cy.get('#texto').focus();
      cy.get('#whatsapp-local').should('not.be.visible');
    });
  }

  it('editor legible en 360 px: mensaje completo, cámara y menú sin solaparse',()=>{
    cy.viewport(360,740);
    cy.visit('/chat/?demo=1&showroom=1');
    cy.get('#app').should('have.attr','aria-busy','false');
    cy.get('.redactar').should('have.css','display','grid');
    cy.get('#texto').should('be.visible').then($el=>{
      const r=$el[0].getBoundingClientRect();
      expect(r.width).to.be.greaterThan(220);
      expect(r.height).to.be.at.least(56);
    });
    cy.get('#btn-carta').should('be.visible');
    cy.get('#btn-galeria').should('be.visible');
    cy.get('#btn-camara').should('be.visible');
    cy.get('#btn-enviar').should('be.visible');
    cy.get('#texto').type('Quiero 3 empanadas de carne');
    cy.get('#texto').should('have.value','Quiero 3 empanadas de carne');
  });

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
    // Antes de los datos pueden aparecer la oferta de promo (3 sueltas → pack) y la venta sugerida: se rechazan.
    const pasarOfertas=veces=>cy.get('body').should($body=>{
      const oferta=$body.find('.chip').toArray().some(x=>/No, gracias, enviar|No, seguir sin promoción/.test(x.textContent));
      expect(oferta||$body.find('#hoja').is(':visible')).to.eq(true);
    }).then($body=>{
      if(veces>0&&!$body.find('#hoja').is(':visible')){
        const promo=$body.find('.chip').toArray().some(x=>x.textContent.includes('No, seguir sin promoción'));
        cy.contains('.chip',promo?'No, seguir sin promoción':'No, gracias, enviar').click();
        pasarOfertas(veces-1);
      }
    });
    pasarOfertas(3);
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
    cy.get('#pestanas [data-p="charlas"]').should('not.exist');
    cy.get('#comandas-resumen').should('be.visible').and('contain.text','Comandas activas');
    cy.get('#comandas-resumen').should('contain.text','Por confirmar:');
    cy.get('#comandas-resumen').should('contain.text','En preparación:');
    cy.get('#activar-sonido-panel').should('be.visible');

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
