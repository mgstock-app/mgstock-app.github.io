/* global describe, it, cy */
/** Regresión multiempresa: únicamente datos simulados; ningún pedido real. */
describe('GESTLOK Chat · una misma interfaz para cualquier empresa', () => {
  const empresas = [
    {slug:'panaderia-centro-principal',empresa:'Panadería Centro',nombre:'Principal',
     producto:'Medialuna de manteca',noDebeVer:'Café en grano',categoria:'Panificados',
     telefono:'5491122223333'},
    {slug:'cafe-avenida-centro',empresa:'Café Avenida',nombre:'Centro',
     producto:'Café en grano',noDebeVer:'Medialuna de manteca',categoria:'Café',
     telefono:'5491144445555'}
  ];
  for(const [indice,e] of empresas.entries()) {
    it('ofrece los mismos modales y herramientas para '+e.empresa,()=>{
      const producto = {id:'9a000000-0000-4000-8000-00000000000'+(indice+1),
        categoria_id:'cat1',nombre:e.producto,precio:4900,activo:true,
        disponible:true,opciones:[]};
      cy.viewport(390,844);
      cy.intercept('POST','**/functions/v1/gestlok-chat',req=>{
        if(req.body.accion==='abrir')return req.reply({
          ok:true,
          sucursal:{slug:e.slug,empresa:e.empresa,nombre:e.nombre,
            menu_interactivo:true,acepta_retiro:true,acepta_envio:true,
            envio_costo:2000,medios_pago:['efectivo','transferencia','debito','credito'],
            medios_pago_retiro:['efectivo','transferencia','debito','credito'],
            medios_pago_envio:['efectivo','transferencia'],whatsapp_local:e.telefono},
          catalogo:{categorias:[{id:'cat1',nombre:e.categoria}],productos:[producto]},
          nuevos:[{texto:'¡Hola! ¿En qué podemos ayudarte hoy?',
            botones:[{id:'carta',texto:'Hacer un pedido'},
              {id:'pago',texto:'Medios de pago'}]}],
          carrito:[],pedidos:[],mensajes:[]
        });
        return req.reply({ok:true,carrito:[],mensajes:[]});
      }).as('chat');
      cy.visit('/chat/?s='+e.slug);
      cy.wait('@chat');
      cy.get('#titulo').should('contain.text',e.empresa)
        .and('contain.text',e.nombre).and('not.contain.text','Mi Gusto');
      cy.get('#btn-notificaciones').should('be.visible');
      cy.get('#whatsapp-local').should('have.attr','href','https://wa.me/'+e.telefono);
      cy.get('#btn-carta').should('be.enabled').click();
      cy.get('#hoja-titulo').should('have.text','Menú');
      cy.get('#hoja .menu-filtro-carta').should('be.visible')
        .type(e.producto.split(' ')[0]);
      cy.get('#hoja .menu-fila:visible').should('have.length',1)
        .and('contain.text',e.producto).and('not.contain.text',e.noDebeVer);
      cy.get('#hoja .menu-fila:visible .menu-paso-mas').click();
      cy.get('#hoja .menu-pie').should('contain.text','Continuar');
      cy.get('#hoja .menu-pie button').contains('Continuar').click();
      cy.get('#hoja .menu-revision').should('contain.text',e.producto);
      cy.get('#hoja .menu-revision').should('not.contain.text',e.noDebeVer);
    });
  }
});
