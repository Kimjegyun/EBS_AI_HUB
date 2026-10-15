-- Match the admin screen's default (기본 월 턴 5,000, DEFAULT_MONTHLY_TURNS in
-- src/lib/aiUsageService.ts) for members without their own usage row.
-- 20260711090000_ai_api_usage_limits.sql created the column with default 100.
alter table ai_hub.user_api_usage alter column monthly_limit set default 5000;
