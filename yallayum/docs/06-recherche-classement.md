# 06 — Recherche et classement

Ce document décrit comment YallaYum trouve, filtre et ordonne les adresses, de la saisie « burger à Saint-Denis ouvert après 23h » jusqu'à la liste affichée. Il reprend le comportement exact du code (`src/domain/search.ts`, `filters.ts`, `ranking.ts`, `query.ts`, `places.ts`, `text.ts`) et du schéma (`db/schema.sql` : `search_restaurants`, `cluster_restaurants`, `app_config`). Il propose ensuite la stratégie de production : spatial, grappes, cache, géocodage, itinéraires, mesure et réglage des poids.

Règle de lecture : ce qui est écrit au présent est implémenté et testé (`npm test`, `npm run test:sql`). Ce qui est marqué **proposé** ou **hypothèse** reste à construire ou à mesurer.

---

## 1. Le pipeline en une ligne

```
zone cherchée → fiches visibles → filtres stricts → classement → tri → emplacement sponsorisé → diagnostic si zéro
```

| Étape | Fonction | Règle |
|---|---|---|
| Zone | `SearchRequest.area` (bbox) | La zone est celle de la carte **au moment où la personne lance la recherche**, moins la partie cachée par la feuille de résultats. Bouger la carte ne relance rien. |
| Fiches visibles | `isDiscoverable()` / `is_discoverable()` | `publication = published` et `operating ∈ {operating, temporarily_closed}` (et `deleted_at IS NULL` en base). Une fiche fermée définitivement, déménagée, suspendue, archivée ou en brouillon ne sort jamais. |
| Filtres | `applyFilters()` / `search_restaurants()` | Contraintes strictes. Aucun filtre n'est un bonus de score. |
| Classement | `rank()` → `rankOne()` | Somme pondérée de 7 signaux entre 0 et 1, détail conservé pour « Pourquoi ce résultat ? ». |
| Tri | `sortRanked()` | Pertinence (défaut), distance, budget, nouveautés. Départage stable par identifiant. |
| Sponsorisé | `insertSponsored()` | Au plus une insertion, à la position 3, seulement en tri « Pertinence », seulement si l'adresse respecte déjà tous les filtres. |
| Diagnostic | `diagnose()` | Si aucun résultat : au plus trois corrections chiffrées (élargir, retirer un filtre, voir les horaires non confirmés). |

En production, la base garantit la zone, les filtres, la distance géodésique et la pagination ; l'API calcule le score avec le même code TypeScript (`src/domain/ranking.ts`), partagé avec l'application et le back-office (voir `08-architecture.md`).

---

## 2. Filtres stricts

Un restaurant qui ne remplit pas un filtre explicite ne sort pas. `evaluate()` teste chaque filtre séparément et renvoie la liste des filtres qui l'écartent : c'est ce qui rend le diagnostic possible.

