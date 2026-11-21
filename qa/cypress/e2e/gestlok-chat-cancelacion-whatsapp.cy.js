/* global cy, describe, it, expect */
// La UX es común a todos los locales; no se hacen pedidos reales.
describe('GESTLOK Chat · cancelación segura y WhatsApp por sucursal', () => {
  const product = {id:'9a000000-0000-4000-8000-000000000001',nombre:'Empanada de carne',
    categoria_id:'emp',precio:4900,activo:true,disponible:true,opciones:[]};
  const catalogo = {categorias:[{id:'emp',nombre:'Empanadas'}],productos:[product]};
  const pedido = {estado:'pendiente',creado_at:'2026-11-21T12:00:00-03:00',
    total:4900,entrega:'retiro',nombre:'Cliente',items:[]};
  function mockAbrir(slug,telefono,conPedido=false,onCancel=()=>{}) {
    cy.intercept('POST', '**/functions/v1/gestlok-chat', req=>{
      if(req.body.accion==='abrir') return req.reply({ok:true,sucursal:{
        slug,empresa:'Mi Gusto',nombre:slug==='mi-gusto-munro'?'Munro':'Don Torcuato',
        whatsapp_local:telefono,menu_interactivo:true,acepta_retiro:true,medios_pago:['efectivo']},
        catalogo,mensajes:[],nuevos:[{texto:'¡Hola! ¿En qué podemos ayudarte hoy?',
          botones:[{id:'carta',texto:'Hacer un pedido'}]}],
        carrito:[],pedidos:conPedido?[pedido]:[]});
      if(req.body.accion==='mensaje' && req.body.entrada?.boton==='cancelar') {
        onCancel();
        return req.reply({ok:true,mensajes:[{texto:'Su pedido fue cancelado.'}],
          carrito:[],pedido:{...pedido,estado:'cancelado'}});
      }
      return req.reply({ok:true,mensajes:[],carrito:[],pedidos:[]});
    }).as('chat');
  }
  for(const [slug,tel] of [
    ['mi-gusto-munro','5491171446654'],['mi-gusto-torcuato','5491176617182']]) {
    it('muestra solo el icono WhatsApp y enlaza exclusivamente a ' + slug,()=>{
      cy.viewport(390,844);
      mockAbrir(slug,tel);
      cy.visit('/chat/?s='+slug);
      cy.get('#app').should('have.attr','aria-busy','false');
      cy.get('#whatsapp-local').should('be.visible')
        .and('have.attr','href','https://wa.me/'+tel)
        .and('have.attr','target','_blank')
        .find('svg').should('exist');
      cy.get('#whatsapp-local').invoke('text').then(valor=>expect(valor.trim()).to.equal(''));
    });
  }
  it('si la sucursal no tiene un número válido, nunca muestra enlace a otro local',()=>{
    cy.viewport(390,844);
    mockAbrir('mi-gusto-munro','');
    cy.visit('/chat/?s=mi-gusto-munro');
    cy.get('#app').should('have.attr','aria-busy','false');
    cy.get('#whatsapp-local').should('not.be.visible').and('not.have.attr','href');
  });
  it('pide confirmación, permite seguir y solo cancela al confirmar',()=>{
    cy.viewport(390,844);
    let cancelaciones=0;
    mockAbrir('mi-gusto-munro','5491171446654',true,()=>cancelaciones++);
    cy.visit('/chat/?s=mi-gusto-munro',{
      onBeforeLoad(win){win.localStorage.setItem('gestlok-chat:ultimo-pedido:mi-gusto-munro',
        JSON.stringify({at:Date.now(),lineas:[{producto_id:product.id,cantidad:1,opciones:{}}]}));}
    });
    cy.get('.aviso-pedido').contains('button','Cancelar pedido').click();
    cy.get('#hoja-titulo').should('have.text','¿Cancelar pedido?');
    cy.contains('#hoja button','Seguir con mi pedido').click();
    cy.get('#hoja').should('not.be.visible');
    cy.then(()=>expect(cancelaciones).to.equal(0));
    cy.get('.aviso-pedido').contains('button','Cancelar pedido').click();
    cy.contains('#hoja button','Sí, cancelar pedido').click();
    cy.get('.aviso-pedido').should('contain.text','Pedido cancelado');
    cy.then(()=>expect(cancelaciones).to.equal(1));
    cy.contains('.pedido-recuperar button','Retomar pedido').click();
    cy.get('#hoja').should('contain.text','Empanada de carne')
      .and('contain.text','Continuar');
  });
  it('desde un pedido cancelado puede comenzar uno nuevo con menú vacío',()=>{
    cy.viewport(390,844);
    cy.intercept('POST','**/functions/v1/gestlok-chat',req=>{
      if(req.body.accion==='abrir') return req.reply({
        ok:true,sucursal:{slug:'mi-gusto-torcuato',empresa:'Mi Gusto',nombre:'Don Torcuato',
          whatsapp_local:'5491176617182',menu_interactivo:true},catalogo,
        mensajes:[{rol:'asistente',texto:'¡Buenas tardes! Bienvenidos'}],
        nuevos:[],carrito:[],pedidos:[{...pedido,estado:'cancelado'}]});
      req.reply({ok:true,carrito:[],mensajes:[]});
    });
    cy.visit('/chat/?s=mi-gusto-torcuato');
    cy.get('.pedido-recuperar').contains('button','Hacer un nuevo pedido').click();
    cy.get('#hoja-titulo').should('have.text','Menú');
    cy.get('#hoja .lista').should('contain.text','Empanada de carne');
    cy.get('.menu-pie-texto').should('contain.text','Elegí los productos');
  });
});
