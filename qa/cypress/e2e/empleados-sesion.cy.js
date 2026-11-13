/* global Cypress, describe, it, cy */
const key = 'sb-vgsepaaewbctjsjcpeta-auth-token';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'gerente@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})) + '.synthetic';
function setup(local){
 cy.intercept('**/*.supabase.co/**', req=>{
  if(req.url.includes('/auth/v1/user')){expect(req.headers.authorization).to.eq('Bearer '+token);req.reply(user);return;}
  if(req.url.includes('/rest/v1/rpc/rm_app_me')){expect(req.headers.authorization).to.eq('Bearer '+token);req.reply({...user,user_id:user.id,display_name:'Gerente de prueba',status:'approved',role:null,gestlok_gerente:{local_ids:[local]}});return;}
  // Horarios en un solo lugar: planilla del local y (solo Munro) historial de semanas, sin pagos para el gerente.
  if(req.url.includes('/rest/v1/rpc/rm_app_branch_schedule_links')){req.reply([{local_id:local,local_name:local==='dt'?'Torcuato':'Munro',url:'https://docs.google.com/spreadsheets/d/planilla-de-prueba/edit'}]);return;}
  if(req.url.includes('/rest/v1/rpc/rm_munro_horarios_obtener')){req.reply({semana:req.body?.p_semana||'2026-11-09',
     personas:Array.from({length:8},(_,i)=>({id:i+1,nombre:'',modalidad:i<3?'turno':'hora',estado:'activo'})),
     planillas:[],historial:[],puede_editar:true});return;}
  if(req.url.includes('/rest/v1/rpc/rm_horarios_locales')){req.reply(local==='munro'?[{local_id:'munro',local_name:'Munro',conectado:true,ultimo_envio_at:'2026-11-02T15:19:00Z',codigo_at:null,puede_administrar:false}]:[]);return;}
  if(req.url.includes('/rest/v1/rpc/rm_horarios_historial')){req.reply([{desde:'2026-10-19',hasta:'2026-10-25',archivo_id:'00000000-0000-4000-8000-000000000002',filas:[{colaborador:'Kati',puesto:'Staff',cobra_por:'Horas',trabajado:'39:00',off:'4:30',feriado:'–',ausentes:'–',vacaciones:'–',total:'43:30',observaciones:''}],recibido_at:'2026-11-02T15:06:00Z',actualizaciones:1,pagos:{}}]);return;}
  req.reply({statusCode:200,body:[]});
 });
}
describe('Empleados comparte la sesión de GESTLOK',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 for(const local of ['munro','dt'])it('sesión existente de '+local+': entra y recarga sin Google ni cookies',()=>{
  setup(local);
  cy.clearCookies();
  // Menú de GESTLOK que la app principal guardó para esta cuenta (solo nombres y secciones del local).
  const nav={v:1,uid:user.id,local,localName:local==='dt'?'Don Torcuato':'Munro',at:Date.now(),
   dock:[['home','Inicio'],['pagos','Pagos Online'],['stock','Stock Local'],['staff',local==='munro'?'Staff':'Colaboradores'],['more','Más']],
   side:[{go:'inicio',label:'Inicio',folder:false},{go:'cierre-online',label:'Pagos Online',folder:false},{go:'stock',label:'Stock Local',folder:false},{go:'proveedores',label:'Proveedores',folder:false}]};
  cy.visit('/empleados/',{onBeforeLoad(w){w.localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'synthetic-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));w.localStorage.setItem('gestlok:nav',JSON.stringify(nav));}});
  cy.get('h1',{timeout:15000}).should('contain.text','Administración de empleados');
  cy.contains('Continuar con Google').should('not.exist');
  // PC: las secciones del local de GESTLOK siguen en el menú lateral.
  cy.viewport(1240,820);
  cy.get('.gl-gerente__sidebar .gl-gestlok-localnav').should('be.visible')
    .and('contain.text','Stock Local').and('contain.text','Proveedores');
  cy.get('.gl-gerente__sidebar .gl-gestlok-localnav').contains('a','Stock Local')
    .should('have.attr','href').and('include','gl_ir_local='+local).and('include','gl_ir=stock');
  // Celular: la misma barra de abajo que GESTLOK, con Colaboradores marcado.
  cy.viewport(390,844);
  cy.get('.gl-gestlok-dock').should('be.visible')
    .and('contain.text','Inicio').and('contain.text','Pagos Online').and('contain.text','Stock Local').and('contain.text','Más');
  if(local==='munro')cy.get('.gl-gestlok-dock').contains('a','Staff')
     .should('have.attr','href','/empleados/horarios/');
  else cy.get('.gl-gestlok-dock [aria-current="page"]').should('contain.text','Colaboradores');
  cy.get('.gl-gestlok-dock').contains('a','Pagos Online').should('have.attr','href').and('include','gl_ir=cierre-online');
  cy.get('.gl-gestlok-dock button[aria-haspopup="dialog"]').click();
  cy.get('.gl-gestlok-sheet__panel').should('be.visible').and('contain.text','Horarios').and('contain.text','Proveedores');
  cy.get('.gl-gestlok-sheet__panel').contains('button','Horarios').click();
  cy.get('.gl-gestlok-sheet').should('not.exist');
  cy.get('.gl-modulo-tabs [aria-current="page"]').should('contain.text','Horarios');
  cy.get('.gl-modulo-tabs').contains('button','Colaboradores').click();
  // En escritorio el menú del gerente y la palabra completa GESTLOK deben contrastar sobre blanco.
  cy.viewport(1240,820);
  cy.get('.gl-gerente__header-brand .gl-gerente__header-gest')
    .should('be.visible').and('have.css','color','rgb(25, 59, 85)');
  cy.get('.gl-gerente__header-brand .gl-gerente__header-lok')
    .should('be.visible').and('have.css','color','rgb(8, 127, 168)');
  cy.get('.gl-gerente__main').should('have.css','background-color','rgb(255, 255, 255)');
  cy.get('.gl-gerente__sidebar').should('be.visible')
    .and('have.css','background-color','rgb(255, 255, 255)');
  cy.get('.gl-gerente__sidebar nav button').first()
    .should('contain.text','Colaboradores').and('be.visible');
  cy.get('.gl-gerente__sidebar nav button').eq(1)
    .should('contain.text','Horarios').and('be.visible');
  cy.get('.gl-module-dock').should('not.be.visible');
  // Horarios en un solo lugar: la planilla se abre directo y el historial está debajo (sin pantallas intermedias).
  cy.get('.gl-gerente__sidebar').contains('button','Horarios').click();
  cy.get('.horarios-hub h1').should('contain.text','Horarios');
  cy.contains('Abrir Google Sheets y horarios').should('not.exist');
  if(local==='munro'){
   cy.get('.mhs-tabla tbody tr').should('have.length',8);
   cy.contains('a','Abrir planilla').should('not.exist','Munro usa planilla nativa');
   cy.get('.mhs-pestanas').contains('button','Historial').click();
   cy.contains('h2','Historial de semanas').should('be.visible');
   cy.get('section[aria-label="Hoja Resumen archivada"]').should('be.visible').within(()=>{
    cy.get('table[aria-label^="Resumen del"]').should('be.visible');
    cy.contains('td','Kati').should('be.visible');
   });
   cy.contains('td','Kati').should('be.visible');
   // Pagos: control interno del dueño; el gerente no los ve.
   cy.contains('Pendientes de pago').should('not.exist');
   cy.contains('por pagar').should('not.exist');
   cy.contains('Marcar pagado').should('not.exist');
  } else {
   cy.contains('a','Abrir planilla').should('be.visible')
     .and('have.attr','href','https://docs.google.com/spreadsheets/d/planilla-de-prueba/edit');
   cy.contains('Historial de semanas').should('not.exist');
  }
  cy.get('.gl-gerente__sidebar').contains('button','Colaboradores').click();
  cy.reload();
  cy.get('h1',{timeout:15000}).should('contain.text','Administración de empleados');
  cy.contains('Continuar con Google').should('not.exist');
 });
 it('sin sesión conserva el ingreso y no muestra información privada',()=>{
  setup('munro');cy.clearCookies();
  cy.visit('/empleados/',{onBeforeLoad(w){w.localStorage.removeItem(key);}});
  cy.contains('Continuar con Google',{timeout:15000}).should('be.visible');
  cy.contains('h1','Administración de empleados').should('not.exist');
 });
});
