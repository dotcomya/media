# YallaYum — le GPS de la restauration halal

Refonte complète de YallaYum : un prototype mobile interactif, un back-office, le socle métier testé, le schéma de base de données, le contrat d'API, la recette et le dossier produit. La promesse ne change pas : trouver vite un restaurant halal qui correspond à l'envie, au budget, à l'endroit et à l'occasion, avec une information assez fiable pour décider et partir.

> **Données de démonstration.** Établissements, organismes de certification et numéros de téléphone sont fictifs (numéros de la plage 01 99 00 réservée par l'ARCEP à la fiction). Les rues, quartiers et communes sont réels pour que la carte ait du sens. Les visuels sont des illustrations génératives, toujours étiquetées « Illustration ».

## Ce qu'il y a dedans

| Dossier | Contenu |
|---|---|
| `src/domain/` | Socle métier en TypeScript pur : niveaux de preuve halal, horaires (fuseau, minuit, exceptions), compréhension des requêtes, filtres stricts et diagnostic des recherches vides, classement explicable, emplacement sponsorisé, fidélité idempotente, modération, publication, conflits de version, rôles, liens profonds, mesure d'audience, suppression de compte. Réutilisable tel quel par l'app native, l'API et le back-office. |
| `src/app/` | Prototype mobile (Preact) : Explorer (carte, recherche, filtres, feuille à trois hauteurs, carrousel, fiche), Collections, Avantages (carte de fidélité), Profil, banc d'essai. |
| `src/admin/` | Back-office : tableau de bord, fiches, vérification halal, contributions, import, contenus, fidélité, journal d'audit, accès. |
| `src/map/` | Style de carte YallaYum (jour et nuit) sur le schéma OpenMapTiles, sources de tuiles en ligne ou embarquées. |
| `src/data/demo.ts` | Une cinquantaine d'adresses fictives qui couvrent tous les cas limites (chaîne à deux adresses, fermeture définitive, déménagement, certification expirée, horaires de nuit, horaires inconnus, sponsorisé…). |
| `db/` | Schéma PostgreSQL 16 + PostGIS, taxonomies initiales, tests SQL, plan de reprise des 1 000+ fiches (`MIGRATION.md`). |
| `api/openapi.yaml` | Contrat de l'API publique et de l'API d'administration (OpenAPI 3.1). |
| `e2e/` | Recette de bout en bout (Playwright) et scripts de captures. |
| `docs/` | Dossier produit en 12 parties (ci-dessous). |
| `ci/` | Intégration continue proposée, à copier dans `.github/workflows/`. |

## Le dossier produit

1. [Produit : audit, positionnement, personas](docs/01-produit.md)
2. [Marque et direction visuelle](docs/02-marque-et-direction.md)
3. [Parcours, écrans et micro-interactions](docs/03-parcours-et-ecrans.md)
4. [Règles métier](docs/04-regles-metier.md)
5. [Modèle de données](docs/05-donnees.md)
6. [Recherche et classement](docs/06-recherche-classement.md)
7. [Back-office](docs/07-back-office.md)
8. [Architecture technique](docs/08-architecture.md)
9. [Mesure et indicateurs](docs/09-mesure.md)
10. [Modèle économique](docs/10-modele-economique.md)
11. [Recette et qualité](docs/11-recette.md)
12. [Feuille de route et livrables](docs/12-feuille-de-route.md)

## Lancer

Node 22.12 ou plus récent.

```bash
npm install
npm run dev            # http://localhost:5173 (app) et /admin.html (back-office)
npm test               # 68 tests du socle métier
npm run test:sql       # 104 vérifications sur un PostgreSQL 16 + PostGIS jetable
npm run tiles          # télécharge et filtre les tuiles de démonstration (une fois)
npm run test:e2e       # 16 scénarios de bout en bout (Playwright requis)
npm run build          # app + back-office dans dist/
npm run build:artifact # une seule page HTML, carte embarquée : dist-artifact/yallayum.html
```

En développement, la carte charge les tuiles d'OpenFreeMap en direct. La version artefact embarque des tuiles filtrées de Paris et de la proche couronne (55 Mo à l'origine, 3,3 Mo une fois filtrées et compressées) : elle fonctionne sans serveur de tuiles. Dans l'app, Profil → « Banc d'essai » simule l'heure (samedi 00:30…), la position (refusée, imprécise…), le réseau coupé, le texte à 200 %, les passages en caisse, et affiche le journal des événements de mesure.

## Ce qui est réel et ce qui est simulé

| Réel | Simulé |
|---|---|
| Règles métier, classement, compréhension des requêtes, horaires, niveaux halal, fidélité (calcul et anti-fraude) | Le serveur : la recherche tourne dans le navigateur sur le jeu de démonstration |
| Carte, tuiles, style, grappes, marqueurs | La position, par défaut dans l'artefact (le cadre d'hébergement refuse la géolocalisation) |
| Schéma SQL et ses tests, contrat d'API | La connexion au compte (Apple, Google, lien par e-mail) |
| Recette automatisée | La signature des QR de fidélité (FNV-1a de démonstration ; HMAC-SHA256 côté serveur en production) |
| Contrastes, grande police, mode sombre, mouvement réduit | Les photos (illustrations génératives étiquetées) |

## Crédits

Carte : [OpenFreeMap](https://openfreemap.org), © [OpenMapTiles](https://www.openmaptiles.org/), données © [contributeurs OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL). Rendu : [MapLibre GL JS](https://maplibre.org). Polices : Bricolage Grotesque et Kaushan Script (Google Fonts, licence OFL), Noto Sans pour la carte.
