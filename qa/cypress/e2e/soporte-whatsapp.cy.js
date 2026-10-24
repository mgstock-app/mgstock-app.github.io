/* global Cypress, describe, it, cy, expect */
function launch(){
  cy.task('mockSupabase').then(fake=>{
    cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body:fake}).as('mock');
  });
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/');
  cy.wait('@mock');
  cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
  cy.get('#au-in').should('be.visible');
}
function login(email){
  cy.get('#au-email').type(email);
  cy.get('#au-pass').type('secreto1',{log:false});
  cy.get('#au-in button[type="submit"]').click();
}
function fakeSupport(){
  cy.window().then(w=>{
    const state={phone:'5491144715168',calls:[]};
    w.__fakeSupport=state;
    w.GestLokSupabase={
      from:table=>{
        if(table!=='gestlok_support_settings')throw Error('Unexpected table '+table);
        return {select:()=>({eq:()=>({single:async()=>({data:{whatsapp:state.phone},error:null})})})};
      },
      rpc:async(name,args)=>{
        state.calls.push({name,args});
        if(name!=='gestlok_support_set_phone')return {data:null,error:{message:'unexpected rpc'}};
        state.phone=args.p_phone;
        return {data:state.phone,error:null};
      }
    };
    return w.GestLokSupport.load(true);
  });
}
describe('GestLok · Soporte WhatsApp',()=>{
  Cypress.on('uncaught:exception',error=>{
    if(error.message.includes('Minified React error #418'))return false;
  });
  it('Gerente de Munro ve Soporte con su sector actual y cambia al navegar',()=>{
    cy.viewport(390,844);launch();login('gerente.munro@example.com');
    fakeSupport();
    cy.get('#gl-soporte-whatsapp').should('be.visible')
      .and('have.attr','target','_blank')
      .and('have.attr','rel','noopener noreferrer');
    cy.get('#gl-soporte-whatsapp').invoke('attr','href').should('include','5491144715168');
    cy.get('#gl-soporte-whatsapp').invoke('attr','href').should(url=>{
      const decoded=decodeURIComponent(url);
      expect(decoded).to.include('soy de Munro');
      expect(decoded).to.include('sector de Inicio');
    });
    cy.get('#snav [data-go="stock"]').click();
    cy.get('#gl-soporte-whatsapp').invoke('attr','href').should(url=>{
      expect(decodeURIComponent(url)).to.include('sector de Stock');
    });
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get('#gl-soporte-whatsapp').invoke('attr','href').should(url=>{
      expect(decodeURIComponent(url)).to.include('sector de Proveedores');
    });
    cy.get('#gl-support-form').should('not.exist');
  });
  it('Creadora edita el WhatsApp desde su panel sin enviar mensajes',()=>{
    launch();login('kmu15lopez@gmail.com');
    fakeSupport();
    cy.get('#gl-support-form').should('be.visible');
    cy.get('#gl-support-phone').clear().type('+54 9 11 5555 1234');
    cy.get('#gl-support-form button[type="submit"]').click();
    cy.get('#gl-support-current').should('contain.text','5491155551234');
    cy.window().its('__fakeSupport').should(state=>{
      expect(state.phone).to.eq('5491155551234');
      expect(state.calls).to.have.length(1);
    });
    cy.get('#gl-soporte-whatsapp').should('not.exist');
  });
  it('No aparece para un usuario de Solo ver',()=>{
    launch();login('lectura@example.com');
    fakeSupport();
    cy.get('#gl-soporte-whatsapp').should('not.exist');
  });
});