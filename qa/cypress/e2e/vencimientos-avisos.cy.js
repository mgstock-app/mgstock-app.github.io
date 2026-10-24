/* global Cypress, cy, beforeEach, describe, it */
describe("GestLok · Vencimientos y avisos nuevos, datos de prueba solamente",()=>{
  Cypress.on("uncaught:exception", error => {
    if(error.message.includes("Minified React error #418"))return false;
  });
  beforeEach(()=>{
    cy.task("mockSupabase").then(mock=>cy.intercept("GET","**/vendor/supabase.js",{
      statusCode:200,headers:{"content-type":"application/javascript"},body:mock
    }).as("fakeDb"));
    cy.intercept("**/*.supabase.co/**",{forceNetworkError:true});
    cy.visit("/");
    cy.wait("@fakeDb");
    cy.get(".gl-intro",{timeout:10000}).should("not.be.visible");
    cy.get("#au-in").should("be.visible");
  });
  const login=email=>{
    cy.get("#au-email").type(email);
    cy.get("#au-pass").type("secreto1",{log:false});
    cy.get('#au-in button[type="submit"]').click();
  };
  it("gerente carga un vencimiento, obtiene fecha exacta y registra historial",()=>{
    login("gerente.munro@example.com");
    cy.get('[data-go="vencimientos"]').click();
    cy.get(".gl-exp-heading h1").should("contain.text","Vencimientos");
    cy.get('[data-up-action="new"]').click();
    cy.get("#gl-exp-name").type("Limpieza de campana");
    cy.get("#gl-exp-done").clear().type("2026-10-01");
    cy.get("#gl-exp-days").clear().type("30");
    cy.get("#gl-exp-preview-date").should("contain.text","31/10/26");
    cy.get('#gl-exp-form button[type="submit"]').click();
    cy.contains(".gl-exp-row","Limpieza de campana",{timeout:10000}).should("contain.text","31/10/26");
    cy.get('[data-up-action="history"]').click();
    cy.get(".gl-exp-history").should("contain.text","Primer registro");
    cy.get('[data-up-action="edit"]').click();
    cy.get("#gl-exp-done").clear().type("2026-11-01");
    cy.get("#gl-exp-days").clear().type("45");
    cy.get("#gl-exp-preview-date").should("contain.text","16/12/26");
    cy.get('#gl-exp-form button[type="submit"]').click();
    cy.contains(".gl-exp-row","Limpieza de campana").should("contain.text","16/12/26");
    cy.get('[data-up-action="history"]').click();
    cy.get(".gl-exp-history").should("contain.text","Renovación / edición");
  });
  it("lectura ve la hoja sin opciones de edición",()=>{
    login("lectura@example.com");
    cy.get('[data-go="vencimientos"]').click();
    cy.get(".gl-exp-heading h1").should("contain.text","Vencimientos");
    cy.get('[data-up-action="new"]').should("not.exist");
    cy.get('[data-go="avisos"]').should("not.exist");
  });
  it("cuenta dueña puede abrir avisos sin pedir permiso push automáticamente",()=>{
    login("dueno@example.com");
    cy.get(".lcard [data-id='munro']").click();
    cy.get('[data-go="avisos"]').click();
    cy.get(".gl-exp-page h1").should("contain.text","Centro de avisos");
    cy.get(".gl-push-optin").should("contain.text","23:15");
  });
});
