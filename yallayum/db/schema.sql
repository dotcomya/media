-- YallaYum — schéma PostgreSQL 16 + PostGIS.
--
-- Miroir du vocabulaire de src/domain (types.ts) : un statut, un niveau de
-- preuve ou un rôle porte le même nom ici, dans l'API et dans les applications.
-- Les règles qui protègent la confiance (badge halal dérivé, fiches fermées
-- jamais « ouvertes », journal non modifiable, fidélité idempotente, accès
-- restreint des restaurateurs) sont garanties par la base elle-même, pas
-- seulement par le code applicatif.
--
-- Conventions : identifiants uuid (sauf taxonomies et organismes : texte
-- lisible), horodatages timestamptz, dates civiles `date` interprétées dans le
-- fuseau de l'établissement, commentaires en français.

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS citext;

-- ─── Rôles de connexion ─────────────────────────────────────────────────────
-- L'API publique et le back-office se connectent avec un rôle de connexion
-- membre de l'un de ces deux rôles, puis renseignent à chaque requête :
--   app.user_id (uuid), app.role (admin_role), app.mfa ('true'|'false'),
--   app.change_reason (motif des décisions sensibles).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yy_api') THEN CREATE ROLE yy_api NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yy_backoffice') THEN CREATE ROLE yy_backoffice NOLOGIN; END IF;
END $$;

-- ─── Types énumérés (src/domain/types.ts) ───────────────────────────────────

CREATE TYPE publication_status AS ENUM ('draft', 'in_review', 'published', 'suspended', 'archived');
CREATE TYPE operating_status AS ENUM ('operating', 'temporarily_closed', 'permanently_closed', 'moved');
CREATE TYPE hours_source AS ENUM ('restaurant', 'team_visit', 'team_phone', 'website', 'community', 'legacy_import');
CREATE TYPE halal_claim_kind AS ENUM ('certification', 'team_verification', 'establishment_declaration');
CREATE TYPE halal_scope AS ENUM ('whole_menu', 'meat_poultry', 'partial');
CREATE TYPE claim_review_status AS ENUM ('pending', 'approved', 'rejected', 'revoked');
CREATE TYPE evidence_method AS ENUM ('certificate_check', 'on_site_visit', 'supplier_documents', 'phone', 'email', 'legacy_import');
-- Ordre significatif : unconfirmed < declared < team_verified < certified.
CREATE TYPE trust_level AS ENUM ('unconfirmed', 'declared', 'team_verified', 'certified');
CREATE TYPE alcohol_policy AS ENUM ('not_served', 'served', 'unknown');
CREATE TYPE media_kind AS ENUM ('photo', 'illustration');
CREATE TYPE media_subject AS ENUM ('dish', 'room', 'facade', 'generic');
CREATE TYPE rights_status AS ENUM ('pending', 'cleared', 'refused');
CREATE TYPE moderation_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE cuisine_family AS ENUM ('origine', 'format', 'moment', 'style');
CREATE TYPE occasion_kind AS ENUM ('occasion', 'ambiance');
CREATE TYPE admin_role AS ENUM ('super_admin', 'editor', 'verifier', 'support', 'restaurateur');
CREATE TYPE contribution_kind AS ENUM ('new_restaurant', 'closed_permanently', 'moved', 'hours', 'halal_info', 'photos', 'contact', 'duplicate', 'other');
CREATE TYPE contribution_status AS ENUM ('received', 'in_review', 'needs_info', 'accepted', 'rejected', 'duplicate');
CREATE TYPE proposal_status AS ENUM ('pending', 'applied', 'discarded');
CREATE TYPE review_task_kind AS ENUM ('halal_reverification', 'hours_reverification', 'duplicate', 'contribution', 'media_rights', 'merchant_claim');
CREATE TYPE task_status AS ENUM ('open', 'in_progress', 'done', 'cancelled');
CREATE TYPE content_status AS ENUM ('draft', 'scheduled', 'published', 'archived');
CREATE TYPE post_kind AS ENUM ('guide', 'top', 'country_dish', 'found_on', 'article');
CREATE TYPE program_status AS ENUM ('disabled', 'pilot', 'live');
CREATE TYPE earn_mode AS ENUM ('per_visit', 'per_amount');
CREATE TYPE tx_kind AS ENUM ('earn', 'redeem', 'reversal', 'adjustment');
CREATE TYPE reward_funding AS ENUM ('partner', 'yallayum', 'shared');
CREATE TYPE partner_status AS ENUM ('prospect', 'active', 'suspended', 'ended');
CREATE TYPE membership_status AS ENUM ('pending', 'active', 'revoked');
CREATE TYPE scan_outcome AS ENUM ('credited', 'duplicate', 'rejected');
CREATE TYPE dispute_status AS ENUM ('open', 'resolved', 'rejected');
CREATE TYPE consent_regime AS ENUM ('audience', 'analytics');
CREATE TYPE consent_purpose AS ENUM ('audience', 'analytics', 'search_history', 'precise_location', 'marketing_email', 'push');
CREATE TYPE legal_basis AS ENUM ('consent', 'legitimate_interest', 'contract', 'legal_obligation');
CREATE TYPE auth_provider AS ENUM ('email', 'apple', 'google');

-- ─── Configuration produit ──────────────────────────────────────────────────
-- Réglages modifiables depuis le back-office sans migration (durées de
-- validité, rétention, poids du classement…). Valeurs par défaut = src/domain.

CREATE TABLE app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_config (key, value, description) VALUES
  ('halal.team_verification_days', '365', 'Validité d''une vérification de l''équipe (jours).'),
  ('halal.declaration_days', '365', 'Validité d''une déclaration du restaurant (jours).'),
  ('halal.aging_ratio', '0.75', 'Part de la validité au-delà de laquelle une preuve « vieillit ».'),
  ('hours.stale_after_days', '180', 'Au-delà, des horaires sont « à confirmer ».'),
  ('hours.closing_soon_minutes', '30', 'Seuil de « ferme bientôt ».'),
  ('analytics.retention_days.audience', '760', 'Conservation des événements d''audience (25 mois, cadre d''exemption CNIL).'),
  ('analytics.retention_days.analytics', '395', 'Conservation des événements soumis à consentement (13 mois).'),
  ('analytics.zero_query_days', '90', 'Conservation du texte des recherches sans résultat.'),
  ('ranking.weights', '{"text":3,"proximity":2,"occasion":1.2,"openness":1,"completeness":0.8,"freshness":0.8,"editorial":0.5}', 'Poids du classement (src/domain/ranking.ts).'),
  ('ranking.sponsored_slot', '3', 'Position de l''emplacement sponsorisé.');