| Filtre | Règle exacte | Si l'information manque |
|---|---|---|
| Collection | L'identifiant figure dans `collection.restaurantIds` | — |
| Cuisines | Au moins une cuisine de la fiche ∈ cuisines demandées **et leurs descendants** (`cuisineWithDescendants`, `cuisine_with_descendants()` en SQL). « Asiatique » inclut japonaise, coréenne, thaï, chinoise. | Écartée |
| Envies | Au moins une des envies demandées (OU à l'intérieur de la famille) | Écartée |
| Budget | `price.level ≤ priceMax` | **Écartée** : un prix inconnu ne permet pas de tenir la promesse du budget |
| Ouvert maintenant | `openStatus().state` : `closed` → écartée | `unknown` ou confiance ≠ `confirmed` → **groupe « horaires non confirmés »** |
| Ouvert à HH:MM | `isOpenAt()` à cette minute locale ; avant 06:00, on vise la nuit qui vient (`openAtMinutes` : +1440) | Sans horaires ou horaires anciens → groupe non confirmé ; fiche non `operating` → écartée |
| Rayon | Distance géodésique à l'origine ≤ rayon | Sans origine, le filtre est ignoré |
| Niveau halal minimal | `meetsHalalLevel(level, min)` sur le niveau **dérivé à la date du jour** | `unconfirmed` < `declared` < `team_verified` < `certified` |
| Organisme | Niveau `certified` **et** certifiant ∈ liste | Écartée |
| Équipements | **Tous** présents sur la fiche | Une case absente = « non confirmé » : écartée |
| Sans alcool | `alcohol = not_served` | `unknown` écartée |

**Le groupe « horaires non confirmés ».** Avec un filtre d'ouverture, une adresse aux horaires inconnus ou vieux de plus de `hours.stale_after_days` (180 jours) n'est ni affichée comme ouverte, ni cachée en silence : elle va dans `SearchResponse.uncertain`, affiché replié sous la liste (« 3 adresses aux horaires non confirmés »). En base, `search_restaurants()` renvoie ces lignes avec `hours_uncertain = true` et l'API forme le groupe.

**Mêmes règles en SQL.** `search_restaurants()` applique les mêmes filtres, dans le même ordre logique, et ordonne par `(distance, id)`. Les tests `db/tests.sql` et `src/domain/recette.test.ts` couvrent les mêmes cas (cas 2, 3, 6, 7 et 18 du cahier des charges).

---

## 3. Classement

### 3.1 Formule

```
score = Σ poids(signal) × valeur(signal)      valeur ∈ [0, 1]
```

Poids par défaut (`DEFAULT_RANKING`, repris dans `app_config` clé `ranking.weights`) :

| Signal | Poids | Valeur | Phrase affichée (si le signal est assez fort) |
|---|---|---|---|
| `text` | 3 | Correspondance nom / plat (§ 3.2) ; 0 sans texte | « Correspond au nom cherché » (≥ 0,8), « Correspond à ta recherche » (≥ 0,3) |
| `proximity` | 2 | `exp(−distance / 1200 m)` ; 0 sans origine | « À 350 m de toi, à vol d'oiseau » ou « … du centre de la zone » (≥ 0,3) |
| `occasion` | 1,2 | Force éditoriale de l'envie demandée / 2 (force 2 → 1, force 1 → 0,5) | « Idéal : pour un date » / « Convient : … » |
| `openness` | 1 | Ouvert + confirmé 1 ; ferme bientôt 0,6 ; ouvert mais horaires anciens 0,7 ; inconnu 0,4 ; fermé 0,1 | « Ouvert maintenant, horaires confirmés » |
| `completeness` | 0,8 | Part de 7 critères : photo réelle, description ≥ 60 caractères, horaires vérifiés < 180 j, prix, un moyen de contact, menu, ≥ 2 équipements | « Fiche complète » (≥ 0,7) |
| `freshness` | 0,8 | 0 si `unconfirmed` ; sinon (1 si preuve fraîche, 0,5 si elle vieillit) × (0,55 + 0,15 × rang du niveau) | « Info halal vérifiée il y a 2 mois » |
| `editorial` | 0,5 | 1 si coup de cœur de la rédaction | « Coup de cœur de la rédaction » |

Score maximal théorique : 9,3. Le score n'est jamais affiché ; seules les raisons le sont.

Le signal `freshness` combine fraîcheur et niveau de preuve : à fraîcheur égale, une adresse certifiée vaut 1,0, vérifiée 0,85, déclarée 0,70. C'est un signal de qualité d'information, pondéré à 0,8 sur 9,3 : il ne peut pas faire passer une adresse lointaine devant une adresse proche équivalente. Aucun paiement n'entre dans ce calcul (la table `sponsored_campaigns` n'a aucune colonne liée au halal).

