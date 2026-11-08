/* global Cypress, cy, describe, it, expect */
function launch(){
  cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body}).as('fake'));
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/');cy.wait('@fake');
  cy.get('.gl-intro',{timeout:12000}).should('not.be.visible');
}
function login(email){cy.get('#au-email').clear().type(email);cy.get('#au-pass').type('secreto1',{log:false});cy.get('#au-in button[type="submit"]').click();}
describe('Registro por módulos · solicitud sin conceder permisos',()=>{
  Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
  for(const [choice,modules] of Object.entries({empleados:['recibos_personal'],empresa:['comercial'],ambas:['comercial','recibos_personal']})){
    it(`registra la opción ${choice}, la conserva al confirmar y espera autorización`,()=>{
      launch();cy.get('[data-au="up"]').click();
      cy.get('#gl-signup-kind').select('dueno');
      const apps=choice==='empleados'?['empleados']:choice==='empresa'?['scanner','stock']:['stock','empleados'];
      cy.get('#gl-signup-modules').should('not.be.visible');
      apps.forEach(id=>cy.get('#gl-signup-micro-'+id).check());
      cy.get('#gl-signup-modules').should('have.value',choice);
      cy.get('#gl-signup-company').should('be.visible').type('Negocio de prueba '+choice);
      cy.get('#gl-signup-responsible').type('Persona Responsable');
      cy.get('#gl-signup-phone').type('+54 11 1234-5678');
      cy.get('#gl-signup-address').type('Local de prueba');
      cy.get('#gl-signup-custom').type('Necesito personalizar horarios y reportes.');
      const email=`dueno-${choice}@example.invalid`;
      cy.get('#au-email2').type(email);cy.get('#au-pass2').type('secreto1',{log:false});cy.get('#au-pass3').type('secreto1',{log:false});
      cy.get('#au-up [name="terms"]').check();
      cy.get('#au-up button[type="submit"]').click();
      cy.window().its('__signup.options.data.gestlok_registration').should('deep.equal',{kind:'dueno',choice});
      login(email);
      cy.get('#gl-registration-request [data-registration-status]').should('contain.text','Solicitud guardada');
      cy.get('#gl-request-modules').should('have.value',choice);
      cy.window().its('__rows').should(rows=>{
        const row=rows.find(r=>r.col==='registration_requests'&&r.id===email);
        expect(row.data.tipoCuenta).to.eq('dueno');expect(row.data.modulosSolicitados).to.deep.eq(modules);
        expect(row.data.empresa).to.eq('Negocio de prueba '+choice);
        expect(row.data.responsable).to.eq('Persona Responsable');
        expect(row.data.telefono).to.eq('+54 11 1234-5678');
        expect(row.data.microapps).to.deep.eq(apps);
        expect(row.data.personalizacion).to.eq('Necesito personalizar horarios y reportes.');
        expect(rows.some(r=>r.col==='equipo'&&r.id===email)).to.eq(false);
      });
      cy.get('[data-mode="pend"]').should('be.visible');cy.get('#app').should('not.be.visible');
    });
  }
  it('permite probar demos de microapps sin escribir nada ni conceder permisos',()=>{
    launch();cy.get('[data-au="up"]').click();cy.get('#gl-signup-kind').select('dueno');
    cy.window().then(w=>{w.__qaBeforeDemoRows=w.__rows.length;});
    cy.get('#au-up [data-demo-open="scanner"]').click();
    cy.get('#au-up [data-microapp-preview]').should('be.visible').and('contain.text','Caja de demostración');
    cy.get('#au-up [data-demo-next]').click();
    cy.get('#au-up [data-microapp-preview]').should('contain.text','Producto ficticio agregado');
    cy.get('#au-up [data-demo-next]').click();
    cy.get('#au-up [data-microapp-preview]').should('contain.text','Venta de prueba confirmada');
    cy.get('#au-up [data-demo-select]').click();
    cy.get('#gl-signup-micro-scanner').should('be.checked');
    cy.get('#au-up [data-microapps-selection]').should('contain.text','1 microapp seleccionada');
    cy.get('#gl-signup-micro-empleados').check();
    cy.get('#gl-signup-modules').should('have.value','ambas');
    cy.window().should(w=>expect(w.__rows).to.have.length(w.__qaBeforeDemoRows));
  });
  it('primer ingreso sin preferencia permite elegir y no muestra éxito si falla el guardado',()=>{
    launch();login('nuevo-google@example.invalid');
    cy.get('#gl-request-kind').should('be.enabled').select('dueno');
    cy.get('#gl-request-micro-stock').check();cy.get('#gl-request-micro-empleados').check();
    cy.get('#gl-request-modules').should('have.value','ambas');
    cy.get('#gl-request-company').type('Cafetería de prueba');
    cy.get('#gl-request-responsible').type('Responsable de prueba');
    cy.get('#gl-request-phone').type('+54 11 1234-5678');
    cy.window().then(w=>{w.__registrationFail=true;});
    cy.get('#gl-registration-request button[type="submit"]').click();
    cy.get('[data-registration-status]').should('contain.text','No se pudo guardar');
    cy.window().then(w=>{w.__registrationFail=false;});
    cy.get('#gl-registration-request button[type="submit"]').click();
    cy.get('[data-registration-status]').should('contain.text','Solicitud guardada');
  });
  it('el panel de creadora distingue dueños y evita aprobarlos como gerentes',()=>{
    launch();cy.window().then(w=>w.__rows.push({col:'registration_requests',id:'futuro-dueno@example.invalid',data:{email:'futuro-dueno@example.invalid',tipoCuenta:'dueno',modulosSolicitados:['recibos_personal'],empresa:'Cafetería Futuro',responsable:'María Responsable',telefono:'+54 11 1234-5678',direccion:'Acassuso',microapps:['empleados'],personalizacion:'Necesito horarios rotativos',fecha:Date.now()}}));
    login('kmu15lopez@gmail.com');
    cy.contains('button','Revisar solicitudes').click();
    cy.get('#pn').should('contain.text','Administración de empleados').and('contain.text','Alta independiente');
    cy.get('#pn .gl-business-registration-card summary').should('contain.text','Cafetería Futuro').click();
    cy.get('#pn .gl-business-registration-card').should('contain.text','María Responsable')
      .and('contain.text','1234-5678')
      .and('contain.text','Personal y recibos')
      .and('contain.text','Necesito horarios rotativos');
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
