/* global Cypress, describe, it, cy */
const key = 'sb-vgsepaaewbctjsjcpeta-auth-token';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'gerente@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})) + '.synthetic';
function setup(local){
 cy.intercept('**/*.supabase.co/**', req=>{
  if(req.url.includes('/auth/v1/user')){expect(req.headers.authorization).to.eq('Bearer '+token);req.reply(user);return;}
  if(req.url.includes('/rest/v1/rpc/rm_app_me')){expect(req.headers.authorization).to.eq('Bearer '+token);req.reply({...user,user_id:user.id,display_name:'Gerente de prueba',status:'approved',role:null,gestlok_gerente:{local_ids:[local]}});return;}
  req.reply({statusCode:200,body:[]});
 });
}
describe('Empleados comparte la sesión de GESTLOK',()=>{
 Cypress.on('uncaught:exception',e=>{if(e.message.includes('Minified React error #418'))return false;});
 for(const local of ['munro','dt'])it('sesión existente de '+local+': entra y recarga sin Google ni cookies',()=>{
  setup(local);
  cy.clearCookies();
  cy.visit('/empleados/',{onBeforeLoad(w){w.localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'synthetic-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));}});
  cy.get('h1',{timeout:15000}).should('contain.text','Administración de empleados');
  cy.contains('Continuar con Google').should('not.exist');
  // En escritorio el menú del gerente y la palabra completa GESTLOK deben contrastar sobre blanco.
  cy.viewport(1240,820);
  cy.get('.gl-gerente__header-brand .gl-gerente__header-gest')
    .should('be.visible').and('have.css','color','rgb(25, 59, 85)');
  cy.get('.gl-gerente__header-brand .gl-gerente__header-lok')
    .should('be.visible').and('have.css','color','rgb(8, 127, 168)');
  cy.get('.gl-gerente__sidebar').should('be.visible')
    .and('have.css','background-color','rgb(255, 255, 255)');
  cy.get('.gl-gerente__sidebar nav button').first()
    .should('contain.text','Colaboradores').and('be.visible');
  cy.get('.gl-gerente__sidebar nav button').eq(1)
    .should('contain.text','Sector de Google').and('be.visible');
  cy.get('.gl-module-dock').should('not.be.visible');
  // La cabecera anterior «📁 Horarios» ya no existe. La navegación
  // vigente del gerente es Sector de Google → Horarios.
  cy.contains('button','Sector de Google').should('exist').click();
  cy.contains('a','Abrir Google Sheets y horarios').should('be.visible')
    .and('have.attr','href').and('include','horarios');
  cy.contains('button','Volver a los legajos').click();
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
