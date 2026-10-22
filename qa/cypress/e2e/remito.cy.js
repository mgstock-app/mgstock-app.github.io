/* global describe, beforeEach, it, cy, Cypress */
// «Ingresar remito» con los lectores reales (pdf.js y Tesseract.js descargados en el build), datos ficticios.
const SETUP = (w) => {
  const P = (id) => w.__rows.find((r) => r.col === `munro/productos` && r.id === id).data;
  Object.assign(P("p-001"), { nombre: "Jamón cocido", unidad: "unidad" });
  Object.assign(P("p-002"), { nombre: "Muzzarella", unidad: "unidad" });
  w.__rows.push(
    { col: "munro/hojas", id: "h-cajas01", data: { nombre: "Stock Cajas", tipo: "lista", orden: 4 } },
    { col: "munro/productos", id: "c-1", data: { nombre: "Cajas grandes", cat: "Cajas", unidad: "unidad", stock: 3, sinStock: false, orden: 1, hoja: "h-cajas01" } },
  );
};
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
    cy.get("#au-in").should("be.visible");
  });
  it("lee un PDF digital y lo guarda al confirmar", () => {
    abrir();
    cy.get("#ing-file").selectFile("cypress/fixtures/remito.pdf", { force: true });
    cy.get('[id="ing-g-p:p-002"]', { timeout: 60000 }).should("contain.text", "3,5");
    cy.get('[id="ing-g-p:c-1"]').should("contain.text", "5");
    cy.get("#ing-ok").click();
    cy.get("#ing-listo").should("be.visible");
    cy.window().its("__rows").should((rows) => {
      expect(rows.find((r) => r.col === "munro/productos" && r.id === "p-002").data.stock).to.eq(3.5);
      expect(rows.find((r) => r.col === "munro/productos" && r.id === "c-1").data.stock).to.eq(5);
    });
  });
  it("lee una foto con OCR, no tilda nada solo y guarda lo revisado", () => {
    abrir();
    cy.get("#ing-file").selectFile("cypress/fixtures/remito-foto.png", { force: true });
    cy.get("#ing-ocr", { timeout: 180000 }).should("be.visible");
    cy.get('[id="ing-g-p:p-001"]').should("exist").find("[data-ingon]").should("not.be.checked");
    cy.get('[id="ing-g-p:c-1"]').should("exist");
    cy.get("#ing-tildar").click();
    cy.get("#ing-ok").click();
    cy.get("#ing-listo").should("be.visible");
    cy.window().its("__rows").should((rows) => {
      expect(rows.find((r) => r.col === "munro/productos" && r.id === "p-001").data.stock).to.eq(2);
      expect(rows.find((r) => r.col === "munro/productos" && r.id === "c-1").data.stock).to.eq(8);
    });
  });
});
