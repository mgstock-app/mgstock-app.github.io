/* global Cypress, describe, it, cy, expect */
// Prueba UI aislada: todas las operaciones de provisión se interceptan en memoria.
function launch(){
 cy.task('mockSupabase').then(fake=>{
   cy.intercept('GET','**/vendor/supabase.js',{statusCode:200,headers:{'content-type':'application/javascript'},body:fake}).as('fake');
 });
 cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
 cy.visit('/');
 cy.wait('@fake');
 cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
 cy.get('#au-in').should('be.visible');
}
describe('GestLok: asistente exclusivo de preparación',()=>{
  Cypress.on('uncaught:exception',err=>{
    if(err.message.includes('Minified React error #418'))return false;
  });
  it('creadora configura negocio y 320 productos por lotes ficticios',()=>{
    cy.viewport(390,844);
    launch();
    cy.get('#au-email').type('kmu15lopez@gmail.com');
    cy.get('#au-pass').type('secreto1',{log:false});
    cy.get('#au-in button[type="submit"]').click();
    cy.get('[data-act="admin-preparar-empresa"]').should('be.visible');
    cy.window().then(w=>{
      const tenant='55555555-5555-4555-8555-555555555555',local='loc-test-ficticio';
      const companies=[],calls=[];
      w.__creatorCalls=calls;
      w.GestLokSupabase={
        rpc:async(name,args)=>{
          calls.push({name,args});
          if(name==='gestlok_creator_list_companies')return {data:companies,error:null};
          if(name==='gestlok_creator_prepare_company_named'){
            const entry={tenant_id:tenant,local_id:local,nombre:args.p_name,local:args.p_local_name,
              code:'neg-test-ficticio',correo_dueno:args.p_owner_email,modalidad:args.p_mode,productos:0};
            companies.push(entry);
            return {data:{tenant_id:tenant,local_id:local,empresa:args.p_name,local:args.p_local_name,
              code:entry.code,propietario:args.p_owner_email},error:null};
          }
          if(name==='gestlok_creator_import_products'){
            companies[0].productos+=args.p_rows.length;
            return {data:{procesados:args.p_rows.length},error:null};
          }
          return {data:null,error:{message:'RPC desconocida'}};
        }
      };
      cy.stub(w,'confirm').returns(true);
    });
    cy.get('[data-act="admin-preparar-empresa"]').click();
    cy.get('#gl-creator-preparacion').should('be.visible');
    cy.get('#gl-create-company input[name="empresa"]').type('Librería de prueba');
    cy.get('#gl-create-company input[name="dueno"]').type('Dueña Ficticia');
    cy.get('#gl-create-company input[name="email"]').type('cliente.nuevo@example.invalid');
    cy.get('#gl-create-company input[name="local"]').type('Depósito ficticio');
    cy.get('#gl-create-company select[name="modo"]').select('mixta');
    cy.get('#gl-create-company button[type="submit"]').click();
    cy.get('#gl-creator-preparacion').should('contain.text','Empresa preparada');
    const csv=['sku,nombre,categoria,stock,minimo,precio,costo,proveedor,unidad,ubicacion'];
    for(let i=0;i<320;i++)csv.push('ITEM_'+i+',Producto '+i+',Libros,450,80,9500,6500,Proveedor Local,unidad,Estante 1');
    cy.get('#gl-creator-file').selectFile({contents:Cypress.Buffer.from(csv.join('\n')),fileName:'productos.csv',mimeType:'text/csv'});
    cy.get('#gl-creator-preparacion').should('contain.text','320 productos listos');
    cy.get('[data-creator-import]').should('be.enabled').click();
    cy.get('#gl-creator-preparacion').should('contain.text','320 productos');
    cy.window().its('__creatorCalls').should(calls=>{
      const req=calls.filter(x=>x.name==='gestlok_creator_import_products');
      expect(req).to.have.length(3);
      expect(calls.find(x=>x.name==='gestlok_creator_prepare_company_named').args.p_owner_name).to.eq('Dueña Ficticia');
      expect(req.map(x=>x.args.p_rows.length)).to.deep.equal([150,150,20]);
      expect(req.every(x=>x.args.p_tenant==='55555555-5555-4555-8555-555555555555')).to.eq(true);
    });
    cy.get('[data-creator-close]').click();
    cy.get('#hub').should('contain.text','Panel administrativo');
  });
  it('gerente no tiene acceso al asistente',()=>{
    launch();
    cy.get('#au-email').type('gerente.munro@example.com');
    cy.get('#au-pass').type('secreto1',{log:false});
    cy.get('#au-in button[type="submit"]').click();
    cy.get('[data-act="admin-preparar-empresa"]').should('not.exist');
  });
});