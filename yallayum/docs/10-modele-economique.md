# 10 — Modèle économique

Ce document évalue les options de revenus de YallaYum sans en décider : aucune n'est actée, aucun chiffre de marché n'est présenté comme un fait. Chaque option est décrite par ses unités économiques (formules et variables), l'effort qu'elle demande, ses conflits d'intérêts, son effet sur l'expérience et le volume dont elle a besoin. Les ordres de grandeur, quand il y en a, sont étiquetés **hypothèse**. Le document fixe aussi ce qui reste gratuit pour toujours et ce qui ne se vend jamais.

---

## 1. Point de départ

- La découverte est gratuite et le restera : carte, recherche, filtres, fiches, information halal, favoris, itinéraire, contributions.
- Les 1 000+ adresses de la base historique sont **référencées**, pas **partenaires**. Être référencé ne crée aucune relation commerciale ; en base, un partenaire a un contrat (`partners`, `partner_status`, `contract_ref` pour une campagne sponsorisée).
- Le revenu le plus solide à long terme découle de la confiance : si l'information halal perd sa crédibilité, aucune option ci-dessous ne survit. La confiance n'est pas un actif monétisable par déclassement ou par badge.
- Aucune dépendance initiale à des commissions de réservation ou de livraison : ces services n'existent pas dans YallaYum aujourd'hui.

---

## 2. Le principal coût : vérifier

