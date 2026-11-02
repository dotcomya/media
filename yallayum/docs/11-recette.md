# 11 — Recette et qualité

Ce document dit, pour chacun des 18 cas limites du cahier des charges, où il est vérifié automatiquement et ce qui reste à vérifier à la main sur un vrai téléphone. Il décrit ensuite la stratégie de tests et la chaîne d'intégration continue proposée.

## 1. Les trois niveaux de tests qui existent déjà

| Niveau | Où | Commande | État au moment de la livraison |
|---|---|---|---|
| Socle métier (TypeScript, sans navigateur) | `src/domain/*.test.ts`, dont `recette.test.ts` rédigé « Étant donné / Quand / Alors » | `npm test` | 68 tests, tous verts |
| Base de données (PostgreSQL 16 + PostGIS réels) | `db/tests.sql`, lancé par `db/run-tests.sh` sur un cluster jetable | `npm run test:sql` | 104 vérifications, toutes vertes |
| Bout en bout (Chromium mobile 390 × 844, tactile, fr-FR, Europe/Paris) | `e2e/run.mjs`, un scénario par cas d'interface | `npm run test:e2e` (ou `-- 7 17` pour quelques cas) | 16 scénarios, tous verts |

Les trois niveaux testent la **même règle** à des endroits différents : par exemple « ouvert de 18:00 à 02:00 » est vérifié dans la fonction `openStatus`, dans la fonction SQL `open_status()` et dans l'écran, avec le filtre « Ouvert maintenant » à samedi 00:30. Une divergence entre l'application et la base se voit donc tout de suite.

## 2. Les 18 cas, un par un

Légende : **U** test unitaire du socle (`src/domain`), **S** test SQL (`db/tests.sql`), **E** scénario de bout en bout (`e2e/run.mjs`, numéro du cas), **M** test manuel restant.

| # | Cas | Étant donné / Quand / Alors (résumé) | U | S | E | Reste à faire à la main |
|---|---|---|---|---|---|---|
| 1 | GPS refusé | Position refusée → un message non bloquant propose une ville → « Paris 11e » affiche des adresses, sans compte | ✓ | — | ✓ | Refus réel sur iOS (« Ne pas autoriser ») et Android (« Refuser » puis « Ne plus demander ») ; réglage « Position approximative » d'iOS |
| 2 | Zéro résultat | Lyon : « Pas encore d'adresse référencée ici », aucun marqueur ; filtres contradictoires : corrections chiffrées, et le chiffre annoncé est exactement celui obtenu | ✓ | ✓ | ✓ | — |
| 3 | Fermé définitivement | Absent des résultats et des suggestions ; jamais « ouvert » ; son lien explique la fermeture et propose des adresses proches | ✓ | ✓ | ✓ | — |
| 4 | Deux adresses d'une chaîne | Deux fiches physiques, adresses et horaires propres ; l'une ouverte à 23:30, l'autre non | ✓ | ✓ | ✓ | — |
| 5 | Halal non documenté | Aucune preuve validée → « Info halal à confirmer », jamais « certifié » ; une certification sans date de fin n'est pas affichée | ✓ | ✓ | ✓ | — |
| 6 | Certification expirée | Le lendemain de l'échéance : niveau suivant affiché, expiration dite, filtre « Certifié » qui l'écarte ; côté base, journal d'audit et tâche de revérification, traitement idempotent | ✓ | ✓ | ✓ | Vérifier l'ordonnanceur du contrôle quotidien en préproduction |
| 7 | Horaires 18:00 → 02:00 | Samedi 00:30 : ouvert jusqu'à 02:00 ; 02:00 : fermé ; aucun résultat fermé ou inconnu présenté comme ouvert | ✓ | ✓ | ✓ | Nuits de changement d'heure (fin mars, fin octobre) sur appareil |
| 8 | Retour de fiche | Même centre, même zoom, mêmes filtres, même sélection, même hauteur de feuille | — | — | ✓ | Retour système Android et geste de bord iOS |
| 9 | Marqueur et liste | Carrousel dans l'ordre de la liste ; faire défiler change la sélection et la pastille ; ordre stable à score égal | ✓ | — | ✓ | — |
| 10 | Réseau perdu | Bannière « résultats en cache, peut-être anciens », résultats conservés, message clair à la recherche | — | — | ✓ | Mode avion réel, réseau 3G lent, tuiles de carte hors cache |
| 11 | Modifications concurrentes | Même champ : conflit détecté, rien d'écrasé ; champs différents : fusion proposée qui garde les deux | ✓ | ✓ | — | Scénario dans le back-office à deux onglets (voir [07](07-back-office.md)) |
| 12 | Contribution | Accusé de réception, fiche publique inchangée, statut « Reçu » ; acceptée, elle devient une proposition ; si elle touche au halal, seul un vérificateur peut l'appliquer | ✓ | ✓ | ✓ | — |
| 13 | Restaurateur | Il ne lit et ne propose que pour ses établissements ; il ne voit que ses transactions ; il ne publie rien | ✓ | ✓ (RLS) | — | Vue restaurateur du back-office |
| 14 | Scan répété | Même QR deux fois : une seule transaction, « Déjà enregistré » ; QR périmé ou falsifié refusé ; nouveau QR deux minutes après : refus « cooldown », tracé | ✓ | ✓ | ✓ | Test en caisse réelle chez un partenaire pilote (luminosité, écran fissuré, réseau du restaurant) |
| 15 | Suppression de compte | Profil, favoris, historique supprimés ; contributions anonymisées ; transactions conservées sous identifiant aléatoire avec durée et motif ; confirmation explicite | ✓ | ✓ | ✓ | Validation des durées par le DPO |
| 16 | Handicap visuel, grande police | Texte à 200 % : aucun débordement horizontal, chaque bouton nommé, l'itinéraire visible ; focus piégé dans les feuilles modales et rendu à la fermeture | — | — | ✓ | VoiceOver et TalkBack de bout en bout (ordre de lecture carte → feuille, annonce de la sélection du carrousel), Contrôle de sélection iOS, clavier physique |
| 17 | Lien profond | Fiche ; ancien lien → fiche actuelle ; déménagement → nouvelle adresse annoncée ; introuvable → page utile avec recherche | ✓ | ✓ | ✓ | Universal Links / App Links installée vs non installée, lien différé après installation |
| 18 | Sponsorisé | Une seule insertion en 3e position, marquée ; niveau halal inchangé ; écartée par un filtre qu'elle ne remplit pas ; étiquetée même quand elle se classe seule plus haut | ✓ | ✓ | ✓ | Relecture juridique de la mention (art. L111-7 du Code de la consommation) |

