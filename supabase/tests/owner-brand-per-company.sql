-- La marca (logo y nombre) vale para todos los dueños de la empresa y no se filtra a otras. Datos ficticios; se revierte.
begin;
insert into gestlok_tenancy.tenants(id,code) values
 ('00000000-0000-4000-8000-0000000000d1','brand-fixture-a'),('00000000-0000-4000-8000-0000000000d2','brand-fixture-b');
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000000d3','owner-1@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000000d4','owner-2@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000000d5','owner-other@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000000d6','manager-brand@example.invalid',now());
insert into public.docs(col,id,data,tenant_id) values
 ('locales','brand-local','{"nombre":"Local ficticio"}','00000000-0000-4000-8000-0000000000d1'),
 ('equipo','owner-1@example.invalid','{"email":"owner-1@example.invalid","rol":"dueno","logoId":"mi-gusto"}','00000000-0000-4000-8000-0000000000d1'),
 ('equipo','owner-2@example.invalid','{"email":"owner-2@example.invalid","rol":"dueno"}','00000000-0000-4000-8000-0000000000d1'),
 ('equipo','manager-brand@example.invalid','{"email":"manager-brand@example.invalid","rol":"gerente","logoId":"mi-gusto","locales":["brand-local"]}','00000000-0000-4000-8000-0000000000d2'),
 ('equipo','owner-other@example.invalid','{"email":"owner-other@example.invalid","rol":"dueno"}','00000000-0000-4000-8000-0000000000d2');
set local role authenticated;
-- Dueño con marca asignada y dueño nuevo de la misma empresa: ambos ven el logo y el nombre.
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000d3","email":"owner-1@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; begin x:=public.gestlok_owner_area_context();
 if x->>'logo_id'<>'mi-gusto' or x->>'company_name'<>'Mi Gusto' then raise exception 'Owner with brand lost it: %',x;end if;end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000d4","email":"owner-2@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; begin x:=public.gestlok_owner_area_context();
 if x->>'logo_id'<>'mi-gusto' or x->>'company_name'<>'Mi Gusto' then raise exception 'New owner of the company did not inherit the brand: %',x;end if;
 if jsonb_typeof(x->'modules')<>'object' or x->'modules'->'comercial'->>'authorized' is null then raise exception 'Context shape changed';end if;end $$;
-- Otra empresa: no hereda la marca aunque un gerente ajeno tenga el campo cargado.
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000d5","email":"owner-other@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; begin x:=public.gestlok_owner_area_context();
 if x->>'logo_id' is not null or x->>'company_name'<>'Mi empresa' then raise exception 'Other company inherited the brand: %',x;end if;end $$;
-- Un gerente sigue sin acceder al contexto de dueño.
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000d6","email":"manager-brand@example.invalid","role":"authenticated"}';
do $$ begin begin perform public.gestlok_owner_area_context();raise exception 'Manager got owner context';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
select 'PASS: brand belongs to the company for all its owners; other companies and managers unaffected; fixtures rolled back' as verification;