Avant les revenus, le coût qui structure le modèle. Chaque niveau de preuve a une durée de validité (`app_config` : 365 jours pour une vérification de l'équipe ou une déclaration ; la date du certificat pour une certification). Une preuve expirée retire le badge le jour même (`expire_halal_claims()`). Tenir le catalogue à jour est donc un coût récurrent, pas un investissement ponctuel.

```
Coût annuel de vérification ≈ Σ niveaux  N_fiches(niveau) × T_vérif(niveau) × C_horaire / D_validité(niveau, en années)
```

| Variable | Sens | Source |
|---|---|---|
| `N_fiches(niveau)` | Fiches visibles par niveau visé | Catalogue (`halal_status`) |
| `T_vérif` | Temps d'une vérification : appel, contrôle de documents, visite, saisie | À mesurer pendant la campagne de revérification de l'import |
| `C_horaire` | Coût horaire chargé de l'équipe de vérification | Interne |
| `D_validité` | Durée de validité (1 an par défaut) | `app_config` |

**Hypothèse de travail** à remplacer par des mesures : une vérification documentaire à distance prend des dizaines de minutes, une visite plusieurs heures. Avec 1 000 fiches revérifiées chaque année, l'ordre de grandeur se compte en centaines d'heures par an. Ce coût doit être couvert avant toute expansion géographique.

Leviers sans toucher à la confiance : outils du back-office (files priorisées par trafic et ancienneté, rappels automatiques, pièces déposées par le restaurateur dans l'espace commerçant), certifications d'organismes vérifiées par contrôle documentaire, priorisation des fiches les plus consultées.

---

## 3. Options de revenus

### 3.1 Services aux restaurateurs (abonnement)

**Contenu proposé** : revendication de fiche (gratuite), puis offre payante d'outils : statistiques détaillées d'exposition (impressions, fiches ouvertes, intentions de visite, par semaine et par source), gestion de plusieurs établissements d'une enseigne, mise à jour rapide des horaires et menus, réponse aux signalements, prise de vue photo professionnelle avec droits cédés.

```
Revenu mensuel récurrent = N_restaurateurs_actifs × taux_de_conversion × ARPA
Marge = Revenu − (coût d'acquisition amorti + support + prestations photo + outillage)
Valeur vie client = ARPA × marge_brute / taux_de_résiliation_mensuel
```

| Critère | Évaluation |
|---|---|
| Effort | Espace commerçant (déjà esquissé dans le back-office : rôle Restaurateur, statistiques agrégées), facturation, support, vente terrain |
| Conflit d'intérêts | **Indirect, à maîtriser** : le signal de classement `completeness` (`ranking.ts`) valorise photos réelles, menu, horaires vérifiés. Un service qui les fournit améliorerait le rang par ricochet. Parades : tout ce qui compte dans `completeness` reste obtenable gratuitement (envoi par le restaurateur, passage de l'équipe) ; poids plafonné (0,8 sur 9,3) ; audit trimestriel de l'écart de rang entre abonnés et non-abonnés à complétude égale. |
| Effet sur l'expérience | Positif si les fiches deviennent plus complètes et plus fraîches. Aucun élément visible ne doit distinguer un abonné. |
| Volume nécessaire | Assez de trafic par fiche pour que les statistiques aient de la valeur pour un restaurateur. Seuil à définir en fiches ouvertes par mois. |

### 3.2 Visibilité sponsorisée étiquetée

**Contenu** : l'emplacement sponsorisé déjà spécifié et implémenté (`insertSponsored`, table `sponsored_campaigns`) : une insertion par page, en position 3, en tri « Pertinence » seulement, uniquement si l'adresse respecte tous les filtres de la personne, mention « Sponsorisé » partout, aucun effet sur le niveau halal.

```
Revenu = Σ campagnes  prix_campagne
ou, au volume : Impressions_sponsorisées × CPM / 1 000
Impressions_sponsorisées = Recherches_dans_la_zone × taux_de_remplissage × part_avec_≥_3_résultats
```

| Critère | Évaluation |
|---|---|
| Effort | Faible côté produit (déjà conçu) ; vente, contrats (`contract_ref`), reporting par campagne |
| Conflit d'intérêts | Direct, encadré par construction : filtres respectés, une seule insertion, étiquette, niveau halal indépendant. Le restaurant sponsorisé n'entre dans aucune collection éditoriale du seul fait de sa campagne. |
| Effet sur l'expérience | Négatif si l'adresse insérée est moins pertinente que celle qu'elle repousse. Garde-fous : intentions de visite des positions sponsorisées comparées aux organiques ; aucun sponsorisé quand la zone a peu de résultats (seuil à fixer). |
| Volume nécessaire | Élevé : il faut assez de recherches par ville et par catégorie pour que l'emplacement ait de la valeur. Option à ouvrir ville par ville, quand le volume de recherche le justifie. |
| Cadre légal | Publicité identifiable comme telle ; obligation de transparence sur le classement et les rémunérations qui l'influencent (Code de la consommation, article L111-7). À valider avec un juriste. |

### 3.3 Partenariats locaux

**Contenu** : partenariats avec des acteurs proches de l'usage (marques alimentaires, services de réservation ou de livraison quand un restaurant les utilise déjà, institutions locales), sous forme de contrats de visibilité ou de rémunération par orientation. Pas d'événements physiques comme pilier.

```
Revenu = Σ partenaires  (forfait + orientations_qualifiées × prix_par_orientation)
```

| Critère | Évaluation |
|---|---|
| Effort | Variable, commercial ; intégrations techniques éventuelles (liens de réservation suivis) |
| Conflit d'intérêts | Moyen : un partenaire de réservation ne doit pas modifier l'ordre des résultats ni masquer un restaurant sans ce partenaire |
| Effet sur l'expérience | Neutre à positif si le service apporte une action utile (réserver) ; négatif s'il multiplie les renvois |
| Volume nécessaire | Moyen ; dépend du partenaire |

### 3.4 Fidélité financée contractuellement

**Contenu** : la carte de fidélité commune (module à auditer avant mise en service, `src/domain/loyalty.ts`). Les récompenses sont financées par le partenaire, par YallaYum ou en partage (`reward_funding` : `partner`, `yallayum`, `shared`) ; aucune règle de gain n'est actée (`DEMO_PROGRAM.provisional = true`).

```
Revenu YallaYum = Σ partenaires  (abonnement_partenaire + frais_par_transaction × transactions)
Coût = récompenses financées par YallaYum + support + pertes de fraude + terminaux ou temps en caisse
Condition de viabilité : densité = partenaires à moins de X minutes d'un porteur actif ≥ seuil
```

| Critère | Évaluation |
|---|---|
| Effort | Élevé : contrats, formation en caisse, application ou mode commerçant, anti-fraude (déjà spécifié : jetons tournants, idempotence, délai entre deux crédits, plafond, annulation unique, litiges), rapprochements |
| Conflit d'intérêts | Fort si les partenaires étaient mieux classés : ils ne le sont pas (le statut partenaire n'entre dans aucun signal) |
| Effet sur l'expérience | Positif seulement si la carte est utile près de chez soi ; une carte avec trois partenaires dispersés déçoit |
| Volume nécessaire | **Densité locale** plus que volume total : le programme a du sens quartier par quartier |

### 3.5 Contenus de marque labellisés

**Contenu** : articles ou guides financés par une marque, signalés « Contenu de marque » ou « En partenariat avec… », distincts des sélections de la rédaction.

```
Revenu = Σ campagnes  prix_campagne ; coût = production éditoriale + validation
```

| Critère | Évaluation |
|---|---|
| Effort | Moyen ; production éditoriale ; charte d'indépendance |
| Conflit d'intérêts | Direct : jamais dans « Sélections », jamais de qualification halal dans un contenu payé, adresses citées soumises aux mêmes règles de visibilité (publiées, vérifiées) |
| Effet sur l'expérience | Neutre si rare et utile ; négatif s'il envahit l'onglet Collections |
| Volume nécessaire | Audience éditoriale mesurée (`collection_opened`, **proposé** dans `09-mesure.md`) |

---

