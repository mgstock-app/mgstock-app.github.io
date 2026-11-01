/* global Cypress, cy, describe, it */
describe("GestLok · actualización de marca sin reinstalar la PWA",()=>{
  Cypress.on("uncaught:exception",error=>{
    if(error.message.includes("Minified React error #418"))return false;
  });
  it("mantiene el enlace original al manifest para instalaciones existentes",()=>{
    cy.visit("/");
    cy.get('link[rel="manifest"]').should("have.attr","href","/manifest.webmanifest");
    cy.title().should("eq","GESTLOK | Software de gestión de negocios y locales");
    cy.get('link[rel="apple-touch-icon"]').should("have.attr","href").and("include","gestlok-apple-v2-180.png");
  });
  it("publica el nombre GestLok y conserva el ID y la ruta de inicio",()=>{
    cy.request({url:"/manifest.webmanifest",failOnStatusCode:true}).then(res=>{
      expect(res.status).to.eq(200);
      const data=typeof res.body==="string"?JSON.parse(res.body):res.body;
      expect(data.name).to.eq("GestLok");
      expect(data.short_name).to.eq("GestLok");
      expect(data.id).to.eq("./");
      expect(data.start_url).to.eq("./");
      expect(data.icons.filter(i=>i.type==="image/png").every(i=>i.src.includes("?rev="))).to.eq(true);
    });
  });
  it("sirve el ícono versionado sin cambiar el nombre del archivo físico",()=>{
    cy.request({url:"/icons/gestlok-app-v2-192.png?rev=gestlok-installed-brand-20261024-r3",failOnStatusCode:true})
      .its("status").should("eq",200);
  });
});
