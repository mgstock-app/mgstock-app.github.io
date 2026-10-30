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
begin
  -- La función ejecuta con privilegios del propietario exclusivamente para
  -- comprobar pertenencia del local, NO para autorizar cualquier acceso.
  -- Validamos explícitamente el contexto de identidad y el permiso de localidad.
  if auth.uid() is null
     or not coalesce(rm_test_private.rm_employee_profile_scope(new.organization_id,new.local_id),false)
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
    if new.created_by is distinct from auth.uid() then
      raise exception 'El alta debe corresponder a la cuenta autorizada'
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
