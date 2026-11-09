/* global describe, it, cy, expect, Cypress */
 // El HTML raíz de GESTLOK emite el aviso de hidratación Next/React #418
 // en Cypress; el mismo caso ya está exceptuado en demo-web-showcase.cy.js.
 // Solo ignoramos ese código específico: los errores de red, JS y assertions
 // de catálogo, filtros, carrito y WhatsApp deben seguir haciendo fallar.
 Cypress.on('uncaught:exception', error => {
   if (/Minified React error #418/.test(error?.message || '') &&
       /react\.dev\/errors\/418/.test(error?.message || '')) return false;
   return undefined;
 });
const base = {
 brand:"ZAYRO",enabled:true,sales_whatsapp:"5491144477888",currency:"ARS",
 products:[
  {id:"00000000-0000-4000-8000-000000000101",name:"Fragancia de prueba A",
   category:"Perfumes",audience:"mujer",sku:"PROD-A",description:"Floral",
   price:15000.5,stock:2,image_url:""},
  {id:"00000000-0000-4000-8000-000000000102",name:"Fragancia de prueba B",
   category:"Perfumes",audience:"hombre",sku:"PROD-B",description:"Amaderada",
   price:20000,stock:8,image_url:""}
 ]
};
function visitStore(data=base,path="/zayro/",design=[]) {
 cy.intercept("POST","**/rest/v1/rpc/gestlok_zayro_public_design",{
   statusCode:200,headers:{"content-type":"application/json"},body:design
 }).as("design");
 cy.intercept("POST","**/rest/v1/rpc/gestlok_zayro_public_catalog",{
   statusCode:200,headers:{"content-type":"application/json"},body:data
 }).as("catalog");
 cy.visit(path);
 cy.wait("@catalog");
}
describe("ZAYRO · tienda pública aislada",()=>{
 it("presenta tienda desactivada sin productos ni acceso interno",()=>{
  visitStore({...base,enabled:false,sales_whatsapp:"",products:[]});
  cy.contains("Estamos preparando nuestra tienda").should("be.visible");
  cy.get(".zayro-product").should("not.exist");
  cy.get('[data-au="up"]').should("not.exist");
  cy.get("#app").should("not.exist");
  cy.get(".zayro-wa-float").should("not.exist");
 });
 it("limpia ?utm_source=chatgpt.com y deja la tienda en /zayro/",()=>{
  visitStore(base,"/zayro/?utm_source=chatgpt.com&utm_medium=referral");
  cy.location("pathname").should("eq","/zayro/");
  cy.location("search").should("eq","");
  cy.get(".zayro-product").should("have.length",2);
  cy.get(".zayro-nav").contains("a","Perfumes").click();
  cy.location("search").should("eq","");
  cy.location("hash").should("eq","");
  cy.get("#zayro-catalog-title").should("contain.text","Perfumes");
 });
 it("muestra el inicio premium con banner, beneficios, categorías y WhatsApp",()=>{
  visitStore();
  cy.get(".zayro-topbar").should("contain.text","Envíos a todo el país");
  cy.get(".zayro-logo svg[aria-label='ZAYRO Parfum']").should("be.visible");
  cy.contains("h1","Fragancias").should("be.visible");
  cy.get(".zayro-hero").contains("a","Ver perfumes").should("be.visible");
  cy.get(".zayro-benefits").should("contain.text","Calidad garantizada").and("contain.text","Atención personalizada");
  cy.get(".zayro-cats").contains("button","Cuidado capilar").click();
  cy.get("#zayro-catalog-title").should("contain.text","Cuidado capilar");
  cy.get(".zayro-wa-float").should("have.attr","href").and("match",/^https:\/\/wa\.me\/5491144477888\?text=/);
  cy.get(".zayro-promos").should("contain.text","¿No sabés cuál").and("contain.text","Desde Zona Norte");
 });
 it("aplica la tabla de diseño para visitantes sin mostrar el modo diseño",()=>{
  visitStore(base,"/zayro/",[
   {anchor:"hero.sub",kind:"text",value:"que te enamoran"},
   {anchor:"sec.about",kind:"hide",value:""},
   {anchor:"sec.benefits",kind:"add",value:"Promo de noviembre\n10% pagando por transferencia"}
  ]);
  cy.get(".zayro-hero-sub").should("have.text","que te enamoran");
  cy.get("#sobre-zayro").should("not.exist");
  cy.get(".zayro-zd-block").should("contain.text","Promo de noviembre").and("contain.text","10% pagando por transferencia");
  cy.get(".zayro-zd-toggle").should("not.exist");
  cy.get(".zayro-zd-bar").should("not.exist");
 });
 it("con ?diseno=1 y sin sesión pide ingresar y limpia la dirección",()=>{
  visitStore(base,"/zayro/?diseno=1");
  cy.location("search").should("eq","");
  cy.get(".zayro-zd-notice").should("contain.text","ingresá a GESTLOK");
  cy.get(".zayro-zd-toggle").should("not.exist");
 });
 it("muestra solo el catálogo público y permite filtrar sin datos privados",()=>{
  visitStore();
  cy.get(".zayro-product").should("have.length",2);
  cy.get(".zayro").should("contain.text","ZAYRO");
  cy.get(".zayro").should("not.contain.text","Costo")
    .and("not.contain.text","Ganancia").and("not.contain.text","Mi Gusto");
  cy.get(".zayro-filters").contains("button","Mujer").click();
  cy.get(".zayro-product").should("have.length",1).and("contain.text","Fragancia de prueba A");
  cy.get(".zayro-filters").contains("button","Hombre").click();
  cy.get(".zayro-product").should("have.length",1).and("contain.text","Fragancia de prueba B");
 });
 it("crea carrito y consulta por WhatsApp, sin escritura ni descuento de stock",()=>{
  let writes=0;
  cy.intercept({method:"POST",url:"**/rest/v1/rpc/gestlok_zayro_admin_*"},()=>{writes++;});
  visitStore();
  cy.get(".zayro-product").first().contains("button","Agregar al carrito").click();
  cy.get(".zayro-bottom-cart").should("contain.text","1 producto").contains("button","Ver carrito").click();
  cy.get(".zayro-cart").should("contain.text","Fragancia de prueba A")
    .and("contain.text","El pedido y la disponibilidad se confirman por WhatsApp");
  cy.get(".zayro-cart a[href^='https://wa.me/']").invoke("attr","href").then(href=>{
    expect(href).to.include("5491144477888");
    const text=decodeURIComponent(String(href).split("?text=")[1]||"");
    expect(text).to.include("Fragancia de prueba A × 1");
    expect(text).to.include("Total estimado");
    expect(writes).to.eq(0);
  });
 });
 it("mantiene categorías y carrito utilizables en celular",()=>{
  cy.viewport(390,844);
  visitStore();
  cy.contains("h1","Fragancias").should("be.visible");
  cy.get(".zayro-nav").should("not.be.visible");
  cy.get("[aria-label='Abrir menú']").click();
  cy.get(".zayro-drawer").should("be.visible").contains("a","Perfumes").click();
  cy.get(".zayro-drawer").should("not.exist");
  cy.location("search").should("eq","");
  cy.get(".zayro-product").first().contains("button","Agregar al carrito").click();
  cy.get(".zayro-bottom-cart button").should("be.visible").click();
  cy.get(".zayro-cart").should("be.visible");
  cy.get(".zayro-cart [aria-label='Cerrar carrito']").click();
  cy.get(".zayro-catalog").should("be.visible");
 });
});
