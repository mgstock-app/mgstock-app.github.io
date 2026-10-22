/* global describe, beforeEach, it, cy, Cypress */
// Ingreso de mercadería con datos y archivos ficticios: el simulador reemplaza a Supabase.
// Los remitos solo cargan la columna Ingreso de las hojas «Local + Ingreso».
const SETUP = (w) => {
  for (const L of ["munro", "torcuato"]) {
    const P = (id) => w.__rows.find((r) => r.col === `${L}/productos` && r.id === id).data;
    Object.assign(P("p-001"), { nombre: "Jamón cocido", unidad: "unidad" });
    const it = (id, hoja, nombre, local, fabrica, orden) => ({ col: `${L}/fabrica`, id, data: { nombre, bloque: 1, orden, local, fabrica, sinStock: false, resaltar: false, hoja } });
    w.__rows.push(
      { col: `${L}/hojas`, id: "h-ing01", data: { nombre: "Stock", tipo: "ingreso", orden: 5 } },
      { col: `${L}/hojas`, id: "h-ing02", data: { nombre: "Depósito", tipo: "ingreso", orden: 6 } },
      it("i-1", "h-ing01", "Jamón cocido", 1, null, 1), it("i-2", "h-ing01", "Muzzarella", null, null, 2),
      it("i-3", "h-ing01", "Cajas grandes", 3, 1, 3), it("i-4", "h-ing01", "Pepperoni", null, null, 4),
      it("i-5", "h-ing02", "Pepperoni", 2, null, 1),
    );
  }
};
const CSV = "Producto;Cantidad\nJamon cocido;2\nMuzzarella;3,5\nMuzzarella;1\nCajas grandes;5\nPepperoni;1 1/4\nProducto desconocido;10\n";
const row = (rows, local, id) => rows.find((r) => r.col === `${local}/fabrica` && r.id === id).data;
const signIn = (email) => {
  cy.window().then(SETUP);
  cy.get("#au-email").type(email);
  cy.get("#au-pass").type("secreto1", { log: false });
  cy.get("#au-in button[type=submit]").click();
};
const subir = (nombre = "remito.csv") =>
  cy.get("#ing-file").selectFile({ contents: Cypress.Buffer.from(CSV), fileName: nombre, mimeType: "text/csv" }, { force: true });

describe("MG Stock: Ingreso de mercadería", () => {
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

  it("un gerente no ve la pantalla y la base rechaza la importación", () => {
    signIn("gerente.munro@example.com");
    cy.get("#brand-local").should("contain.text", "Munro");
    cy.get('#snav [data-go="ingreso"]').should("not.exist");
    cy.window().then(async (w) => {
      const r = await w.supabase.createClient().rpc("importar_mercaderia", { p_local: "munro", p_operacion: "ingreso", p_items: [{ col: "fabrica", id: "i-1", campo: "fabrica", cantidad: 5, antes: null }], p_archivo: {}, p_clave: "clave-cypress-1" });
      expect(r.error.message).to.eq("MGS:sin_permiso");
      expect(row(w.__rows, "munro", "i-1").fabrica).to.eq(null);
    });
  });

  it("la dueña ingresa en Torcuato: suma a Ingreso, elige la hoja y no toca otras hojas ni Munro", () => {
    signIn("dueno@example.com");
    cy.get('.lcard [data-act="local"][data-id="munro"]').click();
    cy.get('#snav [data-go="ingreso"]').click();
    cy.get("#ing-loc-torcuato").click();
    cy.get("#ing-op-ingreso").click();
    subir();
    cy.get("#ing-vista").should("be.visible");
    cy.get("#ing-ign").should("contain.text", "Producto desconocido");
    cy.get("#ing-ok").should("be.disabled");
    cy.get("#ing-pend select").select("Pepperoni — Depósito");
    cy.get('[id="ing-g-f:i-2"]').should("contain.text", "4,5");
    cy.get("#ing-ok").should("not.be.disabled").click();
    cy.get("#ing-listo").should("be.visible");
    cy.window().its("__rows").should((rows) => {
      expect(row(rows, "torcuato", "i-1").fabrica).to.eq(2);
      expect(row(rows, "torcuato", "i-1").local).to.eq(1);
      expect(row(rows, "torcuato", "i-2").fabrica).to.eq(4.5);
      expect(row(rows, "torcuato", "i-3").fabrica).to.eq(6);
      expect(row(rows, "torcuato", "i-5").fabrica).to.eq(1.25);
      expect(row(rows, "torcuato", "i-4").fabrica).to.eq(null);
      expect(rows.find((r) => r.col === "torcuato/productos" && r.id === "p-001").data.stock).to.eq(null);
      expect(row(rows, "munro", "i-1").fabrica).to.eq(null);
      expect(rows.filter((r) => r.col === "importaciones")).to.have.length(1);
    });
    cy.get("#ing-hist").should("contain.text", "remito.csv");
  });

  it("avisa si el archivo ya se importó, cancelar no guarda nada y la hoja muestra el stock real", () => {
    signIn("dueno@example.com");
    cy.get('.lcard [data-act="local"][data-id="munro"]').click();
    cy.get('#snav [data-go="ingreso"]').click();
    cy.get("#ing-loc-munro").click();
    cy.get("#ing-op-ingreso").click();
    subir();
    cy.get("#ing-pend select").select("No importar");
    cy.get("#ing-ok").should("not.be.disabled").click();
    cy.get("#ing-listo").should("be.visible");
    cy.get('[data-act="ing-otro"]').click();
    subir();
    cy.get("#ing-pend select").select("No importar");
    cy.get("#ing-ok").should("not.be.disabled").click();
    cy.get("#pn").should("contain.text", "ya se importó");
    cy.get('#pn [data-act="close"]').first().click();
    cy.get('[data-act="ing-cancelar"]').should("not.be.disabled").click();
    cy.window().its("__rows").should((rows) => {
      expect(row(rows, "munro", "i-1").fabrica).to.eq(2);
      expect(rows.filter((r) => r.col === "importaciones")).to.have.length(1);
    });
    cy.get('#snav [data-go="h-ing01"]').click();
    cy.get(".xl-h").should("contain.text", "Stock real");
    cy.get("#ft-i-1").should("have.text", "3");
  });
});
