import { useSyncExternalStore } from 'react';

/** true enquanto a media query CSS for verdadeira (atualiza ao girar/redimensionar a tela). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Mesmo limite usado no CSS para o layout de celular. */
export const COMPACT_QUERY = '(max-width: 800px)';
