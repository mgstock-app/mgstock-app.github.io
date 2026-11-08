/* global describe, it, cy, expect */
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
function visitStore(data=base) {
 cy.intercept("POST","**/rest/v1/rpc/gestlok_zayro_public_catalog",{
   statusCode:200,headers:{"content-type":"application/json"},body:data
 }).as("catalog");
 cy.visit("/zayro/");
 cy.wait("@catalog");
}
describe("ZAYRO · tienda pública aislada",()=>{
 it("presenta tienda desactivada sin productos ni acceso interno",()=>{
  visitStore({...base,enabled:false,sales_whatsapp:"",products:[]});
  cy.contains("Estamos preparando nuestra tienda").should("be.visible");
  cy.get(".zayro-product").should("not.exist");
  cy.get('[data-au="up"]').should("not.exist");
  cy.get("#app").should("not.exist");
 });
 it("muestra solo el catálogo público y permite filtrar sin datos privados",()=>{
  visitStore();
  cy.get(".zayro-product").should("have.length",2);
  cy.get(".zayro").should("contain.text","ZAYRO");
  cy.get(".zayro").should("not.contain.text","Costo")
    .and("not.contain.text","Ganancia").and("not.contain.text","Mi Gusto");
  cy.get(".zayro-categories").contains("button","Mujer").click();
  cy.get(".zayro-product").should("have.length",1).and("contain.text","Fragancia de prueba A");
  cy.get(".zayro-categories").contains("button","Hombre").click();
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
  cy.contains("h1","Tu próxima fragancia").should("be.visible");
  cy.get(".zayro-product").first().contains("button","Agregar al carrito").click();
  cy.get(".zayro-bottom-cart button").should("be.visible").click();
  cy.get(".zayro-cart").should("be.visible");
  cy.get(".zayro-cart [aria-label='Cerrar carrito']").click();
  cy.get(".zayro-catalog").should("be.visible");
 });
});
