// Petit magasin d'état observable, sans dépendance.

import { useEffect, useRef, useState } from 'preact/hooks';

type Listener = () => void;

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Lit une portion de l'état et se met à jour quand elle change (comparaison stricte). */
export function useStore<T extends object, S>(store: Store<T>, select: (s: T) => S): S {
  const [value, setValue] = useState(() => select(store.get()));
  const selectRef = useRef(select);
  selectRef.current = select;
  useEffect(() => {
    const check = () => {
      const next = selectRef.current(store.get());
      setValue((prev) => (Object.is(prev, next) ? prev : next));
    };
    check();
    return store.subscribe(check);
  }, [store]);
  return value;
}

/** Lecture et écriture protégées : le stockage peut être absent ou refusé. */
export const storage = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`yy:${key}`);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown) {
    try {
      localStorage.setItem(`yy:${key}`, JSON.stringify(value));
    } catch {
      // Navigation privée, quota : la démo continue sans mémoire.
    }
  },
  clear() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('yy:'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // Rien à faire.
    }
  },
};
