/* global Cypress, describe, beforeEach, it, cy, expect */
// Recorrido ampliado de GestLok. Todo el backend se reemplaza por Supabase falso,
// las pruebas NO consultan ni modifican los locales de producción.
const login = email => {
  cy.get("#au-email").type(email);
  cy.get("#au-pass").type("secreto1", {log:false});
  cy.get('#au-in button[type="submit"]').click();
};
const owner = () => login("dueno@example.com");
const toLocal = loc => cy.get(`#hub [data-act="local"][data-id="${loc}"]`).click();

describe("GestLok: auditoría de recorridos, perfiles y sincronización local", () => {
  Cypress.on("uncaught:exception", error => {
    if (error.message.includes("Minified React error #418")) return false;
  });
  beforeEach(() => {
    cy.task("mockSupabase").then(mock => {
      cy.intercept("GET", "**/vendor/supabase.js", {
        statusCode:200, headers:{"content-type":"application/javascript"}, body:mock
      }).as("fakeSupabase");
    });
    cy.intercept("**/*.supabase.co/**", {forceNetworkError:true});
    cy.visit("/");
    cy.wait("@fakeSupabase");
    cy.get(".gl-intro", {timeout:12000}).should("not.be.visible");
    cy.get("#au-in").should("be.visible");
  });

  it("intro, marca y acceso: no muestra Mi Gusto en la portada general", () => {
    cy.get("head title").should("contain.text", "GestLok");
    cy.get("#auth .au-cover").should("contain.text","Tu negocio, en orden.");
    cy.get("#auth .au-cover img").should("have.attr","alt","GestLok");
    cy.get("#auth .au-cover img").should("not.have.attr","src","img/mi-gusto-blanco.png");
    cy.get("#au-in").should("be.visible");
  });

  it("panel de creadora: métricas, autorizaciones y locales, sin cobros", () => {
    login("kmu15lopez@gmail.com");
    cy.get("#hub .gl-admin", {timeout:12000}).should("be.visible");
    cy.get(".gl-admin-stats").within(() => {
      cy.contains("Locales habilitados").should("exist");
      cy.contains("Usuarios autorizados").should("exist");
      cy.contains("Solicitudes pendientes").should("exist");
      cy.contains("Productos registrados").should("exist");
    });
    cy.get(".gl-admin").should("not.contain.text","Prueba gratuita");
    cy.get(".gl-admin").should("not.contain.text","Registrar pago");
    cy.get(".gl-admin [data-act=share]").first().click();
    cy.get("#pn").should("be.visible").and("contain.text","Equipo");
    cy.get("#pn [data-act=close]").first().click();
    cy.get("#hub .gl-admin").should("be.visible");
  });

  it("dueña: no accede al panel personal de creadora y puede alternar locales", () => {
    owner();
    cy.get("#hub .gl-admin").should("not.exist");
    toLocal("munro");
    cy.get("#brand-local").should("contain.text","Munro");
    cy.get('#snav [data-act="locales"]').click();
    cy.get("#hub").should("be.visible");
    toLocal("torcuato");
    cy.get("#brand-local").should("contain.text","Torcuato");
  });

  it("navegación por hojas de inventario sin perder el menú", () => {
    owner();
    toLocal("munro");
    for (const screen of ["inicio","stock","conteo","fabrica","pedido","historial"]) {
      cy.get(`#snav [data-go="${screen}"]`).should("exist").click();
      cy.get("#app").should("be.visible");
      cy.get("#snav").should("exist");
      cy.get("#view").should("not.be.empty");
    }
  });

  it("proveedores: cada local solo muestra sus productos relacionados", () => {
    cy.window().then(w => {
      w.__rows.find(r=>r.col==="munro/productos" && r.id==="p-001").data.proveedor="Proveedor Munro QA";
      w.__rows.find(r=>r.col==="torcuato/productos" && r.id==="p-001").data.proveedor="Proveedor Torcuato QA";
    });
    owner();
    toLocal("munro");
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get("#view").should("contain.text","Proveedor Munro QA");
    cy.get("#view").should("not.contain.text","Proveedor Torcuato QA");
    cy.get('#snav [data-act="locales"]').click();
    toLocal("torcuato");
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get("#view").should("contain.text","Proveedor Torcuato QA");
    cy.get("#view").should("not.contain.text","Proveedor Munro QA");
  });

  it("chat de equipo: guarda el mensaje solamente en el local seleccionado", () => {
    owner();
    toLocal("munro");
    cy.get('#snav [data-go="chat"]').click();
    cy.get("#gestlok-chat-text").should("be.enabled").type("Mensaje privado de prueba Munro");
    cy.get('#gestlok-chat-form button[type="submit"]').click();
    cy.get(".gestlok-chat-list").should("contain.text","Mensaje privado de prueba Munro");
    cy.window().its("__rows").should(rows => {
      expect(rows.filter(r=>r.col==="munro/chat" && r.data.texto==="Mensaje privado de prueba Munro")).to.have.length(1);
      expect(rows.filter(r=>r.col==="torcuato/chat")).to.have.length(0);
    });
    cy.get('#snav [data-act="locales"]').click();
    toLocal("torcuato");
    cy.get('#snav [data-go="chat"]').click();
    cy.get(".gestlok-chat-list").should("not.contain.text","Mensaje privado de prueba Munro");
  });

  it("solo lectura: puede leer el chat pero no escribir", () => {
    login("lectura@example.com");
    cy.get('#snav [data-go="chat"]').click();
    cy.get("#gestlok-chat-text").should("be.disabled");
    cy.get('#gestlok-chat-form button[type="submit"]').should("be.disabled");
    cy.get("#view").should("contain.text","solo lectura");
    cy.window().its("__rows").should(rows => expect(rows.filter(r=>r.col==="munro/chat")).to.have.length(0));
  });

  it("sin conexión: permite revisar mensajes pero impide enviarlos", () => {
    owner();
    toLocal("munro");
    cy.get('#snav [data-go="chat"]').click();
    cy.window().then(w => w.dispatchEvent(new w.Event("offline")));
    cy.get("#view").should("contain.text","Sin conexión");
    cy.get("#gestlok-chat-text").should("be.disabled");
    cy.window().its("__rows").should(rows => expect(rows.filter(r=>r.col==="munro/chat")).to.have.length(0));
    cy.window().then(w => w.dispatchEvent(new w.Event("online")));
    cy.get("#gestlok-chat-text").should("be.enabled");
  });

  it("sin conexión: el conteo permanece pendiente sin escribir en base", () => {
    owner();
    toLocal("munro");
    cy.get('#snav [data-go="stock"]').click();
    cy.window().then(w => w.dispatchEvent(new w.Event("offline")));
    cy.get("#inc-p-002").click();
    cy.window().its("__rows").should(rows => {
      expect(rows.filter(r=>r.col==="munro/conteos")).to.have.length(0);
    });
    cy.window().then(w => {
      const borrador=w.localStorage.getItem("spm-draft-munro");
      expect(borrador).to.be.a("string");
      expect(JSON.parse(borrador).draft).not.to.deep.equal({});
    });
    cy.window().then(w => w.dispatchEvent(new w.Event("online")));
    cy.window().its("__rows").should(rows => {
      expect(rows.filter(r=>r.col==="munro/conteos")).to.have.length(0);
    });
    cy.get("#sb-save").should("not.be.disabled");
  });

  it("gerente de Munro no ve contenido ni acceso de Torcuato", () => {
    login("gerente.munro@example.com");
    cy.get("#brand-local").should("contain.text","Munro");
    cy.get('#snav [data-act="locales"]').should("not.exist");
    cy.get('#snav [data-go="chat"]').click();
    cy.get("#view").should("not.contain.text","Torcuato");
    cy.get("#hub .gl-admin").should("not.exist");
  });

  it("usuario pendiente: no puede ver locales ni herramientas administrativas", () => {
    login("sin-autorizacion-qa@example.com");
    cy.get('#auth [data-mode="pend"]').should("be.visible");
    cy.get("#app").should("not.be.visible");
    cy.get("#hub .gl-admin").should("not.exist");
  });

  it("formato móvil: el menú abre y permite entrar al chat", () => {
    cy.viewport(390,844);
    login("gerente.munro@example.com");
    cy.get('#app [data-act="menu-open"]').click();
    cy.get('#snav [data-go="chat"]').should("be.visible").click();
    cy.get("#view").should("contain.text","Chat del local");
    cy.get("#app").should("be.visible");
  });
});