**Point de vigilance (conflit indirect).** `completeness` récompense une photo réelle et un menu. Si un service payant fournit photos et menus (voir `10-modele-economique.md`), il améliorerait le rang par ricochet. Parade : ces éléments doivent rester obtenables gratuitement (envoi par le restaurateur, passage de l'équipe) et le poids du signal reste plafonné.

### 3.2 Correspondance textuelle (`textMatch`)

| Cas | Valeur |
|---|---|
| Nom normalisé identique à la requête | 1 |
| Nom qui commence par la requête | 0,9 |
| Nom qui contient la requête | 0,8 |
| Mots de la requête retrouvés dans le nom (fautes tolérées pour les mots ≥ 4 lettres) | 0,6 × part des mots trouvés |
| Requête trouvée dans la description | 0,3 |
| Un plat reconnu (« tajine ») présent dans la description | au moins 0,5 |

Quand la requête contient du texte libre, `search()` ne garde que les résultats dont le signal `text` vaut au moins 0,3 : chercher un nom donne ce nom, pas tout le quartier.

### 3.3 Tri et départage

| Tri | Ordre |
|---|---|
| Pertinence | score décroissant, puis identifiant |
| Distance | distance croissante (sans distance en dernier), puis identifiant |
| Budget | niveau de prix croissant (inconnu en dernier), puis score, puis identifiant |
| Nouveautés | date de publication décroissante, puis identifiant |

Pas de tri par note : il n'y a pas d'avis publics au MVP. Le départage par identifiant garantit que la carte, la liste et le carrousel montrent le même ordre à chaque relance (cas 8 et 9, test « Ordre stable »).

### 3.4 Emplacement sponsorisé (`insertSponsored`)

- Une seule insertion par page, à la position `ranking.sponsored_slot` (3 par défaut).
- Seulement en tri « Pertinence ».
- Le candidat vient de la liste **déjà filtrée** : une adresse qui ne respecte pas un filtre (« Certifié uniquement », budget, ouverture) ne peut pas être insérée (cas 18).
- Si l'adresse sponsorisée est déjà classée au-dessus de l'emplacement, rien n'est déplacé : son rang organique ne doit rien au paiement. Elle garde pourtant la mention « Sponsorisé », comme toute adresse sous campagne active dans les résultats (`insertSponsored`, testé dans `recette.test.ts`).
- Sinon elle est **déplacée**, jamais dupliquée, et porte `sponsored: true` : mention « Sponsorisé » sur la carte de résultat, sur la fiche et pastille distincte sur le marqueur.
- Son niveau halal reste celui de ses preuves (« déclaré » reste « déclaré »).

Cadre légal à valider : l'article L111-7 du Code de la consommation impose aux plateformes d'informer sur les modalités de classement et sur l'existence d'une rémunération qui l'influence. « Pourquoi ce résultat ? » et la mention « Sponsorisé » y répondent ; la page d'aide doit publier les critères principaux.

### 3.5 « Pourquoi ce résultat ? »

Chaque `Ranked` garde ses raisons (`Reason[]` : signal, valeur, contribution, phrase). La feuille « Pourquoi ce résultat ? » de la fiche les affiche triées par contribution, en barres relatives, avec la phrase : « L'adresse respecte tous tes filtres. Son rang vient de ces critères, pondérés par l'équipe produit. Le paiement n'en fait pas partie. »

### 3.6 Diagnostic des recherches sans résultat (`diagnose`)

Quand la liste est vide :

1. **Élargir la zone** : même recherche dans la zone agrandie 2,5 fois ; proposé si au moins un résultat.
2. **Retirer un filtre** : pour chaque filtre actif, nombre réel de résultats sans lui.
3. **Voir les horaires non confirmés** : si le groupe incertain n'est pas vide.

Au plus trois corrections, élargir d'abord (on garde ce que la personne a demandé), chacune avec son nombre réel. Si la combinaison de plusieurs filtres ne donne rien **dans tout le catalogue**, `impossible = true` et l'écran le dit (« Cette combinaison n'existe pas encore ») au lieu de proposer d'élargir sans fin. Si la zone ne contient aucune adresse, filtres ou pas (`areaEmpty`), l'écran dit « Pas encore d'adresse référencée ici » et propose une autre ville ou une suggestion d'adresse. Aucun marqueur n'est inventé (cas 2).

---

## 4. Comprendre la requête (`interpret`)

Pas de modèle de langage pour une recherche simple : un lexique et quelques motifs suffisent, sont prévisibles et se testent (`src/domain/query.test.ts`).

### 4.1 Normalisation

`normalize()` : décomposition Unicode, suppression des accents, minuscules, `œ → oe`, apostrophes et tirets → espaces, ponctuation retirée. « Château-Rouge » devient `chateau rouge` ; `€` est conservé.

### 4.2 Motifs chiffrés (avant découpage)

| Motif | Exemple | Résultat |
|---|---|---|
| `(ouvert) après / à partir de / vers H(h)(MM)` | « ouvert après 23h », « après 1h30 » | `openAt = 23:00` / `01:30` (la nuit qui vient) |
| `(moins de / max / budget / à) N €|eur|euros` | « moins de 15 € » | `priceMax = 1` (≤ 15 €), 2 (≤ 30 €), 3 (≤ 50 €), 4 |
| `N personnes / pers / potes / amis`, N ≥ 6 | « 6 personnes » | équipement `groupes` |
| `€` à `€€€€` | « date €€€ » | `priceMax` = nombre de symboles |

Un prix exige `€`, `eur` ou `euros` : « Paris 15e » reste un arrondissement (test dédié).

### 4.3 Lexique et n-grammes

Le lexique réunit, par priorité : ouverture (« ouvert maintenant », « encore ouvert »), heure tardive (« tard », « après minuit » → `openAt = 23:00`), « autour de moi », expressions de prix (« pas cher » → €), équipements, envies (« en amoureux » → `date`), cuisines et plats (« tajine » → marocaine + terme de plat), lieux, puis mots ignorés (« halal », « resto », « meilleur », articles).

Le découpage cherche d'abord la plus longue expression (jusqu'à 4 mots), puis 3, 2, 1. Un mot non reconnu passe par la tolérance aux fautes ; s'il n'est toujours pas reconnu, il rejoint le texte libre cherché dans les noms.

### 4.4 Tolérance aux fautes

Distance de Damerau-Levenshtein (transpositions comprises), interrompue dès qu'elle dépasse le budget. Budget selon la longueur du mot visé : 0 faute sous 4 lettres, 1 faute de 4 à 7, 2 fautes à partir de 8. Elle s'applique aux clés d'un seul mot d'au moins 4 lettres, hors mots ignorés et hors lieux : « japonnais » → japonaise, « libanai » → libanaise.

Limite connue : les noms de lieux doivent être écrits sans faute (accents et tirets tolérés). **Proposé** : index trigramme (`pg_trgm`) sur le référentiel de lieux côté serveur.

### 4.5 Lieux et homonymes (`places.ts`)

Le référentiel de démonstration couvre Paris, ses 20 arrondissements (dix écritures chacun : « 11e », « 11eme », « paris 11 », « 75011 »…), une trentaine de quartiers et gares, la proche couronne et des villes hors zone. Un lieu donne une zone `bboxAround(centre, rayon)`.

Homonymes : « Saint-Denis » renvoie Saint-Denis (Seine-Saint-Denis) et Saint-Denis (La Réunion). `rankHomonyms()` prend le plus proche de l'origine (position, sinon centre de la carte), et à défaut le plus peuplé. L'autre est proposé en un geste : « Plutôt Saint-Denis (La Réunion) ? ». Sans position ni carte, La Réunion (153 000 hab.) passe devant le 93 (113 000) : c'est pourquoi l'app passe toujours le centre de la carte comme origine.

### 4.6 Ce qui est montré : « Compris : »

Chaque élément reconnu devient une puce (`Chip`) : lieu, « Autour de moi », cuisines, envies, équipements, budget, « Ouvert maintenant », « Ouvert à 23 h », texte libre entre guillemets. Les puces s'affichent avant validation dans l'écran de recherche, puis dans la barre ; chaque filtre se retire en un geste. Les mots ignorés sont conservés (`ignored`) pour l'analyse, pas affichés.

### 4.7 Autocomplétion (`autocomplete`)

À partir de 2 caractères, sur la saisie entière et sur le dernier mot :

| Groupe | Source | Ordre |
|---|---|---|
| Lieux | référentiel | correspondance exacte, puis début de nom, puis mot interne ; à égalité, le plus proche de l'origine |
| Restaurants | catalogue visible, `textMatch ≥ 0,6` | force de correspondance |
| Cuisines et plats | libellés et synonymes | ordre de la taxonomie |
| Envies | libellés et synonymes | ordre de la taxonomie |

Quatre suggestions au plus par groupe, puis « Rechercher « … » ». Choisir un restaurant ouvre sa fiche directement ; un lieu déplace la zone ; une cuisine ou une envie ajoute un filtre.

---

## 5. Stratégie spatiale de production

### 5.1 Données et index

- `restaurants.location` : `geography(Point, 4326)`, index GiST `restaurants_location_idx`. Les distances (`ST_Distance`, `ST_DWithin`) sont géodésiques, en mètres.
- `restaurants_discoverable_idx` sur `(publication, operating) WHERE deleted_at IS NULL` ; index trigramme sur `normalized_name` pour la recherche par nom.
- Zone = enveloppe `ST_MakeEnvelope(ouest, sud, est, nord)` convertie en geography.

### 5.2 Zone visible, pas zone de la carte

Le client envoie la bbox de la partie visible : de la barre de recherche jusqu'au haut de la feuille de résultats (`visibleBBox()` dans `MapView.tsx`). Chercher sous la feuille donnerait des résultats que la personne ne voit pas sur la carte.

### 5.3 Pagination

Par curseur `(distance, id)` : `search_restaurants(…, p_after_distance, p_after_id, p_limit)`, 20 par défaut, 100 au plus. Pas de pagination par numéro de page (stable même si la base change entre deux pages).

Limite à connaître : la base pagine par distance, l'API classe par pertinence. **Proposé** : pour une zone, l'API charge les N candidats les plus proches (N = 200, à mesurer), les classe en mémoire et pagine ce classement avec un curseur opaque (rang, id). Au-delà de N candidats, l'écran invite à zoomer ou à filtrer.

### 5.4 Grappes par zoom

| Contexte | Méthode |
|---|---|
| Prototype | `supercluster` côté client (rayon 52 px, zoom max 16, 3 points minimum). La sélection est exclue de l'index : elle n'est jamais avalée par une grappe. |
| Production, peu de points | Les points de la zone arrivent avec la réponse ; grappes calculées sur l'appareil (supercluster ou couche symbole native MapLibre). |
| Production, beaucoup de points | `GET /v1/clusters` → `cluster_restaurants()` : grille d'environ 64 px par cellule au zoom demandé (`ST_SnapToGrid`), compte et centroïde, identifiant si cellule d'un seul point. |

**Seuil N proposé : 300 points dans la zone visible.** En dessous, l'API renvoie les points (ordre de grandeur estimé : 300 × ~150 octets ≈ 45 Ko avant compression) ; au-dessus, des agrégats serveur. Ce seuil est une hypothèse à mesurer sur un téléphone milieu de gamme (temps de réponse, mémoire, fluidité du déplacement de carte).

### 5.5 Cache

| Couche | Clé | Durée |
|---|---|---|
| CDN (requêtes anonymes `GET /v1/restaurants`, `/v1/clusters`) | bbox arrondie à une grille dépendant du zoom + filtres normalisés + **version du catalogue** | 5 min ; 60 s si un filtre d'ouverture est actif (l'état dépend de la minute) |
| API (mémoire) | `restaurant:{id}:{version}` pour les fiches ; taxonomies | Jusqu'à changement de version |
| Appareil | Dernière réponse + fiches des favoris | Affichées hors ligne avec la date (« résultats de 23:40, peut-être anciens ») |

