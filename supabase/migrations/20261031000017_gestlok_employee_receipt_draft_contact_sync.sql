-- GESTLOK / audit 2026-10-30: mantener teléfono y alias del legajo
-- sincronizados con la planilla BORRADOR personal, incluso al corregir el legajo.
-- Nunca reescribir recibos publicados o con historial, ni conceptos, importes o fórmulas.
create or replace function rm_test_private.staff_initial_legajo_to_sheet()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_sheet text; v_name text;
begin
  if new.needs_completion or auth.uid() is null then return new; end if;
  if old.needs_completion is not distinct from new.needs_completion
     and old.first_name is not distinct from new.first_name
     and old.last_name is not distinct from new.last_name
     and old.phone is not distinct from new.phone
     and old.payment_alias is not distinct from new.payment_alias
     and old.started_on is not distinct from new.started_on
  then return new; end if;

  -- Nunca buscar por nombre/apodo: usar la invitación aceptada por esta cuenta,
  -- el perfil propio y la pertenencia exacta de empresa y sucursal.
  select m.sheet_id into v_sheet
  from rm_test_private.manager_staff_invites i
  join public.rm_test_members m
    on m.user_id=i.redeemed_by and m.role='employee' and m.local_id=i.local_id
  join public.rm_organization_members om
    on om.user_id=i.redeemed_by and om.organization_id=i.organization_id
  where i.profile_id=new.id and i.organization_id=new.organization_id
    and i.local_id=new.local_id and i.redeemed_by=auth.uid()
  limit 1;
  if v_sheet is null then return new; end if;
  v_name=btrim(new.first_name||' '||new.last_name);

  update public.rm_test_documents d set data =
      ((d.data || jsonb_build_object(
        'nombre',v_name,'nombreHoja',v_name,'alias',new.payment_alias,
        'contacto',coalesce(d.data->'contacto','{}'::jsonb)
          || jsonb_build_object('nombre',v_name,'tel',new.phone)
      )) - 'fechaIngreso')
      || case when new.started_on is null then '{}'::jsonb
              else jsonb_build_object('fechaIngreso',to_char(new.started_on,'YYYY-MM-DD')) end
  where d.path='hojas/'||v_sheet and d.organization_id=new.organization_id
    and rm_test_private.sheet_local(d.path,d.data,d.organization_id)=new.local_id
    and jsonb_typeof(coalesce(d.data->'contacto','{}'::jsonb))='object'
    and not exists(select 1 from public.rm_app_images im where im.sheet_id=v_sheet)
    and not exists(select 1 from public.rm_test_documents h
      where h.organization_id=d.organization_id
        and h.path like 'hojas/'||v_sheet||'/historial/%');
  return new;
end $fn$;
revoke all on function rm_test_private.staff_initial_legajo_to_sheet()
  from public,anon,authenticated;

-- Corregir borradores de colaboradores YA incorporados en el espacio de
-- recibos de Mi Gusto (registrado históricamente como Alessandro).
-- Se conservan todas las planillas, su archivo privado y sus fórmulas.
with personal as (
  select p.first_name,p.last_name,p.phone,p.payment_alias,p.started_on,
         p.organization_id,p.local_id,m.sheet_id
  from rm_test_private.manager_staff_invites i
  join public.rm_employee_profiles p
    on p.id=i.profile_id and p.organization_id=i.organization_id
      and p.local_id=i.local_id and p.needs_completion=false
  join public.rm_test_members m
    on m.user_id=i.redeemed_by and m.role='employee' and m.local_id=i.local_id
  join public.rm_organization_members om
    on om.user_id=i.redeemed_by and om.organization_id=i.organization_id
  join public.rm_app_local l
    on l.id=i.local_id and l.organization_id=i.organization_id
      and l.company_id=i.company_id
  join public.rm_companies c
    on c.id=l.company_id and c.organization_id=l.organization_id
  where lower(btrim(c.name))='alessandro'
    and l.id in ('munro','dt')
    and i.redeemed_by is not null
)
update public.rm_test_documents d set data =
  ((d.data || jsonb_build_object(
    'nombre',btrim(p.first_name||' '||p.last_name),
    'nombreHoja',btrim(p.first_name||' '||p.last_name),
    'alias',p.payment_alias,
    'contacto',coalesce(d.data->'contacto','{}'::jsonb)
       || jsonb_build_object('nombre',btrim(p.first_name||' '||p.last_name),'tel',p.phone)
  )) - 'fechaIngreso')
  || case when p.started_on is null then '{}'::jsonb
          else jsonb_build_object('fechaIngreso',to_char(p.started_on,'YYYY-MM-DD')) end
from personal p
where d.path='hojas/'||p.sheet_id
  and d.organization_id=p.organization_id
  and rm_test_private.sheet_local(d.path,d.data,d.organization_id)=p.local_id
  and coalesce(d.data->'items','{}'::jsonb)='{}'::jsonb
  and coalesce(d.data->'tarifas','{}'::jsonb)='{}'::jsonb
  and jsonb_typeof(coalesce(d.data->'contacto','{}'::jsonb))='object'
  and not exists(select 1 from public.rm_app_images im where im.sheet_id=p.sheet_id)
  and not exists(select 1 from public.rm_test_documents h
    where h.organization_id=d.organization_id
      and h.path like 'hojas/'||p.sheet_id||'/historial/%')
  and (
     d.data->>'nombre' is distinct from btrim(p.first_name||' '||p.last_name)
     or d.data->>'alias' is distinct from p.payment_alias
     or d.data#>>'{contacto,tel}' is distinct from p.phone
     or d.data->>'fechaIngreso' is distinct from
        case when p.started_on is null then null
             else to_char(p.started_on,'YYYY-MM-DD') end
  );
