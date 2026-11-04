# Scanner automatic onboarding — release gate (PR #246)

## Confirmed architecture
- Stock app checks `public.gestlok_pilot_access` for the authenticated owner's `tenant_id`, `enabled`, and `plan_code='scanner'` in `public/stock/gestlok-pilot.js`.
- The stock-side company creation entry point is `public/stock/gestlok-creator.js`, invoking `public.gestlok_creator_prepare_company_named`, which delegates to `public.gestlok_creator_prepare_company`.
- `rm_app_create_branch` creates an employee-module `rm_app_local` row with a **text** ID. It is not proven to create the stock app's tenant/local IDs.
- The draft SQL creates `gestlok_scanner_local_enrollment` but **does not** create `gestlok_pilot_access` grants. Thus it does not enable the Scanner UI. The policy is false by default.

## Required before merge
1. Identify the actual stock tenant and branch creation RPCs, including self-service owner signup, and confirm their RLS/authorization model.
2. Implement atomic, server-side Scanner enrollment for eligible **new** tenants/branches, keyed to the stock tenant UUID and authenticated owner UUID. Never infer eligibility from email or company name.
3. Ensure branch selection scopes Caja, POS, stock, price catalog and history to the selected branch; prevent cross-branch reads/writes.
4. Exclude existing tenants and Mi Gusto from any automatic enrollment or backfill; verify existing grants remain unchanged.
5. Exercise new owner signup, company creation, second branch, branch switching, unauthorized users and a Mi Gusto regression with realistic test fixtures.
6. Apply migrations only after schema verification; run unit tests, lint, build, Cypress and deployment checks.

**Release status: BLOCKED.** Green CI on the draft only validates current checks; it is not proof of automatic Scanner access. Do not merge or deploy this PR yet.
