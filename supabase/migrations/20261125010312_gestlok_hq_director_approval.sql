-- An executive report can only be approved after the leader has returned a real result.
create or replace function gestlok_hq_private.close_task(p_id uuid,p_status text) returns boolean language plpgsql security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator();
begin
 if p_status is null or p_status not in ('cerrada','cancelada') then raise exception 'Estado inválido' using errcode='22023'; end if;
 update gestlok_hq_private.tasks t set status=p_status,updated_at=now() where t.id=p_id and t.creator_id=v and t.status='pendiente'
 and (p_status='cancelada' or t.agent<>'lider' or exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id=t.id and r.creator_id=v and r.state='review'));
 return found;
end $$;
