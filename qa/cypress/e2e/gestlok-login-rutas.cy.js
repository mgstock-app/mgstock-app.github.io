/* global describe,it,cy,expect */
describe('GESTLOK · rutas absolutas desde la portada /login',()=>{
  it('los recursos del inicio se resuelven en la raíz y no dentro de /login/',()=>{
    cy.viewport(390,844);
    cy.visit('/login/?demo=1');
    cy.document().then(doc=>{
      expect(new URL('icons/gestlok-wordmark.svg',doc.baseURI).pathname)
        .to.equal('/icons/gestlok-wordmark.svg');
      expect(new URL('empleados/personal/',doc.baseURI).pathname)
        .to.equal('/empleados/personal/');
    });
    cy.get('#stock-root').should('exist');
    cy.get('.au-cover img').should('have.attr','src','icons/gestlok-wordmark.svg')
;
  });
});
