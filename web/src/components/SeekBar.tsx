import { useState } from 'react';
import { formatTime } from '../api';
import type { StemPlayer } from '../audio/StemPlayer';
import { useCurrentTime } from '../audio/useStemPlayer';

interface Props {
  player: StemPlayer | null;
  playing: boolean;
  duration: number;
}

export function SeekBar({ player, playing, duration }: Props) {
  const time = useCurrentTime(player, playing);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const shown = dragValue ?? time;

  const commit = () => {
    if (dragValue !== null) player?.seek(dragValue);
    setDragValue(null);
  };

  return (
    <div className="seekbar">
      <span className="time">{formatTime(shown)}</span>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={shown}
        disabled={!player}
        onChange={(e) => setDragValue(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        style={{ '--progress': `${(shown / (duration || 1)) * 100}%` } as React.CSSProperties}
        aria-label="Posição da música"
      />
      <span className="time">{formatTime(duration)}</span>
    </div>
  );
}
