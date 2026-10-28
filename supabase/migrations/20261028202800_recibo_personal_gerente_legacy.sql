-- Gerente existente de ReciboNet: mantiene su rol y puede ver solamente
-- la hoja personal asignada mediante app_sheet(), con autorización temporal.
CREATE OR REPLACE FUNCTION rm_test_private.rm_app_private_receipt_detail()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if rm_test_private.uid() is null or rm_test_private.app_role() not in ('employee','manager') then
   raise exception 'Solo el colaborador o gerente puede consultar su recibo personal'
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
$function$

