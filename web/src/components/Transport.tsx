import type { StemPlayer } from '../audio/StemPlayer';

interface Props {
  player: StemPlayer | null;
  playing: boolean;
  onPrevSong?: () => void;
  onNextSong?: () => void;
}

export const SKIP_SECONDS = 10;

export function Transport({ player, playing, onPrevSong, onNextSong }: Props) {
  const disabled = !player;
  return (
    <div className="transport">
      <button onClick={onPrevSong} disabled={!onPrevSong} title="Música anterior" aria-label="Música anterior">
        ⏮
      </button>
      <button onClick={() => player?.skip(-SKIP_SECONDS)} disabled={disabled} title={`Voltar ${SKIP_SECONDS}s`}>
        ↺ {SKIP_SECONDS}
      </button>
      <button
        className="play"
        onClick={() => player?.toggle()}
        disabled={disabled}
        title={playing ? 'Pausar (espaço)' : 'Tocar (espaço)'}
        aria-label={playing ? 'Pausar' : 'Tocar'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <button onClick={() => player?.skip(SKIP_SECONDS)} disabled={disabled} title={`Avançar ${SKIP_SECONDS}s`}>
        {SKIP_SECONDS} ↻
      </button>
      <button onClick={onNextSong} disabled={!onNextSong} title="Próxima música" aria-label="Próxima música">
        ⏭
      </button>
    </div>
  );
}
