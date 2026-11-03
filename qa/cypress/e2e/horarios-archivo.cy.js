/* global Cypress, describe, it, cy */
const key='sb-vgsepaaewbctjsjcpeta-auth-token';
const user={id:'00000000-0000-4000-8000-000000000001',email:'archivo@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const token='eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600}))+'.synthetic';
describe('Archivo visual de horarios',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 for(const admin of [true,false]) for(const structured of [true,false]) it(`Tablas históricas y pagos; administrador=${admin}, tablas=${structured}`,()=>{
  let paid=true;
  cy.intercept('**/*.supabase.co/**',req=>{
   const path=req.url;
   if(path.includes('/auth/v1/user'))return req.reply(user);
   if(path.includes('/rpc/rm_app_me'))return req.reply({...user,user_id:user.id,display_name:'Persona ficticia',status:'approved',role:null,gestlok_gerente:{local_ids:['munro']}});
   if(path.includes('/rpc/rm_app_branch_schedule_links'))return req.reply([]);
   if(path.includes('/rpc/rm_horarios_locales'))return req.reply([{local_id:'munro',local_name:'Munro',conectado:true,ultimo_envio_at:'2026-11-02T11:00:00Z',puede_administrar:admin}]);
   if(path.includes('/rpc/rm_horarios_historial'))return req.reply([{desde:'2026-10-19',hasta:'2026-10-25',archivo_id:'00000000-0000-4000-8000-000000000002',filas:[{colaborador:'Persona ficticia',total:'40'}],recibido_at:'2026-11-02T11:00:00Z',actualizaciones:1,pagos:admin?{'Persona ficticia':{pagado:paid}}:{}}]);
   if(path.includes('/rpc/rm_horarios_tabla')){
    expect(req.body.p_local).to.eq('munro');
    const values=req.body.p_hoja==='Semana'?[['Colaborador','Lunes','Martes'],['Persona ficticia','18:00–23:30','OFF']]:[['Colaborador','Puesto','Cobra por','Trabajado','OFF','Feriado','Ausentes','Vacaciones','Total a liquidar','Observaciones'],['Persona ficticia','Cocina','Horas','40','1','0','0','0','40','Histórico']];
    return req.reply({filas:[{colaborador:'Persona ficticia',total:'40'}],tabla:structured?{values,headerRows:1,merges:[],backgrounds:values.map((r,i)=>r.map((_,j)=>i===0?'#1e2f52':j===2?'#fff2cc':'#ffffff')),colors:values.map(r=>r.map(()=>'#111827'))}:null});
   }
   if(path.includes('/rpc/rm_horarios_archivo')){
    expect(req.body.p_local).to.eq('munro');
    expect(['Resumen','Semana']).to.include(req.body.p_hoja);
    return req.reply({pdf:btoa('%PDF-1.4\nsynthetic fixture\n%%EOF')});
   }
   if(path.includes('/rpc/rm_horarios_marcar_pago')){paid=req.body.p_pagado;return req.reply({ok:true,pagado:paid});}
   return req.reply([]);
  });
  cy.visit('/empleados/',{onBeforeLoad(w){w.localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'synthetic-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));}});
  cy.get('.gl-gerente__sidebar').contains('button','Horarios',{timeout:15000}).click();
  cy.get('section[aria-label="Hoja Resumen archivada"] table').should('be.visible').contains('Persona ficticia');
  cy.get('section[aria-label="Hoja Resumen archivada"] th').should('have.length',10);
  cy.get('section[aria-label^="Hoja"] iframe').should('not.exist');
  if(structured) {
   cy.get('section[aria-label="Hoja Semana archivada"] table').contains('18:00–23:30').should('be.visible');
   cy.get('section[aria-label="Hoja Semana archivada"] td').contains('OFF').should('have.css','background-color','rgb(255, 242, 204)');
   cy.get('section[aria-label="Hoja Semana archivada"] th').first().should('have.css','background-color','rgb(30, 47, 82)');
  } else cy.contains('Su información original se conserva en el PDF descargable.').should('be.visible');
  cy.get('section[aria-label="Hoja Resumen archivada"]').then($r=>{
   cy.get('section[aria-label="Hoja Semana archivada"]').then($s=>expect($r[0].compareDocumentPosition($s[0])&4).to.eq(4));
  });
  cy.get('button[aria-label="Descargar PDF de Resumen"]').should('be.visible');
  cy.get('button[aria-label="Descargar PDF de Semana"]').should('be.visible').click();
  if(admin){
   cy.get('details[aria-label^="Pagos de la semana"]').should('not.have.attr','open');
   cy.get('details summary').click();cy.contains('button','Pagado').should('be.visible');
   cy.get('details summary').click();cy.get('details summary').click();
   cy.contains('button','Pagado').should('have.attr','aria-pressed','true');
  } else cy.contains('Pagos de la semana').should('not.exist');
  cy.viewport(390,844);
  cy.get('section[aria-label="Hoja Semana archivada"]').should('be.visible');
  cy.document().then(doc=>expect(doc.documentElement.scrollWidth).to.be.at.most(390));
 });
});