## 4. Ce qui reste gratuit, ce qui ne se vend jamais

### Gratuit pour toujours

- Explorer, chercher, filtrer, voir les fiches complètes, sans compte.
- L'information halal détaillée de chaque fiche, avec sa source et ses dates.
- Favoris, collections personnelles, carnet, partage, itinéraire.
- Proposer ou corriger une adresse.
- Revendiquer sa fiche en tant que restaurateur (après preuve de représentation) et la tenir à jour.

### Jamais à vendre

| Interdit | Garantie |
|---|---|
| Un niveau de preuve halal, ou son maintien après expiration | Niveau dérivé des preuves (`deriveHalalStatus`) ; table `sponsored_campaigns` sans aucun lien au halal |
| Le classement organique | Aucun signal commercial dans `ranking.ts` ; « Pourquoi ce résultat ? » publié |
| Le déclassement ou la disparition d'un concurrent | Règles de visibilité identiques pour tous (`is_discoverable`) |
| Le retrait d'une information vraie et défavorable (fermeture, certificat expiré) | Mentions générées par les règles, pas éditables par le restaurateur |
| Une place dans les sélections de la rédaction | Critères publiés sur chaque collection (« Aucune adresse n'a payé pour y figurer ») |
| Les données des personnes | Aucun SDK publicitaire, aucune revente, aucun partage ; mesure sans donnée personnelle (`09-mesure.md`) |

---

## 5. Séquencement proposé

Les seuils sont des variables à fixer, pas des objectifs chiffrés.

| Phase | Contenu | Condition pour passer à la suivante |
|---|---|---|
| 0. Confiance | Aucun revenu. Revérification de la base importée, couverture des villes cibles, North Star. | Part des fiches visibles avec une preuve valide ≥ `S_preuve` ; North Star en croissance sur `K` semaines |
| 1. Relation restaurateurs | Revendication de fiche gratuite, espace commerçant, statistiques de base gratuites. | `N_revendiquées` fiches revendiquées et tenues à jour |
| 2. Outils payants | Abonnement restaurateur (§ 3.1), en pilote dans une ville. | Conversion et résiliation mesurées ; marge positive hors acquisition |
| 3. Sponsorisé | Ouverture ville par ville (§ 3.2). | Recherches mensuelles dans la ville ≥ `S_recherches` ; garde-fous d'expérience stables pendant le pilote |
| 4. Fidélité | Pilote dans un ou deux quartiers denses (§ 3.4), après audit du module. | `N_partenaires` à moins de `X` minutes à pied d'une part suffisante des porteurs ; taux de fraude sous `S_fraude` |
| En continu | Contenus de marque (§ 3.5) et partenariats (§ 3.3), au cas par cas. | Charte d'indépendance signée, labellisation vérifiée |

---

## 6. Risques

| Risque | Effet | Parade |
|---|---|---|
| Soupçon d'achat de badge | Perte de la confiance, cœur de la valeur | Badge dérivé des preuves, séparation des tables, publication de la méthode, audit externe envisageable |
| Conflit indirect par la complétude | Abonnés mieux classés « sans le dire » | Gratuité des éléments de complétude, poids plafonné, audit des écarts |
| Coût de vérification supérieur aux revenus | Badges qui expirent faute de moyens, ou expansion trop rapide | Couvrir le coût de vérification (§ 2) avant d'ouvrir une ville ; priorisation par trafic |
| Densité insuffisante pour la fidélité | Programme vide, déception | Pilote local ; pas d'ouverture nationale sans densité |
| Dépendance à quelques gros partenaires | Pression sur l'éditorial | Plafond de part de revenus par partenaire ; charte d'indépendance |
| Fraude fidélité | Pertes, litiges | Mécanismes déjà spécifiés ; plafond de financement ; suivi `loyalty_suspicions` |
| Cadre légal (publicité, transparence du classement, données sensibles) | Sanctions, retrait des stores | Validation juridique avant chaque ouverture ; AIPD (`08-architecture.md`) |

---

## Décisions à prendre

1. **Mesurer le coût réel de vérification** (temps par niveau) pendant la campagne de revérification de l'import, avant toute décision de revenu.
2. **Fixer les seuils** de passage de phase : `S_preuve`, `N_revendiquées`, `S_recherches` par ville, `N_partenaires` et `X` minutes pour la fidélité, `S_fraude`.
3. **Première option à piloter** : abonnement restaurateur (recommandé, conflit le plus maîtrisable) ou sponsorisé.
4. **Charte d'indépendance éditoriale** : rédiger et publier avant tout contenu de marque ou campagne.
5. **Fidélité** : qui finance les récompenses (partenaire, YallaYum, partagé), avec quels plafonds — après l'audit du module existant.
6. **Validation juridique** de la mention « Sponsorisé », de la page de transparence du classement et des contrats partenaires.
