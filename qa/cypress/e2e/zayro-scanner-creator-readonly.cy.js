/* global Cypress,cy,describe,it,expect */
/* Visor real en navegador con datos ficticios. No toca la base de producción. */
const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
const sections=[
 ['caja','caja','Caja'],
 ['ventas','sistema_venta','Sistema de ventas'],
 ['stock','stock','Stock de productos'],
 ['precios','precios','Precios'],
 ['pedidos','pedidos','Pedidos'],
 ['dispositivos','dispositivos','Dispositivos']
];
const fixture={
 gestlok_pilot_products:[{id:'1',name:'Fragancia femenina muestra',sku:'SKU-17',category:'Perfumes',
  cost_price:3000,markup_percent:80,manual_sale_price:7500,unit_price:7000,stock_quantity:6,in_stock:true,active:true}],
 gestlok_pilot_pos_sales:[{id:'1',total:7500,payment_method:'transferencia',created_at:'2026-11-08T14:00:00Z'}],
 gestlok_pilot_orders:[{id:'1',day:'2026-11-08',customer:'Cliente de prueba',
  status:'preparado',items:[{name:'Fragancia femenina muestra',quantity:1}]}],
 gestlok_pilot_order_closures:[{id:'1',day:'2026-11-07',closed_at:'2026-11-07T21:00:00Z'}],
 gestlok_pilot_records:[{id:'1',module:'finanzas',title:'Ingreso manual',
  direction:'ingreso',amount:7500,occurred_on:'2026-11-08'}],
 gestlok_scanner_payment_methods:[{method_id:'transferencia',label:'Transferencia',enabled:true}],
 gestlok_pilot_audit:[{id:1,module:'stock',action:'actualizado',at:'2026-11-08T14:00:00Z'}]
};
function installScript(path){
 return cy.window().then(win=>new Cypress.Promise((resolve,reject)=>{
  const el=win.document.createElement('script');
  el.src=path;
  el.onload=()=>resolve();
  el.onerror=()=>reject(Error('No se cargó '+path));
  win.document.head.append(el);
 }));
}
function fakeDB(win){
 const log=[];
 const db={from(table){
   log.push({op:'select',table});
   const list=fixture[table];
   if(!list)throw Error('Tabla inesperada '+table);
   const b={
    select(){return b;},eq(column,value){
     if(column!=='tenant_id'||value!==TENANT)throw Error('Intento de consultar otro tenant');
     return b;
    },order(){return b;},limit(){return Promise.resolve({data:list,error:null});}
   };
   return b;
  }};
 win.__zayroDbLog=log;
 return db;
}
describe('Creadora · Microapps reales de ZAYRO solo lectura',()=>{
 Cypress.on('uncaught:exception',err=>{
  if(err.message.includes('Minified React error #418'))return false;
 });
 it('abre las seis secciones sin operaciones de caja, cobro, producto ni pedido',()=>{
  cy.viewport(390,844);
  cy.visit('/zayro/');
  installScript('/stock/gestlok-scanner-readonly.js');
  cy.window().then(win=>{
   let valid=0;
   return win.GestLokScannerReadOnly.load(fakeDB(win),TENANT,async()=>{valid++;})
    .then(state=>{
      expect(valid).to.eq(2);
      expect(win.__zayroDbLog).to.have.length(7);
      win.__zayroDemoState=state;
    });
  });
  sections.forEach(([,code,label])=>{
   cy.window().then(win=>{
    let root=win.document.querySelector('#zayro-creator-test-view');
    if(!root){root=win.document.createElement('section');root.id='zayro-creator-test-view';win.document.body.append(root);}
    root.innerHTML=win.GestLokScannerReadOnly.render(code,win.__zayroDemoState);
   });
   cy.get('#zayro-creator-test-view').should('contain.text',label)
    .and('contain.text','Solo lectura');
   cy.get('#zayro-creator-test-view button,#zayro-creator-test-view input,#zayro-creator-test-view form').should('not.exist');
  });
  cy.get('#zayro-creator-test-view').should('contain.text','Transferencia');
  cy.window().then(win=>expect(win.__zayroDbLog.every(x=>x.op==='select')).to.eq(true));
 });
 it('el menú de creadora habilita los seis botones pero nunca los de escritura',()=>{
  cy.visit('/zayro/');
  installScript('/stock/gestlok-scanner-menu.js');
  cy.window().then(win=>{
    win.__zayroSectionsVisited=[];
    win.GestLokPilot={readonlyAuthorized:()=>true,readonlySection:code=>win.__zayroSectionsVisited.push(code),authorized:()=>false};
    const host={S:{me:{tenant_id:TENANT},local:'local'},role:()=> 'creadora',isCreadora:()=>true};
    const ctx={tenant_id:TENANT,role:'dueno',company_name:'ZAYRO'};
    const root=win.document.createElement('div');root.id='zayro-test-menu';root.innerHTML=win.GestLokScannerMenu.home(ctx,host);
    win.document.body.append(root);
  });
  cy.get('#zayro-test-menu [data-scanner-readonly]').should('have.length',6)
    .each(button=>cy.wrap(button).should('not.be.disabled').click());
  cy.window().then(win=>expect(win.__zayroSectionsVisited).to.deep.eq(sections.map(x=>x[1])));
  cy.get('#zayro-test-menu [data-pilot-caja],#zayro-test-menu [data-pilot-pos],#zayro-test-menu [data-zayro-open]').should('not.exist');
 });
});
