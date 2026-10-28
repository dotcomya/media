# 02 — Marque et direction visuelle

Ce document audite l'identité actuelle, compare trois directions visuelles, justifie celle qui est retenue et fixe ses jetons tels qu'ils sont codés dans le prototype (`src/app/styles.css`, `src/map/style.ts`). Les rapports de contraste ont été calculés selon la formule WCAG 2.2 (luminance relative), pas estimés.

## 1. Audit de l'identité existante

| Élément | Observé | Lecture |
|---|---|---|
| Logotype | « Yalla Yum » en Kaushan Script, sur deux lignes dans l'icône, dégradé cyan → bleu | Reconnaissable, dynamique, déjà associé à la marque. Fragile en petit (traits fins) et peu lisible en une ligne à 16 px. |
| Couleurs du site | Fond `#00E0FF` → `#43BBCD` (dégradé radial), accents `#0019FF` (bleu électrique) et `#FF8E5C` (orange), textes `#594D4D` | Turquoise très saturé : énergique mais fatigant en grande surface, et insuffisant en contraste pour du texte. L'orange est un bon capital d'appétit, sous-exploité. |
| Typographie | Kaushan Script (titres du site), Amiri (textes, boutons) | Amiri est une serif dessinée pour l'arabe et le latin d'édition : à l'écran, en corps 16 et moins, elle est peu lisible ; associée à un service halal, elle ajoute une note « orientale » décorative que le brief demande d'éviter. |
| Captures App Store | Titres en serif sur dégradé turquoise, téléphones inclinés, interface à fond blanc, barre d'onglets en dégradé bleu | Cohérence de couleur, mais l'interface elle-même est générique (carte Google, listes système). |
| Photographie | Image d'accueil de groupe, lumière solaire, contre-plongée | Énergie juste. Origine à vérifier (voir [01-produit](01-produit.md), constat 9). |

**À garder** : le logotype et son dégradé, le turquoise comme couleur-signature, l'orange comme couleur d'appétit, l'énergie jeune.
**À abandonner** : Amiri, les grands aplats turquoise saturés, le texte sur dégradé.

## 2. Trois directions

### A — « Néon lagon » (continuité)

- **Palette** : turquoise `#00E0FF` et bleu électrique `#0019FF` sur fond nuit ; violet néon en accent ; carte sombre par défaut.
- **Typographie** : Kaushan Script en titres de section, sans-serif géométrique en texte.
- **Forces** : continuité immédiate avec l'existant ; spectaculaire en captures et sur les réseaux.
- **Risques** : lisibilité de jour en extérieur (usage principal : dans la rue, au soleil) ; le néon dit « nuit », pas « déjeuner rapide » ni « famille » ; le script en titre fatigue vite ; contraste du turquoise saturé insuffisant pour du texte.
- **Verdict** : écartée comme direction d'interface, gardée pour les campagnes nocturnes (« Ouvert après minuit »).

### B — « Papier street » (éditorial)

- **Palette** : papier crème, encre noire, orange vif, photographie argentique granuleuse.
- **Typographie** : grande serif contrastée en titres, grotesque en texte, chiffres en monospace.
- **Forces** : très désirable pour le magazine et les collections ; crédibilité culturelle (références Paper Magazine, Daily Paper).
- **Risques** : déconnectée du turquoise de la marque ; donne le premier rôle au contenu alors que le produit est une carte ; la serif éditoriale s'accorde mal avec une interface de décision rapide ; esthétique crème + serif déjà très répandue.
- **Verdict** : écartée pour l'interface ; son traitement photographique sert de référence pour les contenus éditoriaux et les réseaux.

### C — « Lagon & Braise » (retenue)

