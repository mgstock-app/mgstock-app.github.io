/* global cy, describe, it, expect */
describe('GESTLOK Chat · conversación efímera 24 h',()=>{
  const slug='mi-gusto-munro';
  const endpoint='**/functions/v1/gestlok-chat';
  const cliente='clienteFrecuenteToken000000000000000000000001';
  it('al volver después de 24 h no muestra el historial ni restaura datos, pero conserva la identidad anónima',()=>{
    const sucursal={slug,nombre:'Munro',empresa:'Mi Gusto',horario:'11 a 23',
      acepta_retiro:true,acepta_envio:true,medios_pago:['efectivo','transferencia']};
    cy.intercept('POST',endpoint,req=>{
      if(req.body.accion==='abrir')return req.reply({
        ok:true,expirada:true,sucursal,catalogo:{categorias:[],productos:[]},
        mensajes:[],nuevos:[{texto:'Bienvenido a una nueva conversación',
          botones:[{id:'carta',texto:'Hacer un pedido'}]}],
        carrito:[],pedidos:[],soporte_pendiente:false
      });
      if(req.body.accion==='estado')return req.reply({ok:true,pedidos:[],mensajes_local:[],soporte_pendiente:false});
      return req.reply({ok:true,mensajes:[],carrito:[]});
    }).as('chat');
    cy.visit('/chat/?s='+slug,{onBeforeLoad(w){
      w.localStorage.setItem('gestlok-chat:cliente:'+slug,cliente);
      w.localStorage.setItem('gestlok-chat:datos:'+slug,
        JSON.stringify({at:Date.now(),valor:{nombre:'Nombre viejo',telefono:'11111111'}}));
      w.localStorage.setItem('gestlok-chat:texto:'+slug,
        JSON.stringify({at:Date.now(),valor:'Texto privado anterior'}));
      w.localStorage.setItem('gestlok-chat:menu:'+slug,
        JSON.stringify({lineas:[{producto_id:'00000000-0000-4000-8000-000000000000',cantidad:2}]}));
    }});
    cy.get('#app').should('have.attr','aria-busy','false');
    cy.contains('Texto privado anterior').should('not.exist');
    cy.window().then(w=>{
      for(const key of ['datos','texto','menu'])
        expect(w.localStorage.getItem('gestlok-chat:'+key+':'+slug)).eq(null);
      expect(w.localStorage.getItem('gestlok-chat:cliente:'+slug)).eq(cliente);
    });
  });
});
