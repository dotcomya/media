# Veilleuse

PWA de suivi d'un nouveau-né, pensée pour une maman épuisée, la nuit, d'une
seule main. Une seule page, centrée sur la journée : ce qui s'est passé
aujourd'hui, et quatre étiquettes à cocher (Tétée, Biberon, Pipi, Caca). Aucun
compte, aucun serveur, tout reste sur le téléphone et fonctionne en mode avion.

**En ligne : https://dotcomya.github.io/media/** (GitHub Pages, branche `gh-pages`).

| Aujourd'hui | Cocher puis valider | Un jour passé | Corriger |
|---|---|---|---|
| ![Aujourd'hui](docs/aujourdhui.png) | ![Cocher puis valider](docs/cocher.png) | ![Hier](docs/hier.png) | ![Corriger](docs/corriger.png) |

## Ce que fait l'app

- **Une page = un jour.** En haut, le jour affiché (« Aujourd'hui · vendredi
  23 octobre ») et le bandeau des jours : un appui sur une date, ou un balayage
  sur la liste, pour passer aux jours précédents. Un point sous la date indique
  qu'il y a des saisies ce jour-là.
- **Résumé du jour** : « 6 tétées · 2 biberons · 5 pipis · 2 cacas ».
- **Liste du jour**, de la plus récente à la plus ancienne : l'heure et les
  étiquettes. À partir de 9 saisies, elle passe sur deux colonnes compactes
  (icônes seules, légende dans le résumé) pour que la journée tienne sans
  défiler.
- **Saisir** (aujourd'hui, en bas de l'écran) : on coche ce qui vient de se
  passer, puis **Valider** crée une saisie horodatée. Pipi et caca en même
  temps : on coche les deux. Chaque étiquette rappelle la dernière fois
  (« il y a 2 h 10 »).

| Action | Pressions |
|---|---|
| Une chose (ex. pipi) | 2 : Pipi → Valider |
| Plusieurs (ex. tétée + pipi + caca) | une par étiquette, puis Valider |
| Annuler la dernière saisie | 1 : « Annuler » dans le message affiché 5 s |
| Corriger ou supprimer | toucher la ligne → décocher / « −15 min »… → Enregistrer |

- **Correction** : l'heure se règle par puces (« Maintenant », « −5 min »,
  « −15 min », « −30 min », « −1 h », cumulables), avec la roue native du
  téléphone en dernier recours (« Choisir… »). Un oubli se saisit maintenant,
  puis on recule l'heure.
- **Partager** (en haut) : résumé texte du jour affiché, via la feuille de
  partage du téléphone, pour le pédiatre ou la sage-femme. Export CSV de toutes
  les données dans Réglages (séparateur `;`, s'ouvre directement dans Excel en
  français).
- Mode sombre chaud par défaut, mode clair dans Réglages ; prénom du bébé
  facultatif ; vibration à chaque saisie sur Android (Safari iOS ne la gère pas).

## Lancer en local

Prérequis : Node.js 22.12 ou plus.

```bash
cd veilleuse
npm install
npm run dev        # serveur de développement : http://localhost:5173
npm test           # tests unitaires (résumé journalier, conversion des données, formats)
npm run build      # vérification TypeScript + build de production dans dist/
npm run preview    # sert dist/ : http://localhost:4173 (service worker actif)
```

Le service worker n'est enregistré qu'en production : testez le mode hors
ligne avec `npm run build && npm run preview`.

`npm run icons` régénère les icônes et les écrans de lancement iOS
(`scripts/icons.mjs`, sans dépendance).

## Déployer

L'app est un site statique (`dist/`). Elle se trouve dans le sous-dossier
`veilleuse/` du dépôt : c'est le seul réglage à indiquer à l'hébergeur.

### GitHub Pages (version en ligne actuelle)

La branche `gh-pages` contient uniquement le contenu de `dist/`. Pour publier
une nouvelle version :

```bash
cd veilleuse
npm run build
touch dist/.nojekyll
cd dist && git init -b gh-pages && git add -A && git commit -m "Publie Veilleuse"
git push -f https://github.com/dotcomya/media gh-pages
rm -rf .git
```

Garder la même adresse : les données sont liées à l'origine du site, en changer
reviendrait à repartir d'un historique vide.

### Netlify

- **Depuis l'interface** : *Add new site → Import an existing project*,
  choisir le dépôt, puis **Base directory : `veilleuse`**. La commande et le
  dossier de publication sont lus dans `netlify.toml`.
- **En ligne de commande** :
  ```bash
  cd veilleuse
  npm run build
  npx -p netlify-cli netlify deploy --prod --dir=dist
  ```

### Vercel

- **Depuis l'interface** : *Add New → Project*, choisir le dépôt, puis
  **Root Directory : `veilleuse`**. Le reste est lu dans `vercel.json`.
- **En ligne de commande** :
  ```bash
  cd veilleuse
  npx vercel --prod
  ```

Les deux configurations servent `sw.js` en `no-cache` : chaque nouvelle
version est téléchargée en arrière-plan et prise au lancement suivant.

## Installer sur l'écran d'accueil d'un iPhone

1. Ouvrir l'adresse du site dans **Safari** (connexion internet requise cette
   première fois).
