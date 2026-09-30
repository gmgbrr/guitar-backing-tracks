import { useEffect, useState, useSyncExternalStore } from 'react';
import { StemPlayer, type PlayerSnapshot } from './StemPlayer';

const EMPTY: PlayerSnapshot = {
  playing: false,
  duration: 0,
  masterVolume: 1,
  stems: [],
  metronome: { enabled: false, volume: 0.7, bpm: 120, offsetSec: 0, beatsPerBar: 4 },
};
const noopSubscribe = () => () => {};

export type LoadState =
  | { status: 'loading'; loaded: number; total: number }
  | { status: 'ready' }
  | { status: 'error'; message: string };

/** Cria um StemPlayer para os stems informados e o descarta ao trocar de música/desmontar. */
export function useStemPlayer(stems: { name: string; url: string }[] | undefined) {
  const [player, setPlayer] = useState<StemPlayer | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'loading', loaded: 0, total: 0 });

  useEffect(() => {
    if (!stems) return;
    const p = new StemPlayer();
    let cancelled = false;
    setLoad({ status: 'loading', loaded: 0, total: stems.length });
    p.load(stems, (loaded, total) => !cancelled && setLoad({ status: 'loading', loaded, total }))
      .then(() => {
        if (cancelled) return;
        setPlayer(p);
        setLoad({ status: 'ready' });
      })
      .catch((err: Error) => !cancelled && setLoad({ status: 'error', message: err.message }));
    return () => {
      cancelled = true;
      setPlayer(null);
      p.dispose();
    };
  }, [stems]);

  const snapshot = useSyncExternalStore(
    player?.subscribe ?? noopSubscribe,
    player?.getSnapshot ?? (() => EMPTY),
  );

  return { player, load, ...snapshot };
}

/** Posição atual atualizada a cada frame enquanto toca. Use apenas em componentes pequenos. */
export function useCurrentTime(player: StemPlayer | null, playing: boolean): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!player) return;
    setTime(player.getTime());
    const unsub = player.subscribe(() => setTime(player.getTime()));
    if (!playing) return unsub;
    let raf = 0;
    const tick = () => {
      setTime(player.getTime());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [player, playing]);
  return time;
}
