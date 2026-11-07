import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const load=f=>readFileSync(f,'utf8');
const sql=load('supabase/migrations/20261107215000_gestlok_invitar_locales_nuevos.sql');
const js=load('public/stock/gestlok-invites.js');
const css=load('public/stock/gestlok-invites.css');
const auth=load('public/stock/auth.js');
const owner=load('public/stock/gestlok-owner-areas.js');
const runtime=load('components/stock-runtime.tsx');
const cache=load('scripts/sw-template.js');
const EL_MOLINO='6c8717ea-5f78-426b-9458-74a5dcac6e4e';
const ACASSUSO='loc-6c8717ea5f78426b9458';

function fixture({tenant=EL_MOLINO,local=ACASSUSO,role='gerente',token=''}={}){
 const stored={};
 let historyChanged='',calls=[],rendered=0;
 const listeners={};
 const location={href:'https://gestlok.com.ar/'+(token?'?invitar='+token:''),origin:'https://gestlok.com.ar'};
 const history={state:null,replaceState(_s,_t,url){historyChanged=url;}};
 const sessionStorage={setItem(k,v){stored[k]=v;},getItem(k){return stored[k]||null;},removeItem(k){delete stored[k];}};
 const document={
  addEventListener(n,fn){listeners[n]=fn;},
  getElementById(){return null;},
  createElement(){return {setAttribute(){},style:{}};},
  head:{appendChild(){}},
  querySelector(){return null}
 };
 const window={GestLokSupabase:{rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='gestlok_newlocal_invite_scope')return {data:{enabled:tenant===EL_MOLINO},error:null};
   if(name==='gestlok_newlocal_my_requests')return {data:[],error:null};
   return {data:{},error:null};
 }}};
 vm.runInNewContext(js,{window,document,location,history,sessionStorage,URL,Intl,Number,Date,
 setTimeout:()=>0,clearTimeout,setInterval:()=>0,clearInterval});
 const api=window.GestLokInvites;api.attach({S:{me:{tenant_id:tenant},local},role:()=>role,render(){rendered++;}});
 return {api,stored,calls,history:()=>historyChanged,rendered:()=>rendered};
}

test('Todos los locales futuros activan la invitación al insertarse, sin tocar los existentes',()=>{
 assert.match(sql,/create trigger gestlok_enable_invites_new_local/);
 assert.match(sql,/after insert on public\.docs for each row/);
 assert.match(sql,/when \(new\.col='locales'\)/);
 assert.match(sql,/invite_enabled_locals/);
 assert.match(sql,/6c8717ea-5f78-426b-9458-74a5dcac6e4e/);
 assert.doesNotMatch(sql,/delete from public\.docs|update public\.docs/i);
 assert.match(sql,/foreign key\(tenant_id,local_id\)/);
});

test('El gerente comparte la invitación, pero no puede aprobar ni leer legajos',async()=>{
 const {api,calls}=fixture();
 assert.equal(api.homeTile(),'');
 await api.refresh();
 const html=api.homeTile();
 assert.match(html,/Invitar a GESTLOK/);
 assert.match(html,/data-gl-invite-open/);
 assert.match(html,/viewBox="0 0 24 24"/);
 assert.deepEqual(calls.map(x=>x[0]),['gestlok_newlocal_invite_scope']);
 assert.match(sql,/invite_permission\(p_tenant,p_local\)/);
 assert.match(sql,/p_rotate and v_permission not in \('admin','dueno'\)/);
 assert.match(sql,/if not gestlok_platform\.invite_can_review\(p_tenant\)/);
 assert.match(sql,/if not gestlok_platform\.invite_can_review\(v_row\.tenant_id\)/);
});

test('Locales existentes de otras empresas no reciben un botón nuevo automáticamente',async()=>{
 const f=fixture({tenant:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670',local:'munro',role:'gerente'});
 await f.api.refresh();
 assert.equal(f.api.homeTile(),'');
 assert.match(owner,/GestLokInvites\?\.homeTile\?\.\(\)/);
 assert.match(owner,/GestLokInvites\?\.refresh\?\.\(\)/);
 assert.match(owner,/GestLokInvites\?\.attach\?\.\(ctx\)/);
});

test('Los enlaces son permanentes y regenerables, sin acceso implícito',()=>{
 assert.match(sql,/local_invite_links/);
 assert.match(sql,/token text not null unique/);
 assert.match(sql,/replace\(gen_random_uuid\(\)::text/);
 assert.doesNotMatch(sql,/expires_at|expiry|48 hours/i);
 assert.match(sql,/p_rotate boolean default false/);
 assert.match(sql,/set token=/);
 assert.match(js,/https:\/\/wa\.me\//);
 assert.match(js,/Enlace sin vencimiento/);
 assert.match(js,/data-gl-invite-rotate/);
});

test('El enlace se conserva durante OAuth Google y se limpia de la URL',()=>{
 const token='a'.repeat(64);
 const f=fixture({token});
 assert.equal(f.api.hasPendingToken(),true);
 assert.equal(f.stored['gestlok:local-invite-pending'],token);
 assert.equal(f.history(),'/');
 assert.match(js,/provider:'google'/);
 assert.match(js,/data-gl-invite-google/);
 assert.match(auth,/GestLokInvites\?\.afterLogin\?\.\(session\)/);
 assert.match(auth,/if\(!inviteFlow\)window\.GestLokRegistration\?\.pending\(session\)/);
 assert.match(css,/#au-in\.gl-invite-google-only/);
});

test('El invitado Google llena nombre, apellido y teléfono; nunca elige su rol',()=>{
 assert.match(js,/id="gl-invite-join-form"/);
 for(const n of ['first','last','phone'])assert.match(js,new RegExp('name="'+n+'"'));
 assert.doesNotMatch(js,/id="gl-invite-join-form"[^]*?<select[^>]*name="role"/);
 assert.match(sql,/auth\.identities i/);
 assert.match(sql,/i\.provider='google'/);
 assert.match(sql,/status text not null default 'pending'/);
 assert.match(sql,/insert into gestlok_platform\.local_join_requests/);
 assert.match(sql,/insert into public\.docs\(tenant_id,col,id,data,updated_by\)/);
 assert.match(sql,/if p_role not in \('dueno','gerente'\)/);
 assert.match(sql,/if p_decision='rejected' then/);
});

test('Legajo privado: Gerentes no leen teléfonos, Dueño y creadora sí',()=>{
 assert.match(sql,/revoke all on gestlok_platform\.invite_enabled_locals/);
 assert.match(sql,/local_join_requests enable row level security/);
 assert.match(sql,/create or replace function public\.gestlok_newlocal_requests/);
 assert.match(sql,/if not gestlok_platform\.invite_can_review\(p_tenant\)/);
 assert.match(js,/first_name/);
 assert.match(js,/last_name/);
 assert.match(js,/r\.phone/);
 assert.match(js,/data-gl-invite-review/);
 assert.match(js,/value="gerente"/);
 assert.match(js,/value="dueno"/);
});

test('La PWA precarga el módulo nuevo antes de iniciar Auth y mantiene invitación',()=>{
 assert.match(runtime,/await load\("\/stock\/gestlok-invites\.js\?rev=invite-google-20261107"\)/);
 const a=runtime.indexOf('await load("/stock/gestlok-invites.js');
 const b=runtime.indexOf('await load(visitor ? "/stock/gestlok-visitor-demo.js" : "/stock/auth.js');
 assert.ok(a>=0&&a<b);
 assert.match(cache,/'\/stock\/gestlok-invites\.js'/);
 assert.match(cache,/'\/stock\/gestlok-invites\.css'/);
});
