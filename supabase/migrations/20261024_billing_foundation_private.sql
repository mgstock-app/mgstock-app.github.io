-- GestLok: private billing foundation. No paywall, no live charges.
-- IMPORTANT: this schema is NOT exposed by the Supabase Data API.
-- Existing inventory, chat, auth, roles and docs are untouched.
create schema if not exists gestlok_billing;
revoke all on schema gestlok_billing from public, anon, authenticated;
grant usage on schema gestlok_billing to service_role;

create table if not exists gestlok_billing.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists gestlok_billing.license_grants (
  account_id uuid primary key references gestlok_billing.accounts(id) on delete restrict,
  license_kind text not null default 'complimentary_unlimited'
    check (license_kind in ('complimentary_unlimited')),
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  internal_note text not null default '',
  updated_at timestamptz not null default now(),
  constraint active_grant_not_revoked check (not is_active or revoked_at is null),
  constraint valid_grant_dates check (ends_at is null or ends_at > starts_at)
);

create table if not exists gestlok_billing.subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references gestlok_billing.accounts(id) on delete restrict,
  provider text not null default 'mercadopago' check (provider in ('mercadopago')),
  provider_subscription_id text unique,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'paused', 'cancelled', 'failed')),
  plan_code text,
  period_end timestamptz,
  last_payment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table gestlok_billing.accounts enable row level security;
alter table gestlok_billing.license_grants enable row level security;
alter table gestlok_billing.subscriptions enable row level security;

revoke all on all tables in schema gestlok_billing from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema gestlok_billing to service_role;

-- All future billing tables remain server-only by default.
alter default privileges in schema gestlok_billing revoke all on tables from public, anon, authenticated;

comment on schema gestlok_billing is 'Server-only billing and manual licensing. Never expose to anon/authenticated.';
comment on table gestlok_billing.license_grants is 'Individual complimentary grants; a revoked row can only be modified by a trusted server/admin.';
comment on table gestlok_billing.subscriptions is 'Reserved for verified Mercado Pago subscription events. No billing enforcement is active.';
