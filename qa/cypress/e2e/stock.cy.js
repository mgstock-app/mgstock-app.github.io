/* global describe, beforeEach, it, cy */
const signIn = (email) => {
  cy.get("#au-email").type(email);
  cy.get("#au-pass").type("secreto1", { log: false });
  cy.get("#au-in button[type=submit]").click();
};
describe("MG Stock: navegación, permisos y stock aislados", () => {
  // Error de hidratación conocido del HTML heredado; otras excepciones fallan.
  Cypress.on("uncaught:exception", (error) => {
    if (error.message.includes("Minified React error #418")) return false;
  });
  beforeEach(() => {
    cy.task("mockSupabase").then((mock) => {
      cy.intercept("GET", "**/vendor/supabase.js", {
        statusCode: 200,
        headers: { "content-type": "application/javascript" },
        body: mock,
      }).as("fakeSupabase");
    });
    cy.intercept("**/*.supabase.co/**", { forceNetworkError: true });
    cy.visit("/");
    cy.wait("@fakeSupabase");
    cy.get("#au-in").should("be.visible");
  });
  it("solo la cuenta creadora abre el panel administrativo gratuito", () => {
    signIn("kmu15lopez@gmail.com");
    cy.get("#hub .gl-admin").should("be.visible");
    cy.get(".gl-admin h1").should("contain.text", "Panel administrativo");
    cy.get(".gl-admin").should("not.contain.text", "Suscripciones");
    cy.get(".gl-admin").should("contain.text", "GestLok es gratuito");
    cy.get(".gl-admin [data-act=admin-locales]").click();
    cy.get("#gl-admin-locales").should("exist");
  });
  it("la dueña no tiene acceso visual al panel privado de creadora", () => {
    signIn("dueno@example.com");
    cy.get("#hub").should("be.visible");
    cy.get("#hub .gl-admin").should("not.exist");
  });
  it("muestra el formulario de acceso", () => {
    cy.get("#au-email").should("be.visible");
    cy.get("#au-pass").should("be.visible");
  });
  it("el dueño entra a Torcuato y guarda un conteo sin afectar Munro", () => {
    signIn("dueno@example.com");
    cy.get("#hub").should("be.visible");
    cy.get(".lcard h2").should("contain.text", "Munro");
    cy.get(".lcard h2").should("contain.text", "Torcuato");
    cy.get('.lcard [data-act="local"][data-id="torcuato"]').click();
    cy.get("#brand-local").should("contain.text", "Torcuato");
    cy.get('#snav [data-go="stock"]').click();
    cy.get("#inc-p-002").click();
    cy.get("#sb-save").click();
    cy.get("#sv-ok").click();
    cy.window().its("__rows").should((rows) => {
      const count = (local) => rows.filter((r) => r.col === `${local}/conteos`).length;
      if (count("torcuato") !== 1 || count("munro") !== 0)
        throw new Error("El conteo no quedó limitado a Torcuato");
    });
  });
  it("gerente de Munro no puede cambiar a Torcuato", () => {
    signIn("gerente.munro@example.com");
    cy.get("#brand-local").should("contain.text", "Munro");
    cy.get('#snav [data-act="locales"]').should("not.exist");
    cy.get('#snav [data-go="stock"]').click();
    cy.get("#inc-p-003").should("be.visible");
  });
  it("el rol Solo ver no puede guardar", () => {
    signIn("lectura@example.com");
    cy.get("#app").should("be.visible");
    cy.get("#sb-save").should("be.disabled");
  });
  it("una cuenta desconocida queda pendiente", () => {
    signIn("otro@example.com");
    cy.get('#auth [data-mode="pend"]').should("be.visible");
    cy.get("#app").should("not.be.visible");
  });
});