CREATE FUNCTION cfg_num(p_key text, p_default numeric) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT (value #>> '{}')::numeric FROM app_config WHERE key = p_key), p_default)
$$;

-- ─── Contexte de session ────────────────────────────────────────────────────

CREATE FUNCTION yy_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION yy_current_role() RETURNS admin_role
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.role', true), '')::admin_role $$;

CREATE FUNCTION yy_mfa() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.mfa', true), '') = 'true' $$;

CREATE FUNCTION yy_change_reason() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(trim(coalesce(current_setting('app.change_reason', true), '')), '') $$;

-- ─── Utilitaires texte ──────────────────────────────────────────────────────

CREATE FUNCTION yy_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- Même normalisation que src/domain/text.ts : minuscules, sans accents ni ponctuation.
CREATE FUNCTION yy_normalize(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT trim(regexp_replace(regexp_replace(replace(replace(lower(yy_unaccent($1)), 'œ', 'oe'), 'æ', 'ae'),
    '[^a-z0-9€]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

CREATE FUNCTION is_valid_timezone(p_tz text) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM now() AT TIME ZONE p_tz;
  RETURN true;
EXCEPTION WHEN invalid_parameter_value THEN
  RETURN false;
END $$;

-- ─── Rôles et droits du back-office (src/domain/rbac.ts) ────────────────────

CREATE TABLE role_permissions (
  role admin_role NOT NULL,
  permission text NOT NULL,
  PRIMARY KEY (role, permission)
);

INSERT INTO role_permissions (role, permission)
SELECT 'super_admin'::admin_role, p FROM unnest(ARRAY[
  'restaurant.read', 'restaurant.edit', 'restaurant.publish', 'halal.review', 'halal.evidence.read',
  'contribution.moderate', 'content.edit', 'content.publish', 'import.run', 'loyalty.read', 'loyalty.adjust',
  'stats.read', 'user.manage', 'audit.read', 'privacy.requests']) p
UNION ALL SELECT 'editor'::admin_role, p FROM unnest(ARRAY['restaurant.read', 'restaurant.edit', 'restaurant.publish', 'contribution.moderate', 'content.edit', 'content.publish', 'import.run', 'stats.read']) p
UNION ALL SELECT 'verifier'::admin_role, p FROM unnest(ARRAY['restaurant.read', 'halal.review', 'halal.evidence.read', 'contribution.moderate', 'stats.read', 'audit.read']) p
UNION ALL SELECT 'support'::admin_role, p FROM unnest(ARRAY['restaurant.read', 'contribution.moderate', 'loyalty.read', 'privacy.requests']) p
UNION ALL SELECT 'restaurateur'::admin_role, p FROM unnest(ARRAY['restaurant.read', 'restaurant.propose_change', 'stats.read', 'loyalty.read']) p;

-- Droits qui exigent une session MFA pour les rôles internes.
CREATE TABLE sensitive_permissions (permission text PRIMARY KEY);
INSERT INTO sensitive_permissions VALUES
  ('restaurant.publish'), ('halal.review'), ('halal.evidence.read'), ('loyalty.adjust'), ('user.manage'), ('import.run'), ('privacy.requests');

CREATE FUNCTION has_permission(p_role admin_role, p_permission text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM role_permissions WHERE role = p_role AND permission = p_permission)
     AND (p_role = 'restaurateur' OR yy_mfa() OR NOT EXISTS (SELECT 1 FROM sensitive_permissions WHERE permission = p_permission))
$$;

CREATE TABLE admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name text NOT NULL,
  role admin_role NOT NULL,
  mfa_enabled boolean NOT NULL DEFAULT false,
  invited_by uuid REFERENCES admin_users (id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  -- Un rôle interne sans MFA ne peut pas être activé.
  CONSTRAINT admin_mfa_required CHECK (role = 'restaurateur' OR activated_at IS NULL OR mfa_enabled)
);

-- ─── Journal d'audit (append-only, chaîné) ──────────────────────────────────
-- Chaque ligne porte l'empreinte de la précédente : une modification hors
-- base serait détectable. Toute tentative d'UPDATE, DELETE ou TRUNCATE échoue.

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_role admin_role,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  reason text,
  before jsonb,
  after jsonb,
  prev_hash text,
  hash text NOT NULL
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id, at DESC);

CREATE FUNCTION audit_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_logs'));
  SELECT hash INTO NEW.prev_hash FROM audit_logs ORDER BY id DESC LIMIT 1;
  NEW.actor_id := coalesce(NEW.actor_id, yy_current_user());
  NEW.actor_role := coalesce(NEW.actor_role, yy_current_role());
  NEW.reason := coalesce(NEW.reason, yy_change_reason());
  NEW.hash := encode(sha256(convert_to(concat_ws('|', NEW.prev_hash, NEW.at, NEW.actor_id, NEW.action, NEW.entity,
    NEW.entity_id, NEW.reason, NEW.before::text, NEW.after::text), 'UTF8')), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER audit_logs_chain BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_chain();

CREATE FUNCTION reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% est en ajout seul : % refusé', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();

CREATE FUNCTION audit(p_action text, p_entity text, p_entity_id text, p_before jsonb DEFAULT NULL, p_after jsonb DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO audit_logs (action, entity, entity_id, before, after, reason) VALUES (p_action, p_entity, p_entity_id, p_before, p_after, p_reason)
$$;

-- ─── Taxonomies (src/domain/taxonomy.ts) ────────────────────────────────────

CREATE TABLE cuisines (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  label text NOT NULL,
  family cuisine_family NOT NULL,
  parent_id text REFERENCES cuisines (id) CHECK (parent_id <> id),
  hue smallint NOT NULL CHECK (hue BETWEEN 0 AND 360),
  icon text NOT NULL,
  synonyms text[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

-- Pas de cycle dans la hiérarchie des cuisines.
CREATE FUNCTION cuisines_no_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE up(id, parent_id) AS (
      SELECT id, parent_id FROM cuisines WHERE id = NEW.parent_id
      UNION ALL SELECT c.id, c.parent_id FROM cuisines c JOIN up ON c.id = up.parent_id
    ) SELECT 1 FROM up WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Cycle dans la hiérarchie des cuisines (%)', NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cuisines_cycle BEFORE INSERT OR UPDATE OF parent_id ON cuisines FOR EACH ROW EXECUTE FUNCTION cuisines_no_cycle();

-- L'identifiant et tous ses descendants : filtrer « asiatique » inclut « japonaise ».
CREATE FUNCTION cuisine_with_descendants(p_ids text[]) RETURNS text[]
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE down(id) AS (
    SELECT id FROM cuisines WHERE id = ANY (p_ids)
    UNION SELECT c.id FROM cuisines c JOIN down ON c.parent_id = down.id
  ) SELECT coalesce(array_agg(id), '{}') FROM down
$$;

CREATE TABLE occasions (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9_-]+$'),
  label text NOT NULL,
  kind occasion_kind NOT NULL,
  synonyms text[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE amenities (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]+$'),
  label text NOT NULL,
  synonyms text[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

-- Traductions de tout libellé (taxonomies, collections, articles). Le français
-- est la langue de référence, stockée dans les tables elles-mêmes.
CREATE TABLE translations (
  entity text NOT NULL,
  entity_id text NOT NULL,
  field text NOT NULL,
  locale text NOT NULL CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity, entity_id, field, locale)
);

-- ─── Organismes de certification ────────────────────────────────────────────

CREATE TABLE certifiers (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  name text NOT NULL,
  short_name text NOT NULL,
  website text,
  active boolean NOT NULL DEFAULT true,
  notes text
);

-- ─── Établissements ─────────────────────────────────────────────────────────
-- Une marque (enseigne) peut avoir plusieurs établissements physiques : chaque
-- établissement a sa fiche, ses coordonnées, ses horaires, sa preuve halal.

CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  normalized_name text GENERATED ALWAYS AS (yy_normalize(name)) STORED,
  brand_id uuid REFERENCES brands (id),
  description text NOT NULL DEFAULT '',
  publication publication_status NOT NULL DEFAULT 'draft',
  operating operating_status NOT NULL DEFAULT 'operating',
  temporarily_closed_until date,
  successor_id uuid REFERENCES restaurants (id),
  location geography(Point, 4326) NOT NULL,
  street text NOT NULL,
  postcode text NOT NULL,
  city text NOT NULL,
  district text NOT NULL,
  neighbourhood text,
  country char(2) NOT NULL DEFAULT 'FR' CHECK (country ~ '^[A-Z]{2}$'),
  timezone text NOT NULL DEFAULT 'Europe/Paris' CHECK (is_valid_timezone(timezone)),
  alcohol alcohol_policy NOT NULL DEFAULT 'unknown',
  price_level smallint CHECK (price_level BETWEEN 1 AND 4),
  price_min numeric(7, 2) CHECK (price_min >= 0),
  price_max numeric(7, 2),
  price_observed_at date,
  hours_verified_at date,
  hours_source hours_source,
  phone text,
  website text,
  instagram text,
  booking_url text,
  editorial_pick boolean NOT NULL DEFAULT false,
  -- Origine de la fiche : base historique, saisie, contribution, commerçant.
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('legacy_import', 'manual', 'contribution', 'merchant')),
  legacy_ref text UNIQUE,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Suppression logique : seulement pour une fiche archivée, donc jamais visible ni « ouverte ».
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT successor_not_self CHECK (successor_id <> id),
  CONSTRAINT price_range CHECK (price_max IS NULL OR price_min IS NULL OR price_min <= price_max),
  CONSTRAINT price_dated CHECK ((price_min IS NULL AND price_max IS NULL) OR price_observed_at IS NOT NULL),
  CONSTRAINT deleted_means_archived CHECK (deleted_at IS NULL OR publication = 'archived'),
  CONSTRAINT published_has_date CHECK (publication <> 'published' OR published_at IS NOT NULL),
  CONSTRAINT hours_verified_has_source CHECK (hours_verified_at IS NULL OR hours_source IS NOT NULL)
);
CREATE INDEX restaurants_location_idx ON restaurants USING gist (location);
CREATE INDEX restaurants_name_trgm_idx ON restaurants USING gin (normalized_name gin_trgm_ops);
CREATE INDEX restaurants_brand_idx ON restaurants (brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX restaurants_discoverable_idx ON restaurants (publication, operating) WHERE deleted_at IS NULL;

COMMENT ON COLUMN restaurants.version IS 'Verrouillage optimiste : UPDATE … WHERE id = $1 AND version = $2 ; 0 ligne = conflit.';
COMMENT ON COLUMN restaurants.location IS 'Point WGS 84 ; distances calculées en géodésique (ST_Distance geography), jamais présentées comme un temps de trajet.';

-- Anciennes adresses web d'une fiche : un lien partagé reste valable.
CREATE TABLE restaurant_slug_history (
  slug text PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES restaurants (id),
  retired_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION restaurants_slug_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM restaurant_slug_history WHERE slug = NEW.slug AND restaurant_id <> NEW.id) THEN
    RAISE EXCEPTION 'Adresse « % » déjà utilisée par une autre fiche', NEW.slug USING ERRCODE = 'unique_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.slug <> OLD.slug THEN
    INSERT INTO restaurant_slug_history (slug, restaurant_id) VALUES (OLD.slug, OLD.id)
    ON CONFLICT (slug) DO NOTHING;
    DELETE FROM restaurant_slug_history WHERE slug = NEW.slug AND restaurant_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER restaurants_slug BEFORE INSERT OR UPDATE OF slug ON restaurants FOR EACH ROW EXECUTE FUNCTION restaurants_slug_guard();

-- Deux établissements d'une même enseigne à moins de 25 m : doublon probable.
CREATE FUNCTION restaurants_brand_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.brand_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM restaurants r
    WHERE r.brand_id = NEW.brand_id AND r.id <> NEW.id AND r.deleted_at IS NULL
      AND r.operating NOT IN ('permanently_closed', 'moved')
      AND ST_DWithin(r.location, NEW.location, 25)
  ) THEN
    RAISE EXCEPTION 'Un établissement de cette enseigne existe déjà à moins de 25 m : doublon probable' USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER restaurants_brand BEFORE INSERT OR UPDATE OF brand_id, location ON restaurants FOR EACH ROW EXECUTE FUNCTION restaurants_brand_guard();

-- Transitions de publication (src/domain/publication.ts).
CREATE TABLE publication_transitions (
  from_status publication_status NOT NULL,
  to_status publication_status NOT NULL,
  permission text NOT NULL,
  reason_required boolean NOT NULL,
  PRIMARY KEY (from_status, to_status)
);
INSERT INTO publication_transitions VALUES
  ('draft', 'in_review', 'restaurant.edit', false),
  ('draft', 'archived', 'restaurant.edit', true),
  ('in_review', 'draft', 'restaurant.edit', true),
  ('in_review', 'published', 'restaurant.publish', false),
  ('in_review', 'archived', 'restaurant.publish', true),
  ('published', 'suspended', 'restaurant.publish', true),
  ('published', 'archived', 'restaurant.publish', true),
  ('suspended', 'published', 'restaurant.publish', true),
  ('suspended', 'archived', 'restaurant.publish', true),
  ('archived', 'draft', 'restaurant.publish', true);

CREATE FUNCTION restaurants_workflow() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rule publication_transitions;
  diff jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.publication NOT IN ('draft', 'in_review') THEN
      RAISE EXCEPTION 'Une fiche naît en brouillon ou en relecture, pas « % »', NEW.publication;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.publication <> OLD.publication THEN
    SELECT * INTO rule FROM publication_transitions WHERE from_status = OLD.publication AND to_status = NEW.publication;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transition impossible : % → %', OLD.publication, NEW.publication;
    END IF;
    IF yy_current_role() IS NOT NULL AND NOT has_permission(yy_current_role(), rule.permission) THEN
      RAISE EXCEPTION 'Droit insuffisant pour % → %', OLD.publication, NEW.publication USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF rule.reason_required AND yy_change_reason() IS NULL THEN
      RAISE EXCEPTION 'Motif obligatoire pour % → %', OLD.publication, NEW.publication;
    END IF;
    IF NEW.publication = 'published' AND NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
    PERFORM audit('publication.' || NEW.publication, 'restaurant', NEW.id::text,
      jsonb_build_object('publication', OLD.publication), jsonb_build_object('publication', NEW.publication));
  END IF;

  IF NEW.operating <> OLD.operating THEN
    PERFORM audit('operating.' || NEW.operating, 'restaurant', NEW.id::text,
      jsonb_build_object('operating', OLD.operating), jsonb_build_object('operating', NEW.operating));
  END IF;

  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER restaurants_workflow BEFORE INSERT OR UPDATE ON restaurants FOR EACH ROW EXECUTE FUNCTION restaurants_workflow();

-- Historique des modifications, champ par champ.
CREATE TABLE change_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES restaurants (id),
  version integer NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  reason text,
  diff jsonb NOT NULL
);
CREATE INDEX change_history_restaurant_idx ON change_history (restaurant_id, version DESC);

CREATE FUNCTION restaurants_history() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  diff jsonb;
BEGIN
  SELECT jsonb_object_agg(n.key, jsonb_build_object('before', o.value, 'after', n.value)) INTO diff
  FROM jsonb_each(to_jsonb(NEW)) n
  JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
  WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('version', 'updated_at', 'normalized_name');
  IF diff IS NOT NULL THEN
    INSERT INTO change_history (restaurant_id, version, changed_by, reason, diff)
    VALUES (NEW.id, NEW.version, yy_current_user(), yy_change_reason(), diff);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER restaurants_history AFTER UPDATE ON restaurants FOR EACH ROW EXECUTE FUNCTION restaurants_history();

CREATE TABLE restaurant_cuisines (
  restaurant_id uuid NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  cuisine_id text NOT NULL REFERENCES cuisines (id),
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (restaurant_id, cuisine_id)
);
CREATE INDEX restaurant_cuisines_cuisine_idx ON restaurant_cuisines (cuisine_id);
CREATE UNIQUE INDEX restaurant_one_primary_cuisine ON restaurant_cuisines (restaurant_id) WHERE is_primary;

-- Envies éditoriales, avec une force : 2 = caractéristique, 1 = convient.
CREATE TABLE restaurant_occasions (
  restaurant_id uuid NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  occasion_id text NOT NULL REFERENCES occasions (id),
  strength smallint NOT NULL CHECK (strength IN (1, 2)),
  source text NOT NULL DEFAULT 'editorial' CHECK (source IN ('editorial', 'merchant_confirmed')),
  PRIMARY KEY (restaurant_id, occasion_id)
);
CREATE INDEX restaurant_occasions_occasion_idx ON restaurant_occasions (occasion_id);

-- Une ligne = un équipement confirmé. Absence de ligne = non confirmé, pas « absent ».
CREATE TABLE restaurant_amenities (
  restaurant_id uuid NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  amenity_id text NOT NULL REFERENCES amenities (id),
  confirmed_at date NOT NULL,
  source hours_source NOT NULL,
  PRIMARY KEY (restaurant_id, amenity_id)
);
CREATE INDEX restaurant_amenities_amenity_idx ON restaurant_amenities (amenity_id);

-- ─── Horaires ───────────────────────────────────────────────────────────────
-- Heure locale de l'établissement. Une fermeture ≤ ouverture traverse minuit
-- (18:00 → 02:00) ; la plage appartient au jour où elle commence. '24:00' est
-- admis comme fermeture à minuit pile.

CREATE TABLE opening_hours (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  opens time NOT NULL CHECK (opens < '24:00'),
  closes time NOT NULL
);
CREATE INDEX opening_hours_restaurant_idx ON opening_hours (restaurant_id, weekday);

-- Exception datée : remplace les plages qui commencent ce jour-là.
CREATE TABLE special_days (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  day date NOT NULL,
  closed boolean NOT NULL,
  label text,
  source hours_source NOT NULL,
  UNIQUE (restaurant_id, day)
);

CREATE TABLE special_day_ranges (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  special_day_id bigint NOT NULL REFERENCES special_days (id) ON DELETE CASCADE,
  opens time NOT NULL CHECK (opens < '24:00'),
  closes time NOT NULL
);

CREATE FUNCTION time_minutes(t time) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT (extract(hour FROM t) * 60 + extract(minute FROM t))::int $$;

CREATE FUNCTION format_minutes(m integer) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lpad((((m % 1440) + 1440) % 1440 / 60)::text, 2, '0') || ':' || lpad((((m % 1440) + 1440) % 1440 % 60)::text, 2, '0')
$$;

-- Plages en minutes relatives au minuit de p_date, de la veille (débordements)
-- jusqu'à p_days_ahead jours plus tard. Miroir de timeline() dans hours.ts.
CREATE FUNCTION hours_timeline(p_restaurant uuid, p_date date, p_days_ahead integer)
RETURNS TABLE (start_min integer, end_min integer)
LANGUAGE sql STABLE AS $$
  WITH days AS (
    SELECT o AS off, p_date + o AS d FROM generate_series(-1, p_days_ahead) o
  ), ranges AS (
    SELECT days.off, time_minutes(r.opens) AS s, time_minutes(r.closes) AS e
    FROM days
    JOIN special_days sd ON sd.restaurant_id = p_restaurant AND sd.day = days.d
    JOIN special_day_ranges r ON r.special_day_id = sd.id
    WHERE NOT sd.closed
    UNION ALL
    SELECT days.off, time_minutes(h.opens), time_minutes(h.closes)
    FROM days
    JOIN opening_hours h ON h.restaurant_id = p_restaurant AND h.weekday = extract(isodow FROM days.d)
    WHERE NOT EXISTS (SELECT 1 FROM special_days sd WHERE sd.restaurant_id = p_restaurant AND sd.day = days.d)
  )
  SELECT s + off * 1440, (CASE WHEN e <= s THEN e + 1440 ELSE e END) + off * 1440
  FROM ranges
  ORDER BY 1
$$;

CREATE FUNCTION hours_confidence(p_restaurant uuid, p_today date) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM opening_hours WHERE restaurant_id = p_restaurant)
     AND NOT EXISTS (SELECT 1 FROM special_days WHERE restaurant_id = p_restaurant) THEN 'none'
    WHEN r.hours_verified_at IS NULL THEN 'stale'
    WHEN p_today - r.hours_verified_at <= cfg_num('hours.stale_after_days', 180) THEN 'confirmed'
    ELSE 'stale'
  END
  FROM restaurants r WHERE r.id = p_restaurant
$$;

-- Ouvert à cette minute locale de cette date ? (>= 1440 vise la nuit suivante)
CREATE FUNCTION is_open_at(p_restaurant uuid, p_date date, p_minutes integer) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM hours_timeline(p_restaurant, p_date, 1) t WHERE p_minutes >= t.start_min AND p_minutes < t.end_min)
$$;

CREATE FUNCTION is_discoverable(p_publication publication_status, p_operating operating_status, p_deleted_at timestamptz) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT p_publication = 'published' AND p_deleted_at IS NULL AND p_operating IN ('operating', 'temporarily_closed')
$$;

CREATE TYPE open_status_t AS (
  state text,               -- open | closed | unknown
  confidence text,          -- confirmed | stale | none
  reason text,              -- permanently_closed | moved | temporarily_closed | not_published | special_day | outside_hours
  closes_at text,
  closing_soon boolean,
  next_opening_offset integer,
  next_opening_time text,
  label text
);

-- Miroir de openStatus() (src/domain/hours.ts), libellés compris.
CREATE FUNCTION open_status(p_restaurant uuid, p_at timestamptz DEFAULT now()) RETURNS open_status_t
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r restaurants;
  res open_status_t;
  local_ts timestamp;
  d date;
  m integer;
  cur record;
  nxt record;
  rng record;
  end_min integer;
  suffix text;
  sd special_days;
  months text[] := ARRAY['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  day_names text[] := ARRAY['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  day_word text;
BEGIN
  SELECT * INTO r FROM restaurants WHERE id = p_restaurant;
  IF NOT FOUND THEN RETURN NULL; END IF;
  local_ts := p_at AT TIME ZONE r.timezone;
  d := local_ts::date;
  m := extract(hour FROM local_ts)::int * 60 + extract(minute FROM local_ts)::int;
  res.confidence := hours_confidence(r.id, d);
  res.state := 'closed';

  IF r.publication <> 'published' OR r.deleted_at IS NOT NULL THEN
    res.reason := 'not_published'; res.label := 'Fiche indisponible'; RETURN res;
  END IF;
  IF r.operating = 'permanently_closed' THEN
    res.reason := 'permanently_closed'; res.label := 'Fermé définitivement'; RETURN res;
  END IF;
  IF r.operating = 'moved' THEN
    res.reason := 'moved'; res.label := 'A déménagé'; RETURN res;
  END IF;
  IF r.operating = 'temporarily_closed' AND (r.temporarily_closed_until IS NULL OR r.temporarily_closed_until >= d) THEN
    res.reason := 'temporarily_closed';
    res.label := 'Fermé temporairement' || CASE WHEN r.temporarily_closed_until IS NULL THEN '' ELSE
      ' jusqu''au ' || CASE WHEN extract(day FROM r.temporarily_closed_until) = 1 THEN '1er' ELSE extract(day FROM r.temporarily_closed_until)::int::text END
      || ' ' || months[extract(month FROM r.temporarily_closed_until)::int] END;
    RETURN res;
  END IF;
  IF res.confidence = 'none' THEN
    res.state := 'unknown'; res.label := 'Horaires non renseignés'; RETURN res;
  END IF;

  suffix := CASE WHEN res.confidence = 'stale' THEN ' · à confirmer' ELSE '' END;
  SELECT * INTO cur FROM hours_timeline(r.id, d, 7) t WHERE m >= t.start_min AND m < t.end_min ORDER BY t.start_min LIMIT 1;
  IF FOUND THEN
    -- Plages contiguës : on annonce la vraie fermeture.
    end_min := cur.end_min;
    FOR rng IN SELECT * FROM hours_timeline(r.id, d, 7) LOOP
      IF rng.start_min <= end_min AND rng.end_min > end_min THEN end_min := rng.end_min; END IF;
    END LOOP;
    res.state := 'open';
    res.closes_at := format_minutes(end_min);
    res.closing_soon := end_min - m <= cfg_num('hours.closing_soon_minutes', 30);
    res.label := CASE WHEN res.closing_soon THEN 'Ferme bientôt' ELSE 'Ouvert' END || ' · jusqu''à ' || res.closes_at || suffix;
    RETURN res;
  END IF;

  SELECT * INTO sd FROM special_days WHERE restaurant_id = r.id AND day = d;
  res.reason := CASE WHEN sd.id IS NOT NULL THEN 'special_day' ELSE 'outside_hours' END;
  SELECT * INTO nxt FROM hours_timeline(r.id, d, 7) t WHERE t.start_min > m ORDER BY t.start_min LIMIT 1;
  IF NOT FOUND THEN
    res.label := 'Fermé' || suffix; RETURN res;
  END IF;
  res.next_opening_offset := floor(nxt.start_min / 1440.0)::int;
  res.next_opening_time := format_minutes(nxt.start_min);
  day_word := CASE res.next_opening_offset WHEN 0 THEN '' WHEN 1 THEN 'demain '
    ELSE day_names[extract(isodow FROM d + res.next_opening_offset)::int] || ' ' END;
  res.label := 'Fermé' || CASE WHEN sd.label IS NOT NULL THEN ' (' || lower(sd.label) || ')' ELSE '' END
    || ' · ouvre ' || day_word || 'à ' || res.next_opening_time || suffix;
  RETURN res;
END $$;

-- ─── Médias ─────────────────────────────────────────────────────────────────
-- Une illustration est un visuel générique, toujours signalé comme tel. Une
-- photo n'est publiée qu'avec des droits établis et après modération.

CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  kind media_kind NOT NULL,
  subject media_subject NOT NULL,
  storage_key text,
  alt text NOT NULL CHECK (length(trim(alt)) > 0),
  credit text,
  license text,
  rights_status rights_status NOT NULL DEFAULT 'pending',
  moderation moderation_status NOT NULL DEFAULT 'pending',
  sort_order int NOT NULL DEFAULT 0,
  width int CHECK (width > 0),
  height int CHECK (height > 0),
  seed int,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT photo_has_file_and_license CHECK (kind <> 'photo' OR (storage_key IS NOT NULL AND license IS NOT NULL)),
  CONSTRAINT illustration_has_seed CHECK (kind <> 'illustration' OR seed IS NOT NULL)
);
CREATE INDEX media_restaurant_idx ON media (restaurant_id, sort_order);

CREATE VIEW public_media AS
SELECT * FROM media
WHERE kind = 'illustration' OR (rights_status = 'cleared' AND moderation = 'approved');

-- ─── Menus ──────────────────────────────────────────────────────────────────
-- Un lien de menu est daté ; un prix n'existe qu'avec sa date et sa source.

CREATE TABLE menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url ~ '^https://'),
  checked_at date NOT NULL,
  source text NOT NULL
);

CREATE TABLE menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  name text NOT NULL,
  price_cents integer CHECK (price_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  observed_at date NOT NULL,
  source text NOT NULL
);

-- ─── Information halal ──────────────────────────────────────────────────────

CREATE TABLE halal_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  kind halal_claim_kind NOT NULL,
  scope halal_scope NOT NULL,
  scope_note text,
  certifier_id text REFERENCES certifiers (id),
  certificate_ref text,
  method evidence_method NOT NULL,
  evidence_date date NOT NULL,
  valid_until date,
  review_status claim_review_status NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES admin_users (id),
  under_review boolean NOT NULL DEFAULT false,
  public_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  -- Renseigné par expire_halal_claims : l'expiration n'est traitée qu'une fois.
  expiry_processed_at timestamptz,
  CONSTRAINT certification_has_certifier CHECK (kind <> 'certification' OR certifier_id IS NOT NULL),
  CONSTRAINT certifier_only_for_certification CHECK (kind = 'certification' OR certifier_id IS NULL),
  CONSTRAINT valid_after_evidence CHECK (valid_until IS NULL OR valid_until >= evidence_date),
  CONSTRAINT reviewed_when_decided CHECK (review_status = 'pending' OR reviewed_at IS NOT NULL)
);
CREATE INDEX halal_claims_restaurant_idx ON halal_claims (restaurant_id) WHERE review_status = 'approved';
CREATE INDEX halal_claims_expiry_idx ON halal_claims (valid_until) WHERE kind = 'certification' AND review_status = 'approved' AND expiry_processed_at IS NULL;

-- Validation réservée aux vérificateurs (MFA), quand le contexte est renseigné.
CREATE FUNCTION halal_claims_review_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.review_status <> 'pending') OR (TG_OP = 'UPDATE' AND NEW.review_status IS DISTINCT FROM OLD.review_status) THEN
    IF yy_current_role() IS NOT NULL AND NOT has_permission(yy_current_role(), 'halal.review') THEN
      RAISE EXCEPTION 'Seul un vérificateur peut valider une information halal' USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM audit('halal_claim.' || NEW.review_status, 'halal_claim', NEW.id::text,
      CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('review_status', OLD.review_status) END,
      jsonb_build_object('review_status', NEW.review_status, 'kind', NEW.kind, 'restaurant_id', NEW.restaurant_id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER halal_claims_review BEFORE INSERT OR UPDATE ON halal_claims FOR EACH ROW EXECUTE FUNCTION halal_claims_review_guard();

-- Pièces justificatives : stockage objet privé (chiffré), jamais d'URL publique.
CREATE TABLE halal_evidence_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES halal_claims (id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/heic')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 20000000),
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  retain_until date
);

CREATE FUNCTION trust_level_of(k halal_claim_kind) RETURNS trust_level
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE k WHEN 'certification' THEN 'certified' WHEN 'team_verification' THEN 'team_verified' ELSE 'declared' END::trust_level
$$;

-- Fin de validité d'une déclaration validée (claimValidUntil dans halal.ts).
CREATE FUNCTION claim_valid_until(c halal_claims) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN c.kind = 'certification' THEN c.valid_until
    ELSE least(c.evidence_date + (CASE WHEN c.kind = 'team_verification'
      THEN cfg_num('halal.team_verification_days', 365) ELSE cfg_num('halal.declaration_days', 365) END)::int,
      coalesce(c.valid_until, 'infinity'::date))
  END
$$;

CREATE FUNCTION claim_is_active(c halal_claims, p_today date) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT c.review_status = 'approved'
     AND c.evidence_date <= p_today
     -- Une certification sans date de fin n'est pas affichable : on ne la suppose pas éternelle.
     AND (c.kind <> 'certification' OR c.valid_until IS NOT NULL)
     AND p_today <= claim_valid_until(c)
$$;

CREATE TYPE halal_status_t AS (
  level trust_level,
  claim_id uuid,
  certifier_id text,
  scope halal_scope,
  scope_note text,
  last_checked_at date,
  valid_until date,
  freshness text,              -- fresh | aging | none
  under_review boolean,
  expired_certification_id uuid
);

-- Miroir de deriveHalalStatus() : le badge n'est jamais saisi, il est dérivé.
CREATE FUNCTION halal_status(p_restaurant uuid, p_today date) RETURNS halal_status_t
LANGUAGE plpgsql STABLE AS $$
DECLARE
  res halal_status_t;
  best halal_claims;
  tz text;
  total int;
BEGIN
  SELECT timezone INTO tz FROM restaurants WHERE id = p_restaurant;
  res.under_review := EXISTS (SELECT 1 FROM halal_claims c WHERE c.restaurant_id = p_restaurant AND c.under_review AND c.review_status = 'approved');
  SELECT c.id INTO res.expired_certification_id FROM halal_claims c
  WHERE c.restaurant_id = p_restaurant AND c.kind = 'certification' AND c.review_status = 'approved' AND c.valid_until < p_today
  ORDER BY c.valid_until DESC LIMIT 1;

  SELECT c.* INTO best FROM halal_claims c
  WHERE c.restaurant_id = p_restaurant AND claim_is_active(c, p_today)
  ORDER BY trust_level_of(c.kind) DESC, c.evidence_date DESC, c.id
  LIMIT 1;

  IF best.id IS NULL THEN
    res.level := 'unconfirmed'; res.freshness := 'none'; RETURN res;
  END IF;

  res.level := trust_level_of(best.kind);
  res.claim_id := best.id;
  res.certifier_id := best.certifier_id;
  res.scope := best.scope;
  res.scope_note := best.scope_note;
  res.valid_until := claim_valid_until(best);
  SELECT max(coalesce((c.reviewed_at AT TIME ZONE coalesce(tz, 'Europe/Paris'))::date, c.evidence_date)) INTO res.last_checked_at
  FROM halal_claims c WHERE c.restaurant_id = p_restaurant AND claim_is_active(c, p_today);
  total := greatest(1, res.valid_until - best.evidence_date);
  res.freshness := CASE WHEN (p_today - best.evidence_date)::numeric / total >= cfg_num('halal.aging_ratio', 0.75) THEN 'aging' ELSE 'fresh' END;
  RETURN res;
END $$;

-- Tâches de vérification : revérification halal, horaires, doublons, droits…
CREATE TABLE review_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind review_task_kind NOT NULL,
  restaurant_id uuid REFERENCES restaurants (id),
  claim_id uuid REFERENCES halal_claims (id),
  contribution_id uuid,
  status task_status NOT NULL DEFAULT 'open',
  priority smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  due_on date,
  assigned_to uuid REFERENCES admin_users (id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX review_tasks_open_idx ON review_tasks (kind, priority, due_on) WHERE status IN ('open', 'in_progress');
CREATE UNIQUE INDEX review_tasks_one_open_per_claim ON review_tasks (claim_id, kind) WHERE status IN ('open', 'in_progress') AND claim_id IS NOT NULL;

-- Traitement quotidien (cas 6) : le badge a déjà changé à la lecture ; on trace
-- l'expiration au journal et on ouvre une revérification. Idempotent.
CREATE FUNCTION expire_halal_claims(p_today date DEFAULT current_date) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  c halal_claims;
  before_level trust_level;
  after_level trust_level;
  n integer := 0;
BEGIN
  FOR c IN
    SELECT * FROM halal_claims
    WHERE kind = 'certification' AND review_status = 'approved' AND valid_until < p_today AND expiry_processed_at IS NULL
    ORDER BY valid_until
    FOR UPDATE
  LOOP
    before_level := (halal_status(c.restaurant_id, c.valid_until)).level;
    after_level := (halal_status(c.restaurant_id, p_today)).level;
    PERFORM audit('halal_claim.expired', 'halal_claim', c.id::text,
      jsonb_build_object('level', before_level, 'valid_until', c.valid_until),
      jsonb_build_object('level', after_level, 'restaurant_id', c.restaurant_id),
      'Certification expirée : badge recalculé automatiquement');
    INSERT INTO review_tasks (kind, restaurant_id, claim_id, priority, due_on, note)
    VALUES ('halal_reverification', c.restaurant_id, c.id, 1, p_today + 14, 'Certification expirée le ' || to_char(c.valid_until, 'DD/MM/YYYY'))
    ON CONFLICT DO NOTHING;
    UPDATE halal_claims SET expiry_processed_at = now() WHERE id = c.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ─── Utilisateurs (minimisation) ────────────────────────────────────────────
-- Ni religion, ni genre, ni date de naissance : rien qui ne serve une
-- fonctionnalité demandée. L'exploration ne demande aucun compte.

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE,
  auth_provider auth_provider NOT NULL,
  display_name text,
  locale text NOT NULL DEFAULT 'fr' CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_on date
);

CREATE TABLE favorites (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, restaurant_id)
);

CREATE TABLE user_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  -- Jeton du lien de partage : aléatoire, révocable.
  share_token text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_collection_items (
  collection_id uuid NOT NULL REFERENCES user_collections (id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants (id),
  position int NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, restaurant_id)
);

-- Préférences saisies explicitement par la personne, jamais déduites.
CREATE TABLE preferences (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  navigation_app text CHECK (navigation_app IN ('apple', 'google', 'waze', 'citymapper', 'ask')),
  theme text CHECK (theme IN ('system', 'light', 'dark')),
  default_halal_min trust_level,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Historique de recherche : seulement avec consentement, effaçable.
CREATE TABLE search_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  query text NOT NULL CHECK (length(query) <= 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  push_token_encrypted bytea,
  app_version text,
  last_seen_on date
);

-- Preuve du consentement : finalité, base légale, version du texte affiché.
CREATE TABLE consents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices (id) ON DELETE CASCADE,
  purpose consent_purpose NOT NULL,
  legal_basis legal_basis NOT NULL,
  granted boolean NOT NULL,
  text_version text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_has_subject CHECK (user_id IS NOT NULL OR device_id IS NOT NULL)
);
CREATE INDEX consents_subject_idx ON consents (user_id, purpose, recorded_at DESC);

-- ─── Contributions et modération ────────────────────────────────────────────

CREATE TABLE contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind contribution_kind NOT NULL,
  restaurant_id uuid REFERENCES restaurants (id),
  payload jsonb NOT NULL DEFAULT '{}',
  halal_source text,
  message text CHECK (length(message) <= 2000),
  status contribution_status NOT NULL DEFAULT 'received',
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contribution_targets_restaurant CHECK (kind = 'new_restaurant' OR restaurant_id IS NOT NULL),
  CONSTRAINT new_restaurant_has_name CHECK (kind <> 'new_restaurant' OR (payload ? 'name' AND payload ? 'address'))
);
CREATE INDEX contributions_queue_idx ON contributions (status, created_at) WHERE status IN ('received', 'in_review', 'needs_info');

