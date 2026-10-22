/* global describe, beforeEach, it, cy, Cypress */
// Ingreso de mercadería con datos y archivos ficticios: el simulador reemplaza a Supabase.
const SETUP = (w) => {
  for (const L of ["munro", "torcuato"]) {
    const P = (id) => w.__rows.find((r) => r.col === `${L}/productos` && r.id === id).data;
    const F = (id) => w.__rows.find((r) => r.col === `${L}/fabrica` && r.id === id).data;
    Object.assign(P("p-001"), { nombre: "Jamón cocido", unidad: "unidad" });
    Object.assign(P("p-002"), { nombre: "Muzzarella", unidad: "unidad" });
    Object.assign(P("p-003"), { nombre: "Pepperoni", unidad: "unidad" });
    Object.assign(F("f-001"), { nombre: "Pepperoni", local: 1, fabrica: 0 });
    w.__rows.push(
      { col: `${L}/hojas`, id: "h-cajas01", data: { nombre: "Stock Cajas", tipo: "lista", orden: 4 } },
      { col: `${L}/productos`, id: "c-1", data: { nombre: "Cajas grandes", cat: "Cajas", unidad: "unidad", stock: 3, sinStock: false, orden: 1, hoja: "h-cajas01" } },
    );
  }
};
const CSV = "Producto;Cantidad\nJamon cocido;2\nMuzzarella;3,5\nMuzzarella;1\nCajas grandes;5\nPepperoni;1 1/4\nProducto desconocido;10\n";
const row = (rows, local, col, id) => rows.find((r) => r.col === `${local}/${col}` && r.id === id).data;
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
      const r = await w.supabase.createClient().rpc("importar_mercaderia", { p_local: "munro", p_operacion: "ingreso", p_items: [{ col: "productos", id: "p-001", campo: "stock", cantidad: 5, antes: null }], p_archivo: {}, p_clave: "clave-cypress-1" });
      expect(r.error.message).to.eq("MGS:sin_permiso");
      expect(row(w.__rows, "munro", "productos", "p-001").stock).to.eq(null);
    });
  });

  it("la dueña importa en Torcuato, elige la hoja de un producto repetido y no toca Munro", () => {
    signIn("dueno@example.com");
    cy.get('.lcard [data-act="local"][data-id="munro"]').click();
    cy.get('#snav [data-go="ingreso"]').click();
    cy.get("#ing-loc-torcuato").click();
    cy.get("#ing-op-ingreso").click();
    subir();
    cy.get("#ing-vista").should("be.visible");
    cy.get("#ing-ign").should("contain.text", "Producto desconocido");
    cy.get("#ing-ok").should("be.disabled");
    cy.get("#ing-pend select").select("Pepperoni — Conteo Fábrica");
    cy.get('[id="ing-g-p:p-002"]').should("contain.text", "4,5");
    cy.window().its("__log").should((log) => expect(log.filter((x) => x[0] === "importar")).to.have.length(0));
    cy.get("#ing-ok").should("not.be.disabled").click();
    cy.get("#ing-listo").should("be.visible");
    cy.window().its("__rows").should((rows) => {
      expect(row(rows, "torcuato", "productos", "p-001").stock).to.eq(2);
      expect(row(rows, "torcuato", "productos", "p-002").stock).to.eq(4.5);
      expect(row(rows, "torcuato", "productos", "c-1").stock).to.eq(8);
      expect(row(rows, "torcuato", "fabrica", "f-001").local).to.eq(2.25);
      expect(row(rows, "torcuato", "productos", "p-003").stock).to.eq(null);
      expect(row(rows, "munro", "productos", "p-001").stock).to.eq(null);
      const h = rows.filter((r) => r.col === "importaciones");
      expect(h).to.have.length(1);
      expect(h[0].data.items).to.have.length(4);
      expect(h[0].data.por).to.eq("dueno@example.com");
    });
    cy.get("#ing-hist").should("contain.text", "remito.csv");
  });

  it("avisa si el archivo ya se importó y cancelar no guarda nada", () => {
    signIn("dueno@example.com");
    cy.get('.lcard [data-act="local"][data-id="munro"]').click();
    cy.get('#snav [data-go="ingreso"]').click();
    cy.get("#ing-loc-munro").click();
    cy.get("#ing-op-ingreso").click();
    subir();
    cy.get("#ing-pend select").select("No importar");
    cy.get("#ing-ok").click();
    cy.get("#ing-listo").should("be.visible");
    cy.get('[data-act="ing-otro"]').click();
    subir();
    cy.get("#ing-pend select").select("No importar");
    cy.get("#ing-ok").click();
    cy.get("#pn").should("contain.text", "ya se importó");
    cy.get('#pn [data-act="close"]').first().click();
    cy.get('[data-act="ing-cancelar"]').click();
    cy.window().its("__rows").should((rows) => {
      expect(row(rows, "munro", "productos", "p-001").stock).to.eq(2);
      expect(rows.filter((r) => r.col === "importaciones")).to.have.length(1);
    });
  });
});
