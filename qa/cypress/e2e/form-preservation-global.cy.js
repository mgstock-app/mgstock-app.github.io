/* global Cypress, describe, it, cy */
import { abrirLocal } from '../helpers/abrir-local';

// Usa Supabase simulado. No toca los datos reales de GESTLOK ni de Mi Gusto.
const login=()=>{
 cy.get('#au-email').clear().type('dueno@example.com');
 cy.get('#au-pass').type('secreto1',{log:false});
 cy.get('#au-in button[type="submit"]').click();
};
const launch=()=>{
 cy.task('mockSupabase').then(mock=>cy.intercept('GET','**/vendor/supabase.js',{
  statusCode:200,headers:{'content-type':'application/javascript'},body:mock
 }).as('fakeSupabase'));
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
 cy.visit('/');
 cy.wait('@fakeSupabase');
 cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
 cy.get('#au-in').should('be.visible');
};
const sync=()=>cy.window().then(w=>w.dispatchEvent(new w.Event('gestlok-sync-complete')));

describe('GestLok: formularios no se borran mientras el gerente escribe',()=>{
 Cypress.on('uncaught:exception',e=>{
  if(e.message.includes('Minified React error #418'))return false;
 });
 it('Reclamos Internos conserva cliente, teléfono, descuento y gerente ante actualización',()=>{
  launch();login();abrirLocal('munro');
  cy.get('#snav [data-go="reclamos-internos"]').should('exist').click();
  cy.get('[data-ri="new"]').should('be.visible').click();
  cy.get('#ri-form [name="name"]').type('Mariana Díaz');
  cy.get('#ri-form [name="phone"]').type('1122337788');
  cy.get('#ri-form [name="discount"]').type('18,5');
  cy.get('#ri-form [name="manager"]').type('Gerente de turno');
  cy.get('#ri-form [name="observation"]').type('Demora en la entrega');
  sync();
  for(const [field,value] of Object.entries({
   name:'Mariana Díaz',phone:'1122337788',discount:'18,5',
   manager:'Gerente de turno',observation:'Demora en la entrega'
  }))cy.get('#ri-form [name="'+field+'"]').should('have.value',value);
  cy.focused().should('have.attr','name','observation');
  // El cambio de local nunca debe conservar los datos de la sucursal anterior.
  cy.get('#snav [data-act="locales"]').click();
  abrirLocal('torcuato');
  cy.get('#snav [data-go="reclamos-internos"]').click();
  cy.get('[data-ri="new"]').click();
  cy.get('#ri-form [name="name"]').should('have.value','');
  cy.get('#ri-form [name="observation"]').should('have.value','');
 });
 it('Vencimientos mantiene el formulario al llegar información nueva',()=>{
  launch();login();abrirLocal('munro');
  cy.get('#snav [data-go="vencimientos"]').click();
  cy.get('[data-up-action="new"]').click();
  cy.get('#gl-exp-name').type('Fumigación especial');
  cy.get('#gl-exp-days').clear().type('45');
  sync();
  cy.get('#gl-exp-name').should('have.value','Fumigación especial');
  cy.get('#gl-exp-days').should('have.value','45');
  cy.focused().should('have.attr','id','gl-exp-days');
 });
 it('Proveedores conserva el pedido en la tabla después de un redraw',()=>{
  launch();
  cy.window().then(w=>w.__rows.push({
   col:'munro/productos',id:'p-qa-protect-draft',
   data:{nombre:'Producto de prueba temporal',stock:5,cat:'Bebidas',
    proveedor:'Proveedor Formulario QA',unidad:'caja',orden:900}
  }));
  login();abrirLocal('munro');
  cy.get('#snav [data-go="proveedores"]').click();
  cy.get('[data-act="prov-open"][data-name="Proveedor Formulario QA"]').click();
  cy.get('[data-prov-val="pedir"][data-id="c:p-qa-protect-draft"]').clear().type('27');
  sync();
  cy.get('[data-prov-val="pedir"][data-id="c:p-qa-protect-draft"]').should('have.value','27');
  cy.focused().should('have.attr','data-prov-val','pedir');
 });
});