CREATE TABLE contribution_transitions (
  from_status contribution_status NOT NULL,
  to_status contribution_status NOT NULL,
  PRIMARY KEY (from_status, to_status)
);
INSERT INTO contribution_transitions VALUES
  ('received', 'in_review'), ('received', 'duplicate'), ('received', 'rejected'),
  ('in_review', 'needs_info'), ('in_review', 'accepted'), ('in_review', 'rejected'), ('in_review', 'duplicate'),
  ('needs_info', 'in_review'), ('needs_info', 'rejected');

CREATE TABLE contribution_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contribution_id uuid NOT NULL REFERENCES contributions (id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  status contribution_status NOT NULL,
  actor_id uuid,
  note text
);

CREATE FUNCTION contributions_workflow() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'received' THEN RAISE EXCEPTION 'Une contribution naît « reçue »'; END IF;
  ELSIF NEW.status <> OLD.status THEN
    IF NOT EXISTS (SELECT 1 FROM contribution_transitions WHERE from_status = OLD.status AND to_status = NEW.status) THEN
      RAISE EXCEPTION 'Contribution : % → % impossible', OLD.status, NEW.status;
    END IF;
    IF NEW.status IN ('rejected', 'needs_info') AND yy_change_reason() IS NULL THEN
      RAISE EXCEPTION 'Motif obligatoire';
    END IF;
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO contribution_events (contribution_id, status, actor_id, note) VALUES (NEW.id, NEW.status, yy_current_user(), yy_change_reason());
  RETURN NEW;
