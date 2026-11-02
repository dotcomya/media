# Reprise des 1 000+ fiches historiques

La base actuelle a été constituée à la main : c'est l'actif principal de
YallaYum. La reprise doit le préserver sans lui prêter plus de certitude qu'il
n'en a. Règle directrice : **on importe tout, on ne publie rien qu'on ne
puisse expliquer**.

## 1. Format d'entrée

Un CSV UTF-8, séparateur `;` (export Excel français), une ligne par
établissement physique. Une enseigne à plusieurs adresses = plusieurs lignes
avec la même valeur `enseigne`.

| Colonne | Obligatoire | Format | Devient |
|---|---|---|---|
| `ref_historique` | oui | texte unique | `restaurants.legacy_ref` (clé de rejeu) |
| `nom` | oui | texte | `name` |
| `enseigne` | non | texte | `brands.name` + `brand_id` |
| `adresse` | oui | « 4 rue X » | `street` (après géocodage) |
| `code_postal` | oui | 5 chiffres | `postcode` |
| `ville` | oui | texte | `city`, `district` |
| `latitude`, `longitude` | non | décimal WGS 84 | contrôle croisé du géocodage |
| `telephone` | non | E.164 ou national | `phone` (normalisé +33…) |
| `site`, `instagram` | non | URL / @compte | `website`, `instagram` |
| `cuisines` | oui | ids séparés par `\|` | `restaurant_cuisines` (taxonomie actuelle, table de correspondance ci-dessous) |
| `ambiances` | non | ids séparés par `\|` | `restaurant_occasions` (force 1 par défaut) |
| `prix` | non | `€` à `€€€€` | `price_level` |
| `description` | non | texte | `description` (relue avant publication) |
| `horaires` | non | `lun 12:00-14:30,19:00-23:00; …` | `opening_hours`, source `legacy_import`, **non vérifiés** |
| `mention_halal` | non | texte libre de l'ancienne fiche | voir § 4 |
| `date_mention_halal` | non | JJ/MM/AAAA | `evidence_date` |
| `photos` | non | chemins séparés par `\|` | `media` en attente de droits |

Correspondance des anciennes catégories (capture App Store) : « Petit budget » →
`prix = €` ; « Gastro & raffiné » → cuisine `gastronomique` ; « StreetFood &
casual » → envie `street` ; « Middle East & Maghreb » → à trancher fiche par
fiche entre `maghrebine` et `moyen-orient` (le parent seul en attendant) ;
« Indo / Pakistanais » → `sous-continent` ; « Kid Friendly » → envie `famille`
(l'équipement `chaise_bebe` n'est **pas** déduit) ; « Les coups de ❤️ » →
`editorial_pick = true`.

## 2. Géocodage

1. Adresse envoyée à la Base Adresse Nationale (`api-adresse.data.gouv.fr/search`,
   gratuite, licence ouverte), avec `postcode` pour lever les homonymies.
2. Score BAN ≥ 0,85 et `type = housenumber` : accepté.
   0,60–0,85 ou type `street` : **à revoir** (aperçu carte dans le rapport).
   < 0,60 : rejeté, saisie manuelle.
3. Si l'ancienne base fournit des coordonnées : écart > 75 m avec la BAN → à revoir.
4. Contrôles de cohérence : point dans la commune annoncée (contour IGN Admin
   Express), pas dans un plan d'eau ni une emprise ferroviaire (couches
   OpenStreetMap), pas sur le point par défaut d'une ville (centroïde = signe
   d'un géocodage raté).

Le géocodage ne s'appuie jamais sur la collecte automatisée de sites tiers :
seules l'adresse saisie par l'équipe et la BAN font foi.

## 3. Déduplication

Candidat doublon si **distance < 50 m** et (similarité trigramme du nom
normalisé > 0,5 **ou** même téléphone). La vue `duplicate_candidates` applique
la même règle après import. Une même enseigne à moins de 25 m est refusée par
la base (trigger `restaurants_brand_guard`). Les doublons ne sont jamais
fusionnés automatiquement : le rapport propose une fiche maîtresse, l'équipe
décide ; l'ancienne `ref_historique` reste rattachée pour le rejeu.

## 4. Information halal : aucune promotion implicite

| Ancienne mention | Reprise |
|---|---|
| « Certifié halal par le restaurateur JJ/MM/AAAA » | `establishment_declaration`, `method = legacy_import`, `evidence_date = JJ/MM/AAAA`, approuvée par un vérificateur → affichée « Déclaré par le restaurant » tant que la déclaration a moins d'un an |
| Organisme cité **avec** certificat archivé | `certification` en `pending` ; publiée seulement après contrôle du certificat (organisme, périmètre, date de fin) |
| Organisme cité **sans** certificat | `pending` ; rien d'affiché tant que le certificat n'est pas contrôlé |
| Rien, ou source inconnue | **aucune** déclaration → « Info halal à confirmer » |

Jamais de `certification` créée à partir d'une mention du restaurateur, ni de
certification sans date de fin (la fonction `halal_status` l'ignorerait de
toute façon). Le texte de l'ancienne mention est conservé dans
`change_history` pour l'audit.

## 5. Horaires, médias, descriptions

- **Horaires** : importés avec `hours_source = legacy_import` et
  `hours_verified_at = NULL`. L'application les affiche « à confirmer » et le
  filtre « Ouvert maintenant » les range dans le groupe « horaires non
  confirmés », jamais dans les résultats sûrs.
- **Photos** : `rights_status = pending`. Invisibles (`public_media`) tant que
  l'origine n'est pas établie (photo de l'équipe, cession écrite du
  restaurant, licence). À défaut, la fiche affiche une illustration générique
  signalée comme telle.
- **Descriptions** : reprises en brouillon ; relecture humaine pour retirer
  les superlatifs invérifiables (« le meilleur de Paris »).

## 6. Déroulé

1. **Essai à blanc** (`POST /admin/v1/imports?dry_run=true`) : aucune écriture,
   rapport par ligne — géocodage (score, écart), doublons, cuisines inconnues,
   horaires illisibles, mention halal reprise.
2. **Correction** du CSV et des correspondances jusqu'à un rapport sans erreur
   bloquante.
3. **Import en brouillon** : toutes les fiches en `draft`, `source =
   legacy_import`, un lot = un identifiant d'import tracé au journal.
4. **Relecture** par un éditeur (fiche, carte, description) puis passage
   `in_review` → `published` **par lots de 50 à 100**, ville par ville.
5. **Campagne de revérification** : file `review_tasks` triée par
   `trafic estimé × ancienneté de la preuve` (Paris intra-muros et proche
   couronne d'abord, puis les adresses les plus consultées), objectif : chaque
   fiche publiée passe « déclaré » ou mieux en moins de 6 mois.
6. **Rejeu** : l'import est idempotent sur `ref_historique` (mise à jour d'un
   brouillon existant, jamais d'une fiche publiée sans relecture).

## 7. Retour arrière

- Avant publication : suppression des brouillons du lot (`DELETE … WHERE
  source = 'legacy_import' AND publication = 'draft' AND legacy_ref IN (…)`).
- Après publication : passage `archived` avec motif « Retrait du lot n »,
  jamais de suppression physique ; les liens profonds répondent
  « indisponible ». Le journal d'audit garde la trace du lot et de son retrait.
- Sauvegarde complète (PITR) prise juste avant chaque étape 3 et 4.
