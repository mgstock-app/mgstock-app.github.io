/* global Cypress, cy, describe, it */
import { abrirLocal } from '../helpers/abrir-local';

// Los datos son simulados: nunca escribe Stock, Cajas o Conteos reales.
describe('Mi Gusto · dueña consulta inventario e historiales de ambas sucursales',()=>{
  Cypress.on('uncaught:exception',error=>{
    if(error.message.includes('Minified React error #418'))return false;
  });

  function setup(){
    cy.task('mockSupabase').then(body=>{
      cy.intercept('GET','**/vendor/supabase.js',{
        statusCode:200,headers:{'content-type':'application/javascript'},body
      }).as('mockSupabase');
    });
    cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
    cy.visit('/login/');
    cy.wait('@mockSupabase');
    cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
    cy.window().then(w=>{
      const rows=w.__rows;
      for(const local of ['munro','torcuato']){
        const hojas=local+'/hojas',catalogo=local+'/productos';
        const add=(col,id,data)=>rows.push({col,id,data});
        const setHoja=(id,data)=>{
          const current=rows.find(r=>r.col===hojas&&r.id===id);
          if(current)current.data={...current.data,...data};
          else add(hojas,id,data);
        };
        setHoja('stock',{nombre:'Stock Sugerido',oculta:true});
        setHoja('historial',{oculta:true});
        setHoja('h-qa-owner-stock',{nombre:'Stock Local',tipo:'ingreso',orden:2,oculta:false});
        setHoja('h-qa-owner-cajas',{nombre:'Stock Cajas',tipo:'lista',orden:3,oculta:false});
        const fab=rows.find(r=>r.col===local+'/fabrica');
        if(fab)add(local+'/fabrica','f-owner-qa',{...fab.data,hoja:'h-qa-owner-stock',nombre:'Stock Local '+local,local:7,fabrica:2});
        const producto=rows.find(r=>r.col===catalogo);
        if(producto)add(catalogo,'c-owner-qa',{...producto.data,hoja:'h-qa-owner-cajas',nombre:'Caja '+local,stock:14});
        add(local+'/conteos','conteo-owner-qa',{
          fecha:Date.now(),tipo:'fabrica',hoja:'h-qa-owner-stock',
          autor:'dueno@example.com',filas:[{nombre:'Registro exclusivo '+local,local:7,fabrica:2,total:9}]
        });
      }
    });
    cy.get('#au-email').clear().type('dueno@example.com');
    cy.get('#au-pass').type('secreto1',{log:false});
    cy.get('#au-in button[type="submit"]').click();
  }

  for(const local of ['munro','torcuato']){
    it(local+': muestra la hoja real de stock, cajas e historial aun cuando el historial base está oculto',()=>{
      setup();
      abrirLocal(local);
      cy.get('#brand-local').should('contain.text',local==='munro'?'Munro':'Torcuato');
      cy.get('#view .gl-owner-inventory-links',{timeout:15000}).should('exist').within(()=>{
        cy.get('[data-go="h-qa-owner-stock"]').should('contain.text','Stock Local');
        cy.get('[data-go="h-qa-owner-cajas"]').should('contain.text','Stock Cajas');
        cy.get('[data-go="historial"]').should('contain.text','Historial');
      });
      cy.get('#snav [data-go="historial"]').should('exist');
      cy.get('#snav [data-go="h-qa-owner-stock"]').should('exist');
      cy.get('#snav [data-go="h-qa-owner-cajas"]').should('exist');

      cy.get('#view [data-go="h-qa-owner-stock"]').click();
      cy.get('#view').should('contain.text','Stock Local '+local);
      cy.get('#snav [data-go="h-qa-owner-cajas"]').click();
      cy.get('#view').should('contain.text','Caja '+local);
      cy.get('#snav [data-go="historial"]').click();
      cy.get('#view [data-act="hist-toggle"]').first().click();
      cy.get('#view').should('contain.text','Registro exclusivo '+local);
      cy.get('#view').should('not.contain.text','Registro exclusivo '+(local==='munro'?'torcuato':'munro'));
    });
  }
});