END $$;
CREATE TRIGGER contributions_workflow AFTER INSERT OR UPDATE OF status ON contributions FOR EACH ROW EXECUTE FUNCTION contributions_workflow();

-- Une contribution acceptée devient une proposition appliquée au brouillon,
-- jamais une modification directe de la fiche publiée.
CREATE TABLE change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id uuid REFERENCES contributions (id),
  restaurant_id uuid REFERENCES restaurants (id),
  changes jsonb NOT NULL,
  requires text NOT NULL CHECK (requires IN ('restaurant.edit', 'halal.review')),
  status proposal_status NOT NULL DEFAULT 'pending',
  proposed_by uuid,
  decided_by uuid REFERENCES admin_users (id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE review_tasks ADD CONSTRAINT review_tasks_contribution_fk FOREIGN KEY (contribution_id) REFERENCES contributions (id);

-- ─── Contenus éditoriaux ────────────────────────────────────────────────────
-- Chaque contenu mène à des fiches géolocalisées (« Voir sur la carte ») :
-- un article publié sans adresse liée est refusé.

CREATE TABLE editorial_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind post_kind NOT NULL,
  title text NOT NULL,
  standfirst text,
  body_markdown text NOT NULL DEFAULT '',
  cover_media_id uuid REFERENCES media (id),
  status content_status NOT NULL DEFAULT 'draft',
  -- Contenu de marque : affiché « Contenu sponsorisé par … », jamais confondu avec l'éditorial.
  sponsor_name text,
  author_id uuid REFERENCES admin_users (id),
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE post_restaurants (
  post_id uuid NOT NULL REFERENCES editorial_posts (id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants (id),
  position int NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, restaurant_id)
);

CREATE TABLE editorial_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL,
  intro text NOT NULL DEFAULT '',
  -- Critères explicites, affichés : « calme, réservation possible, budget €€ et plus ».
  criteria text NOT NULL CHECK (length(trim(criteria)) > 0),
  occasion_id text REFERENCES occasions (id),
  status content_status NOT NULL DEFAULT 'draft',
  sort_order int NOT NULL DEFAULT 0,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE collection_restaurants (
  collection_id uuid NOT NULL REFERENCES editorial_collections (id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants (id),
  position int NOT NULL DEFAULT 0,
  note text,
  PRIMARY KEY (collection_id, restaurant_id)
);

CREATE TABLE publication_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL CHECK (entity IN ('editorial_post', 'editorial_collection', 'home_module')),
  entity_id uuid NOT NULL,
  publish_at timestamptz NOT NULL,
  unpublish_at timestamptz,
  done_at timestamptz,
  created_by uuid REFERENCES admin_users (id),
  CONSTRAINT schedule_order CHECK (unpublish_at IS NULL OR unpublish_at > publish_at)
);

CREATE FUNCTION content_links_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' THEN
    IF TG_TABLE_NAME = 'editorial_posts' AND NOT EXISTS (SELECT 1 FROM post_restaurants WHERE post_id = NEW.id) THEN
      RAISE EXCEPTION 'Un contenu publié doit mener à au moins une adresse';
    END IF;
    IF TG_TABLE_NAME = 'editorial_collections' AND NOT EXISTS (SELECT 1 FROM collection_restaurants WHERE collection_id = NEW.id) THEN
      RAISE EXCEPTION 'Une collection publiée doit contenir au moins une adresse';
    END IF;
    NEW.published_at := coalesce(NEW.published_at, now());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER editorial_posts_links BEFORE INSERT OR UPDATE ON editorial_posts FOR EACH ROW EXECUTE FUNCTION content_links_guard();
CREATE TRIGGER editorial_collections_links BEFORE INSERT OR UPDATE ON editorial_collections FOR EACH ROW EXECUTE FUNCTION content_links_guard();

-- ─── Mise en avant commerciale ──────────────────────────────────────────────
-- Table séparée, sans aucune colonne qui touche à l'information halal : payer
-- achète un emplacement étiqueté, jamais un niveau de preuve.

CREATE TABLE sponsored_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants (id),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  label text NOT NULL DEFAULT 'Sponsorisé' CHECK (label = 'Sponsorisé'),
  contract_ref text NOT NULL,
  created_by uuid REFERENCES admin_users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_dates CHECK (ends_on >= starts_on)
);
CREATE INDEX sponsored_active_idx ON sponsored_campaigns (starts_on, ends_on);

