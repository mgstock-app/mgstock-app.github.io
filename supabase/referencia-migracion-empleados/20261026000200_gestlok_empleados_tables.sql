-- GESTLOK · Administración de empleados: tablas (paso 2/7). Estructura equivalente a la de ReciboNet, vacía.
-- Se omiten las claves foráneas hacia auth.users: la identidad pasa por rm_test_private.uid() / identity_map.
create table public.rm_organizations (
  id uuid not null default gen_random_uuid(),
  name text not null,
  owner_id uuid,
  created_by uuid not null,
  created_at timestamp with time zone not null default now(),
  owner_number text,
  constraint rm_organizations_pkey primary key (id),
  constraint rm_organizations_owner_id_key unique (owner_id),
  constraint rm_organizations_owner_number_key unique (owner_number),
  constraint rm_organizations_name_check check (((length(btrim(name)) >= 1) and (length(btrim(name)) <= 120))),
  constraint rm_organizations_owner_number_check check ((owner_number ~ '^[0-9]{7}$'::text))
);
create table public.rm_companies (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  constraint rm_companies_pkey primary key (id),
  constraint rm_companies_id_organization_id_key unique (id, organization_id),
  constraint rm_companies_name_check check (((length(btrim(name)) >= 1) and (length(btrim(name)) <= 120)))
);
create table public.rm_app_directory (
  user_id uuid not null,
  email text not null,
  display_name text not null,
  status text not null default 'pending'::text,
  created_at timestamp with time zone not null default now(),
  account_kind text,
  constraint rm_app_directory_pkey primary key (user_id),
  constraint rm_app_directory_account_kind_check check ((account_kind = any (array['owner'::text, 'collaborator'::text]))),
  constraint rm_app_directory_status_check check ((status = any (array['pending'::text, 'approved'::text, 'rejected'::text])))
);
create table public.rm_app_images (
  sheet_id text not null,
  image text not null,
  report_version timestamp with time zone not null,
  published_by uuid not null,
  published_at timestamp with time zone not null default now(),
  constraint rm_app_images_pkey primary key (sheet_id),
  constraint rm_app_images_image_check check ((((length(image) >= 30) and (length(image) <= 8388608)) and (image ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'::text)))
);
create table public.rm_app_local (
  id text not null,
  name text not null,
  cycle text not null,
  owner_id uuid,
  created_at timestamp with time zone not null default now(),
  organization_id uuid not null,
  company_id uuid not null,
  constraint rm_app_local_pkey primary key (id),
  constraint rm_app_local_cycle_check check ((cycle = any (array['mensual'::text, 'semanal'::text]))),
  constraint rm_app_local_id_check check ((id ~ '^[A-Za-z0-9_-]{1,80}$'::text)),
  constraint rm_app_local_name_check check (((length(btrim(name)) >= 1) and (length(btrim(name)) <= 80)))
);
create table public.rm_app_settings (
  owner_id uuid not null,
  path text not null,
  data jsonb not null,
  organization_id uuid not null,
  constraint rm_app_settings_pkey primary key (owner_id, organization_id, path),
  constraint rm_app_settings_data_check check ((jsonb_typeof(data) = 'object'::text)),
  constraint rm_app_settings_path_check check ((path = any (array['ajustes/tema'::text, 'ajustes/copia'::text, 'ajustes/nube'::text])))
);
create table public.rm_organization_members (
  user_id uuid not null,
  organization_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint rm_organization_members_pkey primary key (user_id),
  constraint rm_organization_members_user_id_organization_id_key unique (user_id, organization_id)
);
create table public.rm_manager_permissions (
  user_id uuid not null,
  company_id uuid not null,
  organization_id uuid not null,
  can_edit boolean not null default false,
  can_publish boolean not null default false,
  can_comment boolean not null default false,
  constraint rm_manager_permissions_pkey primary key (user_id),
  constraint rm_manager_permissions_check check (((not can_publish) or can_edit))
);
create table public.rm_organization_admins (
  organization_id uuid not null,
  user_id uuid not null,
  granted_by uuid not null,
  constraint rm_organization_admins_pkey primary key (organization_id, user_id)
);
create table public.rm_schedules (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  organization_id uuid not null,
  period text not null,
  starts_on date not null,
  ends_on date not null,
  rows jsonb not null,
  notes text not null default ''::text,
  status text not null default 'draft'::text,
  version integer not null default 1,
  updated_by uuid not null,
  updated_at timestamp with time zone not null default now(),
  published_at timestamp with time zone,
  constraint rm_schedules_pkey primary key (id),
  constraint rm_schedules_company_id_period_starts_on_key unique (company_id, period, starts_on),
  constraint rm_schedules_check check ((((period = 'semanal'::text) and (ends_on = (starts_on + 6))) or ((period = 'mensual'::text) and (starts_on = (date_trunc('month'::text, (starts_on)::timestamp with time zone))::date) and (ends_on = ((starts_on + '1 mon -1 days'::interval))::date)))),
  constraint rm_schedules_notes_check check ((length(notes) <= 4000)),
  constraint rm_schedules_period_check check ((period = any (array['semanal'::text, 'mensual'::text]))),
  constraint rm_schedules_rows_check check (((jsonb_typeof(rows) = 'array'::text) and ((jsonb_array_length(rows) >= 1) and (jsonb_array_length(rows) <= 100)))),
  constraint rm_schedules_status_check check ((status = any (array['draft'::text, 'published'::text])))
);
create table public.rm_schedule_comments (
  id uuid not null default gen_random_uuid(),
  schedule_id uuid not null,
  author_id uuid not null,
  author_name text not null,
  author_role text not null,
  body text not null,
  created_at timestamp with time zone not null default now(),
  constraint rm_schedule_comments_pkey primary key (id),
  constraint rm_schedule_comments_author_role_check check ((author_role = any (array['admin'::text, 'owner'::text, 'manager'::text]))),
  constraint rm_schedule_comments_body_check check (((length(btrim(body)) >= 1) and (length(btrim(body)) <= 2000)))
);
create table public.rm_test_documents (
  path text not null,
  collection text generated always as (regexp_replace(path, '/[^/]+$'::text, ''::text)) stored,
  data jsonb not null,
  updated_at timestamp with time zone not null default now(),
  organization_id uuid not null,
  constraint rm_test_documents_pkey primary key (path),
  constraint rm_test_documents_data_check check ((jsonb_typeof(data) = 'object'::text)),
  constraint rm_test_documents_path_check check ((path ~ '^(hojas/[A-Za-z0-9_-]+(/historial/[A-Za-z0-9_-]+)?|ajustes/(tema|copia|nube)|copias/[A-Za-z0-9_-]+(/hojas/[A-Za-z0-9_-]+(/historial/[A-Za-z0-9_-]+)?)?)$'::text))
);
create table public.rm_test_members (
  user_id uuid not null,
  role text not null,
  sheet_id text,
  local_id text,
  constraint rm_test_members_pkey primary key (user_id),
  constraint rm_test_members_check check (((role <> 'employee'::text) or (sheet_id is not null))),
  constraint rm_test_members_role_check check ((role = any (array['admin'::text, 'owner'::text, 'employee'::text, 'manager'::text])))
);
create table public.rm_test_permissions (
  target_role text not null,
  action text not null,
  enabled boolean not null,
  constraint rm_test_permissions_pkey primary key (target_role, action),
  constraint rm_test_permissions_action_check check ((action = any (array['view_reports'::text, 'view_history'::text, 'edit_reports'::text, 'delete_reports'::text, 'manage_collaborators'::text, 'reopen_access'::text, 'backups'::text, 'restore'::text, 'export_reports'::text]))),
  constraint rm_test_permissions_target_role_check check ((target_role = any (array['owner'::text, 'employee'::text])))
);
create table public.rm_test_registrations (
  user_id uuid not null,
  email text not null,
  display_name text not null,
  requested_local text not null,
  approved_local text,
  status text not null default 'pending'::text,
  sheet_id text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint rm_test_registrations_pkey primary key (user_id),
  constraint rm_test_registrations_approved_local_check check ((approved_local = any (array['dt'::text, 'munro'::text]))),
  constraint rm_test_registrations_display_name_check check (((length(display_name) >= 1) and (length(display_name) <= 120))),
  constraint rm_test_registrations_requested_local_check check ((requested_local = any (array['dt'::text, 'munro'::text]))),
  constraint rm_test_registrations_status_check check ((status = any (array['pending'::text, 'approved'::text])))
);
create table public.rm_test_report_access (
  user_id uuid not null,
  sheet_id text not null,
  report_version timestamp with time zone not null,
  opened_at timestamp with time zone,
  expires_at timestamp with time zone,
  requested_at timestamp with time zone,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  constraint rm_test_report_access_pkey primary key (user_id),
  constraint rm_test_report_access_check check ((((opened_at is null) and (expires_at is null)) or (expires_at = (opened_at + '24:00:00'::interval))))
);
create table public.rm_test_report_views (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  sheet_id text not null,
  report_version timestamp with time zone not null,
  seen_at timestamp with time zone not null,
  expires_at timestamp with time zone not null,
  constraint rm_test_report_views_pkey primary key (id)
);

create table rm_test_private.account_audit (
  id bigint not null generated always as identity,
  actor uuid not null,
  target uuid not null,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamp with time zone not null default now(),
  constraint account_audit_pkey primary key (id)
);
create table rm_test_private.admin_upgrade_backup (
  id boolean not null default true,
  created_at timestamp with time zone not null default clock_timestamp(),
  tables jsonb not null,
  functions jsonb not null,
  constraint admin_upgrade_backup_pkey primary key (id),
  constraint admin_upgrade_backup_id_check check (id)
);
create table rm_test_private.branch_schedule_links (
  local_id text not null,
  url text,
  enabled boolean not null default false,
  constraint branch_schedule_links_pkey primary key (local_id),
  constraint branch_schedule_links_url_check check ((url ~ '^https://docs[.]google[.]com/spreadsheets/d/[A-Za-z0-9_-]+/edit([?#].*)?$'::text))
);
create table rm_test_private.change_audit (
  id bigint not null generated always as identity,
  occurred_at timestamp with time zone not null default clock_timestamp(),
  actor uuid,
  entity text not null,
  operation text not null,
  before_value jsonb,
  after_value jsonb,
  constraint change_audit_pkey primary key (id)
);
create table rm_test_private.company_workspace_links (
  company_id uuid not null,
  source_company_id uuid not null,
  constraint company_workspace_links_pkey primary key (company_id, source_company_id),
  constraint company_workspace_links_check check ((company_id <> source_company_id))
);
create table rm_test_private.general_administrator (
  user_id uuid not null,
  singleton boolean not null default true,
  constraint general_administrator_pkey primary key (user_id),
  constraint general_administrator_singleton_key unique (singleton),
  constraint general_administrator_singleton_check check (singleton)
);
create table rm_test_private.invites (
  email text not null,
  role text not null,
  sheet_id text,
  constraint invites_pkey primary key (email),
  constraint invites_check check (((role <> 'employee'::text) or (sheet_id is not null))),
  constraint invites_role_check check ((role = any (array['owner'::text, 'admin'::text, 'employee'::text])))
);
create table rm_test_private.join_links (
  id uuid not null default gen_random_uuid(),
  token text not null,
  organization_id uuid not null,
  company_id uuid not null,
  local_id text,
  created_by uuid not null,
  expires_at timestamp with time zone not null default (now() + '7 days'::interval),
  revoked_at timestamp with time zone,
  uses integer not null default 0,
  max_uses integer not null default 50,
  constraint join_links_pkey primary key (id),
  constraint join_links_token_key unique (token),
  constraint join_links_max_uses_check check (((max_uses >= 1) and (max_uses <= 500)))
);
create table rm_test_private.join_redemptions (
  link_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint join_redemptions_pkey primary key (link_id, user_id)
);
create table rm_test_private.local_transfer_backups (
  key text not null,
  created_at timestamp with time zone not null default clock_timestamp(),
  tables jsonb not null,
  functions jsonb not null,
  catalog jsonb not null,
  checksum text not null,
  constraint local_transfer_backups_pkey primary key (key)
);
create table rm_test_private.organization_invitations (
  email text not null,
  organization_id uuid not null,
  invited_by uuid not null,
  created_at timestamp with time zone not null default now(),
  company_id uuid,
  constraint organization_invitations_pkey primary key (email)
);
create table rm_test_private.owner_code_counters (
  year integer not null,
  last_number integer not null,
  constraint owner_code_counters_pkey primary key (year),
  constraint owner_code_counters_last_number_check check (((last_number >= 1) and (last_number <= 999)))
);
create table rm_test_private.owner_join_codes (
  organization_id uuid not null,
  token text not null,
  expires_at timestamp with time zone not null,
  updated_by uuid not null,
  constraint owner_join_codes_pkey primary key (organization_id)
);
create table rm_test_private.owner_support_access (
  user_id uuid not null,
  organization_id uuid not null,
  authorized_by uuid not null,
  authorized_at timestamp with time zone not null default clock_timestamp(),
  constraint owner_support_access_pkey primary key (user_id, organization_id),
  constraint owner_support_access_check check ((user_id <> authorized_by))
);
create table rm_test_private.permission_audit (
  id bigint not null generated always as identity,
  actor uuid not null,
  target_role text not null,
  action text not null,
  enabled boolean not null,
  changed_at timestamp with time zone not null default now(),
  constraint permission_audit_pkey primary key (id)
);
create table rm_test_private.personal_owner_allowlist (
  email text not null,
  granted_by uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint personal_owner_allowlist_pkey primary key (email),
  constraint personal_owner_allowlist_email_check check ((email = lower(btrim(email))))
);
create table rm_test_private.preapproved_shared_owners (
  email text not null,
  organization_id uuid not null,
  authorized_by uuid not null,
  authorized_at timestamp with time zone not null default clock_timestamp(),
  activated_by uuid,
  activated_at timestamp with time zone,
  constraint preapproved_shared_owners_pkey primary key (email),
  constraint preapproved_shared_owners_activated_by_key unique (activated_by),
  constraint preapproved_shared_owners_check check (((activated_by is null) = (activated_at is null))),
  constraint preapproved_shared_owners_email_check check (((email = lower(btrim(email))) and ((length(email) >= 5) and (length(email) <= 254))))
);
create table rm_test_private.read_receipts_removal_backup (
  id bigint not null generated always as identity,
  created_at timestamp with time zone not null default now(),
  snapshot jsonb not null,
  constraint read_receipts_removal_backup_pkey primary key (id)
);
create table rm_test_private.registration_audit (
  id bigint not null generated always as identity,
  user_id uuid not null,
  reviewer uuid not null,
  previous_local text,
  approved_local text not null,
  previous_sheet text,
  sheet_id text not null,
  changed_at timestamp with time zone not null default now(),
  constraint registration_audit_pkey primary key (id)
);
create table rm_test_private.restore_snapshots (
  id uuid not null default gen_random_uuid(),
  actor uuid not null,
  created_at timestamp with time zone not null default now(),
  documents jsonb not null,
  constraint restore_snapshots_pkey primary key (id)
);
create table rm_test_private.roles_upgrade_snapshot (
  id bigint not null generated always as identity,
  created_at timestamp with time zone not null default now(),
  snapshot jsonb not null,
  constraint roles_upgrade_snapshot_pkey primary key (id)
);

alter table rm_test_private.branch_schedule_links add constraint branch_schedule_links_local_id_fkey foreign key (local_id) references public.rm_app_local(id);
alter table rm_test_private.company_workspace_links add constraint company_workspace_links_company_id_fkey foreign key (company_id) references public.rm_companies(id);
alter table rm_test_private.company_workspace_links add constraint company_workspace_links_source_company_id_fkey foreign key (source_company_id) references public.rm_companies(id);
alter table rm_test_private.join_links add constraint join_links_company_id_organization_id_fkey foreign key (company_id, organization_id) references public.rm_companies(id, organization_id);
alter table rm_test_private.join_links add constraint join_links_local_id_fkey foreign key (local_id) references public.rm_app_local(id);
alter table rm_test_private.join_links add constraint join_links_organization_id_fkey foreign key (organization_id) references public.rm_organizations(id);
alter table rm_test_private.join_redemptions add constraint join_redemptions_link_id_fkey foreign key (link_id) references rm_test_private.join_links(id);
alter table rm_test_private.organization_invitations add constraint organization_invitations_company_id_organization_id_fkey foreign key (company_id, organization_id) references public.rm_companies(id, organization_id);
alter table rm_test_private.organization_invitations add constraint organization_invitations_organization_id_fkey foreign key (organization_id) references public.rm_organizations(id);
alter table rm_test_private.owner_join_codes add constraint owner_join_codes_organization_id_fkey foreign key (organization_id) references public.rm_organizations(id);
alter table rm_test_private.owner_support_access add constraint owner_support_access_organization_id_fkey foreign key (organization_id) references public.rm_organizations(id) on delete cascade;
alter table rm_test_private.preapproved_shared_owners add constraint preapproved_shared_owners_organization_id_fkey foreign key (organization_id) references public.rm_organizations(id);
alter table public.rm_app_local add constraint rm_app_local_company_id_organization_id_fkey foreign key (company_id, organization_id) references public.rm_companies(id, organization_id);
alter table public.rm_app_local add constraint rm_app_local_organization_id_fkey foreign key (organization_id) references public.rm_organizations(id);
alter table public.rm_app_settings add constraint rm_app_settings_organization_id_fkey foreign key (organization_id) references public.rm_organizations(id);
alter table public.rm_companies add constraint rm_companies_organization_id_fkey foreign key (organization_id) references public.rm_organizations(id);
alter table public.rm_manager_permissions add constraint rm_manager_permissions_company_id_organization_id_fkey foreign key (company_id, organization_id) references public.rm_companies(id, organization_id);
alter table public.rm_manager_permissions add constraint rm_manager_permissions_user_id_organization_id_fkey foreign key (user_id, organization_id) references public.rm_organization_members(user_id, organization_id);
alter table public.rm_organization_admins add constraint rm_organization_admins_organization_id_fkey foreign key (organization_id) references public.rm_organizations(id);
alter table public.rm_organization_members add constraint rm_organization_members_organization_id_fkey foreign key (organization_id) references public.rm_organizations(id);
alter table public.rm_schedule_comments add constraint rm_schedule_comments_schedule_id_fkey foreign key (schedule_id) references public.rm_schedules(id);
alter table public.rm_schedules add constraint rm_schedules_company_id_organization_id_fkey foreign key (company_id, organization_id) references public.rm_companies(id, organization_id);
alter table public.rm_test_documents add constraint rm_test_documents_organization_id_fkey foreign key (organization_id) references public.rm_organizations(id);
alter table public.rm_test_members add constraint rm_test_members_local_id_fkey foreign key (local_id) references public.rm_app_local(id);

create unique index rm_app_local_name on public.rm_app_local using btree (company_id, lower(name));
create unique index rm_company_name on public.rm_companies using btree (organization_id, lower(name));
create index rm_documents_org_collection on public.rm_test_documents using btree (organization_id, collection, path);
create index rm_manager_permissions_company on public.rm_manager_permissions using btree (company_id);
create index rm_organization_admins_user on public.rm_organization_admins using btree (user_id);
create index rm_organization_members_org on public.rm_organization_members using btree (organization_id);
create index rm_schedule_comments_parent on public.rm_schedule_comments using btree (schedule_id, created_at);
create index rm_test_documents_collection on public.rm_test_documents using btree (collection);
create unique index rm_test_one_employee_per_sheet on public.rm_test_members using btree (sheet_id) where (role = 'employee'::text);

-- Todas con RLS activada; los privilegios se otorgan explícitamente en la migración de políticas.
do $$ declare r record; begin
  for r in select schemaname, tablename from pg_tables where (schemaname = 'rm_test_private' and tablename <> 'identity_map') or (schemaname = 'public' and tablename like 'rm\_%') loop
    execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);
    execute format('revoke all on %I.%I from public, anon, authenticated', r.schemaname, r.tablename);
  end loop;
end $$;
