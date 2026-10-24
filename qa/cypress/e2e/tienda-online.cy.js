/* global describe, it, cy, expect */
// Tienda pública con base ficticia interceptada. No accede a Supabase real.
const uuid='11111111-1111-4111-8111-111111111111';
const fake = `
window.supabase={
  createClient(){
    return {
      from(table){
        let rows;
        if(table==='gestlok_tiendas')
          rows=[{id:'11111111-1111-4111-8111-111111111111',nombre:'Tienda ficticia',descripcion:'Ropa de prueba',direccion:'Calle de prueba 123',whatsapp:'5491112345678',permite_retiro:true,permite_envio:true,visible:true}];
        else if(table==='gestlok_productos_tienda')
          rows=[{id:'22222222-2222-4222-8222-222222222222',nombre:'Remera ficticia',categoria:'Ropa',descripcion:'Algodón',sku:'REM-1',precio:15000,precio_anterior:18000,stock:2,imagen_url:'',publicado:true,destacado:true}];
        else return {select(){throw Error('Consulta ajena a la tienda')}};
        const query={
          select(){return query;},
          eq(){return query;},
          order(){return Promise.resolve({data:rows,error:null});},
          maybeSingle(){return Promise.resolve({data:rows[0]||null,error:null});}
        };
        return query;
      }
    };
  }
};`;
describe('GestLok: vidriera pública sin conexión a producción',()=>{
  it('nunca muestra una URL de tienda inválida',()=>{
    cy.visit('/tienda.html?slug=!!invalid!!');
    cy.get('#shop-title').should('contain.text','Tienda no disponible');
    cy.get('#shop-content').should('not.be.visible');
  });
  it('catálogo, filtro, carrito, cantidad y checkout voluntario por WhatsApp',()=>{
    cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body:fake}).as('fakeStore');
    cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
    cy.viewport(390,844);
    cy.visit('/tienda.html?slug=tienda-ficticia');
    cy.wait('@fakeStore');
    cy.get('#shop-title').should('contain.text','Tienda ficticia');
    cy.get('.product').should('have.length',1).and('contain.text','Remera ficticia');
    cy.get('#search').type('sin-coincidencias');
    cy.get('#catalog').should('contain.text','No hay productos');
    cy.get('#search').clear().type('Remera');
    cy.get('[data-add]').click();
    cy.get('#cart-count').should('have.text','1');
    cy.get('#open-cart').click();
    cy.get('#cart').should('be.visible');
    cy.get('[data-plus]').click();
    cy.get('#cart-count').should('have.text','2');
    cy.get('[data-plus]').should('be.disabled');
    cy.get('#cart-total').should('contain.text','30.000');
    cy.window().then(w=>cy.stub(w,'open').as('waOpen'));
    cy.get('#checkout input[name="nombre"]').type('Cliente ficticio');
    cy.get('#delivery').select('envio');
    cy.get('#checkout input[name="direccion"]').type('Dirección ficticia 10');
    cy.get('#checkout button[type="submit"]').click();
    cy.get('@waOpen').should('have.been.calledOnce');
    cy.get('@waOpen').should(s=>{
      const url=s.getCall(0).args[0];
      expect(url).to.contain('https://wa.me/5491112345678');
      expect(decodeURIComponent(url)).to.contain('Remera ficticia');
      expect(decodeURIComponent(url)).to.contain('Dirección ficticia 10');
    });
  });
});