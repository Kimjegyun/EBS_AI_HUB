-- Admin deletes a member from AI HUB.
--
-- core.* is shared by several projects, so deletion is scoped: the AI HUB
-- membership and admin profile are removed; the login account (auth.users, which
-- cascades to core.profiles) is deleted only when the user belongs to no other
-- project. A deleted email can then sign up again from scratch.
create or replace function public.ai_hub_delete_member_v1(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
declare
  v_project uuid := core.ai_hub_project_id();
  v_target core.project_memberships%rowtype;
  v_account_deleted boolean := false;
begin
  if not core.is_ai_hub_admin() then
    raise exception 'AI HUB admin permission is required.';
  end if;
  if p_user_id = auth.uid() then
    raise exception '본인 계정은 삭제할 수 없습니다.';
  end if;

  select * into v_target from core.project_memberships
   where project_id = v_project and user_id = p_user_id;
  if not found then
    raise exception 'AI HUB 회원이 아닙니다.';
  end if;
  if v_target.role = 'owner' and not exists (
       select 1 from core.project_memberships
        where project_id = v_project and user_id = auth.uid() and role = 'owner' and status = 'approved') then
    raise exception '소유자 계정은 소유자만 삭제할 수 있습니다.';
  end if;

  delete from core.project_memberships where project_id = v_project and user_id = p_user_id;
  delete from ai_hub.admin_profiles where user_id = p_user_id;

  if not exists (select 1 from core.project_memberships where user_id = p_user_id) then
    delete from auth.users where id = p_user_id;
    v_account_deleted := true;
  end if;

  return jsonb_build_object('account_deleted', v_account_deleted);
end
$$;

revoke all on function public.ai_hub_delete_member_v1(uuid) from public, anon;
grant execute on function public.ai_hub_delete_member_v1(uuid) to authenticated;

notify pgrst, 'reload schema';
