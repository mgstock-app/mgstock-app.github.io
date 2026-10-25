-- GestLok · cinco categorías push por Dueña. SQL no destruye datos previos.
-- La entrega usa consentimiento + rol vigente + preferencias por usuario/empresa.
create table if not exists public.gestlok_push_preferences(
 tenant_id uuid not null references gestlok_tenancy.tenants(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 master boolean not null default true,
 order_ready boolean not null default true,
 due_soon boolean not null default true,
 due_today boolean not null default true,
 urgent_chat boolean not null default true,
 important_changes boolean not null default true,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,user_id)
);
alter table public.gestlok_push_preferences enable row level security;
revoke all on public.gestlok_push_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.gestlok_push_preferences to service_role;

alter table public.gestlok_push_events
 add column if not exists category text,
 add column if not exists path text not null default '/',
 add column if not exists scheduled_at timestamptz not null default now(),
 add column if not exists grouped_count integer not null default 1;
create index if not exists gestlok_push_ready_v2 on public.gestlok_push_events(scheduled_at)
 where delivered_at is null and category is not null;

create table if not exists public.gestlok_push_deliveries(
 event_id bigint not null references public.gestlok_push_events(id) on delete cascade,
 endpoint text not null,
 attempts integer not null default 0,
 delivered_at timestamptz,
 last_error text,
 primary key(event_id,endpoint)
);
alter table public.gestlok_push_deliveries enable row level security;
revoke all on public.gestlok_push_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.gestlok_push_deliveries to service_role;

-- Sólo registros nuevos; los documentos antiguos no generan una oleada de avisos.
create or replace function public.gestlok_push_capture()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare
 d public.docs%rowtype;
 loc text; typ text; actor text; rol text; title text; body text;
 cat text; dest text; k text; label text;
 old_n numeric; new_n numeric; updated integer;
 bucket timestamptz;
begin
 if tg_op='DELETE' then d:=old; else d:=new; end if;
 if d.tenant_id is null then return coalesce(new,old); end if;
 loc:=split_part(d.col,'/',1);
 typ:=split_part(d.col,'/',2);
 actor:=lower(coalesce(d.updated_by,''));
 if tg_op='UPDATE' and new.data is not distinct from old.data then return new; end if;
 -- Filtra nombres de local reales y jamás cruza empresas.
 if not exists(select 1 from public.docs p where p.col='locales' and p.id=loc and p.tenant_id=d.tenant_id)
 then return coalesce(new,old); end if;
 select left(coalesce(nullif(p.data->>'nombre',''),loc),70)
 into label from public.docs p where p.col='locales' and p.id=loc and p.tenant_id=d.tenant_id;
 select p.data->>'rol' into rol from public.docs p
 where p.col='equipo' and p.tenant_id=d.tenant_id and
 lower(p.data->>'email')=actor limit 1;
 -- Solo un gerente puede disparar estas dos notificaciones.
 if tg_op='INSERT' and typ='proveedores_historial' and rol='gerente' then
   cat:='order_ready';title:=label||' · Pedido preparado';
   body:=left(coalesce(d.data->>'proveedor','Proveedor'),90)||' tiene un pedido listo para revisar.';
   dest:='proveedores';k:='order:'||d.tenant_id||':'||d.col||':'||d.id;
 elsif tg_op='INSERT' and typ='chat' and rol='gerente'
       and d.data->>'urgente'='true' then
   cat:='urgent_chat'; title:=label||' · Mensaje urgente';
   body:='Un gerente envió un mensaje urgente en el chat interno.';
   dest:='chat';k:='urgent:'||d.tenant_id||':'||d.col||':'||d.id;
 elsif typ in ('productos','proveedores','categorias','proveedores_historial')
    and tg_op='DELETE' then
   cat:='important_changes';
 elsif typ='productos' and tg_op='UPDATE'
    and coalesce(old.data->>'stock','') ~ '^[0-9]+([.][0-9]+)?$'
    and coalesce(new.data->>'stock','') ~ '^[0-9]+([.][0-9]+)?$' then
    old_n:=(old.data->>'stock')::numeric;
    new_n:=(new.data->>'stock')::numeric;
    if old_n<>new_n and (abs(new_n-old_n)>=20 or (old_n>0 and abs(new_n-old_n)/old_n>=0.30)) then
       cat:='important_changes';
    end if;
 elsif typ='proveedores_historial' and tg_op='UPDATE' and
      new.data is distinct from old.data then
    cat:='important_changes';
 end if;
 if cat is null then return coalesce(new,old); end if;
 if cat='important_changes' then
    dest:='avisos';bucket:=to_timestamp(floor(extract(epoch from now())/1800)*1800);
    k:='changes:'||d.tenant_id||':'||loc||':'||to_char(bucket at time zone 'UTC','YYYYMMDDHH24MI');
    insert into public.gestlok_push_events(tenant_id,local_id,event_key,title,body,category,path,scheduled_at,grouped_count)
    values(d.tenant_id,loc,k,label||' · Cambio importante',
      'Se registró 1 cambio importante en el local.','important_changes','avisos',
      bucket+interval '30 minutes',1)
    on conflict(event_key) do update set
      grouped_count=public.gestlok_push_events.grouped_count+1,
      body='Se registraron '||(public.gestlok_push_events.grouped_count+1)||' cambios importantes en el local.'
    where public.gestlok_push_events.delivered_at is null;
 else
    insert into public.gestlok_push_events(tenant_id,local_id,event_key,title,body,category,path,scheduled_at)
    values(d.tenant_id,loc,k,left(title,100),left(body,240),cat,dest,now())
    on conflict(event_key) do nothing;
 end if;
 return coalesce(new,old);
