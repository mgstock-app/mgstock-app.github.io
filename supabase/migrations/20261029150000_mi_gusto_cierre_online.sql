-- GESTLOK / Mi Gusto: cierre online por turno y local.
-- Estructura aislada, sin modificar las planillas existentes ni otros comercios.
create schema if not exists gestlok_mg_online_private;
revoke all on schema gestlok_mg_online_private from public, anon, authenticated;

create table gestlok_mg_online_private.shifts (
  id uuid primary key default gen_random_uuid(),
  local text not null check(local in ('munro','torcuato')),
  day date not null,
  turno text not null check(turno in ('manana','tarde')),
  status text not null default 'abierto' check(status in ('abierto','cerrado')),
  started_at timestamptz not null default now(),
  started_by uuid not null,
  closed_at timestamptz,
  closed_by uuid,
  unique(local,day,turno),
  check((closed_at is null and closed_by is null and status='abierto') or
        (closed_at is not null and closed_by is not null and status='cerrado'))
);
create unique index gl_mg_online_one_open_per_local
  on gestlok_mg_online_private.shifts(local) where status='abierto';
create index gl_mg_online_history on gestlok_mg_online_private.shifts(local,day desc,turno);
alter table gestlok_mg_online_private.shifts enable row level security;
revoke all on gestlok_mg_online_private.shifts from public, anon, authenticated;

create table gestlok_mg_online_private.movements (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references gestlok_mg_online_private.shifts(id) on delete restrict,
  comanda text not null check(comanda ~ '^[0-9]{1,10}$'),
  method text not null check(method in ('transferencia','getnet','mercado_pago')),
  amount numeric(14,2) not null check(amount > 0 and amount < 100000000000),
  app boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null
);
create index gl_mg_online_movements_shift on gestlok_mg_online_private.movements(shift_id,created_at,id);
alter table gestlok_mg_online_private.movements enable row level security;
revoke all on gestlok_mg_online_private.movements from public, anon, authenticated;

create table gestlok_mg_online_private.audit(
  id bigint generated always as identity primary key,
  local text not null,
  shift_id uuid not null,
  movement_id uuid,
  action text not null check(action in ('iniciado','creado','editado','eliminado','cerrado')),
  actor uuid not null,
  before_data jsonb,
  after_data jsonb,
  at timestamptz not null default now()
);
create index gl_mg_online_audit_loc on gestlok_mg_online_private.audit(local,at desc);
alter table gestlok_mg_online_private.audit enable row level security;
revoke all on gestlok_mg_online_private.audit from public, anon, authenticated;

create function gestlok_mg_online_private.authorized(p_local text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(
   auth.uid() is not null
   and p_local in ('munro','torcuato')
   and gestlok_tenancy.current_tenant_id()='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
   and public.mi_rol() in ('dueno','gerente')
   and public.puede_editar_local(p_local),false)
$$;
create function gestlok_mg_online_private.today_ar() returns date
language sql stable set search_path='' as $$
 select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;
create function gestlok_mg_online_private.payload(s gestlok_mg_online_private.shifts)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',s.id,'local',s.local,'day',s.day,'turno',s.turno,'status',s.status,
  'started_at',s.started_at,'closed_at',s.closed_at,
  'movements',coalesce((select jsonb_agg(jsonb_build_object(
   'id',m.id,'comanda',m.comanda,'method',m.method,'amount',m.amount,
   'app',m.app,'created_at',m.created_at,'updated_at',m.updated_at
  ) order by m.created_at,m.id) from gestlok_mg_online_private.movements m where m.shift_id=s.id),'[]'::jsonb),
  'transferencia',z.transferencia,'getnet',z.getnet,'mercado_pago',z.mercado_pago,
  'total_app',z.total_app,'total_ventas',z.total_ventas,
  'online_local',z.total_ventas-z.total_app,'comandas',z.comandas
 )
 from (
   select coalesce(sum(m.amount) filter(where m.method='transferencia'),0) as transferencia,
     coalesce(sum(m.amount) filter(where m.method='getnet'),0) as getnet,
     coalesce(sum(m.amount) filter(where m.method='mercado_pago'),0) as mercado_pago,
     coalesce(sum(m.amount) filter(where m.app),0) as total_app,
     coalesce(sum(m.amount),0) as total_ventas,
     count(*) as comandas
   from gestlok_mg_online_private.movements m where m.shift_id=s.id
 ) z
