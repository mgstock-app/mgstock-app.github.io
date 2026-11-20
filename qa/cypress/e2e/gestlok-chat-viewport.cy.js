/* global describe, it, cy, expect */
// Regresión visual: el mensaje y las acciones deben permanecer visibles en
// pantallas bajas, conversaciones extensas y al crecer el textarea.
// Se usa ?demo=1: nunca se envían pedidos ni reclamos reales.
describe('GESTLOK Chat · campo de texto siempre visible', () => {
  function verificarLayout() {
    cy.window().then(win => {
      const app = win.document.getElementById('app');
      const mensajes = win.document.getElementById('mensajes');
      const redactar = win.document.getElementById('redactar');
      const texto = win.document.getElementById('texto');
      const pie = win.document.querySelector('.pie');
      const vista = win.innerHeight;
      const limite = elemento => elemento.getBoundingClientRect();
      expect(limite(app).bottom, 'el contenedor no desborda la pantalla').to.be.lte(vista + 2);
      expect(limite(redactar).top, 'la entrada comienza dentro de la pantalla').to.be.gte(0);
      expect(limite(redactar).bottom, 'acciones visibles').to.be.lte(vista + 2);
      expect(limite(texto).bottom, 'textarea visible').to.be.lte(vista + 2);
      expect(limite(pie).bottom, 'pie no queda debajo de la pantalla').to.be.lte(vista + 2);
      expect(limite(mensajes).bottom, 'mensajes separados del compositor')
        .to.be.lte(limite(redactar).top + 1);
      expect(win.document.documentElement.scrollHeight, 'sin desplazamiento de toda la página')
        .to.be.lte(vista + 2);
    });
  }
  for (const [ancho,alto] of [[390,844],[390,470],[1280,720]]) {
    it('mantiene la entrada fija con mensajes largos en '+ancho+'×'+alto, () => {
      cy.viewport(ancho,alto);
      cy.visit('/chat/?demo=1');
      cy.get('#app').should('have.attr','aria-busy','false');
      cy.get('#redactar').should('be.visible');
      cy.get('#texto').should('be.visible').and('not.be.disabled');
      cy.get('#mensajes').then($mensajes => {
        for(let n=0;n<35;n++) {
          const burbuja = document.createElement('div');
          burbuja.className = 'burbuja asistente';
          burbuja.textContent = 'Mensaje de seguimiento número '+n+': el gerente responde por el mismo chat.';
          $mensajes[0].append(burbuja);
        }
      });
      cy.get('#mensajes').should($m => {
        expect($m[0].scrollHeight, 'historial desplazable').to.be.greaterThan($m[0].clientHeight);
      });
      verificarLayout();
      cy.get('#texto').type('Necesito ayuda con mi pedido. '.repeat(7), {delay:0});
      verificarLayout();
      cy.get('#texto').invoke('val').should('include','Necesito ayuda');
    });
  }
});
