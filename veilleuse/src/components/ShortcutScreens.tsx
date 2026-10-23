// Petits dessins de l'app Raccourcis, un par étape du guide : on montre ce que
// l'écran affiche et, entouré, l'endroit à toucher. Toujours en clair, comme sur l'iPhone.

import { ALARM_SHORTCUT } from '../lib/alarm';

const Clock = () => <span class="ios-clock" aria-hidden="true" />;

/** Numéro de l'endroit à toucher, repris dans le texte de l'étape. */
export const N = ({ n }: { n: number }) => <b class="n">{n}</b>;

/** Étape 1 : la liste des raccourcis, avec le + en haut à droite. */
export function ScreenNew() {
  return (
    <div class="ios" aria-hidden="true">
      <div class="ios-bar">
        <span class="ios-big">Raccourcis</span>
        <span class="ios-round ios-plus tap">+</span>
      </div>
      <div class="ios-tiles">
        <span />
        <span />
      </div>
    </div>
  );
}

/** Étape 2 : le nom en haut, puis « Renommer ». */
export function ScreenRename() {
  return (
    <div class="ios" aria-hidden="true">
      <div class="ios-bar ios-bar-center">
        <span class="ios-title tap">
          <N n={1} />
          Nouveau raccourci ⌄
        </span>
      </div>
      <div class="ios-menu">
        <span class="tap">
          <N n={2} />
          Renommer
        </span>
        <span>Choisir une icône</span>
        <span>Partager</span>
      </div>
    </div>
  );
}

/** Étape 3 : chercher « minuteur » et choisir « Lancer un minuteur ». */
export function ScreenSearch() {
  return (
    <div class="ios" aria-hidden="true">
      <div class="ios-search tap">
        <N n={1} />
        🔍 minuteur
      </div>
      <div class="ios-card ios-row tap">
        <N n={2} />
        <Clock />
        Lancer un minuteur
      </div>
    </div>
  );
}

/** Étape 4 : toucher « Durée », puis « Entrée du raccourci » dans la barre au-dessus du clavier. */
export function ScreenVariable() {
  return (
    <div class="ios" aria-hidden="true">
      <div class="ios-card">
        <div class="ios-row">
          <Clock />
          Lancer un minuteur de
        </div>
        <div class="ios-row ios-params">
          <span class="ios-chip tap">
            <N n={1} />
            Durée
          </span>
          <span class="ios-chip ios-token">minute</span>
        </div>
      </div>
      <div class="ios-varbar">
        <span>Sélectionner une variable</span>
        <span>💬 Demander à chaque fois</span>
        <span class="tap">
          <N n={2} />
          Entrée du raccourci
        </span>
      </div>
      <p class="ios-swipe">← la barre, glissée vers la gauche</p>
      <div class="ios-keys">
        <span>1</span>
        <span>2</span>
        <span>3</span>
      </div>
    </div>
  );
}

/** Étape 5 : le résultat attendu, puis la flèche pour enregistrer. */
export function ScreenDone() {
  return (
    <div class="ios" aria-hidden="true">
      <div class="ios-bar">
        <span class="ios-round tap">‹</span>
        <span class="ios-title">{ALARM_SHORTCUT} ⌄</span>
        <span class="ios-spacer" />
      </div>
      <div class="ios-card">
        <div class="ios-row">
          <Clock />
          Lancer un minuteur de
        </div>
        <div class="ios-row ios-params">
          <span class="ios-chip ios-token">Entrée du raccourci</span>
          <span class="ios-chip ios-token">minute</span>
        </div>
      </div>
    </div>
  );
}

/** Étape 6 : la question que pose l'iPhone au premier essai. */
export function ScreenOpen() {
  return (
    <div class="ios" aria-hidden="true">
      <div class="ios-alert">
        <strong>Ouvrir dans « Raccourcis » ?</strong>
        <div class="ios-alert-actions">
          <span>Annuler</span>
          <span class="tap">Ouvrir</span>
        </div>
      </div>
    </div>
  );
}
