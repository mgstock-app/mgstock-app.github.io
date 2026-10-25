/* global Cypress, cy, describe, it, expect */
function launch(){
  cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body}).as('fake'));
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/');cy.wait('@fake');
  cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
}
function login(email){cy.get('#au-email').type(email);cy.get('#au-pass').type('secreto1',{log:false});cy.get('#au-in button[type="submit"]').click();}
describe('Registro por módulos · solicitud sin conceder permisos',()=>{
  Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
  for(const [choice,modules] of Object.entries({empleados:['recibos_personal'],empresa:['comercial'],ambas:['comercial','recibos_personal']})){
    it(`registra la opción ${choice}, la conserva al confirmar y espera autorización`,()=>{
      launch();cy.get('[data-au="up"]').click();
      cy.get('#gl-signup-kind').select('dueno');cy.get('#gl-signup-modules').should('be.visible').select(choice);
      const email=`dueno-${choice}@example.invalid`;
      cy.get('#au-email2').type(email);cy.get('#au-pass2').type('secreto1',{log:false});cy.get('#au-pass3').type('secreto1',{log:false});
      cy.get('#au-up button[type="submit"]').click();
      cy.window().its('__signup.options.data.gestlok_registration').should('deep.equal',{kind:'dueno',choice});
      login(email);
      cy.get('#gl-registration-request [data-registration-status]').should('contain.text','Solicitud guardada');
      cy.get('#gl-request-modules').should('have.value',choice);
      cy.window().its('__rows').should(rows=>{
        const row=rows.find(r=>r.col==='registration_requests'&&r.id===email);
        expect(row.data.tipoCuenta).to.eq('dueno');expect(row.data.modulosSolicitados).to.deep.eq(modules);
        expect(rows.some(r=>r.col==='equipo'&&r.id===email)).to.eq(false);
      });
      cy.get('[data-mode="pend"]').should('be.visible');cy.get('#app').should('not.be.visible');
    });
  }
  it('primer ingreso sin preferencia permite elegir y no muestra éxito si falla el guardado',()=>{
    launch();login('nuevo-google@example.invalid');
    cy.get('#gl-request-kind').should('be.enabled').select('dueno');cy.get('#gl-request-modules').select('ambas');
    cy.window().then(w=>{w.__registrationFail=true;});
    cy.get('#gl-registration-request button[type="submit"]').click();
    cy.get('[data-registration-status]').should('contain.text','No se pudo guardar');
    cy.window().then(w=>{w.__registrationFail=false;});
    cy.get('#gl-registration-request button[type="submit"]').click();
    cy.get('[data-registration-status]').should('contain.text','Solicitud guardada');
  });
  it('el panel de creadora distingue dueños y evita aprobarlos como gerentes',()=>{
    launch();cy.window().then(w=>w.__rows.push({col:'registration_requests',id:'futuro-dueno@example.invalid',data:{email:'futuro-dueno@example.invalid',tipoCuenta:'dueno',modulosSolicitados:['recibos_personal'],fecha:Date.now()}}));
    login('kmu15lopez@gmail.com');
    cy.contains('button','Revisar solicitudes').click();
    cy.get('#pn').should('contain.text','Administración de empleados').and('contain.text','Alta independiente');
    cy.get('#pn .sol [data-act="sol-ok"]').should('not.exist');
    cy.get('#pn .sol [data-act="sol-no"]').click();
    cy.window().its('__rows').should(rows=>{
      expect(rows.find(r=>r.col==='registration_requests'&&r.id==='futuro-dueno@example.invalid').data.status).to.eq('rejected');
      expect(rows.some(r=>r.col==='equipo'&&r.id==='futuro-dueno@example.invalid')).to.eq(false);
    });
  });
  it('la creadora conserva la aprobación de colaboradores en sus locales',()=>{
    launch();cy.window().then(w=>w.__rows.push({col:'registration_requests',id:'nuevo-colaborador@example.invalid',data:{email:'nuevo-colaborador@example.invalid',tipoCuenta:'colaborador',modulosSolicitados:[],fecha:Date.now()}}));
    login('kmu15lopez@gmail.com');cy.contains('button','Revisar solicitudes').click();
    cy.get('#pn .sol [data-solloc]').first().check();cy.get('#pn .sol [data-act="sol-ok"]').click();
    cy.window().its('__rows').should(rows=>{
      const member=rows.find(r=>r.col==='equipo'&&r.data.email==='nuevo-colaborador@example.invalid');
      expect(member.data.rol).to.eq('gerente');
      expect(rows.find(r=>r.col==='registration_requests'&&r.id==='nuevo-colaborador@example.invalid').data.status).to.eq('assigned');
    });
  });

});
