insert into ai_hub.published_apps (app_id, published_at)
values
  ('calendar', now()),
  ('my-llm', now()),
  ('email-writer', now()),
  ('codex', now()),
  ('inventory', now()),
  ('quick-actions', now()),
  ('pending-tasks', now()),
  ('recent-messages', now()),
  ('notes', now()),
  ('bookmarks', now())
on conflict (app_id) do nothing;
