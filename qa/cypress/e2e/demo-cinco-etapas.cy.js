/* global Cypress, describe, it, cy, expect */
describe('Demo GESTLOK: cinco etapas y reseña independiente',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 const start=()=>{
  cy.task('mockSupabase').then(fake=>cy.intercept('GET','**/vendor/supabase.js',{headers:{'content-type':'application/javascript'},body:fake.replace('from(){ return builder(); }', `from(table){ if(table==='gestlok_app_reviews')return {async insert(payload){window.__reviewPayload=payload;return {error:window.__reviewError?{message:'offline'}:null}}}; return builder(); }`)}));
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/?demo=1');cy.get('#gl-tour-controls',{timeout:20000}).should('be.visible');
 };
 const step=n=>cy.get('.gl-tour-nav [data-tour="'+n+'"]').first().click();
 it('Navegación móvil libre, tarjetas, planillas y recibo ficticio',()=>{
  cy.viewport(390,844);start();
  cy.get('#hub .gl-owner-landing').should('be.visible');
  step(1);cy.get('#view').should('contain.text','Stock');
  step(2);cy.get('#view').should('contain.text','Proveedores');
  step(3);cy.get('#gl-demo-emp').should('be.visible');
  cy.get('[data-dh-receipt]').click();cy.get('#gl-demo-receipt').should('contain.text','Sin validez legal');
  step(4);cy.get('#gl-tour-review').should('be.visible');cy.get('#gl-tour-gift').should('not.exist');
  step(0);cy.get('#hub .gl-owner-landing').should('be.visible');
  cy.document().then(d=>{expect(d.documentElement.scrollWidth).to.be.at.most(390);});
 });
 it('El contacto requiere consentimiento y se borra al retirarlo',()=>{
  start();step(4);
  cy.get('[name=contact_consent]').check();
  cy.get('[name=contact_name]').type('Persona ficticia');
  cy.get('[name=contact_value]').type('test@example.com');
  cy.get('[data-rating=3]').click();
  cy.get('[name=contact_value]').should('have.value','test@example.com');
  cy.get('[name=contact_consent]').uncheck();
  cy.get('#gl-tour-contact').should('not.be.visible');
  cy.get('#gl-tour-review').submit();
  cy.get('#gl-tour-gift').should('be.visible');
  cy.window().then(w=>{expect(w.__reviewPayload.contact_name).eq(null);expect(w.__reviewPayload.contact_value).eq(null);});
 });
 it('Sin regalo ante un error; regalo después del envío incluso con una estrella y sin contacto',()=>{
  start();step(4);
  cy.window().then(w=>{
   w.__reviewError=true;
  });
  cy.get('[data-rating="1"]').click();
  cy.get('#gl-tour-review').submit();
  cy.get('#gl-tour-status').should('contain.text','No se pudo enviar');
  cy.get('#gl-tour-gift').should('not.exist');
  cy.window().then(w=>{w.__reviewError=false;});
  cy.get('#gl-tour-review').submit();
  cy.get('#gl-tour-gift').should('be.visible');
  cy.window().then(w=>{expect(w.__reviewPayload.rating).eq(1);expect(w.__reviewPayload.contact_value).eq(null);expect(w.__reviewPayload.contact_consent).eq(false);});
 });
});
