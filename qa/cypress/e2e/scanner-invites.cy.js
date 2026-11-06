/* global Cypress, cy, describe, it, expect */
const tenant='11111111-2222-4333-8444-555555555555';
const token='a'.repeat(64);
const toggles=(...yes)=>Object.fromEntries(['caja','ventas','stock','precios','historial','reportes'].map(key=>[key,yes.includes(key)]));
describe('Scanner · invitaciones',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 it('guarda permisos separados y prepara el WhatsApp sin enviar mensajes de prueba',()=>{
  const rows=[];
  cy.task('mockSupabase').then(body=>cy.intercept('GET','**/vendor/supabase.js',{headers:{'content-type':'application/javascript'},body:body.replaceAll('cb0dc04a-9a13-434f-a3d0-47f1d8f39670',tenant)}));
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/');
  cy.get('.gl-intro',{timeout:15000}).should('not.be.visible');
  cy.window().its('GestLokSupabase',{timeout:15000}).should('exist').then(db=>{
   const from=db.from.bind(db),rpc=db.rpc.bind(db);
   db.auth.getUser=async()=>({data:{user:{id:'dueno-prueba'}},error:null});
   db.from=table=>{
    if(!['gestlok_pilot_access','gestlok_scanner_invites'].includes(table))return from(table);
    const result=()=>({data:table==='gestlok_pilot_access'?{enabled:true,plan_code:'scanner',owner_uid:'dueno-prueba'}:rows,error:null});
    const q={select:()=>q,eq:()=>q,order:()=>q,maybeSingle:()=>Promise.resolve(result()),then:(ok,no)=>Promise.resolve(result()).then(ok,no)};
    return q;
   };
   db.rpc=async(name,args)=>{
    if(name==='gestlok_scanner_caja_options')return {data:{options:[]}};
    if(name==='gestlok_scanner_invite_save'){
     const id=args.p_id||String(rows.length+1);
     const row={id,first_name:args.p_first,last_name:args.p_last,phone:args.p_phone,invited_email:args.p_email,permissions:args.p_permissions,status:rows.find(x=>x.id===id)?.status||'draft'};
     const idx=rows.findIndex(x=>x.id===id);if(idx<0)rows.push(row);else rows[idx]=row;
     return {data:id};
    }
    if(name==='gestlok_scanner_invite_issue'){rows.find(r=>r.id===args.p_id).status='pending';return {data:token};}
    if(name==='gestlok_scanner_invite_revoke'){rows.find(r=>r.id===args.p_id).status='revoked';return {};}
    return rpc(name,args);
   };
  });
  cy.get('#au-email').type('dueno@example.com');cy.get('#au-pass').type('secreto1',{log:false});cy.get('#au-in button[type="submit"]').click();
  cy.contains('#hub button','Invitar personas').click();
  cy.get('dialog[open]').should('contain.text','Nuevo invitado');
  for(const name of ['Ana','Luis']){
   cy.get('dialog [data-invite-profile][data-id=""]').within(()=>{
    cy.get('[name=first]').type(name);cy.get('[name=last]').type('Prueba');cy.get('[name=phone]').type('+5491100000000');cy.get('[name=email]').type(name.toLowerCase()+'@example.com');
    cy.get('[role=switch]').should('have.length',6);cy.get('[role=switch]').should('be.disabled');cy.contains('button','Enviar invitación por WhatsApp').click();
   });
   cy.contains('dialog summary',name+' Prueba').should('exist');
  }
  cy.contains('dialog summary','Ana Prueba · Pendiente').click();
  cy.get('[data-invite-profile][data-id="1"]').within(()=>{
   cy.get('[name=stock]').check();cy.get('[name=ventas]').should('not.be.checked');
   cy.contains('button','Guardar perfil').click();
  });
  cy.contains('dialog a','Abrir WhatsApp para compartir').should('have.attr','href').then(href=>{
   const url=new URL(href);expect(url.origin).to.equal('https://wa.me');expect(url.pathname).to.equal('/');expect(url.searchParams.get('text')).to.include('/scanner-invitado/#'+token);
  });
  cy.contains('dialog summary','Ana Prueba · Pendiente').click();
  cy.get('[data-invite-profile][data-id="1"] [data-invite-revoke]').click();
  cy.contains('dialog summary','Ana Prueba · Revocado').should('exist');
  cy.contains('dialog summary','Luis Prueba').click();
  cy.get('[data-invite-profile][data-id="2"] [name=ventas]').should('not.be.checked');
  cy.get('[data-invite-profile][data-id="2"] [name=stock]').should('not.be.checked');
 });
 it('canjea al entrar y muestra únicamente los módulos concedidos',()=>{
  const session={user:{id:'invitado-ficticio'}};
  const permissions=toggles('stock','reportes');
  cy.intercept('GET','**/vendor/supabase.js',{headers:{'content-type':'application/javascript'},body:`
   let accepted=false;
   window.supabase={createClient:()=>({auth:{
    onAuthStateChange:fn=>fn('INITIAL_SESSION',null),getSession:async()=>({data:{session:${JSON.stringify(session)}}}),
    signInWithPassword:async()=>({data:{session:${JSON.stringify(session)}}})
   },rpc:async(name,args)=>{
    if(name==='gestlok_scanner_invite_redeem'){if(args.p_token!=='${token}')throw Error('bad token');accepted=true;return {data:'${tenant}'};}
    if(name==='gestlok_scanner_guest_context')return {data:accepted?{tenant_id:'${tenant}',first_name:'Ana',permissions:${JSON.stringify(permissions)}}:null};
    if(name==='gestlok_scanner_guest_module'&&args.p_module==='stock')return {data:[{id:'p1',name:'Producto de prueba',stock_quantity:8}]};
    return {data:[]};
   }})};`});
  cy.intercept('**/*.supabase.co/**',{forceNetworkError:true});
  cy.visit('/scanner-invitado/#'+token);
  cy.get('#guest-login [name=email]').type('ana@example.com');cy.get('#guest-login [name=password]').type('secreto1',{log:false});cy.contains('#guest-login button','Ingresar').click();
  cy.get('#guest-modules button').should('have.length',2);
  cy.get('#guest-modules').should('not.contain.text','Caja').and('not.contain.text','Precios');
  cy.contains('#guest-modules button','Stock').click();
  cy.contains('#guest-content','Producto de prueba').should('be.visible');
  cy.location('hash').should('equal','');
 });
});