- **Principe** : le **lagon** (turquoise → azur du logo) porte la carte, l'eau et la confiance ; la **braise** (l'orange du site, approfondi) porte l'appétit, la sélection et les favoris ; l'**encre** bleu-noir porte le texte et l'action principale.
- **Surfaces tonales façon Material You** : la fiche, la carte du carrousel et le bouton Itinéraire prennent la teinte de la cuisine sélectionnée (`--seed-h`, espace OKLCH), avec une transition douce de la teinte. Une adresse libanaise tire vers le vert, une adresse indienne vers le safran.
- **Sobriété Apple** : beaucoup de blanc, des surfaces peu nombreuses, des ombres légères, des ressorts plutôt que des fondus.
- **Carte calme** : pas de commerces ni de points d'intérêt concurrents, voirie hiérarchisée, eau turquoise pâle, stations comme repères ; les adresses YallaYum sont les seuls objets forts.
- **Forces** : continuité de marque (turquoise, orange, logotype) ; lisible au soleil ; s'adapte à chaque cuisine sans multiplier les couleurs de marque ; tient en mode sombre.
- **Risques** : la teinte dynamique doit rester lisible sur toutes les teintes (vérifié ci-dessous) ; le turquoise ne doit jamais servir de couleur de texte sur blanc (utiliser `--lagon-ink`).
- **Verdict** : retenue.

## 3. Jetons retenus

### 3.1 Couleurs de l'interface

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--ink` | `#0d1d24` | `#e7f0f1` | Texte principal, bouton principal |
| `--ink-2` | `#44575e` | `#a9bcc0` | Texte secondaire |
| `--ink-3` | `#5b6e73` | `#8a9fa4` | Mentions, aides |
| `--paper` | `#f3f6f5` | `#0b1519` | Fond d'écran |
| `--surface` | `#ffffff` | `#132127` | Feuilles, cartes |
| `--surface-2` | `#edf2f1` | `#1a2b31` | Champs, lignes groupées |
| `--surface-3` | `#e2e9e8` | `#22363d` | Pression, pistes |
| `--lagon` | `#12a4b8` | `#3fc6d8` | Marque, eau, focus d'information (jamais texte sur blanc) |
| `--lagon-ink` | `#0a6a7c` | `#7fdce8` | Liens, texte lagon |
| `--lagon-soft` | `#d8f1f4` | `#0f3640` | Encadrés d'information |
| `--azur` | `#3c6beb` | `#86a6ff` | Position de l'utilisateur, focus clavier |
| `--braise` | `#ff6a3d` | `#ff8a63` | Appétit : Surprends-moi, favori, pastilles |
| `--braise-ink` | `#b93e12` | `#ffb398` | Texte braise |
| `--ok` / `--warn` / `--bad` | `#0c7a5c` / `#8a5a00` / `#b42318` | `#5ed3a8` / `#f0c060` / `#ff8f84` | Ouvert / bientôt fermé, avertissement / fermé, erreur |
| Confiance « certifié » | `#0c7a5c` sur `#d9f2e9` | `#5ed3a8` sur `#10342a` | Badge |
| Confiance « vérifié » | `#2457c5` sur `#e1e9fd` | `#8fb0ff` sur `#172648` | Badge |
| Confiance « déclaré » | `#8a5a00` sur `#fbefd2` | `#f0c060` sur `#3a2c0d` | Badge |
| Confiance « à confirmer » | `#56676c` sur `#e8edec` | `#a3b4b8` sur `#22333a` | Badge |
| Teinte dynamique | `--tint: oklch(96.5% 0.028 h)`, `--tint-2: oklch(92% 0.05 h)`, `--tint-strong: oklch(52% 0.13 h)`, `--tint-ink: oklch(33% 0.07 h)` | `oklch(25% 0.03 h)`, `oklch(30% 0.05 h)`, `oklch(78% 0.12 h)`, `oklch(90% 0.05 h)` | `h` = teinte de la cuisine (`taxonomy.ts`) |

Chaque niveau de confiance a aussi **une forme d'icône propre** (sceau, bouclier coché, bulle, point d'interrogation) et un libellé : la couleur n'est jamais le seul signal.

### 3.2 Couleurs de la carte (`src/map/style.ts`)