**Invalidation proposée : par version.** Chaque publication, suspension, archivage ou expiration d'une preuve halal incrémente une version de catalogue (compteur en base, exposé par l'API). La version fait partie des clés : un changement rend toutes les anciennes clés obsolètes sans purge explicite. Le contrôle quotidien `expire_halal_claims()` incrémente aussi la version, pour qu'un badge expiré ne survive pas dans un cache.

### 5.6 Géocodage

| Besoin | Outil proposé | Règle |
|---|---|---|
| Adresses françaises (import, contributions, éditeur) | Base Adresse Nationale (API `api-adresse.data.gouv.fr`, licence ouverte) | Seuil de score à l'import (voir `db/MIGRATION.md`) ; en dessous, vérification humaine sur carte. Quotas de l'API publique à vérifier ; auto-hébergement possible (addok). |
| Lieux (villes, quartiers, gares) | Référentiel maison (communes INSEE, arrondissements, quartiers éditorialisés) mis en cache côté serveur, complété par un géocodeur de lieux (Photon ou Nominatim auto-hébergé) | Pas d'usage intensif des instances publiques de Nominatim : leur politique d'usage l'interdit. |
| Homonymes | `rankHomonyms` : distance à l'origine, puis population | Toujours proposer l'alternative en un geste. |

