INSERT OR IGNORE INTO site_settings (key, value) VALUES

  ('studio_name', 'Another Game More Studio'),
  ('hero_description', 'Creamos experiencias que dan ganas de jugar una partida más. Innovación, creatividad y pasión en cada juego.'),
  ('about_description', 'Another Game More Studio nace con la misión de crear experiencias únicas que conecten y entretengan a jugadores de todo el mundo. Nos enfocamos en la calidad, la innovación y en construir comunidades increíbles.');

INSERT OR IGNORE INTO contacts (name, role, email, initials, display_order) VALUES

  ('Administrador', 'Dirección del estudio', 'contacto@anothergamemore.com', 'A', 1),
  ('Game Design', 'Diseño y producto', 'design@anothergamemore.com', 'G', 2),
  ('Community', 'Comunidad y alianzas', 'community@anothergamemore.com', 'C', 3);
