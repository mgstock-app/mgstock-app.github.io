/* global cy, describe, it */
describe('GESTLOK Chat · soporte y seguimiento humano',()=>{
  const endpoint='**/functions/v1/gestlok-chat';
  it('cliente consulta demora, avisa al gerente y recibe su respuesta en el mismo chat',()=>{
    cy.viewport(390,844);
    const local={empresa:'Mi Gusto',nombre:'Munro',slug:'mi-gusto-munro',menu_interactivo:true,horario:'11:00 a 14:40 / 19:00 a 23:15',
      direccion:'Av. Mitre 2510',demora_retiro:'15 a 20 minutos',demora_envio:'35 a 40 minutos',
      acepta_retiro:true,acepta_envio:true,medios_pago:['efectivo','transferencia']};
    let estados=0;
    const inicio=[{id:'carta',texto:'Ver menú'},{id:'soporte',texto:'Ayuda con mi pedido'}];
    cy.intercept('POST',endpoint,req=>{
      const {accion,entrada}=req.body;
      if(accion==='abrir')return req.reply({ok:true,sucursal:local,catalogo:{categorias:[],productos:[]},
        mensajes:[],nuevos:[{texto:'¡Hola! Soy el asistente de Mi Gusto Munro.',botones:inicio}],
        carrito:[],pedidos:[],soporte_pendiente:false});
      if(accion==='estado'){
        estados++;
        return req.reply({ok:true,pedidos:[],soporte_pendiente:false,
          mensajes_local:estados===1?[{id:200,texto:'Hola, ya revisamos tu pedido. Estamos resolviendo la demora.'}]:[]});
      }
      if(entrada?.boton==='soporte')return req.reply({ok:true,carrito:[],mensajes:[
        {texto:'¿Necesitás consultar una demora o informar un problema?',
         botones:[{id:'demora',texto:'Consultar demora'},{id:'reclamo_faltante',texto:'Faltante en mi pedido'}]}]});
      if(entrada?.boton==='demora')return req.reply({ok:true,carrito:[],mensajes:[
        {texto:'Retiro en el local: 15 a 20 minutos.\nDelivery: 35 a 40 minutos. Son tiempos estimados.',
         botones:[{id:'reclamo_demora',texto:'Avisar demora al gerente'}]}]});
      if(entrada?.boton==='reclamo_demora')return req.reply({ok:true,carrito:[],soporte_pendiente:true,
        mensajes:[{texto:'Ya envié el aviso al gerente de Munro. Te responderá por este mismo chat.'}]});
      return req.reply({ok:true,carrito:[],mensajes:[{texto:'Consulta registrada'}]});
    }).as('chat');
    cy.visit('/chat/?s=mi-gusto-munro');
    cy.contains('.chip','Ayuda con mi pedido').click();
    cy.contains('.chip','Consultar demora').click();
    cy.contains('.burbuja.asistente','15 a 20 minutos').should('be.visible');
    cy.contains('.burbuja.asistente','35 a 40 minutos').should('be.visible');
    cy.contains('.chip','Avisar demora al gerente').click();
    cy.contains('.burbuja.asistente','Te responderá por este mismo chat').should('be.visible');
    // Acepta un mensaje del gerente sin cambiar el estado ni confirmar pedidos.
    cy.window().then(w=>w.document.dispatchEvent(new Event('visibilitychange')));
    cy.contains('.burbuja.local',/ya revisamos tu pedido/i,{timeout:22000}).should('be.visible');
    cy.get('#aviso-pedido').should('not.be.visible');
  });
  it('la Central interna recibe un reclamo y el gerente lo contesta',()=>{
    cy.viewport(390,844);
    cy.visit('/chat/panel/?demo=1');
    cy.get('[data-p=soporte]').click();
    cy.contains('.soporte-reclamo','Mi pedido está tardando mucho').should('be.visible');
    cy.contains('.soporte-reclamo','Demora').contains('button','Responder en el chat').click();
    cy.get('dialog.dialogo textarea.soporte-texto').type('Ya lo revisamos. Tu pedido está en preparación.');
    cy.get('dialog.dialogo').contains('button','Enviar mensaje').click();
    cy.contains('.soporte-reclamo','Respondido, pendiente de cierre',{timeout:8000}).should('be.visible');
    cy.contains('.soporte-reclamo','Mi pedido está tardando mucho').contains('button','Cerrar reclamo').click();
    cy.contains('No hay reclamos pendientes',{timeout:8000}).should('be.visible');
    cy.get('#globo-soporte').should('not.be.visible');
  });
});
