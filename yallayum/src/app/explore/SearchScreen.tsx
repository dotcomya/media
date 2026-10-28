// Recherche universelle : saisie, suggestions classées par type, et ce qui a
// été compris, affiché avant de valider (lieu, cuisine, envie, horaire).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { normalize } from '../../domain/text';
import { autocomplete, interpret, placeById } from '../../domain/query';
import { cuisine } from '../../domain/taxonomy';
import { isDiscoverable } from '../../domain/publication';
import { Icon, type IconName } from '../../ui/Icon';
import { useStore } from '../store';
import { CATALOG, choosePlace, closeOverlay, mapCenter, openRestaurant, setConsent, setFilters, store, submitQuery } from '../state';

const IDEAS: { label: string; query: string; icon: IconName }[] = [
  { label: 'Ouvert maintenant autour de moi', query: 'ouvert maintenant autour de moi', icon: 'clock' },
  { label: 'Un date, plutôt chic', query: 'date €€€', icon: 'heart' },
  { label: 'Déjeuner rapide à moins de 15 €', query: 'déjeuner rapide moins de 15 €', icon: 'route' },
  { label: 'Entre amis, grande table', query: 'entre amis 6 personnes', icon: 'user' },
  { label: 'Brunch du week-end', query: 'brunch', icon: 'croissant' },
  { label: 'Fringale après 23 h', query: 'ouvert après 23h', icon: 'moon' },
];

function Highlight({ text, q }: { text: string; q: string }) {
  const n = normalize(text);
  const nq = normalize(q).split(' ').at(-1) ?? '';
  const i = nq ? n.indexOf(nq) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + nq.length)}</mark>
      {text.slice(i + nq.length)}
    </>
  );
}