Le géocodage ne sert jamais à créer des fiches automatiquement : une adresse géocodée reste un brouillon jusqu'à validation.

### 5.7 Fuseaux

Chaque fiche porte son fuseau (`restaurants.timezone`, validé par `is_valid_timezone`). « Ouvert maintenant », les exceptions datées et « Ouvert à 23 h » se calculent à l'heure locale de l'établissement (`localClock`, `open_status()`), changement d'heure compris. Une adresse à La Réunion (`Indian/Reunion`) s'affiche avec ses horaires locaux, quel que soit le fuseau du téléphone.

### 5.8 Déduplication

- Vue `duplicate_candidates` : deux fiches à moins de 50 m avec des noms proches (similarité trigramme > 0,5) ou le même téléphone → tâche « doublon » dans le back-office.
- Garde d'enseigne : deux établissements d'une même marque à moins de 25 m sont refusés (`restaurants_brand_guard`).
- Deux établissements d'une chaîne restent deux fiches physiques, avec coordonnées et horaires propres (cas 4).

---

## 6. Distance ou temps de trajet

### 6.1 Règle

Une distance calculée par YallaYum est **géodésique** et s'affiche « à vol d'oiseau » (`formatDistance` : « 350 m », « 1,2 km »). Un temps de trajet ne s'affiche que s'il vient d'un service de routage, avec son mode (« 9 min à pied »). Jamais de « 7 min à pied » obtenu en divisant une distance par une vitesse.

