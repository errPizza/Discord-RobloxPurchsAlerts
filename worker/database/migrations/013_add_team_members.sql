UPDATE contacts SET
  discord_username = 'err_pizza',
  joined_at = '2023-02-04',
  display_order = 1
WHERE roblox_user_id = '4093162315';

UPDATE contacts SET
  discord_username = '._1lll',
  joined_at = '2026-01-19',
  display_order = 2
WHERE roblox_user_id = '8933542097';

UPDATE contacts SET
  discord_username = 'angelkiti',
  joined_at = '2026-05-26',
  display_order = 5
WHERE roblox_user_id = '3457883254';

INSERT INTO contacts (
  name, role, email, discord, initials, display_order, is_visible,
  description, roblox_url, image_key, team_group, joined_at,
  roblox_user_id, discord_username
)
SELECT
  'Chesco (@Chesco_ez)', 'Builder', NULL, NULL, 'CH', 3, 1,
  'Constructor y codirector del estudio, enfocado en crear escenarios sólidos para nuestras experiencias.',
  'https://www.roblox.com/es/users/3790314421/profile', NULL,
  'co_owners', '2026-01-19', '3790314421', 'chescos_ez'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE roblox_user_id = '3790314421'
);

INSERT INTO contacts (
  name, role, email, discord, initials, display_order, is_visible,
  description, roblox_url, image_key, team_group, joined_at,
  roblox_user_id, discord_username
)
SELECT
  'Karma (@YurKarmx)', 'Builder · Game Design', NULL, NULL, 'KA', 4, 1,
  'Desarrollador centrado en construcción y diseño de juego para crear experiencias claras y entretenidas.',
  'https://www.roblox.com/es/users/8384200291/profile', NULL,
  'developers', '2026-04-25', '8384200291', 'karmalandl'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE roblox_user_id = '8384200291'
);

INSERT INTO contacts (
  name, role, email, discord, initials, display_order, is_visible,
  description, roblox_url, image_key, team_group, joined_at,
  roblox_user_id, discord_username
)
SELECT
  'Ryan (@ryan5857q)', 'Game Tester', NULL, NULL, 'RY', 6, 1,
  'Tester dedicado a detectar problemas y aportar retroalimentación antes de cada lanzamiento.',
  'https://www.roblox.com/es/users/3164874123/profile', NULL,
  'testers', '2026-04-15', '3164874123', 'ryan2005'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE roblox_user_id = '3164874123'
);

UPDATE contacts SET display_order = 7
WHERE team_group = 'community';

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_roblox_user_id
ON contacts (roblox_user_id)
WHERE roblox_user_id IS NOT NULL;
