/* global describe, it, cy, expect */
describe('GESTLOK Chat · nueva compra y permisos del cliente',()=>{
 const sucursal={slug:'mi-gusto-munro',empresa:'Mi Gusto',nombre:'Munro',
   acepta_retiro:true,acepta_envio:true,menu_interactivo:true,whatsapp_local:'5491171446654'};
 const catalogo={categorias:[{id:'emp',nombre:'Empanadas'}],productos:[
   {id:'9a000000-0000-4000-8000-000000000001',categoria_id:'emp',nombre:'Empanada de carne',precio:4900,activo:true,disponible:true,opciones:[]}]};
 const pedido=estado=>({estado,creado_at:'2026-11-21T12:00:00-03:00',
   total:4900,entrega:'retiro',items:[{producto_id:catalogo.productos[0].id,cantidad:1}]});
 function respuesta(cerrada,estado){
  return {ok:true,sucursal,catalogo,carrito:[],pedidos:estado?[pedido(estado)]:[],
    nuevos:[{texto:'¡Hola! ¿En qué podemos ayudarte hoy?',
      botones:[{id:'carta',texto:'Hacer un pedido'}]}],mensajes:[],cerrada};
 }
 for(const [cerrada,etiqueta] of [[false,'pedido terminado'],[true,'conversación cerrada']]){
  it('habilita una nueva compra tras '+etiqueta+' sin reabrir la anterior',()=>{
   cy.viewport(390,844);
   let tokens=[];
   cy.intercept('POST','**/functions/v1/gestlok-chat',req=>{
     if(req.body.accion==='abrir'){
       tokens.push(req.body.token);
       return req.reply(tokens.length===1?respuesta(cerrada,'terminado'):respuesta(false,null));
     }
     if(req.body.accion==='estado')return req.reply({ok:true,pedidos:[pedido('terminado')],cerrada});
     req.reply({ok:true,carrito:[],mensajes:[]});
   });
   cy.visit('/chat/?s=mi-gusto-munro');
   cy.get('#app').should('have.attr','aria-busy','false');
   cy.contains('button','Hacer un nuevo pedido').should('be.visible').click();
   cy.get('#app').should('have.attr','aria-busy','false');
   cy.then(()=>{expect(tokens).to.have.length(2);expect(tokens[0]).not.to.eq(tokens[1]);});
   cy.get('#btn-carta').should('be.enabled').click();
   cy.get('#hoja-titulo').should('have.text','Menú');
  });
 }
 it('no permite comenzar otro pedido mientras hay uno pendiente',()=>{
   cy.viewport(390,844);
   cy.intercept('POST','**/functions/v1/gestlok-chat',req=>{
     if(req.body.accion==='abrir')return req.reply(respuesta(false,'pendiente'));
     req.reply({ok:true,pedidos:[pedido('pendiente')],carrito:[],mensajes:[]});
   });
   cy.visit('/chat/?s=mi-gusto-munro');
   cy.get('#app').should('have.attr','aria-busy','false');
   cy.get('#aviso-pedido').should('be.visible').and('contain.text','$ 4.900');
   cy.get('#aviso-pedido button.nuevo-pedido').should('not.exist');
   cy.get('#btn-notificaciones').should('be.visible');
 });
 it('no solicita permisos al abrir y separa promociones del estado del pedido',()=>{
   cy.viewport(390,844);
   let consultaNativa=0;
   cy.intercept('POST','**/functions/v1/gestlok-chat',req=>{
     if(req.body.accion==='abrir')return req.reply(respuesta(false,'pendiente'));
     req.reply({ok:true,pedidos:[pedido('pendiente')],carrito:[],mensajes:[]});
   });
   cy.intercept('GET','**/functions/v1/gestlok-chat-push?op=config*',
     {statusCode:200,body:{ok:true,publicKey:'BK-c0shU5pBL9c-zZ47GH3ilNyMwJNfea9ygULj7VYhAVmZJxIy4Bfwbj0frmBKHa--AuP8naXUDm-FFVNylzyg',promocionesHabilitadas:false}});
   cy.visit('/chat/?s=mi-gusto-munro',{onBeforeLoad(win){
     // Se contabiliza cualquier consulta a permisos sin conceder permisos reales.
     const Original=win.Notification;
     Object.defineProperty(win,'Notification',{configurable:true,value:{
       permission:'default',requestPermission:()=>{consultaNativa++;return Promise.resolve('denied')},
       ...(Original?.prototype?{prototype:Original.prototype}:{})
     }});
   }});
   cy.get('#app').should('have.attr','aria-busy','false');
   cy.then(()=>expect(consultaNativa).to.eq(0));
   cy.get('#btn-notificaciones').click();
   cy.get('.gchat-push-dialog').should('be.visible');
   cy.get('.gchat-push-opcion').should('have.length',2);
   cy.get('.gchat-push-opcion').last().find('input').should('not.be.checked');
   cy.then(()=>expect(consultaNativa).to.eq(0));
   cy.contains('.gchat-push-dialog button','Cerrar').click();
 });
});
