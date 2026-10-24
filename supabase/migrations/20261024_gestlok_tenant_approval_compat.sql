-- Keep legacy approval requests functional while tenant isolation is introduced.
-- This is a transitional compatibility patch, NOT a multi-company signup flow.
create or replace function gestlok_tenancy.stamp_docs_tenant()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if tg_op='INSERT' then
  if new.tenant_id is null then
   new.tenant_id := gestlok_tenancy.current_tenant_id();
   if new.tenant_id is null and new.col='solicitudes' then
    select id into new.tenant_id
    from gestlok_tenancy.tenants where code='gestlok-original';
   end if;
  end if;
  if new.tenant_id is null then
   raise exception 'No approved company for this session' using errcode='42501';
  end if;
 elsif tg_op='UPDATE' then
  if new.tenant_id is distinct from old.tenant_id then
   raise exception 'Document company cannot be changed' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
