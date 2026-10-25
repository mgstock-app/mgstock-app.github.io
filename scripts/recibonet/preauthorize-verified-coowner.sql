-- Operator-only, primary GESTLOK database. Check identity/ownership in ReciboNet
-- independently FIRST. This does not move an Auth account or copy a password.
-- Deliberately no public RPC and no grants to frontend roles.
create function gestlok_integration_backup.preauthorize_verified_coowner(
 p_existing_owner text,p_coowner text,p_expected_tenant uuid,p_expected_locals text[]
) returns jsonb language plpgsql set search_path=''
as $$
declare v_owner public.docs%rowtype;v_email text:=lower(trim(p_coowner));v_backup uuid;v_locals text[];
begin
 if v_email is null or v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)+$' or v_email=lower(p_existing_owner) then
  raise exception 'Invalid co-owner identity';end if;
 select s.id into v_backup from gestlok_integration_backup.snapshots s
 where s.source='gestlok' and s.verified and s.created_at>now()-interval '1 day'
 order by s.created_at desc limit 1;
 if v_backup is null then raise exception 'Recent verified snapshot required';end if;
 select * into v_owner from public.docs d where d.col='equipo' and d.tenant_id=p_expected_tenant
 and lower(d.data->>'email')=lower(p_existing_owner) and d.data->>'rol'='dueno' for update;
 if not found then raise exception 'Existing owner/company correspondence failed';end if;
 if not exists(select 1 from gestlok_integration_backup.entities e,
   lateral jsonb_array_elements(e.payload) r where e.snapshot_id=v_backup and e.schema_name='public' and e.table_name='docs' and r=to_jsonb(v_owner)) then
  raise exception 'Owner changed since backup; verify again';end if;
 select array_agg(d.id order by d.id) into v_locals from public.docs d where d.col='locales' and d.tenant_id=p_expected_tenant;
 if v_locals is distinct from p_expected_locals then raise exception 'Unexpected branch mapping';end if;
 if exists(select 1 from public.docs d where d.col='equipo' and (lower(d.data->>'email')=v_email or d.id=v_email)) then
  if exists(select 1 from public.docs d where d.col='equipo' and lower(d.data->>'email')=v_email and d.tenant_id=p_expected_tenant and d.data->>'rol'='dueno') then
   return jsonb_build_object('status','already_authorized','tenant_id',p_expected_tenant);
  end if;
  raise exception 'Co-owner already belongs to a different assignment';
 end if;
 insert into public.docs(col,id,tenant_id,data,updated_by)
 values('equipo',v_email,p_expected_tenant,jsonb_build_object('email',v_email,'rol','dueno',
   'logoId',v_owner.data->>'logoId','agregado',(extract(epoch from now())*1000)::bigint,
   'por','issue-58-verified-coowner'),'issue-58-verified-coowner');
 return jsonb_build_object('status','preauthorized_verified_login_required','tenant_id',p_expected_tenant,'password_changed',false,'company_created',false);
end $$;
revoke all on function gestlok_integration_backup.preauthorize_verified_coowner(text,text,uuid,text[]) from public,anon,authenticated,service_role;
