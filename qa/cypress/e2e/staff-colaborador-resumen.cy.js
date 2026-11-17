/* global describe, it, cy, expect */
// Colaborador de Mi Gusto Munro: ve el Resumen semanal de Staff en solo lectura,
// sin la pestaña Semana actual, sin editar y sin el enlace a Google Sheets.
const key="sb-vgsepaaewbctjsjcpeta-auth-token";
const user={id:"00000000-0000-4000-8000-000000000031",email:"colaborador@example.invalid",aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const token="eyJhbGciOiJIUzI1NiJ9."+btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600}))+".synthetic";
const SEMANA="2026-11-09";
const registro={id:1,semana:SEMANA,nombre:"Juli",modalidad:"turno",version:0,datos:{
  "2026-11-09":{tt_e:"19:00",tt_s:"23:40",feriado:true},
  "2026-11-11":{tt_e:"19:00",tt_s:"23:40",feriado:true},
  "2026-11-13":{tt_e:"20:00",tt_s:"23:50"},
  [SEMANA]:{feriados_habilitados:true,off:"1"}
}};

describe("Staff · colaborador de Munro",()=>{
 it("ve solo el Resumen semanal, en solo lectura y sin planilla de Excel",()=>{
  const llamadas=[];
  cy.viewport(390,900);
  cy.intercept("**/*.supabase.co/**",req=>{
   const path=req.url;
   const rpc=(path.match(/\/rpc\/([a-z_]+)/)||[])[1];
   if(rpc)llamadas.push(rpc);
   if(path.includes("/auth/v1/user"))return req.reply(user);
   if(rpc==="rm_app_me")return req.reply({...user,user_id:user.id,display_name:"Juli Ficticia",status:"approved",
     role:"employee",local_id:"munro",local_name:"Munro",organization_id:"00000000-0000-4000-8000-000000000032",sheet_id:null,owner_public_id:null,created_at:"2026-01-01T00:00:00Z"});
   if(rpc==="rm_munro_horarios_colaborador")return req.reply({semana:req.body?.p_semana||SEMANA,
     personas:[{id:1,nombre:"Juli",modalidad:"turno",estado:"activo"}],planillas:[registro],historial:[],
     puede_editar:false,solo_lectura:true,semana_cerrada:false,cierres:[],feriados:[],feriados_version:0,feriados_historial:{}});
   if(rpc==="rm_munro_horarios_obtener"||rpc==="rm_app_employee_schedule_view")
     return req.reply({message:"no debería pedirse"},403);
   return req.reply([]);
  });
  cy.clock(new Date("2026-11-12T15:00:00Z").getTime(),["Date"]);
  cy.visit("/empleados/",{onBeforeLoad(w){w.localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:"synthetic",token_type:"bearer",expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));}});
  cy.get(".employee-staff-resumen",{timeout:20000}).should("be.visible").and("contain.text","solo lectura");
  cy.get(".employee-staff-resumen .mhs-colab").should("have.length",1).first().within(()=>{
   cy.get("summary").should("contain.text","Juli");
   cy.get(".mhs-dias tbody tr").should("have.length",7);
   cy.get(".mhs-dias tbody").contains("tr","Lun 09/11").should("contain.text","19:00 a 23:40").and("contain.text","Feriado");
   cy.get(".mhs-liquidacion").should("contain.text","OFF").and("contain.text","Feriado").and("not.contain.text","OFF pagos");
   cy.get(".mhs-total-liquidacion").should("contain.text","turnos");
   cy.get("input").should("not.exist");
  });
  cy.get(".mhs-pestanas").should("not.exist");
  cy.contains("button","Modificar").should("not.exist");
  cy.contains("button","Semana finalizada").should("not.exist");
  cy.contains("Ver planilla").should("not.exist");
  cy.contains("Historial anterior conservado").should("not.exist");
  cy.document().its("documentElement.scrollWidth").should("be.lte",392);
  cy.wrap(null).should(()=>{
   expect(llamadas).to.include("rm_munro_horarios_colaborador");
   expect(llamadas).not.to.include("rm_munro_horarios_obtener");
   expect(llamadas).not.to.include("rm_app_employee_schedule_view");
  });
 });
});