-- ─── Fidélité (module à auditer, voir src/domain/loyalty.ts) ────────────────
-- Être référencé n'est pas être partenaire : un partenaire a un contrat.

CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES restaurants (id),
  status partner_status NOT NULL DEFAULT 'prospect',
  contract_ref text,
  starts_on date,
  ends_on date,
  CONSTRAINT active_partner_has_contract CHECK (status <> 'active' OR (contract_ref IS NOT NULL AND starts_on IS NOT NULL))
);

-- Paramètres du programme : aucune valeur n'est supposée acquise (provisional).
CREATE TABLE loyalty_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status program_status NOT NULL DEFAULT 'disabled',
  provisional boolean NOT NULL DEFAULT true,
  earn_mode earn_mode NOT NULL,
  points_per_visit integer CHECK (points_per_visit > 0),
  points_per_euro numeric(6, 2) CHECK (points_per_euro > 0),
  min_amount_cents integer CHECK (min_amount_cents >= 0),
  cooldown_minutes integer NOT NULL CHECK (cooldown_minutes >= 0),
  daily_cap_per_partner integer NOT NULL CHECK (daily_cap_per_partner > 0),
  qr_step_seconds integer NOT NULL DEFAULT 30 CHECK (qr_step_seconds BETWEEN 10 AND 300),
  qr_skew_steps integer NOT NULL DEFAULT 1 CHECK (qr_skew_steps BETWEEN 0 AND 3),
  valid_from date NOT NULL DEFAULT current_date,
  CONSTRAINT earn_params CHECK (
    (earn_mode = 'per_visit' AND points_per_visit IS NOT NULL AND points_per_euro IS NULL)
    OR (earn_mode = 'per_amount' AND points_per_euro IS NOT NULL AND min_amount_cents IS NOT NULL AND points_per_visit IS NULL)
  ),
  -- Un programme « live » a des paramètres validés.
  CONSTRAINT live_not_provisional CHECK (status <> 'live' OR NOT provisional)
);
CREATE UNIQUE INDEX loyalty_one_running_program ON loyalty_programs ((true)) WHERE status <> 'disabled';

