-- Los recibos del colaborador se calculan exclusivamente desde la planilla
-- PUBLICADA Y AUTORIZADA. La respuesta no incluye empresa, sucursal, alias, teléfono,
-- identificadores de otros trabajadores, observaciones ni rutas de almacenamiento.
create table if not exists public.rm_receipt_visibility_options (
  organization_id uuid primary key references public.rm_organizations(id),
  show_holidays boolean not null default true,
  show_vacations boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.rm_receipt_visibility_options enable row level security;
revoke all on public.rm_receipt_visibility_options from public, anon, authenticated;

create or replace function rm_test_private.rm_receipt_visibility_options(p_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $receipt_options$
begin
 if rm_test_private.uid() is null or not rm_test_private.manages_organization(p_organization)
 then raise exception 'No tenés permiso para ver la configuración de recibos' using errcode='42501'; end if;
 return jsonb_build_object(
   'show_holidays',coalesce((select show_holidays from public.rm_receipt_visibility_options where organization_id=p_organization),true),
   'show_vacations',coalesce((select show_vacations from public.rm_receipt_visibility_options where organization_id=p_organization),true)
 );
end
$receipt_options$;
revoke all on function rm_test_private.rm_receipt_visibility_options(uuid) from public, anon;
grant execute on function rm_test_private.rm_receipt_visibility_options(uuid) to authenticated;

create or replace function rm_test_private.rm_receipt_save_visibility_options(
  p_organization uuid, p_show_holidays boolean, p_show_vacations boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $save_options$
begin
 if rm_test_private.uid() is null or rm_test_private.app_role() <> 'owner'
    or not rm_test_private.manages_organization(p_organization)
 then raise exception 'Solo el dueño puede configurar las opciones' using errcode='42501'; end if;
 if p_show_holidays is null or p_show_vacations is null then raise exception 'Opciones inválidas'; end if;
 insert into public.rm_receipt_visibility_options(
    organization_id,show_holidays,show_vacations,updated_by,updated_at)
 values(p_organization,p_show_holidays,p_show_vacations,rm_test_private.uid(),clock_timestamp())
 on conflict (organization_id) do update
 set show_holidays=excluded.show_holidays,
     show_vacations=excluded.show_vacations,
     updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 return rm_test_private.rm_receipt_visibility_options(p_organization);
end
$save_options$;
revoke all on function rm_test_private.rm_receipt_save_visibility_options(uuid,boolean,boolean) from public, anon;
grant execute on function rm_test_private.rm_receipt_save_visibility_options(uuid,boolean,boolean) to authenticated;

create or replace function public.rm_app_receipt_visibility_options(p_organization uuid)
returns jsonb language sql stable set search_path = ''
as $option_api$
 select rm_test_private.rm_receipt_visibility_options(p_organization)
$option_api$;
revoke all on function public.rm_app_receipt_visibility_options(uuid) from public, anon;
grant execute on function public.rm_app_receipt_visibility_options(uuid) to authenticated;

create or replace function public.rm_app_receipt_save_visibility_options(
 p_organization uuid,p_show_holidays boolean,p_show_vacations boolean)
returns jsonb language sql set search_path = ''
as $save_option_api$
 select rm_test_private.rm_receipt_save_visibility_options(
   p_organization,p_show_holidays,p_show_vacations)
$save_option_api$;
revoke all on function public.rm_app_receipt_save_visibility_options(uuid,boolean,boolean) from public, anon;
grant execute on function public.rm_app_receipt_save_visibility_options(uuid,boolean,boolean) to authenticated;

create or replace function rm_test_private.rm_app_private_receipt_detail()
returns jsonb language plpgsql stable security definer set search_path = ''
as $private_receipt$
declare result jsonb;
begin
 if rm_test_private.uid() is null or rm_test_private.app_role() <> 'employee' then
   raise exception 'Solo el colaborador puede consultar su recibo privado'
   using errcode='42501';
 end if;
 select jsonb_build_object(
   'sheet', jsonb_build_object(
     'nombre',coalesce(d.data->>'nombre',''),
     'puesto',coalesce(d.data->>'puesto','staff'),
     'porTurno',coalesce(d.data->'porTurno','false'::jsonb),
     'extras',coalesce(d.data->'extras','false'::jsonb),
     'ferTarifaPropia',coalesce(d.data->'ferTarifaPropia','false'::jsonb),
     'ausente',coalesce(d.data->'ausente','false'::jsonb),
     'ausJust',coalesce(d.data->'ausJust','false'::jsonb),
     'vac',coalesce(d.data->'vac','false'::jsonb),
     'agu',coalesce(d.data->'agu','false'::jsonb),
     'fecha',coalesce(d.data->>'fecha',''),
     'mes',coalesce(d.data->>'mes',''),
     'anio',coalesce(d.data->>'anio',''),
     'semDesde',coalesce(d.data->>'semDesde',''),
     'semHasta',coalesce(d.data->>'semHasta',''),
     'items',jsonb_build_object(
       'trab',jsonb_build_object('c',d.data#>'{items,trab,c}','i',d.data#>'{items,trab,i}'),
       'extra',jsonb_build_object('c',d.data#>'{items,extra,c}','i',d.data#>'{items,extra,i}'),
       'off',jsonb_build_object('c',d.data#>'{items,off,c}','i',d.data#>'{items,off,i}'),
       'fer',jsonb_build_object('c',d.data#>'{items,fer,c}','i',d.data#>'{items,fer,i}'),
       'aus',jsonb_build_object('c',d.data#>'{items,aus,c}','i',d.data#>'{items,aus,i}'),
       'vac',jsonb_build_object('c',d.data#>'{items,vac,c}','i',d.data#>'{items,vac,i}'),
       'agu',jsonb_build_object('c',d.data#>'{items,agu,c}','i',d.data#>'{items,agu,i}')
     ),
     'tarifas',jsonb_build_object(
       'trab',d.data#>'{tarifas,trab}',
       'extra',d.data#>'{tarifas,extra}',
       'off',d.data#>'{tarifas,off}',
       'fer',d.data#>'{tarifas,fer}',
       'aus',d.data#>'{tarifas,aus}',
       'vac',d.data#>'{tarifas,vac}'
     )
   ),
   'show_holidays',coalesce(o.show_holidays,true),
   'show_vacations',coalesce(o.show_vacations,true),
   'expires_at',a.expires_at,
   'server_now',clock_timestamp()
 ) into result
 from public.rm_app_images i
 join public.rm_test_report_access a
   on a.sheet_id=i.sheet_id and a.report_version=i.published_at
 join public.rm_test_documents d
   on d.path='hojas/'||i.sheet_id and d.updated_at=i.report_version
 left join public.rm_receipt_visibility_options o
   on o.organization_id=d.organization_id
 where a.user_id=rm_test_private.uid()
   and a.sheet_id=rm_test_private.app_sheet()
   and a.opened_at is not null and a.expires_at>clock_timestamp();
 if result is null then raise exception 'La consulta de tu recibo no está habilitada'
   using errcode='42501'; end if;
 return result;
end
$private_receipt$;
revoke all on function rm_test_private.rm_app_private_receipt_detail() from public, anon;
grant execute on function rm_test_private.rm_app_private_receipt_detail() to authenticated;

create or replace function public.rm_app_private_receipt_detail()
returns jsonb language sql stable set search_path = ''
as $private_api$
 select rm_test_private.rm_app_private_receipt_detail()
$private_api$;
revoke all on function public.rm_app_private_receipt_detail() from public,anon;
grant execute on function public.rm_app_private_receipt_detail() to authenticated;