2. Toucher le bouton **Partager** (le carré avec une flèche vers le haut, en
   bas de l'écran).
3. Faire défiler et choisir **« Sur l'écran d'accueil »**. Si l'option
   n'apparaît pas, toucher « Modifier les actions… » pour l'ajouter.
4. Garder le nom « Veilleuse » (et, si l'option « Ouvrir en tant qu'app web »
   est proposée, la laisser activée), puis toucher **Ajouter**.
5. Ouvrir l'app depuis la nouvelle icône : elle s'affiche en plein écran, sans
   barre Safari.
6. Pour vérifier le hors-ligne : activer le mode avion et rouvrir l'app.

À savoir :

- Les données de l'app installée sont **séparées** de celles de Safari. Toujours
  utiliser l'icône de l'écran d'accueil.
- **Supprimer l'icône supprime aussi les données.** Pensez à exporter le CSV de
  temps en temps (Réglages → Exporter tout en CSV → Enregistrer dans Fichiers).
- Safari peut effacer les données d'un site non visité depuis 7 jours ; iOS
  n'applique pas cette règle aux apps installées sur l'écran d'accueil.
  Installez donc l'app plutôt que de l'utiliser dans un onglet.

### Sur Android (Chrome)

Ouvrir le site dans Chrome, puis menu **⋮ → Installer l'application** (ou
« Ajouter à l'écran d'accueil »).

## Modèle de données

Stockage local IndexedDB (base `veilleuse`, via [`idb`](https://github.com/jakearchibald/idb)),
avec demande de stockage persistant (`navigator.storage.persist()`).

**Store `events`**, clé `id`, index `at` et `updatedAt`. Une saisie :

| Champ | Type | Rôle |
|---|---|---|
| `id` | UUID v4 | identifiant stable, prêt pour une synchro |
| `at` | ms epoch | heure de la saisie |
| `tags` | `('feed' \| 'bottle' \| 'pee' \| 'poop')[]` | ce qui s'est passé : tétée, biberon, pipi, caca |
| `createdAt`, `updatedAt` | ms epoch | traçabilité, résolution de conflits |
| `deletedAt` | ms epoch \| `null` | suppression logique |

**Store `kv`** : `settings` (prénom). Le thème est gardé dans `localStorage`
pour s'appliquer avant le premier affichage.

Les données de la première version (tétées chronométrées, biberons en ml,
couches) sont converties automatiquement à l'ouverture (base en version 2) :
une tétée devient « Tétée », une couche mixte « Pipi + Caca ».

## Arborescence

```
veilleuse/
├── index.html              métadonnées PWA/iOS, thème appliqué avant rendu
├── vite.config.ts          build + plugin qui génère dist/sw.js
├── netlify.toml, vercel.json
├── public/                 manifeste, icônes, écrans de lancement iOS
├── scripts/icons.mjs       génération des PNG (Node pur)
├── docs/                   captures d'écran
└── src/
    ├── main.tsx            montage, enregistrement du service worker
    ├── sw.js               service worker (modèle complété au build)
    ├── model.ts            saisie, étiquettes, conversion des anciennes données (+ model.test.ts)
    ├── db.ts               accès IndexedDB et migration
    ├── store.ts            état de l'app et actions (ajouter, annuler, corriger…)
    ├── hooks.ts            useNow : horloge rafraîchie
    ├── styles.css
    ├── lib/
    │   ├── summary.ts      résumé du jour, dernière fois par étiquette (+ summary.test.ts)
    │   ├── format.ts       formats FR, 24 h                (+ format.test.ts)
    │   ├── time.ts         bornes de journée (changement d'heure inclus)
    │   ├── csv.ts, share.ts, theme.ts, haptics.ts
    └── components/
        ├── App.tsx, DayPage.tsx   la page du jour
        ├── DayStrip.tsx    bandeau des jours
        ├── Composer.tsx    étiquettes à cocher + Valider
        ├── EntrySheet.tsx  corriger ou supprimer une saisie
        ├── SettingsSheet.tsx, TimeChips, Tag, Sheet, Toast, Icon
```

## Choix techniques

- **Preact** plutôt que React : même API pour ~4 ko. Seules dépendances
  d'exécution : `preact` et `idb`. Bundle complet : environ 14 ko compressé.
- **Service worker sans Workbox** : un petit plugin Vite (`vite.config.ts`)
  injecte la liste des fichiers à précharger et une version calculée à partir
  de leur contenu. Stratégie « cache d'abord » : l'app s'ouvre instantanément
  et hors ligne.
- **Pas de flash blanc** : fond sombre posé dans `index.html` avant tout
  chargement, `background_color` du manifeste et écrans de lancement iOS
  sombres pour les iPhone récents.
- Toutes les actions de saisie sont dans la moitié basse de l'écran ; la page
  ne défile jamais (seule la liste pourrait défiler, au-delà d'une vingtaine de
  saisies dans la journée).

## Vérifications effectuées

- 14 tests unitaires (`npm test`) : résumé journalier (bornes de minuit,
  saisies supprimées, jour de 25 h du passage à l'heure d'hiver), dernière fois
  par étiquette, conversion des données de la première version, formats.
- Scénario de bout en bout dans Chromium (Playwright, émulation mobile) :
  cocher puis valider, annulation, résumé, changement de jour par le bandeau et
  par balayage, correction, conversion d'une base de la première version,
  fonctionnement hors ligne, données conservées après fermeture complète du
  navigateur.
- Rendu contrôlé en **390 × 844** et **360 × 740** : la page ne défile pas, et
  une journée de 20 saisies tient entière à l'écran. Capture en 360 × 740 :
  [docs/aujourdhui-360.png](docs/aujourdhui-360.png).

Ces vérifications ont été faites sur un Chromium émulé, pas sur un iPhone ou
un téléphone Android physique : un essai réel (installation, mode avion,
redémarrage du téléphone) reste à faire avant de s'y fier la nuit.

## Hors périmètre de la V1

Comptes, synchronisation entre téléphones, notifications, graphiques, conseils
médicaux. Le modèle (UUID, `createdAt` / `updatedAt`, `deletedAt`, index
`updatedAt`) est prêt pour ajouter une synchronisation plus tard.
