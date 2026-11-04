/* global Cypress, cy, describe, it, expect */
const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
describe('Mi local · inicio único de Perfumes',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 it('conserva Caja real, stock y reportes sin mostrar proveedores en Plan Scanner',()=>{
  cy.viewport(390,844);
  cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{
   headers:{'content-type':'application/javascript'},
   body:body.replaceAll('cb0dc04a-9a13-434f-a3d0-47f1d8f39670',TENANT)
  }).as('fake'));
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/');cy.wait('@fake');
  cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
  cy.window().then(w=>{
   w.__cajaAppHabilitada=['dueno@example.com'];
   const db=w.GestLokSupabase,from=db.from.bind(db);
   db.auth.getUser=async()=>({data:{user:{id:'owner-ficticio'}},error:null});
   db.from=table=>{
    if(!table.startsWith('gestlok_pilot_'))return from(table);
    const result={data:table==='gestlok_pilot_access'?{enabled:true,owner_uid:'owner-ficticio'}:[],error:null};
    const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>Promise.resolve(result),then:(ok,no)=>Promise.resolve(result).then(ok,no)};
    return q;
   };
  });
  cy.get('#au-email').clear().type('dueno@example.com');
  cy.get('#au-pass').type('secreto1',{log:false});cy.get('#au-in button[type="submit"]').click();
  cy.get('#hub .gl-pilot-entry').should('have.length',1).and('contain.text','Mi local');
  cy.get('#hub .gl-owner-business,#hub .gl-caja-entry,#hub .gl-owner-employees').should('not.exist');
  cy.get('#hub').should('not.contain.text','GESTIÓN DE TU LOCAL');
  cy.get('#hub [data-pilot-caja]').should('contain.text','Caja');
  cy.get('#hub .gl-pilot-entry').should('not.contain.text','Proveedores y pedidos');
  cy.get('#hub .gl-pilot-entry [data-owner-nav="business"]').should('not.exist');
  cy.window().then(w=>expect(w.GestLokCajaDiaria.entryUrl()).to.include('/caja/?desde=gestlok'));
  cy.get('#hub [data-pilot-stock]').click();
  cy.get('#gl-pilot-panel').should('contain.text','Stock');
  cy.get('#gl-pilot-panel [data-pilot-tab="precios"]').click();
  cy.get('#gl-pilot-panel').should('contain.text','Precios');
  cy.get('#gl-pilot-panel [data-owner-nav="reports"]').click();
  cy.get('#gl-pilot-panel').should('not.exist');
  cy.get('#pn').should('contain.text','Reportes generales');
  cy.get('#pn [data-act="close"]').click();
 });
});
