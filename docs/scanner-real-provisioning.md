# Scanner: actual provisioning integration plan

## Verified source path
`public/stock/gestlok-creator.js` invokes `public.gestlok_creator_prepare_company_named`, which delegates to `public.gestlok_creator_prepare_company` (see `supabase/migrations/20261024_gestlok_creator_provisioning.sql`). That function creates `gestlok_tenancy.tenants` UUID, `public.docs` local (`loc-...`), owner email membership in `public.docs` `equipo`, and `gestlok_platform.companies`. It is **creator-admin-only**. The owner might not have an `auth.users` UUID when the company is created.

The Scanner UI and RLS require a `gestlok_pilot_access` record with the **same stock tenant UUID** and the **verified auth user UUID**, not the employee-module `rm_app_local` identifier.

## Safe implementation requirement
1. Mark only **new** stock tenants as Scanner at provisioning time in an immutable, server-controlled entitlement record. Do not backfill or infer from company names, logos or email domains.
2. On verified owner sign-in, use a `SECURITY DEFINER` RPC that checks `auth.uid()`, confirmed email, the existing `public.docs` owner membership and the new entitlement's tenant UUID. Prevent email-based impersonation and cross-tenant grants; lock enrollment transactionally.
3. Insert `gestlok_pilot_access(tenant_id,owner_uid,enabled,plan_code)` only after all checks. Do not replace an existing grant; fail closed on owner mismatch.
4. For **new branches of existing eligible owners**, reuse the stock tenant entitlement and separately scope Caja, POS, inventory and prices by the selected `local_id`. Do not create a fake tenant UUID for `rm_app_local`.
5. Keep existing tenants and Mi Gusto unchanged; include regression tests for creator-only provisioning, unverified email, unauthorized user, repeated enrollment, branch switching, and data isolation.

## Critical warning
The current PR migration `20261104213000_scanner_local_enrollment_draft.sql` targets `rm_app_local`, **not** the Stock runtime. Its policy defaults to false and cannot activate the Scanner panel. It must be replaced or excluded from deployment before merge.

**Not verified:** owner self-registration pathway, branch creation pathway in Stock, database schema details of `gestlok_tenancy.tenants` and `gestlok_platform.companies`, live RLS, integration tests. No automatic Scanner access can be claimed yet.
