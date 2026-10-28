# 07 — Back-office

Ce document décrit l'application d'administration livrée dans `src/admin` (ouverte par `admin.html`, ou `#admin` dans l'artefact) : à qui elle sert, ce que fait chaque écran, les règles qu'elle applique et ce qui reste simulé. Elle remplace l'empilement d'outils qui servait à gérer plus de 1 000 fiches à la main.

## 1. Principes

- **Une seule source de règles.** Chaque action passe par le socle `src/domain` : `transition()` pour la publication, `deriveHalalStatus()` pour le niveau affiché, `saveVersioned()` pour les conflits, `moveContribution()` et `acceptContribution()` pour la modération, `reverse()` pour la fidélité, `can()` pour les droits. Le back-office n'invente aucune règle que l'API ne connaîtrait pas.
- **Rien n'est publié par accident.** Une contribution acceptée devient une proposition, ajoutée au brouillon de modifications de la fiche ; la publication est un geste séparé, par un rôle autorisé. Ce qui touche à l'information halal ouvre une revérification, jamais un badge.
- **Tout se trace.** Chaque écriture ajoute une entrée au journal d'audit (acteur, rôle, action, motif, avant / après). Le journal est en ajout seul, dans l'interface comme dans la base (trigger qui refuse modification et suppression, chaînage SHA-256 dans `db/schema.sql`).
- **L'interface ne montre que ce que le rôle peut faire**, et chaque action revérifie le droit au moment de l'exécution : un bouton caché n'est pas une sécurité, le refus côté serveur l'est (rôles de `src/domain/rbac.ts`, sécurité par ligne dans `db/schema.sql`).

## 2. Rôles

| Rôle | Peut | Ne peut pas |
|---|---|---|
| Super admin | Tout, avec session MFA pour les droits sensibles | Modifier le journal d'audit |
| Éditeur | Créer, modifier, publier, suspendre, archiver des fiches ; modérer ; importer ; éditer les contenus | Valider une preuve halal |
| Vérificateur | Ajouter, valider, rejeter ou révoquer des preuves halal ; lancer le contrôle quotidien ; modérer ; lire le journal | Publier une fiche |
| Support | Lire les fiches, modérer, lire la fidélité, traiter les demandes RGPD | Annuler une transaction, publier |
| Restaurateur | Voir ses établissements, ses statistiques agrégées, ses passages de fidélité ; demander une modification | Voir un concurrent, publier quoi que ce soit, toucher au niveau halal |

L'interrupteur « Session MFA » de la barre du haut simule la double authentification : sans elle, les droits marqués sensibles dans `rbac.ts` (publier, valider une preuve, lire une pièce justificative, ajuster la fidélité, gérer les accès, importer, traiter une demande RGPD) sont refusés, même au super admin.

## 3. Écrans

| Écran | Ce qu'on y fait | Règles notables |
|---|---|---|
| **Tableau de bord** | Cycle de publication (publiées, en relecture, brouillons, suspendues, archivées, fermées définitivement) ; information halal (certifications expirées, échéances sous 60 jours, à confirmer) ; à traiter (contributions, doublons probables) ; qualité (sans photo réelle, sans horaires, horaires de plus de 180 jours, sans prix, sans menu) ; couverture par ville ; recherches sans résultat et intentions d'itinéraire | Chaque chiffre a sa définition (bouton « i ») et ouvre la liste filtrée correspondante. Les chiffres d'usage sont étiquetés « Exemple » : ils viendront de la mesure d'audience ([09](09-mesure.md)). |
| **Établissements** | Liste dense avec recherche (nom, rue, ville, quartier), filtres (publication, situation, niveau halal), tri ; export CSV par copie | L'export ne contient que des données de fiche, jamais de pièce justificative. |
| **Éditeur de fiche** | Tous les champs (nom, adresse web et son historique, description, adresse structurée, coordonnées, cuisines, envies avec leur force, services, alcool, prix et fourchette datée, contacts, horaires hebdomadaires avec passage de minuit, exceptions datées, médias avec crédit et licence) ; aperçu mobile ; transitions de publication | Motif obligatoire pour suspendre, archiver, restaurer ou renvoyer en brouillon. Coordonnées vérifiées (dans la zone, en France). Bouton « Simuler une modification concurrente » : l'enregistrement suivant déclenche le conflit de version et un écran de fusion champ par champ ; les champs qui ne se contredisent pas sont repris automatiquement, rien n'est écrasé en silence. |
| **Vérification halal** | Files de travail (certificat échu, preuve échue, échéance proche, sans preuve, signalement) ; historique des preuves d'une fiche ; ajout d'une preuve (nature, périmètre, méthode, organisme, référence, date de preuve, fin de validité, pièce jointe) ; valider, rejeter, révoquer, mettre en vérification, avec motif | La pièce jointe est hachée en SHA-256 dans le navigateur ; seuls son nom et son empreinte sont gardés (en production : stockage privé chiffré, URL signées courtes). « Lancer le contrôle quotidien » crée une tâche par preuve échue ou proche de l'échéance, trace le changement de niveau au journal, et ne rejoue rien s'il est relancé le même jour. |
| **Contributions** | File par statut (reçu, en cours, précisions demandées, acceptées, rejetées, doublons) ; détail avec ce qui est proposé ; actions de modération | Les contributions envoyées depuis l'app (même navigateur) arrivent dans la file quand la page reprend le focus. Seuls certains champs s'appliquent automatiquement au brouillon (téléphone, site, nom, description, rue, situation) ; le reste se reprend à la main dans l'éditeur. Une contribution halal ouvre une tâche de vérification. |
| **Import CSV** | Coller un fichier au format de `db/MIGRATION.md` ; « Analyser » sans rien écrire ; « Importer en brouillon » | Chaque ligne est classée OK, avertissement ou erreur, avec le motif : coordonnées manquantes (à géocoder par la BAN), hors de France, doublon d'une fiche existante (nom normalisé proche et moins de 50 m). L'ancien badge « Certifié halal par le restaurateur JJ/MM/AAAA » devient une **déclaration datée**, jamais une certification. Les doublons sont exclus par défaut ; réimporter le même fichier est sans effet. |
| **Contenus** | Collections éditoriales : titre, chapeau, critères, ordre, date de programmation, aperçu | Seules des fiches visibles dans l'app peuvent être liées à une collection. |
| **Fidélité** | Paramètres du programme (statut, règle de gain, délai entre deux crédits, plafond, récompenses et leur financement) marqués « provisoires » ; partenaires ; transactions ; alertes de fraude ; annulation | Alertes : rafales (4 tentatives ou plus en 15 minutes), refus répétés, jeton rejoué ailleurs. Une transaction ne s'annule qu'une fois, avec motif, par un rôle qui a `loyalty.adjust`. Le restaurateur ne voit que ses propres passages. |
| **Journal d'audit** | Liste filtrable (entité, acteur, action), détail avant / après | Aucune action de modification n'existe à l'écran. |
| **Accès et RGPD** | Matrice rôles × droits, utilisateurs de démonstration, invitation et révocation, demandes d'export et de suppression avec le plan exact de `planAccountDeletion()` | MFA obligatoire pour les rôles internes. |
| **Vue restaurateur** | « Mes établissements » (ses deux fiches Smash Club, en lecture seule), statistiques agrégées d'exposition (impressions, fiches ouvertes, itinéraires, étiquetées « Exemple »), demandes de modification, fidélité limitée à ses passages | Une demande crée une proposition ; si elle touche au halal, elle part chez un vérificateur. |

## 4. Parcours types

1. **Certificat qui expire.** Le contrôle quotidien trouve la certification échue d'Istanbul Kitchen → l'app affiche déjà le niveau suivant (« Vérifié par YallaYum ») → une tâche « Certificat échu » apparaît → le vérificateur ajoute le nouveau certificat, avec sa pièce et sa date de fin → il le valide → le badge « Certifié » revient, et chaque étape est au journal.
2. **Signalement d'un utilisateur.** « Fermé définitivement » arrive de l'app → le support le prend en charge → l'éditeur l'accepte → la proposition passe dans le brouillon de modifications → un éditeur publie la modification avec motif → la fiche sort de la découverte, son lien explique la fermeture.
3. **Deux personnes sur la même fiche.** Amel modifie la description pendant que Karim change le téléphone et la description → à l'enregistrement, Amel voit que le téléphone a été repris automatiquement et choisit entre les deux descriptions → la fusion est enregistrée en version suivante.
4. **Reprise de la base historique.** Le fichier exporté est collé dans l'import → l'analyse signale coordonnées douteuses et doublons → les lignes valides entrent en brouillon → la revérification les publie par lots ([MIGRATION.md](../db/MIGRATION.md)).

## 5. Ce qui est simulé dans cette version

| Simulé | En production |
|---|---|
| Stockage dans le navigateur (`localStorage`, clé `yy:admin`), bouton « Réinitialiser la démo » | API d'administration (`api/openapi.yaml`, préfixe `/admin/v1`) et PostgreSQL |
| Session MFA par interrupteur | MFA réelle (TOTP ou clé de sécurité), sessions courtes |
| Géocodage : lignes sans coordonnées marquées « à géocoder » | Appel à la BAN avec seuil de score et aperçu |
| Invitations, révocations | Envoi d'e-mails, expiration des invitations |
| Recherches sans résultat, intentions d'itinéraire, statistiques du restaurateur | Agrégats de `analytics_events` |
| Pièces justificatives : nom et empreinte seulement | Stockage objet privé et chiffré, URL signées, journal d'accès |

## 6. Écarts avec le socle, à remonter dans `src/domain`

Le back-office a dû ajouter localement quelques notions qui manquent au socle partagé. Elles existent déjà dans `db/schema.sql` et devront rejoindre `src/domain` pour que l'API et l'app les partagent :

- **Brouillon de modifications** sur une fiche publiée (`AdminRestaurant.pending`, `src/admin/model.ts`).
- **Tâches de revérification** et contrôle quotidien (`ReviewTask`, `runDailyCheck`, `src/admin/Halal.tsx`), miroir de `review_tasks` et `expire_halal_claims()`.
- **Statut de droits des médias** : déduit aujourd'hui (illustration = visuel générique, photo sans licence = à vérifier) ; la table `media` porte déjà ce statut.
- **Champs qu'une contribution peut modifier automatiquement** (`APPLICABLE`, `src/admin/Contributions.tsx`).
- **Entité d'audit « fidélité »** pour les réglages du programme et des partenaires.

## Décisions à prendre

1. Garder cette base Preact pour le back-office de production, ou la reprendre en Next.js ([08](08-architecture.md)).
2. Liste exacte des champs applicables automatiquement depuis une contribution.
3. Délai cible de traitement d'un signalement halal (proposé : 72 heures, avec mise en vérification visible si dépassé).
4. Qui peut publier une fiche importée : l'éditeur seul, ou l'éditeur après passage d'un vérificateur.
5. Accès des restaurateurs : calendrier d'ouverture de l'espace et procédure de preuve de représentation.
