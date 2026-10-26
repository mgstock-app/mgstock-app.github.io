/* global Cypress, describe, beforeEach, it, cy, expect */
import { abrirLocal } from '../helpers/abrir-local';
// Recorrido ampliado de GestLok. Todo el backend se reemplaza por Supabase falso,
// las pruebas NO consultan ni modifican los locales de producción.
const login = email => {
  cy.get("#au-email").type(email);
  cy.get("#au-pass").type("secreto1", {log:false});
  cy.get('#au-in button[type="submit"]').click();
};
const owner = () => login("dueno@example.com");
const toLocal = loc => abrirLocal(loc);

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

  it("Inicio operativo no duplica hojas; los registros siguen en sus secciones", () => {
    cy.window().then(w => {
      const fabrica = w.__rows.filter(r => r.col === "munro/fabrica");
      fabrica.forEach(r => { r.data.local = null; r.data.fabrica = null; });
      const primera = fabrica.find(r => r.id === "f-001");
      expect(primera).not.to.equal(undefined);
      primera.data.local = 6;
      primera.data.fabrica = 2;
      w.__rows.push({col:"munro/hojas",id:"h-qa-cajas-resumen",
        data:{nombre:"Stock Cajas QA",tipo:"lista",orden:90}});
      w.__rows.push({col:"munro/productos",id:"p-qa-cajas-resumen",
        data:{nombre:"Caja de prueba",cat:"Envases QA",hoja:"h-qa-cajas-resumen",stock:12}});
    });
    owner();
    toLocal("munro");
    cy.get('.gl-home-essential').should('be.visible');
    cy.get('.gl-home-essential-stat').should('have.length',3);
    cy.get('.gl-home-sheet-summaries').should('not.exist');
    cy.get('#view').should('not.contain.text','Caja de prueba');
    cy.get('#snav [data-go="h-qa-cajas-resumen"]').should('exist').click();
    cy.get('#view').should('contain.text','Caja de prueba');
    cy.get('#snav [data-go="fabrica"]').click();
    cy.get('#view').should('contain.text','Fábrica');
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

  it("chat: reintento idempotente de un mensaje ya recibido por el servidor", () => {
    owner();
    toLocal("munro");
    cy.window().then(w => {
      const payload={id:"abcd1234efgh5678ijkl",texto:"Mensaje recuperable QA",autor:"dueno@example.com",local:"munro",nombre:"Dueña",fecha:Date.now()};
      w.localStorage.setItem("gestlok-chat-pending-v1:dueno%40example.com:munro",JSON.stringify(payload));
      w.__rows.push({col:"munro/chat",id:payload.id,data:{texto:payload.texto,autor:payload.autor,nombre:payload.nombre,fecha:payload.fecha}});
    });
    cy.get('#snav [data-go="chat"]').click();
    cy.get('#gestlok-chat-form button[type="submit"]').should("contain.text","Reintentar envío").click();
    cy.window().its("__rows").should(rows => {
      expect(rows.filter(r=>r.col==="munro/chat" && r.id==="abcd1234efgh5678ijkl")).to.have.length(1);
    });
    cy.window().then(w => {
      expect(w.localStorage.getItem("gestlok-chat-pending-v1:dueno%40example.com:munro")).to.eq(null);
    });
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
    cy.get("#gestlok-chat-text").should("be.enabled").type("Borrador sin conexión");
    cy.get('#gestlok-chat-form button[type="submit"]').should("be.disabled");
    cy.window().its("__rows").should(rows => expect(rows.filter(r=>r.col==="munro/chat")).to.have.length(0));
    cy.window().then(w => w.dispatchEvent(new w.Event("online")));
    cy.get("#gestlok-chat-text").should("be.enabled").and("have.value", "Borrador sin conexión");
    cy.get('#snav [data-go="inicio"]').click();
    cy.get('#snav [data-go="chat"]').click();
    cy.get("#gestlok-chat-text").should("have.value", "Borrador sin conexión");
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
      const borrador=w.localStorage.getItem("spm-draft-v2-dueno%40example.com:munro");
      expect(borrador).to.be.a("string");
      expect(JSON.parse(borrador).draft).not.to.deep.equal({});
    });
    cy.window().then(w => w.dispatchEvent(new w.Event("online")));
    cy.window().its("__rows").should(rows => {
      expect(rows.filter(r=>r.col==="munro/conteos")).to.have.length(0);
    });
    cy.get("#sb-save").should("not.be.disabled");
  });

  it("borrador del dueño no se carga automáticamente en otro usuario del mismo local", () => {
    cy.window().then(w => {
      w.localStorage.setItem("spm-draft-v2-dueno%40example.com:munro",
        JSON.stringify({draft:{"p-002":30},notas:{},editing:null,fdraft:{}}));
    });
    login("gerente.munro@example.com");
    cy.get("#brand-local").should("contain.text","Munro");
    cy.get('#snav [data-go="stock"]').click();
    cy.window().then(w => {
      expect(w.localStorage.getItem("spm-draft-v2-dueno%40example.com:munro")).to.be.a("string");
      expect(w.localStorage.getItem("spm-draft-v2-gerente.munro%40example.com:munro")).to.eq(null);
    });
    cy.get("#view").should("not.contain.text","Recuperar borrador anterior");
  });

  it("borrador anterior exige recuperación expresa sin borrarse antes", () => {
    cy.window().then(w => {
      w.localStorage.setItem("spm-draft-munro",
        JSON.stringify({draft:{"p-002":13},notas:{},editing:null,fdraft:{}}));
    });
    owner();
    toLocal("munro");
    cy.get('#snav [data-go="stock"]').click();
    cy.get('[data-act="recover-draft"]').should("be.visible");
    cy.window().its("localStorage").invoke("getItem", "spm-draft-munro").should("be.a","string");
    cy.get('[data-act="recover-draft"]').click();
    cy.get('[data-act="recover-draft"]').should("not.exist");
    cy.window().then(w => {
      expect(w.localStorage.getItem("spm-draft-munro")).to.eq(null);
      expect(JSON.parse(w.localStorage.getItem("spm-draft-v2-dueno%40example.com:munro")).draft["p-002"]).to.eq(13);
    });
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


  it("tablet 820 px: logo visible y menú/Ajustes con contraste correcto", () => {
    cy.viewport(820,1180);
    login("gerente.munro@example.com");
    cy.get("#app").should("be.visible");
    cy.get("#app .plogo").should("be.visible").and("have.attr", "alt", "GestLok");
    cy.get("#app .top-brand-name").should("be.visible").and("contain.text", "GestLok");
    cy.get("#app .ham").should("be.visible").and("have.css", "color", "rgb(22, 52, 76)");
    cy.get("#app #btn-ajustes").should("be.visible").and("have.css", "color", "rgb(23, 59, 85)");
    cy.get("#app .crumb").should("have.css", "color", "rgb(80, 101, 118)");
    cy.get("#app .ham").click();
    cy.get("#app").should("have.class", "open");
    cy.get("#snav [data-go=chat]").should("be.visible");
    cy.get("#app .xside").click();
    cy.get("#app").should("not.have.class", "open");
  });

  it("celular 390 px: los iconos del encabezado son visibles sin tapar el título", () => {
    cy.viewport(390,844);
    login("gerente.munro@example.com");
    cy.get("#app .ham").should("be.visible");
    cy.get("#app .plogo").should("be.visible");
    cy.get("#app #btn-ajustes svg.i").should("be.visible");
    cy.get("#app #ttl").should("be.visible").and("contain.text", "Panel del local");
    cy.get("#app .top-brand-name").should("not.be.visible");
  });


  it("planilla de fábrica: sumar y restar en Local e Ingreso modifica solo el borrador", () => {
    owner();
    toLocal("munro");
    cy.get('#snav [data-go="fabrica"]').click();
    cy.get('#fl-f-001').should("be.visible");
    cy.get('#fr-f-001 [data-act="fstep"][data-field="l"][data-delta="1"]').click();
    cy.get("#fl-f-001").should("have.value","1");
    cy.get('#fr-f-001 [data-act="fstep"][data-field="l"][data-delta="-1"]').click();
    cy.get("#fl-f-001").should("have.value","0");
    cy.get('#ffq1-f-001').click();
    cy.get("#fl-f-001").should("have.value","0,25");
    cy.get('#fr-f-001 [data-act="fstep"][data-field="f"][data-delta="1"]').click();
    cy.get("#ff-f-001").should("have.value","1");
    cy.get("#ft-f-001").should("contain.text","1,25");
    cy.window().its("__rows").should(rows => {
      const original = rows.find(r=>r.col==="munro/fabrica" && r.id==="f-001");
      expect(original.data.local).to.eq(null);
      expect(original.data.fabrica).to.eq(null);
    });
    cy.get("#sb-save").should("not.be.disabled");
  });

  it("planilla: botones no permiten cantidades negativas y respetan solo lectura", () => {
    login("lectura@example.com");
    cy.get('#snav [data-go="fabrica"]').click();
    cy.get('#fr-f-001 [data-act="fstep"]').should("have.length",4).each(b => cy.wrap(b).should("be.disabled"));
    cy.get('#fl-f-001').should("be.disabled");
    cy.get('#ff-f-001').should("be.disabled");
  });

  it("planilla tablet 820: filas amplias y controles sin desbordar la pantalla", () => {
    cy.viewport(820,1180);
    owner();
    toLocal("munro");
    cy.get('#app [data-act="menu-open"]').click();
    cy.get('#snav [data-go="fabrica"]').should("be.visible").click();
    cy.get('#fr-f-001').should("be.visible").within(() => {
      cy.contains("Local").should("be.visible");
      cy.contains("Fábrica").should("be.visible");
      cy.get('.xl-stepper').should("have.length",2);
      cy.get('.xl-stepper button').should("have.length",4);
    });
    cy.get('#fr-f-001').then(els => {
      const row = els[0].getBoundingClientRect();
      expect(row.width).to.be.greaterThan(450);
      expect(row.right).to.be.lessThan(821);
    });
    cy.get('#fr-f-001 .xl-stepper').each(($el) => {
      const bounds=$el[0].getBoundingClientRect();
      expect(bounds.width).to.be.greaterThan(120);
    });
  });

  it("proveedor: ficha, WhatsApp y pedido solo para el local autorizado", () => {
    cy.window().then(w => {
      for (const loc of ["munro","torcuato"]) {
        const p = w.__rows.find(r=>r.col===loc+"/productos" && r.id==="p-001");
        p.data.proveedor="Distribuidora QA";
        p.data.min=5; p.data.stock=1;
      }
    });
    owner(); toLocal("munro");
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get(".gl-provider-card").should("contain.text","Distribuidora QA").and("contain.text","1 para reponer");
    cy.get('[data-act="prov-edit"][data-name="Distribuidora QA"]').click();
    cy.get("#prov-contact").type("Pedidos");
    cy.get("#prov-phone").type("5491123456789");
    cy.get("#prov-delivery").type("Entrega los martes");
    cy.get('#prov-form button[type="submit"]').click();
    cy.window().its("__rows").should(rows=>{
      const p=rows.find(r=>r.col==="munro/proveedores");
      expect(p).not.to.equal(undefined);
      expect(p.data.telefono).to.eq("5491123456789");
      expect(rows.filter(r=>r.col==="torcuato/proveedores")).to.have.length(0);
    });
    cy.get(".gl-provider-card a[href^='https://wa.me/5491123456789']").should("not.exist");
    cy.get('[data-act="prov-open"][data-name="Distribuidora QA"]').click();
    cy.get('#prov-carpeta [data-act="prov-save-plan"]').should('be.visible');
    cy.get('#snav [data-act="locales"]').click();
    toLocal("torcuato");
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get(".gl-provider-card").should("contain.text","Distribuidora QA");
    cy.get(".gl-provider-card").should("not.contain.text","Entrega los martes");
    cy.get(".gl-provider-card a[href^='https://wa.me/']").should("not.exist");
  });

  it("cuenta lectura no puede editar proveedores", () => {
    cy.window().then(w => { w.__rows.find(r=>r.col==="munro/productos" && r.id==="p-001").data.proveedor="Solo lectura QA"; });
    login("lectura@example.com");
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get("#view").should("contain.text","Solo lectura QA");
    cy.get('[data-act="prov-edit"]').should("not.exist");
  });

  it("inicio: muestra tareas claras para el cliente", () => {
    login("gerente.munro@example.com");
    cy.get('#view .gl-manager-landing').should('be.visible');
    cy.get('#view [data-gerente-business]').click();
    cy.get("#view .gl-home-essential").should("be.visible");
    cy.get("#view .gl-home-essential-stat").should("have.length",3);
    cy.get('.gl-home-essential-links [data-go="proveedores"]').click();
    cy.get("#view").should("contain.text","Proveedores");
  });

  it("Conteo diario exclusivo: no aparece para dueña en Munro ni Torcuato", () => {
    owner(); toLocal("munro");
    cy.get('#snav [data-go="diario"]').should("not.exist");
    cy.get('#snav [data-act="locales"]').click();
    toLocal("torcuato");
    cy.get('#snav [data-go="diario"]').should("not.exist");
    cy.window().its("__rows").should(rows =>
      expect(rows.filter(r=>r.col==="torcuato/munro_control")).to.have.length(0));
  });

  it("gerente Munro: tablero por categorías, diferencia y guardado con historial", () => {
    login("gerente.munro@example.com");
    cy.get('#snav [data-go="diario"]').should("be.visible").click();
    cy.get("#view").should("contain.text", "Conteo diario");
    cy.get("#view").should("contain.text", "Empanadas");
    cy.get("#view").should("contain.text", "Pizza Indi");
    cy.get("#diario-fecha").clear().type("2026-10-24").blur();
    cy.get('[data-md-expected="empanadas"]').should('contain.text','2.149');
    cy.get('[data-md-act="edit"]').click();
    cy.get('[data-md-id="empanadas"][data-md-field="contado"]').clear().type("2147");
    cy.get('[data-md-diff="empanadas"]').should("contain.text", "-2");
    cy.get('[data-md-act="save"]').click();
    cy.window().its("__rows").should(rows => {
      const logs=rows.filter(r=>r.col==="munro/munro_control" && r.data.tipo==="cierre");
      expect(logs).to.have.length(1);
      expect(logs[0].data.filas.find(p=>p.id==="empanadas").contado).to.eq(2147);
      expect(rows.find(r=>r.col==="munro/productos" && r.id==="p-001").data.stock).to.eq(null);
      expect(rows.filter(r=>r.col==="torcuato/munro_control")).to.have.length(0);
    });
    cy.get(".md-hist").should("contain.text","Historial de guardados");
  });

  it("Conteo diario exclusivo: solo creadora y gerentes autorizados tienen acceso", () => {
    login("lectura@example.com");
    cy.get('#snav [data-go="diario"]').should("not.exist");
  });

  it("Conteo diario Munro conserva el menú en tablet", () => {
    cy.viewport(820,1180);
    login("gerente.munro@example.com");
    cy.get('#app [data-act="menu-open"]').click();
    cy.get('#snav [data-go="diario"]').should("be.visible").click();
    cy.get(".md-stats").should("exist");
    cy.get(".md-grupo").should("exist");
    cy.get('[data-md-act="compare"]').should("exist");
  });

  it("hoja Proveedores: crea carpeta, agrega productos, completa las tres cantidades y guarda resumen", () => {
    owner(); toLocal("munro");
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get('[data-act="prov-new"]').click();
    cy.get('#prov-new-name').type('Cafetería Insumos QA');
    cy.get('#prov-create-form button[type="submit"]').click();
    cy.get('#prov-carpeta').should('contain.text','Cafetería Insumos QA');
    cy.get('[data-act="prov-add-open"]').click();
    cy.get('#prov-item-name').type('Leche larga vida');
    cy.get('#prov-item-unit').type('cajas');
    cy.get('#prov-add-form button[type="submit"]').click();
    cy.get('.gl-prov-table tbody tr[data-prov-row]').should('have.length',1).and('contain.text','Leche larga vida');
    cy.get('.gl-prov-table .gl-prov-category-head').should('contain.text','General').and('contain.text','Poner en 0');
    cy.get('[data-prov-val="stockLocal"]').clear().type('7');
    cy.get('[data-prov-val="sugerido"]').clear().type('4');
    cy.get('[data-prov-val="pedir"]').clear().type('3');
    cy.get('#prov-resumen').should('contain.text','Cafetería Insumos QA').and('contain.text','Leche larga vida').and('contain.text','3 cajas');
    cy.get('#prov-resumen [data-act="prov-save-plan"]').click();
    cy.get('#pn').should('contain.text','¿Terminaste el pedido?');
    cy.get('#pn [data-act="prov-save-draft"]').click();
    cy.window().its('__rows').should(rows=>{
      const entry=rows.find(x=>x.col==='munro/proveedores' && x.data.nombre==='Cafetería Insumos QA');
      expect(entry).not.to.equal(undefined);
      expect(entry.data.items[0].nombre).eq('Leche larga vida');
      expect(entry.data.items[0].stockLocal).eq(7);
      expect(entry.data.items[0].pedir).eq(3);
      expect(entry.data.items[0].sugerido).eq(4);
      expect(rows.filter(x=>x.col==='torcuato/proveedores')).to.have.length(0);
    });
    cy.get('#snav [data-act="locales"]').click();
    toLocal('torcuato');
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get('#view').should('not.contain.text','Cafetería Insumos QA');
  });

  it("proveedores: una cuenta de lectura no puede modificar ni compartir pedidos", () => {
    cy.window().then(w=>w.__rows.find(r=>r.col==='munro/productos' && r.id==='p-001').data.proveedor='Proveeduría lectura');
    login('lectura@example.com');
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get('[data-act="prov-new"]').should('not.exist');
    cy.get('[data-act="prov-open"][data-name="Proveeduría lectura"]').click();
    cy.get('[data-prov-val]').should('be.disabled');
    cy.get('[data-act="prov-save-plan"]').should('not.exist');
    cy.get('[data-act="prov-share"]').should('not.exist');
  });

  it("pedido de proveedor: comparte únicamente PDF por menú nativo en tablet", () => {
    cy.window().then(w=>{
      const item=w.__rows.find(r=>r.col==='munro/productos' && r.id==='p-001');
      item.data.proveedor='Proveedor para compartir';
      Object.defineProperty(w.navigator,'share',{configurable:true,value:cy.stub().resolves().as('nativeShare')});
      Object.defineProperty(w.navigator,'canShare',{configurable:true,value:()=>true});
    });
    owner(); toLocal('munro');
    cy.get('#snav [data-go="proveedores"]').click();
    cy.get('[data-act="prov-open"][data-name="Proveedor para compartir"]').click();
    cy.get('[data-prov-val="pedir"]').first().clear().type('2');
    cy.get('#prov-resumen').should('contain.text','2 unidad');
    cy.get('#prov-resumen [data-act="prov-share"]').should('be.disabled');
    cy.get('#prov-resumen [data-act="prov-save-plan"]').click();
    cy.get('#pn [data-act="prov-save-draft"]').click();
    cy.get('#prov-resumen [data-act="prov-share"]').should('be.enabled').click();
    cy.get('#pn [data-act="prov-share-ready"]',{timeout:12000}).should('be.visible').click();
    cy.get('@nativeShare',{timeout:12000}).should('have.been.calledOnce');
    cy.get('@nativeShare').then(stub=>{
      const arg=stub.firstCall.args[0];
      expect(arg.files).to.have.length(1);
      expect(arg.files[0].type).eq('application/pdf');
      expect(arg.files[0].name).to.match(/\.pdf$/);
      expect(arg.text).to.eq(undefined);
      expect(arg.title).to.eq(undefined);
    });
  });

  it("planilla proveedores en tablet: las tres columnas siguen visibles sin apretarse", () => {
    cy.viewport(820,1180);
    cy.window().then(w=>{w.__rows.find(x=>x.col==='munro/productos' && x.id==='p-001').data.proveedor='Proveedor vista tablet';});
    owner();toLocal('munro');
    cy.get('#app [data-act="menu-open"]').click();
    cy.get('#snav [data-go="proveedores"]').should('be.visible').click();
    cy.get('[data-act="prov-open"][data-name="Proveedor vista tablet"]').click();
    cy.get('.gl-prov-table tbody tr[data-prov-row]').first().within(()=>{
      cy.get('[data-label="Stock local"]').should('be.visible');
      cy.get('[data-label="Pedir"]').should('be.visible');
      cy.get('[data-label="Sugerido"]').should('be.visible');
    });
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
