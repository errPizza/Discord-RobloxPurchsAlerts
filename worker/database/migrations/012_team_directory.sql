ALTER TABLE contacts ADD COLUMN team_group TEXT
  CHECK (team_group IN ('owner', 'co_owners', 'developers', 'contributors', 'testers', 'community'));
ALTER TABLE contacts ADD COLUMN joined_at TEXT;
ALTER TABLE contacts ADD COLUMN roblox_user_id TEXT;
ALTER TABLE contacts ADD COLUMN discord_username TEXT;

UPDATE contacts SET
  team_group = 'owner',
  roblox_user_id = '4093162315',
  role = 'Software Designer · Scripter · UI Design'
WHERE display_order = 1;

UPDATE contacts SET
  team_group = 'co_owners',
  roblox_user_id = '8933542097',
  role = 'Builder · Game Design · Project Manager · Analytics'
WHERE display_order = 2;

UPDATE contacts SET team_group = 'community'
WHERE display_order = 3;

INSERT INTO contacts (
  name, role, email, discord, initials, display_order, is_visible,
  description, roblox_url, image_key, team_group, joined_at,
  roblox_user_id, discord_username
)
SELECT
  'cici (@cicisgrave)', 'Clothing Designer', NULL, NULL, 'CI', 4, 1,
  'Diseñadora de ropa y colaboradora de Another Game More Studio.',
  'https://www.roblox.com/es/users/3457883254/profile', NULL,
  'contributors', NULL, '3457883254', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE roblox_url LIKE '%/3457883254/profile'
);

CREATE INDEX IF NOT EXISTS idx_contacts_team_group
ON contacts (team_group, display_order);