$$;

-- Las RPC solo devuelven datos del local validado en servidor.
-- La lectura inicial crea el turno Mañana únicamente cuando el local no tiene ninguno abierto.
create function public.gestlok_mg_online_state(p_local text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_mg_online_private.shifts;
begin
 if not gestlok_mg_online_private.authorized(p_local) then
  raise exception 'Sin permiso para este local' using errcode='42501'; end if;
 select * into s from gestlok_mg_online_private.shifts
  where local=p_local and status='abierto' for update;
 if not found then
  insert into gestlok_mg_online_private.shifts(local,day,turno,started_by)
   values(p_local,gestlok_mg_online_private.today_ar(),'manana',auth.uid())
   on conflict(local,day,turno) do nothing;
  select * into s from gestlok_mg_online_private.shifts
   where local=p_local and status='abierto' for update;
 end if;
 if s.id is null then
  raise exception 'No hay turno abierto para el día; contactá a administración' using errcode='22023'; end if;
 return jsonb_build_object(
   'active',gestlok_mg_online_private.payload(s),
   'history',coalesce((
     select jsonb_agg(gestlok_mg_online_private.payload(x) order by x.day desc,x.turno desc)
     from (select * from gestlok_mg_online_private.shifts
       where local=p_local and status='cerrado'
       order by day desc,turno desc limit 1000) x
   ),'[]'::jsonb));
end $$;

create function public.gestlok_mg_online_save(
 p_local text,p_shift uuid,p_id uuid,p_comanda text,p_method text,p_amount numeric,p_app boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_mg_online_private.shifts;
        m gestlok_mg_online_private.movements;
        old_m gestlok_mg_online_private.movements;
begin
 if not gestlok_mg_online_private.authorized(p_local) then
  raise exception 'Sin permiso para este local' using errcode='42501'; end if;
 select * into s from gestlok_mg_online_private.shifts
  where id=p_shift and local=p_local for update;
 if s.id is null or s.status<>'abierto' then
  raise exception 'El turno ya está cerrado o no pertenece al local' using errcode='22023'; end if;
 if coalesce(p_comanda,'') !~ '^[0-9]{1,10}$'
   or p_method not in ('transferencia','getnet','mercado_pago')
   or p_amount is null or p_amount <=0 or p_amount>=100000000000
   or p_app is null then
  raise exception 'Revisá comanda, forma de pago, monto y APP' using errcode='22023'; end if;
 if p_id is null then
  insert into gestlok_mg_online_private.movements(
    shift_id,comanda,method,amount,app,created_by,updated_by)
  values(s.id,p_comanda,p_method,p_amount,p_app,auth.uid(),auth.uid()) returning * into m;
 else
  select * into old_m from gestlok_mg_online_private.movements
   where id=p_id and shift_id=s.id for update;
  if old_m.id is null then
   raise exception 'Movimiento no encontrado en este turno' using errcode='22023'; end if;
  update gestlok_mg_online_private.movements set
    comanda=p_comanda,method=p_method,amount=p_amount,app=p_app,
    updated_at=now(),updated_by=auth.uid()
   where id=old_m.id returning * into m;
 end if;
 insert into gestlok_mg_online_private.audit(local,shift_id,movement_id,action,actor,before_data,after_data)
  values(p_local,s.id,m.id,case when p_id is null then 'creado' else 'editado' end,
    auth.uid(),case when p_id is null then null else to_jsonb(old_m) end,to_jsonb(m));
 return gestlok_mg_online_private.payload(s);
end $$;

create function public.gestlok_mg_online_delete(p_local text,p_shift uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_mg_online_private.shifts;
        m gestlok_mg_online_private.movements;
begin
 if not gestlok_mg_online_private.authorized(p_local) then
  raise exception 'Sin permiso para este local' using errcode='42501'; end if;
 select * into s from gestlok_mg_online_private.shifts where id=p_shift and local=p_local for update;
 if s.id is null or s.status<>'abierto' then raise exception 'Turno cerrado o de otro local' using errcode='22023'; end if;
 delete from gestlok_mg_online_private.movements where id=p_id and shift_id=s.id returning * into m;
 if m.id is null then raise exception 'Movimiento inexistente' using errcode='22023'; end if;
 insert into gestlok_mg_online_private.audit(local,shift_id,movement_id,action,actor,before_data)
  values(p_local,s.id,m.id,'eliminado',auth.uid(),to_jsonb(m));
 return gestlok_mg_online_private.payload(s);
end $$;

-- Cierre transaccional. Primero guarda el turno cerrado y luego abre el siguiente.
create function public.gestlok_mg_online_close(p_local text,p_shift uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_mg_online_private.shifts;
        n gestlok_mg_online_private.shifts;
        next_day date;
        next_turno text;
begin
 if not gestlok_mg_online_private.authorized(p_local) then
  raise exception 'Sin permiso para este local' using errcode='42501'; end if;
 select * into s from gestlok_mg_online_private.shifts
  where id=p_shift and local=p_local for update;
 if s.id is null or s.status<>'abierto' then
  raise exception 'Este turno ya fue cerrado o no corresponde al local' using errcode='22023'; end if;
 if not exists(select 1 from gestlok_mg_online_private.movements where shift_id=s.id) then
  raise exception 'Cargá al menos una comanda antes de cerrar el turno' using errcode='22023'; end if;
 update gestlok_mg_online_private.shifts
  set status='cerrado',closed_at=now(),closed_by=auth.uid() where id=s.id returning * into s;
 insert into gestlok_mg_online_private.audit(local,shift_id,action,actor,after_data)
  values(p_local,s.id,'cerrado',auth.uid(),gestlok_mg_online_private.payload(s));
 next_turno:=case when s.turno='manana' then 'tarde' else 'manana' end;
 next_day:=s.day+case when s.turno='tarde' then 1 else 0 end;
 insert into gestlok_mg_online_private.shifts(local,day,turno,started_by)
  values(p_local,next_day,next_turno,auth.uid())
  on conflict(local,day,turno) do nothing;
 select * into n from gestlok_mg_online_private.shifts
  where local=p_local and day=next_day and turno=next_turno and status='abierto';
 if n.id is null then raise exception 'No se pudo abrir el turno siguiente' using errcode='22023'; end if;
 insert into gestlok_mg_online_private.audit(local,shift_id,action,actor)
  values(p_local,n.id,'iniciado',auth.uid());
 return jsonb_build_object('closed',gestlok_mg_online_private.payload(s),'active',gestlok_mg_online_private.payload(n));
end $$;

-- Lista cerrada de RPC accesibles; sin acceso directo a tablas.
revoke all on all tables in schema gestlok_mg_online_private from public,anon,authenticated;
revoke all on all functions in schema gestlok_mg_online_private from public,anon,authenticated;
revoke all on function public.gestlok_mg_online_state(text),
 public.gestlok_mg_online_save(text,uuid,uuid,text,text,numeric,boolean),
 public.gestlok_mg_online_delete(text,uuid,uuid),
 public.gestlok_mg_online_close(text,uuid)
 from public,anon;
grant execute on function public.gestlok_mg_online_state(text),
 public.gestlok_mg_online_save(text,uuid,uuid,text,text,numeric,boolean),
 public.gestlok_mg_online_delete(text,uuid,uuid),
 public.gestlok_mg_online_close(text,uuid)
 to authenticated;
