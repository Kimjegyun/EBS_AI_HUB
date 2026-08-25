-- User portal can inherit the admin-registered catalog without a membership RPC.
create or replace function public.ai_hub_list_published_apps()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, core, ai_hub
as $$
begin
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('app_id', pa.app_id, 'published_at', pa.published_at)
        order by pa.published_at desc
      )
      from ai_hub.published_apps as pa
    ),
    '[]'::jsonb
  );
end
$$;

grant execute on function public.ai_hub_list_published_apps() to anon, authenticated;

notify pgrst, 'reload schema';
