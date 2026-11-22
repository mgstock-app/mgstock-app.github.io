/* global describe,it,cy,expect,Cypress */
// Mismo aviso de hidratación #418 que ya exceptúan otras pruebas del HTML de GESTLOK en Cypress;
// cualquier otro error sigue haciendo fallar la prueba.
Cypress.on('uncaught:exception',error=>{
  if(/Minified React error #418/.test(error?.message||'')&&/react\.dev\/errors\/418/.test(error?.message||''))return false;
  return undefined;
});
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
    cy.get('.au-cover img').should('have.attr','src','icons/gestlok-wordmark.svg');
  });
});
