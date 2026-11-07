/* global Cypress, cy, describe, it */
function start(email,dashboard=true){
 cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body}).as('fake'));
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});cy.visit('/');cy.wait('@fake');
 cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
 cy.window().then(w=>{w.__dashboard=dashboard;});
 cy.get('#au-email').clear().type(email);cy.get('#au-pass').type('secreto1',{log:false});cy.get('#au-in button[type="submit"]').click();
}
describe('Inicio independiente de la creadora',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 it('la creadora ve el resumen con datos reales y sin planes ni suscripciones inventados',()=>{
  cy.viewport(1440,900);start('kmu15lopez@gmail.com');
  cy.get('.gl-ch h1',{timeout:12000}).should('contain.text','¡Hola!');
  cy.get('.gl-ch').should('contain.text','Empresas activas').and('contain.text','Administración y herramientas').and('contain.text','Accesos protegidos')
   .and('contain.text','Mis microapps').and('not.contain.text','Suscripciones').and('not.contain.text','Planes');
  cy.get('.gl-ch-company-card').should($cards=>expect($cards.length).to.be.greaterThan(0));
  cy.get('.gl-ch-quick-locals').should('not.exist');
  cy.get('.gl-ch-company-area>header h2').should('have.text','Empresas activas');
  cy.get('.gl-ch-shortcuts [data-ch-tab="usuarios"]').should('be.visible');
  cy.get('.gl-ch-microapp').should('have.length',7);
  cy.get('.gl-ch-microapp').contains('Plan Scanner').should('be.visible').click();
  cy.get('.gl-ch-nav [data-ch-tab="locales"]').should('have.attr','aria-current','page');
  cy.get('.gl-ch-nav [data-ch-tab="inicio"]').click();
  cy.get('.gl-ch-microapp').first().click();
  cy.get('.gl-ch-nav [data-ch-tab="locales"]').should('have.attr','aria-current','page');
  cy.get('.gl-ch-nav [data-ch-tab="inicio"]').click();
  // Ocho pestañas: se sumó «NFC y QR» (#199) a las siete anteriores.
  cy.get('.gl-ch-nav button').should('have.length',8);
  cy.get('.gl-ch-nav [data-ch-tab="resenas"]').should('exist');
  cy.get('.gl-ch-nav [data-ch-tab="nfc"]').should('exist');
  cy.get('.gl-ch .gl-ch-logout').should('not.exist');
  cy.get('#gl-profile-switch-trigger').click();
  cy.get('.gl-profile-switch-logout').should('be.visible').and('contain.text','Cerrar sesión');
  cy.get('[data-roles-close]').click();
 });
 it('las pestañas conservan todas las funciones anteriores (acceso a otras empresas incluido)',()=>{
  cy.viewport(1440,900);start('kmu15lopez@gmail.com');
  cy.get('.gl-ch-nav [data-ch-tab="empresas"]',{timeout:12000}).click();
  cy.get('[aria-label="Empresas registradas"]').should('contain.text','Empresa ficticia');
  // Mismo texto que validan empleados-modulo.cy.js e inicio-dueno-modulos.cy.js.
  cy.get('[aria-label="Empresas registradas"] button').should('have.length',1).and('contain.text','Abrir empresa');
  cy.get('[aria-label="Vista previa por rol"]').should('contain.text','Ver como Gerente');
  cy.get('.gl-ch-nav [data-ch-tab="usuarios"]').click();
  cy.get('.gl-ch').should('contain.text','Usuarios aprobados');
  cy.get('.gl-ch-nav [data-ch-tab="empleados"]').click();
  cy.get('.gl-ch a[href="empleados/"]').should('contain.text','Abrir Administración de empleados');
  cy.get('.gl-ch-nav [data-ch-tab="herramientas"]').click();
  cy.get('.gl-ch').should('contain.text','Explorar gestión de tienda online');
 });
 it('en celular el menú queda arriba y el contenido sin desbordes',()=>{
  cy.viewport(390,844);start('kmu15lopez@gmail.com');
  cy.get('.gl-ch-nav',{timeout:12000}).should('be.visible');
  cy.get('.gl-ch-side .gl-ch-logout').should('not.exist');
  cy.get('#gl-profile-switch-trigger').click();
  cy.get('.gl-profile-switch-logout').should('be.visible');
  cy.get('[data-roles-close]').click();
  cy.get('.gl-ch-main h1').should('be.visible');
  cy.get('.gl-ch').then($root=>{
   const r=$root[0].getBoundingClientRect();
   expect(r.left).to.be.at.least(0);
   expect(r.width).to.be.at.most(391);
  });
  cy.document().then(d=>{expect(d.documentElement.scrollWidth).to.be.at.most(392);});
 });
 it('si el servidor no autoriza el resumen se ve el panel administrativo anterior',()=>{
  start('kmu15lopez@gmail.com',false);
  cy.get('#hub',{timeout:12000}).should('contain.text','Panel administrativo');
  cy.get('.gl-ch').should('not.exist');
 });
 it('una dueña nunca ve el panel de la creadora',()=>{
  start('dueno@example.com');
  cy.get('#hub',{timeout:12000}).should('contain.text','Administrar mi empresa');
  cy.get('.gl-ch').should('not.exist');
 });
});
