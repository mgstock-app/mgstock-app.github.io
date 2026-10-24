-- Push was paused at owner's request. Keep local alerts only.
select cron.unschedule(jobid) from cron.job where jobname in ('gestlok-push-dispatch','gestlok-digest-2315-argentina');
update public.gestlok_push_devices set enabled=false where enabled=true;
create or replace function public.gestlok_enqueue_alert() returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  loc text; kind text; label text; detail text; actor text; display_actor text;
  old_no_stock boolean := false; new_no_stock boolean := false;
begin
  if new.tenant_id is null or strpos(new.col,'/')=0 then return new; end if;
  if tg_op='UPDATE' and old.data is not distinct from new.data then return new; end if;
  loc:=split_part(new.col,'/',1);
  kind:=split_part(new.col,'/',2);
  if kind not in ('conteos','proveedores','chat','productos','vencimientos') then return new; end if;
  if not exists(select 1 from public.docs l where l.tenant_id=new.tenant_id and l.col='locales' and l.id=loc) then return new; end if;
  select coalesce(l.data->>'nombre',loc) into label from public.docs l
  where l.tenant_id=new.tenant_id and l.col='locales' and l.id=loc;
  actor:=lower(coalesce(new.updated_by,''));
  select coalesce(nullif(x.data->>'nombre',''),split_part(actor,'@',1),'Un integrante')
  into display_actor
  from public.docs x where x.tenant_id=new.tenant_id
    and x.col='equipo' and lower(x.data->>'email')=actor limit 1;
  display_actor:=left(coalesce(nullif(display_actor,''),'Un integrante'),70);
  if kind='conteos' and tg_op='INSERT' then
    if coalesce(new.data->>'hoja',new.data->>'nombreHoja','') ilike '%caja%' then
      label:='Stock Cajas realizado';
    else label:='Conteo realizado';
    end if;
    detail:=display_actor||' guardó un conteo en '||coalesce((select l.data->>'nombre' from public.docs l where l.col='locales' and l.id=loc and l.tenant_id=new.tenant_id),loc);
  elsif kind='proveedores' then
    detail:=display_actor||' actualizó información de proveedores.';
    label:='Proveedores · '||label;
  elsif kind='chat' and tg_op='INSERT' then
    detail:='Hay un mensaje nuevo en el chat del local.';
    label:='Chat interno · '||label;
  elsif kind='vencimientos' then
    detail:=coalesce(new.data->>'nombre','Servicio')||' · Vence '||coalesce(new.data->>'fechaVencimiento','');
    label:='Vencimientos · '||label;
  elsif kind='productos' then
    new_no_stock:=(new.data->>'sinStock'='true') or
      (coalesce(new.data->>'stock','') ~ '^[0-9]+([.][0-9]+)?$'
       and (new.data->>'stock')::numeric=0);
    if tg_op='UPDATE' then
      old_no_stock:=(old.data->>'sinStock'='true') or
        (coalesce(old.data->>'stock','') ~ '^[0-9]+([.][0-9]+)?$'
         and (old.data->>'stock')::numeric=0);
    end if;
    if not new_no_stock or old_no_stock then return new; end if;
    detail:=coalesce(new.data->>'nombre','Un producto')||' quedó sin stock.';
    label:='Stock · '||label;
  else return new;
  end if;
  -- Historial visual dentro de la sucursal; evita guardar textos privados del chat.
  insert into public.docs(col,id,data,tenant_id,updated_by)
  values(loc||'/avisos',gen_random_uuid()::text,
    jsonb_build_object('titulo',left(label,100),'detalle',left(detail,240),'fecha',(extract(epoch from now())*1000)::bigint),
    new.tenant_id,new.updated_by);
  return new;
end $$;
revoke all on function public.gestlok_enqueue_alert() from public, anon, authenticated;
