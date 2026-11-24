/* global Cypress, cy, describe, it */
import { abrirLocal } from '../helpers/abrir-local';

// Los datos son simulados: nunca escribe Stock, Cajas o Conteos reales.
describe('Mi Gusto · dueña consulta inventario e historiales de ambas sucursales',()=>{
  Cypress.on('uncaught:exception',error=>{
    if(error.message.includes('Minified React error #418'))return false;
  });

  function setup(email='dueno@example.com'){
    cy.task('mockSupabase').then(body=>{
      cy.intercept('GET','**/vendor/supabase.js',{
        statusCode:200,headers:{'content-type':'application/javascript'},body
      }).as('mockSupabase');
    });
    cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
    cy.visit('/login/');
    cy.wait('@mockSupabase');
    cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
    // La descarga del mock no garantiza que su script ya se haya ejecutado.
    cy.window({timeout:15000}).should(w=>{
      expect(w.__rows,'datos simulados cargados').to.be.an('array');
      expect(w.GestLokNavContext,'controlador de locales listo').to.be.a('function');
    });
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
        if(fab)add(local+'/fabrica','f-owner-sin',{...fab.data,hoja:'h-qa-owner-stock',nombre:'Sin stock QA '+local,local:0,fabrica:0,sinStock:true});
        const producto=rows.find(r=>r.col===catalogo);
        if(producto)add(catalogo,'c-owner-qa',{...producto.data,hoja:'h-qa-owner-cajas',nombre:'Caja '+local,stock:14});
        add(local+'/conteos','conteo-owner-qa',{
          fecha:Date.now(),tipo:'fabrica',hoja:'h-qa-owner-stock',
          autor:'dueno@example.com',filas:[{nombre:'Registro exclusivo '+local,local:7,fabrica:2,total:9},
            {nombre:'Agotado QA '+local,local:0,fabrica:0,total:0,sin:true}]
        });
      }
    });
    cy.get('#au-email').clear().type(email);
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
    it(local+': distingue turno en curso, histórico y valores reales del servidor aunque haya borrador',()=>{
      setup();
      abrirLocal(local);
      cy.get('#view [data-go="h-qa-owner-stock"]').click();
      // Menú simplificado: estas funciones no forman parte de Stock Local.
      cy.get('#view [data-act="f-zero"]').should('not.exist');
      cy.get('#view [data-go="ingreso"]').should('not.exist');
      cy.get('#view [data-act="tot-nombre"]').should('not.exist');
      cy.get('#view [data-act="print"]').should('not.exist');
      cy.get('#view [data-act="f-copy"]').should('not.exist');
      // «Actualizar datos» no va en la barra; sí la línea de sincronización con «Actualizar ahora».
      cy.get('#view .bar [data-act="f-refresh"]').should('not.exist');
      cy.get('#view #gl-stock-sync').should('contain.text','Datos del servidor al día');
      cy.get('#view #gl-stock-sync [data-act="f-refresh"]').should('contain.text','Actualizar ahora');
      cy.get('#savebar').should('not.be.visible');
      cy.get('#fl-f-owner-qa').should('have.value','7').and('be.disabled');
      cy.get('#view .gl-stock-server-status').should('contain.text','Vista confirmada del servidor');
      cy.get('#view [data-act="stock-local-draft-view"]').click();
      cy.get('#fl-f-owner-qa').should('be.enabled').clear().type('13');
      cy.get('#fl-f-owner-qa').should('have.value','13');
      cy.get('#view [data-act="stock-local-draft-server"]').click();
      cy.get('#fl-f-owner-qa').should('have.value','7').and('be.disabled');
      cy.get('#view .gl-stock-server-status').should('contain.text','Vista confirmada del servidor');
      cy.get('#view [data-act="stock-local-history"]').click();
      cy.get('#view [data-stock-open-turn]').should('contain.text','Turno en curso');
      cy.get('#view [data-act="stock-local-open-toggle"]').click();
      cy.get('#view [data-stock-open-turn]').should('contain.text','Stock Local '+local);
      cy.get('#view [data-act="hist-toggle"]').first().click();
      cy.get('#view').should('contain.text','Registro exclusivo '+local);
      cy.get('#view').should('not.contain.text','Registro exclusivo '+(local==='munro'?'torcuato':'munro'));
    });
    it(local+': gerente edita sin reconstrución de filas y dueña recibe dato confirmado',()=>{
      setup(local==='munro'?'gerente.munro@example.com':'gerente.torcuato@example.com');
      cy.get('#app',{timeout:15000}).should('be.visible');
      cy.get('#snav [data-go="h-qa-owner-stock"]').click({force:true});
      cy.get('#view .xl').then($el=>cy.window().then(w=>{w.__stockLocalRoot=$el[0];}));
      cy.get('#fl-f-owner-qa').should('be.enabled').clear().type('11');
      cy.get('#view #gl-stock-auto-status',{timeout:20000}).should('contain.text','Guardado automáticamente');
      cy.get('#view .xl').then($el=>cy.window().then(w=>{
        expect($el[0]).to.equal(w.__stockLocalRoot);
        expect(w.__rows.find(x=>x.col===local+'/fabrica'&&x.id==='f-owner-qa').data.local).to.equal(11);
        expect(w.__rows.filter(x=>x.col===local+'/conteos').length).to.equal(1);
      }));
    });
    it(local+': autoguardado edita una fila sin mover el formulario ni duplicar historial',()=>{
      setup();
      abrirLocal(local);
      cy.get('#view [data-go="h-qa-owner-stock"]').click();
      cy.get('#view [data-act="stock-local-draft-view"]').click();
      cy.get('#view .xl').then($el=>{cy.window().then(w=>{w.__stockLocalRoot=$el[0];});});
      cy.get('#fl-f-owner-qa').clear().type('15');
      cy.get('#view #gl-stock-auto-status',{timeout:20000}).should('contain.text','Guardado automáticamente');
      cy.get('#fl-f-owner-qa').should('have.value','15');
      cy.get('#view .xl').then($el=>cy.window().then(w=>{
        expect($el[0]).to.equal(w.__stockLocalRoot);
        expect(w.__rows.find(x=>x.col===local+'/fabrica'&&x.id==='f-owner-qa').data.local).to.equal(15);
        expect(w.__rows.filter(x=>x.col===local+'/conteos').length).to.equal(1);
      }));
      cy.get('#view [data-act="stock-local-close"]').click();
      cy.get('#ov [data-act="stock-local-close-ok"]').click();
      cy.get('#toast',{timeout:20000}).should('contain.text','Guardado exitoso');
      cy.window().then(w=>{
        const closed=w.__rows.filter(x=>x.col===local+'/conteos'&&x.data?.turnoCerrado);
        expect(closed).to.have.length(1);
        expect(closed[0].data.filas.some(x=>x.pid==='f-owner-qa'&&x.local===15)).to.equal(true);
      });
    });
    it(local+': cerrar turno registra historial y muestra Guardado exitoso',()=>{
      setup();
      abrirLocal(local);
      cy.get('#view [data-go="h-qa-owner-stock"]').click();
      cy.get('#view [data-act="stock-local-close"]').should('be.enabled').click();
      cy.get('#ov [data-act="stock-local-close-ok"]').should('be.visible').click();
      cy.get('#toast',{timeout:15000}).should('contain.text','Guardado exitoso');
      cy.get('#view').should('contain.text','Turno cerrado');
      cy.get('#view [data-act="stock-local-history"]').click();
      // Después del cierre la dueña sigue viendo el estado actual del servidor, además del turno archivado.
      cy.get('#view [data-stock-open-turn]').should('contain.text','Estado actual').and('contain.text','Después del cierre');
      cy.get('#view').should('contain.text','Turno cerrado');
    });
    it(local+': el historial muestra los productos sin stock del turno en curso y de los guardados',()=>{
      setup();
      abrirLocal(local);
      cy.get('#view [data-go="h-qa-owner-stock"]').click();
      cy.get('#view [data-act="stock-local-history"]').click();
      cy.get('#view [data-stock-open-turn]').should('contain.text','sin stock');
      cy.get('#view [data-stock-open-sin]').should('contain.text','Sin stock QA '+local);
      cy.get('#view [data-act="stock-local-open-toggle"]').click();
      cy.get('#view [data-stock-open-turn] .gl-sin').should('contain.text','Sin stock QA '+local).and('contain.text','Sin stock');
      cy.get('#view [data-hist-sin]').should('contain.text','Agotado QA '+local);
    });
  }
});
