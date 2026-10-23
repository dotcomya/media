import { useState } from 'preact/hooks';

/** Bandeau de l'aperçu privé (build:apercu uniquement) : rappelle que rien n'est publié et liste les changements. */
export function DemoBanner() {
  const [open, setOpen] = useState(false);
  return (
    <aside class="demo">
      <div class="demo-bar">
        <span>Aperçu privé · données d'exemple · rien n'est publié</span>
        <button type="button" onClick={() => setOpen((o) => !o)}>
          {open ? 'Fermer' : 'Ce qui change'}
        </button>
      </div>
      {open && (
        <ul class="demo-list">
          <li>Nouveau nom, nouveau logo : Nous 3 (deux parents, un bébé, blottis).</li>
          <li>Une ligne = un moment avec bébé : l'heure, puis 🤱 🍼 💧 💩, toujours à la même place.</li>
          <li>À droite de chaque ligne : l'heure du prochain repas (dernier repas + 2 h 30).</li>
          <li>La ligne du haut dit « dans 1 h 10 », en rouge si l'heure est passée.</li>
          <li>Plus de propositions 1 / 2 / 3, de chrono ni de sein gauche / droit.</li>
          <li>Biberon : un curseur de 10 en 10 ml.</li>
          <li>Saisie en retard : l'encart « Heure », à gauche de Valider, permet de choisir l'heure.</li>
          <li>Chaque tétée ou biberon validé lance un minuteur iPhone jusqu'au prochain repas (aucune alarme en trop).</li>
          <li>Nouveau : partage maman / papa par un code, dans Réglages (actif une fois le serveur créé).</li>
          <li>« Partager » est rangé dans Réglages ; l'écran ne défile pas.</li>
        </ul>
      )}
    </aside>
  );
}
