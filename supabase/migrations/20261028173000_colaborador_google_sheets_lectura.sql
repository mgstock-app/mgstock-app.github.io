-- Enlace privado a horarios: solo para la persona aprobada y asignada a este local.
-- NO amplía SELECT sobre hojas de sueldo ni las demás planillas.
-- La autorización de edición de Google Drive se administra en Google (rol Lector).
create or replace function rm_test_private.rm_employee_schedule_view()
returns jsonb
language sql stable security definer
set search_path = ''
as $employee_schedule$
  select coalesce((
    select jsonb_build_object('local_id', l.id, 'local_name', l.name, 'url', s.url)
    from public.rm_test_members m
    join public.rm_app_directory d on d.user_id = m.user_id
    join public.rm_organization_members om on om.user_id = m.user_id
    join public.rm_app_local l
      on l.id = m.local_id and l.organization_id = om.organization_id
    join rm_test_private.branch_schedule_links s
      on s.local_id = l.id and s.enabled and s.url is not null
    where m.user_id = rm_test_private.uid()
      and m.role = 'employee'
      and rm_test_private.app_role() = 'employee'
      and d.status = 'approved'
      and rm_test_private.verified_email(d.email)
    limit 1
  ), '{}'::jsonb)
$employee_schedule$;

revoke all on function rm_test_private.rm_employee_schedule_view() from public, anon;
grant execute on function rm_test_private.rm_employee_schedule_view() to authenticated;

create or replace function public.rm_app_employee_schedule_view()
returns jsonb
language sql stable
set search_path = ''
as $employee_schedule$
  select rm_test_private.rm_employee_schedule_view()
$employee_schedule$;
revoke all on function public.rm_app_employee_schedule_view() from public, anon;
grant execute on function public.rm_app_employee_schedule_view() to authenticated;

comment on function public.rm_app_employee_schedule_view() is
'Only the signed-in approved employee assigned to a local receives that local Google Sheets URL. Editing rights are enforced by Google Drive ACLs.';