| Couche | Jour | Nuit |
|---|---|---|
| Terre | `#F2F5F3` | `#0F1B20` |
| Parcs / bois | `#DCEBDD` / `#D2E6D4` | `#13271F` / `#122A22` |
| Eau | `#B4E1EA` | `#0B3440` |
| Rues / axes / voies rapides | `#FFFFFF` / `#FFFFFF` / `#FFF1E2` | `#1C2B31` / `#26373E` / `#3A3328` |
| Bordures de voies | `#E1E7E5`, `#D3DCDA` | `#0F1B20`, `#0A1418` |
| Noms de rues / quartiers / villes | `#56686C` / `#4B5E63` / `#1F3238` | `#7F9599` / `#90A6AB` / `#C9D8DB` |
| Stations | `#3C6BEB` (libellé `#2D4F9E`) | `#7FA1FF` (libellé `#A9BEFF`) |

### 3.3 Contrastes calculés

| Couple (clair) | Rapport | Résultat |
|---|---|---|
| `ink` sur `paper` / `surface` | 15,85 / 17,24 | AA |
| `ink-2` sur `surface` | 7,58 | AA |
| **`ink-3` sur `surface` / `paper` / `surface-2`** | **4,02 / 3,70 / 3,56** | **Grand texte seulement** |
| Blanc sur `ink` (bouton principal) | 17,24 | AA |
| `lagon-ink` sur `surface` | 6,24 | AA |
| `braise-ink` sur `surface` | 5,58 | AA |
| **Blanc sur `braise` (« Surprends-moi »)** | **2,85** | **Échec** |
| `ok` / `warn` / `bad` sur `surface` | 5,31 / 5,93 / 6,57 | AA |
| Badges certifié / vérifié / déclaré / à confirmer | 4,51 / 5,32 / 5,19 / 5,00 | AA |
| Blanc sur `tint-strong`, teintes 8° à 340° | 4,87 (teinte 192) à 5,92 | AA |
| **Blanc sur la pastille du marqueur sélectionné, `oklch(55% 0.16 h)`** | **4,10 à 5,29 (4,10 pour 192°, 4,54 pour 145°)** | **Échec pour les teintes vertes et turquoise** |
| Carte : rue / quartier / ville / station | 4,21 / 6,21 / 12,17 / 7,02 | Rue : grand texte seulement |
| **Carte : libellé de l'eau sur l'eau** | **2,96** | **Échec** |

| Couple (sombre) | Rapport | Résultat |
|---|---|---|
| `ink` sur `paper` / `surface` | 15,97 / 14,23 | AA |
| `ink-2` / `ink-3` sur `surface` | 8,35 / 4,99 | AA |
| `ink-3` sur `surface-2` | 4,44 | Grand texte seulement |
| **Blanc sur `braise` (« Surprends-moi »)** | **2,32** | **Échec** |
| Badges (4 niveaux) | 7,34 / 6,98 / 8,03 / 6,10 | AA |
| `#0b1519` sur `tint-strong` sombre | 8,76 à 9,71 | AA |
| Carte : rue / quartier / eau | 5,56 / 6,87 / 5,43 | AA |

