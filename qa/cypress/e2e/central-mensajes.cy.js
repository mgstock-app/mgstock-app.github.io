/* global Cypress, describe, it, cy */
// Central de mensajes (GESTLOK Chat) dentro de GESTLOK, en lugar de Pedidos WhatsApp. Solo datos ficticios.
const setup=(email,width=390,opciones={})=>{
 cy.viewport(width,844);
 cy.task('mockSupabase').then(fake=>{
   cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body:fake}).as('mock');
 });
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
 cy.visit('/');cy.wait('@mock');
 cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
 cy.window().then(w=>{if(opciones.panel)w.__dashboard=true;if(opciones.sinChat)w.__chatSinEmpresa=true;});
 cy.get('#au-email').clear().type(email);
 cy.get('#au-pass').type('secreto1',{log:false});
 cy.get('#au-in button[type="submit"]').click();
};
const central=()=>cy.get('.gcc-panel',{timeout:15000}).shadow();
describe('GESTLOK · Central de mensajes de cada local',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});

 it('gerente de Munro: atajo con contador, pedido en preparación y «Listo para retirar»',()=>{
  setup('gerente.munro@example.com',1280);
  cy.get('#snav button[data-go="pedidos-clientes"]',{timeout:15000}).should('contain.text','Central de mensajes').and('not.contain.text','WhatsApp');
  cy.get('[data-gcc-quick-count]',{timeout:20000}).should('have.text','1');
  cy.get('#snav button[data-go="pedidos-clientes"] [data-gcc-nav-count]').should('have.text','1');
  cy.get('#snav button[data-go="pedidos-clientes"]').click();
  cy.get('#ttl').should('contain.text','Central de mensajes');
  cy.get('.gcc-cab').should('contain.text','Munro');
  central().find('.tarjeta.pendiente').should('contain.text','MM-0001').and('contain.text','Cliente Ficticio');
  central().find('#sucursal').should('not.be.visible');
  central().find('[data-p="mensajes"]').should('be.visible');
  // Pedido nuevo cerrado: «Abrir pedido» lo pasa a preparación (el cliente recibe la demora) y lo muestra abierto.
  central().find('.tarjeta.pendiente.cerrada').should('contain.text','Sin abrir').and('contain.text','Abrir pedido');
  central().contains('button','Abrir pedido').click();
  central().find('#aviso').should('contain.text','MM-0001 abierto');
  central().find('.tarjeta.confirmado.resaltada').should('contain.text','MM-0001');
  cy.window().its('__chat.pedidos.0.estado').should('eq','confirmado');
  central().contains('button','Listo para retirar').click();
  central().find('#aviso').should('contain.text','MM-0001 listo para retirar');
  central().contains('No hay pedidos para mostrar');
  cy.get('#snav button[data-go="pedidos-clientes"] [data-gcc-nav-count]').should('not.exist');
  cy.contains('Pedidos WhatsApp').should('not.exist');
 });

 it('pedido nuevo con vista previa en otra sección de GESTLOK, sobre todo lo abierto',()=>{
  setup('gerente.munro@example.com',390);
  cy.get('[data-gcc-quick-count]',{timeout:20000}).should('have.text','1');
  const pedido=(id,codigo)=>({id,local:'munro',codigo,estado:'pendiente',motivo:'',cliente_nombre:'Laura Gómez',cliente_telefono:'1100000002',
   entrega:'envio',direccion:'Calle Ficticia 123',horario:'',medio_pago:'efectivo',nota:'',subtotal:56900,envio:4000,total:55210,
   creado_at:new Date().toISOString(),decidido_at:null,items:[{cantidad:1,nombre:'Pizza 8 porciones · Muzzarella',opciones:[],nota:'',importe:17900},
   {cantidad:1,nombre:'Pack 6 empanadas + 2 salsas',opciones:[],nota:'',importe:31500},{cantidad:1,nombre:'Coca-Cola 2,25 L',opciones:[],nota:'',importe:7500}]});
  cy.window().then(w=>{w.__chat.pedidos.push(pedido('ch-2','MM-0002'));w.dispatchEvent(new Event('focus'));});
  cy.get('#mgp-global-alert',{timeout:20000}).should('be.visible').and('contain.text','¡Pedido nuevo por chat!')
   .and('contain.text','MM-0002 · Laura Gómez').and('contain.text','Envío · Efectivo · Total $\u00a055.210')
   .and('contain.text','1 × Pizza 8 porciones · Muzzarella · 1 × Pack 6 empanadas + 2 salsas · +1 más');
  cy.get('#mgp-global-alert').should('have.css','z-index','30050');
  cy.get('#mgp-global-alert [data-gcc-cerrar]').click();
  cy.get('#mgp-global-alert').should('not.exist');
  cy.window().then(w=>{w.__chat.pedidos.push(pedido('ch-3','MM-0003'));w.dispatchEvent(new Event('focus'));});
  cy.get('#mgp-global-alert',{timeout:20000}).should('contain.text','MM-0003').contains('button','Abrir pedido').click();
  cy.get('#ttl').should('contain.text','Central de mensajes');
  // Abrir desde el aviso = el gerente abrió ese pedido: pasa a preparación y queda a la vista.
  central().find('.tarjeta.confirmado.resaltada',{timeout:15000}).should('contain.text','MM-0003');
  cy.window().then(w=>{expect(w.__chat.pedidos.find(p=>p.codigo==='MM-0003').estado).to.eq('confirmado');
   expect(w.__chat.pedidos.find(p=>p.codigo==='MM-0002').estado).to.eq('pendiente');});
  cy.get('#mgp-global-alert').should('not.exist');
  cy.get('.gcc-avisos').should('contain.text','Probar aviso');
 });

 it('el panel no se recarga cuando GESTLOK redibuja la pantalla',()=>{
  setup('gerente.munro@example.com',1280);
  cy.get('#snav button[data-go="pedidos-clientes"]',{timeout:15000}).click();
  central().find('.tarjeta').should('exist');
  central().find('[data-p="carta"]').click();
  cy.get('.gcc-panel').then($h=>{$h[0].__marca='misma';});
  cy.get('#snav button[data-go="pedidos-clientes"]').click();
  cy.get('.gcc-panel').should($h=>{expect($h[0].__marca).to.eq('misma');});
  central().find('[data-p="carta"]').should('have.attr','aria-selected','true');
 });

 it('gerente de Munro administra carta, mensajes y ajustes de su sucursal',()=>{
  setup('gerente.munro@example.com',1280);
  cy.get('#snav button[data-go="pedidos-clientes"]',{timeout:15000}).click();
  central().find('[data-p="carta"]').click();
  central().contains('button','+ Categoría').click();
  central().find('dialog.dialogo input[type="text"]').first().type('Empanadas');
  central().find('dialog.dialogo').contains('button','Guardar').click();
  central().find('#aviso').should('contain.text','Categoría guardada');
  central().contains('button','+ Producto').click();
  central().find('dialog.dialogo input[type="text"]').first().type('Empanada de carne');
  central().find('dialog.dialogo input[type="number"]').first().type('1500');
  central().find('dialog.dialogo').contains('button','Guardar').click();
  central().find('#aviso').should('contain.text','Producto guardado');
  central().find('.producto').should('contain.text','Empanada de carne').and('contain.text','1.500');
  central().find('.producto').contains('button','Editar').click();
  central().find('dialog.dialogo input[type="number"]').first().clear().type('1700');
  central().find('dialog.dialogo').contains('button','Guardar').click();
  central().find('.producto').should('contain.text','1.700');
  central().find('[data-p="mensajes"]').click();
  central().find('textarea').last().type('¡Gracias por tu compra!',{parseSpecialCharSequences:false});
  central().contains('button','Guardar mensajes').click();
  central().find('#aviso').should('contain.text','Mensajes guardados');
  central().find('[data-p="ajustes"]').click();
  central().contains('button','Guardar ajustes').should('be.visible');
 });

 it('gerente de Torcuato ve solo su local',()=>{
  setup('gerente.torcuato@example.com',1280);
  cy.get('#snav button[data-go="pedidos-clientes"]',{timeout:15000}).click();
  cy.get('.gcc-cab').should('contain.text','Don Torcuato');
  central().contains('No hay pedidos pendientes de confirmación');
  central().find('.tarjeta').should('not.exist');
 });

 it('micro app general: la administradora la activa por empresa desde su panel',()=>{
  cy.on('window:confirm',()=>true);
  setup('kmu15lopez@gmail.com',1280,{panel:true});
  cy.get('.gl-ch-microapp',{timeout:15000}).contains('GESTLOK Chat').click();
  cy.get('.gl-ch-nav [data-ch-tab="herramientas"]').should('have.attr','aria-current','page');
  cy.get('.gl-ch-chat-admin',{timeout:15000}).should('contain.text','un chat por local');
  cy.get('[data-ch-chat-company="cb0dc04a-9a13-434f-a3d0-47f1d8f39670"]').should('contain.text','Activa · 2 chats').and('contain.text','Munro').and('contain.text','Don Torcuato');
  cy.get('[data-ch-chat-company="00000000-0000-4000-8000-000000000222"]').should('contain.text','No activa')
    .contains('button','Activar GESTLOK Chat').click();
  cy.get('[data-ch-chat-company="00000000-0000-4000-8000-000000000222"]',{timeout:10000}).should('contain.text','Activa · 1 chat').and('contain.text','chat apagado');
  cy.get('[data-ch-chat-company="00000000-0000-4000-8000-000000000222"]').contains('button','Pausar').click();
  cy.get('[data-ch-chat-company="00000000-0000-4000-8000-000000000222"]',{timeout:10000}).should('contain.text','Pausada');
 });

 it('si el servidor no tiene GESTLOK Chat encendido para la empresa, no aparece la Central',()=>{
  setup('gerente.munro@example.com',1280,{sinChat:true});
  cy.get('#snav button[data-go="inicio"]',{timeout:15000}).should('exist');
  cy.wait(1500);
  cy.get('#snav button[data-go="pedidos-clientes"]').should('not.exist');
 });

 it('lectura no tiene la Central de mensajes',()=>{
  setup('lectura@example.com',1280);
  cy.get('#snav button[data-go="inicio"]',{timeout:15000}).should('exist');
  cy.get('#snav button[data-go="pedidos-clientes"]').should('not.exist');
 });

 it('en el celular la Central está en Más para Munro',()=>{
  setup('gerente.munro@example.com',390);
  cy.get('#gestlok-mobile-dock [data-dock="more"]',{timeout:15000}).click();
  cy.get('#gestlok-mobile-sheet').should('contain.text','Central de mensajes').and('not.contain.text','WhatsApp');
 });
});
