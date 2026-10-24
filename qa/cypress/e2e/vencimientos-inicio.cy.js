/* global Cypress, cy, beforeEach, describe, it */
describe("GestLok · avisos de vencimientos por sucursal en Inicio",()=>{
  Cypress.on("uncaught:exception",error=>{
    if(error.message.includes("Minified React error #418")) return false;
  });
  beforeEach(()=>{
    cy.task("mockSupabase").then(mock=>cy.intercept("GET","**/vendor/supabase.js",{
      statusCode:200,headers:{"content-type":"application/javascript"},body:mock
    }).as("fakeSupabase"));
    cy.intercept("**/*.supabase.co/**",{forceNetworkError:true});
    cy.visit("/");
    cy.wait("@fakeSupabase");
    cy.get(".gl-intro",{timeout:10000}).should("not.be.visible");
  });
  const login=email=>{
    cy.get("#au-email").type(email);
    cy.get("#au-pass").type("secreto1",{log:false});
    cy.get('#au-in button[type="submit"]').click();
  };
  const inputDate=(n)=>{
    cy.window().then(win=>{
      const now=win.GestLokUpdates.todayISO();
      const d=new Date(now+"T00:00:00Z");
      d.setUTCDate(d.getUTCDate()+n);
      cy.get("#gl-exp-done").clear().type(d.toISOString().slice(0,10));
    });
  };
  const addService=(name,offset,days)=>{
    cy.get('[data-go="vencimientos"]').click();
    cy.get('[data-up-action="new"]').click();
    cy.get("#gl-exp-name").type(name);
    inputDate(offset);
    cy.get("#gl-exp-days").clear().type(String(days));
    cy.get('#gl-exp-form button[type="submit"]').click();
    cy.contains(".gl-exp-row",name,{timeout:10000}).should("be.visible");
  };
  it("gerente ve mañana y vencido en Inicio; al renovar se borra el aviso",()=>{
    login("gerente.munro@example.com");
    cy.get("#brand-local").should("contain.text","Munro");
    addService("Fumigación",-1,2);
    cy.get('[data-go="inicio"]').click();
    cy.get(".gl-home-due").should("contain.text","Fumigación vence mañana")
      .and("contain.text","Munro");
    addService("Limpieza de campana",-8,2);
    cy.get('[data-go="inicio"]').click();
    cy.get(".gl-home-due").should("contain.text","Limpieza de campana: plazo vencido");
    cy.get(".gl-home-due-status.expired").should("be.visible");
    cy.get(".gl-home-due [data-go='vencimientos']").click();
    cy.contains(".gl-exp-row","Fumigación").find('[data-up-action="edit"]').click();
    inputDate(0);
    cy.get("#gl-exp-days").clear().type("30");
    cy.get('#gl-exp-form button[type="submit"]').click();
    cy.contains(".gl-exp-row","Fumigación").should("be.visible");
    cy.get('[data-go="inicio"]').click();
    cy.get(".gl-home-due").should("not.contain.text","Fumigación");
    cy.get(".gl-home-due").should("contain.text","Limpieza de campana");
  });
  it("dueña ve alertas del local actual, sin mezclarlas con otras sucursales",()=>{
    login("dueno@example.com");
    cy.get('.lcard [data-act="local"][data-id="munro"]').click();
    cy.get("#brand-local").should("contain.text","Munro");
    addService("Análisis de agua",-3,3);
    cy.get('[data-go="inicio"]').click();
    cy.get(".gl-home-due").should("contain.text","Análisis de agua vence hoy");
    cy.get('#snav [data-act="locales"]').click();
    cy.get('.lcard [data-act="local"][data-id="torcuato"]').click();
    cy.get("#brand-local").should("contain.text","Torcuato");
    cy.get(".gl-home-due").should("not.exist");
    cy.get('#snav [data-go="vencimientos"]').click();
    cy.contains(".gl-exp-row","Análisis de agua").should("not.exist");
  });
});
