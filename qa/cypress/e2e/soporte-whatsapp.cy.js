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
  cy.get('#au-email').clear().type(email);
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
      // Plantilla aprobada: «Hola, soy de <empresa> - <local>. Necesito soporte en <sector>.»
      expect(decoded).to.include(' - Munro.');
      expect(decoded).to.include('Necesito soporte en Inicio');
    });
    cy.get('[data-act="menu-open"]').click();
    cy.get('#snav [data-go="stock"]').should('be.visible').click();
    cy.get('#gl-soporte-whatsapp').invoke('attr','href').should(url=>{
      expect(decodeURIComponent(url)).to.include('Necesito soporte en Stock');
    });
    cy.get('[data-act="menu-open"]').click();
    cy.get('#snav [data-go="proveedores"]').should('be.visible').click();
    cy.get('#gl-soporte-whatsapp').invoke('attr','href').should(url=>{
      expect(decodeURIComponent(url)).to.include('Necesito soporte en Proveedores');
    });
    cy.get('#gl-support-form').should('not.exist');
  });
  it('El número de soporte es fijo y el botón flotante también está en el panel de la creadora',()=>{
    launch();login('kmu15lopez@gmail.com');
    fakeSupport();
    cy.get('#gl-soporte-whatsapp').should('be.visible')
      .invoke('attr','href').should('include','wa.me/5491144715168');
    cy.window().then(w=>w.GestLokSupport.adminCard()).then(html=>{
      if(!html)return;
      expect(html).to.include('5491144715168');
    });
    cy.window().its('__fakeSupport').should(state=>{
      expect(state.calls).to.have.length(0);
    });
  });
  it('La burbuja de soporte se puede mover en celular sin alterar el enlace',()=>{
    cy.viewport(390,844);
    launch();login('gerente.munro@example.com');fakeSupport();
    cy.window().then(w=>w.localStorage.removeItem('gestlok:support-bubble-position-v1'));
    cy.get('#gl-soporte-whatsapp').should('be.visible')
      .and('have.css','touch-action','none')
      .then($el=>{
        const box=$el[0].getBoundingClientRect();
        cy.wrap($el).trigger('pointerdown',{pointerId:4,pointerType:'touch',button:0,clientX:box.left+22,clientY:box.top+22})
          .trigger('pointermove',{pointerId:4,pointerType:'touch',clientX:box.left-110,clientY:box.top-100})
          .trigger('pointerup',{pointerId:4,pointerType:'touch',clientX:box.left-110,clientY:box.top-100});
      });
    cy.window().then(w=>{
      const saved=JSON.parse(w.localStorage.getItem('gestlok:support-bubble-position-v1')||'null');
      expect(saved?.v).to.eq(1);
      expect(saved.x).to.be.within(0,1);
      expect(saved.y).to.be.within(0,1);
    });
    cy.get('#gl-soporte-whatsapp').should('have.attr','href').and('include','wa.me/5491144715168');
    cy.reload();
    cy.get('#gl-soporte-whatsapp',{timeout:15000}).should('be.visible').then($el=>{
      const saved=JSON.parse(localStorage.getItem('gestlok:support-bubble-position-v1')||'null');
      expect(saved).to.have.property('v',1);
      expect($el[0].style.left).to.match(/px$/);
    });
  });
  it('Aparece también para colaborador de Solo ver',()=>{
    launch();login('lectura@example.com');
    fakeSupport();
    cy.get('#gl-soporte-whatsapp').should('be.visible');
  });
});