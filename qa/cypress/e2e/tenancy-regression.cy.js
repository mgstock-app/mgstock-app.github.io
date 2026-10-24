/* global Cypress, describe, beforeEach, it, cy */
const login = email => {
  cy.get("#au-email").type(email);
  cy.get("#au-pass").type("secreto1", { log:false });
  cy.get("#au-in button[type=submit]").click();
};
describe("GestLok · regresión de permisos y nuevas funciones (Supabase simulado)", () => {
  Cypress.on("uncaught:exception", err => {
    if (err.message.includes("Minified React error #418")) return false;
  });
  beforeEach(() => {
    cy.task("mockSupabase").then(mock =>
      cy.intercept("GET", "**/vendor/supabase.js", {
        statusCode:200, headers:{"content-type":"application/javascript"}, body:mock,
      }).as("mockDb")
    );
    cy.intercept("**/*.supabase.co/**", { forceNetworkError:true });
    cy.visit("/");
    cy.wait("@mockDb");
    cy.get(".gl-intro",{timeout:10000}).should("not.be.visible");
  });
  it("la dueña mantiene dos locales y no recibe pantallas de cobro", () => {
    login("dueno@example.com");
    cy.get(".lcard h2").should("contain.text","Munro").and("contain.text","Torcuato");
    cy.get("#hub .gl-admin").should("not.exist");
    cy.get("#hub").should("not.contain.text","Suscripciones")
      .and("not.contain.text","Facturación")
      .and("not.contain.text","Pagar plan");
  });
  it("una gerente mantiene su sucursal, sus proveedores y su chat aislado", () => {
    login("gerente.munro@example.com");
    cy.get("#brand-local").should("contain.text","Munro");
    cy.get('#snav [data-act="locales"]').should("not.exist");
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get(".gl-proveedores h1").should("contain.text","Proveedores");
    cy.get('#snav [data-go="chat"]').click();
    cy.get(".gestlok-chat h1").should("contain.text","Chat del local");
    cy.get(".gestlok-chat .eyebrow").should("contain.text","Munro");
  });
  it("usuarios pendientes quedan fuera de stock y chat", () => {
    login("sin-aprobar@example.com");
    cy.get('#auth [data-mode="pend"]').should("be.visible");
    cy.get("#app").should("not.be.visible");
  });
});
