-- Browser Web Push subscriptions are capabilities and must never be readable by
-- ordinary application clients. Only authenticated, authorized Edge Functions
-- access these records through the service role.
create table if not exists ai_hub.admin_web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_web_push_subscriptions_user_idx
  on ai_hub.admin_web_push_subscriptions(user_id);

alter table ai_hub.admin_web_push_subscriptions enable row level security;
revoke all on ai_hub.admin_web_push_subscriptions from public, anon, authenticated;
grant usage on schema ai_hub to service_role;
grant select, insert, update, delete on ai_hub.admin_web_push_subscriptions to service_role;

create table if not exists ai_hub.admin_web_push_delivery_log (
  event_key text not null,
  subscription_id uuid not null references ai_hub.admin_web_push_subscriptions(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (event_key, subscription_id)
);

alter table ai_hub.admin_web_push_delivery_log enable row level security;
revoke all on ai_hub.admin_web_push_delivery_log from public, anon, authenticated;
grant select, insert, delete on ai_hub.admin_web_push_delivery_log to service_role;
