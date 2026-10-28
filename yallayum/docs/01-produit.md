# 01 — Produit : audit, positionnement, personas

Ce document part de ce que l'on peut observer publiquement de YallaYum aujourd'hui, en tire des décisions pour la refonte, puis fixe la promesse, l'indicateur central, les principes et les situations d'usage qui guident tout le reste du dossier. Tout ce qui n'a pas pu être vérifié dans l'application elle-même est marqué comme hypothèse.

## 1. Audit de l'existant

Sources examinées le 27 octobre 2026 : le site `yallayum.app` (page d'accueil et mentions légales), la fiche App Store `id6673911587` (texte, historique de versions, notes, étiquette de confidentialité, cinq captures), l'icône, et une page d'analyse tierce (`mwm.ai`). L'application elle-même n'a pas été installée : ses écrans réels, son back-office et ses données n'ont pas été vus.

### 1.1 Faits établis

| Élément | Constat |
|---|---|
| Éditeur | Marque exploitée par MEG, société française domiciliée à Paris 15e (mentions légales). Fiche App Store au nom d'un développeur individuel. |
| Versions | 1.0 le 25/09/2024, 1.1 le 08/07/2025, 1.2 le 29/07/2025. Notes de version identiques : « Mise à jour des restaurants / des descriptions / du design ». |
| Audience | 7 notes, moyenne 5,0. Moins de 1 000 téléchargements selon mwm.ai (estimation d'un tiers, non vérifiée). |
| Promesse affichée | « L'application n°1 pour découvrir les meilleurs restaurants halal autour de toi », « adresses halal les plus cool, certifiées et sélectionnées avec soin », « Restaurants halal vérifiés », « Sélection soignée et indépendante ». |
| Volume affiché | Capture 1 : « Découvre les milliers de restaurants halal autour de toi ». Le brief parle de plus de 1 000 adresses. |
| Fonctions visibles | Carte, filtres, fiche avec photos et description, carte de fidélité commune, articles « S'informer sur la cuisine halal ». Trois onglets : carte, fidélité, profil. |

### 1.2 Constats, risques, décisions

| # | Constat (preuve) | Risque | Décision dans la refonte |
|---|---|---|---|
| 1 | **Carte saturée** (capture 1) : fond Google Maps, des centaines de pastilles turquoise identiques, grappes rares (chiffres 2 et 3 seulement) à l'échelle de Paris. | Illisible à faible zoom ; aucune hiérarchie ; coût et licence Google Maps (affichage de contenus tiers sur fond Google soumis à leurs conditions). | Regroupement par grappes chiffrées dès 3 points (rayon 52 px), marqueurs par cuisine, sélection en pastille nommée ; fond MapLibre au style YallaYum sur données OpenStreetMap ([08-architecture](08-architecture.md) pour le choix du fournisseur). |
| 2 | **Filtre unique en liste à cocher** (capture 2) : « Les coups de ❤️ », « Petit budget », « Gastro & raffiné », « StreetFood & casual », nationalités, « Kid Friendly », « Amérique du Nord »… tout coché par défaut, lien « Show less » en anglais. | Budget, ambiance, cuisine et public sont mélangés ; logique inversée (décocher pour filtrer) ; impossible de combiner « italien ET petit budget » ; incohérence de langue. | Taxonomies séparées et hiérarchiques (cuisine par famille, envies, budget, info halal, services) ; filtres stricts additifs ; compteur réel avant validation ; tout en français. Table de correspondance des anciennes catégories dans [db/MIGRATION.md](../db/MIGRATION.md). |
| 3 | **« Certifié halal par le restaurateur 29/06/2025 »** sur une fiche (capture 3). | Confusion entre déclaration et certification : un restaurateur ne se certifie pas lui-même. Risque juridique (pratique commerciale trompeuse) et de confiance si un utilisateur découvre l'écart. | Quatre niveaux jamais confondus (certifié par un organisme, vérifié par l'équipe, déclaré par le restaurant, à confirmer), dérivés de preuves datées. La mention historique devient une déclaration datée, jamais une certification. |
| 4 | **Allégations** : « n°1 », « certifiées », « vérifiés », « milliers ». | Promesses invérifiables ; un tiers (mwm.ai) les reprend comme des faits (« uniquement des restaurants certifiés ») : la promesse se propage hors de notre contrôle. | Retirer « n°1 » et « certifiées » des textes de marque et de la fiche App Store ; annoncer un volume exact et daté ; décrire la méthode (« Comment on vérifie »). |
| 5 | **Fidélité** (capture 4) : « Plus besoin d'une carte fidélité par resto… Scanne le QR code chez ton restaurateur. Il ne l'a pas ? Préviens-nous. » | Flux « le client scanne un QR fixe du restaurant » : un QR photographié et partagé crédite à distance. Contrats, financement des récompenses et nombre de partenaires inconnus. | Module **à auditer** avant toute promesse. Flux recommandé : le commerçant scanne un QR tournant (30 s) du client ([04-regles-metier](04-regles-metier.md) § 7). Paramètres économiques non inventés, marqués « provisoires ». |
| 6 | **Articles** (capture 5) : textes longs et généraux (« Nourriture et Identité… », « Le halal comme alimentation durable et éthique »), titres coupés, aucun lien visible vers des adresses. | Silo éditorial qui n'aide pas à choisir un restaurant ; défauts de mise en page. | Chaque contenu mène à des fiches et à la carte (« Voir sur la carte ») ; la base refuse de publier un contenu sans adresse liée. |
| 7 | **Confidentialité** : l'étiquette App Store déclare localisation, identifiants, données d'usage et diagnostic « utilisés pour vous suivre », et des « publicités tierces ». | Une application de restaurants halal qui suit la position pour la publicité expose une donnée qui peut révéler une conviction religieuse (article 9 du RGPD, données sensibles). Risque réglementaire et réputationnel élevé. | Aucun SDK publicitaire, aucun suivi entre applications, position demandée à l'usage et jamais stockée côté serveur, mesure d'audience exemptée ou consentie ([09-mesure](09-mesure.md)). Mettre à jour l'étiquette App Store avant la sortie. |
| 8 | **Identité** (site) : logotype en Kaushan Script, dégradé cyan → bleu ; fond `#00E0FF` / `#43BBCD` ; accents `#0019FF` et `#FF8E5C` ; textes en Amiri. | Amiri, serif d'inspiration arabe, donne une couleur décorative « orientale » au discours et se lit mal en petit corps à l'écran. | Logotype conservé ; Amiri abandonnée ; direction « Lagon & Braise » ([02-marque](02-marque-et-direction.md)). |
| 9 | **Image d'accueil du site** : groupe d'amis en contre-plongée. | Plusieurs indices visuels laissent penser qu'elle **pourrait** être générée par IA (non vérifié). Si c'est le cas et qu'elle n'est pas signalée, elle fragilise une marque qui vend de la confiance. | Règle : aucune image générée présentée comme réelle ; visuels génératifs toujours étiquetés « Illustration ». À vérifier avec le fondateur. |
| 10 | **Fiche exemple réelle** visible dans les captures (un restaurant parisien nommé, adresse complète). | Aucun. | Le prototype n'utilise **que** des établissements fictifs ; la base réelle reste celle du fondateur. |

### 1.3 Ce que l'audit n'a pas pu établir

Technologie actuelle, source et date des données, nombre réel de fiches publiées, part des fiches avec preuve halal, existence d'un back-office, état contractuel de la fidélité, fréquentation réelle. Ces points conditionnent le plan de reprise et sont listés en fin de document.

## 2. Le problème

Une offre halal qui existe n'est pas forcément **trouvable**, **comparable** ni **crédible**. Aujourd'hui, choisir un restaurant demande de croiser une carte généraliste (qui ne sait rien du halal), des comptes Instagram (qui ne disent pas si c'est ouvert ni d'où vient l'information) et parfois un appel. La question réelle n'est pas « existe-t-il un restaurant halal ? » mais « lequel correspond à mon envie, mon budget, mon heure et mon niveau d'exigence, et comment j'y vais maintenant ? ».

## 3. Ce que YallaYum est, et n'est pas

| YallaYum est | YallaYum n'est pas |
|---|---|
| Un moteur de découverte food, carte d'abord | Un annuaire plat |
| Une base éditorialisée d'adresses, chacune avec un niveau de preuve halal daté | Un filtre « halal » posé sur une carte générale |
| Un outil de décision : envie, budget, horaire, distance, occasion | Une application de prière ou de pratique religieuse |
| À terme, une référence de confiance du marché | Un service de livraison ou de réservation intégré |
| Une marque food contemporaine | Une vitrine folklorique ou un support politique |

Exploration complète **sans compte**. Le compte n'apporte que la synchronisation (favoris, carnet, carte de fidélité).

## 4. Indicateur central (North Star)

**Découvertes qualifiées par semaine** : nombre de couples (session, établissement) pour lesquels, dans la même session, la fiche a été ouverte **puis** une intention de visite a été exprimée.

- **Intention de visite** = un des événements `route_clicked` (application de navigation ouverte), `phone_clicked`, `booking_clicked`, `share_clicked` sur cet établissement.
- **Ouverture de fiche** = `restaurant_opened`.
- Un couple compte une seule fois par jour, quel que soit le nombre d'intentions.
- Calcul sur les événements du régime « audience » (sans consentement, sans identifiant persistant ; [09-mesure](09-mesure.md)) : la session est un identifiant éphémère, jamais une personne.

**Ce qu'il ne mesure pas** : la visite réelle (on ne sait pas si la personne est allée au restaurant et on ne cherche pas à le savoir par la position), la satisfaction, la dépense. Un partage n'est pas une visite. Il ne doit jamais être présenté comme un nombre de clients apportés à un restaurant.

### Métriques d'appui

| Métrique | Définition | Pourquoi |
|---|---|---|
| Temps jusqu'au premier résultat utile | Ouverture → première fiche ou première carte de résultat visible | Principe « time-to-value » |
| Taux de recherches sans résultat | `search_submitted` avec `results = 0` / total | Couverture, compréhension des requêtes |
| Taux fiche → intention | Découvertes qualifiées / fiches ouvertes | Qualité des fiches et de la décision |
| Dépliage de l'info halal | `halal_info_expanded` / fiches ouvertes | Intérêt pour la preuve, à suivre par niveau |
| Fraîcheur du catalogue | Part des fiches publiées avec une preuve halal active et des horaires confirmés de moins de 180 jours | Honnêteté du produit |
| Sessions sans plantage | Sessions sans crash / total | Qualité technique |

### Garde-fous

- Part des intentions vers des fiches **sponsorisées** : surveillée ; une hausse brutale signale que la publicité pousse la décision plus que la pertinence.
- Taux de signalements « fermé » ou « horaires faux » après une intention : un produit qui envoie des gens devant des portes closes perd sa raison d'être.
- Part de fiches « à confirmer » parmi les intentions : ne pas laisser la croissance reposer sur des adresses non étayées.
- Taux d'acceptation de la mesure « analytics » : jamais forcé, jamais de mur de consentement.

## 5. Ce que veut dire « hyper addictif » ici

On revient à YallaYum parce que c'est le chemin le plus court vers une bonne adresse, pas parce qu'on y est retenu.

**Ce qu'on fait** : de la vitesse (carte et résultats dès l'ouverture, sans compte ni écran d'accueil long) ; une récompense variable choisie par la personne (« Surprends-moi » tire une adresse ouverte, de préférence un coup de cœur pas encore testé) ; un carnet personnel (« J'y suis allé·e », cuisines explorées) ; des favoris disponibles hors ligne ; des micro-interactions qui répondent au doigt (ressorts, marqueur qui respire, cœur qui éclate).

**Ce qu'on refuse** : notifications culpabilisantes (« Tu nous manques »), séries à ne pas casser, badges de présence, défilement infini sans fin de liste, compteurs de rareté inventés, consentement arraché par un mur, gamification de la pratique religieuse.

## 6. Principes de conception

1. **La carte d'abord.** Des adresses pertinentes visibles immédiatement autour de soi ou de la ville choisie.
2. **Valeur sans friction.** Exploration sans compte, sans introduction longue, sans exiger la position ; une ville se choisit en un geste.
3. **Une confiance explicable.** « Listé », « vérifié par l'équipe », « déclaré », « certifié par un organisme » ne se confondent jamais ; chaque niveau dit sa source et sa date.
4. **Le contexte avant la taxonomie.** « Pour un date », « déjeuner rapide », « en famille » sont aussi naturels que « libanais ».
5. **Utile avant d'être décoratif.** Peu de couches, une hiérarchie nette, aucune animation qui retarde une recherche.
6. **Couverture imparfaite, honnêteté parfaite.** Zones peu couvertes, horaires incertains, données non confirmées : on le dit ; on n'invente ni adresse ni badge.
7. **Indépendance éditoriale.** Une adresse payante est étiquetée « Sponsorisé » ; l'argent n'achète ni un rang éditorial ni un niveau de preuve.
8. **Mobile, une main.** Actions principales à portée du pouce, états complets sur petits écrans et grandes polices.

## 7. Situations d'usage

Les situations sont décrites par la tâche à accomplir, jamais par une inférence sur la religion, le genre ou l'apparence. Les critères viennent de besoins de recherche exprimés.

| Situation | Tâche à accomplir | Réussite | Écrans et fonctions servis |
|---|---|---|---|
| Budget serré | « Manger pour 12–15 € à moins de 15 minutes à pied. » | Trouver une adresse ouverte sous 15 € et partir en moins d'une minute. | Requête « moins de 15 € », puce Budget, « Autour de moi ». Le temps à pied vient de l'application de navigation : YallaYum affiche une distance à vol d'oiseau. |
| Dîner à deux | « Un vrai beau restaurant, plutôt romantique. » | Une adresse « Pour un date » réservable, avec une description qui donne envie et des prix datés. | Collection « Pour un date », envie `date`, bouton Réserver. |
| Groupe d'amis | « Ouvert maintenant, qui accueille six personnes. » | Résultats ouverts avec tables de 6+ **confirmées**. | Requête « entre amis 6 personnes », filtre Ouvert maintenant, équipement `groupes`, collection « Grandes tablées ». |
| Pause déjeuner | « Rapide, près du bureau, en moins de 45 minutes. » | Une adresse « déjeuner rapide » ouverte à midi, à quelques centaines de mètres. | Collection « Déjeuner en 45 minutes », envie `rapide`, tri par distance. |
| Sortie en famille | « Pratique avec poussette ou chaise haute, si l'info est confirmée. » | Seules les adresses qui ont confirmé l'équipement sortent. | Équipements `poussette`, `chaise_bebe` (absent = non confirmé, jamais « absent »). |
| Nouvel arrivant ou visiteur | « Je ne connais pas la ville : montre-moi ce qui est proche et fiable. » | Comprendre la zone, voir le niveau de preuve de chaque adresse, partir. | Choix de ville, carte avec grappes, badges de confiance, collections de quartier. |
| Exigence halal stricte | « Je veux la source exacte, le périmètre, la date de vérification. » | Filtrer « Certifié uniquement » ou par organisme, lire source, périmètre, date de preuve, échéance, politique d'alcool. | Filtre Info halal, carte « Information halal » de la fiche, « Comment on vérifie », « Signaler ». |
| Curiosité | « Surprends-moi avec une cuisine ou une pépite que je ne connais pas. » | Découvrir une adresse ouverte hors de ses habitudes. | « Surprends-moi », collection « Pépites à découvrir », articles « Un pays, un plat, un resto ». |

## 8. Existant, hypothèses, propositions

| Fonction | Existant observé | Hypothèse | Proposition de la refonte | Statut |
|---|---|---|---|---|
| Base de 1 000+ adresses | Annoncée | Saisie manuelle, preuves halal non archivées pour une partie | Reprise en brouillon, revérification par lots ([MIGRATION](../db/MIGRATION.md)) | À reprendre |
| Carte et recherche géolocalisée | Visible (captures) | Fond Google Maps | MapLibre + style YallaYum, recherche comprise, filtres stricts | Proposition |
| Catégories et ambiances | Liste à cocher unique | — | Taxonomies séparées, hiérarchiques, éditables | Proposition |
| Badge halal | « Certifié par le restaurateur + date » | Saisi à la main, sans pièce | Niveau dérivé de preuves datées, quatre niveaux | Proposition |
| Fiche détaillée | Photos, description, hashtags | Droits des photos non documentés | Photos seulement avec droits établis, sinon illustration étiquetée | Proposition |
| Carte de fidélité | Écran et promesse visibles | Contrats et règles inconnus | Module en pilote, paramètres provisoires | **À auditer** |
| Contenus éditoriaux | Articles visibles | Rédaction ponctuelle | Collections et guides reliés aux fiches | **À auditer** |
| Contributions | « Ajouter un restaurant » sur le site | Formulaire ou e-mail | Formulaires dans l'app, file de modération | Proposition |
| Compte | Onglet profil | Compte requis pour la fidélité | Invité par défaut, compte progressif | Proposition |
| Back-office | Inconnu | Outils disparates | Back-office web unique avec rôles et journal | Proposition |

## 9. Risques produit et parades

| Risque | Parade |
|---|---|
| **Effondrement des niveaux à la reprise** : les mentions historiques datent de 2025 ; avec une validité de 12 mois, beaucoup tomberaient « à confirmer » dès l'import. | Lancer la campagne de revérification **avant** la publication publique ; publier ville par ville ; afficher la part de fiches vérifiées sur la page « Comment on vérifie ». Ne pas allonger la validité pour masquer le problème. |
| Restaurants mécontents d'être « déclarés » plutôt que « certifiés ». | Méthode publique, procédure claire pour fournir une preuve, réponse du support sous délai fixé. |
| Signalement diffamatoire (« ce n'est pas halal ») | Jamais publié ; tâche de vérification ; mention neutre « Vérification en cours » seulement sur décision de l'équipe. |
| Couverture faible hors de Paris | Annoncer les zones couvertes ; état « Pas encore d'adresse référencée ici » avec suggestion d'adresse. |
| Horaires faux qui envoient devant une porte close | Horaires datés, groupe « non confirmés », signalement en un geste, revérification prioritaire des adresses les plus consultées. |
| Fraude et coût de la fidélité | Pilote limité, flux scanné par le commerçant, plafonds, journal, contrats avant toute promesse publique. |
| Dépendance à la curation du fondateur | Back-office avec rôles, files de travail et journal ; méthode documentée pour former des vérificateurs. |
| Donnée sensible (conviction religieuse inférable) | Minimisation, pas de publicité ciblée, pas de partage de données, position non stockée. |
| Coûts cartographiques | Fournisseur choisi sur coûts et licences, tuiles cachées, pas de requêtes à chaque déplacement de carte. |

## Décisions à prendre

1. Retirer « n°1 », « certifiées » et « milliers » de la fiche App Store et du site, et publier un volume exact daté.
2. Confirmer l'origine de l'image d'accueil du site et la remplacer si elle est générée.
3. Fournir l'export de la base actuelle (champs, dates des mentions halal, photos et leur origine) pour chiffrer la campagne de revérification.
4. Statut réel de la fidélité : partenaires signés, financement des récompenses, règles promises aux utilisateurs actuels.
5. Calendrier de mise à jour de l'étiquette de confidentialité App Store et retrait des SDK publicitaires.
6. Zones de lancement de la nouvelle version (Paris et petite couronne seulement, ou plusieurs villes).
