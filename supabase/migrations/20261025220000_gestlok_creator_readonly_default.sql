-- Panel de creadora: consulta de SOLO LECTURA por defecto en los datos operativos de la empresa
-- (stock, hojas, conteos, proveedores, pedidos, chat, configuración de la empresa).
-- Para modificar, la creadora habilita la edición en forma explícita, por un tiempo limitado
-- (5 a 120 minutos) y con un motivo; todo queda en gestlok_platform.admin_audit.
-- No cambia los permisos de dueños, gerentes ni lectura. No modifica datos existentes.
-- Altas y permisos del equipo (equipo, solicitudes, locales) siguen disponibles para la creadora
-- y desde ahora quedan registrados en la auditoría.

create table if not exists gestlok_platform.creator_write_grants(
  id bigint generated always as identity primary key,
  user_id uuid not null,
  reason text not null check (length(reason) between 3 and 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '2 hours')
);
create index if not exists creator_write_grants_active on gestlok_platform.creator_write_grants(user_id, expires_at desc) where revoked_at is null;
alter table gestlok_platform.creator_write_grants enable row level security;
revoke all on gestlok_platform.creator_write_grants from public, anon, authenticated;

create or replace function gestlok_platform.creator_write_active()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from gestlok_platform.creator_write_grants g
  where g.user_id = auth.uid() and g.revoked_at is null and g.expires_at > now()) $$;
revoke all on function gestlok_platform.creator_write_active() from public, anon, authenticated;

-- Una sola comprobación por sentencia (también cubre funciones SECURITY DEFINER como los remitos).
create or replace function gestlok_platform.creator_readonly_guard()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_tenant uuid; v_hit boolean;
begin
  if auth.uid() is null or public.mi_rol() is distinct from 'creadora' or gestlok_platform.creator_write_active() then
    return null;
  end if;
  v_tenant := gestlok_tenancy.current_tenant_id();
  if tg_op = 'DELETE' then
    select exists(select 1 from gl_old r where r.tenant_id = v_tenant and (position('/' in r.col) > 0 or r.col = 'configuracion_negocio')) into v_hit;
  else
    select exists(select 1 from gl_new r where r.tenant_id = v_tenant and (position('/' in r.col) > 0 or r.col = 'configuracion_negocio')) into v_hit;
  end if;
  if v_hit then
    raise exception 'GL:solo_lectura' using errcode = '42501',
      hint = 'La consulta de la creadora es de solo lectura. Habilitá la edición desde el panel.';
  end if;
  return null;
end $$;
revoke all on function gestlok_platform.creator_readonly_guard() from public, anon, authenticated;
create trigger gestlok_creator_readonly_ins after insert on public.docs referencing new table as gl_new
  for each statement execute function gestlok_platform.creator_readonly_guard();
create trigger gestlok_creator_readonly_upd after update on public.docs referencing new table as gl_new
  for each statement execute function gestlok_platform.creator_readonly_guard();
create trigger gestlok_creator_readonly_del after delete on public.docs referencing old table as gl_old
  for each statement execute function gestlok_platform.creator_readonly_guard();

-- Auditoría de cambios de equipo hechos por la creadora (altas, roles, locales, bajas).
create or replace function gestlok_platform.audit_creator_team_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare r public.docs := coalesce(new, old);
begin
  if r.col in ('equipo', 'locales') and auth.uid() is not null and public.mi_rol() = 'creadora' then
    insert into gestlok_platform.admin_audit(actor, action, tenant_id, detail)
    values (auth.uid(), case r.col when 'equipo' then 'team_changed' else 'local_changed' end, r.tenant_id,
      jsonb_build_object('op', lower(tg_op), 'id', r.id, 'rol', r.data->>'rol',
        'locales', case when jsonb_typeof(r.data->'locales') = 'array' then jsonb_array_length(r.data->'locales') end));
  end if;
  return null;
end $$;
revoke all on function gestlok_platform.audit_creator_team_change() from public, anon, authenticated;
create trigger gestlok_audit_creator_team after insert or update or delete on public.docs
  for each row execute function gestlok_platform.audit_creator_team_change();

-- Estado, habilitación y cierre de la edición. Solo la administradora registrada.
create or replace function public.gestlok_creator_editing_state()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_exp timestamptz;
begin
  perform gestlok_platform.require_admin();
  select max(g.expires_at) into v_exp from gestlok_platform.creator_write_grants g
   where g.user_id = auth.uid() and g.revoked_at is null and g.expires_at > now();
  return jsonb_build_object('active', v_exp is not null, 'expires_at', v_exp);
end $$;
create or replace function public.gestlok_creator_enable_editing(p_minutes integer, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_admin uuid := gestlok_platform.require_admin(); v_exp timestamptz; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_minutes is null or p_minutes < 5 or p_minutes > 120 then raise exception 'Duración inválida' using errcode = '22023'; end if;
  if length(v_reason) < 3 or length(v_reason) > 200 then raise exception 'Indicá el motivo de la edición' using errcode = '22023'; end if;
  update gestlok_platform.creator_write_grants set revoked_at = now() where user_id = v_admin and revoked_at is null and expires_at > now();
  v_exp := now() + make_interval(mins => p_minutes);
  insert into gestlok_platform.creator_write_grants(user_id, reason, expires_at) values (v_admin, v_reason, v_exp);
  insert into gestlok_platform.admin_audit(actor, action, tenant_id, detail)
  values (v_admin, 'editing_enabled', gestlok_tenancy.current_tenant_id(), jsonb_build_object('minutes', p_minutes, 'reason', v_reason));
  return jsonb_build_object('active', true, 'expires_at', v_exp);
end $$;
create or replace function public.gestlok_creator_disable_editing()
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_admin uuid := gestlok_platform.require_admin(); v_n integer;
begin
  update gestlok_platform.creator_write_grants set revoked_at = now() where user_id = v_admin and revoked_at is null and expires_at > now();
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into gestlok_platform.admin_audit(actor, action, tenant_id, detail)
    values (v_admin, 'editing_disabled', gestlok_tenancy.current_tenant_id(), '{}');
  end if;
  return jsonb_build_object('active', false, 'expires_at', null);
end $$;
revoke all on function public.gestlok_creator_editing_state() from public, anon;
revoke all on function public.gestlok_creator_enable_editing(integer, text) from public, anon;
revoke all on function public.gestlok_creator_disable_editing() from public, anon;
grant execute on function public.gestlok_creator_editing_state() to authenticated;
grant execute on function public.gestlok_creator_enable_editing(integer, text) to authenticated;
grant execute on function public.gestlok_creator_disable_editing() to authenticated;