CREATE TABLE rewards (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9_-]+$'),
  program_id uuid NOT NULL REFERENCES loyalty_programs (id),
  threshold integer NOT NULL CHECK (threshold > 0),
  label text NOT NULL,
  funded_by reward_funding NOT NULL,
  validity_days integer NOT NULL CHECK (validity_days > 0)
);

CREATE TABLE loyalty_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Rompu à la suppression du compte : les transactions restent, sans lien avec la personne.
  user_id uuid UNIQUE REFERENCES users (id) ON DELETE SET NULL,
  -- Référence du secret de signature dans le coffre (KMS), jamais le secret.
  secret_ref text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

CREATE TABLE loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES loyalty_cards (id),
  partner_id uuid REFERENCES partners (id),
  program_id uuid NOT NULL REFERENCES loyalty_programs (id),
  kind tx_kind NOT NULL,
  points integer NOT NULL,
  amount_cents integer CHECK (amount_cents >= 0),
  at timestamptz NOT NULL DEFAULT now(),
  -- Clé d'idempotence : « earn:<partenaire>:<jeton> ». Un second scan du même jeton échoue ici.
  idempotency_key text NOT NULL UNIQUE,
  merchant_user_id uuid REFERENCES admin_users (id),
  reverses_id uuid REFERENCES loyalty_transactions (id),
  reason text,
  CONSTRAINT points_sign CHECK (
    (kind = 'earn' AND points > 0) OR (kind = 'redeem' AND points < 0) OR (kind = 'adjustment' AND points <> 0) OR kind = 'reversal'
  ),
  CONSTRAINT earn_has_partner CHECK (kind <> 'earn' OR partner_id IS NOT NULL),
  CONSTRAINT reversal_target CHECK ((kind = 'reversal') = (reverses_id IS NOT NULL)),
  CONSTRAINT adjustment_reason CHECK (kind NOT IN ('adjustment', 'reversal') OR reason IS NOT NULL)
);
-- Une transaction ne s'annule qu'une fois.
CREATE UNIQUE INDEX loyalty_single_reversal ON loyalty_transactions (reverses_id) WHERE kind = 'reversal';
CREATE INDEX loyalty_tx_card_idx ON loyalty_transactions (card_id, at DESC);
CREATE INDEX loyalty_tx_partner_idx ON loyalty_transactions (partner_id, at DESC);

CREATE FUNCTION loyalty_reversal_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  o loyalty_transactions;
BEGIN
  IF NEW.kind = 'reversal' THEN
    SELECT * INTO o FROM loyalty_transactions WHERE id = NEW.reverses_id;
    IF o.kind = 'reversal' THEN RAISE EXCEPTION 'On n''annule pas une annulation'; END IF;
    IF NEW.points <> -o.points OR NEW.card_id <> o.card_id THEN
      RAISE EXCEPTION 'Une annulation reprend exactement la transaction d''origine';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loyalty_reversal BEFORE INSERT ON loyalty_transactions FOR EACH ROW EXECUTE FUNCTION loyalty_reversal_guard();
CREATE TRIGGER loyalty_append_only BEFORE UPDATE OR DELETE ON loyalty_transactions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER loyalty_no_truncate BEFORE TRUNCATE ON loyalty_transactions FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();

-- Tentatives de scan, y compris refusées : base de la détection de fraude.
CREATE TABLE loyalty_scan_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES partners (id),
  card_id uuid REFERENCES loyalty_cards (id),
  token_hash char(64) NOT NULL,
  outcome scan_outcome NOT NULL,
  reason text,
  merchant_user_id uuid REFERENCES admin_users (id),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scan_attempts_card_idx ON loyalty_scan_attempts (card_id, at DESC);

CREATE VIEW loyalty_balances AS
SELECT card_id, sum(points)::int AS points FROM loyalty_transactions GROUP BY card_id;

-- Suspicions : refus répétés pour une même carte, ou un même commerçant, sur 24 h.
CREATE VIEW loyalty_suspicions AS
SELECT card_id, partner_id, count(*) AS refusals, max(at) AS last_at
FROM loyalty_scan_attempts
WHERE outcome = 'rejected' AND at > now() - interval '24 hours'
GROUP BY card_id, partner_id
HAVING count(*) >= 3;

CREATE TABLE vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES loyalty_cards (id),
  reward_id text NOT NULL REFERENCES rewards (id),
  redeem_tx_id uuid NOT NULL UNIQUE REFERENCES loyalty_transactions (id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_partner_id uuid REFERENCES partners (id),
  CONSTRAINT voucher_dates CHECK (expires_at > issued_at AND (used_at IS NULL OR used_at BETWEEN issued_at AND expires_at))
);

-- Rattachement d'un compte restaurateur à un établissement, après preuve de représentation.
CREATE TABLE merchant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users (id),
  restaurant_id uuid NOT NULL REFERENCES restaurants (id),
  partner_id uuid REFERENCES partners (id),
  status membership_status NOT NULL DEFAULT 'pending',
  proof_ref text NOT NULL,
  verified_by uuid REFERENCES admin_users (id),
  verified_at timestamptz,
  UNIQUE (admin_user_id, restaurant_id),
  CONSTRAINT active_membership_verified CHECK (status <> 'active' OR verified_at IS NOT NULL)
);

CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES loyalty_transactions (id),
  opened_by text NOT NULL CHECK (opened_by IN ('customer', 'partner', 'yallayum')),
  status dispute_status NOT NULL DEFAULT 'open',
  description text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  resolution text,
  CONSTRAINT dispute_closed CHECK ((status = 'open') = (closed_at IS NULL))
);

-- ─── Mesure d'audience (src/domain/analytics.ts) ────────────────────────────
-- Événements définis et versionnés ; propriétés hors dictionnaire refusées ;
-- jamais de coordonnées, d'e-mail ni de téléphone.

