# 03 — Parcours, écrans et micro-interactions

Ce document décrit l'architecture fonctionnelle, le parcours principal mesuré en gestes, chaque écran du cahier des charges (A à I) tel qu'il est implémenté dans le prototype (`src/app`), ses états, ses variantes iOS et Android, les micro-interactions, puis l'inventaire du design system et l'accessibilité. Quand le prototype ne couvre pas un point, c'est dit.

## 1. Architecture fonctionnelle

| Onglet | Rôle | Contenu |
|---|---|---|
| **Explorer** | Décider maintenant | Carte, recherche, puces de filtres, feuille de résultats, carrousel, fiches |
| **Collections** | Explorer davantage | « Surprends-moi », sélections éditoriales, articles ; tout mène à la carte ou aux fiches |
| **Avantages** | Fidélité (module en pilote) | Carte, QR tournant, récompenses, historique, partenaires |
| **Profil** | Ce qui m'appartient | Favoris, carnet, contributions, préférences, confidentialité, aide, banc d'essai |

Profondeur maximale : onglet → fiche → feuille modale (itinéraire, signalement). Les fiches s'empilent au-dessus de l'onglet (une fiche similaire ouvre une nouvelle page) ; les feuilles modales se ferment sans perdre la page.

## 2. Parcours « chercher → sélectionner → vérifier → partir »

Comptage dans le prototype, sans compte, depuis l'application ouverte sur Paris (premier lancement passé).

| Étape | Chemin le plus court | Gestes |
|---|---|---|
| Voir des adresses | Rien à faire : carte et feuille de résultats affichées à l'ouverture | 0 |
| Chercher | Toucher la barre, saisir « burger saint denis », valider | 2 + saisie |
| ou : autour de soi | Puce « Autour de moi » | 1 (+ autorisation système la première fois) |
| Sélectionner | Toucher un marqueur → carte du carrousel ; toucher la carte → fiche | 2 |
| ou depuis la liste | Toucher une ligne → fiche | 1 |
| Vérifier | Carte « Information halal » visible sans défiler, sous le nom ; détail en 1 geste facultatif | 0 (1) |
| Partir | « Itinéraire » → choix de l'application | 2 |

**Total** : 3 gestes depuis l'ouverture (ligne → Itinéraire → application) ; 5 avec « Autour de moi » et le passage par la carte.

Amélioration retenue pour la production : quand l'application de navigation préférée est mémorisée, « Itinéraire » l'ouvre directement (1 geste au lieu de 2), avec un appui long pour changer d'application. Le prototype affiche encore la feuille de choix, en plaçant l'application mémorisée en tête.

## 3. Écrans

Hiérarchie d'information à trois niveaux, appliquée partout : **décider** (nom, cuisine, ouvert, distance, itinéraire), **se rassurer** (niveau halal, horaires, prix datés), **explorer** (similaires, collections, contenus).

### A. Premier lancement et position

