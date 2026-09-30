import { useEffect, useRef } from 'react';
import type { StemPlayer } from '../audio/StemPlayer';
import { useCurrentTime } from '../audio/useStemPlayer';
import { activeLineIndex, type LyricLine } from '../lyrics/parseLrc';

interface Props {
  player: StemPlayer | null;
  playing: boolean;
  lines: LyricLine[] | null;
}

export function LyricsView({ player, playing, lines }: Props) {
  const time = useCurrentTime(player, playing);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = lines ? activeLineIndex(lines, time) : -1;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-idx="${Math.max(active, 0)}"]`);
    if (!el) return;
    // Centraliza a linha ativa dentro do container (sem rolar a página inteira).
    const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top, behavior: 'smooth' });
  }, [active]);

  if (!lines) return <div className="lyrics empty">Sem letra para esta música.</div>;

  return (
    <div className="lyrics" ref={containerRef}>
      <div className="lyrics-pad" />
      {lines.map((line, i) => (
        <p
          key={i}
          data-idx={i}
          className={i === active ? 'active' : i < active ? 'past' : ''}
          onClick={() => player?.seek(line.time)}
        >
          {line.text || '♪'}
        </p>
      ))}
      <div className="lyrics-pad" />
    </div>
  );
}
