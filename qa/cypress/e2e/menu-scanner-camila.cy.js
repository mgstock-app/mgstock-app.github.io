/* global Cypress, cy, describe, it */
// Regresión: la creadora observa el Plan Scanner real de Camila y NO el menú general.
// Datos ficticios: el navegador usa Supabase simulado y no modifica empresas.
const CAMI='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
describe('Menú de la perfumería Camila · Plan Scanner y ZAYRO',()=>{
 Cypress.on('uncaught:exception',error=>{
  if(error.message.includes('Minified React error #418'))return false;
 });
 it('al entrar como creadora muestra solo las microapps del Plan Scanner, sin menú de Mi Gusto',()=>{
  cy.viewport(1280,900);
  // Ampliar solamente esta prueba con RLS Scanner simulado (sin datos reales).
  // El mock general documenta otros locales; acá verificamos las 6 secciones.
  const scannerMock=`
;(function(){
 const old=window.supabase.createClient.bind(window.supabase);
 window.supabase.createClient=function(){
  const client=old(...arguments),from=client.from.bind(client);
  const owner='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3';
  const fixtures={
   gestlok_pilot_access:[{enabled:true,owner_uid:owner,plan_code:'scanner',pos_live_enabled:true}],
   gestlok_pilot_products:[{id:'p1',name:'Perfume de muestra',category:'Unisex',sku:'Z1',cost_price:3000,markup_percent:80,unit_price:7000,manual_sale_price:7500,stock_quantity:5,active:true,in_stock:true}],
   gestlok_pilot_pos_sales:[{id:'s1',total:7500,payment_method:'transferencia',created_at:'2026-11-08T15:00:00Z'}],
   gestlok_pilot_orders:[{id:'o1',day:'2026-11-08',customer:'Cliente ficticio',status:'pendiente',items:[]}],
   gestlok_pilot_order_closures:[],gestlok_pilot_records:[],
   gestlok_scanner_payment_methods:[{method_id:'transferencia',label:'Transferencia',enabled:true}],
   gestlok_pilot_audit:[]
  };
  client.auth.getUser=async()=>({data:{user:{id:'c684640a-c594-44b7-a41f-bac07eef4c3b',email:'kmu15lopez@gmail.com'}},error:null});
  client.from=function(table){
   if(!(table in fixtures))return from(table);
   const st={single:false};
   const b={select(){return b;},eq(){return b;},order(){return b;},limit(){return b;},
     maybeSingle(){st.single=true;return b;},
     then(res,rej){const data=st.single?(fixtures[table][0]||null):fixtures[table];return Promise.resolve({data,error:null}).then(res,rej);}
   };
   return b;
  };
  return client;
 };
})();
`;
  cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{
   statusCode:200,headers:{'content-type':'application/javascript'},body:body+scannerMock
  }).as('fake'));
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/');cy.wait('@fake');
  cy.get('.gl-intro',{timeout:14000}).should('not.be.visible');
  cy.window().then(w=>{
   w.__dashboard=true;
   w.__tenantOverride=CAMI;
   w.__companyOverride='Perfumes';
  });
  cy.get('#au-email').type('kmu15lopez@gmail.com');
  cy.get('#au-pass').type('secreto1',{log:false});
  cy.get('#au-in button[type="submit"]').click();
  cy.get('.gl-ch-nav [data-ch-tab="locales"]',{timeout:18000}).click();
  cy.get('#hub .gl-company-folder')
   .filter((_,e)=>!!e.querySelector('[data-act="local"][data-id="munro"]')).first().as('cami');
  cy.get('@cami').find('summary').click();
  cy.get('@cami').find('[data-act="local"][data-id="munro"]').click();
  cy.get('#snav',{timeout:18000}).should('be.visible');
  cy.get('#snav [data-scanner-section="ventas"]').should('be.visible').and('not.be.disabled').and('have.attr','data-scanner-readonly','ventas');
  cy.get('#snav [data-scanner-section="stock"]').should('be.visible');
  cy.get('#snav').should('contain.text','Precios').and('contain.text','Sistema de ventas');
  cy.get('#snav').should('not.contain.text','Proveedores')
    .and('not.contain.text','Reclamos Internos')
    .and('not.contain.text','Vencimientos')
    .and('not.contain.text','Administración de local')
    .and('not.contain.text','Stock Local');
  cy.get('#view .gl-scanner-private-home').should('be.visible')
    .and('contain.text','Plan Scanner').and('contain.text','ZAYRO');
  cy.get('#view').should('not.contain.text','Administrar a los empleados')
    .and('not.contain.text','Administrar mi empresa');
  cy.get('#view .gl-scanner-private-card').should('have.length',6).and('not.be.disabled');
  cy.get('#snav [data-scanner-readonly="ventas"]').click();
  cy.get('#gl-pilot-panel').should('be.visible').and('contain.text','Solo lectura');
  cy.get('#gl-pilot-panel [data-pilot-readonly-tab]').should('have.length',6);
  cy.get('#gl-pilot-panel [data-pilot-readonly-tab="stock"]').click();
  cy.get('#gl-pilot-panel').should('contain.text','Perfume de muestra');
  cy.get('#gl-pilot-panel [data-pilot-new],#gl-pilot-panel [data-pilot-delete],#gl-pilot-panel [data-pilot-caja]').should('not.exist');
  cy.get('#gl-pilot-panel [data-pilot-close]').click();
  cy.get('#view a[href="/zayro/"]').should('have.attr','target','_blank');
  cy.get('#gl-edit-menu').should('not.exist');
  cy.get('#btn-ajustes').should('not.be.visible');
  cy.get('#gl-soporte-whatsapp').should('be.visible');
 });
});
