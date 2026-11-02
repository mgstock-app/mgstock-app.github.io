-- Liquidación semanal de Munro: Premio, categorías propias del local y orden común (pedido de la usuaria del 02/11/2026).
-- Respuestas de la usuaria: el recibo lo carga solo el dueño; las categorías valen para todos los colaboradores del local
-- (el importe se carga a mano en cada recibo); el orden es el mismo para todos. Torcuato queda como está.
--
-- 1) Permite guardar la configuración del local en rm_test_documents con la ruta liquidacion/<local>
--    (categorías: nombre y si suma o resta; orden de los conceptos). Leen y escriben solo quienes administran
--    la organización (dueño y creadora), con las mismas políticas de siempre.
-- 2) La organización de ese documento sale del local: nadie puede ocupar la ruta de un local de otro espacio.
-- 3) El total que guarda el historial al enviar (Aplicación o WhatsApp) suma el Premio y las categorías propias
--    (las que restan, restan), igual que la planilla, el PDF y el recibo del colaborador.
-- No modifica datos.

alter table public.rm_test_documents drop constraint rm_test_documents_path_check;
alter table public.rm_test_documents add constraint rm_test_documents_path_check check (path ~ '^(hojas/[A-Za-z0-9_-]+(/historial/[A-Za-z0-9_-]+)?|ajustes/(tema|copia|nube)|copias/[A-Za-z0-9_-]+(/hojas/[A-Za-z0-9_-]+(/historial/[A-Za-z0-9_-]+)?)?|liquidacion/[A-Za-z0-9_-]+)$');

create or replace function rm_test_private.document_organization()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare expected uuid;
begin
 if new.path like 'hojas/%/historial/%' then
  select organization_id into expected from public.rm_test_documents where path='hojas/'||split_part(new.path,'/',2);
 elsif new.path like 'hojas/%' then
  select organization_id into expected from public.rm_app_local where id=rm_test_private.sheet_local(new.path,new.data,new.organization_id);
 elsif new.path like 'copias/%/%' then
  select organization_id into expected from public.rm_test_documents where path='copias/'||split_part(new.path,'/',2);
 elsif new.path like 'liquidacion/%' then
  select organization_id into expected from public.rm_app_local where id=split_part(new.path,'/',2);
 else expected=new.organization_id;
 end if;
 if expected is null or (new.organization_id is not null and new.organization_id<>expected) then raise exception 'Organización inválida' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.path<>old.path or expected<>old.organization_id) then raise exception 'No se puede mover información entre espacios' using errcode='42501'; end if;
 new.organization_id=expected;
 return new;
end $function$;

create or replace function rm_test_private.record_delivery(p_sheet text, p_version timestamp with time zone, p_channel text, p_contact jsonb default null::jsonb)
 returns timestamp with time zone
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare d public.rm_test_documents; sent timestamptz=clock_timestamp(); version timestamptz; snapshot jsonb; total numeric;
begin
 if not coalesce(rm_test_private.manages_sheet(p_sheet),false) then raise exception 'Delivery not permitted' using errcode='42501'; end if;
 if p_channel not in ('Aplicación','WhatsApp') or p_channel is null then raise exception 'Invalid delivery channel'; end if;
 select * into d from public.rm_test_documents where path='hojas/'||p_sheet for update;
 if d.path is null or d.updated_at is distinct from p_version then raise exception 'El reporte cambió. Actualizá antes de compartir.'; end if;
 if p_contact is not null and (jsonb_typeof(p_contact)<>'object' or length(p_contact::text)>500) then raise exception 'Invalid contact'; end if;
 select coalesce(sum(case when key='aus' then -abs(coalesce((value->>'i')::numeric,0)) else coalesce((value->>'i')::numeric,0) end),0)
 into total from jsonb_each(coalesce(d.data->'items','{}'))
 where key in ('trab','off','fer') or
 (key='aus' and coalesce((d.data->>'ausente')::boolean,false) and not coalesce((d.data->>'ausJust')::boolean,false)) or
 (key='vac' and coalesce((d.data->>'vac')::boolean,false)) or
 (key='agu' and coalesce((d.data->>'agu')::boolean,false));
 -- Premio (Munro): suma salvo que el dueño lo haya desactivado.
 if (d.data->'premio') is distinct from 'false'::jsonb and jsonb_typeof(d.data->'items'->'premio'->'i')='number' then
  total=total+(d.data->'items'->'premio'->>'i')::numeric;
 end if;
 -- Categorías propias del local: cada una suma o resta su importe.
 if jsonb_typeof(d.data->'cats')='array' then
  total=total+coalesce((select sum(case when c->>'signo'='resta' then -abs((c->>'i')::numeric) else abs((c->>'i')::numeric) end)
   from jsonb_array_elements(d.data->'cats') c where jsonb_typeof(c->'i')='number'),0);
 end if;
 snapshot=d.data||jsonb_build_object('registrado',sent,'enviadoA',p_channel,'total',round(total,2),
 'periodo',case when coalesce(d.data->>'semDesde','')<>'' then concat(d.data->>'semDesde',' al ',d.data->>'semHasta') else concat_ws(' ',d.data->>'mes',d.data->>'anio') end);
 insert into public.rm_test_documents(path,data,organization_id)
 values('hojas/'||p_sheet||'/historial/'||gen_random_uuid()::text,snapshot,d.organization_id);
 update public.rm_test_documents set data=data||jsonb_build_object('ultimaExport',sent,'envioMedio',p_channel)||
 case when p_contact is null then '{}'::jsonb else jsonb_build_object('contacto',p_contact) end
 where path=d.path returning updated_at into version;
 -- Sending via another medium does not invalidate an unchanged published image.
 update public.rm_app_images set report_version=version where sheet_id=p_sheet and report_version=p_version;
 return version;
end $function$;