- **Écran de lancement** : logotype 900 ms, fondu 520 ms. Pas d'écran d'accueil, pas de formulaire.
- **Carte affichée immédiatement** sur Paris (position par défaut, annoncée « depuis le centre » dans l'en-tête de la feuille).
- **Invitation non bloquante** (`Prime`, au-dessus de la barre d'onglets) : « Les bonnes adresses halal, autour de toi. » + explication de l'usage de la position + trois choix : « Utiliser ma position », « Choisir une ville », « Plus tard · explorer Paris ». La demande système n'est déclenchée que par le premier bouton.
- **États** :

| Situation | Comportement | Libellé |
|---|---|---|
| Position accordée | Zone de 900 m autour, tri par distance « de toi » | En-tête « Autour de toi » |
| Refusée | Toast + bouton « Choisir » ; bandeau discret | « Position refusée. Choisis une ville, tout reste accessible. » / « Position non partagée · zone choisie à la main » |
| Indisponible ou délai dépassé (9 s) | Même chose | « Position indisponible pour le moment. Choisis une ville. » |
| Imprécise (> 1 km) | Utilisée avec une zone élargie, toast | « Position approximative (± 1,8 km) » |
| Hors zone couverte (> 30 km de toute adresse) | Carte centrée sur la position, résultats de Paris | « Aucune adresse de la démo près de toi. On t'affiche Paris. » |
| Hors ligne | La ville reste choisissable ; résultats en cache | Bandeau hors ligne |

- **iOS** : autorisation « Lorsque l'app est active » uniquement, texte d'usage repris de l'invitation ; jamais « Toujours ». **Android** : demande `ACCESS_COARSE_LOCATION` d'abord, la précise en option (Android 12+ laisse choisir « approximative » : cas « imprécise » ci-dessus).

### B. Carte principale

- **Composition** (de haut en bas) : capsule de recherche (54 px, verre) avec icône de recherche, texte d'invite ou puces de la requête comprise, bouton effacer, bouton Filtres avec compteur ; rangée de puces horizontale ; bandeaux d'état ; bouton « Rechercher dans cette zone » ; carte plein écran ; bouton de recentrage (48 px) à droite ; « Surprends-moi » à gauche ; feuille de résultats ; barre d'onglets.
- **Puces rapides** : Autour de moi, Ouvert maintenant, Cuisine ▾, Envie ▾, Budget ▾, Info halal ▾, Plus de filtres. Une puce active passe en encre pleine avec son libellé (« Libanaise », « Jusqu'à €€ ») ; une puce de collection active apparaît en tête avec une croix.
- **Marqueurs** : pastille encre de 30 px avec l'icône de la cuisine ; atténuée si l'adresse est fermée ; point ambre si sponsorisée. **Grappes** chiffrées dès 3 adresses (rayon 52 px, jusqu'au zoom 16) ; toucher une grappe zoome jusqu'à son éclatement (500 ms). **Sélection** : pastille nommée à la teinte de la cuisine, jamais absorbée par une grappe, qui respire.
- **Déplacement manuel** : rien n'est relancé ; le bouton « Rechercher dans cette zone » apparaît. Les vols déclenchés par l'application (ville, recentrage, collection) ne le font pas apparaître.
- **Zone vide** : « Pas encore d'adresse référencée ici » + « Élargir la zone » (avec le nombre réel de résultats), « Choisir une autre ville », « Suggérer une adresse ».
- **Carte en échec** (pas de chargement en 15 s, ou WebGL absent) : motif hachuré « Carte indisponible pour le moment — la liste des adresses reste à jour juste en dessous » ; la feuille passe en plein écran.
- **Attribution** OpenStreetMap repliée en « i » sous les puces.

### C. Recherche universelle

- Plein écran, champ focalisé, retour à gauche, effacer à droite.
- **Sans saisie** : « Récents » (si l'historique est activé, effaçable, avec « Effacer et ne plus garder l'historique ») puis « Envies du moment » (6 requêtes types : ouvert autour de moi, date chic, déjeuner < 15 €, grande table, brunch, après 23 h).
- **Pendant la saisie** : encadré « Compris : » avec les puces interprétées (lieu, cuisine, envie, services, budget, ouverture, texte libre) et, pour un homonyme, « Plutôt Saint-Denis (La Réunion) ? » ; puis suggestions groupées : **Lieux**, **Restaurants** (ouvrent la fiche directement), **Cuisines et plats**, **Envies** ; enfin « Rechercher « … » ». Le fragment saisi est surligné.
- Accents, apostrophes, tirets et fautes courantes (une faute jusqu'à 7 lettres, deux au-delà) tolérés ; « Paris 15e » reste un arrondissement, « moins de 15 € » un budget.
- Validation : le lieu devient la zone (vol de carte), le reste devient des filtres stricts visibles en puces ; chaque puce se retire d'un geste dans la feuille.

### D. Filtres et tri

- Feuille plein écran. Sections : **Maintenant** (Ouvert maintenant ; Ouvert à 22 h, 23 h, minuit, 1 h), **Cuisine** (par famille : origine, format, moment, style ; un parent « · tout » inclut ses enfants), **Envie**, **Budget par personne** (segments €–€€€€ avec fourchettes), **Information halal** (Tous niveaux / Déclaré ou mieux / Vérifié ou certifié / Certifié uniquement, organismes, « Sans alcool servi »), **Pratique** (12 équipements), **Distance** (zone, 500 m, 1, 2, 5 km à vol d'oiseau).
- Pied de feuille : « Tout effacer » et « Voir N adresses » où **N est recalculé à chaque changement** ; « Aucun résultat » si N = 0.
- Rappels de règles dans la feuille : « Horaires confirmés seulement ; les autres sont regroupés à part », « Les adresses sans prix connu sont écartées », « Absent = non confirmé ».
- **Tri** (bouton de l'en-tête de feuille, cycle) : Pertinence, Distance, Budget, Nouveautés. Pas de tri par note.
- **Zéro résultat** : diagnostic chiffré (au plus trois corrections : élargir la zone, retirer le filtre le plus restrictif, voir les horaires non confirmés) ; si la combinaison n'existe nulle part dans le catalogue : « Cette combinaison n'existe pas encore ».

### E. Cartes de résultat et fiche

**Carte compacte** (liste et carrousel) : illustration ou photo (96 × 112 px), surtitre cuisine — quartier, nom, état d'ouverture court (« Ouvert · 02:00 », « Ferme à 23:00 », « Ouvre à 12:00 », « Ouvre demain 12:00 », « Horaires inconnus »), distance avec son origine (« 450 m » de toi, « 850 m du centre »), niveau de prix, badge de confiance, cœur ; « Sponsorisé » en surtitre si c'est une insertion payée.

**Fiche** :
1. Galerie plein cadre (320 px) qui défile horizontalement avec points de position ; chaque visuel porte « Illustration » tant qu'aucune photo n'a de droits établis.
2. Surtitre, nom (2 rem), état d'ouverture, prix (« €€€ · 32–45 € »), distance « à vol d'oiseau ». Bandeau explicatif si sponsorisé ; bandeau si fermé temporairement.
3. **Information halal** : icône et niveau, titre (« Certifié par Organisme Bêta (fictif) »), périmètre et précision, source (méthode), date de la preuve (et « il y a 3 mois »), référence du certificat, date de fin ou « À revérifier avant », politique d'alcool ; « Vérification en cours » si décidé par l'équipe ; mention de la certification expirée retirée ; actions « Ce que ça veut dire », « Comment on vérifie », « Signaler ».
4. Description éditoriale ; envies (fortes en teinte) ; « Pourquoi ce résultat ? » si l'on vient d'une recherche.
5. Infos pratiques : adresse (copie), téléphone, réservation, menu « consulté le … · les prix peuvent avoir changé » ou « Menu non disponible ».
6. Horaires de la semaine (aujourd'hui en gras), exceptions des 14 prochains jours, source et âge de la confirmation.
7. Sur place : équipements confirmés.
8. Fidélité (si partenaire), séparée et étiquetée commerciale.
9. À proximité : jusqu'à 6 adresses à moins de 2,5 km, même cuisine d'abord, raison affichée (« Même cuisine · à 400 m »).
10. Carnet (« J'y suis allé·e »), « Signaler une erreur », date de mise à jour.

**Barre d'action** fixe : « Itinéraire · 650 m » (bouton teinté par la cuisine), Appeler, Enregistrer. Partager en haut à droite.

**Liens profonds** (§ 5) : fermé définitivement (explication + 3 adresses proches de même cuisine), déménagé (redirection + toast), ancienne adresse web (redirection), indisponible ou introuvable (« Rechercher »).

### F. Liste et éditorial

- **Liste** : la feuille en plein écran (bouton « Liste » / « Carte »), mêmes cartes, mêmes filtres, même ordre que les marqueurs.
- **Collections** : en-tête contextuel (« Bonsoir · 21:40 à Paris », « Encore debout ? »), carte « Surprends-moi », sélections en cartes mosaïques (« Pour un date », « Déjeuner en 45 minutes », « Grandes tablées », « Brunchs du week-end », « Nouvelles adresses » calculée sur 60 jours, « Ouvert après minuit » calculée à 01:00 la nuit qui vient, « Pépites à découvrir »), puis articles.
- **Page de collection** : surtitre, titre, introduction, **critères affichés** et « Aucune adresse n'a payé pour y figurer », liste, bouton fixe « Voir les N sur la carte » (devient un filtre de collection sur la carte, retirable).
- **Article** : galerie, texte court, adresses liées, « Voir sur la carte ».

### G. Favoris, partage, compte

- Cœur sur la carte de résultat, le carrousel et la fiche ; éclat à l'ajout ; premier favori en invité : toast « Enregistré sur ce téléphone » + « Synchroniser ».
- Profil invité : « Sans compte, tes favoris et ton carnet sont perdus si tu supprimes l'application. »
- Compte progressif : demandé seulement pour la synchronisation et la carte de fidélité ; Apple, Google ou lien par e-mail sans mot de passe ; « On ne te demande ni ta religion, ni ton âge, ni tes contacts. »
- Partage : feuille de partage du système, sinon copie du lien `yallayum.app/r/<slug>`.
- Profil : statistiques (favoris, testés, cuisines), favoris, contributions et leur statut, préférences (apparence, application d'itinéraire, langue), confidentialité (consentements, export JSON, suppression avec plan détaillé), aide, banc d'essai.

### H. Fidélité (module à auditer)

- Bandeau « Pilote · paramètres de démonstration, à valider avec les partenaires ».
- Carte YallaYum (format carte bancaire), solde, porteur, numéro.
- Non activée : explication + « Créer un compte et activer ».
- Activée : QR dans un anneau de décompte (30 s), « nouveau code dans 12 s », « Une capture d'écran ne fonctionne pas : le code change » ; états de passage en caisse : synchronisation, « +10 points chez … », « Déjà enregistré : aucun point en double », « Refusé : QR expiré… ».
- Progression vers la prochaine récompense, récompenses (seuil, qui finance, validité), bons (disponible jusqu'au …, utilisé, expiré), historique, règles, partenaires et « Voir sur la carte ».

### I. Contributions

- « Proposer une adresse » (nom, adresse, source de l'info halal, autres infos) et « Signaler » (fermé définitivement, déménagé, horaires, info halal, photos, coordonnées, doublon, autre).
- Rappel en tête : « Rien n'est publié automatiquement. »
- Erreurs claires sous le formulaire ; source obligatoire pour un signalement halal.
- Envoi sans compte ; hors ligne : « Enregistré : envoi dès le retour du réseau ».

## 4. États transverses

| État | Où | Comportement |
|---|---|---|
| Chargement | Carte | Fond `paper` puis tuiles en fondu (150 ms). **Les résultats sont locaux dans le prototype : pas d'état de chargement réseau.** En production : squelettes (`.skeleton`, scintillement 1,3 s) dans la feuille au-delà de 300 ms. |
| Vide | Feuille, favoris, historique de fidélité | Texte qui dit quoi faire (« Touche le cœur sur une fiche… ») |
| Erreur | Carte, position, formulaires | Message qui dit ce qui s'est passé et l'action possible |
| Succès | Contribution, favori, fidélité | Toast court (3,2 s, 5,2 s avec action) |
| Hors ligne | Global | Bandeau, résultats en cache signalés « peut-être anciens », heure du cache dans l'en-tête, contributions mises en attente |

## 5. Comportements précis

### 5.1 Feuille à trois hauteurs (`ResultsSheet.tsx`)

| Paramètre | Valeur |
|---|---|
| Hauteur réduite | barre d'onglets (62 px) + marge basse + 118 px |
| Mi-hauteur | 47 % de l'écran |
| Plein écran | écran − marge haute − 6 px |
| Seuil de glissement | 6 px (en dessous : un toucher) |
| Projection au lâcher | position + vitesse × 0,2 s, puis hauteur la plus proche |
| Résistance au-delà des butées | 25 % du déplacement |
| Retour | ressort raideur 420, amortissement 36, vitesse du doigt conservée |
| Défilement du contenu | seulement en plein écran ; la poignée et l'en-tête redescendent la feuille |
| Clic après un glissement | bloqué |

La hauteur visible alimente la variable `--sheet-visible` (boutons flottants) à chaque image, et la marge basse de la carte quand la feuille s'arrête (les vols de carte centrent dans la partie visible).

### 5.2 Synchronisation marqueur ↔ carrousel ↔ liste

- Une seule source : `selectedId` dans l'état global ; un seul ordre : celui de la réponse de recherche (départage stable par identifiant).
- Toucher un marqueur : sélection, vibration courte, la feuille s'efface, le carrousel monte (380 ms) et centre la carte correspondante.
- Faire défiler le carrousel : au repos (110 ms), la carte centrée devient la sélection ; le marqueur devient pastille ; la carte se déplace (450 ms) seulement si le marqueur sort de la zone visible (marges 40 px latérales, 30 px sous la barre et au-dessus du carrousel).
- Toucher le fond de carte : désélection, la feuille revient à sa hauteur précédente.
- La liste surligne la sélection (`is-selected`) et ouvre la fiche au toucher.

### 5.3 Retour d'une fiche

La carte, la zone, les filtres, le tri, la sélection et la hauteur de la feuille vivent dans l'état global, pas dans les composants : la fiche se superpose, la carte reste montée. Fermer la fiche retrouve exactement l'écran quitté (cas de recette 8).

### 5.4 Liens profonds

| Situation | Comportement |
|---|---|
| Application installée | Lien universel iOS (`apple-app-site-association`) / App Link Android (`assetlinks.json`) sur `https://yallayum.app/r/<slug>` : ouverture directe de la fiche, résolution identique au serveur (fiche, renommée, déménagée, fermée, indisponible). |
| Non installée | Page web de la fiche, rendue côté serveur, complète et utilisable (adresse, horaires, info halal, itinéraire), avec bannière d'installation. |
| Après installation (différé) | Android : Play Install Referrer transmet le slug. iOS : pas de méthode fiable sans prise d'empreinte de l'appareil, que l'on refuse ; la page web reste la destination, l'application ouvre sur la ville de la fiche. |
| Prototype | `#r-<slug>` dans l'adresse ; l'adresse suit la fiche ouverte (copiable). |

## 6. Micro-interactions

| Interaction | Déclencheur | Durée, courbe | Haptique | Mouvement réduit |
|---|---|---|---|---|
| Sélection d'un marqueur | Toucher | Pastille 360 ms ressort, halo 2,8 s en boucle | 8 ms | Pastille fixe, pas de halo |
| Ouverture du carrousel | Sélection | 380 ms ressort | — | Instantané |
| Ouverture de fiche | Toucher une carte | Vignette → galerie 520 ms ; contenu 560 ms (+60 ms) | — | Fondu instantané |
| Feuille | Glisser, lâcher | Ressort 420/36 | — | Saut à la hauteur |
| « Rechercher dans cette zone » | Fin d'un déplacement manuel | 420 ms ressort | — | Instantané |
| Favori | Toucher le cœur | Éclat 520 ms | Ajout 10-30-14 ms ; retrait 8 ms | Pas d'éclat |
| Surprends-moi | Toucher | Dé qui tourne 700 ms, sélection à 380 ms | 8-40-8-40-20 ms | Pas de rotation |
| Passage en caisse | Scan | Synchronisation 900 ms | Crédit 12-40-18 ms ; refus 30 ms | Identique sans transition |
| Changement d'onglet | Toucher | Pastille 420 ms ressort | — | Instantané |
| Grappe | Toucher | Zoom 500 ms | — | Saut |
| Toast | Message | Montée 420 ms ressort | — | Instantané |
| QR | Toutes les 30 s | Anneau décompte linéaire 1 s | — | Anneau mis à jour sans transition |

**iOS** : retours haptiques natifs (`UIImpactFeedbackGenerator` léger pour la sélection, notification de succès pour un crédit). **Android** : `HapticFeedbackConstants` équivalents. Le prototype web utilise `navigator.vibrate` (Android seulement).

## 7. Variantes iOS et Android

| Sujet | iOS | Android |
|---|---|---|
| Retour | Balayage depuis le bord gauche ferme la fiche | Retour système : feuille modale → fiche → recherche → onglet |
| Feuilles | Hauteurs façon `UISheetPresentationController` | `BottomSheetBehavior` Material 3 |
| Onglets | Libellés fixes, visionneuse de grand contenu au toucher long | Barre de navigation Material, même ordre |
| Partage | Feuille de partage iOS | Intent de partage |
| Taille de texte | Dynamic Type jusqu'à AX5 | Échelle de police jusqu'à 200 % |
| Itinéraire | Plans proposé en premier par défaut | Google Maps proposé en premier par défaut |
| Lien profond | Universal Links | App Links vérifiés |

## 8. Inventaire du design system (Figma)

États : N normal, A actif/sélectionné, D désactivé, P pression, F focus, C chargement, E erreur.

| Composant | N | A | D | P | F | C | E | Notes |
|---|---|---|---|---|---|---|---|---|
| Capsule de recherche | ✓ | ✓ (requête comprise) | — | ✓ | ✓ | — | — | Puces internes défilantes |
| Puce de filtre | ✓ | ✓ | — | ✓ | ✓ | — | — | Avec icône, chevron, croix |
| Marqueur, grappe, sélection | ✓ | ✓ | ✓ (fermé) | ✓ | ✓ | — | — | Variante sponsorisée |
| Point de position | ✓ | — | — | — | — | — | — | Variante simulée/imprécise |
| Feuille de résultats | ✓ | — | — | ✓ (glissement) | ✓ | ✓ | — | 3 hauteurs |
| Carte de résultat | ✓ | ✓ | — | ✓ | ✓ | ✓ (squelette) | — | Variante sponsorisée |
| Carte de carrousel | ✓ | ✓ (centrée) | — | ✓ | ✓ | — | — | |
| Badge de confiance | 4 niveaux × petit/grand | | | | | | | Icône + libellé |
| État d'ouverture | ouvert, bientôt, fermé, inconnu, à confirmer | | | | | | | Point + texte |
| Carte Information halal | 4 niveaux | ✓ (dépliée) | — | — | ✓ | — | — | Vérification en cours, certificat expiré |
| Bouton principal / teinté / secondaire / fantôme / braise | ✓ | — | ✓ | ✓ | ✓ | ✓ | — | |
| Bouton rond, bouton carré, bouton flottant | ✓ | ✓ | — | ✓ | ✓ | ✓ (localisation) | — | |
| Barre d'onglets | ✓ | ✓ | — | ✓ | ✓ | — | — | Pastille animée |
| Feuille modale | ✓ | — | — | — | ✓ | — | — | Normale / plein écran |
| Champ, zone de texte | ✓ | — | ✓ | — | ✓ | — | ✓ | |
| Interrupteur, segments | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | |
| Toast | ✓ (avec ou sans action) | | | | | | | |
| Bandeau d'état | hors ligne, position, sponsorisé, fermé | | | | | | | |
| État vide / diagnostic | zone vide, filtres, combinaison impossible | | | | | | | |
| Carte de fidélité, QR, anneau | inactif, actif, synchronisation, crédité, refusé | | | | | | | |
| Carte de collection, ligne d'article, mini-carte | ✓ | — | — | ✓ | ✓ | — | — | |

## 9. Accessibilité

| Exigence | Prototype | À faire en production |
|---|---|---|
| Texte à 200 % | Vérifié par captures : fiche, feuille, onglets sans chevauchement (deux défauts corrigés : défilement parasite du cadre, en-tête de feuille) | Dynamic Type AX1–AX5 sur appareil |
| Mode sombre | Vérifié par captures, carte comprise | — |
| Mouvement réduit | Implémenté (classe globale + préférence système) et vérifié | — |
| Contrastes | Calculés, défauts corrigés dans le prototype ([02-marque](02-marque-et-direction.md) § 3.3) | Vérifier sur appareil, en plein soleil |
| Couleur seule | Évitée : icônes de niveau, points + texte d'ouverture, libellé « Sponsorisé » | — |
| Cibles | 44 px (boutons ronds 42–44 px, à porter à 44), 48 px (boutons flottants), 52 px (actions de fiche) | Vérifier 48 dp sur Android |
| Lecteurs d'écran | Libellés sur les marqueurs (« Les Braises, fermé »), grappes (« 12 adresses, zoomer »), boutons icônes, zones `aria-live` pour le nombre de résultats et le solde | Tests VoiceOver et TalkBack : ordre de focus carte → feuille, annonce de la sélection du carrousel |
| Focus clavier | Visible (anneau azur) ; dans les feuilles modales le focus entre, boucle (Tab, Maj+Tab) et revient à l'élément d'origine ; Échap ferme | Tests au clavier physique sur iPad et Android |
| Carte | Équivalent en liste toujours disponible | Mode « liste seule » mémorisé pour les personnes qui le préfèrent |

## Décisions à prendre

1. Ouvrir directement l'application de navigation mémorisée (1 geste) plutôt que la feuille de choix.
2. Seuil d'affichage des squelettes de chargement (300 ms proposé) une fois l'API branchée.
3. Faut-il un mode « liste seule » par défaut pour les lecteurs d'écran ?
4. Liens différés sur iOS : accepter que la page web soit la destination, sans prise d'empreinte (recommandé).
5. Nombre de puces rapides : sept aujourd'hui ; un test utilisateur doit dire si « Info halal » mérite une puce dédiée ou une place dans les filtres seulement.
