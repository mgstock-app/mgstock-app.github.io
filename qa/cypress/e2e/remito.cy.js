/* global describe, beforeEach, it, cy, Cypress */
// «Ingresar remito» con los lectores reales (pdf.js y Tesseract.js descargados en el build), datos ficticios.
const SETUP = (w) => {
  const it = (id, nombre, local, fabrica, orden) => ({ col: "munro/fabrica", id, data: { nombre, bloque: 1, orden, local, fabrica, sinStock: false, resaltar: false, hoja: "h-ing01" } });
  w.__rows.push({ col: "munro/hojas", id: "h-ing01", data: { nombre: "Stock", tipo: "ingreso", orden: 5 } },
    it("i-1", "Jamón cocido", 1, null, 1), it("i-2", "Muzzarella", null, null, 2), it("i-3", "Cajas grandes", 3, 1, 3));
};
const F = (rows, id) => rows.find((r) => r.col === "munro/fabrica" && r.id === id).data;
const abrir = () => {
  cy.window().then(SETUP);
  cy.get("#au-email").type("dueno@example.com");
  cy.get("#au-pass").type("secreto1", { log: false });
  cy.get("#au-in button[type=submit]").click();
  cy.get('.lcard [data-act="local"][data-id="munro"]').click();
  cy.get("#ini-remito").click();
  cy.get("#ing-loc-munro").click();
  cy.get("#ing-op-ingreso").click();
};
describe("MG Stock: Ingresar remito (PDF y foto)", () => {
  Cypress.on("uncaught:exception", (error) => {
    if (error.message.includes("Minified React error #418")) return false;
  });
  beforeEach(() => {
    cy.task("mockSupabase").then((mock) => {
      cy.intercept("GET", "**/vendor/supabase.js", { statusCode: 200, headers: { "content-type": "application/javascript" }, body: mock }).as("fakeSupabase");
    });
    cy.intercept("**/*.supabase.co/**", { forceNetworkError: true });
    cy.visit("/");
    cy.wait("@fakeSupabase");
    // La presentación permanece visible ~3,7 s antes de permitir el ingreso.
    cy.get(".gl-intro", { timeout: 10000 }).should("not.be.visible");
    cy.get("#au-in").should("be.visible");
  });
  it("lee un PDF digital y lo guarda al confirmar", () => {
    abrir();
    cy.get("#ing-file").selectFile("cypress/fixtures/remito.pdf", { force: true });
    cy.get('[id="ing-g-f:i-2"]', { timeout: 60000 }).should("contain.text", "3,5");
    cy.get('[id="ing-g-f:i-3"]').should("contain.text", "3");
    cy.get("#ing-ok").should("not.be.disabled").click();
    cy.get("#ing-listo").should("be.visible");
    cy.window().its("__rows").should((rows) => {
      expect(F(rows, "i-2").fabrica).to.eq(3.5);
      expect(F(rows, "i-3").fabrica).to.eq(3);
    });
  });
  it("lee una foto con OCR, no tilda nada solo y guarda lo revisado", () => {
    abrir();
    cy.get("#ing-file").selectFile("cypress/fixtures/remito-foto.png", { force: true });
    cy.get("#ing-ocr", { timeout: 180000 }).should("be.visible");
    cy.get('[id="ing-g-f:i-1"]').should("exist").find("[data-ingon]").should("not.be.checked");
    cy.get('[id="ing-g-f:i-3"]').should("exist");
    cy.get("#ing-tildar").click();
    cy.get("#ing-ok").should("not.be.disabled").click();
    cy.get("#ing-listo").should("be.visible");
    cy.window().its("__rows").should((rows) => {
      expect(F(rows, "i-1").fabrica).to.eq(2);
      expect(F(rows, "i-3").fabrica).to.eq(6);
    });
  });
});
