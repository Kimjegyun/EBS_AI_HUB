-- Add bi-weekly Friday holidays starting from June 12, 2026
-- This will add holidays every 2 weeks on Friday for the rest of 2026

INSERT INTO company_holidays (holiday_date, holiday_name, description, is_recurring, created_at, updated_at)
VALUES
  ('2026-06-12', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-06-26', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-07-10', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-07-24', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-08-07', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-08-21', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-09-04', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-09-18', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-10-02', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-10-16', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-10-30', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-11-13', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-11-27', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-12-11', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now()),
  ('2026-12-25', '격주 금요일 휴무', '2주 단위 금요일 휴무일', false, now(), now())
ON CONFLICT (holiday_date) DO NOTHING;

-- Made with Bob
