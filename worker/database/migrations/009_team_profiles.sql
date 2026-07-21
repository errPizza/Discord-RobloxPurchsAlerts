ALTER TABLE contacts ADD COLUMN description TEXT;
ALTER TABLE contacts ADD COLUMN roblox_url TEXT;
ALTER TABLE contacts ADD COLUMN image_key TEXT;

UPDATE contacts SET
  name = 'err_Pizza (@err_Lo2sDat4)',
  role = 'Scripter · Software · UI Design',
  email = NULL,
  discord = NULL,
  initials = 'EP',
  description = 'Hola, soy desarrollador de páginas web y videojuegos. Tengo alrededor de cinco años de experiencia creando juegos en la plataforma Roblox. Al principio solo hacía sistemas individuales para personas que me los pedían, pero ahora mi equipo y yo aspiramos a mucho más.',
  roblox_url = 'https://www.roblox.com/es/users/4093162315/profile',
  image_key = NULL
WHERE display_order = 1;

UPDATE contacts SET
  name = '676767 (@dlksadjadjkd1s3)',
  role = 'Builder · Game Design · Analytics',
  email = NULL,
  discord = NULL,
  initials = '67',
  description = 'Especialista en construcción y diseño de experiencias, enfocado en transformar ideas en mundos claros, funcionales y memorables para cada jugador.',
  roblox_url = 'https://www.roblox.com/es/users/8933542097/profile',
  image_key = NULL
WHERE display_order = 2;

UPDATE contacts SET
  name = 'Community',
  role = 'Comunidad oficial',
  email = NULL,
  discord = 'https://discord.gg/QzS8xqmZX8',
  initials = 'AGM',
  description = 'El punto de encuentro de Another Game More: un espacio para conocer novedades, compartir ideas y crecer junto a jugadores y desarrolladores.',
  roblox_url = 'https://www.roblox.com/es/communities/16939863/Another-Game-More-ST#!/about',
  image_key = 'studio'
WHERE display_order = 3;
