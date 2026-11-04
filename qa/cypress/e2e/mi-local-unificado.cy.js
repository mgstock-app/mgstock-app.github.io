/* global Cypress, cy, describe, it, expect */
const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
describe('Mi local · inicio único de Perfumes',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 for(const tenant of [TENANT,'11111111-2222-4333-8444-555555555555'])it('Scanner comparte cinco accesos y vuelve a Mi local: '+tenant,()=>{
  cy.viewport(390,844);
  cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{
   headers:{'content-type':'application/javascript'},
   body:body.replaceAll('cb0dc04a-9a13-434f-a3d0-47f1d8f39670',tenant)
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
    const result={data:table==='gestlok_pilot_access'?{enabled:true,plan_code:'scanner',owner_uid:'owner-ficticio'}:[],error:null};
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
  cy.get('#hub .gl-pilot-entry-actions button').should('have.length',5);
  cy.get('#hub .gl-pilot-entry').should('not.contain.text','Reportes').and('not.contain.text','Proveedores');
  cy.get('#hub [data-owner-nav="menu"]').click();
  cy.get('#pn [aria-label="Menú principal"] button').should('have.length',5);
  cy.get('#pn [data-owner-nav="home"]').click();
  cy.window().then(w=>{expect(w.GestLokCajaDiaria.entryUrl()).to.include('/caja/?desde=gestlok');w.__navigationMarker='same-document';});
  cy.get('#hub [data-pilot-caja]').click();
  cy.get('#gl-caja-app-panel').should('be.visible');
  cy.location('pathname').should('equal','/');
  cy.get('#gl-caja-app-panel iframe').its('0.contentWindow.__caja.S.user.email').should('equal','dueno@example.com');
  cy.get('#gl-caja-app-panel iframe').its('0.contentDocument.body').should('not.be.empty').then(cy.wrap).find('[data-caja-volver]').first().click();
  cy.get('#gl-caja-app-panel').should('not.be.visible');
  cy.window().its('__navigationMarker').should('equal','same-document');
  cy.get('#hub [data-pilot-caja]').click();
  cy.go('back');
  cy.get('#gl-caja-app-panel').should('not.be.visible');
  cy.get('#gestlok-mobile-dock button').should('have.length',5);
  cy.get('#hub [data-pilot-pos]').click();
  cy.get('#gl-pos-search').should('be.visible');
  cy.get('#gl-pilot-panel [data-pilot-close]').click();
  cy.get('#hub [data-pilot-stock]').click();
  cy.get('#gl-pilot-panel').should('contain.text','Stock');
  cy.get('#gl-pilot-panel [data-pilot-caja]').click();
  cy.get('#gl-caja-app-panel [data-caja-app-back]').click();
  cy.get('#gl-caja-app-panel').should('not.be.visible');
  cy.get('#gl-pilot-panel').should('not.exist');
  cy.get('#hub .gl-pilot-entry').should('be.visible');
  cy.get('#hub [data-pilot-prices]').click();
  cy.get('#gl-pilot-panel').should('contain.text','Precios');
  cy.get('#gl-pilot-panel .gl-pilot-nav button').should('have.length',5);
  cy.get('#gl-pilot-panel .gl-pilot-nav').should('not.contain.text','Reportes').and('not.contain.text','Proveedores');
  cy.window().then(async w=>{await w.GestLokPilot.switchSection('compras');await w.GestLokPilot.switchSection('pedidos');});
  cy.get('#gl-pilot-panel .gl-pilot-nav .is-active').should('contain.text','Precios');
  cy.get('#gl-pilot-panel [data-pilot-close]').click();
  cy.get('#gl-pilot-panel').should('not.exist');
  cy.get('#hub .gl-pilot-entry').should('be.visible');
  cy.get('#hub [data-pilot-stock]').click();
  cy.go('back');
  cy.get('#gl-pilot-panel').should('not.exist');
  cy.window().its('__navigationMarker').should('equal','same-document');
 });
});
