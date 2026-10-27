-- GESTLOK · Administración de empleados: base de identidad (paso 1/7 de la independencia de ReciboNet).
-- No toca tablas existentes de GESTLOK. Todo lo nuevo vive en rm_test_private (privado) y en public.rm_*.
create schema if not exists rm_test_private;
revoke all on schema rm_test_private from public, anon;
grant usage on schema rm_test_private to authenticated;

-- Correspondencia correo verificado -> identificador que la persona tenía en ReciboNet.
-- Nunca se copian cuentas ni contraseñas: la persona entra con su cuenta de GESTLOK y hereda sus datos por correo confirmado.
create table if not exists rm_test_private.identity_map(
  email text primary key check (email = lower(btrim(email))),
  old_user_id uuid not null unique,
  source text not null default 'recibonet',
  created_at timestamptz not null default now()
);
alter table rm_test_private.identity_map enable row level security;
revoke all on rm_test_private.identity_map from public, anon, authenticated;

-- Identificador efectivo de la sesión: el histórico de ReciboNet si el correo confirmado está en la correspondencia;
-- si no, el id de Auth de GESTLOK. Sin correo confirmado y coincidente con el token no hay mapeo (queda sin privilegios).
create or replace function rm_test_private.uid()
returns uuid language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select m.old_user_id
       from auth.users u
       join rm_test_private.identity_map m on m.email = lower(btrim(u.email))
      where u.id = auth.uid()
        and u.email_confirmed_at is not null
        and lower(btrim(u.email)) = lower(coalesce(auth.jwt()->>'email', ''))),
    auth.uid())
$$;
revoke all on function rm_test_private.uid() from public, anon;
grant execute on function rm_test_private.uid() to authenticated;

-- La sesión actual pertenece a una cuenta de GESTLOK con ese correo confirmado.
create or replace function rm_test_private.verified_email(p_email text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from auth.users u
     where u.id = auth.uid()
       and u.email_confirmed_at is not null
       and lower(btrim(u.email)) = lower(btrim(coalesce(p_email, '')))
       and lower(btrim(u.email)) = lower(coalesce(auth.jwt()->>'email', '')))
$$;
revoke all on function rm_test_private.verified_email(text) from public, anon;
grant execute on function rm_test_private.verified_email(text) to authenticated;

-- Reemplaza el disparador de ReciboNet sobre auth.users (no se crean disparadores en Auth de GESTLOK):
-- registra en el directorio a quien ya inició sesión con correo confirmado y aplica invitaciones pendientes.
create or replace function rm_test_private.ensure_directory()
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare v_auth uuid := auth.uid(); v_uid uuid; v_email text; v_name text;
begin
  if v_auth is null then return false; end if;
  select lower(btrim(u.email)),
         left(coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), u.email, 'Usuario'), 120)
    into v_email, v_name
    from auth.users u
   where u.id = v_auth and u.email_confirmed_at is not null and u.email is not null
     and lower(btrim(u.email)) = lower(coalesce(auth.jwt()->>'email', ''));
  if v_email is null then return false; end if;
  v_uid := rm_test_private.uid();
  insert into public.rm_app_directory(user_id, email, display_name) values (v_uid, v_email, v_name)
    on conflict (user_id) do nothing;
  insert into public.rm_organization_members(user_id, organization_id)
    select v_uid, i.organization_id from rm_test_private.organization_invitations i where i.email = v_email
    on conflict (user_id) do nothing;
  return true;
end $$;
revoke all on function rm_test_private.ensure_directory() from public, anon, authenticated;
