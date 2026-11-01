-- Stock Cajas de Munro: catálogo independiente, sin copiar existencias de Torcuato.
do $seed$
declare v_tenant uuid := 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'; v_sheet text; r record;
begin
 if not exists(select 1 from public.docs where tenant_id=v_tenant and col='locales' and id='munro') then raise exception 'Local Munro no encontrado'; end if;
 select id into v_sheet from public.docs where tenant_id=v_tenant and col='munro/hojas' and lower(btrim(data->>'nombre'))='stock cajas' limit 1;
 if v_sheet is null then
  v_sheet:='h-s5t5njmbw7';
  insert into public.docs(tenant_id,col,id,data) values(v_tenant,'munro/hojas',v_sheet,jsonb_build_object('nombre','Stock Cajas','tipo','lista','orden',2,'oculta',false,'creado',floor(extract(epoch from clock_timestamp())*1000))) on conflict do nothing;
 end if;
 for r in select * from (values
 ('caja-2','Caja de 2',1),('caja-3','Caja de 3',2),('caja-6','Caja de 6',3),('caja-8','Caja de 8',4),('caja-12','Caja de 12',5),('pizza-grande','Pizza Grande',6),('pizza-indi','Pizza indi',7),('servilletas','Cajas Servilletas',8)
 ) as p(code,name,position) loop
  if not exists(select 1 from public.docs where tenant_id=v_tenant and col='munro/productos' and data->>'hoja'=v_sheet and lower(btrim(data->>'nombre'))=lower(r.name)) then
   insert into public.docs(tenant_id,col,id,data) values(v_tenant,'munro/productos','munro-cajas-'||r.code,jsonb_build_object('nombre',r.name,'cat','Cajas','hoja',v_sheet,'orden',r.position,'unidad','unidad','stock',null,'min',null,'obs','','sinStock',false,'proveedor','Grafica','creado',floor(extract(epoch from clock_timestamp())*1000))) on conflict do nothing;
  end if;
 end loop;
end $seed$;
CREATE OR REPLACE FUNCTION public.gestlok_navigation_save(p_tenant uuid, p_local text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb; v_id text; v_name text; v_target text; v_seen text[]:='{}';
begin
 perform gestlok_platform.require_admin();
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>35 then
   raise exception 'Máximo 35 categorías' using errcode='22023';end if;
 if not exists(select 1 from public.docs d where d.tenant_id=p_tenant and d.col='locales' and d.id=p_local) then
   raise exception 'Local inexistente' using errcode='22023';end if;
 for v in select value from jsonb_array_elements(p_items) loop
   v_id:=v->>'id';v_name:=btrim(coalesce(v->>'label',''));v_target:=v->>'target';
   if v_id is null or v_id=any(v_seen) or
    char_length(v_name) not between 2 and 45 or
    v_name ~ '[<>]' or
    v_id !~ '^(inicio|stock|stock-cajas|proveedores|chat|vencimientos|avisos|motos|resenas|reclamos-internos|cierre-online|pedidos-online|tienda-online|adm-local|pedido|conteo|fabrica|historial|ingreso|custom-[a-z0-9-]{1,36})$'
   then raise exception 'Categoría duplicada o inválida' using errcode='22023';end if;
   if v_id like 'custom-%' and (v_target is null or v_target not in ('stock','proveedores','chat','vencimientos','avisos','pedido','conteo','historial')) then
     raise exception 'Un acceso nuevo debe abrir una pantalla existente y autorizada' using errcode='22023';end if;
   v_seen:=array_append(v_seen,v_id);
 end loop;
 insert into gestlok_platform.navigation_layouts(tenant_id,local_id,items,updated_by)
 values(p_tenant,p_local,p_items,auth.uid())
 on conflict(tenant_id,local_id) do update set items=excluded.items,updated_by=auth.uid(),updated_at=now();
 return p_items;
end $function$
;

