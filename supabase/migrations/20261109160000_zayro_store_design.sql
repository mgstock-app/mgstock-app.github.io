-- ZAYRO · Tabla de diseño aplicada a la tienda pública https://gestlok.com.ar/zayro/ (09/11/2026).
-- Reutiliza public.gestlok_design_overrides con la página fija 'zayro:tienda' de la empresa ZAYRO.
-- Escriben solo: la dueña verificada (camilab.lopez99@gmail.com, gestlok_zayro_is_owner())
-- o la Administradora General verificada (gestlok_platform.admins).
-- Los visitantes leen únicamente ancla, tipo y texto de esa página. Solo texto, nunca HTML.
-- Aditiva: no modifica ni borra datos ni permisos existentes.

create unique index if not exists gestlok_design_overrides_zayro_store_uidx
  on public.gestlok_design_overrides (tenant_id, page, anchor, kind)
  where page = 'zayro:tienda';

create or replace function public.gestlok_zayro_design_can_edit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    public.gestlok_zayro_is_owner()
    or exists (select 1 from gestlok_platform.admins a where a.user_id = (select auth.uid()))
  );
$$;
revoke all on function public.gestlok_zayro_design_can_edit() from public, anon;
grant execute on function public.gestlok_zayro_design_can_edit() to authenticated;

-- Lectura pública: lo que ve cualquier visitante de la tienda.
create or replace function public.gestlok_zayro_public_design()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('anchor', o.anchor, 'kind', o.kind, 'value', o.value)
                            order by o.created_at), '[]'::jsonb)
  from public.gestlok_design_overrides o
  where o.tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
    and o.page = 'zayro:tienda';
$$;
revoke all on function public.gestlok_zayro_public_design() from public;
grant execute on function public.gestlok_zayro_public_design() to anon, authenticated;

-- Guardar un cambio (texto, ocultar o bloque nuevo). Un cambio por ancla y tipo.
create or replace function public.gestlok_zayro_design_save(p_anchor text, p_kind text, p_value text, p_original text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value text := btrim(coalesce(p_value, ''));
  v_row public.gestlok_design_overrides;
begin
  if not public.gestlok_zayro_design_can_edit() then
    raise exception 'Solo la dueña de ZAYRO o la Administradora General pueden diseñar la tienda.' using errcode = '42501';
  end if;
  if p_anchor is null or p_anchor !~ '^[a-z0-9][a-z0-9._-]{0,79}$' then
    raise exception 'Elemento inválido.' using errcode = '22023';
  end if;
  if p_kind not in ('text', 'hide', 'add') then
    raise exception 'Tipo de cambio inválido.' using errcode = '22023';
  end if;
  if p_kind = 'hide' then v_value := ''; end if;
  if p_kind in ('text', 'add') and (char_length(v_value) = 0 or char_length(v_value) > 2000) then
    raise exception 'El texto debe tener entre 1 y 2000 caracteres.' using errcode = '22023';
  end if;
  insert into public.gestlok_design_overrides (tenant_id, page, anchor, original, kind, value, created_by)
  values ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid, 'zayro:tienda', p_anchor,
          left(coalesce(p_original, ''), 500), p_kind, v_value, (select auth.uid()))
  on conflict (tenant_id, page, anchor, kind) where page = 'zayro:tienda'
  do update set value = excluded.value, updated_at = now()
  returning * into v_row;
  return jsonb_build_object('anchor', v_row.anchor, 'kind', v_row.kind, 'value', v_row.value);
end;
$$;
revoke all on function public.gestlok_zayro_design_save(text, text, text, text) from public, anon;
grant execute on function public.gestlok_zayro_design_save(text, text, text, text) to authenticated;

-- Quitar un cambio (p_kind null = todos los cambios de ese elemento; p_anchor null = toda la tienda).
create or replace function public.gestlok_zayro_design_remove(p_anchor text default null, p_kind text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.gestlok_zayro_design_can_edit() then
    raise exception 'Solo la dueña de ZAYRO o la Administradora General pueden diseñar la tienda.' using errcode = '42501';
  end if;
  delete from public.gestlok_design_overrides o
  where o.tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
    and o.page = 'zayro:tienda'
    and (p_anchor is null or o.anchor = p_anchor)
    and (p_kind is null or o.kind = p_kind);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.gestlok_zayro_design_remove(text, text) from public, anon;
grant execute on function public.gestlok_zayro_design_remove(text, text) to authenticated;