Aujourd'hui, le prototype affiche la distance et laisse l'application de navigation calculer le trajet (feuille « Y aller avec… »). Le filtre « Rayon » est explicitement à vol d'oiseau.

### 6.2 Proposé : routage en production

| Besoin | Méthode |
|---|---|
| ETA des premiers résultats | Matrice origine → N destinations (N = 20, première page), à pied par défaut ; mise en cache par (cellule d'origine ~100 m, restaurant, mode) pendant 24 h. |
| Filtre « à 15 min à pied » | Isochrone autour de l'origine, puis `ST_Intersects` avec la zone ; isochrone mise en cache par cellule d'origine. |
| Affichage | « 9 min à pied » avec la source dans l'aide ; repli sur la distance si le service ne répond pas en 300 ms. |

| Option | Licence / conditions | Matrice | Isochrones | Piéton à Paris | Coût |
|---|---|---|---|---|---|
| OSRM auto-hébergé | Open source (BSD) ; données OSM (ODbL, attribution) | Oui, très rapide | Pas en natif | Profil piéton basique | Un serveur ; recalcul du graphe à chaque mise à jour OSM |
| Valhalla auto-hébergé | Open source (MIT) ; données OSM | Oui | Oui | Profil piéton fin (escaliers, passages) | Un serveur ; plus gourmand en mémoire qu'OSRM |
| GraphHopper (open source ou service) | Cœur open source (Apache 2) ; service hébergé payant | Oui | Oui | Bon | Auto-hébergé : serveur ; service : à l'usage, tarif à vérifier |
| Mapbox (Matrix, Isochrone) | Propriétaire ; conditions d'usage avec d'autres fonds de carte et de mise en cache à vérifier | Oui | Oui | Bon | À l'usage, tarif à vérifier |
| Google (Routes API) | Propriétaire ; conditions d'affichage liées à Google Maps à vérifier | Oui | Non (pas d'isochrone native) | Très bon | À l'usage, tarif à vérifier |

