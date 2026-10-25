/* global Cypress, cy, describe, beforeEach, it */
const {abrirLocal}=require('../helpers/abrir-local');
describe("GestLok · chat efímero y punto de mensajes nuevos",()=>{
  Cypress.on("uncaught:exception",err=>{
    if(err.message.includes("Minified React error #418"))return false;
  });
  const login = email => {
    cy.get("#au-email").type(email);
    cy.get("#au-pass").type("secreto1",{log:false});
    cy.get('#au-in button[type="submit"]').click();
  };
  beforeEach(()=>{
    cy.task("mockSupabase").then(mock=>cy.intercept("GET","**/vendor/supabase.js",{
      statusCode:200,headers:{"content-type":"application/javascript"},body:mock
    }).as("fakeSupabase"));
    cy.intercept("**/*.supabase.co/**",{forceNetworkError:true});
    cy.visit("/");
    cy.wait("@fakeSupabase");
    cy.get(".gl-intro",{timeout:10000}).should("not.be.visible");
  });
  it("muestra punto turquesa al llegar un mensaje ajeno y lo marca leído al abrir",()=>{
    login("dueno@example.com");
    abrirLocal('munro');
    cy.window().then(async win=>{
      const res=await win.supabase.createClient().from("docs").upsert({
        col:"munro/chat",id:"qa-inbound-24h",
        data:{texto:"Sofía dejó una novedad de prueba",nombre:"Sofía",autor:"gerente.munro@example.com",fecha:Date.now()}
      });
      if(res.error)throw Error(res.error.message);
    });
    cy.get('#snav [data-go="chat"] .gl-chat-dot').should("be.visible");
    cy.get('#snav [data-go="chat"] .gl-chat-badge').should("contain.text","1");
    cy.get('#snav [data-go="chat"]').click();
    cy.get(".gestlok-chat-list").should("contain.text","Sofía dejó una novedad de prueba");
    cy.get('#snav [data-go="chat"] .gl-chat-badge').should("not.exist");
    cy.get('#snav [data-go="inicio"]').click();
    cy.get('#snav [data-go="chat"]').click();
    cy.get(".gestlok-chat-list").should("contain.text","Sofía dejó una novedad de prueba");
  });
  it("un mensaje enviado permanece al ir a otra hoja y regresar",()=>{
    login("gerente.munro@example.com");
    cy.get('#snav [data-go="chat"]').click();
    cy.get("#gestlok-chat-text").type("Mensaje que permanece al navegar");
    cy.get('#gestlok-chat-form button[type="submit"]').click();
    cy.get(".gestlok-chat-list").should("contain.text","Mensaje que permanece al navegar");
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get(".gl-proveedores").should("exist");
    cy.get('#snav [data-go="chat"]').click();
    cy.get(".gestlok-chat-list").should("contain.text","Mensaje que permanece al navegar");
    cy.get(".gestlok-chat").should("contain.text","duran 24 horas");
  });
  it("los mensajes de más de 24h no se muestran ni activan el punto",()=>{
    login("dueno@example.com");
    cy.window().then(win=>{
      win.__rows.push({
        col:"munro/chat",id:"qa-expired-24h",
        data:{texto:"Mensaje de ayer que ya venció",nombre:"Sofía",autor:"gerente.munro@example.com",fecha:Date.now()-25*60*60*1000}
      });
    });
    abrirLocal('munro');
    cy.get('#snav [data-go="chat"] .gl-chat-badge').should("not.exist");
    cy.get('#snav [data-go="chat"]').click();
    cy.get(".gestlok-chat-list").should("not.contain.text","Mensaje de ayer que ya venció");
  });
});
