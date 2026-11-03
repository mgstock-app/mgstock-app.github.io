/* global Cypress, cy, describe, it */
// NFC y QR por comercio y sucursal (02/11/2026): flujo completo de la creadora con el Supabase falso
// (tests/mock_supabase.js, función nfcRpc). Comercios y sucursales con su propio link, placas por cantidad,
// cambiar el destino sin cambiar el código, activar/desactivar, reasignar, buscador, historial y descarga de QR.
function start(email){
 cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body}).as('fake'));
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});cy.visit('/');cy.wait('@fake');
 cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
 cy.window().then(w=>{w.__dashboard=true;});
 cy.get('#au-email').clear().type(email);cy.get('#au-pass').type('secreto1',{log:false});cy.get('#au-in button[type="submit"]').click();
}
const card=code=>cy.contains('.gl-nfc-item code',code).closest('.gl-nfc-item');
describe('NFC y QR · comercios, sucursales y placas de la creadora',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 it('crea comercio y sucursal con su link, genera placas activas y cambia el destino sin cambiar el código',()=>{
  cy.viewport(1440,1000);start('kmu15lopez@gmail.com');
  cy.get('.gl-ch-nav [data-ch-tab="nfc"]',{timeout:12000}).click();
  cy.get('[aria-label="Comercios"]',{timeout:10000}).should('contain.text','Todavía no hay comercios');
  cy.contains('[aria-label="Comercios"] button','Nuevo comercio').click();
  cy.get('form[data-nfc-form="com"] input[name="nombre"]').type('Café de Prueba');
  cy.get('form[data-nfc-form="com"] input[name="destino"]').type('example.com/cafe');
  cy.get('form[data-nfc-form="com"] button[type="submit"]').click();
  cy.get('.gl-nfc-com').should('have.length',1).and('contain.text','Café de Prueba').and('contain.text','https://example.com/cafe');
  cy.contains('.gl-nfc-com button','Nueva sucursal').click();
  cy.get('form[data-nfc-form="suc"] input[name="nombre"]').type('Centro');
  cy.get('form[data-nfc-form="suc"] input[name="destino"]').type('https://example.com/cafe-centro');
  cy.get('form[data-nfc-form="suc"] button[type="submit"]').click();
  cy.get('.gl-nfc-sucs').should('contain.text','Centro').and('contain.text','https://example.com/cafe-centro');
  // Un segundo comercio sin link, para reasignar.
  cy.contains('[aria-label="Comercios"] button','Nuevo comercio').click();
  cy.get('form[data-nfc-form="com"] input[name="nombre"]').type('Heladería de Prueba');
  cy.get('form[data-nfc-form="com"] button[type="submit"]').click();
  cy.get('.gl-nfc-com').should('have.length',2);

  cy.get('select[data-nfc-sel="mkcom"]').select('Café de Prueba');
  cy.get('select[data-nfc-sel="mksuc"]').should('not.be.disabled').select('Centro');
  cy.get('input[data-nfc-sel="mkact"]').check();
  cy.get('form[data-nfc-form="create"] input[name="cantidad"]').clear().type('3');
  cy.get('form[data-nfc-form="create"] button[type="submit"]').click();
  cy.get('.gl-nfc-item',{timeout:10000}).should('have.length',3).each($el=>{
   expect($el.text()).to.include('Café de Prueba · Centro').and.include('link de la sucursal').and.include('Activa');
  });
  cy.get('.gl-nfc-item code').then($c=>{
   const codes=[...$c].map(e=>e.textContent);
   expect(new Set(codes).size).to.eq(3);
   codes.forEach(c=>expect(c).to.match(/^[A-HJ-NP-Z2-9]{6}$/));
   cy.wrap(codes).as('codes');
  });

  // Cambiar el link de la sucursal cambia sus placas, con los mismos códigos.
  cy.contains('.gl-nfc-sucs li','Centro').contains('button','Editar').click();
  cy.get('form[data-nfc-form="suc"] input[name="destino"]').clear().type('https://example.com/cafe-centro-2');
  cy.get('form[data-nfc-form="suc"] button[type="submit"]').click();
  cy.get('@codes').then(codes=>{
   cy.get('.gl-nfc-item code').then($c=>expect([...$c].map(e=>e.textContent)).to.deep.eq(codes));
   card(codes[0]).should('contain.text','https://example.com/cafe-centro-2');

   // Desactivar una: muestra «placa no activa» y nunca el link de Belisa.
   card(codes[0]).contains('button','Desactivar').click();
   card(codes[0]).should('contain.text','Sin activar').and('contain.text','placa no activa').and('not.contain.text','belisaparfum');
   card(codes[0]).contains('button','Activar').click();
   card(codes[0]).should('contain.text','Activa').and('contain.text','https://example.com/cafe-centro-2');

   // Reasignar a un comercio sin link: queda desactivada y en el comercio nuevo.
   card(codes[1]).contains('button','Reasignar').click();
   cy.get('form[data-nfc-form="reasign"] select[data-nfc-sel="rcom"]').select('Heladería de Prueba');
   cy.get('form[data-nfc-form="reasign"] button[type="submit"]').click();
   card(codes[1]).should('contain.text','Heladería de Prueba').and('contain.text','Sin activar').and('not.contain.text','belisaparfum');

   // Buscador por código.
   cy.get('input[data-nfc-q]').type(codes[2].toLowerCase());
   cy.get('.gl-nfc-item:visible').should('have.length',1).and('contain.text',codes[2]);
   cy.get('input[data-nfc-q]').clear();
   cy.get('.gl-nfc-item:visible').should('have.length',3);

   // Historial de la placa reasignada.
   card(codes[1]).contains('button','Historial').click();
   card(codes[1]).find('.gl-nfc-hist').should('contain.text','creada').and('contain.text','Reasignada').and('contain.text','Desactivada');

   // QR fijo y descargas.
   card(codes[2]).contains('button','QR').click();
   card(codes[2]).find('.gl-nfc-qrbox svg[role="img"]').should('exist');
   card(codes[2]).find('.gl-nfc-qrbox').should('contain.text','https://gestlok.com.ar/r/?'+codes[2]);
   cy.contains('[aria-label="Placas"] button','Descargar QR').click();
   cy.contains('[aria-label="Placas"] button','Descargar lista').click();
  });

  // Filtrar por comercio y desactivar en grupo.
  cy.get('select[data-nfc-sel="fcom"]').select('Café de Prueba');
  cy.get('.gl-nfc-item').should('have.length',2);
  cy.contains('.gl-nfc-bulk button','Desactivar').click();
  cy.get('.gl-nfc-item').should('have.length',2).each($el=>expect($el.text()).to.include('Sin activar'));
  cy.get('select[data-nfc-sel="fcom"]').select('Todos los comercios');
  cy.get('.gl-nfc-item').should('have.length',3);
 });
 it('el link general de placas sin comercio se puede quitar y en celular no hay desbordes',()=>{
  cy.viewport(390,844);start('kmu15lopez@gmail.com');
  cy.get('.gl-ch-nav [data-ch-tab="nfc"]',{timeout:12000}).click();
  cy.get('[aria-label="Placas sin comercio"]',{timeout:10000}).should('contain.text','belisaparfum');
  cy.contains('[aria-label="Placas sin comercio"] button','Quitar').click();
  cy.get('[aria-label="Placas sin comercio"]').should('contain.text','Ningún link').and('not.contain.text','belisaparfum');
  cy.get('form[data-nfc-form="create"] button[type="submit"]').click();
  cy.get('.gl-nfc-item',{timeout:10000}).should('have.length',10).first().should('contain.text','Sin comercio').and('contain.text','placa no activa');
  cy.document().then(d=>{expect(d.documentElement.scrollWidth).to.be.at.most(392);});
 });
 it('una dueña no ve NFC y QR',()=>{
  start('dueno@example.com');
  cy.get('#hub',{timeout:12000}).should('contain.text','Administrar mi empresa');
  cy.get('[data-ch-tab="nfc"]').should('not.exist');
  cy.get('.gl-nfc').should('not.exist');
 });
});
