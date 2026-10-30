-- GESTLOK / Empleados: alta/edición de legajos por gerente autorizado del local.
-- Causa raíz: el trigger original SECURITY INVOKER consultaba public.rm_app_local,
-- cuya política SELECT oculta la fila a los gerentes de GESTLOK aunque
-- rm_employee_profile_scope(...) les otorgue permiso para sus legajos.
-- La corrección no modifica los permisos RLS de datos, ni recibos, ni RRHH de terceros.
create or replace function rm_test_private.rm_employee_profile_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $profile$
declare v_invited_staff boolean := false;
begin
  -- Dos rutas independientes:
  -- 1) Dueño/gerente autorizado para crear/completar legajos de su local.
  -- 2) Una invitación privada y vigente que crea el legajo pendiente al
  --    autorregistrar al colaborador (la RPC valida el token previamente).
  -- Una inserción REST de colaborador NO supera la política WITH CHECK
  -- created_by=auth.uid(), porque en esta ruta created_by es el gerente.
  if tg_op='INSERT' and new.needs_completion is true
     and auth.uid() is not null and new.created_by is distinct from auth.uid()
  then
    select exists (
      select 1 from rm_test_private.manager_staff_invites i
      where i.organization_id=new.organization_id
        and i.local_id=new.local_id
        and i.created_by=new.created_by
        and i.redeemed_by is null
        and i.revoked_at is null
        and i.expires_at>clock_timestamp()
    ) and exists (
      select 1 from public.rm_test_members m
      where m.user_id=auth.uid() and m.role='employee'
        and m.local_id=new.local_id
    ) and exists (
      select 1 from public.rm_organization_members om
      where om.user_id=auth.uid() and om.organization_id=new.organization_id
    ) into v_invited_staff;
  end if;

  -- El definer solo resuelve la identidad del local: nunca otorga
  -- acceso general a filas de otras empresas.
  if auth.uid() is null
     or not (coalesce(rm_test_private.rm_employee_profile_scope(new.organization_id,new.local_id),false)
             or v_invited_staff)
  then
    raise exception 'Sin permiso para completar el legajo de este local'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.rm_app_local l
    where l.id=new.local_id and l.organization_id=new.organization_id
  ) then
    raise exception 'Local no pertenece a esta empresa' using errcode = '23514';
  end if;
  if tg_op='UPDATE' then
    if new.id<>old.id
       or new.organization_id<>old.organization_id
       or new.local_id<>old.local_id
       or new.created_by<>old.created_by
       or new.created_at<>old.created_at
    then
      raise exception 'No se puede mover un legajo a otro local ni cambiar su autor original'
        using errcode = '42501';
    end if;
  else
    if new.created_by is distinct from auth.uid() and not v_invited_staff then
      raise exception 'El alta debe corresponder al gerente o a una invitación válida'
        using errcode = '42501';
    end if;
  end if;
  new.first_name=btrim(new.first_name);
  new.last_name=btrim(new.last_name);
  new.phone=btrim(new.phone);
  new.payment_alias=btrim(new.payment_alias);
  new.updated_at=now();
  new.updated_by=auth.uid();
  return new;
end
$profile$;

-- Función exclusivamente de trigger, no un endpoint invocable.
revoke all on function rm_test_private.rm_employee_profile_touch() from public, anon, authenticated;
