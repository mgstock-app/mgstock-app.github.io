describe('GESTLOK Chat · botonera interna de stock', () => {
  it('agrupa categorías, controla productos y adicional gratinado sin repetir botones', () => {
    cy.viewport(390,844);
    cy.visit('/chat/panel/?demo=1');
    cy.get('[data-p="stock"]').click();
    cy.contains('Disponibilidad').should('be.visible');
    cy.get('.stock-bloque').should('have.length',3);
    cy.get('.stock-lista').should('not.be.visible');
    cy.contains('.stock-cabecera','Empanadas').find('button.stock-desplegar').click();
    cy.contains('.stock-bloque','Empanadas').within(() => {
      cy.get('.stock-switch').should('have.length',2);
      cy.contains('.stock-item','Empanada de carne').find('input[type="checkbox"]').should('be.checked');
      cy.contains('.stock-item','Empanada de humita').find('input[type="checkbox"]').should('not.be.checked');
      cy.contains('.stock-item','Empanada de carne').find('input[type="checkbox"]').uncheck({force:true});
      cy.contains('.stock-item','Empanada de carne').should('contain.text','Agotado');
      cy.contains('button','Encender categoría').click();
      cy.contains('.stock-item','Empanada de carne').should('contain.text','Disponible');
      cy.contains('.stock-item','Empanada de humita').should('contain.text','Disponible');
      cy.get('.stock-desplegar').should('have.attr','aria-expanded','true');
    });
    cy.contains('.stock-cabecera','Adicionales').find('button.stock-desplegar').click();
    cy.contains('.stock-item','Gratinada adicional').should('contain.text','$ 900');
    cy.contains('.stock-item','Gratinada adicional').find('input[type="checkbox"]').uncheck({force:true});
    cy.contains('.stock-item','Gratinada adicional').should('contain.text','Agotado');
    cy.contains('.stock-item','Gratinada adicional').find('input[type="checkbox"]').check({force:true});
    cy.contains('.stock-item','Gratinada adicional').should('contain.text','Disponible');
  });
  it('la botonera no aparece en la web que usan los clientes', () => {
    cy.viewport(390,844);
    cy.visit('/chat/?demo=1');
    cy.get('#btn-carta').should('exist');
    cy.get('.stock-switch,.stock-grupo-accion,.stock-cabecera').should('not.exist');
  });
});