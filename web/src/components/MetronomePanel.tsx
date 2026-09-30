import type { MetronomeRecord } from '@backing-tracks/shared';
import { useState } from 'react';
import { saveMetronome } from '../api';
import type { MetronomeState } from '../audio/Metronome';
import type { StemPlayer } from '../audio/StemPlayer';
import { useCurrentTime } from '../audio/useStemPlayer';

interface Props {
  songId: string;
  player: StemPlayer | null;
  playing: boolean;
  state: MetronomeState;
  /** Configuração salva no servidor, para saber se há alterações pendentes. */
  saved: MetronomeRecord;
  onSaved: (m: MetronomeRecord) => void;
}

const OFFSET_NUDGE = 0.01;

export function MetronomePanel({ songId, player, playing, state, saved, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<MetronomeState>) => player?.updateMetronome(patch);

  const current: MetronomeRecord = { bpm: state.bpm, offsetSec: state.offsetSec, beatsPerBar: state.beatsPerBar };
  const dirty =
    current.bpm !== saved.bpm || current.offsetSec !== saved.offsetSec || current.beatsPerBar !== saved.beatsPerBar;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveMetronome(songId, current);
      onSaved(current);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`metronome ${state.enabled ? 'on' : ''}`}>
      <header>
        <h2>Metrônomo</h2>
        <label className="switch" title="Atalho: M">
          <input
            type="checkbox"
            checked={state.enabled}
            disabled={!player}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          <span />
        </label>
      </header>

      <BeatLights player={player} playing={playing} beatsPerBar={state.beatsPerBar} enabled={state.enabled} />

      <div className="metro-row">
        <span className="label">BPM</span>
        <div className="stepper">
          <button onClick={() => update({ bpm: state.bpm - 1 })} disabled={!player}>−</button>
          <input
            type="number"
            min={20}
            max={300}
            step={0.5}
            value={state.bpm}
            disabled={!player}
            onChange={(e) => e.target.value && update({ bpm: Number(e.target.value) })}
          />
          <button onClick={() => update({ bpm: state.bpm + 1 })} disabled={!player}>+</button>
        </div>
      </div>

      <div className="metro-row">
        <span className="label">Compasso</span>
        <select
          value={state.beatsPerBar}
          disabled={!player}
          onChange={(e) => update({ beatsPerBar: Number(e.target.value) })}
        >
          {[2, 3, 4, 5, 6, 7, 8, 12].map((n) => (
            <option key={n} value={n}>
              {n}/4
            </option>
          ))}
        </select>
      </div>

      <div className="metro-row">
        <span className="label" title="Momento de uma batida 1 na música">
          Início
        </span>
        <div className="stepper">
          <button onClick={() => update({ offsetSec: state.offsetSec - OFFSET_NUDGE })} disabled={!player} title="-10 ms">
            −
          </button>
          <span className="value">{state.offsetSec.toFixed(2)}s</span>
          <button onClick={() => update({ offsetSec: state.offsetSec + OFFSET_NUDGE })} disabled={!player} title="+10 ms">
            +
          </button>
        </div>
        <button
          className="align"
          onClick={() => player?.alignMetronomeDownbeat()}
          disabled={!player || !playing}
          title="Com a música tocando, clique exatamente numa batida 1 (atalho: B)"
        >
          Alinhar no 1
        </button>
      </div>

      <div className="metro-row">
        <span className="label">Volume</span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={state.volume}
          disabled={!player}
          onChange={(e) => update({ volume: Number(e.target.value) })}
          style={{ '--progress': `${(state.volume / 1.5) * 100}%` } as React.CSSProperties}
          aria-label="Volume do metrônomo"
        />
      </div>

      {(dirty || error) && (
        <div className="metro-save">
          {error ? <span className="error">{error}</span> : <span className="muted">Alterações não salvas</span>}
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      )}
    </div>
  );
}

function BeatLights({
  player,
  playing,
  beatsPerBar,
  enabled,
}: {
  player: StemPlayer | null;
  playing: boolean;
  beatsPerBar: number;
  enabled: boolean;
}) {
  const time = useCurrentTime(player, playing);
  const beat = player && time >= 0 ? player.metronomeBeatAt(time).inBar : -1;
  return (
    <div className="beat-lights" aria-hidden>
      {Array.from({ length: beatsPerBar }, (_, i) => (
        <span key={i} className={[i === 0 && 'one', enabled && playing && i === beat && 'lit'].filter(Boolean).join(' ')} />
      ))}
    </div>
  );
}
