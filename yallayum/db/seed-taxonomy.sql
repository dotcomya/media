-- Généré par db/gen-seed-taxonomy.mjs depuis src/domain/taxonomy.ts — ne pas modifier à la main.
BEGIN;

INSERT INTO cuisines (id, label, family, parent_id, hue, icon, synonyms, sort_order) VALUES
  ('maghrebine', 'Maghreb', 'origine', NULL, 45, 'tagine', ARRAY['maghreb', 'maghrebin', 'maghrebine'], 0),
  ('moyen-orient', 'Moyen-Orient', 'origine', NULL, 140, 'skewer', ARRAY['moyen orient', 'oriental', 'levantin'], 4),
  ('turque', 'Turque', 'origine', NULL, 18, 'skewer', ARRAY['turc', 'turque', 'turquie', 'pide', 'lahmacun', 'iskender', 'kebab', 'doner'], 7),
  ('africaine', 'Afrique subsaharienne', 'origine', NULL, 72, 'bowl', ARRAY['africain', 'africaine', 'afro', 'afrique'], 8),
  ('sous-continent', 'Inde et Pakistan', 'origine', NULL, 62, 'curry', ARRAY['indo pakistanais', 'indo', 'sous continent'], 12),
  ('asiatique', 'Asiatique', 'origine', NULL, 12, 'bowl', ARRAY['asiatique', 'asie', 'wok'], 15),
  ('francaise', 'Française', 'origine', NULL, 250, 'plate', ARRAY['francais', 'francaise', 'bistrot', 'bistro', 'brasserie', 'cuisine francaise'], 20),
  ('italienne', 'Italienne', 'origine', NULL, 28, 'pizza', ARRAY['italien', 'italienne', 'italie', 'pates', 'pasta', 'trattoria'], 21),
  ('americaine', 'Américaine', 'origine', NULL, 15, 'burger', ARRAY['americain', 'americaine', 'diner', 'bbq', 'barbecue'], 22),
  ('latino', 'Amérique latine', 'origine', NULL, 95, 'taco', ARRAY['mexicain', 'mexicaine', 'bresilien', 'peruvien', 'latino'], 23),
  ('burger', 'Burger', 'format', NULL, 40, 'burger', ARRAY['burger', 'burgers', 'smash', 'smash burger', 'cheeseburger', 'hamburger'], 24),
  ('tacos', 'Tacos', 'format', NULL, 85, 'taco', ARRAY['tacos', 'french tacos', 'taco'], 25),
  ('sandwich', 'Sandwich', 'format', NULL, 70, 'sandwich', ARRAY['sandwich', 'sandwichs', 'sandwicherie', 'wrap', 'snack'], 26),
  ('grillades', 'Grillades', 'format', NULL, 25, 'skewer', ARRAY['grillade', 'grillades', 'grill', 'brochette', 'brochettes', 'braise', 'viande', 'steakhouse', 'boucherie'], 27),
  ('pizza', 'Pizza', 'format', NULL, 30, 'pizza', ARRAY['pizza', 'pizzas', 'pizzeria'], 28),
  ('poulet', 'Poulet frit', 'format', NULL, 48, 'burger', ARRAY['poulet', 'poulet frit', 'chicken', 'fried chicken', 'wings', 'tenders'], 29),
  ('brunch', 'Brunch', 'moment', NULL, 88, 'croissant', ARRAY['brunch', 'brunchs', 'petit dej', 'petit dejeuner', 'pancakes', 'pancake', 'oeufs'], 30),
  ('patisserie', 'Pâtisserie et salon de thé', 'moment', NULL, 340, 'cake', ARRAY['patisserie', 'patisseries', 'dessert', 'desserts', 'gateau', 'salon de the', 'gaufre', 'glace'], 31),
  ('gastronomique', 'Gastronomique', 'style', NULL, 290, 'cloche', ARRAY['gastro', 'gastronomique', 'raffine', 'chic', 'haut de gamme', 'etoile'], 32),
  ('healthy', 'Healthy', 'style', NULL, 150, 'leaf', ARRAY['healthy', 'sain', 'poke', 'bowl', 'salade', 'salades', 'vegetal'], 33),
  ('marocaine', 'Marocaine', 'origine', 'maghrebine', 38, 'tagine', ARRAY['marocain', 'marocaine', 'maroc', 'tajine', 'tagine', 'pastilla', 'couscous'], 1),
  ('algerienne', 'Algérienne', 'origine', 'maghrebine', 52, 'tagine', ARRAY['algerien', 'algerienne', 'algerie', 'chorba', 'rechta'], 2),
  ('tunisienne', 'Tunisienne', 'origine', 'maghrebine', 30, 'tagine', ARRAY['tunisien', 'tunisienne', 'tunisie', 'brik', 'lablabi'], 3),
  ('libanaise', 'Libanaise', 'origine', 'moyen-orient', 145, 'skewer', ARRAY['libanais', 'libanaise', 'liban', 'mezze', 'houmous', 'falafel', 'manakish', 'chawarma', 'shawarma'], 5),
  ('syrienne', 'Syrienne', 'origine', 'moyen-orient', 130, 'skewer', ARRAY['syrien', 'syrienne', 'syrie'], 6),
  ('senegalaise', 'Sénégalaise', 'origine', 'africaine', 78, 'bowl', ARRAY['senegalais', 'senegalaise', 'senegal', 'yassa', 'thieboudienne', 'mafe'], 9),
  ('ivoirienne', 'Ivoirienne', 'origine', 'africaine', 66, 'bowl', ARRAY['ivoirien', 'ivoirienne', 'alloco', 'attieke', 'garba'], 10),
  ('ethiopienne', 'Éthiopienne', 'origine', 'africaine', 58, 'bowl', ARRAY['ethiopien', 'ethiopienne', 'injera'], 11),
  ('indienne', 'Indienne', 'origine', 'sous-continent', 60, 'curry', ARRAY['indien', 'indienne', 'inde', 'curry', 'biryani', 'naan', 'butter chicken', 'tandoori'], 13),
  ('pakistanaise', 'Pakistanaise', 'origine', 'sous-continent', 100, 'curry', ARRAY['pakistanais', 'pakistanaise', 'pakistan', 'karahi', 'nihari'], 14),
  ('japonaise', 'Japonaise', 'origine', 'asiatique', 22, 'sushi', ARRAY['japonais', 'japonaise', 'japon', 'sushi', 'sushis', 'ramen', 'maki', 'yakitori'], 16),
  ('coreenne', 'Coréenne', 'origine', 'asiatique', 355, 'bowl', ARRAY['coreen', 'coreenne', 'coree', 'bibimbap', 'korean', 'fried chicken coreen'], 17),
  ('thai', 'Thaïlandaise', 'origine', 'asiatique', 120, 'bowl', ARRAY['thai', 'thailandais', 'thailandaise', 'pad thai'], 18),
  ('chinoise', 'Chinoise', 'origine', 'asiatique', 8, 'bowl', ARRAY['chinois', 'chinoise', 'chine', 'dim sum', 'nouilles'], 19)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, family = EXCLUDED.family, parent_id = EXCLUDED.parent_id, hue = EXCLUDED.hue, icon = EXCLUDED.icon, synonyms = EXCLUDED.synonyms, sort_order = EXCLUDED.sort_order;

