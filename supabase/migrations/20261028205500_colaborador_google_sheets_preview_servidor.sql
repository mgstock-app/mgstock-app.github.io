-- Security hardening: a collaborator's API response only contains a
-- Google Sheets /preview URL, never the editable /edit shortcut.
-- This does not grant or revoke Google Drive ACLs: direct edit permissions
-- MUST remain 'reader' for collaborators in Drive itself.
create or replace function rm_test_private.rm_employee_schedule_view()
returns jsonb
language sql stable security definer
set search_path = ''
as $employee_schedule$
  select coalesce((
    select jsonb_build_object(
      'local_id', l.id,
      'local_name', l.name,
      'url',
        'https://docs.google.com/spreadsheets/d/'
        || substring(s.url from '^https://docs[.]google[.]com/spreadsheets/d/([A-Za-z0-9_-]+)/edit')
        || '/preview'
        || case
          when substring(s.url from '[?#&]gid=([0-9]+)') is not null
          then '?gid=' || substring(s.url from '[?#&]gid=([0-9]+)')
          else ''
        end
    )
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
      and s.url ~ '^https://docs[.]google[.]com/spreadsheets/d/[A-Za-z0-9_-]+/edit([?#].*)?$'
    limit 1
  ), '{}'::jsonb)
$employee_schedule$;

revoke all on function rm_test_private.rm_employee_schedule_view() from public, anon;
grant execute on function rm_test_private.rm_employee_schedule_view() to authenticated;

comment on function rm_test_private.rm_employee_schedule_view() is
'Authenticated assigned employees receive only an allowlisted Google Sheets /preview URL for their local; Google Drive ACLs must independently grant reader, not editor.';