CREATE TABLE analytics_event_specs (
  name text NOT NULL,
  version integer NOT NULL,
  regime consent_regime NOT NULL,
  definition text NOT NULL,
  props text[] NOT NULL,
  PRIMARY KEY (name, version)
);

CREATE TABLE analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  version integer NOT NULL,
  regime consent_regime NOT NULL,
  props jsonb NOT NULL DEFAULT '{}',
  -- Tronqué à la minute ; identifiant de session éphémère, jamais d'identifiant publicitaire.
  at timestamptz NOT NULL CHECK (at = date_trunc('minute', at)),
  session_id uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (name, version) REFERENCES analytics_event_specs (name, version),
  CONSTRAINT no_personal_props CHECK (NOT (props ?| ARRAY['lat', 'lng', 'latitude', 'longitude', 'email', 'phone', 'user_id', 'ip']))
);
CREATE INDEX analytics_events_name_at_idx ON analytics_events (name, at);

CREATE FUNCTION analytics_props_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  allowed text[];
  spec_regime consent_regime;
BEGIN
  SELECT props, regime INTO allowed, spec_regime FROM analytics_event_specs WHERE name = NEW.name AND version = NEW.version;
  IF NEW.regime <> spec_regime THEN RAISE EXCEPTION 'Régime incohérent pour %', NEW.name; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(NEW.props) k WHERE k <> ALL (allowed)) THEN
    RAISE EXCEPTION 'Propriété hors dictionnaire pour %', NEW.name;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER analytics_props BEFORE INSERT ON analytics_events FOR EACH ROW EXECUTE FUNCTION analytics_props_guard();

INSERT INTO analytics_event_specs (name, version, regime, definition, props) VALUES
  ('app_open', 1, 'audience', 'Ouverture ou retour au premier plan de l''application.', '{cold_start}'),
  ('location_permission_result', 1, 'audience', 'Réponse à la demande de position (système ou choix de ville).', '{result}'),
  ('search_submitted', 1, 'audience', 'Recherche validée. La requête n''est gardée que si zéro résultat.', '{results,zero_query,understood_place,understood_cuisine,understood_occasion}'),
  ('filter_applied', 1, 'audience', 'Filtre ajouté ou retiré.', '{filter,action,results}'),
  ('map_area_searched', 1, 'audience', 'Bouton « Rechercher dans cette zone ».', '{results}'),
  ('restaurant_impression', 1, 'analytics', 'Carte de résultat visible au moins une seconde à 50 % (échantillonné).', '{restaurant_id,position,sponsored,source}'),
  ('restaurant_opened', 1, 'audience', 'Fiche détaillée ouverte.', '{restaurant_id,source,sponsored,distance}'),
  ('halal_info_expanded', 1, 'audience', 'Détail de l''information halal déplié.', '{restaurant_id,level}'),
  ('route_clicked', 1, 'audience', 'Intention de visite : application de navigation ouverte. Ne prouve pas la visite.', '{restaurant_id,app,distance}'),
  ('phone_clicked', 1, 'audience', 'Intention de visite : appel.', '{restaurant_id}'),
  ('booking_clicked', 1, 'audience', 'Intention de visite : réservation externe.', '{restaurant_id}'),
  ('share_clicked', 1, 'audience', 'Intention de visite : partage.', '{restaurant_id,target}'),
  ('favorite_added', 1, 'audience', 'Adresse enregistrée.', '{restaurant_id,signed_in}'),
  ('report_submitted', 1, 'audience', 'Contribution envoyée.', '{kind}'),
  ('loyalty_card_opened', 1, 'audience', 'Écran « Ma carte » affiché.', '{activated}'),
  ('loyalty_transaction_result', 1, 'audience', 'Résultat d''un passage en caisse.', '{status}');

-- Rétention : suppression par régime, et effacement anticipé du texte des recherches.
CREATE FUNCTION purge_analytics(p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM analytics_events
  WHERE (regime = 'audience' AND at < p_now - make_interval(days => cfg_num('analytics.retention_days.audience', 760)::int))
     OR (regime = 'analytics' AND at < p_now - make_interval(days => cfg_num('analytics.retention_days.analytics', 395)::int));
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE analytics_events SET props = props - 'zero_query'
  WHERE props ? 'zero_query' AND at < p_now - make_interval(days => cfg_num('analytics.zero_query_days', 90)::int);
  RETURN n;
END $$;

-- ─── Découverte : vues et recherche ─────────────────────────────────────────

CREATE VIEW discoverable_restaurants AS
SELECT * FROM restaurants WHERE is_discoverable(publication, operating, deleted_at);

-- Lien profond : https://yallayum.app/r/<slug> (src/domain/deeplink.ts).
CREATE FUNCTION resolve_slug(p_slug text)
RETURNS TABLE (restaurant_id uuid, resolution text, successor_id uuid)
LANGUAGE sql STABLE AS $$
  WITH hit AS (
    SELECT r.*, false AS renamed FROM restaurants r WHERE r.slug = p_slug
    UNION ALL
    SELECT r.*, true FROM restaurant_slug_history h JOIN restaurants r ON r.id = h.restaurant_id
    WHERE h.slug = p_slug AND NOT EXISTS (SELECT 1 FROM restaurants x WHERE x.slug = p_slug)
  )
  SELECT h.id,
    CASE
      WHEN h.publication <> 'published' OR h.deleted_at IS NOT NULL THEN 'unavailable'
      WHEN h.operating = 'moved' AND s.id IS NOT NULL AND is_discoverable(s.publication, s.operating, s.deleted_at) THEN 'moved'
      WHEN h.operating IN ('permanently_closed', 'moved') THEN 'permanently_closed'
      WHEN h.operating = 'temporarily_closed' THEN 'temporarily_closed'
      WHEN h.renamed THEN 'renamed'
      ELSE 'restaurant'
    END,
    CASE WHEN h.operating = 'moved' THEN s.id END
  FROM hit h LEFT JOIN restaurants s ON s.id = h.successor_id
$$;

-- Recherche par zone avec filtres stricts (src/domain/filters.ts). Le score
-- de pertinence est calculé par l'API (src/domain/ranking.ts) ; la base
-- garantit la zone, les filtres, la distance géodésique et la pagination par
-- curseur (distance, id). Avec un filtre d'ouverture, les adresses aux
-- horaires inconnus ou anciens sortent marquées hours_uncertain, jamais
-- comme « ouvertes ».
CREATE FUNCTION search_restaurants(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_origin_lat double precision DEFAULT NULL,
  p_origin_lng double precision DEFAULT NULL,
  p_at timestamptz DEFAULT now(),
  p_cuisines text[] DEFAULT NULL,
  p_occasions text[] DEFAULT NULL,
  p_price_max smallint DEFAULT NULL,
  p_open_now boolean DEFAULT false,
  p_open_at time DEFAULT NULL,
  p_halal_min trust_level DEFAULT NULL,
  p_certifiers text[] DEFAULT NULL,
  p_amenities text[] DEFAULT NULL,
  p_alcohol_free boolean DEFAULT false,
  p_radius_m integer DEFAULT NULL,
  p_after_distance double precision DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  distance_m double precision,
  halal_level trust_level,
  open_state text,
  open_confidence text,
  hours_uncertain boolean
)
LANGUAGE sql STABLE AS $$
  WITH params AS (
    SELECT ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)::geography AS area,
      coalesce(ST_SetSRID(ST_MakePoint(p_origin_lng, p_origin_lat), 4326)::geography,
               ST_Centroid(ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326))::geography) AS origin,
      cuisine_with_descendants(p_cuisines) AS cuisines,
      CASE WHEN p_open_at IS NULL THEN NULL
           WHEN time_minutes(p_open_at) < 360 THEN time_minutes(p_open_at) + 1440
           ELSE time_minutes(p_open_at) END AS open_at_min
  ), candidates AS (
    SELECT r.*, ST_Distance(r.location, p.origin) AS dist, p.open_at_min, p.cuisines AS wanted
    FROM restaurants r, params p
    WHERE is_discoverable(r.publication, r.operating, r.deleted_at)
      AND ST_Intersects(r.location, p.area)
      AND (p_radius_m IS NULL OR ST_DWithin(r.location, p.origin, p_radius_m))
      AND (p_cuisines IS NULL OR EXISTS (SELECT 1 FROM restaurant_cuisines rc WHERE rc.restaurant_id = r.id AND rc.cuisine_id = ANY (p.cuisines)))
      AND (p_occasions IS NULL OR EXISTS (SELECT 1 FROM restaurant_occasions ro WHERE ro.restaurant_id = r.id AND ro.occasion_id = ANY (p_occasions)))
      -- Prix inconnu : écarté, faute de pouvoir tenir la promesse du budget.
      AND (p_price_max IS NULL OR (r.price_level IS NOT NULL AND r.price_level <= p_price_max))
      AND (p_amenities IS NULL OR (SELECT count(*) FROM restaurant_amenities ra WHERE ra.restaurant_id = r.id AND ra.amenity_id = ANY (p_amenities)) = cardinality(p_amenities))
      AND (NOT p_alcohol_free OR r.alcohol = 'not_served')
  ), enriched AS (
    SELECT c.*, h AS hs, o AS os,
      (c.timezone IS NOT NULL) AS _
    FROM candidates c
    CROSS JOIN LATERAL halal_status(c.id, (p_at AT TIME ZONE c.timezone)::date) h
    CROSS JOIN LATERAL open_status(c.id, p_at) o
  ), filtered AS (
    SELECT e.*,
      ((p_open_now AND (e.os).state <> 'closed' AND ((e.os).state = 'unknown' OR (e.os).confidence <> 'confirmed'))
        OR (e.open_at_min IS NOT NULL AND hours_confidence(e.id, (p_at AT TIME ZONE e.timezone)::date) <> 'confirmed')) AS uncertain
    FROM enriched e
    WHERE (p_halal_min IS NULL OR (e.hs).level >= p_halal_min)
      AND (p_certifiers IS NULL OR ((e.hs).level = 'certified' AND (e.hs).certifier_id = ANY (p_certifiers)))
      AND (NOT p_open_now OR (e.os).state <> 'closed')
      AND (e.open_at_min IS NULL OR (e.publication = 'published' AND e.operating = 'operating' AND (
        hours_confidence(e.id, (p_at AT TIME ZONE e.timezone)::date) = 'none'
        OR is_open_at(e.id, (p_at AT TIME ZONE e.timezone)::date, e.open_at_min))))
  )
  SELECT f.id, f.slug, f.name, f.dist, (f.hs).level, (f.os).state, (f.os).confidence, f.uncertain
  FROM filtered f
  WHERE p_after_distance IS NULL OR (f.dist, f.id) > (p_after_distance, p_after_id)
  ORDER BY f.dist, f.id
  LIMIT least(greatest(p_limit, 1), 100)
