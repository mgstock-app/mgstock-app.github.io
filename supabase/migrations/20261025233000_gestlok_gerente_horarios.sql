-- Gerente de GESTLOK -> carpeta «Horarios» de Administración de empleados.
-- El Gerente (rol del equipo de GESTLOK) solo puede ver y modificar, agregar o quitar el enlace de
-- horarios (Google Sheets) de SUS locales. No obtiene ningún otro permiso de Empleados.
-- Requisitos: la empresa tiene vínculo con Empleados y el módulo recibos_personal está habilitado.
-- No modifica datos: solo funciones.

create or replace function rm_test_private.gestlok_gerente_locals()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct rl.id), '{}'::text[])
  from public.docs e
  join gestlok_platform.recibonet_links k on k.tenant_id = e.tenant_id
  join gestlok_platform.company_modules m
    on m.tenant_id = e.tenant_id and m.module = 'recibos_personal' and m.enabled
  cross join lateral jsonb_array_elements_text(coalesce(e.data->'locales', '[]'::jsonb)) sl(id)
  join public.rm_app_local rl
    on rl.organization_id = k.organization_id
   and rl.id = case sl.id when 'torcuato' then 'dt' else sl.id end
  where e.col = 'equipo'
    and e.tenant_id = (select gestlok_tenancy.current_tenant_id())
    and lower(e.data->>'email') = lower(coalesce((select auth.jwt()->>'email'), ''))
    and e.data->>'rol' in ('gerente', 'editor')
    and exists (select 1 from auth.users u
                where u.id = auth.uid() and u.email_confirmed_at is not null
                  and lower(btrim(u.email)) = lower(coalesce(auth.jwt()->>'email', '')))
$$;
revoke all on function rm_test_private.gestlok_gerente_locals() from public, anon;
grant execute on function rm_test_private.gestlok_gerente_locals() to authenticated;

create or replace function public.gestlok_gerente_area_context()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_locals text[] := rm_test_private.gestlok_gerente_locals();
begin
  if coalesce(array_length(v_locals, 1), 0) = 0 then
    raise exception 'Acceso exclusivo de gerentes autorizados' using errcode = '42501';
  end if;
  return jsonb_build_object('role', 'gerente', 'tenant_id', gestlok_tenancy.current_tenant_id(),
                            'local_ids', to_jsonb(v_locals), 'horarios', true);
end $$;
revoke all on function public.gestlok_gerente_area_context() from public, anon;
grant execute on function public.gestlok_gerente_area_context() to authenticated;

-- Horarios: el Gerente ve las tarjetas de sus locales.
create or replace function rm_test_private.branch_schedule_links(p_local text, p_company uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('local_id', l.id, 'local_name', l.name, 'url', s.url)
    order by l.name, l.id), '[]'::jsonb)
  from public.rm_app_local l
  left join rm_test_private.branch_schedule_links s on s.local_id = l.id
  where (s.local_id is null or s.enabled)
    and (p_local is not null or p_company is not null)
    and (p_local is null or l.id = p_local)
    and (p_company is null or l.company_id = p_company)
    and (
      ((rm_test_private.app_role() = 'owner' or rm_test_private.is_general_administrator())
        and rm_test_private.manages_organization(l.organization_id))
      or (rm_test_private.app_role() = 'manager' and exists (
        select 1 from public.rm_manager_permissions p
        join public.rm_organization_members m
          on m.user_id = p.user_id and m.organization_id = p.organization_id
        where p.user_id = rm_test_private.uid() and p.company_id = l.company_id
          and p.organization_id = l.organization_id and p.can_edit
      ))
      or l.id = any (rm_test_private.gestlok_gerente_locals())
    );
$$;

-- Horarios: el Gerente agrega, cambia o quita el enlace de SUS locales (mismas validaciones que el dueño).
create or replace function rm_test_private.set_branch_schedule_link(p_local text, p_url text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  clean_url text := nullif(btrim(p_url), '');
  target_org uuid;
  v_ok boolean;
begin
  select l.organization_id into target_org from public.rm_app_local l
  join public.rm_companies c on c.id = l.company_id and c.organization_id = l.organization_id
  where l.id = p_local;
  v_ok := target_org is not null and (
    (rm_test_private.app_role() = 'owner' and rm_test_private.manages_organization(target_org))
    or p_local = any (rm_test_private.gestlok_gerente_locals()));
  if not coalesce(v_ok, false) then
    raise exception 'No tenés permiso para configurar los horarios de este local' using errcode = '42501';
  end if;
  if clean_url is not null and (
    length(clean_url) > 2048 or
    clean_url !~ '^https://docs[.]google[.]com/spreadsheets/d/[A-Za-z0-9_-]+/edit([?#].*)?$'
  ) then
    raise exception 'Ingresá una URL válida de Google Sheets' using errcode = '22023';
  end if;
  insert into rm_test_private.branch_schedule_links(local_id, url, enabled)
  values (p_local, clean_url, true)
  on conflict (local_id) do update set url = excluded.url, enabled = true;
end $$;

-- Identidad: el Gerente de GESTLOK que no es parte de Empleados se identifica sin crear registros.
create or replace function rm_test_private.rm_app_me()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_locals text[]; v_name text; v_email text;
begin
  v_locals := rm_test_private.gestlok_gerente_locals();
  if coalesce(array_length(v_locals, 1), 0) > 0
     and rm_test_private.app_role() = ''
     and not exists (select 1 from public.rm_test_members mm where mm.user_id = rm_test_private.uid()) then
    select lower(btrim(u.email)), left(coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), u.email, 'Gerente'), 120)
      into v_email, v_name from auth.users u where u.id = auth.uid();
    return jsonb_build_object('user_id', auth.uid(), 'email', v_email, 'display_name', v_name,
      'status', 'approved', 'role', null, 'local_id', null, 'local_name', null, 'sheet_id', null,
      'organization_id', null, 'owner_public_id', null, 'account_kind', null,
      'gestlok_gerente', jsonb_build_object('local_ids', to_jsonb(v_locals)));
  end if;
  perform rm_test_private.activate_preapproved_shared_owner();
  return rm_test_private.rm_app_identity()
    || jsonb_build_object('account_kind',
      (select d.account_kind from public.rm_app_directory d where d.user_id = rm_test_private.uid()));
end $$;
