/* global Cypress, describe, it, cy */
const key="sb-vgsepaaewbctjsjcpeta-auth-token";
const user={id:"00000000-0000-4000-8000-000000000001",email:"manager@example.invalid",aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const token="eyJhbGciOiJIUzI1NiJ9."+btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600}))+".synthetic";
const tabla=(value)=>({values:[["Colaborador","Lunes"],["Persona ficticia",value]],backgrounds:[["#1e2f52","#1e2f52"],["#ffffff","#ffffff"]],colors:[["#ffffff","#ffffff"],["#222222","#222222"]],headerRows:1,merges:[]});
describe("Munro: Resumen y Semana se ven una sola vez por vista",()=>{
 Cypress.on("uncaught:exception",e=>{if(e.message.includes("Minified React error #418"))return false;});
 it("muestra el archivo manual arriba, separa En vivo de Historial y conserva ambas hojas",()=>{
  let archived=false;
  const now=new Date().toISOString();
  const original=[{desde:"2026-11-02",hasta:"2026-11-08",archivo_id:"00000000-0000-4000-8000-000000000002",filas:[{colaborador:"Persona ficticia",total:"40"}],recibido_at:now,actualizaciones:1,pagos:{}}];
  const updated={desde:"2026-11-09",hasta:"2026-11-15",tablas:{Resumen:tabla("40:00"),Semana:tabla("18:00–23:30")},actualizado_at:now};
  cy.intercept("**/*.supabase.co/**",req=>{
   const path=req.url;
   if(path.includes("/auth/v1/user"))return req.reply(user);
   if(path.includes("/rpc/rm_app_me"))return req.reply({...user,user_id:user.id,display_name:"Persona ficticia",status:"approved",role:null,gestlok_gerente:{local_ids:["munro"]}});
   if(path.includes("/rpc/rm_app_branch_schedule_links"))return req.reply([]);
   if(path.includes("/rpc/rm_horarios_locales"))return req.reply([{local_id:"munro",local_name:"Munro",conectado:true,ultimo_envio_at:now,puede_administrar:true}]);
   if(path.includes("/rpc/rm_horarios_en_vivo"))return req.reply(updated);
   if(path.includes("/rpc/rm_horarios_historial"))return req.reply(archived?[{...original[0],desde:updated.desde,hasta:updated.hasta,archivo_id:"00000000-0000-4000-8000-000000000003"},...original]:original);
   if(path.includes("/rpc/rm_horarios_tabla"))return req.reply({tabla:req.body.p_hoja==="Resumen"?tabla("40:00"):tabla("18:00–23:30"),filas:[{colaborador:"Persona ficticia",total:"40"}],tiene_pdf:true});
   if(path.includes("/rpc/rm_horarios_archivar_manual")){
    expect(req.body.p_local).to.eq("munro");
    expect(req.body.p_desde).to.eq(updated.desde);
    archived=true;
    return req.reply({ok:true,archivada:false,archivo_id:"00000000-0000-4000-8000-000000000003"});
   }
   return req.reply([]);
  });
  cy.visit("/empleados/",{onBeforeLoad(w){w.localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:"synthetic",token_type:"bearer",expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));}});
  cy.get(".gl-gerente__sidebar").contains("button","Horarios",{timeout:15000}).click();
  cy.get('[aria-label="Elegir vista de horarios de Munro"]').contains("button","En vivo").should("have.attr","aria-pressed","true");
  cy.get('section[aria-label="Resumen en vivo"]').should("be.visible");
  cy.get('section[aria-label="Semana en vivo"]').should("be.visible");
  cy.get('section[aria-label="Hoja Resumen archivada"]').should("not.exist");
  cy.get('section[aria-label="Hoja Semana archivada"]').should("not.exist");
  cy.contains("button","Enviar a historial").should("be.visible").and("not.be.disabled");
  cy.get('[aria-label="Elegir vista de horarios de Munro"]').contains("button","Historial").click();
  cy.get('section[aria-label="Hoja Resumen archivada"]').should("be.visible");
  cy.get('section[aria-label="Hoja Semana archivada"]').should("be.visible");
  cy.get('section[aria-label="Resumen en vivo"]').should("not.exist");
  cy.get('section[aria-label="Semana en vivo"]').should("not.exist");
  cy.get('[aria-label="Elegir vista de horarios de Munro"]').contains("button","En vivo").click();
  cy.window().then(w=>cy.stub(w,"confirm").returns(true));
  cy.contains("button","Enviar a historial").click();
  cy.contains("button","Ya enviada al historial").should("be.visible").and("be.disabled");
 });
});
