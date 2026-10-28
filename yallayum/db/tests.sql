-- Tests du schéma (bash db/run-tests.sh). Chaque vérification affiche « ok … » ;
-- la première qui échoue arrête tout (ON_ERROR_STOP). Données fictives.

SET TIME ZONE 'UTC';
SET client_min_messages = notice;

CREATE SCHEMA t;

CREATE FUNCTION t.check(p_cond boolean, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS NOT TRUE THEN
    RAISE EXCEPTION 'ÉCHEC : %', p_label USING ERRCODE = 'YY001';
  END IF;
  RAISE NOTICE 'ok  %', p_label;
END $$;

-- Exécute p_sql et exige l'erreur p_state (code SQLSTATE).
CREATE FUNCTION t.expect_error(p_sql text, p_state text, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = p_state THEN
      RAISE NOTICE 'ok  % (refusé : %)', p_label, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'ÉCHEC « % » : erreur % (%) au lieu de %', p_label, SQLSTATE, SQLERRM, p_state USING ERRCODE = 'YY001';
  END;
  RAISE EXCEPTION 'ÉCHEC « % » : aucune erreur, % attendue', p_label, p_state USING ERRCODE = 'YY001';
END $$;

-- Crée une fiche et la fait passer brouillon → relecture → publiée.
CREATE FUNCTION t.restaurant(p_slug text, p_lat double precision, p_lng double precision, p_brand uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  rid uuid;
BEGIN
  INSERT INTO restaurants (slug, name, brand_id, description, location, street, postcode, city, district, hours_verified_at, hours_source, price_level)
  VALUES (p_slug, initcap(replace(p_slug, '-', ' ')), p_brand, 'Adresse fictive de test.',
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, '1 rue de Test', '75011', 'Paris', 'Paris 11e', '2026-09-01', 'team_phone', 2)
  RETURNING id INTO rid;
  UPDATE restaurants SET publication = 'in_review' WHERE id = rid;
  UPDATE restaurants SET publication = 'published' WHERE id = rid;
  RETURN rid;
END $$;

CREATE FUNCTION t.hours_every_day(p_restaurant uuid, p_opens time, p_closes time) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO opening_hours (restaurant_id, weekday, opens, closes) SELECT p_restaurant, d, p_opens, p_closes FROM generate_series(1, 7) d
$$;

GRANT USAGE ON SCHEMA t TO yy_backoffice, yy_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO yy_backoffice, yy_api;

-- Contexte : un super admin avec MFA.
INSERT INTO admin_users (email, display_name, role, mfa_enabled, activated_at) VALUES
  ('admin@yallayum.test', 'Admin', 'super_admin', true, now()),
  ('verif@yallayum.test', 'Vérificatrice', 'verifier', true, now()),
  ('edit@yallayum.test', 'Éditeur', 'editor', true, now()),
  ('a@resto.test', 'Restaurateur A', 'restaurateur', false, now()),
  ('b@resto.test', 'Restaurateur B', 'restaurateur', false, now());
SELECT id AS admin_id FROM admin_users WHERE email = 'admin@yallayum.test' \gset
SELECT id AS owner_a FROM admin_users WHERE email = 'a@resto.test' \gset
SELECT id AS owner_b FROM admin_users WHERE email = 'b@resto.test' \gset

SELECT set_config('app.role', 'super_admin', false), set_config('app.mfa', 'true', false),
       set_config('app.user_id', :'admin_id', false), set_config('app.change_reason', '', false) \g /dev/null

INSERT INTO certifiers (id, name, short_name) VALUES ('alpha', 'Organisme Alpha (fictif)', 'Alpha'), ('beta', 'Organisme Bêta (fictif)', 'Bêta');

\echo '— Horaires : 18:00 → 02:00 (cas 7)'
DO $$
DECLARE
  rid uuid := t.restaurant('nuit-blanche', 48.8665, 2.3836);
  s open_status_t;
BEGIN
  INSERT INTO opening_hours (restaurant_id, weekday, opens, closes) VALUES (rid, 5, '18:00', '02:00');
  s := open_status(rid, '2026-10-31 00:30 Europe/Paris');
  PERFORM t.check(s.state = 'open' AND s.closes_at = '02:00' AND s.confidence = 'confirmed', 'samedi 00:30 : ouvert jusqu''à 02:00');
  PERFORM t.check((open_status(rid, '2026-10-31 02:00 Europe/Paris')).state = 'closed', 'samedi 02:00 : fermé');
  PERFORM t.check((open_status(rid, '2026-10-31 01:45 Europe/Paris')).closing_soon, 'samedi 01:45 : ferme bientôt');
  PERFORM t.check((open_status(rid, '2026-10-30 12:00 Europe/Paris')).label = 'Fermé · ouvre à 18:00', 'vendredi midi : « Fermé · ouvre à 18:00 »');
  PERFORM t.check((open_status(rid, '2026-10-31 12:00 Europe/Paris')).label = 'Fermé · ouvre vendredi à 18:00', 'samedi midi : « ouvre vendredi à 18:00 »');
  PERFORM t.check(EXISTS (
    SELECT 1 FROM search_restaurants(2.30, 48.82, 2.42, 48.90, p_at => '2026-10-31 00:30 Europe/Paris', p_open_now => true) x
    WHERE x.slug = 'nuit-blanche' AND x.open_state = 'open' AND NOT x.hours_uncertain), 'recherche « ouvert maintenant » à 00:30 : trouvée, confirmée');
  -- Exception datée : remplace la journée, pas le débordement de la veille.
  INSERT INTO special_days (restaurant_id, day, closed, label, source) VALUES (rid, '2026-11-06', true, 'Congés', 'restaurant');
  PERFORM t.check((open_status(rid, '2026-11-06 20:00 Europe/Paris')).reason = 'special_day', 'exception « Congés » : fermé ce vendredi soir');
  PERFORM t.check((open_status(rid, '2026-11-06 20:00 Europe/Paris')).label = 'Fermé (congés) · ouvre vendredi à 18:00', 'libellé de l''exception');
END $$;

\echo '— Fiche fermée définitivement ou supprimée (cas 3)'
DO $$
DECLARE
  rid uuid := t.restaurant('le-ferme', 48.8674, 2.3636);
BEGIN
  PERFORM t.hours_every_day(rid, '00:00', '24:00');
  UPDATE restaurants SET operating = 'permanently_closed' WHERE id = rid;
  PERFORM t.check((open_status(rid, '2026-10-27 20:00 Europe/Paris')).state = 'closed', 'fermée définitivement : jamais « ouverte », même 24 h/24');
  PERFORM t.check(NOT EXISTS (SELECT 1 FROM discoverable_restaurants WHERE id = rid), 'absente de la découverte');
  PERFORM t.check(NOT EXISTS (SELECT 1 FROM search_restaurants(2.30, 48.82, 2.42, 48.90) WHERE id = rid), 'absente de la recherche');
  PERFORM t.check((SELECT resolution FROM resolve_slug('le-ferme')) = 'permanently_closed', 'lien profond : « fermé définitivement »');
  PERFORM t.check(EXISTS (SELECT 1 FROM audit_logs WHERE action = 'operating.permanently_closed' AND entity_id = rid::text), 'fermeture tracée au journal');
  PERFORM t.expect_error(format('UPDATE restaurants SET deleted_at = now() WHERE id = %L', rid), '23514', 'suppression logique d''une fiche publiée');
  PERFORM set_config('app.change_reason', 'Fermeture confirmée par téléphone', false);
  UPDATE restaurants SET publication = 'archived', deleted_at = now() WHERE id = rid;
  PERFORM set_config('app.change_reason', '', false);
  PERFORM t.check((open_status(rid, '2026-10-27 20:00 Europe/Paris')).reason = 'not_published', 'archivée et supprimée : « Fiche indisponible »');
  PERFORM t.check((SELECT resolution FROM resolve_slug('le-ferme')) = 'unavailable', 'lien profond : indisponible');
END $$;

\echo '— Transitions de publication'
DO $$
DECLARE
  rid uuid := t.restaurant('transitions', 48.85, 2.37);
BEGIN
  PERFORM t.expect_error(format('UPDATE restaurants SET publication = %L WHERE id = %L', 'suspended', rid), 'P0001', 'suspendre sans motif');
  PERFORM set_config('app.change_reason', 'Doute sérieux sur l''information halal', false);
  UPDATE restaurants SET publication = 'suspended' WHERE id = rid;
  PERFORM set_config('app.change_reason', '', false);
  PERFORM t.check(EXISTS (SELECT 1 FROM audit_logs WHERE action = 'publication.suspended' AND entity_id = rid::text AND reason LIKE 'Doute%'), 'suspension tracée avec son motif');
  PERFORM t.expect_error(format('UPDATE restaurants SET publication = %L WHERE id = %L', 'draft', rid), 'P0001', 'suspendue → brouillon : transition inexistante');
  PERFORM t.expect_error($q$INSERT INTO restaurants (slug, name, location, street, postcode, city, district, publication)
    VALUES ('direct', 'Direct', ST_MakePoint(2.35, 48.86)::geography, 'x', '75011', 'Paris', 'Paris 11e', 'published')$q$, 'P0001', 'créer une fiche directement publiée');
  PERFORM set_config('app.role', 'support', false);
  PERFORM t.expect_error(format('UPDATE restaurants SET publication = %L WHERE id = %L', 'published', rid), '42501', 'le support ne publie pas');
  PERFORM set_config('app.role', 'editor', false);
  PERFORM set_config('app.mfa', 'false', false);
  PERFORM set_config('app.change_reason', 'Levée de suspension', false);
  PERFORM t.expect_error(format('UPDATE restaurants SET publication = %L WHERE id = %L', 'published', rid), '42501', 'un éditeur sans MFA ne publie pas');
  PERFORM set_config('app.mfa', 'true', false);
  UPDATE restaurants SET publication = 'published' WHERE id = rid;
  PERFORM t.check((SELECT publication FROM restaurants WHERE id = rid) = 'published', 'un éditeur avec MFA republie, motif à l''appui');
  PERFORM set_config('app.role', 'super_admin', false);
  PERFORM set_config('app.change_reason', '', false);
END $$;

\echo '— Information halal : niveaux, expiration (cas 5 et 6)'
DO $$
DECLARE
  rid uuid := t.restaurant('les-braises', 48.8722, 2.3768);
  other uuid := t.restaurant('sans-preuve', 48.8725, 2.377);
  cert uuid;
  n integer;
  hs halal_status_t;
BEGIN
  INSERT INTO halal_claims (restaurant_id, kind, scope, certifier_id, method, evidence_date, valid_until, review_status, reviewed_at)
  VALUES (rid, 'certification', 'whole_menu', 'alpha', 'certificate_check', '2025-10-01', '2026-09-30', 'approved', '2025-10-02')
  RETURNING id INTO cert;
  INSERT INTO halal_claims (restaurant_id, kind, scope, method, evidence_date, review_status, reviewed_at)
  VALUES (rid, 'team_verification', 'meat_poultry', 'supplier_documents', '2026-02-10', 'approved', '2026-02-11');

  PERFORM t.check((halal_status(other, '2026-10-27')).level = 'unconfirmed', 'aucune preuve : « à confirmer », jamais « certifié »');
  INSERT INTO halal_claims (restaurant_id, kind, scope, method, evidence_date, review_status, reviewed_at)
  VALUES (other, 'establishment_declaration', 'whole_menu', 'legacy_import', '2025-06-29', 'approved', '2026-01-15');
  PERFORM t.check((halal_status(other, '2026-01-15')).level = 'declared', 'ancien badge « certifié par le restaurateur » : « déclaré »');
  PERFORM t.check((halal_status(other, '2026-10-27')).level = 'unconfirmed', 'déclaration de plus d''un an : retombe à « à confirmer »');
  INSERT INTO halal_claims (restaurant_id, kind, scope, certifier_id, method, evidence_date, review_status, reviewed_at)
  VALUES (other, 'certification', 'whole_menu', 'beta', 'certificate_check', '2026-05-01', 'approved', '2026-05-02');
  PERFORM t.check((halal_status(other, '2026-10-27')).level = 'unconfirmed', 'certification sans date de fin : ignorée');
  PERFORM t.expect_error(format($q$INSERT INTO halal_claims (restaurant_id, kind, scope, method, evidence_date) VALUES (%L, 'certification', 'whole_menu', 'certificate_check', '2026-01-01')$q$, other),
    '23514', 'certification sans organisme');

  hs := halal_status(rid, '2026-09-30');
  PERFORM t.check(hs.level = 'certified' AND hs.certifier_id = 'alpha' AND hs.freshness = 'aging', 'veille de l''expiration : certifié (preuve vieillissante)');
  hs := halal_status(rid, '2026-10-01');
  PERFORM t.check(hs.level = 'team_verified' AND hs.expired_certification_id = cert, 'lendemain : badge recalculé → « vérifié », expiration signalée');
  PERFORM t.check(NOT EXISTS (SELECT 1 FROM search_restaurants(2.30, 48.82, 2.42, 48.90, p_at => '2026-10-27 20:00 Europe/Paris', p_halal_min => 'certified') WHERE id = rid),
    'filtre « certifié uniquement » : écartée');

  n := expire_halal_claims('2026-10-01');
  PERFORM t.check(n = 1, 'traitement quotidien : 1 certification expirée');
  PERFORM t.check(EXISTS (SELECT 1 FROM audit_logs WHERE action = 'halal_claim.expired' AND entity_id = cert::text
    AND before ->> 'level' = 'certified' AND after ->> 'level' = 'team_verified'), 'expiration au journal, avec niveaux avant/après');
  PERFORM t.check(EXISTS (SELECT 1 FROM review_tasks WHERE claim_id = cert AND kind = 'halal_reverification' AND status = 'open' AND priority = 1), 'revérification ouverte, priorité haute');
  n := expire_halal_claims('2026-10-02');
  PERFORM t.check(n = 0 AND (SELECT count(*) FROM review_tasks WHERE claim_id = cert) = 1, 'traitement idempotent');

  PERFORM set_config('app.role', 'editor', false);
  PERFORM t.expect_error(format($q$INSERT INTO halal_claims (restaurant_id, kind, scope, method, evidence_date, review_status, reviewed_at)
    VALUES (%L, 'team_verification', 'whole_menu', 'on_site_visit', '2026-10-01', 'approved', now())$q$, rid), '42501', 'un éditeur ne valide pas une information halal');
  PERFORM set_config('app.role', 'verifier', false);
  INSERT INTO halal_claims (restaurant_id, kind, scope, method, evidence_date, review_status, reviewed_at)
  VALUES (rid, 'team_verification', 'whole_menu', 'on_site_visit', '2026-10-20', 'approved', now());
  PERFORM t.check((halal_status(rid, '2026-10-27')).scope = 'whole_menu', 'un vérificateur valide ; la preuve la plus récente fait foi');
  PERFORM set_config('app.role', 'super_admin', false);
END $$;

\echo '— Verrouillage optimiste et historique'
DO $$
DECLARE
  rid uuid := t.restaurant('versionnee', 48.86, 2.36);
  v integer;
  n integer;
BEGIN
  SELECT version INTO v FROM restaurants WHERE id = rid;
  UPDATE restaurants SET description = 'Version de A' WHERE id = rid AND version = v;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t.check(n = 1, 'A enregistre sur la version lue');
  UPDATE restaurants SET description = 'Version de B' WHERE id = rid AND version = v;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t.check(n = 0, 'B enregistre sur une version périmée : 0 ligne, conflit');
  PERFORM t.check((SELECT description FROM restaurants WHERE id = rid) = 'Version de A' AND (SELECT version FROM restaurants WHERE id = rid) = v + 1,
    'rien n''est écrasé, la version a avancé');
  PERFORM t.check(EXISTS (SELECT 1 FROM change_history WHERE restaurant_id = rid AND diff -> 'description' ->> 'after' = 'Version de A'), 'historique champ par champ');
END $$;

\echo '— Adresses web (liens profonds)'
DO $$
DECLARE
  rid uuid;
BEGIN
  SELECT id INTO rid FROM restaurants WHERE slug = 'les-braises';
  UPDATE restaurants SET slug = 'les-braises-belleville' WHERE id = rid;
  PERFORM t.check((SELECT resolution FROM resolve_slug('les-braises')) = 'renamed' AND (SELECT restaurant_id FROM resolve_slug('les-braises')) = rid, 'l''ancien lien mène à la fiche renommée');
  PERFORM t.check((SELECT resolution FROM resolve_slug('les-braises-belleville')) = 'restaurant', 'le nouveau lien aussi');
  PERFORM t.expect_error($q$SELECT t.restaurant('les-braises', 48.80, 2.30)$q$, '23505', 'une autre fiche ne peut pas reprendre l''ancien lien');
  PERFORM t.check(NOT EXISTS (SELECT 1 FROM resolve_slug('inconnu')), 'lien inconnu : aucune résolution (404 côté API)');
END $$;

\echo '— Enseigne à deux établissements (cas 4)'
DO $$
DECLARE
  b uuid;
  a1 uuid;
  a2 uuid;
BEGIN
  INSERT INTO brands (name) VALUES ('Smash Club (fictif)') RETURNING id INTO b;
  a1 := t.restaurant('smash-club-republique', 48.8674, 2.3636, b);
  a2 := t.restaurant('smash-club-saint-denis', 48.9362, 2.3574, b);
  PERFORM t.hours_every_day(a1, '11:30', '23:00');
  PERFORM t.hours_every_day(a2, '11:30', '02:00');
  PERFORM t.check((open_status(a1, '2026-10-27 23:30 Europe/Paris')).state = 'closed' AND (open_status(a2, '2026-10-27 23:30 Europe/Paris')).state = 'open',
    'deux fiches, deux horaires : République fermé, Saint-Denis ouvert à 23:30');
  PERFORM t.check((SELECT count(*) FROM search_restaurants(2.30, 48.84, 2.40, 48.95) WHERE slug LIKE 'smash-club-%') = 2, 'deux résultats distincts');
  PERFORM t.expect_error(format($q$SELECT t.restaurant('smash-club-doublon', 48.86741, 2.36362, %L)$q$, b), '23505', 'même enseigne à moins de 25 m : doublon refusé');
END $$;

\echo '— Recherche : filtres stricts'
DO $$
DECLARE
  sushi uuid := t.restaurant('kyoto-test', 48.8600, 2.3500);
  stale uuid := t.restaurant('horaires-anciens', 48.8610, 2.3510);
  nohours uuid := t.restaurant('sans-horaires', 48.8620, 2.3520);
  noprice uuid := t.restaurant('sans-prix', 48.8630, 2.3530);
  ids uuid[];
BEGIN
  INSERT INTO restaurant_cuisines VALUES (sushi, 'japonaise', true);
  PERFORM t.hours_every_day(sushi, '12:00', '23:00');
  PERFORM t.hours_every_day(stale, '12:00', '23:00');
  UPDATE restaurants SET hours_verified_at = '2025-01-01' WHERE id = stale;
  UPDATE restaurants SET price_level = NULL WHERE id = noprice;
  INSERT INTO restaurant_amenities VALUES (sushi, 'terrasse', '2026-09-01', 'team_visit'), (sushi, 'pmr', '2026-09-01', 'team_visit'), (stale, 'terrasse', '2026-09-01', 'team_visit');

  SELECT array_agg(id) INTO ids FROM search_restaurants(2.34, 48.855, 2.36, 48.866, p_cuisines => ARRAY['asiatique']);
  PERFORM t.check(ids = ARRAY[sushi], '« Asiatique » inclut « Japonaise »');
  SELECT array_agg(id) INTO ids FROM search_restaurants(2.34, 48.855, 2.36, 48.866, p_amenities => ARRAY['terrasse', 'pmr']);
  PERFORM t.check(ids = ARRAY[sushi], 'équipements : tous requis');
  PERFORM t.check(NOT EXISTS (SELECT 1 FROM search_restaurants(2.34, 48.855, 2.36, 48.866, p_price_max => 3::smallint) WHERE id = noprice), 'prix inconnu : écarté d''un filtre budget');
  PERFORM t.check((SELECT hours_uncertain FROM search_restaurants(2.34, 48.855, 2.36, 48.866, p_at => '2026-10-27 20:00 Europe/Paris', p_open_now => true) WHERE id = stale),
    'ouvert maintenant + horaires anciens : « non confirmé »');
  PERFORM t.check((SELECT open_state = 'unknown' AND hours_uncertain FROM search_restaurants(2.34, 48.855, 2.36, 48.866, p_at => '2026-10-27 20:00 Europe/Paris', p_open_now => true) WHERE id = nohours),
    'ouvert maintenant + sans horaires : « inconnu », jamais « ouvert »');
  PERFORM t.check(NOT EXISTS (SELECT 1 FROM search_restaurants(2.34, 48.855, 2.36, 48.866, p_at => '2026-10-27 23:30 Europe/Paris', p_open_now => true) WHERE id = sushi),
    'ouvert maintenant à 23:30 : la fiche fermée est écartée');
  PERFORM t.check((SELECT count(*) FROM search_restaurants(2.34, 48.855, 2.36, 48.866, p_limit => 2)) = 2, 'pagination : limite respectée');
  PERFORM t.check((SELECT count(*) FROM search_restaurants(2.34, 48.855, 2.36, 48.866,
      p_after_distance => (SELECT distance_m FROM search_restaurants(2.34, 48.855, 2.36, 48.866) ORDER BY distance_m DESC, id DESC LIMIT 1),
      p_after_id => (SELECT id FROM search_restaurants(2.34, 48.855, 2.36, 48.866) ORDER BY distance_m DESC, id DESC LIMIT 1))) = 0, 'curseur après le dernier : page vide');
  PERFORM t.check((SELECT count(*) FROM cluster_restaurants(2.30, 48.82, 2.42, 48.90, 11)) >= 1, 'regroupement par grille');
END $$;

\echo '— Fidélité : idempotence et grand livre (cas 14)'
DO $$
DECLARE
  rid uuid;
  p uuid;
  prog uuid;
  card uuid;
  tx uuid;
BEGIN
  SELECT id INTO rid FROM restaurants WHERE slug = 'kyoto-test';
  INSERT INTO partners (restaurant_id, status, contract_ref, starts_on) VALUES (rid, 'active', 'CT-TEST-1', '2026-10-01') RETURNING id INTO p;
  PERFORM t.expect_error($q$INSERT INTO loyalty_programs (status, provisional, earn_mode, points_per_visit, cooldown_minutes, daily_cap_per_partner)
    VALUES ('live', true, 'per_visit', 10, 120, 1)$q$, '23514', 'programme « live » avec des paramètres provisoires');
  INSERT INTO loyalty_programs (status, provisional, earn_mode, points_per_visit, cooldown_minutes, daily_cap_per_partner)
  VALUES ('pilot', true, 'per_visit', 10, 120, 1) RETURNING id INTO prog;
  INSERT INTO loyalty_cards (secret_ref) VALUES ('kms://cartes/test-1') RETURNING id INTO card;

  INSERT INTO loyalty_transactions (card_id, partner_id, program_id, kind, points, idempotency_key)
  VALUES (card, p, prog, 'earn', 10, 'earn:' || p || ':YY1.tok.1') RETURNING id INTO tx;
  PERFORM t.expect_error(format($q$INSERT INTO loyalty_transactions (card_id, partner_id, program_id, kind, points, idempotency_key)
    VALUES (%L, %L, %L, 'earn', 10, %L)$q$, card, p, prog, 'earn:' || p || ':YY1.tok.1'), '23505', 'même jeton scanné deux fois : pas de second crédit');
  PERFORM t.check((SELECT points FROM loyalty_balances WHERE card_id = card) = 10, 'solde : 10');

  PERFORM t.expect_error(format($q$INSERT INTO loyalty_transactions (card_id, partner_id, program_id, kind, points, idempotency_key, reverses_id, reason)
    VALUES (%L, %L, %L, 'reversal', -5, 'reversal:x', %L, 'erreur')$q$, card, p, prog, tx), 'P0001', 'annulation partielle refusée');
  INSERT INTO loyalty_transactions (card_id, partner_id, program_id, kind, points, idempotency_key, reverses_id, reason)
  VALUES (card, p, prog, 'reversal', -10, 'reversal:' || tx, tx, 'Erreur de caisse');
  PERFORM t.expect_error(format($q$INSERT INTO loyalty_transactions (card_id, partner_id, program_id, kind, points, idempotency_key, reverses_id, reason)
    VALUES (%L, %L, %L, 'reversal', -10, 'reversal-bis', %L, 'encore')$q$, card, p, prog, tx), '23505', 'double annulation refusée');
  PERFORM t.check((SELECT points FROM loyalty_balances WHERE card_id = card) = 0, 'solde après annulation : 0');
  PERFORM t.expect_error(format('UPDATE loyalty_transactions SET points = 1000 WHERE id = %L', tx), '42501', 'grand livre non modifiable');
  PERFORM t.expect_error(format('DELETE FROM loyalty_transactions WHERE id = %L', tx), '42501', 'grand livre non supprimable');
  PERFORM t.expect_error(format($q$INSERT INTO loyalty_transactions (card_id, partner_id, program_id, kind, points, idempotency_key)
    VALUES (%L, %L, %L, 'earn', -10, 'earn:neg')$q$, card, p, prog), '23514', 'crédit négatif refusé');
END $$;

\echo '— Journal d''audit non modifiable'
DO $$
DECLARE
  broken integer;
BEGIN
  PERFORM t.expect_error('UPDATE audit_logs SET action = ''falsifié''', '42501', 'modifier le journal');
  PERFORM t.expect_error('DELETE FROM audit_logs', '42501', 'effacer le journal');
  PERFORM t.expect_error('TRUNCATE audit_logs', '42501', 'vider le journal');
  SELECT count(*) INTO broken FROM (
    SELECT prev_hash, lag(hash) OVER (ORDER BY id) AS expected FROM audit_logs
  ) x WHERE prev_hash IS DISTINCT FROM expected;
  PERFORM t.check(broken = 0 AND (SELECT count(*) FROM audit_logs) > 5, 'chaîne d''empreintes continue');
END $$;

\echo '— Restaurateurs : accès limité à leur établissement (cas 13)'
DO $$
DECLARE
  ra uuid := t.restaurant('chez-a', 48.84, 2.30);
  rb uuid := t.restaurant('chez-b-concurrent', 48.8401, 2.3003);
  pa uuid;
  pb uuid;
  prog uuid;
  card uuid;
BEGIN
  INSERT INTO partners (restaurant_id, status, contract_ref, starts_on) VALUES (ra, 'active', 'CT-A', '2026-10-01') RETURNING id INTO pa;
  INSERT INTO partners (restaurant_id, status, contract_ref, starts_on) VALUES (rb, 'active', 'CT-B', '2026-10-01') RETURNING id INTO pb;
  INSERT INTO merchant_memberships (admin_user_id, restaurant_id, partner_id, status, proof_ref, verified_at)
  SELECT id, ra, pa, 'active', 'kbis-a', now() FROM admin_users WHERE email = 'a@resto.test';
  INSERT INTO merchant_memberships (admin_user_id, restaurant_id, partner_id, status, proof_ref, verified_at)
  SELECT id, rb, pb, 'active', 'kbis-b', now() FROM admin_users WHERE email = 'b@resto.test';
  SELECT id INTO prog FROM loyalty_programs LIMIT 1;
  INSERT INTO loyalty_cards (secret_ref) VALUES ('kms://cartes/test-2') RETURNING id INTO card;
  INSERT INTO loyalty_transactions (card_id, partner_id, program_id, kind, points, idempotency_key) VALUES
    (card, pa, prog, 'earn', 10, 'earn:a:1'), (card, pb, prog, 'earn', 10, 'earn:b:1');
END $$;

SELECT p.id AS partner_b, (SELECT id FROM loyalty_programs LIMIT 1) AS program_id, (SELECT card_id FROM loyalty_transactions WHERE idempotency_key = 'earn:a:1') AS card_id
FROM partners p JOIN restaurants r ON r.id = p.restaurant_id WHERE r.slug = 'chez-b-concurrent' \gset
SELECT set_config('t.partner_b', :'partner_b', false), set_config('t.program', :'program_id', false), set_config('t.card', :'card_id', false) \g /dev/null

SET ROLE yy_backoffice;
SELECT set_config('app.role', 'restaurateur', false), set_config('app.user_id', :'owner_a', false), set_config('app.mfa', 'false', false) \g /dev/null
DO $$
DECLARE
  n integer;
BEGIN
  PERFORM t.check((SELECT array_agg(slug) FROM restaurants) = ARRAY['chez-a'], 'A ne voit que sa fiche');
  PERFORM t.check(NOT EXISTS (SELECT 1 FROM restaurants WHERE slug = 'chez-b-concurrent'), 'A ne voit pas son concurrent');
  PERFORM t.check((SELECT count(*) FROM loyalty_transactions) = 1 AND (SELECT idempotency_key FROM loyalty_transactions) = 'earn:a:1', 'A ne voit que les transactions de son établissement');
  PERFORM t.check((SELECT count(*) FROM merchant_memberships) = 1, 'A ne voit que son rattachement');
  PERFORM t.check(NOT EXISTS (SELECT 1 FROM halal_evidence_documents), 'A ne voit aucune pièce justificative');
  -- Aucune politique d'écriture pour lui : la mise à jour ne touche aucune ligne.
  UPDATE restaurants SET description = 'piraté' WHERE slug = 'chez-a';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t.check(n = 0, 'A ne modifie pas directement sa fiche (proposition obligatoire)');
  PERFORM t.expect_error(format($q$INSERT INTO loyalty_transactions (card_id, partner_id, program_id, kind, points, idempotency_key)
    VALUES (%L, %L, %L, 'earn', 10, 'earn:b:forge')$q$, current_setting('t.card'), current_setting('t.partner_b'), current_setting('t.program')), '42501',
    'A crédite au nom d''un concurrent : refusé');
END $$;
SELECT set_config('app.user_id', :'owner_b', false) \g /dev/null
DO $$
BEGIN
  PERFORM t.check((SELECT array_agg(slug) FROM restaurants) = ARRAY['chez-b-concurrent'], 'B ne voit que sa fiche');
END $$;
RESET ROLE;
SELECT set_config('app.role', 'super_admin', false), set_config('app.user_id', :'admin_id', false), set_config('app.mfa', 'true', false) \g /dev/null

\echo '— Contributions : jamais publiées directement (cas 12)'
DO $$
DECLARE
  rid uuid;
  c uuid;
BEGIN
  SELECT id INTO rid FROM restaurants WHERE slug = 'kyoto-test';
  INSERT INTO contributions (kind, restaurant_id, payload, halal_source) VALUES ('halal_info', rid, '{"halal": "certificat en vitrine"}', 'vitrine') RETURNING id INTO c;
  PERFORM t.expect_error(format('UPDATE contributions SET status = %L WHERE id = %L', 'accepted', c), 'P0001', 'reçue → acceptée sans examen');
  PERFORM t.expect_error(format('UPDATE contributions SET status = %L WHERE id = %L', 'rejected', c), 'P0001', 'refus sans motif');
  UPDATE contributions SET status = 'in_review' WHERE id = c;
  UPDATE contributions SET status = 'accepted' WHERE id = c;
  INSERT INTO change_proposals (contribution_id, restaurant_id, changes, requires) VALUES (c, rid, '{"halal": "certificat en vitrine"}', 'halal.review');
  PERFORM t.check((SELECT count(*) FROM contribution_events WHERE contribution_id = c) = 3, 'historique : reçue, en examen, acceptée');
  PERFORM t.check(NOT EXISTS (SELECT 1 FROM halal_claims WHERE restaurant_id = rid), 'la fiche publique est inchangée');
  PERFORM t.expect_error($q$INSERT INTO contributions (kind, payload) VALUES ('new_restaurant', '{"address": "1 rue X"}')$q$, '23514', 'proposition sans nom');
  PERFORM t.expect_error($q$INSERT INTO contributions (kind, payload) VALUES ('hours', '{}')$q$, '23514', 'signalement sans fiche visée');
END $$;

\echo '— Contenus, campagnes, médias'
DO $$
DECLARE
  rid uuid;
  coll uuid;
BEGIN
  SELECT id INTO rid FROM restaurants WHERE slug = 'kyoto-test';
  INSERT INTO editorial_collections (slug, title, criteria) VALUES ('pour-un-date', 'Pour un date', 'Ambiance calme, réservation possible') RETURNING id INTO coll;
  PERFORM t.expect_error(format('UPDATE editorial_collections SET status = %L WHERE id = %L', 'published', coll), 'P0001', 'collection publiée sans adresse');
  INSERT INTO collection_restaurants VALUES (coll, rid, 1, NULL);
  UPDATE editorial_collections SET status = 'published' WHERE id = coll;
  PERFORM t.check((SELECT published_at IS NOT NULL FROM editorial_collections WHERE id = coll), 'collection publiée avec au moins une adresse');
  PERFORM t.expect_error(format($q$INSERT INTO sponsored_campaigns (restaurant_id, starts_on, ends_on, label, contract_ref) VALUES (%L, '2026-10-01', '2026-11-01', 'Recommandé', 'C1')$q$, rid),
    '23514', 'campagne sans la mention « Sponsorisé »');
  PERFORM t.expect_error(format($q$INSERT INTO media (restaurant_id, kind, subject, storage_key, alt) VALUES (%L, 'photo', 'dish', 'p/1.jpg', 'Assiette')$q$, rid),
    '23514', 'photo sans licence');
  INSERT INTO media (restaurant_id, kind, subject, storage_key, alt, license, credit) VALUES (rid, 'photo', 'dish', 'p/2.jpg', 'Plateau de makis', 'Cession de droits', 'Photographe (fictif)');
  INSERT INTO media (restaurant_id, kind, subject, alt, seed) VALUES (rid, 'illustration', 'generic', 'Illustration générique', 42);
  PERFORM t.check((SELECT count(*) FROM public_media WHERE restaurant_id = rid) = 1, 'photo non modérée invisible ; illustration visible');
END $$;

\echo '— Mesure d''audience'
DO $$
BEGIN
  INSERT INTO analytics_events (name, version, regime, props, at) VALUES ('route_clicked', 1, 'audience', '{"restaurant_id": "r1", "app": "google", "distance": "500m-1km"}', '2026-10-27 19:00');
  PERFORM t.expect_error($q$INSERT INTO analytics_events (name, version, regime, props, at) VALUES ('route_clicked', 1, 'audience', '{"lat": 48.86}', '2026-10-27 19:00')$q$, 'P0001', 'coordonnées refusées');
  PERFORM t.expect_error($q$INSERT INTO analytics_events (name, version, regime, props, at) VALUES ('route_clicked', 1, 'audience', '{"humeur": "faim"}', '2026-10-27 19:00')$q$, 'P0001', 'propriété hors dictionnaire refusée');
  PERFORM t.expect_error($q$INSERT INTO analytics_events (name, version, regime, props, at) VALUES ('route_clicked', 1, 'audience', '{}', '2026-10-27 19:00:42')$q$, '23514', 'horodatage non tronqué refusé');
  PERFORM t.expect_error($q$INSERT INTO analytics_events (name, version, regime, props, at) VALUES ('restaurant_impression', 1, 'audience', '{}', '2026-10-27 19:00')$q$, 'P0001', 'régime incohérent refusé');
  INSERT INTO analytics_events (name, version, regime, props, at) VALUES ('search_submitted', 1, 'audience', '{"results": 0, "zero_query": "tajine lille"}', '2026-06-01 12:00');
  PERFORM purge_analytics('2026-10-27');
  PERFORM t.check((SELECT NOT (props ? 'zero_query') FROM analytics_events WHERE name = 'search_submitted'), 'texte des recherches sans résultat effacé après 90 jours');
END $$;

\echo '— Suppression de compte (cas 15)'
DO $$
DECLARE
  u uuid;
  card uuid;
  summary jsonb;
  rid uuid;
BEGIN
  SELECT id INTO rid FROM restaurants WHERE slug = 'kyoto-test';
  INSERT INTO users (email, auth_provider) VALUES ('client@exemple.test', 'email') RETURNING id INTO u;
  INSERT INTO favorites (user_id, restaurant_id) VALUES (u, rid);
  INSERT INTO consents (user_id, purpose, legal_basis, granted, text_version) VALUES (u, 'analytics', 'consent', true, '2026-10');
  INSERT INTO loyalty_cards (user_id, secret_ref) VALUES (u, 'kms://cartes/client') RETURNING id INTO card;
  INSERT INTO loyalty_transactions (card_id, partner_id, program_id, kind, points, idempotency_key)
  SELECT card, p.id, (SELECT id FROM loyalty_programs LIMIT 1), 'earn', 10, 'earn:client:1' FROM partners p WHERE p.restaurant_id = rid;
  summary := delete_account(u);
  PERFORM t.check(NOT EXISTS (SELECT 1 FROM users WHERE id = u) AND NOT EXISTS (SELECT 1 FROM favorites WHERE user_id = u), 'profil et favoris effacés');
  PERFORM t.check(NOT EXISTS (SELECT 1 FROM consents WHERE user_id = u), 'consentements effacés avec le compte');
  PERFORM t.check(EXISTS (SELECT 1 FROM loyalty_transactions WHERE card_id = card) AND (SELECT user_id IS NULL AND NOT active FROM loyalty_cards WHERE id = card),
    'transactions conservées, carte désactivée et détachée');
  PERFORM t.check((summary ->> 'loyalty_transactions_retained')::int = 1, 'résumé de la suppression');
  PERFORM t.check(EXISTS (SELECT 1 FROM audit_logs WHERE action = 'privacy.account_deleted' AND entity_id = u::text), 'suppression tracée');
END $$;

\echo '— Taxonomie'
DO $$
BEGIN
  PERFORM t.check(cuisine_with_descendants(ARRAY['asiatique']) @> ARRAY['japonaise', 'coreenne', 'thai', 'chinoise'], 'descendants d''« asiatique »');
  PERFORM t.expect_error($q$UPDATE cuisines SET parent_id = 'japonaise' WHERE id = 'asiatique'$q$, 'P0001', 'cycle dans la hiérarchie refusé');
  PERFORM t.check((SELECT count(*) FROM cuisines) = 34 AND (SELECT count(*) FROM occasions) = 10 AND (SELECT count(*) FROM amenities) = 12, 'taxonomies initiales chargées');
END $$;

\echo '— Tableau de bord'
DO $$
BEGIN
  PERFORM t.restaurant('les-braises-bis', 48.87222, 2.37682);
  PERFORM t.check((SELECT discoverable FROM catalog_health) > 0, 'santé du catalogue calculée');
  PERFORM t.check(EXISTS (SELECT 1 FROM duplicate_candidates), 'doublons probables détectés (fiches de test voisines)');
END $$;
