-- Estructura de marcas para la base aislada; sin insertar IDs ni datos de producción.
-- Basada en 20261120163305_gestlok_creator_brand_groups_add_local_owner.sql.
create table if not exists gestlok_platform.brand_memberships (
 tenant_id uuid primary key references gestlok_tenancy.tenants(id) on delete restrict,
 root_tenant uuid not null references gestlok_tenancy.tenants(id) on delete restrict,
 brand_name text not null check(length(btrim(brand_name)) between 2 and 100),
 created_at timestamptz not null default now()
);
revoke all on gestlok_platform.brand_memberships from public,anon,authenticated;
alter table gestlok_platform.brand_memberships enable row level security;
create index if not exists brand_memberships_root_idx on gestlok_platform.brand_memberships(root_tenant);
