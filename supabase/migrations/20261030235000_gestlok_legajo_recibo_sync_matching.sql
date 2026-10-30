-- GESTLOK: sincronización privada legajo propio ↔ hoja de recibos y conciliación sin mezclar personas.
-- No altera recibos históricos, importes, tarifas ni otras sucursales.
-- El alta por invitación ya crea una hoja borrador. Reutilizarla: nunca duplicarla.
create or replace function rm_test_private.staff_sheet_personal_metadata(p_sheet text,p_organization uuid,p_local text,p_profile uuid)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_data jsonb; v_record public.rm_employee_profiles;
begin
  select * into v_record from public.rm_employee_profiles
    where id=p_profile and organization_id=p_organization and local_id=p_local;
  if not found or v_record.needs_completion then return false; end if;
  -- No invalidar recibos publicados y firmados con datos de perfil editados.
  if exists(select 1 from public.rm_app_images im where im.sheet_id=p_sheet) then return false; end if;
  update public.rm_test_documents d set data =
    (d.data || jsonb_build_object(
      'nombre',v_record.first_name||' '||v_record.last_name,
      'nombreHoja',v_record.first_name||' '||v_record.last_name,
      'alias',v_record.payment_alias,
      'contacto',coalesce(d.data->'contacto','{}'::jsonb)
        ||jsonb_build_object('nombre',v_record.first_name||' '||v_record.last_name,
                            'tel',v_record.phone)
    )) || case when v_record.started_on is null then '{}'::jsonb
                else jsonb_build_object('fechaIngreso',to_char(v_record.started_on,'YYYY-MM-DD')) end
    where d.path='hojas/'||p_sheet and d.organization_id=p_organization
      and rm_test_private.sheet_local(d.path,d.data,d.organization_id)=p_local
      and jsonb_typeof(coalesce(d.data->'contacto','{}'::jsonb))='object';
  return found;
end $fn$;
revoke all on function rm_test_private.staff_sheet_personal_metadata(text,uuid,text,uuid) from public,anon,authenticated;

create or replace function rm_test_private.staff_profile_after_self_save()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_sheet text;
begin
  if new.needs_completion then return new; end if;
  -- El colaborador solo propaga SUS datos al borrador asociado a SU identidad
  -- en la misma organización/local, sin acceso directo a ninguna hoja de recibos.
  select m.sheet_id into v_sheet
  from rm_test_private.manager_staff_invites i
  join public.rm_test_members m on m.user_id=i.redeemed_by
    and m.role='employee' and m.local_id=i.local_id
  join public.rm_organization_members om on om.user_id=i.redeemed_by and om.organization_id=i.organization_id
  where i.profile_id=new.id and i.organization_id=new.organization_id
    and i.local_id=new.local_id and i.redeemed_by=auth.uid()
  limit 1;
  if v_sheet is not null then
    if not rm_test_private.staff_sheet_personal_metadata(v_sheet,new.organization_id,new.local_id,new.id)
    then
      -- Si el borrador falta o hay un recibo publicado, conservar el legajo y
      -- evitar generar documentos extra o borrar liquidaciones.
      null;
    end if;
  end if;
  return new;
end $fn$;
revoke all on function rm_test_private.staff_profile_after_self_save() from public,anon,authenticated;
drop trigger if exists trg_staff_profile_sync_sheet on public.rm_employee_profiles;
create trigger trg_staff_profile_sync_sheet after update of first_name,last_name,phone,payment_alias,started_on,needs_completion
on public.rm_employee_profiles for each row execute function rm_test_private.staff_profile_after_self_save();

