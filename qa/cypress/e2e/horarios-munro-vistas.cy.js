/* global Cypress, describe, it, cy, expect */
const key="sb-vgsepaaewbctjsjcpeta-auth-token";
const user={id:"00000000-0000-4000-8000-000000000001",email:"manager@example.invalid",aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const token="eyJhbGciOiJIUzI1NiJ9."+btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600}))+".synthetic";
const SEMANA="2026-11-09";
const personas=()=>Array.from({length:8},(_,i)=>({id:i+1,nombre:"",modalidad:i<3?"turno":"hora",estado:"activo"}));
const tabla=(value)=>({values:[["Colaborador","Lunes"],["Persona ficticia",value]],backgrounds:[["#1e2f52","#1e2f52"],["#ffffff","#ffffff"]],colors:[["#ffffff","#ffffff"],["#222222","#222222"]],headerRows:1,merges:[]});
function iniciar({editable=true}={}){
 let empleados=personas(),registros=[],ultimo=null;
 cy.intercept("**/*.supabase.co/**",req=>{
  const path=req.url;
  if(path.includes("/auth/v1/user"))return req.reply(user);
  if(path.includes("/rpc/rm_app_me"))return req.reply({...user,user_id:user.id,display_name:"Gerente ficticio",status:"approved",role:null,gestlok_gerente:{local_ids:["munro"]}});
  if(path.includes("/rpc/rm_app_branch_schedule_links"))return req.reply([]);
  if(path.includes("/rpc/rm_munro_horarios_obtener"))return req.reply({
   semana:req.body?.p_semana||SEMANA,personas:empleados,planillas:registros,historial:[],puede_editar:editable
  });
  if(path.includes("/rpc/rm_munro_horarios_guardar")){
   ultimo=req.body;
   const i=empleados.findIndex(x=>x.id===req.body.p_persona);
   empleados[i]={...empleados[i],nombre:req.body.p_nombre,estado:req.body.p_estado};
   const registro={id:req.body.p_persona,semana:req.body.p_semana,datos:req.body.p_datos,nombre:req.body.p_nombre,
     modalidad:empleados[i].modalidad,version:(registros.find(x=>x.id===req.body.p_persona)?.version||0)+1};
   registros=[...registros.filter(x=>x.id!==registro.id),registro];
   return req.reply({ok:true,version:registro.version,id:registro.id});
  }
  if(path.includes("/rpc/rm_munro_horarios_agregar")){
   const nuevo={id:empleados.length+1,nombre:req.body.p_nombre,modalidad:"hora",estado:"activo"};
   empleados.push(nuevo);return req.reply(nuevo);
  }
  if(path.includes("/rpc/rm_horarios_locales"))return req.reply([{local_id:"munro",local_name:"Munro",conectado:true,ultimo_envio_at:"2026-11-02T15:19:00Z",puede_administrar:false,puede_archivar:true}]);
  if(path.includes("/rpc/rm_horarios_historial"))return req.reply([{desde:"2026-10-19",hasta:"2026-10-25",archivo_id:"00000000-0000-4000-8000-000000000002",filas:[{colaborador:"Persona ficticia",total:"40"}],recibido_at:"2026-11-02T10:00:00Z",actualizaciones:1,pagos:{}}]);
  if(path.includes("/rpc/rm_horarios_tabla"))return req.reply({tabla:tabla("40:00"),filas:[{colaborador:"Persona ficticia",total:"40"}],tiene_pdf:true});
  return req.reply([]);
 });
 cy.visit("/empleados/",{onBeforeLoad(w){w.localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:"synthetic",token_type:"bearer",expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));}});
 cy.clock(new Date("2026-11-12T15:00:00Z").getTime(),["Date"]);
 cy.get(".gl-gerente__sidebar").contains("button","Horarios",{timeout:15000}).click();
 return ()=>ultimo;
}
describe("Mi Gusto Munro · Horarios nativos de colaboradores",()=>{
 Cypress.on("uncaught:exception",e=>e.message.includes("Minified React error #418")?false:undefined);
 it("muestra 3 turnos, 5 por hora y permite completar nombre, estado y entrada sin salida",()=>{
  cy.viewport(1320,900);const ultimo=iniciar();
  cy.get(".mhs-tabla tbody tr",{timeout:15000}).should("have.length",8);
  cy.get(".mhs-tabla tbody tr").eq(0).should("contain.text","Por turno");
  cy.get(".mhs-tabla tbody tr").eq(2).should("contain.text","Por turno");
  cy.get(".mhs-tabla tbody tr").eq(3).should("contain.text","Por hora");
  cy.contains("a","Abrir planilla").should("not.exist");
  cy.contains("button","Modificar").click();
  cy.get('.mhs-tabla tbody tr').first().find('input[aria-label^="Nombre del colaborador"]').type("Lucía");
  cy.get(".mhs-tabla tbody tr").first().contains("button","Refuerzo").click();
  cy.get(".mhs-tabla tbody tr").first().find('input[type="time"]').first().type("09:00");
  cy.get(".mhs-alerta").should("not.exist");
  cy.contains("button","Guardar").click();
  cy.wrap(null).should(()=>{const x=ultimo();expect(x.p_nombre).to.eq("Lucía");expect(x.p_estado).to.eq("refuerzo");});
  cy.contains("button","Agregar colaborador por hora").click();
  cy.get(".mhs-agregar input").type("Nuevo colaborador");
  cy.get(".mhs-agregar").contains("button","Agregar").click();
  cy.get(".mhs-tabla tbody tr").should("have.length",9);
  cy.get(".mhs-tabla tbody tr").last().should("contain.text","Por hora");
 });
 it("conserva el archivo antiguo de Sheets y los detalles sin mostrar el panel En vivo",()=>{
  cy.viewport(1320,900);iniciar();
  cy.get(".mhs-pestanas").contains("button","Historial").click();
  cy.contains("Historial anterior conservado").should("be.visible");
  cy.get('[aria-label="Elegir vista de horarios de Munro"]').should("not.exist");
  cy.get('section[aria-label="Hoja Resumen archivada"]',{timeout:15000}).should("be.visible");
  cy.get('section[aria-label="Hoja Semana archivada"]').should("be.visible");
  cy.get('section[aria-label="Resumen en vivo"]').should("not.exist");
  cy.get('section[aria-label="Semana en vivo"]').should("not.exist");
 });
 it("restringe las acciones cuando el permiso de escritura es falso",()=>{
  cy.viewport(1320,900);iniciar({editable:false});
  cy.contains("button","Modificar").should("not.exist");
  cy.contains("button","Agregar colaborador por hora").should("not.exist");
  cy.get(".mhs-tabla input[type=time]").first().should("be.disabled");
 });
});