end
$fn$;
revoke all on function public.gestlok_push_capture() from public,anon,authenticated;
drop trigger if exists gestlok_push_capture_docs on public.docs;
create trigger gestlok_push_capture_docs after insert or update of data or delete on public.docs
 for each row execute function public.gestlok_push_capture();

-- Ejecutar a las 08:00 AR (11:00 UTC): una por categoría y local/día.
create or replace function public.gestlok_push_queue_due()
returns integer language plpgsql security definer set search_path=''
as $fn$
declare
 today date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
 rec record; total integer:=0; n_today integer; n_soon integer;
begin
 for rec in select d.tenant_id,split_part(d.col,'/',1) loc,
   left(coalesce(max(l.data->>'nombre'),split_part(d.col,'/',1)),70) label
   from public.docs d join public.docs l on l.tenant_id=d.tenant_id
     and l.col='locales' and l.id=split_part(d.col,'/',1)
   where d.col like '%/vencimientos' and d.data->>'activo' is distinct from 'false'
   group by d.tenant_id,split_part(d.col,'/',1)
 loop
    select count(*) filter(where x.data->>'fechaVencimiento'=today::text),
           count(*) filter(where x.data->>'fechaVencimiento' > today::text
                 and x.data->>'fechaVencimiento' <= (today+3)::text)
    into n_today,n_soon
    from public.docs x where x.tenant_id=rec.tenant_id
      and x.col=rec.loc||'/vencimientos' and x.data->>'activo' is distinct from 'false'
      and x.data->>'fechaVencimiento' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
    if n_today>0 then
      insert into public.gestlok_push_events(tenant_id,local_id,event_key,title,body,category,path)
      values(rec.tenant_id,rec.loc,'due-today:'||rec.tenant_id||':'||rec.loc||':'||today,
        rec.label||' · Vence hoy',n_today||' servicio(s) vencen hoy. Revisalos.','due_today','vencimientos')
      on conflict(event_key) do nothing;
      total:=total+1;
    end if;
    if n_soon>0 then
      insert into public.gestlok_push_events(tenant_id,local_id,event_key,title,body,category,path)
      values(rec.tenant_id,rec.loc,'due-soon:'||rec.tenant_id||':'||rec.loc||':'||today,
        rec.label||' · Vencimientos próximos',n_soon||' servicio(s) vencen en los próximos 3 días.','due_soon','vencimientos')
      on conflict(event_key) do nothing;
      total:=total+1;
    end if;
 end loop;
 return total;
end
$fn$;
revoke all on function public.gestlok_push_queue_due() from public,anon,authenticated;

create or replace function public.gestlok_push_capture_roles()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare d public.docs%rowtype; loc record; window_start timestamptz; key_text text;
begin
 if tg_op='DELETE' then d:=old; else d:=new; end if;
 if d.col<>'equipo' or d.tenant_id is null then return coalesce(new,old); end if;
 if tg_op='UPDATE' and old.data->>'rol' is not distinct from new.data->>'rol'
  and old.data->'locales' is not distinct from new.data->'locales' then
    return new;
 end if;
 if tg_op='INSERT' and new.data->>'rol'<>'gerente' then return new; end if;
 if tg_op='DELETE' and old.data->>'rol'<>'gerente' then return old; end if;
 window_start:=to_timestamp(floor(extract(epoch from now())/1800)*1800);
 for loc in select id,coalesce(data->>'nombre',id) as label
   from public.docs where col='locales' and tenant_id=d.tenant_id loop
   key_text:='changes:'||d.tenant_id||':'||loc.id||':'||
       to_char(window_start at time zone 'UTC','YYYYMMDDHH24MI');
   insert into public.gestlok_push_events(tenant_id,local_id,event_key,title,body,category,path,scheduled_at)
   values(d.tenant_id,loc.id,key_text,left(loc.label,70)||' · Cambio importante',
     'Se modificó un acceso o un permiso del equipo.','important_changes','avisos',
     window_start+interval '30 minutes')
   on conflict(event_key) do update set
    grouped_count=public.gestlok_push_events.grouped_count+1,
    body='Se registraron '||(public.gestlok_push_events.grouped_count+1)||' cambios importantes en el local.'
   where public.gestlok_push_events.delivered_at is null;
 end loop;
 return coalesce(new,old);
end
$fn$;
revoke all on function public.gestlok_push_capture_roles() from public,anon,authenticated;
drop trigger if exists gestlok_push_capture_roles_docs on public.docs;
create trigger gestlok_push_capture_roles_docs
 after insert or update of data or delete on public.docs
 for each row execute function public.gestlok_push_capture_roles();