-- Se calculan coincidencias SOLO del mismo local, y solo para la cuenta Dueño.
-- El parecido por nombre NO autoriza cambiar a quién corresponde un recibo.
create or replace function rm_test_private.staff_roster_candidates()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare result jsonb;
begin
 if auth.uid() is null or not rm_test_private.ensure_directory()
    or rm_test_private.app_role()<>'owner'
 then raise exception 'Solo el dueño puede conciliar recibos' using errcode='42501'; end if;
 with enrolled as (
   select p.id as profile_id,p.organization_id,p.local_id,
      (p.first_name||' '||p.last_name) as full_name,
      lower(translate(btrim(p.first_name),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) as first_norm,
      lower(translate(btrim(p.last_name),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) as last_norm,
      regexp_replace(p.phone,'[^0-9]','','g') as phone_norm,
      lower(btrim(p.payment_alias)) as alias_norm,
      m.sheet_id as assigned_sheet
   from rm_test_private.manager_staff_invites i
   join public.rm_employee_profiles p on p.id=i.profile_id and p.organization_id=i.organization_id and p.local_id=i.local_id
   join public.rm_test_members m on m.user_id=i.redeemed_by and m.role='employee' and m.local_id=i.local_id
   join public.rm_organization_members om on om.user_id=i.redeemed_by and om.organization_id=i.organization_id
   where not p.needs_completion and rm_test_private.manages_organization(p.organization_id)
 ), candidates as (
  select e.profile_id,e.local_id,e.full_name,e.assigned_sheet,
    substring(d.path from 7) as old_sheet,
    coalesce(d.data->>'nombre',d.data->>'nombreHoja','') as old_name,
    case
      when length(e.phone_norm)>=8 and e.phone_norm=regexp_replace(coalesce(d.data#>>'{contacto,tel}',''),'[^0-9]','','g') then 'teléfono'
      when length(e.alias_norm)>=4 and e.alias_norm=lower(btrim(coalesce(d.data->>'alias',''))) then 'alias'
      when lower(translate(btrim(e.full_name),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) =
           lower(translate(btrim(coalesce(d.data->>'nombre','')),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) then 'nombre completo'
      else 'nombre parecido'
    end as reason,
    row_number() over(partition by e.profile_id order by
      case when length(e.phone_norm)>=8 and e.phone_norm=regexp_replace(coalesce(d.data#>>'{contacto,tel}',''),'[^0-9]','','g') then 1
           when length(e.alias_norm)>=4 and e.alias_norm=lower(btrim(coalesce(d.data->>'alias',''))) then 2
           when lower(btrim(e.full_name))=lower(btrim(coalesce(d.data->>'nombre',''))) then 3
           else 4 end, d.path) as pos
  from enrolled e join public.rm_test_documents d on d.organization_id=e.organization_id
    and d.path ~ '^hojas/[^/]+$' and d.path<>'hojas/'||e.assigned_sheet
    and rm_test_private.sheet_local(d.path,d.data,d.organization_id)=e.local_id
  where not exists (select 1 from public.rm_test_members other where other.sheet_id=substring(d.path from 7))
    and (
      (length(e.phone_norm)>=8 and e.phone_norm=regexp_replace(coalesce(d.data#>>'{contacto,tel}',''),'[^0-9]','','g'))
      or (length(e.alias_norm)>=4 and e.alias_norm=lower(btrim(coalesce(d.data->>'alias',''))))
      or (
        length(e.first_norm)>=3
        and length(coalesce(d.data->>'nombre',''))>=4
        and (
         lower(translate(btrim(e.full_name),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'))
           =lower(translate(btrim(coalesce(d.data->>'nombre','')),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'))
         or (
           left(split_part(lower(translate(coalesce(d.data->>'nombre',''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),' ',1),3)=left(e.first_norm,3)
           and (split_part(lower(translate(coalesce(d.data->>'nombre',''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),' ',1) like e.first_norm||'%'
                or e.first_norm like split_part(lower(translate(coalesce(d.data->>'nombre',''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),' ',1)||'%')
           and (length(e.last_norm)<2
              or right(lower(translate(coalesce(d.data->>'nombre',''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),length(e.last_norm))=e.last_norm)
         )
        )
      )
    )
 )
 select coalesce(jsonb_agg(jsonb_build_object('profile_id',profile_id,
   'local_id',local_id,'full_name',full_name,'current_sheet',assigned_sheet,
   'candidate_sheet',old_sheet,'candidate_name',old_name,'reason',reason)
     order by full_name,local_id,pos),'[]'::jsonb) into result
 from candidates where pos<=4;
 return result;
end $fn$;
revoke all on function rm_test_private.staff_roster_candidates() from public,anon,authenticated;
grant execute on function rm_test_private.staff_roster_candidates() to authenticated;
create or replace function public.rm_app_staff_roster_candidates()
returns jsonb language sql set search_path='' as $fn$
 select rm_test_private.staff_roster_candidates()
$fn$;
revoke all on function public.rm_app_staff_roster_candidates() from public,anon,authenticated;
grant execute on function public.rm_app_staff_roster_candidates() to authenticated;

-- El Dueño confirma el vínculo. Jamás fusionar solo por similitud.
-- Si la hoja nueva ya tiene datos de liquidación, NO destruirla.
create or replace function rm_test_private.staff_roster_link_existing(p_profile uuid,p_existing_sheet text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_profile public.rm_employee_profiles;v_old_sheet text;v_user uuid;
 v_doc public.rm_test_documents; v_provisional public.rm_test_documents;
 v_possible boolean;
begin
 if auth.uid() is null or not rm_test_private.ensure_directory()
   or rm_test_private.app_role()<>'owner' or p_existing_sheet is null
   or p_existing_sheet !~ '^[a-zA-Z0-9_-]{1,120}$'
 then raise exception 'Acceso de dueño requerido' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(216109);
 select p.*,i.redeemed_by,m.sheet_id into v_profile,v_user,v_old_sheet
 from public.rm_employee_profiles p join rm_test_private.manager_staff_invites i
     on i.profile_id=p.id and i.local_id=p.local_id and i.organization_id=p.organization_id
 join public.rm_test_members m on m.user_id=i.redeemed_by and m.role='employee' and m.local_id=i.local_id
 where p.id=p_profile and not p.needs_completion;
 if not found or not rm_test_private.manages_organization(v_profile.organization_id)
 then raise exception 'Legajo no autorizado' using errcode='42501'; end if;
 if v_old_sheet=p_existing_sheet then
   return jsonb_build_object('linked',true,'local_id',v_profile.local_id); end if;
 select * into v_doc from public.rm_test_documents d
   where d.path='hojas/'||p_existing_sheet and d.organization_id=v_profile.organization_id
     and rm_test_private.sheet_local(d.path,d.data,d.organization_id)=v_profile.local_id for update;
 if not found or exists(select 1 from public.rm_test_members m where m.sheet_id=p_existing_sheet)
 then raise exception 'La planilla no corresponde al local o ya está asignada a otra cuenta' using errcode='42501'; end if;
 -- La sugerencia debe seguir coincidiendo en el momento exacto de la confirmación.
 select exists(select 1 from jsonb_array_elements(rm_test_private.staff_roster_candidates()) v
   where v->>'profile_id'=p_profile::text and v->>'candidate_sheet'=p_existing_sheet) into v_possible;
 if not v_possible then raise exception 'La coincidencia ya no es válida' using errcode='42501'; end if;
 select * into v_provisional from public.rm_test_documents d
   where d.path='hojas/'||v_old_sheet and d.organization_id=v_profile.organization_id
     and rm_test_private.sheet_local(d.path,d.data,d.organization_id)=v_profile.local_id for update;
 if not found or coalesce(v_provisional.data->'items','{}'::jsonb)<>'{}'::jsonb
    or coalesce(v_provisional.data->'tarifas','{}'::jsonb)<>'{}'::jsonb
    or (v_provisional.data-array['nombre','nombreHoja','local','puesto','porTurno','orden','items','tarifas','contacto','alias','fechaIngreso'])<>'{}'::jsonb
    or exists(select 1 from public.rm_app_images im where im.sheet_id=v_old_sheet)
    or exists(select 1 from public.rm_test_report_access a where a.sheet_id=v_old_sheet)
    or exists(select 1 from public.rm_test_documents h where h.path like 'hojas/'||v_old_sheet||'/historial/%')
 then raise exception 'La planilla nueva ya tiene actividad: requiere revisión manual antes de vincular' using errcode='42501'; end if;
 update public.rm_test_members m set sheet_id=p_existing_sheet
 where m.user_id=v_user and m.sheet_id=v_old_sheet and m.local_id=v_profile.local_id and m.role='employee';
 if not found then raise exception 'La asignación cambió; recargá y verificá' using errcode='42501'; end if;
 delete from public.rm_test_documents d where d.path='hojas/'||v_old_sheet
   and d.organization_id=v_profile.organization_id;
 perform rm_test_private.staff_sheet_personal_metadata(p_existing_sheet,v_profile.organization_id,v_profile.local_id,p_profile);
 insert into rm_test_private.account_audit(actor,target,action,after_value)
 values(auth.uid(),v_user,'staff_roster_existing_sheet_linked',
   jsonb_build_object('local_id',v_profile.local_id,'previous_draft',v_old_sheet,'existing_sheet',p_existing_sheet,'profile_id',p_profile));
 return jsonb_build_object('linked',true,'local_id',v_profile.local_id);
end $fn$;
revoke all on function rm_test_private.staff_roster_link_existing(uuid,text) from public,anon,authenticated;
grant execute on function rm_test_private.staff_roster_link_existing(uuid,text) to authenticated;
create or replace function public.rm_app_staff_roster_link_existing(p_profile uuid,p_existing_sheet text)
returns jsonb language sql set search_path='' as $fn$
 select rm_test_private.staff_roster_link_existing(p_profile,p_existing_sheet)
$fn$;
revoke all on function public.rm_app_staff_roster_link_existing(uuid,text) from public,anon,authenticated;
grant execute on function public.rm_app_staff_roster_link_existing(uuid,text) to authenticated;
