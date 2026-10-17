-- ADMIN is a reserved permission group. Store whether the group granted the role
-- so removing an independently appointed admin does not revoke their role.
begin;
alter table ai_hub.user_api_usage add column if not exists admin_granted_by_group boolean not null default false;
insert into ai_hub.api_usage_groups(group_id, group_name, monthly_limit)
values ('ADMIN', 'ADMIN', 5000) on conflict (group_id) do nothing;

create or replace function ai_hub.sync_admin_group_role()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, core, ai_hub
as $$
declare
  v_member core.project_memberships%rowtype;
begin
  select * into v_member from core.project_memberships
  where project_id = core.ai_hub_project_id() and user_id = new.user_id for update;
  if not found then raise exception 'AI HUB 회원이 아닙니다.'; end if;
  if new.group_id is distinct from old.group_id then
    if not core.is_ai_hub_admin() then raise exception 'Admin permission is required.'; end if;
    if new.user_id = auth.uid() then raise exception '본인 그룹은 변경할 수 없습니다.'; end if;
    if v_member.role = 'owner' then raise exception 'OWNER 그룹은 변경할 수 없습니다.'; end if;
    if new.group_id = 'ADMIN' then
      new.admin_granted_by_group := v_member.role = 'user';
      update core.project_memberships set role = 'admin'
      where project_id = core.ai_hub_project_id() and user_id = new.user_id;
    elsif old.group_id = 'ADMIN' and old.admin_granted_by_group then
      update core.project_memberships set role = 'user'
      where project_id = core.ai_hub_project_id() and user_id = new.user_id;
      new.admin_granted_by_group := false;
    end if;
  end if;
  return new;
end
$$;
-- Insert an ungrouped usage row before assignment to avoid UPSERT firing the
-- permission trigger twice and losing the original role.
create or replace function public.ai_hub_set_user_api_group_v1(p_user_id uuid, p_group_id text)
returns void language plpgsql security definer
set search_path = pg_catalog, public, core, ai_hub as $$
begin
  if not core.is_ai_hub_admin() then raise exception 'Admin permission is required.'; end if;
  perform 1 from core.project_memberships
  where project_id = core.ai_hub_project_id() and user_id = p_user_id for update;
  if not found then raise exception 'AI HUB 회원이 아닙니다.'; end if;
  insert into ai_hub.user_api_usage(user_id, period)
  values(p_user_id, to_char(now(), 'YYYY-MM')) on conflict(user_id) do nothing;
  update ai_hub.user_api_usage set group_id = nullif(p_group_id, ''), updated_at = now(), updated_by = auth.uid()
  where user_id = p_user_id;
end
$$;

create trigger sync_admin_group_role before insert or update of group_id
on ai_hub.user_api_usage for each row execute function ai_hub.sync_admin_group_role();

create or replace function ai_hub.protect_admin_group()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if old.group_id = 'ADMIN' then
    if tg_op = 'DELETE' then raise exception 'ADMIN 그룹은 삭제할 수 없습니다.'; end if;
    if new.group_id <> 'ADMIN' or new.group_name <> 'ADMIN' then
      raise exception 'ADMIN 그룹의 이름은 변경할 수 없습니다.';
    end if;
  elsif new.group_id <> 'ADMIN' and upper(btrim(new.group_name)) = 'ADMIN' then
    raise exception 'ADMIN은 예약된 그룹 이름입니다.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
create trigger protect_admin_group before insert or update or delete on ai_hub.api_usage_groups
for each row execute function ai_hub.protect_admin_group();

create or replace function public.ai_hub_set_member_role_v1(p_user_id uuid, p_role text)
returns void language plpgsql security definer
set search_path = pg_catalog, public, core, ai_hub
as $$
declare v_member core.project_memberships%rowtype;
begin
  if not core.is_ai_hub_admin() then raise exception 'Admin permission is required.'; end if;
  if p_role is null or p_role not in ('admin', 'user') then raise exception 'Invalid role.'; end if;
  select * into v_member from core.project_memberships
  where project_id = core.ai_hub_project_id() and user_id = p_user_id for update;
  if not found then raise exception 'AI HUB 회원이 아닙니다.'; end if;
  if p_user_id = auth.uid() or v_member.role = 'owner' then
    raise exception '본인 또는 OWNER 역할은 변경할 수 없습니다.';
  end if;
  if exists(select 1 from ai_hub.user_api_usage where user_id = p_user_id and group_id = 'ADMIN') then
    raise exception 'ADMIN 그룹에서 제외한 뒤 역할을 변경하세요.';
  end if;
  update core.project_memberships set role = p_role
  where project_id = core.ai_hub_project_id() and user_id = p_user_id;
end
$$;
revoke all on function public.ai_hub_set_member_role_v1(uuid,text) from public, anon;
grant execute on function public.ai_hub_set_member_role_v1(uuid,text) to authenticated;
revoke all on function ai_hub.sync_admin_group_role() from public, anon, authenticated;
-- Profile editing and older role RPCs must respect group-derived permissions.
create or replace function ai_hub.enforce_admin_group_role()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, core, ai_hub as $$
begin
  if pg_trigger_depth() = 1 and new.project_id = core.ai_hub_project_id()
     and new.role <> old.role and exists (
       select 1 from ai_hub.user_api_usage where user_id = new.user_id and group_id = 'ADMIN'
     ) then raise exception 'ADMIN 그룹에서 제외한 뒤 역할을 변경하세요.'; end if;
  return new;
end
$$;
create trigger enforce_admin_group_role before update of role on core.project_memberships
for each row execute function ai_hub.enforce_admin_group_role();
revoke all on function ai_hub.enforce_admin_group_role() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