INSERT INTO occasions (id, label, kind, synonyms, sort_order) VALUES
  ('date', 'Pour un date', 'occasion', ARRAY['date', 'romantique', 'en amoureux', 'amoureux', 'couple', 'diner a deux', 'a deux', 'tete a tete'], 0),
  ('amis', 'Entre amis', 'occasion', ARRAY['entre amis', 'amis', 'potes', 'entre potes', 'groupe', 'bande', 'anniversaire'], 1),
  ('famille', 'En famille', 'occasion', ARRAY['famille', 'en famille', 'enfants', 'kids', 'kid friendly', 'bebe', 'parents'], 2),
  ('rapide', 'Déjeuner rapide', 'occasion', ARRAY['rapide', 'sur le pouce', 'pause dej', 'pause dejeuner', 'dejeuner rapide', 'vite', 'midi'], 3),
  ('business', 'Déjeuner pro', 'occasion', ARRAY['business', 'pro', 'dejeuner pro', 'client', 'reunion'], 4),
  ('special', 'Sortie spéciale', 'occasion', ARRAY['special', 'occasion speciale', 'fete', 'celebrer', 'evenement'], 5),
  ('cosy', 'Cosy', 'ambiance', ARRAY['cosy', 'cozy', 'chaleureux', 'calme', 'intime'], 6),
  ('street', 'Street food', 'ambiance', ARRAY['street', 'street food', 'streetfood', 'casual'], 7),
  ('chill', 'Décontracté', 'ambiance', ARRAY['chill', 'detente', 'decontracte', 'tranquille', 'posey'], 8),
  ('festif', 'Animé', 'ambiance', ARRAY['anime', 'festif', 'ambiance', 'musique', 'vivant'], 9)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, kind = EXCLUDED.kind, synonyms = EXCLUDED.synonyms, sort_order = EXCLUDED.sort_order;

INSERT INTO amenities (id, label, synonyms, sort_order) VALUES
  ('sur_place', 'Sur place', ARRAY['sur place'], 0),
  ('emporter', 'À emporter', ARRAY['a emporter', 'emporter', 'take away', 'takeaway'], 1),
  ('livraison', 'Livraison via partenaire', ARRAY['livraison', 'livre', 'delivery'], 2),
  ('reservation', 'Réservation possible', ARRAY['reservation', 'reserver', 'reservable'], 3),
  ('groupes', 'Tables de 6 et plus', ARRAY['grande table', 'groupe de 6', 'six personnes', '6 personnes', 'grande tablee'], 4),
  ('terrasse', 'Terrasse', ARRAY['terrasse', 'exterieur', 'dehors'], 5),
  ('pmr', 'Accès fauteuil roulant', ARRAY['pmr', 'accessible', 'fauteuil', 'handicap', 'acces pmr'], 6),
  ('chaise_bebe', 'Chaise haute', ARRAY['chaise haute', 'chaise bebe'], 7),
  ('poussette', 'Place pour poussette', ARRAY['poussette'], 8),
  ('vegetarien', 'Options végétariennes', ARRAY['vegetarien', 'vegetarienne', 'veggie', 'vege'], 9),
  ('wifi', 'Wi-Fi', ARRAY['wifi', 'wi fi'], 10),
  ('salle_priere', 'Espace de prière', ARRAY['salle de priere', 'priere'], 11)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, synonyms = EXCLUDED.synonyms, sort_order = EXCLUDED.sort_order;

COMMIT;
