-- GESTLOK Caja · fotos antes del cierre (16/11/2026). Etapa 3 del plan.
-- La lógica ya existía (qué fotos pide el comercio, caja_app_registrar_foto, bloqueo del cierre si faltan). Faltaba
-- dónde guardarlas: un depósito privado con reglas por comercio. Ruta: <comercio>/<caja>/<archivo>.
-- - Sube: la cuenta dueña o una persona activa del equipo que trabaja en ese local, y solo mientras la caja está abierta.
-- - Ve: la cuenta dueña y las personas activas de ese local. Nadie de otro comercio.
-- - Nadie modifica ni quita una foto (no hay reglas para eso).
-- Solo agrega; no cambia datos existentes ni otros depósitos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caja-app-fotos', 'caja-app-fotos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.caja_app_foto_permitida(p_nombre text, p_subir boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.uid() is not null and p_subir is not null
    and p_nombre ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp)$'
    and exists (
      select 1 from caja_app.cajas c
        join caja_app.comercios co on co.id = c.comercio_id and co.estado = 'activo'
        join caja_app.miembros m on m.comercio_id = c.comercio_id and m.user_id = auth.uid()
        left join caja_app.personas p on p.comercio_id = c.comercio_id and p.user_id = auth.uid()
      where c.comercio_id::text = split_part(p_nombre, '/', 1) and c.id::text = split_part(p_nombre, '/', 2)
        and (m.rol = 'dueno' or (p.activo and (cardinality(p.locales) = 0 or c.local_id = any (p.locales))))
        and (not p_subir or c.estado = 'abierta')), false)
$$;
revoke all on function public.caja_app_foto_permitida(text, boolean) from public, anon;
grant execute on function public.caja_app_foto_permitida(text, boolean) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'caja_app_fotos_ver') then
    create policy caja_app_fotos_ver on storage.objects for select to authenticated
      using (bucket_id = 'caja-app-fotos' and public.caja_app_foto_permitida(name, false));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'caja_app_fotos_subir') then
    create policy caja_app_fotos_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'caja-app-fotos' and public.caja_app_foto_permitida(name, true));
  end if;
end $$;
