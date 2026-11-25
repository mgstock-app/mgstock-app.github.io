-- Carta visual opcional por sucursal. Los locales de la marca existente heredan su carta.
alter table gestlok_chat_private.sucursales add column if not exists carta_visual_activa boolean;
alter table gestlok_chat_private.sucursales add column if not exists carta_visual_hojas jsonb not null default '[]'::jsonb;
alter table gestlok_chat_private.sucursales add column if not exists carta_visual_revision integer not null default 0;
-- Imágenes expresamente públicas, separadas de adjuntos privados. 8 posiciones, dos revisiones por posición.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('gestlok-chat-cartas','gestlok-chat-cartas',true,1500000,array['image/webp'])
 on conflict(id) do nothing;
create or replace function public.gestlok_chat_carta_puede_escribir(p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(p_path,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[1-8]-[ab][.]webp$' then return false; end if;
 return coalesce(gestlok_chat_private.nivel(split_part(p_path,'/',1)::uuid)='configurar',false);
end $$;
revoke all on function public.gestlok_chat_carta_puede_escribir(text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_carta_puede_escribir(text) to authenticated;
drop policy if exists carta_visual_insert on storage.objects;
create policy carta_visual_insert on storage.objects for insert to authenticated with check(bucket_id='gestlok-chat-cartas' and public.gestlok_chat_carta_puede_escribir(name));
drop policy if exists carta_visual_update on storage.objects;
create policy carta_visual_update on storage.objects for update to authenticated using(bucket_id='gestlok-chat-cartas' and public.gestlok_chat_carta_puede_escribir(name)) with check(bucket_id='gestlok-chat-cartas' and public.gestlok_chat_carta_puede_escribir(name));
drop policy if exists carta_visual_select on storage.objects;
create policy carta_visual_select on storage.objects for select to authenticated using(bucket_id='gestlok-chat-cartas' and public.gestlok_chat_carta_puede_escribir(name));

create or replace function public.gestlok_chat_panel_carta_visual(p_sucursal uuid,p_enabled boolean default null,p_hojas jsonb default null,p_revision integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_chat_private.sucursales; h jsonb; marca boolean; slots integer[]:='{}'; pos integer;
begin
 perform gestlok_chat_private.exigir(p_sucursal,case when p_enabled is null then 'ver' else 'configurar' end);
 select * into s from gestlok_chat_private.sucursales where id=p_sucursal;
 if s.id is null then raise exception 'Sucursal inexistente' using errcode='P0002'; end if;
 marca:=gestlok_chat_private.es_marca_mi_gusto(s.tenant_id);
 if p_enabled is not null then
  if p_revision is null or p_hojas is null or jsonb_typeof(p_hojas)<>'array' or jsonb_array_length(p_hojas)>8 then raise exception 'Carta inválida' using errcode='22023'; end if;
  if p_enabled and jsonb_array_length(p_hojas)=0 and not marca then raise exception 'Cargá una imagen antes de activar la carta' using errcode='22023'; end if;
  for h in select value from jsonb_array_elements(p_hojas) loop
   if jsonb_typeof(h)<>'object' or jsonb_typeof(h->'slot') is distinct from 'number' or coalesce(h->>'slot','') !~ '^[1-8]$' or jsonb_typeof(h->'titulo') is distinct from 'string' or length(btrim(h->>'titulo')) not between 1 and 80 or jsonb_typeof(h->'promo') is distinct from 'boolean' or jsonb_typeof(h->'path') is distinct from 'string' or (h - array['slot','titulo','promo','path'])<>'{}'::jsonb then raise exception 'Imagen inválida' using errcode='22023'; end if;
   pos:=(h->>'slot')::integer;
   if pos=any(slots) or h->>'path' not in (s.id::text||'/'||pos||'-a.webp',s.id::text||'/'||pos||'-b.webp') or not exists(select 1 from storage.objects o where o.bucket_id='gestlok-chat-cartas' and o.name=h->>'path') then raise exception 'Imagen no disponible en esta sucursal' using errcode='22023'; end if;
   slots:=array_append(slots,pos);
  end loop;
  update gestlok_chat_private.sucursales set carta_visual_activa=p_enabled,carta_visual_hojas=p_hojas,carta_visual_revision=carta_visual_revision+1,actualizada_at=now()
    where id=s.id and carta_visual_revision=p_revision returning * into s;
  if not found then raise exception 'La carta cambió. Volvé a abrirla.' using errcode='40001'; end if;
  perform gestlok_chat_private.auditar(s.id,'carta_visual_guardar',jsonb_build_object('activa',p_enabled,'imagenes',jsonb_array_length(p_hojas)));
 end if;
 return jsonb_build_object('enabled',coalesce(s.carta_visual_activa,marca),'marca',marca,'hojas',s.carta_visual_hojas,'revision',s.carta_visual_revision);
end $$;
revoke all on function public.gestlok_chat_panel_carta_visual(uuid,boolean,jsonb,integer) from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_carta_visual(uuid,boolean,jsonb,integer) to authenticated;

-- No exponer cartas deshabilitadas en la respuesta del chat. No modificar el cálculo del pedido.
do $$
declare d text; ancla text:='else null end)';
begin
 d:=pg_get_functiondef('gestlok_chat_private.sucursal_publica(gestlok_chat_private.sucursales)'::regprocedure);
 if position('''carta_visual_activa''' in d)=0 then
  if position('''carta_visual_marca''' in d)=0 or position(ancla in d)=0 then raise exception 'Aplicar primero la carta visual de marca'; end if;
  execute replace(d,ancla,'else null end, ''carta_visual_activa'', coalesce(s.carta_visual_activa,gestlok_chat_private.es_marca_mi_gusto(s.tenant_id)), ''carta_visual_hojas'', case when coalesce(s.carta_visual_activa,gestlok_chat_private.es_marca_mi_gusto(s.tenant_id)) then s.carta_visual_hojas else ''[]''::jsonb end, ''carta_visual_revision'', s.carta_visual_revision)');
 end if;
end $$;
