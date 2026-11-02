# 09 — Mesure et indicateurs

Ce document définit ce que YallaYum mesure, comment, et ce qu'il refuse de mesurer : la North Star et ses indicateurs, le plan de marquage complet (repris de `src/domain/analytics.ts` et de la table `analytics_event_specs` de `db/schema.sql`), les tableaux de bord avec des requêtes SQL d'exemple, la rétention, le protocole d'évaluation de la nouvelle direction artistique et les outils possibles. Tout ce qui touche au consentement et aux durées est à valider par un DPO.

---

## 1. Principes

1. **Peu d'événements, définis et versionnés.** Chaque événement a une définition métier, une liste fermée de propriétés et une version. Une propriété inconnue est retirée sur l'appareil (`buildEvent()`) et refusée en base (déclencheur `analytics_props_guard`).
2. **Aucune donnée personnelle.** Ni coordonnées, ni e-mail, ni téléphone, ni identifiant d'utilisateur, ni adresse IP dans les propriétés (contrainte `no_personal_props`). Les distances partent en tranches (`distanceBucket()` : `<500m`, `500m-1km`, `1-3km`, `3-10km`, `>10km`, `inconnue`). L'horodatage est tronqué à la minute (contrainte `at = date_trunc('minute', at)`).
3. **Pas de texte libre brut.** La requête n'est gardée que si la recherche ne donne aucun résultat, nettoyée (`scrubQuery()` : e-mails et numéros remplacés, 60 caractères au plus), et effacée après 90 jours.
4. **Deux régimes.**
   - `audience` : mesure strictement nécessaire, configurée dans le cadre d'exemption de consentement de la CNIL (finalité limitée, pas de recoupement, pas d'identifiant publicitaire, conservation bornée). À valider par le DPO.
   - `analytics` : sur consentement explicite, désactivé par défaut (réglage « Mesure d'audience détaillée » dans Profil → Confidentialité).
5. **Aucun SDK publicitaire.** Le comportement de recherche halal peut révéler une conviction religieuse (article 9 du RGPD) ; voir `08-architecture.md` § 6.

### Session

`analytics_events.session_id` (facultatif) est un identifiant **éphémère** : créé à l'ouverture de l'app, renouvelé après 30 minutes d'inactivité, jamais associé à un compte ni conservé sur l'appareil au-delà de la session. Il permet de relier une fiche ouverte à une intention de visite dans la même session, rien de plus. **Proposé**, à valider avec le DPO pour le régime `audience`.

---

## 2. North Star

**Découvertes qualifiées débouchant sur une intention de visite**, par semaine.

Définition exacte : nombre de couples distincts (session, restaurant) tels que :
- un événement `restaurant_opened` a eu lieu pour ce restaurant dans la session ;
- puis, dans les 2 heures et la même session, au moins un événement d'intention pour le même restaurant : `route_clicked`, `phone_clicked`, `booking_clicked`, ou `share_clicked` avec `target = restaurant`.

Un couple compte une fois, même s'il y a plusieurs intentions.

Ce que l'indicateur **ne mesure pas** : la visite réelle. Ouvrir l'itinéraire, appeler, réserver ou partager sont des intentions ; YallaYum ne suit pas le déplacement et ne prétend pas savoir si la personne y est allée. Le carnet « J'y suis allé·e » est déclaratif, local au téléphone, et n'entre pas dans la mesure.

Il se calcule entièrement avec des événements du régime `audience` : il reste mesurable sans consentement à la mesure détaillée.

### Indicateurs d'appui

| Indicateur | Définition | Pourquoi |
|---|---|---|
| Taux de succès de recherche | Part des `search_submitted` suivis d'un `restaurant_opened` dans les 10 minutes de la même session | La recherche mène-t-elle à une fiche ? |
| Taux de zéro résultat | Part des `search_submitted` avec `results = 0` | Couverture, lexique, filtres trop stricts |
| Fiche → intention | Couples (session, restaurant) avec intention / couples avec fiche ouverte | Qualité des fiches et de la décision |
| Taux de dépliage halal | `halal_info_expanded` / `restaurant_opened` | Besoin de preuve ; à lire par niveau |
| Taux de clic itinéraire | `route_clicked` / `restaurant_opened` | Action principale de la fiche |
| Part des fiches ouvertes depuis la carte, la liste, le carrousel, les collections | `restaurant_opened.source` | Équilibre carte / éditorial |
| Contributions par semaine et délai de traitement | `report_submitted` ; table `contributions` (statuts, horodatages) | Santé de la boucle de correction |
| Fraîcheur du catalogue | Voir § 4.3 | Promesse de confiance |
| Sessions sans plantage | Outil de suivi des plantages | Qualité |

### Garde-fous

À surveiller à chaque changement : part d'adresses « à confirmer » parmi les fiches ouvertes, taux de zéro résultat, latence p95 de la recherche, part des intentions venant d'un emplacement sponsorisé (une hausse de la North Star qui ne viendrait que du sponsorisé n'est pas un succès produit).

---

## 3. Plan de marquage

### 3.1 Événements en place (version 1)

Déclencheurs tels qu'implémentés dans le prototype (`src/app/*`). Toutes les propriétés sont non personnelles par construction.

| Événement | Régime | Déclencheur | Propriétés | Définition métier |
|---|---|---|---|---|
| `app_open` | audience | Montage de l'app (`App.tsx`) | `cold_start` (booléen) | Ouverture ou retour au premier plan |
| `location_permission_result` | audience | Position accordée, refusée, indisponible ; ville choisie ; invitation repoussée (« Plus tard ») | `result` ∈ `granted`, `denied`, `unavailable`, `city_chosen`, `dismissed` | Réponse à la demande de position |
| `search_submitted` | audience | Validation d'une recherche (`submitQuery`) | `results` (≤ 500), `zero_query` (si zéro résultat, nettoyée), `understood_place`, `understood_cuisine`, `understood_occasion` | Recherche validée ; mesure la compréhension |
| `filter_applied` | audience | Ajout ou retrait d'un filtre ; « Tout effacer » | `filter` (clé du filtre), `action` ∈ `add`, `remove`, `clear_all`, `results` | Usage des filtres |
| `map_area_searched` | audience | Bouton « Rechercher dans cette zone » | `results` | Exploration par la carte |
| `restaurant_impression` | **analytics** | Carte de résultat visible au moins 1 s à 50 %, échantillonnée (prototype : seulement « Surprends-moi ») | `restaurant_id`, `position`, `sponsored`, `source` | Exposition, base du taux de clic par position |
| `restaurant_opened` | audience | Ouverture d'une fiche (`openRestaurant`) | `restaurant_id`, `source` ∈ `map`, `list`, `carousel`, `search`, `collection`, `deeplink`, `similar`, `favorites` ; `sponsored` ; `distance` (tranche) | Fiche détaillée ouverte |
| `halal_info_expanded` | audience | « Ce que ça veut dire » sur le bloc halal | `restaurant_id`, `level` | Besoin de preuve |
| `route_clicked` | audience | Choix d'une app dans « Y aller avec… » | `restaurant_id`, `app` ∈ `apple`, `google`, `waze`, `citymapper`, `other` ; `distance` | Intention de visite (ne prouve pas la visite) |
| `phone_clicked` | audience | Ligne téléphone ou bouton d'appel | `restaurant_id` | Intention de visite |
| `booking_clicked` | audience | Lien de réservation | `restaurant_id` | Intention de visite |
| `share_clicked` | audience | Partage d'une fiche ou d'une collection | `restaurant_id`, `target` ∈ `restaurant`, `collection` | Intention de visite (fiche) |
| `favorite_added` | audience | Cœur activé | `restaurant_id`, `signed_in` | Mémorisation |
| `report_submitted` | audience | Envoi d'une contribution | `kind` (type de contribution) | Boucle de correction |
| `loyalty_card_opened` | audience | Écran « Ma carte » ; activation | `activated` | Usage de la carte |
| `loyalty_transaction_result` | audience | Résultat d'un passage en caisse, côté client | `status` ∈ `credited`, `duplicate`, `rejected`, `pending` | Fonctionnement du programme |

### 3.2 Défauts relevés dans le prototype (corrigés)

| Constat | Effet | Correction appliquée |
|---|---|---|
| Un lien profond ouvrait la fiche sans émettre `restaurant_opened` | Les intentions venues d'un lien partagé ne comptaient pas dans la North Star | `restaurant_opened` émis avec `source = deeplink` après résolution du lien (fiche, ancien lien, déménagement) |
| Le partage d'une collection mettait l'identifiant de collection dans `restaurant_id` | Pollution des comptes par restaurant | `share_clicked` v2 avec `collection_id` ; les requêtes ci-dessous excluent `target = collection` des calculs par restaurant |
| « Tout effacer » envoyait `filter = cuisines` faute de valeur dédiée | Surestimation des retraits de cuisine | `filter_applied` v2 avec la valeur `all` |
| `restaurant_impression` n'était émis que par « Surprends-moi » | Pas de taux de clic par position | Observateur de visibilité dans la liste (50 % visible pendant 1 s, une fois par réponse) et dans le carrousel (carte centrée pendant 1 s) |

### 3.3 Événements proposés

| Événement (version) | Régime | Déclencheur | Propriétés | Pourquoi |
|---|---|---|---|---|
| `restaurant_opened` v2 | audience | Idem v1 | + `position` (rang dans la liste, si applicable) | Taux de clic par position sans dépendre du consentement |
| `search_submitted` v2 | audience | Idem v1 | + `place_id` (ville ou arrondissement reconnu, jamais une adresse) | Demande par ville : couverture à prioriser. À valider (une ville est-elle assez grossière ?) |
| `zero_result_fix_applied` | audience | Correction choisie dans le diagnostic | `fix` ∈ `expand`, `remove`, `show_uncertain` ; `filter` | Qualité du diagnostic |
| `uncertain_group_expanded` | audience | Dépliage « horaires non confirmés » | `count` | Besoin d'horaires fiables |
| `sort_changed` | audience | Changement de tri | `sort` ∈ `relevance`, `distance`, `price`, `newest` | Préférences de tri |
| `collection_opened` | audience | Ouverture d'une collection ou d'un article | `collection_id`, `kind` ∈ `collection`, `article` | Rôle de l'éditorial |
| `collection_map_shown` | audience | « Voir sur la carte » depuis une collection | `collection_id` | Le magazine mène-t-il à la carte ? |
| `surprise_used` | audience | « Surprends-moi » | `result` ∈ `picked`, `none` | Découverte variable |
| `deeplink_resolved` | audience | Ouverture d'un lien `/r/<slug>` | `kind` ∈ `restaurant`, `renamed`, `moved`, `temporarily_closed`, `permanently_closed`, `unavailable`, `not_found` | Liens morts, déménagements |
| `map_load_failed` | audience | Carte indisponible (état de repli) | `reason` ∈ `timeout`, `webgl`, `network` | Fiabilité de la carte |
| `app_performance` | audience | Fin du premier rendu interactif | `cold_start_ms` en tranches | Budget de performance sur appareils réels |

### 3.4 Contrôle qualité

| Contrôle | Où |
|---|---|
| Propriété inconnue retirée, valeur invalide → événement abandonné | Appareil, `buildEvent()` (tests `modules.test.ts`) |
| Propriété hors dictionnaire ou régime incohérent → insertion refusée | Base, `analytics_props_guard` |
| Coordonnées, e-mail, téléphone, identifiant → insertion refusée | Base, contrainte `no_personal_props` |
| Horodatage non tronqué → refusé | Base, contrainte sur `at` |
| Consentement absent → événements `analytics` jamais envoyés | Appareil (`track()` lit `consent.analytics`) |
| Volume journalier par événement hors de ±50 % de la médiane des 7 derniers jours | Alerte quotidienne (requête planifiée) |
| Nouvelle version d'un événement | Ajout dans `analytics_event_specs` + `EVENTS` dans le même changement ; les deux versions coexistent le temps du déploiement |
| Recette | Journal des événements visible dans le banc d'essai du prototype ; scénarios E2E qui vérifient l'émission |

---

## 4. Tableaux de bord

Requêtes d'exemple sur `analytics_events` (PostgreSQL). `:debut` et `:fin` sont des bornes de dates.

### 4.1 North Star par semaine

```sql
WITH ouvertes AS (
  SELECT session_id, props->>'restaurant_id' AS rid, min(at) AS ouverte_a
  FROM analytics_events
  WHERE name = 'restaurant_opened' AND session_id IS NOT NULL
    AND at >= :debut AND at < :fin
  GROUP BY 1, 2
), intentions AS (
  SELECT session_id, props->>'restaurant_id' AS rid, at
  FROM analytics_events
  WHERE name IN ('route_clicked', 'phone_clicked', 'booking_clicked', 'share_clicked')
    AND coalesce(props->>'target', 'restaurant') = 'restaurant'
    AND session_id IS NOT NULL AND at >= :debut AND at < :fin + interval '2 hours'
)
SELECT date_trunc('week', o.ouverte_a) AS semaine,
       count(DISTINCT (o.session_id, o.rid)) AS decouvertes_qualifiees
FROM ouvertes o
JOIN intentions i ON i.session_id = o.session_id AND i.rid = o.rid
 AND i.at >= o.ouverte_a AND i.at < o.ouverte_a + interval '2 hours'
GROUP BY 1
ORDER BY 1;
```

### 4.2 Recherches sans résultat

```sql
-- Taux par jour et compréhension de la requête
SELECT date_trunc('day', at) AS jour,
       count(*) AS recherches,
       round(100.0 * count(*) FILTER (WHERE (props->>'results')::int = 0) / count(*), 1) AS pct_zero,
       round(100.0 * count(*) FILTER (WHERE (props->>'understood_place')::boolean) / count(*), 1) AS pct_lieu_compris
FROM analytics_events
WHERE name = 'search_submitted' AND at >= :debut AND at < :fin
GROUP BY 1 ORDER BY 1;

-- Requêtes sans résultat les plus fréquentes (texte conservé 90 jours au plus)
SELECT props->>'zero_query' AS requete, count(*) AS n
FROM analytics_events
WHERE name = 'search_submitted' AND props ? 'zero_query' AND at >= now() - interval '30 days'
GROUP BY 1 ORDER BY n DESC LIMIT 50;
```

Lecture : une requête fréquente sans résultat est soit un manque de couverture (ville, cuisine), soit un mot absent du lexique (`query.ts`), soit un filtre trop strict. Chacune donne une action : prospection, ajout de synonyme, revue du diagnostic.

### 4.3 Fraîcheur du catalogue

```sql
-- Vue de santé existante
SELECT * FROM catalog_health;

-- Répartition des niveaux de preuve sur les fiches visibles
SELECT (halal_status(r.id, current_date)).level AS niveau, count(*)
FROM discoverable_restaurants r
GROUP BY 1 ORDER BY 1;

-- Certifications qui expirent dans les 60 jours
SELECT r.name, c.valid_until
FROM halal_claims c JOIN restaurants r ON r.id = c.restaurant_id
WHERE c.kind = 'certification' AND c.review_status = 'approved'
  AND c.valid_until BETWEEN current_date AND current_date + 60
ORDER BY c.valid_until;
```

Indicateurs : part des fiches visibles avec une preuve halal valide (niveau ≠ `unconfirmed`), part avec horaires confirmés depuis moins de 180 jours, âge médian de la dernière vérification.

### 4.4 Couverture par ville

```sql
SELECT city, count(*) AS fiches_visibles,
       count(*) FILTER (WHERE (halal_status(id, current_date)).level <> 'unconfirmed') AS avec_preuve
FROM discoverable_restaurants
GROUP BY city ORDER BY fiches_visibles DESC;
```

À croiser avec la demande par ville (`search_submitted.place_id`, **proposé**) pour prioriser la prospection.

### 4.5 Fiche → intention et clic itinéraire

```sql
SELECT props->>'source' AS source,
       count(*) AS fiches,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM analytics_events r
         WHERE r.name = 'route_clicked' AND r.session_id = e.session_id
           AND r.props->>'restaurant_id' = e.props->>'restaurant_id'
           AND r.at BETWEEN e.at AND e.at + interval '2 hours')) AS avec_itineraire
FROM analytics_events e
WHERE e.name = 'restaurant_opened' AND e.session_id IS NOT NULL AND e.at >= :debut AND e.at < :fin
GROUP BY 1 ORDER BY fiches DESC;
```

À décliner par tranche de distance, par application de navigation choisie, par niveau halal (jointure avec `halal_status`) et par `sponsored`.

### 4.6 Performance et stabilité

Hors `analytics_events` : latence par route et requêtes lentes (traces de l'API), sessions sans plantage (outil de suivi des plantages), démarrage à froid (`app_performance`, **proposé**). Les budgets proposés sont dans `08-architecture.md` § 7.

---

## 5. Rétention

| Donnée | Durée | Réglage |
|---|---|---|
| Événements `audience` | 25 mois (760 jours) | `app_config` `analytics.retention_days.audience` |
| Événements `analytics` | 13 mois (395 jours) | `analytics.retention_days.analytics` |
| Texte des recherches sans résultat | 90 jours, puis la propriété est effacée de l'événement | `analytics.zero_query_days` |

`purge_analytics()` applique ces règles ; elle tourne chaque jour (file de tâches). Les agrégats (comptes hebdomadaires sans propriété fine) peuvent être conservés plus longtemps : ils ne contiennent rien qui se rattache à une personne.

---

## 6. Évaluer la nouvelle direction artistique sur des usages réels

On ne juge pas une direction artistique au nombre de vues de maquettes ni aux réactions sur les réseaux.

1. **Mesure de référence** : quatre semaines de l'application actuelle (ou de la première version publiée) sur les indicateurs : North Star par session active, fiche → intention, taux de succès de recherche, temps entre ouverture de l'app et première fiche ouverte, taux de zéro résultat, plantages.
2. **Hypothèses écrites avant le lancement** : quel indicateur doit bouger, de combien, et lesquels ne doivent pas se dégrader (garde-fous § 2).
3. **Comparaison** :
   - si l'ancienne et la nouvelle interface peuvent coexister, test A/B par session (indicateur de fonctionnalité), 10 à 50 % des sessions ;
   - sinon, série temporelle interrompue avec la même saisonnalité (même période de semaine, mêmes villes) et une période de stabilisation exclue des calculs.
4. **Rétention** : sans identifiant persistant, la rétention à J7 ou J30 ne se mesure pas dans `analytics_events`. Sources possibles : statistiques agrégées des stores (App Store Connect, Google Play Console), ou cohorte limitée aux personnes ayant consenti à la mesure détaillée. Ne pas créer d'identifiant persistant pour ce seul besoin.
5. **Qualitatif** : tests d'utilisabilité sur les tâches des personas (« trouve un déjeuner à moins de 15 €, ouvert, près de toi, et lance l'itinéraire »), 6 à 8 personnes par vague, avec mesure de réussite et de durée ; un passage avec lecteur d'écran et police à 200 %.
6. **Décision** consignée, avec les chiffres et leurs intervalles.

---

## 7. Outils possibles

| Option | Pour | Contre | À vérifier |
|---|---|---|---|
| Mesure maison : `POST` vers l'API, stockage dans `analytics_events` | Contrôle total des propriétés, validation en base déjà écrite, aucune donnée chez un tiers | Tableaux de bord à construire (SQL + outil de visualisation) | Charge sur la base principale : réplica de lecture ou base dédiée au-delà d'un certain volume |
| Matomo (auto-hébergé ou cloud UE) | Outil connu, configurable pour l'exemption de consentement de la CNIL | Pensé pour le web ; intégration mobile à valider ; double source de vérité | Configuration exacte pour l'exemption, SDK mobile |
| Autres outils sans cookie hébergés dans l'UE | Simples | Souvent limités au web et aux pages vues | Couverture mobile, conditions d'exemption |
| Suivi des plantages : outil hébergé dans l'UE ou auto-hébergé | Indispensable | Risque de remontée de données personnelles dans les traces | Nettoyage des données avant envoi, région d'hébergement |

**Recommandation** : mesure maison pour les événements produit (le dictionnaire, la validation et la purge existent déjà dans `db/schema.sql`), un outil de suivi des plantages hébergé dans l'UE, et aucune autre bibliothèque tierce de mesure. À valider par le DPO, avec l'inscription des traitements au registre.

---

## Décisions à prendre

1. **Identifiant de session éphémère** dans le régime `audience` : validation par le DPO, sinon la North Star se calcule par jour et par restaurant, sans lien de session.
2. **Fenêtre d'attribution** de la North Star : 2 heures proposées.
3. **`share_clicked` compte-t-il comme intention de visite ?** Proposé : oui pour une fiche, non pour une collection.
4. **Correctifs v2** à intégrer avant le lancement : lien profond → `restaurant_opened`, `collection_id`, `filter = all`, impressions dans la liste.
5. **Événements proposés** à retenir pour le MVP (en priorité : `restaurant_opened` v2 avec position, `zero_result_fix_applied`, `deeplink_resolved`, `app_performance`).
6. **`place_id` dans `search_submitted`** : utile pour la couverture, à valider sur le plan de la vie privée.
7. **Outil** : mesure maison recommandée ; choix de l'outil de suivi des plantages.
8. **Durées de conservation** (25 mois, 13 mois, 90 jours) à confirmer par le DPO.
