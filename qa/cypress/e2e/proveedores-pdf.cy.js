/* global Cypress, describe, beforeEach, it, cy, expect */
// Todas las cuentas y los datos son simulados. Nunca llama la base de producción.
const login=email=>{
 cy.get('#au-email').type(email);
 cy.get('#au-pass').type('secreto1',{log:false});
 cy.get('#au-in button[type="submit"]').click();
};
describe('GestLok: Proveedores · Guardar, Historial y PDF',()=>{
 Cypress.on('uncaught:exception',error=>{
   if(error.message.includes('Minified React error #418'))return false;
 });
 beforeEach(()=>{
   cy.task('mockSupabase').then(fake=>cy.intercept('GET','**/vendor/supabase.js',
     {statusCode:200,headers:{'content-type':'application/javascript'},body:fake}).as('fake'));
   cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
   cy.visit('/');cy.wait('@fake');
   cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
   cy.get('#au-in').should('be.visible');
 });
 it('Dueña guarda un proveedor de Munro, pone categoría en cero y comparte SOLO PDF',()=>{
   cy.viewport(390,844);
   login('dueno@example.com');
   cy.get('#hub [data-act="local"][data-id="munro"]').first().click();
   cy.window().then(w=>{
     cy.stub(w,'confirm').returns(true);
     let calls=[];
     Object.defineProperty(w.navigator,'canShare',{configurable:true,value:({files})=>files?.length===1&&files[0].type==='application/pdf'});
     Object.defineProperty(w.navigator,'share',{configurable:true,value:args=>{
       calls.push(args);return Promise.resolve();
     }});
     w.__providerShares=calls;
   });
   cy.get('[data-act="menu-open"]').then(el=>{if(el.is(':visible'))cy.wrap(el).click();});
   cy.get('#snav [data-go="proveedores"]').click({force:true});
   cy.get('[data-act="prov-new"]').click();
   cy.get('#prov-new-name').type('Distribuidora de prueba QA');
   cy.get('#prov-create-form button[type="submit"]').click();
   cy.get('#prov-carpeta').should('contain.text','Distribuidora de prueba QA');
   cy.get('[data-act="prov-add-open"]').click();
   cy.get('#prov-item-name').type('Bebida de prueba');
   cy.get('#prov-item-category').type('Bebidas');
   cy.get('#prov-item-unit').type('cajas');
   cy.get('#prov-add-form button[type="submit"]').click();
   cy.get('#prov-carpeta .gl-prov-category-head').should('contain.text','Bebidas')
     .find('[data-act="prov-zero-cat"]').should('exist');
   cy.get('[data-prov-val="stockLocal"]').last().clear().type('17').blur();
   cy.get('[data-prov-val="sugerido"]').last().clear().type('9').blur();
   cy.get('[data-prov-val="pedir"]').last().clear().type('4').blur();
   cy.get('[data-act="prov-zero-cat"][data-cat="Bebidas"]').click();
   cy.get('[data-prov-val="stockLocal"]').last().should('have.value','0');
   cy.get('[data-prov-val="pedir"]').last().should('have.value','0');
   cy.get('[data-prov-val="sugerido"]').last().should('have.value','9');
   cy.get('[data-prov-val="pedir"]').last().clear().type('3').blur();
   cy.get('#prov-resumen [data-act="prov-save-plan"]').click();
   cy.get('#pn').should('contain.text','¿Ya terminaste tu pedido');
   cy.get('[data-act="prov-confirm-save"]').click();
   cy.get('#prov-carpeta .gl-prov-history').should('contain.text','Historial de pedidos guardados');
   cy.window().its('__rows').should(rows=>{
     const hist=rows.filter(r=>r.col==='munro/proveedores_historial');
     expect(hist).to.have.length(1);
     expect(hist[0].data.productos[0].pedir).to.eq(3);
     expect(rows.filter(r=>r.col==='torcuato/proveedores_historial')).to.have.length(0);
   });
   cy.get('#prov-resumen [data-act="prov-share"]').should('be.enabled').click();
   cy.get('#pn').should('contain.text','un único archivo PDF');
   cy.get('[data-act="prov-share-ready"]').click();
   cy.window().its('__providerShares').should(calls=>{
     expect(calls).to.have.length(1);
     expect(Object.keys(calls[0])).to.deep.equal(['files']);
     expect(calls[0].files).to.have.length(1);
     expect(calls[0].files[0].type).to.eq('application/pdf');
     expect(calls[0].files[0].name).to.match(/\.pdf$/);
   });
 });
 it('Gerente puede guardar pero no exportar el pedido por WhatsApp',()=>{
   login('gerente.munro@example.com');
   cy.get('[data-act="menu-open"]').then(el=>{if(el.is(':visible'))cy.wrap(el).click();});
   cy.get('#snav [data-go="proveedores"]').click({force:true});
   cy.get('[data-act="prov-share"]').should('not.exist');
   cy.get('#view').should('contain.text','Proveedores');
 });
});