-- GESTLOK application reviews; independent of Mi Gusto local reviews
create table if not exists public.gestlok_app_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 2000),
  publish_consent boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id)
);
alter table public.gestlok_app_reviews enable row level security;
revoke all on public.gestlok_app_reviews from anon;
grant select,insert on public.gestlok_app_reviews to authenticated;
create policy "read own app review" on public.gestlok_app_reviews for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own app review" on public.gestlok_app_reviews for insert to authenticated with check (user_id = (select auth.uid()));
-- No public read policy. Public display requires explicit moderation and consent.
-- No subscription or reward side effects.
