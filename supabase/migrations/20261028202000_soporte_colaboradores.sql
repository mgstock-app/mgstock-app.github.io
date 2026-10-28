-- El teléfono global de soporte puede ser leído por cualquier usuario
-- aprobado del módulo de Empleados. La edición sigue siendo SOLO creadora.
-- No se concede lectura de otras tablas ni se cambia política de escritura.
create policy gestlok_support_employee_read
on public.gestlok_support_settings for select to authenticated
using (
 id='global' and auth.uid() is not null
 and exists(
  select 1 from public.rm_app_directory d
  join public.rm_test_members m on m.user_id=d.user_id
  where d.user_id=auth.uid() and d.status='approved'
   and m.role in ('employee','manager','owner')
   and lower(btrim(d.email))=lower(coalesce(auth.jwt()->>'email',''))
   and exists(select 1 from auth.users u where u.id=d.user_id
     and u.email_confirmed_at is not null)
 )
);