La qualité piétonne dépend surtout des données : à Paris, OpenStreetMap est très détaillé, ce qui rend les options auto-hébergées crédibles. **Recommandation** : Valhalla auto-hébergé sur l'extrait France d'OpenStreetMap (matrice et isochrones dans un seul service, licence permissive, coût fixe), après un banc d'essai de 200 trajets parisiens comparés à une référence.

---

## 7. Mesurer et régler

### 7.1 Ce qu'on instrumente

| Mesure | Source | Usage |
|---|---|---|
| Latence de recherche p50 / p95 / p99 (serveur et perçue sur l'appareil) | Traces API, horodatage client | Budget p95 à fixer après mesure (`08-architecture.md`) |
| Taux de recherches sans résultat | `search_submitted.results = 0` | Couverture, lexique manquant ; textes gardés 90 jours (`analytics.zero_query_days`) |
| Taux de correction appliquée après zéro résultat | Événement **proposé** `zero_result_fix_applied` | Qualité du diagnostic |
| Taux de clic par position | `restaurant_impression` (consentement) × `restaurant_opened` avec position **proposée** | Biais de position, effet des poids |
| Fiche → intention de visite | `restaurant_opened` → `route_clicked`, `phone_clicked`, `booking_clicked`, `share_clicked` | North Star (`09-mesure.md`) |
| Part d'adresses « à confirmer » dans le top 3 | Journal des réponses (échantillonné, côté serveur) | Garde-fou confiance |
| Compréhension de requête | `understood_place / cuisine / occasion` | Couverture du lexique |

### 7.2 Protocole de réglage des poids

1. **Hypothèse écrite** avant tout test : quel poids, quel effet attendu, sur quelle mesure.
2. **Variante dans `app_config`** (`ranking.weights` et une clé d'expérience), sans redéploiement.
3. **Affectation aléatoire par session** (l'identifiant de session est éphémère ; pas d'identifiant persistant sans consentement). Part exposée limitée (10 à 20 %).
4. **Mesure principale** : intentions de visite par recherche. **Garde-fous** : taux de zéro résultat, distance médiane des fiches ouvertes, part d'« à confirmer » dans le top 3, taux de dépliage de l'info halal, latence p95.
5. **Durée** fixée à l'avance selon l'effet minimal détectable ; pas d'arrêt anticipé au premier écart favorable.
6. **Décision** consignée (journal des réglages) : adoption, rejet ou nouvelle itération.

Règles fixes, hors expérimentation : les filtres restent stricts ; l'emplacement sponsorisé ne change ni de nombre ni de conditions ; aucun poids ne dépend d'un contrat commercial.

---

## Décisions à prendre

1. **Poids initiaux** : garder ceux du prototype pour le lancement, ou les régler d'abord sur un panel de requêtes annotées par l'équipe éditoriale.
2. **Seuil de grappes serveur** (300 points proposés) et **taille N des candidats** classés par l'API (200 proposés), à confirmer par mesure.
3. **Service de routage** : Valhalla auto-hébergé recommandé ; à arbitrer après banc d'essai, ou rester « distance + appli de navigation » au MVP.
4. **Filtre « temps de trajet »** : au MVP (avec routage) ou plus tard (rayon à vol d'oiseau seulement).
5. **Tolérance aux fautes sur les lieux** : index trigramme côté serveur au MVP ou non.
6. **Durées de cache** (5 min / 60 s) et invalidation par version du catalogue.
7. **Position de l'emplacement sponsorisé** (3) et règle « aucun sponsorisé dans une zone de moins de K résultats », K à fixer.
8. **Publication des critères de classement** dans l'aide (obligation de transparence à faire valider juridiquement).