**Corrections appliquées au prototype** après ce calcul (les tableaux ci-dessus gardent les valeurs d'origine pour mémoire) :

| Jeton | Avant | Appliqué | Nouveau rapport |
|---|---|---|---|
| `--ink-3` clair | `#6f8287` | `#5b6e73` | 5,35 sur `surface`, 4,92 sur `paper`, 4,73 sur `surface-2` |
| Texte sur la braise (« Surprends-moi ») | blanc | `--on-braise` `#1b0d06`, clair et sombre | 6,67 (clair), 8,19 (sombre) |
| Pastille du marqueur sélectionné | `oklch(55% 0.16 h)` | `oklch(47% 0.15 h)` | 5,72 au pire (teinte 190°), 5,77 à 192°, 6,39 à 145° |
| Libellé de l'eau (jour) | `#2F8797` | `#155B67` | 5,47 |
| Noms de rues (jour) | `#66787C` | `#56686C` | 5,33 |
| `--ink-3` sombre | `#7d9196` | `#8a9fa4` | 5,28 sur `surface-2`, 5,94 sur `surface` |

Les boutons ronds de la fiche passent aussi de 42 à 44 px.

### 3.4 Typographie

| Rôle | Police | Usage |
|---|---|---|
| Logotype | Kaushan Script | Uniquement le mot-symbole « Yalla Yum » (écran de lancement, carte de fidélité, page latérale). Jamais en interface ni en titre de section. |
| Titres | Bricolage Grotesque (axe d'optique 12–96, graisses 400–800) | Noms de restaurants, titres d'écran, collections. Grotesque à forte personnalité, légèrement irrégulière : l'insolence de la marque sans décor culturel. |
| Interface et texte | Police système : SF Pro sur iOS, Roboto sur Android | Lisibilité, taille dynamique native, aucun téléchargement. |
| Chiffres | Police système, chiffres tabulaires | Distances, horaires, points. |

Échelle utilisée dans le prototype (rem, 1 rem = 16 px × taille de texte choisie) : 2,125 (titre d'écran, 800), 2 (nom sur la fiche, 800, interlettrage −0,025 em), 1,5 (titre de collection), 1,25 (titre de feuille, 750), 1,0625 (nom en liste, 720 ; texte d'accroche), 1 (texte), 0,9375 (boutons secondaires), 0,875, 0,8125 (aides), 0,75 (surtitres en capitales, interlettrage 0,06–0,08 em). Les libellés d'onglets sont fixés à 11 px, comme sur iOS (le nom reste annoncé par les lecteurs d'écran).

**Amiri abandonnée** : lisibilité faible à l'écran en petit corps, connotation décorative « orientale », et deux familles d'affichage (script + serif) se concurrençaient.

### 3.5 Espacement, rayons, ombres

- **Espacement** : le prototype utilise surtout des multiples de 2 et 4 px (2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22). **Proposition pour Figma et le code de production** : échelle 4/8 stricte — 4, 8, 12, 16, 20, 24, 32, 40, 48 — et une marge latérale de 16 px (20 px sur les écrans de contenu). Nettoyage du prototype à prévoir.
- **Rayons** : `--r-s` 10 px, `--r-m` 16 px, `--r-l` 22 px, `--r-xl` 30 px ; puces et boutons en pilule (hauteur / 2) ; cadre de téléphone 54 px.
- **Ombres** : `--shadow-1` (repos), `--shadow-2` (objets flottants : barre de recherche, boutons flottants), `--shadow-sheet` (feuille, ombre vers le haut). En sombre, ombres plus denses (0,3–0,45 d'opacité).
- **Verre** : `--glass` à 86 % d'opacité + flou 14–20 px, réservé aux objets posés sur la carte (recherche, puces, boutons flottants, barre d'onglets). Pas de verre empilé sur du verre.

### 3.6 Mouvement

| Élément | Comportement | Valeurs du prototype |
|---|---|---|
| Courbes | Sortie douce ; ressort avec léger dépassement | `cubic-bezier(0.2, 0.8, 0.2, 1)` ; `cubic-bezier(0.34, 1.4, 0.64, 1)` ; durée de base 280 ms |
| Feuille de résultats | Ressort physique, vitesse du geste conservée | raideur 420, amortissement 36, masse 1 (`src/app/spring.ts`) |
| Marqueur sélectionné | Apparition en ressort puis « respiration » : un halo de sa teinte s'étend et s'efface | apparition 360 ms ; cycle de 2,8 s, après 400 ms |
| Ouverture de fiche | La vignette touchée s'agrandit jusqu'à la galerie, le corps de fiche monte | 520 ms pour l'image, 560 ms pour le contenu (décalé de 60 ms) |
| « Rechercher dans cette zone » | Gonfle depuis le haut | 420 ms, ressort |
| Favori | Éclat du cœur | 520 ms |
| Onglet actif | Pastille qui glisse sous l'icône | 420 ms, ressort |
| Écran de lancement | Logotype qui se pose, puis fondu | 900 ms + 520 ms |

**Mouvement réduit** (réglage système ou banc d'essai) : toutes les animations passent à 1 ms, les ressorts sautent à leur position finale, la respiration s'arrête. Aucune information ne dépend d'une animation.

### 3.7 Iconographie et illustration

- **Icônes** : jeu dessiné pour YallaYum, 24 px, trait 1,8 px, extrémités arrondies (`src/ui/Icon.tsx`). Quatorze icônes de cuisine (burger, taco, sandwich, brochette, tajine, bol, curry, sushi, pizza, croissant, gâteau, feuille, cloche, assiette) servent aussi aux marqueurs de carte.
- **Illustrations génératives** (`src/ui/illustration.ts`) : assiette vue du dessus ou salle stylisée, dans la teinte de la cuisine, avec grain. Elles remplacent les photos tant que les droits ne sont pas acquis et portent **toujours** la mention « Illustration » sur l'image.
- **Règle photo** : photos réelles du lieu et des plats, avec crédit et licence (`media.license`, `media.rights_status = cleared`). **Jamais** d'image générée par IA présentée comme la photo d'un restaurant réel. Une image générique est identifiable comme telle.
- **Personnages culinaires** (sandwich, tacos, wings, brunch, healthy, bol asiatique, burger) : réservés aux réseaux sociaux, aux campagnes et à quelques états vides (« Pas encore d'adresse ici »). Jamais sur une fiche, jamais à la place d'une information.

## 4. Ton de voix

Direct, court, chaleureux, un peu insolent, toujours précis. On tutoie. L'humour ne masque jamais une information.

| À faire (libellés réels du prototype) | À éviter |
|---|---|
| « Une ville, une cuisine, une envie… » | « Bienvenue sur la meilleure app halal de France ! » |
| « Pas encore d'adresse référencée ici » | « Aucun résultat 😢 » |
| « Rien ne correspond à tous tes filtres. Une correction suffit : » | « Oups ! Une erreur est survenue » |
| « Ta position sert seulement à trier par distance, quand tu la demandes. » | « Autorisez la localisation pour une meilleure expérience » |
| « Déclaré par le restaurant », « Info halal à confirmer » | « 100 % halal garanti », « Certifié » sans organisme |
| « Une capture d'écran ne fonctionne pas : le code change. » | « Code sécurisé par une technologie de pointe » |
| « Encore debout ? », « Fringale de nuit ? » | Formules religieuses détournées en slogan |
| « Ouvre demain 12:00 » | « Fermé » sans plus |

## 5. Check-list anti-clichés

- Pas de croissant de lune, d'arabesques, de lanternes, de mosaïques ou de calligraphie décorative dans l'interface.
- Pas de « saveurs d'Orient », « mille et une nuits », « voyage exotique ».
- Pas de typographie « pseudo-arabe » pour du texte latin.
- Les cuisines sont nommées par leur origine ou leur format, jamais réduites à « halal food ».
- Photographie de personnes : diversité réelle des clients, sans mise en scène de signes religieux comme accessoires.
- Les couleurs de cuisine viennent de la cuisine (safran, herbes, braise), pas d'un code culturel supposé.
- Les termes religieux n'apparaissent que là où ils informent (« halal », organisme de certification), jamais comme ton de marque.

## Décisions à prendre

1. Confirmer sur appareil les corrections de contraste appliquées (§ 3.3) : `ink-3`, texte sur la braise, pastille du marqueur, libellés de carte.
2. Faire redessiner le logotype en version une ligne et en monogramme pour les petites tailles (icône, marqueur de marque).
3. Licence de Bricolage Grotesque (OFL, Google Fonts) : l'embarquer dans l'application plutôt que la charger.
4. Cahier des charges photo (lumière, cadrage, droits) avant la campagne de prise de vue.
5. Place exacte des personnages culinaires : liste fermée des états vides autorisés.
