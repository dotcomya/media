# 04 — Règles métier

Ce document fixe les règles exactes du produit. Chacune est implémentée deux fois, et testée dans les deux : dans le socle TypeScript partagé (`src/domain`, tests `*.test.ts`) et dans la base (`db/schema.sql`, tests `db/tests.sql`). Les valeurs paramétrables vivent dans `app_config` et se règlent depuis le back-office.

## 1. Information halal

### 1.1 Les quatre niveaux

| Niveau | Libellé affiché | Fondé sur | Icône |
|---|---|---|---|
| `certified` | « Certifié par {organisme} » | Une **certification** d'un organisme, certificat contrôlé par l'équipe, en cours de validité | Sceau |
| `team_verified` | « Vérifié par YallaYum » | Une **vérification de l'équipe** : factures et certificats des fournisseurs, visite | Bouclier coché |
| `declared` | « Déclaré par le restaurant » | Une **déclaration** du restaurant (écrite, téléphonique, ou reprise de l'ancienne base), sans justificatif contrôlé | Bulle |
| `unconfirmed` | « Info halal à confirmer » | Aucune déclaration active | Point d'interrogation |

Chaque niveau a une phrase d'explication sans promesse de certitude (`TRUST_LEVELS` dans `halal.ts`), affichée sur la fiche et dans « Comment on vérifie ».

### 1.2 Dérivation (`deriveHalalStatus`, `halal_status`)

Le badge n'est **jamais saisi** : il est recalculé à chaque lecture à partir des déclarations (`halal_claims`).

1. Une déclaration est **active** si : `review_status = approved` ; date de preuve ≤ aujourd'hui (heure locale de l'établissement) ; aujourd'hui ≤ fin de validité.
2. **Fin de validité** :
   - certification : `valid_until` (obligatoire ; une certification sans date de fin n'est jamais affichée) ;
   - vérification de l'équipe : date de preuve + 365 jours (`halal.team_verification_days`) ;
   - déclaration : date de preuve + 365 jours (`halal.declaration_days`) ;
   - si une `valid_until` plus courte est saisie, elle l'emporte.
3. Parmi les déclarations actives, le niveau le plus étayé l'emporte ; à niveau égal, la preuve la plus récente.
4. **Fraîcheur** : « vieillissante » quand 75 % de la validité est écoulée (`halal.aging_ratio`), sinon « fraîche ». Elle pèse dans le classement et déclenche une revérification.
5. Aucune déclaration active → `unconfirmed`.

### 1.3 Expiration

- Le jour qui suit la fin de validité, le badge change **à la lecture**, sans intervention : une certification expirée laisse la place au niveau suivant actif (souvent « vérifié » ou « déclaré »), ou à « à confirmer ».
- La fiche le dit : « Le certificat de l'organisme a expiré le … Le badge a été retiré le jour même ; une nouvelle preuve a été demandée. »
- Le traitement quotidien `expire_halal_claims(today)` trace l'expiration au journal d'audit (niveau avant/après), ouvre une tâche `halal_reverification` de priorité 1 à échéance de 14 jours, et marque la déclaration comme traitée. Il est idempotent (cas de recette 6).

### 1.4 Périmètre, alcool, vérification en cours

- **Périmètre** (`scope`) : « Toute la carte », « Viandes et volailles », « Une partie de la carte », avec une précision publique (« Bœuf et poulet ; certificats des deux fournisseurs contrôlés »).
- **Alcool** : attribut de l'établissement, séparé de la preuve halal : « Non servi (confirmé) », « Servi sur place », « Non renseigné ». Le filtre « Sans alcool servi » n'accepte que « non servi » confirmé.
- **Vérification en cours** (`under_review`) : posée **par l'équipe** sur une déclaration validée ; affiche « Vérification en cours par l'équipe ». Un signalement d'utilisateur ne la déclenche jamais automatiquement.

### 1.5 Signalements

Un signalement sur l'information halal exige une source (« certificat affiché », « échange avec le gérant »…), entre dans la file de modération et ouvre une tâche de vérification. Il n'est jamais affiché publiquement.

### 1.6 Interdits

- Afficher « certifié » sur une simple déclaration du restaurant.
- Créer une certification sans organisme ou sans date de fin (contraintes `certification_has_certifier`, et ignorée par `claim_is_active`).
- Garder un badge dont la preuve a expiré.
- Laisser un paiement (campagne, fidélité) modifier un niveau : les tables commerciales n'ont aucune colonne liée au halal.
- Publier un signalement non vérifié.
- Valider une déclaration sans le droit `halal.review` et une session MFA (trigger `halal_claims_review_guard`).

### 1.7 Filtres

| Filtre | Règle |
|---|---|
| Niveau minimal | Tous / Déclaré ou mieux / Vérifié ou certifié / Certifié uniquement |
| Organisme | Seulement les adresses **certifiées** par cet organisme |
| Sans alcool servi | `alcohol = not_served` |

## 2. Horaires et « ouvert maintenant »

### 2.1 Calcul (`openStatus`, `open_status`)

1. Tout se calcule à l'**heure locale de l'établissement** (`timezone`), changements d'heure compris, pas à celle du téléphone.
2. Une plage dont la fermeture est ≤ à l'ouverture **traverse minuit** et appartient au jour où elle commence : vendredi 18:00 → 02:00 couvre samedi 01:30 (cas de recette 7).
3. Une **exception datée** remplace les plages qui commencent ce jour-là ; elle n'efface pas le débordement de la veille.
4. Des plages contiguës (12:00–15:00 puis 15:00–23:00) annoncent la vraie fermeture (23:00).
5. Une fiche non publiée, fermée définitivement ou déménagée n'est **jamais** « ouverte » (« Fiche indisponible », « Fermé définitivement », « A déménagé ») ; fermée temporairement : « Fermé temporairement jusqu'au 3 nov. ».
6. Sans horaires : état **inconnu** (« Horaires non renseignés »), jamais « ouvert » par défaut.

### 2.2 Confiance

| Confiance | Règle | Affichage |
|---|---|---|
| `confirmed` | Vérifiés il y a 180 jours ou moins (`hours.stale_after_days`) | « Ouvert · jusqu'à 23:00 » |
| `stale` | Plus anciens, ou sans date de vérification | « … · à confirmer » ; « Ils peuvent avoir changé : appelle avant de te déplacer. » |
| `none` | Aucun horaire | « Horaires non renseignés » |

« Ferme bientôt » à moins de 30 minutes (`hours.closing_soon_minutes`). Fermé : prochaine ouverture (« ouvre demain à 12:00 », « ouvre jeudi à 12:00 ») sur 7 jours.

### 2.3 Filtres d'ouverture

- **Ouvert maintenant** : contrainte stricte. Ouvert et confirmé → résultats ; fermé → écarté ; inconnu ou ancien → groupe séparé « N adresses aux horaires non confirmés », replié par défaut.
- **Ouvert à 23 h** (ou « après 23h » dans une requête) : même règle à l'heure demandée. Une heure avant 06:00 vise la nuit qui vient (« ouvert à 1 h » à 21:00 = cette nuit à 01:00).
- Les heures saisies dans une requête (« après 1h30 ») sont reconnues ; « tard », « de nuit » valent 23:00.

## 3. Distances et temps de trajet

- Distance **géodésique** (rayon terrestre 6 371 008,8 m), toujours présentée « à vol d'oiseau », avec son origine : « de toi » (position) ou « du centre » (zone choisie).
- Arrondis : sous 950 m, au multiple de 50 m (50 m minimum) ; sous 9,95 km, au dixième (« 1,2 km ») ; au-delà, au kilomètre.
- **Jamais** de temps de trajet calculé en divisant une distance par une vitesse. Le temps vient d'un service de routage (en production, pour les premiers résultats) ou de l'application de navigation ouverte par « Itinéraire ».
- Filtre « Distance » : rayon à vol d'oiseau autour de l'origine. Un filtre par temps de trajet viendra avec un service d'isochrones.

## 4. Prix

| Niveau | Symbole | Par personne |
|---|---|---|
| 1 | € | moins de 15 € |
| 2 | €€ | 15 à 30 € |
| 3 | €€€ | 30 à 50 € |
| 4 | €€€€ | plus de 50 € |

- Une fourchette (« 32–45 € ») n'est affichée qu'avec sa date d'observation (contrainte `price_dated`).
- Filtre budget : contrainte stricte ; **prix inconnu = écarté**, faute de pouvoir tenir la promesse.
- Requêtes : « pas cher », « petit budget » → €; « moins de 15 € » → niveau calculé ; « €€ » reconnu ; « Paris 15e » reste un arrondissement.
- Menu : lien daté (« consulté le … · les prix peuvent avoir changé ») ; aucun prix inventé.

## 5. Publication et exploitation

### 5.1 Deux statuts indépendants

- **Publication** : `draft`, `in_review`, `published`, `suspended`, `archived`.
- **Exploitation** : `operating`, `temporarily_closed`, `permanently_closed`, `moved` (avec `successor_id`).
- **Visible dans la découverte** = publiée **et** en activité ou fermée temporairement **et** non supprimée (`isDiscoverable`, `is_discoverable`, vue `discoverable_restaurants`). Une fiche fermée définitivement reste accessible par son lien pour l'expliquer (cas 3).

### 5.2 Transitions de publication

| De | Vers | Droit | Motif obligatoire |
|---|---|---|---|
| Brouillon | En relecture | `restaurant.edit` | non |
| Brouillon | Archivée | `restaurant.edit` | oui |
| En relecture | Brouillon | `restaurant.edit` | oui |
| En relecture | Publiée | `restaurant.publish` | non |
| En relecture | Archivée | `restaurant.publish` | oui |
| Publiée | Suspendue | `restaurant.publish` | oui |
| Publiée | Archivée | `restaurant.publish` | oui |
| Suspendue | Publiée | `restaurant.publish` | oui |
| Suspendue | Archivée | `restaurant.publish` | oui |
| Archivée | Brouillon (restauration) | `restaurant.publish` | oui |

- `restaurant.publish` exige une session MFA pour les rôles internes.
- Chaque transition incrémente la version, horodate `published_at` à la première publication et écrit le journal d'audit.
- La base refuse de **créer** une fiche directement publiée : elle naît en brouillon ou en relecture.
- Suppression logique (`deleted_at`) seulement pour une fiche archivée.

### 5.3 Modifications concurrentes

Verrouillage optimiste : chaque fiche porte une `version` ; un enregistrement envoie la version lue. Si elle a changé, rien n'est écrasé : les champs modifiés d'un seul côté sont fusionnés, les champs modifiés des deux côtés sont présentés à arbitrer (`saveVersioned`, `threeWayMerge` ; en base `UPDATE … WHERE version = n` renvoie 0 ligne ; en API `If-Match` → 412). Cas de recette 11.

## 6. Contributions et modération

| Statut | Suivants possibles |
|---|---|
| Reçu | En cours d'examen, Déjà signalé, Non retenu |
| En cours d'examen | Précisions demandées, Pris en compte, Non retenu, Déjà signalé |
| Précisions demandées | En cours d'examen, Non retenu |
| Pris en compte, Non retenu, Déjà signalé | — (finaux) |

- « Non retenu » et « Précisions demandées » exigent un motif.
- **Aucune contribution ne modifie une fiche publiée.** Acceptée, elle devient une **proposition** (`change_proposals`, statut `pending`) appliquée au brouillon de modifications, puis publiée par un rôle autorisé. Si elle touche au halal, seul un vérificateur peut l'appliquer (`requires = halal.review`). Cas 12.
- Validation à l'envoi : nom et adresse pour une nouvelle adresse ; une fiche visée pour un signalement ; message ≤ 2 000 caractères ; refus au-delà de deux liens ; source exigée pour un signalement halal.
- Contribution possible sans compte ; avec un compte, la personne suit le statut. À la suppression du compte, ses contributions sont anonymisées.

## 7. Favoris, carnet, compte

- **Invité** : favoris et carnet stockés sur le téléphone ; la personne est prévenue qu'ils disparaissent avec l'application.
- **Connexion** : fusion par union des favoris locaux et du compte (`POST /v1/me/favorites:merge`), idempotente ; les fiches devenues indisponibles ne sont pas ajoutées et sont comptées à part.
- Synchronisation proposée (règle de production) : chaque favori porte une date ; un retrait laisse une trace de suppression pendant 30 jours pour qu'un autre appareil ne le recrée pas.
- Le carnet (« J'y suis allé·e ») est déclaratif et local par défaut ; il ne sert à aucune mesure de visite.

## 8. Fidélité (module à auditer)

### 8.1 Trois flux possibles

| | A — Le client scanne un QR fixe du restaurant | B — Le commerçant scanne un QR tournant du client | C — Le terminal du commerçant affiche un QR à usage unique, le client le scanne |
|---|---|---|---|
| Existant | Oui (« Scanne le QR code chez ton restaurateur ») | — | — |
| Fraude | **Élevée** : le QR fixe se photographie et se partage ; crédit possible depuis chez soi. Parade = position précise au moment du scan (donnée sensible) | **Faible** : jeton signé valable 30 s, rejeu détecté ; reste la collusion commerçant-client, bornée par plafonds et contrôles | **Faible** : jeton unique lié à une transaction ; collusion possible de même |
| Friction en caisse | Faible pour le commerçant, moyenne pour le client (ouvrir l'app, scanner) | Le client montre son téléphone ; le commerçant scanne avec **son** téléphone (application restaurateur) | Le commerçant saisit le montant et affiche un code ; le client scanne |
| Équipement | Un QR imprimé | Un téléphone dans le restaurant | Un téléphone ou une tablette tournée vers le client |
| Montant de l'addition | Déclaratif client | Saisi par le commerçant si la règle le demande | Saisi par le commerçant |
| Hors ligne | Client hors ligne bloqué | QR généré hors ligne côté client ; validation en ligne côté commerçant | Terminal en ligne requis |
| Coût | Nul | Application restaurateur (déjà prévue au back-office) | Idem + écran face client |

**Flux retenu : B.** C'est le seul qui ne demande pas la position du client, qui reste utilisable si le client est hors ligne, et où le commerçant (qui finance tout ou partie des récompenses) contrôle chaque crédit. Le flux A est abandonné. Le flux C reste une option pour les restaurants équipés d'une caisse connectée, à étudier avec les partenaires.

### 8.2 Anti-fraude (`loyalty.ts`, tables `loyalty_*`)

- **Jeton** : `YY1.<carte>.<pas de temps>.<signature>`, pas de 30 s (`qr_step_seconds`), un pas de retard toléré (`qr_skew_steps`), un pas d'avance au plus. Signature HMAC-SHA256 côté serveur avec un secret par carte (référencé dans le coffre, `loyalty_cards.secret_ref`) ; le signataire du prototype est explicitement non cryptographique.
- **Idempotence** : clé `earn:<partenaire>:<jeton>` unique (`loyalty_transactions.idempotency_key`) et en-tête `Idempotency-Key` sur l'API. Rescanner le même code renvoie la transaction d'origine, sans second crédit (cas 14).
- **Délai entre deux passages** d'une même carte chez un même partenaire (`cooldown_minutes`) et **plafond quotidien** (`daily_cap_per_partner`).
- **Refus tracés** : chaque tentative, acceptée ou non, va dans `loyalty_scan_attempts` ; la vue `loyalty_suspicions` signale 3 refus ou plus en 24 h pour une même carte et un même partenaire.
- **Grand livre en ajout seul** : aucune mise à jour ni suppression (triggers) ; une correction est une **annulation** (`reversal`) qui reprend exactement la transaction, une seule fois (index unique), avec motif ; une annulation ne s'annule pas.
- **Droits** : un restaurateur ne crédite que pour ses partenaires et ne voit que leurs transactions (sécurité au niveau des lignes, cas 13) ; seuls les rôles `loyalty.adjust` (MFA) annulent.
- **Litiges** (`disputes`) ouverts par le client, le partenaire ou YallaYum ; la rétrofacturation entre YallaYum et un partenaire passe par une annulation et une écriture de facturation hors grand livre de points, selon le contrat.

### 8.3 Règles paramétrables, aucune valeur acquise

| Paramètre | Options | Démo (`DEMO_PROGRAM`, provisoire) |
|---|---|---|
| Statut | désactivé, pilote, en service (« en service » interdit tant que `provisional`) | pilote |
| Gain | par visite (N points) ou par montant (points par euro, montant minimal) | 10 points par visite |
| Délai entre deux passages | minutes | 120 |
| Plafond | passages par carte, par partenaire et par jour | 1 |
| Récompenses | seuil, libellé, financeur (partenaire, YallaYum, partagé), validité du bon | 50 : boisson ; 100 : dessert ; 30 jours |

Un seul programme actif à la fois. Taux, seuils, financement, expiration des points et éventuelle valeur monétaire sont à fixer avec le fondateur et les partenaires ; ils ne doivent apparaître aux utilisateurs qu'une fois validés.

### 8.4 États de la carte

| État | Affichage |
|---|---|
| Programme désactivé | Onglet Avantages : « Bientôt », sans promesse |
| Invité | Explication + « Créer un compte et activer » |
| Activée, aucun point | Carte, QR, « Aucun point pour l'instant » |
| Synchronisation | « Synchronisation avec la caisse… » |
| Crédité | « +10 points chez … » |
| Déjà enregistré | « Ce code a déjà été scanné : aucun point en double » |
| Refusé | Motif : QR expiré, code non reconnu, passage récent, plafond, partenaire inactif, montant requis ou trop bas |
| Partenaire absent | « Ce restaurant n'est pas (ou plus) partenaire » |
| Récompense disponible / expirée / utilisée | Bon avec date de fin |
| Transaction annulée | Ligne « Annulation » au solde |
| Compte supprimé | Carte désactivée, QR refusé ; transactions conservées, détachées |

## 9. Mise en avant sponsorisée

- Table séparée (`sponsored_campaigns`) : dates, référence de contrat, libellé imposé « Sponsorisé » (contrainte), aucune colonne halal.
- **Un seul emplacement par page**, à la 3e position (`ranking.sponsored_slot`), uniquement en tri « Pertinence ».
- La fiche sponsorisée doit **déjà** respecter tous les filtres et être dans la zone ; sinon rien n'est inséré (cas 18).
- Elle est **déplacée**, pas dupliquée, et marquée « Sponsorisé » dans la liste, le carrousel et la fiche ; point ambre sur son marqueur.
- Si elle se classe déjà au-dessus de l'emplacement, elle reste à sa place organique (le paiement n'a pas joué) mais garde la mention « Sponsorisé » : la relation commerciale est toujours visible.
- Jamais dans les sélections éditoriales (« Aucune adresse n'a payé pour y figurer »).
- « Pourquoi ce résultat ? » précise que le paiement ne fait pas partie du score.

## 10. Classement (résumé)

Score = somme pondérée de sept signaux entre 0 et 1 : correspondance du texte (3), proximité (2, échelle 1 200 m), adéquation à l'envie (1,2), ouverture (1), complétude de la fiche (0,8), fraîcheur de la preuve halal (0,8), choix de la rédaction (0,5). Départage stable par identifiant. Détail et justification : [06-recherche-classement](06-recherche-classement.md).

## 11. Confidentialité

- Position demandée **à l'usage** (« Autour de moi », « Utiliser ma position »), jamais en arrière-plan, jamais stockée côté serveur ; elle quitte le téléphone uniquement en tranche (« moins de 500 m ») dans la mesure d'audience.
- Aucun compte pour explorer ; compte minimal (e-mail ou fournisseur, nom affiché facultatif, langue) ; ni religion, ni âge, ni genre.
- Préférences saisies explicitement, jamais déduites.
- Historique de recherche gardé sur le téléphone, effaçable en un geste ; côté serveur seulement avec consentement (`search_history`).
- Consentements enregistrés avec finalité, base légale et version du texte (`consents`).
- Suppression de compte : effacement, anonymisation des contributions, conservation détachée des transactions de fidélité ([05-donnees](05-donnees.md) § 7, cas 15).

## Décisions à prendre

1. Flux de fidélité B confirmé avec 2 ou 3 restaurants pilotes (test en caisse réel) ; option C pour les caisses connectées.
2. Valeurs du programme : mode de gain, taux, seuils, financeur, expiration des points.
3. Durées de validité des preuves (365 jours proposés pour l'équipe et les déclarations) : les garder courtes est honnête mais coûteux en revérifications.
4. Fiche sponsorisée classée organiquement au-dessus de l'emplacement : le prototype l'étiquette « Sponsorisé » partout (choix le plus prudent). Faire confirmer par un juriste au regard du Code de la consommation (art. L111-7) qu'une mention distincte (« Annonceur ») n'est pas préférable.
5. Historique de recherche local activé par défaut : à confirmer avec le DPO (fonction demandée par l'utilisateur, stockée sur le terminal).