## 3. Ce que les tests automatiques ne prouvent pas

- **Le rendu sur de vrais téléphones.** Les scénarios tournent dans Chromium en émulation mobile. Il faut une passe sur iPhone (Safari et l'app native), sur un Android milieu de gamme et sur un petit écran (iPhone SE, 375 px).
- **Les performances.** Aucun temps n'est garanti tant qu'il n'a pas été mesuré (voir [08](08-architecture.md) § 7) : démarrage à froid, première carte utilisable, réponse de recherche au 95e centile, défilement à 60 images par seconde avec 300 marqueurs.
- **La justesse des données.** Les tests vérifient les règles, pas le catalogue. La recette du catalogue est un contrôle éditorial : échantillon de 50 fiches tirées au hasard chaque mois, appelées ou visitées, avec taux d'erreur suivi (horaires, adresse, information halal).
- **La compréhension des niveaux halal.** À tester avec de vraies personnes (cinq à huit par profil, dont des personnes aux critères stricts) : savent-elles dire, sans aide, la différence entre « certifié », « vérifié », « déclaré » et « à confirmer » ?

## 4. Protocole de test manuel sur appareil

Chaque version candidate passe ces parcours, chronométrés, sur iPhone et Android :

1. Premier lancement hors ligne, puis en ligne, position refusée, puis accordée.
2. « Un date à Paris 11e, ouvert maintenant » : de l'ouverture de l'app au lancement de l'itinéraire. Cible : moins de 30 secondes et moins de 8 gestes ; la cible se confirme en test utilisateur.
3. Sélection au doigt de 10 marqueurs à zoom 14, sans erreur de cible.
4. Feuille de résultats : 20 manipulations rapides (lancers, arrêts à mi-course) sans saccade ni état bloqué.
5. Ouvrir une fiche par lien partagé, depuis Messages, WhatsApp et Instagram, app installée puis désinstallée.
6. Fidélité : 10 passages en caisse chez un partenaire pilote, dont un double scan volontaire et une annulation.
7. Lecteur d'écran : parcours 2 complet à l'oreille ; police système au maximum ; mode sombre ; mouvement réduit.

## 5. Intégration continue proposée

Un exemple prêt à l'emploi est fourni dans `ci/github-actions.yml`. Il n'est pas activé : il faut le copier dans `.github/workflows/` du dépôt qui hébergera le projet. Étapes :

1. `npm ci`, vérification des types (`tsc --noEmit`), tests du socle (`npm test`).
2. Tests SQL sur un service PostGIS (`postgis/postgis:16-3.4`).
3. Tuiles de démonstration depuis le cache de l'intégration continue, puis scénarios de bout en bout (Playwright).
4. Construction de l'application, du back-office et de l'artefact en fichier unique ; captures d'écran archivées.

En production, s'y ajoutent : analyse statique et audit des dépendances, tests de l'API contre `api/openapi.yaml`, construction des apps natives (EAS ou Fastlane), distribution TestFlight et piste de test interne Google Play, suivi des plantages, et un tableau « sessions sans plantage » comme critère de passage en production.

## 6. Critères de passage en production (proposés)

- Les trois niveaux de tests verts sur la version candidate.
- Les 18 cas du tableau, colonne « Reste à faire à la main », passés sur appareil et consignés.
- Aucune anomalie bloquante ouverte sur l'information halal, les horaires ou la fidélité.
- Taux de sessions sans plantage mesuré en bêta, au-dessus d'un seuil fixé avant la bêta.
- Contrastes AA vérifiés sur appareil, en plein jour.

## Décisions à prendre

1. Liste des appareils de référence (au moins un iPhone récent, un iPhone SE, un Android milieu de gamme de moins de 250 €).
2. Seuil de sessions sans plantage exigé avant le lancement.
3. Fréquence et taille de l'échantillon de contrôle éditorial du catalogue.
4. Panel de test des niveaux halal : recrutement et rémunération.
