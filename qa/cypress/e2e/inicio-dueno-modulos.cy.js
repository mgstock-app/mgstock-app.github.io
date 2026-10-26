/* global Cypress, cy, describe, it */
function start(fail=false,email='dueno@example.com'){
 cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body}).as('fake'));
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});cy.visit('/');cy.wait('@fake');
 cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
 if(fail)cy.window().then(w=>{w.__ownerAreaFail=true;});
 cy.get('#au-email').type(email);cy.get('#au-pass').type('secreto1',{log:false});cy.get('#au-in button[type="submit"]').click();
}
describe('Inicio de dueño · áreas verificadas por backend',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 it('muestra dos tarjetas pero no habilita empleados sin permiso',()=>{
  cy.viewport(390,844);start();
  cy.get('#hub').should('contain.text','Administrar mi empresa').and('contain.text','Administrar a los empleados').and('not.contain.text','Próximamente');
  cy.get('#hub .gl-owner-employees-locked').should('contain.text','Sin habilitar').and('have.attr','aria-disabled','true');
  cy.get('#hub .gl-owner-employees-locked [data-owner-area-staff],#hub .gl-owner-employees-locked [data-owner-go]').should('not.exist');
  cy.get('#hub h1').should('have.length',1);
  cy.get('#hub .gl-commerce-card').should('not.exist');
  cy.get('#hub .gl-owner-business .gl-owner-arrow').should('be.visible').click();
  cy.get('#pn [data-act="local"][data-id="munro"]').should('be.visible');
  cy.get('#pn button[data-act="local"][data-id="torcuato"]').should('have.length',1).and('be.visible').click();
  cy.get('#snav').should('be.visible');
 });
 it('no ofrece una carpeta si falla la comprobación y permite reintentar',()=>{
  start(true);cy.get('#hub').should('contain.text','No pudimos verificar').and('not.contain.text','Administrar mi empresa');
  cy.window().then(w=>{w.__ownerAreaFail=false;});cy.get('[data-owner-area-retry]').click();
  cy.get('#hub').should('contain.text','Administrar mi empresa');
 });
 it('la creadora ve el registro de empresas como información general de solo lectura',()=>{
  start(false,'kmu15lopez@gmail.com');
  cy.get('[aria-label="Empresas registradas"]').should('contain.text','Solo lectura').and('contain.text','Empresa ficticia').and('contain.text','Munro');
  cy.get('[aria-label="Empresas registradas"] input,[aria-label="Empresas registradas"] select').should('not.exist');
  // El único control permitido es la consulta de otra empresa en solo lectura (pide motivo y queda auditada).
  cy.get('[aria-label="Empresas registradas"] button').each($button=>{
   expect($button.attr('data-support-open')).to.be.a('string').and.not.be.empty;
   expect($button.text()).to.contain('Ver en solo lectura');
  });
  cy.get('[aria-label="Empresas registradas"]').should('contain.text','Tu empresa');
  cy.get('[aria-label="Vista previa por rol"]').should('contain.text','Ver como Gerente').and('contain.text','Ver como Dueña').and('contain.text','Ver como Solo ver');
 });

 it('PerCam: dueño de un solo local recibe el inicio universal antes de abrir su negocio',()=>{
  cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body}).as('fake'));
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});cy.visit('/');cy.wait('@fake');
  cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
  cy.window().then(w=>{
   const local=w.__rows.find(r=>r.col==='locales'&&r.id==='munro');
   local.data.nombre='PerCam';
   const second=w.__rows.findIndex(r=>r.col==='locales'&&r.id==='torcuato');
   if(second!==-1)w.__rows.splice(second,1);
   const owner=w.__rows.find(r=>r.col==='equipo'&&r.id==='dueno@example.com');
   owner.data.nombre='Dueño de prueba';
  });
  cy.get('#au-email').type('dueno@example.com');cy.get('#au-pass').type('secreto1',{log:false});cy.get('#au-in button[type="submit"]').click();
  cy.get('#hub .gl-owner-landing').should('be.visible');
  cy.get('#app').should('not.be.visible');
  cy.get('#hub .gl-owner-business').should('contain.text','Administrar mi empresa');
  cy.get('#hub .gl-owner-quick .gl-owner-tile').should('have.length',4);
  cy.get('#hub .gl-owner-employees-locked').should('exist').and('contain.text','Sin habilitar');
  cy.get('#hub [data-owner-area-staff]').should('not.exist');
  cy.get('#hub .gl-owner-business .gl-owner-arrow').click();
  cy.get('#brand-local').should('contain.text','PerCam');
 });

});
