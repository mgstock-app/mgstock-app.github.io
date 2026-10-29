/* global describe,it,cy,Cypress,expect */
describe('DEMO web · carrusel manual de 9 etapas + teléfono interactivo',()=>{
 Cypress.on('uncaught:exception',e=>e.message.includes('Minified React error #418')?false:undefined);
 const start=(width=1280,role='dueno')=>{
  cy.viewport(width,width<500?844:900);
  cy.task('mockSupabase').then(fake=>cy.intercept('GET','**/vendor/supabase.js',{
   statusCode:200,headers:{'content-type':'application/javascript'},body:fake
  }).as('fakeAuth'));
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true}).as('noRealDB');
  cy.visit('/?demo=1&shop=mercado&role='+role);
  cy.wait('@fakeAuth');
  cy.get('#gl-tour-layout',{timeout:20000}).should('be.visible');
 };
 const stage=n=>cy.get('.gl-tour-nav [data-tour="'+n+'"]').first().click();
 it('PC muestra texto izquierdo + teléfono real derecho y jamás avanza automáticamente',()=>{
  start();
  cy.get('#gl-tour-story-content').should('contain.text','Conocé').and('contain.text','Un negocio');
  cy.get('#gl-tour-phone-screen #hub').should('be.visible');
  cy.get('#gl-tour-phone-screen #gestlok-mobile-dock').should('exist');
  cy.get('#gl-tour-phone').then(phone=>{
   cy.get('#gl-tour-story').then(story=>expect(story[0].getBoundingClientRect().right).to.be.lessThan(phone[0].getBoundingClientRect().left));
  });
  cy.get('.gl-tour-nav [data-tour]').should('have.length',11);
  cy.get('.gl-tour-nav [aria-current="step"]').should('have.attr','data-tour','0');
  stage(4);
  cy.get('#gl-tour-sandbox').should('be.visible').and('contain.text','Precios');
  cy.get('#gl-tour-story h2').should('contain.text','precios');
  cy.get('.gl-tour-nav [aria-current="step"]').should('have.attr','data-tour','4');
 });
 it('móvil permite modificar precios, stock y pedidos ficticios dentro del teléfono',()=>{
  start(390);
  cy.get('#gl-tour-phone').then($phone=>{
   cy.get('#gl-tour-story').then($story=>{
    const phone=$phone[0].getBoundingClientRect();
    const story=$story[0].getBoundingClientRect();
    expect(phone.bottom).to.be.lessThan(story.top + 1);
    expect(Math.abs(phone.left + phone.width/2 - 390/2)).to.be.lessThan(16);
    expect(phone.width).to.be.at.most(390 - 10);
   });
  });
  stage(4);
  cy.get('#gl-tour-price-form [name="cost"]').clear().type('10000');
  cy.get('#gl-tour-price-form [name="markup"]').clear().type('70');
  cy.get('[data-practice-sale]').should('contain.text','17.000');
  cy.get('[data-practice-profit]').should('contain.text','7.000');
  cy.get('#gl-tour-price-form').submit();
  cy.get('#gl-tour-sandbox').should('contain.text','17.000');
  stage(5);
  cy.get('#gl-tour-sandbox [data-practice-adjust="0:1"]').click();
  cy.get('#gl-tour-sandbox').should('contain.text','13');
  stage(6);
  cy.get('#gl-tour-order-form').submit();
  cy.get('#gl-tour-sandbox').should('contain.text','Pendiente');
  cy.get('[data-practice-next]').first().click();
  cy.get('#gl-tour-sandbox').should('contain.text','Preparado');
  cy.get('[data-practice-next]').first().click();
  cy.get('#gl-tour-sandbox').should('contain.text','Entregado');
  cy.window().then(w=>{
   const keys=Object.keys(w.sessionStorage);
   expect(keys.some(k=>k.includes('gestlok:guided:products:'))).to.eq(true);
  });
  stage(8);
  cy.get('#gl-tour-review-form').should('be.visible');
  cy.get('#gl-tour-gift').should('not.exist');
  cy.document().then(d=>expect(d.documentElement.scrollWidth).to.be.at.most(391));
 });
 it('tablet táctil y móvil mantienen el teléfono centrado por delante de la narrativa',()=>{
  start(768);
  cy.get('#gl-tour-phone').then($phone=>{
   cy.get('#gl-tour-story').then($story=>{
    const phone=$phone[0].getBoundingClientRect();
    const story=$story[0].getBoundingClientRect();
    expect(phone.bottom).to.be.lessThan(story.top + 1);
    expect(Math.abs(phone.left + phone.width/2 - 384)).to.be.lessThan(16);
   });
  });
 });
 it('móvil ancho usa más espacio útil sin desbordar y simplifica el texto repetido',()=>{
  start(832);
  cy.get('#gl-tour-phone').then($phone=>{
   const phone=$phone[0].getBoundingClientRect();
   expect(phone.width).to.be.at.least(600);
   expect(Math.abs(phone.left+phone.width/2-416)).to.be.lessThan(16);
  });
  cy.get('#gl-tour-story h1').should('not.be.visible');
  cy.get('#gl-tour-story h2').should('be.visible');
  cy.get('#gl-visitor-bar').then($bar=>{
   const bar=$bar[0].getBoundingClientRect();
   expect(bar.left).to.be.at.least(-1);
   expect(bar.right).to.be.at.most(833);
  });
  cy.document().then(d=>expect(d.documentElement.scrollWidth).to.be.at.most(833));
 });
 it('gerente conserva Colaboradores sin montos, navega manualmente y finaliza con reseña',()=>{
  start(390,'gerente');
  stage(3);
  cy.get('#gl-demo-emp').should('be.visible');
  cy.get('[data-dh-receipt]').should('not.exist');
  cy.get('#gl-tour-phone-screen #gl-demo-emp').should('exist');
  stage(7);
  cy.get('#gl-tour-story').should('contain.text','vencimientos');
  stage(8);
  cy.get('#gl-tour-review-form').should('be.visible');
  cy.get('#gl-tour-gift').should('not.exist');
 });
});