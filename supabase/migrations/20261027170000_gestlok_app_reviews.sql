-- Application feedback is private and independent from any tenant's reviews.
create table public.gestlok_app_reviews (
 id uuid primary key default gen_random_uuid(),
 rating integer not null check (rating between 1 and 5),
 comment text check (char_length(comment)<=2000),
 publish_consent boolean not null default false,
 contact_consent boolean not null default false,
 contact_name text check (char_length(contact_name)<=80),
 contact_value text check (char_length(contact_value)<=160),
 created_at timestamptz not null default now(),
 constraint contact_requires_consent check (
  (not contact_consent and contact_name is null and contact_value is null) or
  (contact_consent and contact_name is not null and length(trim(contact_name))>0
   and contact_value is not null and length(trim(contact_value))>=7)
 )
);
alter table public.gestlok_app_reviews enable row level security;
revoke all on public.gestlok_app_reviews from public,anon,authenticated;
grant insert (rating,comment,publish_consent,contact_consent,contact_name,contact_value)
 on public.gestlok_app_reviews to anon;
grant select on public.gestlok_app_reviews to authenticated;
create policy "visitors submit app feedback" on public.gestlok_app_reviews
 for insert to anon with check ((select auth.uid()) is null);
create policy "creator reads private app feedback" on public.gestlok_app_reviews
 for select to authenticated using ((select auth.uid()) is not null and (select public.es_creadora()));
-- No tenant access, public display, update/delete, subscription or discount effects.
