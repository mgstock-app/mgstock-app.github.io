/* global Cypress, cy, describe, it */
function start(email,dashboard=true){
 cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body}).as('fake'));
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});cy.visit('/');cy.wait('@fake');
 cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
 cy.window().then(w=>{w.__dashboard=dashboard;});
 cy.get('#au-email').clear().type(email);cy.get('#au-pass').type('secreto1',{log:false});cy.get('#au-in button[type="submit"]').click();
}
describe('Inicio de la creadora · panel con resumen de la plataforma',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 it('la creadora ve el resumen con datos reales y sin planes ni suscripciones inventados',()=>{
  cy.viewport(1440,900);start('kmu15lopez@gmail.com');
  cy.get('.gl-ch h1',{timeout:12000}).should('contain.text','¡Hola!');
  cy.get('.gl-ch').should('contain.text','Empresas activas').and('contain.text','Usuarios totales').and('contain.text','Crecimiento de GESTLOK')
   .and('contain.text','Personas por rol').and('contain.text','Estado de la plataforma').and('contain.text','Solo lectura')
   .and('not.contain.text','Suscripciones').and('not.contain.text','Planes');
  cy.get('.gl-ch-chart').should('be.visible');
  cy.get('.gl-ch-nav button').should('have.length',7);
  cy.get('.gl-ch-nav [data-ch-tab="resenas"]').should('exist');
  cy.get('.gl-ch [data-au="out"]').should('be.visible');
 });
 it('las pestañas conservan todas las funciones anteriores (solo lectura de otras empresas incluida)',()=>{
  cy.viewport(1440,900);start('kmu15lopez@gmail.com');
  cy.get('.gl-ch-nav [data-ch-tab="empresas"]',{timeout:12000}).click();
  cy.get('[aria-label="Empresas registradas"]').should('contain.text','Empresa ficticia');
  cy.get('[aria-label="Empresas registradas"] button').should('have.length',1).and('contain.text','Ver en solo lectura');
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