export function SearchScreen() {
  const query = useStore(store, (s) => s.query);
  const recent = useStore(store, (s) => s.recent);
  const historyOn = useStore(store, (s) => s.consent.history);
  const position = useStore(store, (s) => s.location.position);
  const area = useStore(store, (s) => s.area);
  const [value, setValue] = useState(query);
  const input = useRef<HTMLInputElement>(null);
  const origin = position ?? mapCenter(area);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const groups = useMemo(() => autocomplete(value, CATALOG.filter(isDiscoverable), origin), [value]);
  const understood = useMemo(() => (value.trim().length > 2 ? interpret(value, { origin }) : undefined), [value]);
  const submit = (q: string) => {
    submitQuery(q);
    closeOverlay();
  };

  const hasSuggestions = groups.places.length + groups.restaurants.length + groups.cuisines.length + groups.occasions.length > 0;

  return (
    <div class="search-screen" role="dialog" aria-modal="true" aria-label="Rechercher">
      <form
        class="search-field"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <button type="button" class="icon-btn" onClick={closeOverlay} aria-label="Retour">
          <Icon name="back" />
        </button>
        <label for="q" class="sr-only">
          Rechercher
        </label>
        <input
          id="q"
          ref={input}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Une ville, une cuisine, une envie…"
          value={value}
          onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)}
        />
        {value && (
          <button type="button" class="icon-btn" onClick={() => setValue('')} aria-label="Effacer">
            <Icon name="close" />
          </button>
        )}
      </form>

      <div class="suggest">
        {understood && understood.chips.length > 0 && (
          <div class="understood-box" aria-live="polite">
            <strong>Compris :</strong>
            <div class="wrap-chips">
              {understood.chips.map((c) => (
                <span key={c.kind + c.label} class="u-chip" style={{ background: 'var(--surface)' }}>
                  {c.label}
                </span>
              ))}
            </div>
            {understood.placeAlternatives.length > 0 && (
              <div style={{ fontSize: '0.8125rem', color: 'var(--ink-2)' }}>
                {understood.place?.name} ({understood.place?.context}).{' '}
                {understood.placeAlternatives.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    style={{ textDecoration: 'underline', fontWeight: 650 }}
                    onClick={() => {
                      const place = placeById(p.id);
                      if (place) {
                        choosePlace(place);
                        closeOverlay();
                      }
                    }}
                  >
                    Plutôt {p.name} ({p.context}) ?
                  </button>
                ))}
              </div>
            )}
            <button type="submit" class="btn btn-primary btn-sm" onClick={() => submit(value)}>
              Voir les résultats
            </button>
          </div>
        )}

        {!value && (
          <>
            {historyOn && recent.length > 0 && (
              <>
                <h3>Récents</h3>
                {recent.map((q) => (
                  <button key={q} type="button" class="suggest-item" onClick={() => submit(q)}>
                    <span class="ico">
                      <Icon name="history" />
                    </span>
                    <span class="grow">{q}</span>
                  </button>
                ))}
                <button type="button" class="suggest-item" style={{ color: 'var(--ink-3)', minHeight: 44 }} onClick={() => setConsent({ history: false })}>
                  <span class="ico" style={{ background: 'none' }}>
                    <Icon name="trash" />
                  </span>
                  <span class="grow">Effacer et ne plus garder l’historique</span>
                </button>
              </>
            )}
            <h3>Envies du moment</h3>
            {IDEAS.map((idea) => (
              <button key={idea.query} type="button" class="suggest-item" onClick={() => submit(idea.query)}>
                <span class="ico">
                  <Icon name={idea.icon} />
                </span>
                <span class="grow">{idea.label}</span>
              </button>
            ))}
          </>
        )}

        {value && groups.places.length > 0 && (
          <>
            <h3>Lieux</h3>
            {groups.places.map((p) => (
              <button
                key={p.id}
                type="button"
                class="suggest-item"
                onClick={() => {
                  const place = placeById(p.id);
                  if (place) choosePlace(place);
                  store.set({ query: '', interpretation: undefined });
                  closeOverlay();
                }}
              >
                <span class="ico">
                  <Icon name="pin" />
                </span>
                <span class="grow">
                  <Highlight text={p.label} q={value} />
                  <span class="small">{p.detail}</span>
                </span>
              </button>
            ))}
          </>
        )}

        {value && groups.restaurants.length > 0 && (
          <>
            <h3>Restaurants</h3>
            {groups.restaurants.map((r) => (
              <button
                key={r.id}
                type="button"
                class="suggest-item"
                onClick={() => {
                  closeOverlay();
                  openRestaurant(r.id, 'search');
                }}
              >
                <span class="ico">
                  <Icon name={cuisine(CATALOG.find((x) => x.id === r.id)?.cuisines[0] ?? '')?.icon ?? 'plate'} />
                </span>
                <span class="grow">
                  <Highlight text={r.label} q={value} />
                  <span class="small">{r.detail}</span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </>
        )}

        {value && groups.cuisines.length > 0 && (
          <>
            <h3>Cuisines et plats</h3>
            {groups.cuisines.map((c) => (
              <button
                key={c.id}
                type="button"
                class="suggest-item"
                onClick={() => {
                  const f = store.get().filters;
                  setFilters({ ...f, cuisines: [...new Set([...f.cuisines, c.id])] }, 'cuisines');
                  closeOverlay();
                }}
              >
                <span class="ico">
                  <Icon name={cuisine(c.id)?.icon ?? 'plate'} />
                </span>
                <span class="grow">
                  <Highlight text={c.label} q={value} />
                </span>
              </button>
            ))}
          </>
        )}

        {value && groups.occasions.length > 0 && (
          <>
            <h3>Envies</h3>
            {groups.occasions.map((o) => (
              <button
                key={o.id}
                type="button"
                class="suggest-item"
                onClick={() => {
                  const f = store.get().filters;
                  setFilters({ ...f, occasions: [...new Set([...f.occasions, o.id])] }, 'occasions');
                  closeOverlay();
                }}
              >
                <span class="ico">
                  <Icon name="sparkle" />
                </span>
                <span class="grow">
                  <Highlight text={o.label} q={value} />
                </span>
              </button>
            ))}
          </>
        )}

        {value && (
          <button type="button" class="suggest-item" onClick={() => submit(value)}>
            <span class="ico">
              <Icon name="search" />
            </span>
            <span class="grow">
              Rechercher « {value} »{!hasSuggestions && <span class="small">Aucune suggestion : on cherche dans les noms et les descriptions.</span>}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
