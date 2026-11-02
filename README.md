# Dérive — Paris

Prototype d'intention et dossier de concept pour une application de découverte
urbaine. L'ambition : occuper à Paris la place que Dojo occupait à Londres en
2018, avec un produit qui ne soit pas une application de contenu.

## Contenu du dépôt

| Chemin | Rôle |
|---|---|
| `prototype/index.html` | Prototype navigable — 20 écrans, mode « Écran » (interactif) et mode « Planche » (contact sheet pour captures d'agence). Fichier unique, aucune dépendance, aucun build. |
| `docs/CONCEPT.md` | Le concept, le moteur de contenu, le modèle économique, la douve, les risques et le plan à 18 mois. |
| `veilleuse/` | Projet indépendant : PWA de suivi d'un nouveau-né (tétées, biberons, couches). Voir `veilleuse/README.md`. |
| `yallayum/` | Projet indépendant : refonte de YallaYum, le GPS de la restauration halal (prototype mobile, back-office, socle métier, schéma PostGIS, API, recette, dossier produit). Voir `yallayum/README.md`. |

## Lancer le prototype

Ouvrir `prototype/index.html` dans un navigateur. Les seules ressources
externes sont trois familles Google Fonts (Bodoni Moda, Archivo, DM Mono) ;
hors ligne, le rendu bascule sur des substituts sans casser la mise en page.
Toutes les images sont générées par `<canvas>`.

## Pour l'agence

Passer en mode **Planche** : les vingt écrans s'affichent en cadres 393 × 830,
prêts à être capturés. Le mode **Écran** est interactif — chips de contexte,
relances, descellement des étapes, ouverture des fiches, navigation par onglets.

L'identité (palette, typographies, règle d'inversion du carnet) est documentée
en bas de page, section « L'identité, pour l'agence ».

## Avertissement

Établissements, éclaireurs, notes et chiffres d'usage sont **fictifs**, à seule
fin de démonstration. Rues, arrondissements et stations de métro sont réels.