$$;

-- Regroupement par grille pour la carte dézoomée : ~64 px par cellule.
CREATE FUNCTION cluster_restaurants(p_west double precision, p_south double precision, p_east double precision, p_north double precision, p_zoom integer)
RETURNS TABLE (lat double precision, lng double precision, count bigint, restaurant_id uuid)
LANGUAGE sql STABLE AS $$
  WITH pts AS (
    SELECT r.id, r.location::geometry AS g
    FROM restaurants r
    WHERE is_discoverable(r.publication, r.operating, r.deleted_at)
      AND ST_Intersects(r.location, ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)::geography)
  ), cells AS (
    SELECT ST_SnapToGrid(g, 360.0 / power(2, greatest(0, least(p_zoom, 20))) / 4) AS cell, id, g FROM pts
  )
  SELECT ST_Y(ST_Centroid(ST_Collect(g))), ST_X(ST_Centroid(ST_Collect(g))), count(*),
    CASE WHEN count(*) = 1 THEN (array_agg(id))[1] END
  FROM cells GROUP BY cell
$$;

-- Doublons probables pour le back-office : moins de 50 m et noms proches, ou même téléphone.
CREATE VIEW duplicate_candidates AS
SELECT a.id AS restaurant_a, b.id AS restaurant_b,
  ST_Distance(a.location, b.location) AS distance_m,
  similarity(a.normalized_name, b.normalized_name) AS name_similarity,
  (a.phone IS NOT NULL AND a.phone = b.phone) AS same_phone
FROM restaurants a
JOIN restaurants b ON a.id < b.id AND ST_DWithin(a.location, b.location, 50)
WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
  AND (similarity(a.normalized_name, b.normalized_name) > 0.5 OR (a.phone IS NOT NULL AND a.phone = b.phone));

-- Couverture et qualité pour le tableau de bord.
CREATE VIEW catalog_health AS
SELECT
  count(*) FILTER (WHERE is_discoverable(publication, operating, deleted_at)) AS discoverable,
  count(*) FILTER (WHERE publication IN ('draft', 'in_review')) AS pending,
  count(*) FILTER (WHERE publication = 'suspended') AS suspended,
  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM media m WHERE m.restaurant_id = r.id AND m.kind = 'photo')) AS without_photo,
  count(*) FILTER (WHERE hours_verified_at IS NULL OR current_date - hours_verified_at > cfg_num('hours.stale_after_days', 180)) AS hours_to_check,
  count(*) FILTER (WHERE (halal_status(r.id, current_date)).level = 'unconfirmed') AS halal_unconfirmed
FROM restaurants r WHERE deleted_at IS NULL;

-- ─── Vie privée ─────────────────────────────────────────────────────────────
-- Suppression de compte (src/domain/privacy.ts) : efface, anonymise, conserve
-- ce que la loi impose — les transactions de fidélité restent, détachées.

CREATE FUNCTION delete_account(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  summary jsonb;
BEGIN
  SELECT jsonb_build_object(
    'favorites', (SELECT count(*) FROM favorites WHERE user_id = p_user),
    'collections', (SELECT count(*) FROM user_collections WHERE user_id = p_user),
    'search_history', (SELECT count(*) FROM search_history WHERE user_id = p_user),
    'contributions_anonymized', (SELECT count(*) FROM contributions WHERE user_id = p_user),
    'loyalty_transactions_retained', (SELECT count(*) FROM loyalty_transactions t JOIN loyalty_cards c ON c.id = t.card_id WHERE c.user_id = p_user)
  ) INTO summary;
  UPDATE loyalty_cards SET active = false, disabled_at = now(), user_id = NULL WHERE user_id = p_user;
  UPDATE contributions SET user_id = NULL WHERE user_id = p_user;
  DELETE FROM users WHERE id = p_user;  -- favoris, collections, préférences, historique, appareils, consentements : en cascade
  PERFORM audit('privacy.account_deleted', 'user', p_user::text, NULL, summary);
  RETURN summary;
END $$;

-- ─── Sécurité au niveau des lignes ──────────────────────────────────────────
-- Un restaurateur ne lit que ses établissements et ses transactions (cas 13).

CREATE FUNCTION yy_my_restaurants() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(restaurant_id), '{}') FROM merchant_memberships
  WHERE admin_user_id = yy_current_user() AND status = 'active'
$$;

CREATE FUNCTION yy_my_partners() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(partner_id), '{}') FROM merchant_memberships
  WHERE admin_user_id = yy_current_user() AND status = 'active' AND partner_id IS NOT NULL
$$;

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
CREATE POLICY restaurants_public ON restaurants FOR SELECT TO yy_api
  USING (publication = 'published' AND deleted_at IS NULL);
CREATE POLICY restaurants_staff ON restaurants FOR ALL TO yy_backoffice
  USING (yy_current_role() IS NOT NULL AND yy_current_role() <> 'restaurateur')
  WITH CHECK (yy_current_role() IS NOT NULL AND yy_current_role() <> 'restaurateur');
CREATE POLICY restaurants_owner ON restaurants FOR SELECT TO yy_backoffice
  USING (yy_current_role() = 'restaurateur' AND id = ANY (yy_my_restaurants()));

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY loyalty_staff ON loyalty_transactions FOR SELECT TO yy_backoffice
  USING (yy_current_role() <> 'restaurateur' AND has_permission(yy_current_role(), 'loyalty.read'));
CREATE POLICY loyalty_owner ON loyalty_transactions FOR SELECT TO yy_backoffice
  USING (yy_current_role() = 'restaurateur' AND partner_id = ANY (yy_my_partners()));
CREATE POLICY loyalty_insert ON loyalty_transactions FOR INSERT TO yy_backoffice
  WITH CHECK (yy_current_role() = 'restaurateur' AND kind = 'earn' AND partner_id = ANY (yy_my_partners())
              OR has_permission(yy_current_role(), 'loyalty.adjust'));
CREATE POLICY loyalty_cardholder ON loyalty_transactions FOR SELECT TO yy_api
  USING (card_id IN (SELECT id FROM loyalty_cards WHERE user_id = yy_current_user()));

ALTER TABLE merchant_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY memberships_staff ON merchant_memberships FOR ALL TO yy_backoffice
  USING (yy_current_role() IN ('super_admin', 'editor', 'support'));
CREATE POLICY memberships_self ON merchant_memberships FOR SELECT TO yy_backoffice
  USING (admin_user_id = yy_current_user());

ALTER TABLE halal_evidence_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidence_readers ON halal_evidence_documents FOR ALL TO yy_backoffice
  USING (has_permission(yy_current_role(), 'halal.evidence.read'));

ALTER TABLE change_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY proposals_staff ON change_proposals FOR ALL TO yy_backoffice
  USING (yy_current_role() <> 'restaurateur');
CREATE POLICY proposals_owner ON change_proposals FOR ALL TO yy_backoffice
  USING (yy_current_role() = 'restaurateur' AND restaurant_id = ANY (yy_my_restaurants()))
  WITH CHECK (yy_current_role() = 'restaurateur' AND restaurant_id = ANY (yy_my_restaurants()) AND status = 'pending');

-- Droits de base ; les politiques ci-dessus restreignent les lignes.
GRANT USAGE ON SCHEMA public TO yy_api, yy_backoffice;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO yy_backoffice;
GRANT INSERT, UPDATE ON restaurants, halal_claims, opening_hours, special_days, special_day_ranges, media, menus, menu_items,
  restaurant_cuisines, restaurant_occasions, restaurant_amenities, contributions, change_proposals, review_tasks,
  editorial_posts, editorial_collections, collection_restaurants, post_restaurants, publication_schedule,
  sponsored_campaigns, partners, merchant_memberships, disputes, halal_evidence_documents TO yy_backoffice;
GRANT INSERT ON audit_logs, change_history, contribution_events, loyalty_transactions, loyalty_scan_attempts, restaurant_slug_history TO yy_backoffice;
GRANT SELECT ON restaurants, discoverable_restaurants, public_media, cuisines, occasions, amenities, translations, certifiers,
  opening_hours, special_days, special_day_ranges, restaurant_cuisines, restaurant_occasions, restaurant_amenities,
  halal_claims, menus, menu_items, editorial_posts, post_restaurants, editorial_collections, collection_restaurants,
  sponsored_campaigns, restaurant_slug_history, loyalty_transactions, loyalty_cards, app_config TO yy_api;
GRANT INSERT ON contributions, analytics_events TO yy_api;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO yy_api, yy_backoffice;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO yy_api, yy_backoffice;

COMMIT;
