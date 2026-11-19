/* global Cypress, describe, it, cy */
// Central de mensajes (GESTLOK Chat) dentro de GESTLOK, en lugar de Pedidos WhatsApp. Solo datos ficticios.
const setup=(email,width=390)=>{
 cy.viewport(width,844);
 cy.task('mockSupabase').then(fake=>{
   cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body:fake}).as('mock');
 });
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
 cy.visit('/');cy.wait('@mock');
 cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
 cy.get('#au-email').clear().type(email);
 cy.get('#au-pass').type('secreto1',{log:false});
 cy.get('#au-in button[type="submit"]').click();
};
const central=()=>cy.get('.gcc-panel',{timeout:15000}).shadow();
describe('GESTLOK · Central de mensajes de cada local',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});

 it('gerente de Munro: atajo con contador, pedido en preparación y «Pedido terminado»',()=>{
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
  central().contains('button','Pedido terminado').click();
  central().find('#aviso').should('contain.text','MM-0001 terminado');
  central().contains('No hay pedidos en preparación');
  cy.get('#snav button[data-go="pedidos-clientes"] [data-gcc-nav-count]').should('not.exist');
  cy.contains('Pedidos WhatsApp').should('not.exist');
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

 it('gerente de Munro edita carta (producto, precio y categoría) y mensajes del bot; los ajustes quedan para el dueño',()=>{
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
  central().contains('button','Guardar ajustes').should('not.exist');
  central().contains('los cambia el dueño o la administradora');
 });

 it('gerente de Torcuato ve solo su local',()=>{
  setup('gerente.torcuato@example.com',1280);
  cy.get('#snav button[data-go="pedidos-clientes"]',{timeout:15000}).click();
  cy.get('.gcc-cab').should('contain.text','Don Torcuato');
  central().contains('No hay pedidos en preparación');
  central().find('.tarjeta').should('not.exist');
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
