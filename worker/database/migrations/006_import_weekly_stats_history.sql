INSERT INTO weekly_stats (week, created_at, spent, revenue, single_count, bulk_count, donations) VALUES
  ('2026-W24', 1781316765, 77, 32, 1, 0, 2),
  ('2026-W25', 1781951055, 210, 84, 3, 0, 0),
  ('2026-W26', 1782453580, 249, 117, 3, 0, 2),
  ('2026-W27', 1782702164, 266, 107, 4, 1, 2),
  ('2026-W28', 1783222532, 1251, 508, 17, 0, 4),
  ('2026-W30', 1784444422, 520, 208, 7, 0, 0)
ON CONFLICT(week) DO UPDATE SET
  created_at = excluded.created_at,
  spent = excluded.spent,
  revenue = excluded.revenue,
  single_count = excluded.single_count,
  bulk_count = excluded.bulk_count,
  donations = excluded.donations;

INSERT INTO daily_stats (day, created_at, spent, revenue, single_count, bulk_count, donations) VALUES
  ('2026-06-13', 1781316765, 77, 32, 1, 0, 2),
  ('2026-06-20', 1781951055, 210, 84, 3, 0, 0),
  ('2026-06-26', 1782453580, 249, 117, 3, 0, 2),
  ('2026-06-29', 1782702164, 266, 107, 4, 1, 2),
  ('2026-07-05', 1783222532, 1251, 508, 17, 0, 4),
  ('2026-07-19', 1784444422, 520, 208, 7, 0, 0)
ON CONFLICT(day) DO UPDATE SET
  created_at = excluded.created_at,
  spent = excluded.spent,
  revenue = excluded.revenue,
  single_count = excluded.single_count,
  bulk_count = excluded.bulk_count,
  donations = excluded.donations;
