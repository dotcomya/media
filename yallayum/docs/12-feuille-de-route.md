# 12 — Feuille de route et livrables

Ce document dit ce qui est livré dans ce dépôt, ce qui reste à produire avant une mise en production, et dans quel ordre. Les durées sont des estimations à affiner avec l'équipe réelle ; elles ne sont pas des engagements.

## 1. Ce qui est livré ici

| Livrable | Emplacement | Nature | Ce qu'il prouve |
|---|---|---|---|
| Prototype mobile interactif | `src/app`, `index.html` ; artefact en fichier unique (`npm run build:artifact`) | Réel dans le navigateur, données fictives | Le parcours chercher → sélectionner → vérifier → partir, la carte d'abord, la feuille à trois hauteurs, la recherche comprise, les niveaux halal, les états d'erreur |
| Back-office | `src/admin`, `admin.html` (ou `#admin` dans l'artefact) | Réel dans le navigateur, stockage local | Les workflows : vérification halal, modération, conflits de version, import, rôles |
| Socle métier partagé | `src/domain` | Code de production, testé (68 tests) | Les règles exactes, réutilisables telles quelles par l'app native, l'API et le back-office |
| Schéma de données | `db/schema.sql`, `db/seed-taxonomy.sql` | Code de production, testé sur PostgreSQL 16 + PostGIS (104 vérifications) | Contraintes, sécurité par ligne, fonctions d'ouverture et de niveau halal, idempotence de la fidélité |
| Plan de reprise des 1 000+ fiches | `db/MIGRATION.md` | Procédure | Format, géocodage, déduplication, correspondance des anciens badges |
| Contrat d'API | `api/openapi.yaml` | Spécification OpenAPI 3.1 | Les échanges app ↔ serveur et back-office ↔ serveur |
| Recette | `e2e/run.mjs`, `docs/11-recette.md`, `ci/github-actions.yml` | 16 scénarios de bout en bout, intégration continue proposée | Les 18 cas limites du cahier des charges |
| Dossier produit | `docs/01` à `docs/12` | Décisions argumentées | Produit, marque, parcours, règles, données, classement, back-office, architecture, mesure, modèle économique |

Ce qui **n'est pas** livré et ne doit pas être présenté comme fait : les applications natives iOS et Android, le serveur d'API, l'hébergement, le fichier Figma, les photos, les contrats partenaires, l'audit de la carte de fidélité actuelle et la revérification des fiches historiques.

## 2. Ordre de marche proposé

Le principe : on ne publie rien de neuf tant que la confiance n'est pas réparée. La revérification du catalogue commence dès la semaine 1, en parallèle du développement.

| Phase | Contenu | Sortie (critère de passage) | Estimation |
|---|---|---|---|
| 0. Cadrage | Audit technique de l'app actuelle et de la carte de fidélité ; export de la base ; décisions ouvertes des docs 01 à 12 ; AIPD avec un DPO ; correction des textes App Store (« n°1 », « certifiées », étiquette de confidentialité) | Décisions signées, export propre de la base historique | 2 à 3 semaines |
| 1. Socle et catalogue | API sur le socle `src/domain` ; base de production ; back-office branché ; import des fiches historiques en brouillon (`db/MIGRATION.md`) ; **campagne de revérification** priorisée par trafic | 300 fiches revérifiées et publiées sur la zone de lancement | 6 à 8 semaines |
| 2. App mobile, MVP | Explorer (carte, recherche, filtres, fiche, itinéraire), favoris invité, contributions, liens profonds, mesure d'audience exemptée ; React Native + Expo d'après [08](08-architecture.md) | Bêta TestFlight et test interne Google Play, recette de [11](11-recette.md) passée | 8 à 10 semaines, en partie en parallèle de la phase 1 |
| 3. Lancement Paris et proche couronne | Collections éditoriales reliées à la carte, compte et synchronisation, campagne d'acquisition sobre | North Star mesurée sur 4 semaines, taux de recherches sans résultat sous un seuil fixé | 4 semaines |
| 4. Fidélité pilote | 2 ou 3 restaurants, flux « le commerçant scanne la carte du client », paramètres contractualisés | Aucun double crédit, coûts de récompense connus, décision continuer / arrêter | 8 semaines |
| 5. Extension | Villes suivantes selon la couverture vérifiée, espace restaurateur, offres aux restaurateurs ([10](10-modele-economique.md)) | Seuils du doc 10 atteints | Continu |

## 3. Équipe minimale

| Rôle | Charge | Pourquoi |
|---|---|---|
| Produit (le fondateur) | Plein temps | Décisions, partenaires, ton |
| Développeur mobile React Native | Plein temps | App iOS et Android |
| Développeur back-end TypeScript | Plein temps phases 1–3 | API, base, back-office |
| Vérification et éditorial | 1 à 2 personnes | La revérification est le principal coût et le principal actif ([10](10-modele-economique.md) § 2) |
| Design produit | Mi-temps phases 0–2 | Fichier Figma à partir des jetons et composants existants ([02](02-marque-et-direction.md), [03](03-parcours-et-ecrans.md)) |
| DPO ou juriste | Ponctuel | AIPD, mentions, sponsorisé, contrats fidélité |

## 4. Risques de calendrier

| Risque | Effet | Parade |
|---|---|---|
| La revérification prend plus longtemps que prévu | Lancement avec trop de fiches « à confirmer » | Lancer sur une zone plus petite mais propre ; afficher honnêtement les niveaux |
| L'app actuelle a des utilisateurs à ne pas perdre | Rupture de favoris, de points | Migration des comptes et des points avant la bascule ; message dans l'ancienne app |
| La carte de fidélité actuelle a des engagements en cours | Litiges | Audit en phase 0, honorer l'existant avant de changer de règles |
| Coût du fournisseur de carte | Dépenses variables | Tuiles auto-hébergées (PMTiles) prévues dès l'architecture |

## 5. Prochaines actions concrètes

1. Partager l'artefact du prototype avec 5 personnes du cœur de cible et observer, sans aider, le parcours « un date à Paris 11e ouvert maintenant ».
2. Exporter la base historique et lancer le contrôle à blanc de `db/MIGRATION.md` pour mesurer : doublons, coordonnées douteuses, part des fiches sans preuve halal.
3. Trancher les décisions ouvertes en tête de liste : flux de fidélité, durée de validité des preuves, zone de lancement, fournisseur de carte.

## Décisions à prendre

1. Zone de lancement (Paris intra-muros seul, ou avec la proche couronne).
2. Calendrier de bascule de l'app actuelle vers la nouvelle.
3. Budget et recrutement de l'équipe de vérification.
4. Maintien ou pause de la carte de fidélité actuelle pendant l'audit.
